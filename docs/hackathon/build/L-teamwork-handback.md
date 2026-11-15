# L: teamwork hand-back (waiting, hand-off room, one approval per step, instructions)

Date 2026-11-15. Nothing committed or pushed. `npm run typecheck` passes; `npx vitest run src/office` passes (24 files, 376 tests).

## What changed and where

### 1. Waiting for a teammate
- `src/office/runtime/officeTools.ts`: new tool `wait_for_colleague`, shape `{ name: string, reason?: string }`.
  - Description: "Call this when you cannot continue until a teammate replies or sends you something. Then stop: the office wakes you when their message arrives."
  - Tool results: `Noted. Stop now: the office will wake you when <First>'s message arrives.` Unknown name: `No teammate called <X>. Valid names: <A, B>.` (or `You have no teammates yet.`). Teammates switched off: `Messaging teammates is switched off for you.`
- `src/office/runtime/types.ts`: `RuntimeHost.waitForColleague(name, reason?)`. `testHost.ts` (a test helper in the runtime folder) got the fake.
- `src/office/employees/supervisor.ts`:
  - `waitForColleague(name)` stores `waiting {name, timer}`, sets `flags.waited`, adds an activity step "Waiting for <First>", and `compute()` now shows `stateDetail` = `Waiting for <First>` (state stays `working`).
  - `turnEndedInner`: a turn that used `wait_for_colleague` is neither nudged nor failed (`flags.waited` joins asked/finished/stuck).
  - Waking: `deliver()` clears the flag for any `manager` or `colleague` item. `turnStarted()` also clears it when a new turn begins (covers a message that was already queued when the tool was called).
  - Timeout: `WAIT_TIMEOUT_MS` = 4 min (public field `waitTimeoutMs` so tests can shorten it). It clears the flag and delivers the office note once: "<First> has not replied yet. Carry on with anything you can do without them, message them again, or ask your manager." After that the normal nudge rules apply.
  - Timer handling: pause stops the clock and keeps the flag, resume restarts it; task close, runtime restart (`disposeRuntime`), remove and dispose clear it.
  - Not asked for but needed: the 4-minute stall watchdog (`watchdogTick`) now skips an employee who is waiting. Without that it would interrupt her and fail the task on the second tick.
- `src/office/runtime/activityMapper.ts` (not mine) needs nothing: it maps unknown office tools to no step, and the supervisor records its own "Waiting for X" step.

### 2. Hand-off room
- `src/office/employees/office.ts`: `PAIR_LIMIT = 8` (was 3) in `colleagueGuard`; the 20-per-minute cap is untouched.
- Message length: nothing on the way clips a teammate message. Checked: the tool schema (`z.string()`), `supervisor.messageColleague`, `receiveColleague`, the store (peer JSON in `steps`), `formatItem` in `runtime/prompt.ts` (only strips `<message`/`<office` openers) and `claudeRuntime.ts` (no slice on item text). The manager message route allows 20,000. The only thing I added is a cap in `officeTools.ts`: `MAX_COLLEAGUE_TEXT = 12000`; above that the tool returns an error: "Too long: N characters, the limit is 12000. Save the long content as a file on your computer and send a short message that says where it is, or split it into parts." Seen live: a 244-character message went through unchanged; 8,000 characters is covered by a unit test only.

### 3. One approval for one step (I-20)
- `supervisor.decideApproval`: an approved `big_step` approval (the one `request_approval` raises) is remembered with title, detail, time and task id (last 20, cleared when the task closes). `grantedApprovals()` returns those for the open task.
- `gate.ts`: `GateHost.grantedApprovals?()` (optional, `RuntimeHost` has it too; the supervisor is both). New step 6b in `decide`: for a risky shell command, allow without asking when every `RISKY_SHELL` pattern the command matches also matches the lower-cased title or detail of a grant not older than 10 minutes (`APPROVAL_COVER_MS`). Applies at "asks before big steps" and "asks first". "Every pattern" means `git push && rm -rf x` is not covered by a push approval.
- `toolGroups.ts`: new `riskyShellPatterns(command)` (all matching patterns). `types.ts`: `GrantedApproval`.
- No change to `claudeRuntime.ts` was needed: it passes the supervisor to `PermissionGate`.
- Limit worth knowing: a push approval whose title and detail do not contain "git push" (for example "Publish the branch" / "Share my work") does not cover the command; the gate asks again.

