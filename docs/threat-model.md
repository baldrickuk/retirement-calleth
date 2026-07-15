# Threat Model

Methodology: STRIDE, scoped to the deployed AWS resources in
`RetirementCountdownStack` and the code in `lambda/handler.ts`. This is a
personal, single-recipient notification tool with no public network
surface, so the model is sized accordingly — it is not a treatment of a
multi-tenant or internet-facing service.

## Assets

| Asset | Sensitivity | Notes |
|---|---|---|
| Verified SES sender identity | Medium | Reputation asset — abuse could get the sending domain/address flagged as spam |
| Recipient / sender email addresses | Low (PII) | Personal but not sensitive (financial/health) data |
| Lambda execution role credentials | Medium | Scoped IAM permissions to DynamoDB (one table), Bedrock (one model), SES (`*`, see below) |
| Joke history (DynamoDB) | Low | No sensitive content; regenerable |
| Retirement date | Low | Personal but not sensitive |
| Bedrock/SES usage (cost) | Low | Small per-invocation cost; abuse ceiling is low but non-zero |

## Trust boundaries

```mermaid
flowchart TB
    subgraph AWS["AWS Account (single account/region)"]
        EB[EventBridge Rule]
        L[Lambda: CountdownFunction]
        DDB[(DynamoDB)]
        BR[Bedrock Runtime]
        CW[CloudWatch Alarm]
        SNS[SNS Topic]
        subgraph IAM["IAM principals"]
            Role[Lambda execution role]
            Human[Human operators w/ console access]
        end
    end
    SES[SES — sends outside AWS account boundary]
    Internet((Public internet<br/>recipient mail server))

    EB -->|trusted, in-account| L
    L -->|scoped IAM| DDB
    L -->|scoped IAM| BR
    L -->|broad IAM: resource *| SES
    SES -->|SMTP/internet| Internet
    CW --> SNS --> Internet
    Human -.->|can invoke/modify| L
    Role -.->|assumed by| L
```

Key boundary crossings:
1. **EventBridge → Lambda**: fully inside AWS, IAM-mediated, no external
   input — not attacker-reachable.
2. **Lambda → SES → public internet**: the only place data leaves AWS's
   trust boundary as an email to a real inbox.
3. **Any IAM principal with `lambda:InvokeFunction` in this account →
   Lambda**: the function is invokable by any sufficiently-privileged
   principal in the account, not just the schedule.
4. **Any IAM principal with the Lambda's assumed role → SES**: because the
   SES grant is `resources: ["*"]`, anything that can act as this role can
   send email as the verified sender to *any* address, not just the
   configured recipient.

## Threats by STRIDE category

### Spoofing

- **T1 — Email sent as verified sender to arbitrary recipients.**
  `ses:SendEmail`/`ses:SendRawEmail` are granted on `resources: ["*"]`
  (`lib/retirement-countdown-stack.ts:64-69`). Anything that can assume the
  Lambda's execution role (a compromised dependency executing inside the
  function, or an over-privileged human/automation elsewhere in the
  account with `sts:AssumeRole` on it) can send mail as the verified
  sender to any address — not limited to `RECIPIENT_EMAIL`. Impact: sender
  reputation damage, potential phishing-as-a-trusted-sender.
  **Mitigation**: scope the SES grant to the sender identity ARN
  (`arn:aws:ses:<region>:<account>:identity/<senderEmail>`); this doesn't
  restrict the *recipient*, but SES doesn't support recipient-side ARN
  scoping, so recipient restriction would need an application-level check
  or a sending authorization policy on the identity itself.
- **T2 — Spoofed EventBridge invocation.** Not credible: EventBridge rules
  invoke Lambda via IAM (`lambda:InvokeFunction` granted specifically to
  the rule), and Lambda validates the invoking principal. No mitigation
  needed beyond default IAM behavior.

### Tampering

- **T3 — DynamoDB history tampering.** Any principal with write access to
  `JokeHistoryTable` (currently just the Lambda's role, correctly scoped)
  could alter joke history. Impact is negligible — worst case is a
  repeated joke. No action needed.
- **T4 — Source/dependency tampering (supply chain).** The Lambda is
  bundled by esbuild from `lambda/handler.ts` and its npm dependencies
  (`@aws-sdk/*` packages) at deploy time, with no lockfile integrity check
  or CI build step in this repo. A compromised transitive dependency could
  run arbitrary code with the Lambda's IAM permissions (i.e., could exploit
  T1). **Mitigation**: `package-lock.json` is already committed (good —
  pins versions); consider `npm ci` in a CI pipeline plus periodic
  `npm audit`/Dependabot to catch known-vulnerable versions.
- **T5 — Configuration tampering.** `bin/retirement-countdown.ts` is
  plain committed source with no protected/reviewed deploy path (no CI,
  no required PR review enforced by tooling). Anyone with write access to
  the repo and deploy credentials could redirect `recipientEmail` or swap
  `bedrockModelId`. Acceptable for a single-owner personal repo; would
  need branch protection + required review if the repo gains
  collaborators.

