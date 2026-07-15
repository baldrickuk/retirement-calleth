# Fun HTML Countdown Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text daily retirement email with a bold, playful, mood-staged HTML email (hero countdown, joke callout, progress bar), sent multipart HTML + text.

**Architecture:** Pure, AWS-free render functions live in a new `lambda/email.ts` module (`stageForDays`, `progressPct`, `renderEmail`) so they are unit-testable without mocking. `lambda/handler.ts` imports them, derives its Bedrock prompt tone from the same stage model (one source of truth), and sends `Body: { Html, Text }`. A new optional `countdownStartDate` CDK context feeds the progress bar via a `COUNTDOWN_START_DATE` env var.

**Tech Stack:** TypeScript (strict, ES2020, CommonJS), AWS CDK 2.150, `@aws-sdk/client-ses`, esbuild-bundled Lambda (Node 20), Jest + ts-jest for tests.

## Global Constraints

- TypeScript strict mode is on (`strict: true`, `noImplicitAny`, `strictNullChecks`, `noImplicitReturns`). All new code must type-check under `tsc`.
- HTML email must be **table-based with inline styles only** — no flexbox, grid, `<style>` blocks, external CSS, images, or remote assets.
- Email is sent **multipart**: both `Body.Html` and `Body.Text` populated.
- Stage thresholds must exactly match the existing `toneForDays`: `>365`, `>100`, `>30`, `>7`, `>0`, else.
- Bedrock tone strings must be preserved **verbatim** (copied into the stage model) so joke generation behaviour does not change.
- Bedrock still generates **only the joke text** — no AI-chosen styling.
- Footer copy is exactly: `— your retirement countdown bot`.
- `countdownStartDate` is optional CDK context; `bin/` defaults it to synth-time today (`new Date().toISOString().slice(0,10)`).

---

### Task 1: Jest tooling + `stageForDays`

**Files:**
- Modify: `package.json` (add devDeps + `test` script)
- Create: `jest.config.js`
- Create: `lambda/email.ts`
- Test: `lambda/email.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type StageKey = "calm" | "cheeky" | "unhinged" | "chaotic" | "peak" | "theday"`
  - `interface Stage { key: StageKey; tone: string; emoji: string; accent: string; gradient: string; label: string; subjectPrefix: string; allCaps: boolean; }`
  - `function stageForDays(n: number): Stage`

- [ ] **Step 1: Add Jest dev-dependencies and test script**

Edit `package.json` — add to `devDependencies`:
```json
"@types/jest": "^29.5.12",
"jest": "^29.7.0",
"ts-jest": "^29.1.5"
```
Add to `scripts`:
```json
"test": "jest"
```
Then run:
```bash
npm install
```
Expected: installs cleanly, `node_modules/.bin/jest` exists.

- [ ] **Step 2: Create `jest.config.js`**

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/lambda"],
  testMatch: ["**/*.test.ts"],
};
```

- [ ] **Step 3: Write the failing test** (`lambda/email.test.ts`)

```ts
import { stageForDays } from "./email";