### 4. Instructions
`systemPromptTemplate.ts` and section 5 of `docs/hackathon/spec/employee-runtime.md` changed identically (prompt test passes):
- Plan: the sentence "Your manager watches it tick over, and a plan left half open..." became "Tick each step off as you finish it, before you start the next one, because your manager watches the plan live; a plan left half open looks as if the work is unfinished." (The plan tool is `TodoWrite`; the template already said to rewrite the list with each step ticked.)
- Teammates, before "Do not chat.": "When you cannot continue until a teammate replies or sends you something, call wait_for_colleague with their name and stop: the office wakes you when their message arrives. Waiting for a teammate is not a reason to call report_stuck or to ask your manager."
- Spec section 4.6 now documents the tool, the 12,000 limit and I-20, and says the pair limit is 8.

### Tests added or changed
- `supervisor.test.ts`: "waiting for a teammate" (suppresses nudge and failure; colleague message wakes and clears; timeout note exactly once then normal rules; unknown name errors; pause stops and resume restarts the clock), supervisor-side grant memory (approved big_step remembered, denied and tool asks not, cleared when the task closes = different task), colleague pair limit now 8.
- `gate.test.ts`: covered, covered at asks-first, not covered (delete, push-and-delete, publish, nothing approved), expired; `wait_for_colleague` in the office-tools allow list.
- `toolGroups.test.ts`: `riskyShellPatterns`. New `officeTools.test.ts`: tool description and pass-through; 8,000 and 12,000 characters pass, 12,001 errors.

## What I saw on real desktops
Own office on 4337, real desktops, claude-haiku-5-5, calls off, Databricks off, data folder in the scratchpad. Free memory 11.8 and 10.9 GB at the two hires; never more than two desktops alive. Both people removed (204 each) and the office stopped afterwards.

Run A (Priya researches three shop-builder home pages and writes copy, then messages Maya; Maya builds a landing page and must wait for the hero text):
- +18 s Maya ready, +30 s Priya ready, both tasks sent.
- Maya `working | Waiting for Priya` from +42 s to +66 s (24 s; Haiku Priya was fast). Her turn ended while waiting: no nudge, no stuck. Priya's message (244 chars) arrived at +66 s, Maya went back to `working` and finished at +84 s with the headline in the page. Priya done at +69 s.

Run B (to test a long wait and the timeout; Priya paused by me so she could not answer):
- Maya `Waiting for Priya` from +6 s. At +246 s (4 minutes) the office note arrived; Maya messaged Priya again and went back to `Waiting for Priya` (+249 s). Priya resumed at +330 s, replied at +336 s, Maya woke immediately, finished at +342 s (task done, state idle +345 s). Never stuck, never failed.
- That is the whole pass criterion, including the timeout path. Note: Maya's first closing summary named the wrong path and she corrected it in a second message; that is model behaviour, not related to waiting.

Run C (I-20): after seeding the shop with `seedMaya`, Maya fixed the bug, committed on `fix/checkout-discount`, called `request_approval` ("Publish fix/checkout-discount branch", detail "In ~/work/shop, run: git push -u origin fix/checkout-discount..."). I approved that one card through `POST /api/approvals/:id`. No second card appeared, the push ran, the task was done within 8 s of approving, and the bare remote lists `fix/checkout-discount`. This matches the old repro exactly (same command family) and shows the old double ask is gone.

## Could not verify
- A teammate message of about 8,000 characters through a real model (only unit-tested; the live message was 244 characters).
- Sonnet behaviour (all runs on Haiku): Sonnet may call `wait_for_colleague` less or more eagerly; the prompt sentence is the only lever.
- The renderer showing "Waiting for Priya" in a card (state detail is 40 characters; "Waiting for Priya" fits). Not looked at.
- Pause while waiting is unit-tested only.
- The first live Run A did not exercise the timeout; Run B did.

## Notes for the orchestrator
- `claudeRuntime.ts` and `activityMapper.ts` need no change for this. If the activity feed should show a "Waiting for Priya" bubble differently, that is renderer work; the step sentence is `Waiting for <First>`.
- The wait flag also clears on any new turn, so a manager message or an office notice that wakes her ends the "Waiting" label even if she then does not call the tool again.
- Scripts used for the live runs live in the scratchpad only (not in `scripts/demo`).

## Spend
About $0.04 by the office's own team totals (5 tasks, costUsd 0.037; the report can lag), well under the $1.50 limit. No Sonnet run.
