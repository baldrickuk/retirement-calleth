# Fun HTML countdown email — design

**Date:** 2026-07-15
**Status:** Approved (design), pending implementation plan
**Branch:** `feature/fun-html-email` (based on `fix/bedrock-sonnet-4-6-cross-region-and-ses-sandbox` / PR #4)

## Problem

The daily retirement-countdown email is plain text only
(`Body: { Text: { Data: body } }` in `lambda/handler.ts`). The subject is
`"N days until retirement"` and the body is the raw Bedrock joke with no
structure. There is no visual hierarchy, the countdown number — the single
most interesting fact — is not emphasised, and there is no styling. The email
lands flat and loses the impact the joke is meant to have.

## Goal

Make the email visually striking and fun, with the countdown as the hero,
styling that escalates with the existing mood stages, and the joke presented
as a highlight rather than buried prose — while keeping deliverability and
accessibility intact.

## Decisions (from brainstorming)

- **Format:** rich HTML email, sent as **multipart HTML + plain-text** so rich
  clients get the design and text/accessibility clients still get a clean
  message.
- **Vibe:** bold & playful — big rounded card, mood-staged header colour, chunky
  hero number, emoji accents, tinted joke callout, progress bar.
- **Escalation:** the look changes across the existing 6 mood stages (see
  `toneForDays` in `lambda/handler.ts`) — cool/calm when far off, hot and
  celebratory near the date.
- **Progress bar:** driven by a new optional `countdownStartDate` CDK context
  value; `% = elapsed / total`.

## Non-goals (YAGNI)

- No AI-chosen styling (Bedrock still writes only the joke text; visuals are
  deterministic and testable).
- No images, remote assets, or attachments (keeps deliverability clean and
  rendering deterministic for tests).
- No new infrastructure beyond one additional Lambda environment variable.
- No change to schedule, DynamoDB history, Bedrock model, or alarms.

## Design

### Email anatomy (bold & playful, HTML)

Bulletproof, **table-based** HTML with **inline styles** only (no flexbox/grid;
those are unreliable across email clients). Progressive enhancement where safe
(CSS gradient layered over a solid background-colour fallback).

1. **Header band** — solid stage `accent` colour with an optional gradient
   overlay. Colour shifts by stage (cool blue → teal → amber → hot orange →
   red/confetti → celebratory gold).
2. **Hero countdown** — very large number + unit + stage emoji, e.g.
   `621 🌴 days to go`. On the day: `TODAY'S THE DAY 🎉`.
3. **Joke callout** — the Bedrock joke in a tinted box with an accent-coloured
   left border.
4. **Progress bar** — table-based fill (`% of the way there`) using
   `countdownStartDate → retirementDate`, clamped to 0–100%.
5. **Footer** — subtle "— your retirement countdown bot".
6. **Subject line** — escalates with the stage: emoji + number; ALL-CAPS in the
   final week (`n <= 7`). Example far off: `🗓️ 621 days until retirement`;
   final week: `🔥 3 DAYS TO GO!!!`.

### Stage model (single source of truth)

Introduce `stageForDays(n)` returning an object:

```
{ tone: string, emoji: string, accent: string, gradient: string,
  label: string, subjectPrefix: string, allCaps: boolean }
```

Thresholds match the current `toneForDays` exactly:

| Days remaining | Stage      | Feel / colour            | Emoji |
|----------------|------------|--------------------------|-------|
| > 365          | calm       | cool blue                | 🗓️    |
| > 100          | cheeky     | teal                     | 😏    |
| > 30           | unhinged   | amber                    | 🤪    |
| > 7            | chaotic    | hot orange (caps subj.)  | 🔥    |
| > 0            | peak       | red / pink + confetti    | 🎉    |
| <= 0           | the day    | celebratory gold         | 🥳    |

`toneForDays` is refactored to derive its string from `stageForDays(n).tone`,
so the prompt tone and the visuals can never drift apart.

### Pure, testable functions

Extract AWS-free functions so rendering is unit-testable without mocking:

- `stageForDays(n: number): Stage`
- `progressPct(startISO: string, retirementISO: string, today: Date): number`
  — clamped to `[0, 100]`; returns `0` if `start >= retirement` or start is
  in the future.
- `renderEmail(input: { days, joke, stage, pct }): { subject, html, text }`

`sendEmail` becomes a thin wrapper that calls `renderEmail` and sends
`Body: { Html: { Data: html }, Text: { Data: text } }` via SES.

### Configuration

- New **optional** CDK context `countdownStartDate` (ISO `YYYY-MM-DD`).
  - `bin/retirement-countdown.ts`: read it; if absent, default to synth-time
    today (`new Date().toISOString().slice(0,10)`).
  - `lib/retirement-countdown-stack.ts`: pass as `COUNTDOWN_START_DATE` env var.
  - `cdk.context.json`: set explicitly to `2026-07-15` for a stable bar (a
    synth-time default would move if re-synthesised on a later date).

### Data flow (unchanged except email build)

EventBridge → Lambda → (DynamoDB history read) → Bedrock joke →
`stageForDays` + `progressPct` + `renderEmail` → SES multipart send →
DynamoDB history write.

### Error handling

- Rendering is pure and total (no throws for normal inputs); a malformed
  `COUNTDOWN_START_DATE` yields `pct = 0` rather than throwing, so the email
  still sends.
- SES/Bedrock/DynamoDB failures propagate as today (surface to the
  CloudWatch error alarm). No behavioural change there.

## Testing (TDD)

Add unit tests (Jest — the repo already anticipates it via `.gitignore`'s
`!jest.config.js`) for the pure functions:

- `stageForDays` boundaries: 366 vs 365, 101 vs 100, 31 vs 30, 8 vs 7, 1 vs 0,
  0 and negative.
- `progressPct`: 0%, 100%, midpoint, clamping when today is before start or
  after retirement, and malformed start date → 0.
- `renderEmail`: snapshot of HTML + text for a representative stage; assert the
  hero number, joke, emoji, and progress label all appear, and that the text
  fallback is non-empty and joke-bearing.

No AWS mocking required; the SES/Bedrock/DynamoDB clients are untouched by
these tests.

## Rollout

- Implement + test behind the branch; `cdk synth` clean.
- Deploy to `lza-management` (eu-west-2) and verify with a live `lambda invoke`,
  confirming the HTML renders and the email is delivered (as done for PR #4).
- Commit, push, open a PR.