describe("stageForDays", () => {
  it("returns calm above 365 days", () => {
    expect(stageForDays(366).key).toBe("calm");
  });
  it("boundary 365 is cheeky", () => {
    expect(stageForDays(365).key).toBe("cheeky");
  });
  it("boundary 100 is unhinged", () => {
    expect(stageForDays(100).key).toBe("unhinged");
  });
  it("boundary 30 is chaotic", () => {
    expect(stageForDays(30).key).toBe("chaotic");
  });
  it("boundary 7 is peak", () => {
    expect(stageForDays(7).key).toBe("peak");
  });
  it("1 day is peak", () => {
    expect(stageForDays(1).key).toBe("peak");
  });
  it("0 and negative are theday", () => {
    expect(stageForDays(0).key).toBe("theday");
    expect(stageForDays(-3).key).toBe("theday");
  });
  it("preserves the exact calm tone string", () => {
    expect(stageForDays(400).tone).toBe(
      "dry, understated, barely-amused corporate tone. A single restrained joke at most."
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './email'` (or similar).

- [ ] **Step 5: Create `lambda/email.ts` with the stage model**

```ts
export type StageKey =
  | "calm"
  | "cheeky"
  | "unhinged"
  | "chaotic"
  | "peak"
  | "theday";

export interface Stage {
  key: StageKey;
  tone: string;
  emoji: string;
  accent: string;
  gradient: string;
  label: string;
  subjectPrefix: string;
  allCaps: boolean;
}

const STAGES: Record<StageKey, Stage> = {
  calm: {
    key: "calm",
    tone: "dry, understated, barely-amused corporate tone. A single restrained joke at most.",
    emoji: "🗓️",
    accent: "#2563eb",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    label: "days to go",
    subjectPrefix: "🗓️",
    allCaps: false,
  },
  cheeky: {
    key: "cheeky",
    tone: "noticeably cheekier, gentle countdown humor, a bit of a smirk.",
    emoji: "😏",
    accent: "#0d9488",
    gradient: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
    label: "days to go",
    subjectPrefix: "😏",
    allCaps: false,
  },
  unhinged: {
    key: "unhinged",
    tone: "unhinged office-countdown energy, playful exaggeration, mock-desperate.",
    emoji: "🤪",
    accent: "#d97706",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    label: "days to go",
    subjectPrefix: "🤪",
    allCaps: false,
  },
  chaotic: {
    key: "chaotic",
    tone: "chaotic, escalating absurdity, all-caps and exclamation marks welcome.",
    emoji: "🔥",
    accent: "#ea580c",
    gradient: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
    label: "DAYS TO GO",
    subjectPrefix: "🔥",
    allCaps: true,
  },
  peak: {
    key: "peak",
    tone: "peak celebratory chaos, over-the-top excitement, confetti-emoji energy.",
    emoji: "🎉",
    accent: "#db2777",
    gradient: "linear-gradient(135deg, #ec4899 0%, #db2777 100%)",
    label: "DAYS TO GO",
    subjectPrefix: "🎉",
    allCaps: true,
  },
  theday: {
    key: "theday",
    tone: "today is the day — triumphant, warm, a little emotional, congratulatory.",
    emoji: "🥳",
    accent: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
    label: "",
    subjectPrefix: "🥳",
    allCaps: true,
  },
};

export function stageForDays(n: number): Stage {
  if (n > 365) return STAGES.calm;
  if (n > 100) return STAGES.cheeky;
  if (n > 30) return STAGES.unhinged;
  if (n > 7) return STAGES.chaotic;
  if (n > 0) return STAGES.peak;
  return STAGES.theday;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 8 passing tests in `email.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json jest.config.js lambda/email.ts lambda/email.test.ts
git commit -m "feat: add Jest and stageForDays stage model

Co-Authored-By: claude[bot] <claude[bot]@users.noreply.github.com>"
```

---

### Task 2: `progressPct`

**Files:**
- Modify: `lambda/email.ts`
- Test: `lambda/email.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `function progressPct(startISO: string, retirementISO: string, today: Date): number` — integer 0–100.

- [ ] **Step 1: Write the failing test** (append to `lambda/email.test.ts`)

Update the existing top-of-file import so it reads:
```ts
import { stageForDays, progressPct } from "./email";
```
Then append this block (do **not** add a second `import`):
```ts
describe("progressPct", () => {
  it("is 0% at the start date", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2026-01-01T12:00:00Z"))).toBe(0);
  });
  it("is 100% at the retirement date", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2028-01-01T00:00:00Z"))).toBe(100);
  });
  it("is ~50% at the midpoint", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2027-01-01T00:00:00Z"))).toBe(50);
  });
  it("clamps to 0 when today is before the start", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2025-06-01T00:00:00Z"))).toBe(0);
  });
  it("clamps to 100 when today is past retirement", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2030-01-01T00:00:00Z"))).toBe(100);
  });
  it("returns 0 for a malformed start date", () => {
    expect(progressPct("not-a-date", "2028-01-01", new Date("2027-01-01T00:00:00Z"))).toBe(0);
  });
  it("returns 0 when start is not before retirement", () => {
    expect(progressPct("2028-01-01", "2026-01-01", new Date("2027-01-01T00:00:00Z"))).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `progressPct is not a function` / not exported.

- [ ] **Step 3: Implement `progressPct`** (append to `lambda/email.ts`)

```ts
export function progressPct(
  startISO: string,
  retirementISO: string,
  today: Date
): number {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${retirementISO}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const pct = ((now - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all `progressPct` tests green.

- [ ] **Step 5: Commit**

```bash
git add lambda/email.ts lambda/email.test.ts
git commit -m "feat: add progressPct for the countdown progress bar

Co-Authored-By: claude[bot] <claude[bot]@users.noreply.github.com>"
```

---

### Task 3: `renderEmail`

**Files:**
- Modify: `lambda/email.ts`
- Test: `lambda/email.test.ts`

**Interfaces:**
- Consumes: `Stage`, `stageForDays` (Task 1).
- Produces:
  - `interface RenderInput { days: number; joke: string; stage: Stage; pct: number; }`
  - `interface RenderedEmail { subject: string; html: string; text: string; }`
  - `function renderEmail(input: RenderInput): RenderedEmail`

- [ ] **Step 1: Write the failing test** (append to `lambda/email.test.ts`)

Update the existing top-of-file import so it reads:
```ts
import { stageForDays, progressPct, renderEmail } from "./email";
```
Then append this block (do **not** add a second `import`):
```ts
describe("renderEmail", () => {
  it("far-off email: hero number, joke, progress, plain subject", () => {
    const stage = stageForDays(621);
    const out = renderEmail({ days: 621, joke: "Only 621 sleeps left.", stage, pct: 43 });
    expect(out.subject).toBe("🗓️ 621 days to go");
    expect(out.html).toContain("621");
    expect(out.html).toContain("Only 621 sleeps left.");
    expect(out.html).toContain("43% of the way there");
    expect(out.html).toContain(stage.accent);
    expect(out.text).toContain("621 days until retirement");
    expect(out.text).toContain("Only 621 sleeps left.");
    expect(out.text).toContain("— your retirement countdown bot");
  });

  it("final-week email: ALL-CAPS subject with bangs", () => {
    const stage = stageForDays(3);
    const out = renderEmail({ days: 3, joke: "Three. More. Days.", stage, pct: 98 });
    expect(out.subject).toBe("🎉 3 DAYS TO GO!!!");
  });

  it("the day: celebratory subject and heading", () => {
    const stage = stageForDays(0);
    const out = renderEmail({ days: 0, joke: "Go!", stage, pct: 100 });
    expect(out.subject).toBe("🥳 TODAY'S THE DAY!");
    expect(out.html).toContain("TODAY'S THE DAY");
    expect(out.text).toContain("TODAY'S THE DAY");
  });

  it("escapes HTML in the joke", () => {
    const stage = stageForDays(200);
    const out = renderEmail({ days: 200, joke: "<script>alert(1)</script>", stage, pct: 10 });
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("uses singular unit for one day", () => {
    const stage = stageForDays(1);
    const out = renderEmail({ days: 1, joke: "!", stage, pct: 99 });
    expect(out.subject).toBe("🎉 1 DAY TO GO!!!");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `renderEmail is not a function`.

- [ ] **Step 3: Implement `renderEmail`** (append to `lambda/email.ts`)

```ts
export interface RenderInput {
  days: number;
  joke: string;
  stage: Stage;
  pct: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmail({ days, joke, stage, pct }: RenderInput): RenderedEmail {
  const unit = days === 1 ? "day" : "days";
  const heroNumber = days > 0 ? String(days) : "0";

  let subject: string;
  if (stage.key === "theday") {
    subject = `${stage.subjectPrefix} TODAY'S THE DAY!`;
  } else {
    const core = `${days} ${unit} to go`;
    subject = stage.allCaps
      ? `${stage.subjectPrefix} ${core.toUpperCase()}!!!`
      : `${stage.subjectPrefix} ${core}`;
  }

  const heading =
    stage.key === "theday"
      ? `TODAY'S THE DAY ${stage.emoji}`
      : `${heroNumber} ${stage.emoji}`;
  const subheading =
    stage.key === "theday" ? "Congratulations — you made it." : stage.label;

  const safeJoke = escapeHtml(joke);

  const text = [
    stage.key === "theday"
      ? `TODAY'S THE DAY! ${stage.emoji}`
      : `${days} ${unit} until retirement`,
    "",
    `"${joke}"`,
    "",
    `${pct}% of the way there`,
    "",
    "— your retirement countdown bot",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.12);">
        <tr>
          <td align="center" style="background:${stage.accent};background-image:${stage.gradient};padding:40px 24px;">
            <div style="font-size:64px;line-height:1;font-weight:800;color:#ffffff;">${heading}</div>
            <div style="font-size:16px;color:#ffffff;opacity:0.9;margin-top:8px;letter-spacing:1px;text-transform:uppercase;">${subheading}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px 28px;">
            <div style="border-left:4px solid ${stage.accent};background:#f8fafc;border-radius:8px;padding:16px 18px;font-size:18px;line-height:1.5;color:#0f172a;">${safeJoke}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 28px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e2e8f0;border-radius:999px;">
              <tr><td style="padding:0;">
                <table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0">
                  <tr><td style="background:${stage.accent};height:12px;border-radius:999px;font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
              </td></tr>
            </table>
            <div style="font-size:13px;color:#64748b;margin-top:8px;text-align:right;">${pct}% of the way there</div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 28px 28px 28px;font-size:12px;color:#94a3b8;">— your retirement countdown bot</td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all `renderEmail` tests green; whole suite green.

- [ ] **Step 5: Commit**

```bash
git add lambda/email.ts lambda/email.test.ts
git commit -m "feat: add renderEmail (HTML + text) for the countdown email

Co-Authored-By: claude[bot] <claude[bot]@users.noreply.github.com>"
```

---

### Task 4: Wire `handler.ts` to the new email module

**Files:**
- Modify: `lambda/handler.ts`

**Interfaces:**
- Consumes: `stageForDays`, `progressPct`, `renderEmail` (Tasks 1–3).
- Produces: no new exports; `handler` behaviour unchanged except the email it sends.

- [ ] **Step 1: Add the import** (top of `lambda/handler.ts`, after existing imports)

```ts
import { stageForDays, progressPct, renderEmail } from "./email";
```

- [ ] **Step 2: Add the new env var** (with the other `process.env` consts, after `TABLE_NAME`)

```ts
const COUNTDOWN_START_DATE = process.env.COUNTDOWN_START_DATE as string;
```

- [ ] **Step 3: Remove `toneForDays` and use the stage model in `generateJoke`**

Delete the entire `toneForDays` function (the `function toneForDays(n: number): string { ... }` block).

In `generateJoke`, replace:
```ts
  const tone = toneForDays(days);
```
with:
```ts
  const tone = stageForDays(days).tone;
```

- [ ] **Step 4: Replace `sendEmail` with the multipart HTML + text version**

Replace the whole `sendEmail` function with:
```ts
async function sendEmail(days: number, joke: string): Promise<void> {
  const stage = stageForDays(days);
  const pct = progressPct(COUNTDOWN_START_DATE, RETIREMENT_DATE, new Date());
  const { subject, html, text } = renderEmail({ days, joke, stage, pct });

  await ses.send(
    new SendEmailCommand({
      Source: SENDER_EMAIL,
      Destination: { ToAddresses: [RECIPIENT_EMAIL] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: html }, Text: { Data: text } },
      },
    })
  );
}
```

(The `handler` function already calls `sendEmail(days, joke)`, so it needs no change.)

- [ ] **Step 5: Type-check and run tests**

Run: `npm run build && npm test`
Expected: `tsc` succeeds with no errors; Jest suite still green (handler is not unit-tested, but it must compile).

- [ ] **Step 6: Commit**

```bash
git add lambda/handler.ts
git commit -m "feat: send mood-staged HTML + text countdown email

Co-Authored-By: claude[bot] <claude[bot]@users.noreply.github.com>"
```

---

### Task 5: CDK wiring for `countdownStartDate`

**Files:**
- Modify: `bin/retirement-countdown.ts`
- Modify: `lib/retirement-countdown-stack.ts`
- Modify: `cdk.context.json` (gitignored — not committed)

**Interfaces:**
- Consumes: nothing from earlier tasks (config plumbing).
- Produces: `COUNTDOWN_START_DATE` Lambda env var consumed by Task 4's handler.

- [ ] **Step 1: Read the optional context in `bin/retirement-countdown.ts`**

After the `requireContext(...)` lines inside the `new RetirementCountdownStack(...)` call, add a `countdownStartDate` prop. Just before the `new RetirementCountdownStack(...)` call, add:
```ts
const countdownStartDate =
  app.node.tryGetContext("countdownStartDate") ??
  new Date().toISOString().slice(0, 10);
```
Then add this line to the stack props (alongside `retirementDate`, etc.):
```ts
  countdownStartDate,
```

- [ ] **Step 2: Add the prop to the stack interface** (`lib/retirement-countdown-stack.ts`)

In `RetirementCountdownStackProps`, after `bedrockModelId: string;`:
```ts
  /** ISO date (YYYY-MM-DD) the countdown started, for the progress bar */
  countdownStartDate: string;
```

- [ ] **Step 3: Pass it to the Lambda environment** (`lib/retirement-countdown-stack.ts`)

In the `environment` map of the countdown function, after `BEDROCK_MODEL_ID: props.bedrockModelId,`:
```ts
        COUNTDOWN_START_DATE: props.countdownStartDate,
```

- [ ] **Step 4: Set the value in `cdk.context.json`** (gitignored)

Add the key so the deployed bar is stable:
```json
  "countdownStartDate": "2026-07-15"
```
(Resulting file has `retirementDate`, `recipientEmail`, `senderEmail`, `countdownStartDate`.)

- [ ] **Step 5: Synthesize to verify wiring**

Run: `AWS_PROFILE=lza-management npx cdk synth --quiet`
Expected: succeeds. Optionally confirm the env var:
```bash
AWS_PROFILE=lza-management npx cdk synth 2>/dev/null | grep COUNTDOWN_START_DATE
```
Expected: shows `COUNTDOWN_START_DATE: 2026-07-15`.

- [ ] **Step 6: Commit** (context file stays gitignored, so only source is committed)

```bash
git add bin/retirement-countdown.ts lib/retirement-countdown-stack.ts
git commit -m "feat: add countdownStartDate context and env var

Co-Authored-By: claude[bot] <claude[bot]@users.noreply.github.com>"
```

---

### Task 6: Deploy and verify end-to-end

**Files:** none (deploy + verification only).

**Interfaces:** none.

- [ ] **Step 1: Deploy**

Run: `AWS_PROFILE=lza-management npx cdk deploy --require-approval never`
Expected: `RetirementCountdownStack` `UPDATE_COMPLETE`, `✅`.

- [ ] **Step 2: Invoke the function live**

Run:
```bash
AWS_PROFILE=lza-management aws lambda invoke --region eu-west-2 \
  --function-name RetirementCountdownStack-CountdownFunctionE0B06B7F-k7HEBb40cJ6q \
  --cli-binary-format raw-in-base64-out /tmp/out.json; cat /tmp/out.json
```
Expected: `StatusCode: 200`, **no** `FunctionError`, body `null`.

- [ ] **Step 3: Confirm no errors in logs**

Run:
```bash
AWS_PROFILE=lza-management aws logs tail \
  /aws/lambda/RetirementCountdownStack-CountdownFunctionE0B06B7F-k7HEBb40cJ6q \
  --region eu-west-2 --since 3m --format short
```
Expected: clean `START`/`END`/`REPORT`, no error lines. Confirm the HTML email arrived in the `guy@sidford.org` inbox and renders (hero number, coloured header, joke callout, progress bar).

- [ ] **Step 4: Push and open a PR**

```bash
git push -u origin feature/fun-html-email
gh pr create --base main --head feature/fun-html-email \
  --title "Fun, mood-staged HTML countdown email" \
  --body "Replaces the plain-text daily email with a bold, playful multipart HTML + text email: mood-staged header, hero countdown number, tinted joke callout, and a progress bar (new optional countdownStartDate context). Pure render functions extracted to lambda/email.ts with Jest unit tests. Verified via cdk synth, unit tests, deploy to lza-management, and a live lambda invoke.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Expected: PR URL printed.

---

## Notes for the implementer

- The function name `RetirementCountdownStack-CountdownFunctionE0B06B7F-k7HEBb40cJ6q` is the currently deployed name; if a redeploy changes it, get the real one from `AWS_PROFILE=lza-management aws cloudformation describe-stacks --region eu-west-2 --stack-name RetirementCountdownStack --query "Stacks[0].Outputs"`.
- This branch (`feature/fun-html-email`) is stacked on `fix/bedrock-sonnet-4-6-cross-region-and-ses-sandbox` (PR #4). If PR #4 merges first, rebase onto `main` before opening this PR so the diff is clean.
- `lambda/email.test.ts` is never bundled into the Lambda — esbuild only bundles what `handler.ts` imports.