### Repudiation

- **T6 — Limited audit trail for SES sends.** CloudTrail logs the
  `SendEmail` *management*-plane call (who/when), which is sufficient here.
  There's no non-repudiation requirement beyond "did the job run" — the
  CloudWatch alarm plus Lambda logs already cover that. No action needed.

### Information Disclosure

- **T7 — Email addresses and joke content in CloudWatch Logs.** The
  handler doesn't explicitly log addresses or joke text, but any unhandled
  exception could include them in a stack trace written to CloudWatch Logs.
  Log group has no explicit retention/access restriction beyond default
  IAM (`logs:*` scoped to the function's own log group by
  `NodejsFunction`'s default role). Low impact (low-sensitivity PII), but
  worth noting log retention is unset (see Well-Architected review).
- **T8 — Environment variables readable by any principal with
  `lambda:GetFunctionConfiguration`.** `RECIPIENT_EMAIL`/`SENDER_EMAIL` are
  stored as plain (not KMS-encrypted-with-CMK) Lambda environment
  variables. Anyone in the account with that read permission can see them
  via console/CLI. Low sensitivity data, default AWS-managed encryption at
  rest already applies — proportionate as-is.
- **T9 — Real email addresses committed to source control.** If this
  repository is or becomes public, `bin/retirement-countdown.ts` containing
  real addresses would expose them. **Mitigation**: keep placeholder
  values in the tracked file for a public repo; supply real values via
  CDK context (`-c recipientEmail=...`) or a gitignored local override
  file if the repo's visibility changes.

### Denial of Service

- **T10 — Invocation-triggered cost abuse.** No component here is
  internet-facing, so external DoS isn't applicable. The only DoS-adjacent
  risk is an in-account principal with `lambda:InvokeFunction` calling the
  function repeatedly to run up Bedrock/SES usage costs. Low likelihood
  (requires existing IAM access to the account) and low impact (costs are
  fractions of a cent per call). **Mitigation (optional)**: a
  Lambda reserved-concurrency limit of 1 would cap parallel abuse without
  affecting normal (once-daily, non-concurrent) operation; a budget alarm
  (see Well-Architected review) catches cost anomalies regardless of cause.
- **T11 — Legitimate daily run blocked by throttling.** Bedrock on-demand
  throughput or SES sending limits could throttle a run. The
  `FunctionErrorAlarm` catches this after the fact (email alert); there's
  no automatic retry. Acceptable given impact is "missed one joke email."

### Elevation of Privilege

- **T12 — Execution-role scope is mostly tight, one broad grant.** DynamoDB
  and Bedrock grants are correctly scoped to specific resources
  (`grantReadWriteData` on one table; `bedrock:InvokeModel` on one model
  ARN). The SES grant (`resources: ["*"]`, T1) is the one place a
  compromised execution context gains capability beyond what the function
  actually needs (sending to *its configured recipient only* vs. sending
  to *anyone*). This is the single highest-value fix in this threat model.
- **T13 — No resource-based policy restricting who can invoke the
  Lambda beyond the EventBridge rule.** By default, only principals
  explicitly granted `lambda:InvokeFunction` (the EventBridge rule, plus
  whatever IAM policies exist elsewhere in the account) can invoke it —
  this is standard IAM-default-deny behavior, not a stack-specific gap.

## Risk summary

| ID | Threat | Likelihood | Impact | Priority |
|---|---|---|---|---|
| T1/T12 | SES `SendEmail` scoped to `"*"` allows sending to arbitrary recipients if role is misused | Low | Medium (reputation/phishing) | **High — fix first** |
| T4 | Unaudited dependency supply chain, no CI | Low | Medium | Medium |
| T9 | Real email addresses in committed source if repo goes public | Depends on repo visibility | Low | Medium (situational) |
| T7/T8 | Low-sensitivity PII visible via logs/env vars to in-account principals | Low | Low | Low |
| T10/T11 | Cost abuse or throttling of a once-daily job | Low | Low | Low |
| T3/T5/T6/T13 | Standard IAM-default-deny behavior already mitigates these | — | — | No action |

## Recommended actions, in order

1. Scope `ses:SendEmail`/`ses:SendRawEmail` to the sender identity ARN
   instead of `"*"` (closes T1/T12 — see
   [well-architected-review.md](well-architected-review.md) for the exact
   change).
2. If/when the repo becomes public, replace real email addresses in
   `bin/retirement-countdown.ts` with placeholders and move real values to
   CDK context or a gitignored override (closes T9).
3. Optional hardening: reserved concurrency of 1 on the Lambda (T10), CI
   with `npm audit`/Dependabot (T4), explicit CloudWatch log retention
   (T7).
