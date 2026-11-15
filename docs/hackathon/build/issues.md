# Issues found by the integration tests (append only)

Format: `I-<n>`, scenario, expected, observed, evidence, best reading of the cause, owning file. Found by W10 with `scripts/e2e/real.ts` (Haiku 5.5, real Cua desktops) unless noted. Severity: high = breaks a promise in the demo, medium = visible and wrong, low = cosmetic or test-plan wording. Evidence paths are under `shots/e2e/` (gitignored; each scenario folder holds the evidence of the LAST run of that scenario; the full-run log is `shots/e2e/run-full.log`).

## I-1 · S8 · Stuck is reported only about half the time (medium)

- Expected: asked to log in to a site that does not exist, Jonas calls `report_stuck` (state `stuck`, a bubble with what he tried, a notify of kind `stuck`).
- Observed over 7 runs of the same prompt: `stuck` 4 times; `needs_you` (he called `ask_user` with "What is the correct portal URL, and do I need the VPN?") 2 times; a plain `done` with the explanation, no stuck, 1 time. In the question case the same sentence was posted twice as a text bubble and then as a `question` bubble. Haiku reasons correctly that `.invalid` never resolves and then picks whichever end-of-turn tool it feels like.
- Evidence: `shots/e2e/S8/` (last run), earlier runs in the W10 hand-back table. Pass runs: `rr-s8-1`, `rr-s8-2`, full runs 3 and 4.
- Reading: the system prompt does not say when to prefer `report_stuck` over `ask_user` (an unreachable resource with no way forward is stuck; a missing decision is a question). Owner: `src/office/runtime/systemPromptTemplate.ts` (spec `employee-runtime.md` section 5). Also the duplicate bubble: a final-text bubble is posted in addition to `ask_user`'s question (`src/office/employees/supervisor.ts`, turn end handling).

## I-2 · S8 · `idle` is emitted a millisecond before `stuck` (low-medium)

- Expected: when `report_stuck` runs, the employee goes from `working` straight to `stuck`.
- Observed: events at the same millisecond: `task failed`, `employee idle "Researcher"`, then `employee stuck`. A client that renders each event shows a flash of idle (and a "went idle" cue). The same pattern appears after `finish_task`: the `done` bubble arrives while the employee event still says `working`, and `idle` follows in the same millisecond or up to about 2 s later.
- Evidence: `shots/e2e/S8/fail-last-events.json` from an earlier run (events at 00:33:19.123 to .124); the test now waits 1 s and re-reads the state so it is not fooled.
- Reading: `setStuck` and the task-close path patch the employee in two steps, and `compute()` runs between them with the task already closed. Owner: `src/office/employees/supervisor.ts` (`setStuck`, `finishTask`, `compute`). Emit one `employee` event per transition.

## I-3 · S10 and the activity feed · A new command inside 60 s of the same sentence produces no new activity line (medium)

- Expected: every action by the employee shows as an activity step that is `running` while it works.
- Observed: `addStep` returns the previous step's id when the sentence repeats within 60 s (`now - lastStep.startedMs < 60_000`). In S10 Maya had just finished a "Ran a command" step about 50 s earlier (in S7); a `sleep 45` in the shell, in a brand new task, created no step event at all. The old step then showed a duration of 102 s. A viewer watching the thread sees nothing happening for 45 s while she is working, and no `running` step exists to wait for.
- Evidence: first S10 attempt of the second full run (thread `steps` of Maya: one step "Ran a command", started during S7, ended 102 s later); reproduces whenever a long command follows a command of the same sentence inside 60 s.
- Reading: the 60 s coalescing window should apply only within one task and one turn, and must not coalesce when the previous step is already closed. Owner: `src/office/employees/supervisor.ts` `addStep` (lines near 345).

## I-4 · S2 · No plan appears for the S2 task (low, spec wording)

- Expected (test-plan S2): "A plan appears and ticks over."
- Observed in 8 of 8 runs (Haiku 6, Sonnet 1, plus one earlier): the task finishes in 14 to 37 s in 2 to 5 tool calls and no task event ever carries a plan (`plan: []`). The runtime prompt only asks for `TodoWrite` "for anything longer than three steps". The mirror itself works: in the soak (long tasks) task events with a plan: Maya 25, Jonas 7, Kenji 4.
- Evidence: `shots/e2e/S2/thread.json`, `shots/e2e/soak-run2.log`.
- Reading: not a bug in the mirror. Either the S2 promise changes ("for longer tasks") or the prompt asks for a plan on any build task. Owner: orchestrator (`spec/test-plan.md` S2 wording) or `systemPromptTemplate.ts`. Related: the task also finishes before a "mid-task" steer is really mid-task (S3 steers after her first activity line; she is usually done 5 to 20 s later, in one run she was already done).

## I-5 · S5 · "Default level" for Maya is `independent`, so the literal S5 never asks (low, spec contradiction)

- Expected (test-plan S5): "default level, ask Maya to publish with `git push`: she asks through an approval first."
- Observed: the web developer preset's `defaultPermissions.level` is `independent` (`src/office/presets.ts`), and the gate allows everything at that level. The test therefore sets Maya to `asks_big_steps` first (the contract's default level) and S5 passes (the approval "Publish team site with git push" arrives with nothing pushed; denied; the bare repository stays empty). With Maya at her real default, no approval would be requested.
- Evidence: `shots/e2e/S5/thread.json`, `docs/hackathon/spec/workstreams.md` preset table.
- Reading: decide which is intended. If a web developer may push without asking, S5 should say "set to the default level of the contract". Owner: orchestrator (`presets.ts`, `test-plan.md`).

## I-6 · S1 / S4 · The greeting arrives after the employee is already `idle` (low)

- Expected: first message arrives by itself once the desktop is up.
- Observed: `idle` is reported at about 5 to 7 s, her first message 3 to 4 s later (S1: idle after 5.2 s, message after 8.3 s). A message the manager sends in that window is processed first, the greeting lands after it, and the task bubble then says "I've also introduced myself and asked what you'd like me to start on" (seen once: Priya's thread starts with the user's request, then the greeting, then the `done` summary).
- Evidence: `shots/e2e/S1/thread.json`; Priya's thread in an earlier S4 run.
- Reading: the hire note turn runs after `idle` is published. Publish `idle` after the greeting turn, or hold manager messages until it ends. Owner: `src/office/employees/supervisor.ts` (`bringUp` then `startRuntime`).

## I-7 · S7 · A colleague with no context makes the exchange stall on a question (medium, behaviour)

- Expected: "get a tagline from Priya and put it on the page": one exchange, the page shows the tagline.
- Observed: full runs (Priya had context from S6): passes in 2 of 3 valid runs (peer steps `to` and `from` appear in both threads, 1 exchange each way, tagline on the page, no loop). Failures: (a) Priya answered "Good design, delivered with a smile." but added that Suhaan had not confirmed it, and Maya then asked the manager "Shall I put it under the heading?" (state `needs_you`, nothing on the page); (b) three standalone runs with a freshly hired Priya who had no brief: she replied "I haven't been briefed on the tagline yet" and Maya waited for the manager.
- Evidence: `shots/e2e/S7/` (last run, standalone), `shots/e2e/run-full.log` (S7 in the last full run).
- Reading: employees defer to the manager whenever a colleague hedges. Whether that is right is a product choice; for the demo, a colleague request should be answered with a best-effort tagline. Owner: `systemPromptTemplate.ts` (colleague section). Related low finding: after a permission change (PATCH level) Maya once posted a question to the manager about the change notice ("Your permission is now works independently ... do you want me to publish now?"), which put her in `needs_you` for no reason (briefing notice handling, `src/office/runtime/inbox.ts` and `briefing.ts`).

## I-8 · Frames · The "show it in the browser" desktop has two browsers and a popup (low)

- Observed: Haiku and Sonnet often open both Firefox and Chromium; the Chromium window shows a "Make Chromium faster" popup and Firefox a "security sandbox is disabled" banner (`shots/e2e/S3/frame.jpg` in an earlier run, `S2/frame.jpg`). Fine for tests, not for the demo recording.
- Reading: the Space image's browsers need their first-run and sandbox warnings disabled, and the prompt could say which browser to use. Owner: Space image setup in `src/office/spaces/cuaSpaces.ts`/`cuaBackend.ts` (post-create script) and the prompt.

## I-9 · Cost · Task cost lands after the task closes; chat-only turns show no cost (low, known)

- Observed: the `task` event that closes a task (and the `failed` task of S8) carries `costUsd: 0`, `numTurns: 0` for 1 to 3 s; the final value arrives in a later `task` event. A greeting turn and a question-and-answer turn without a task add nothing to `/api/team` (S1 and S6 report `$0.0000`). Total real spend of a full run was only $0.012 to $0.03 on Haiku, so the practical effect is small.
- Reading: matches W2's note 6. A client that reads the cost at `done` shows 0. Owner: `supervisor.turnEnded` (`src/office/employees/supervisor.ts`).

## Notes that are not issues

- After `desktop/reset`, a second process that kept a handle to the old Space gets a stale connection (`healthy` false forever) until it builds a new `Spaces` object. Office itself recovers (S9 passes). The test script creates a fresh one after a reset (`Run.freshSpaces()`). Only relevant if two processes ever talk to the same Space.
- Run-to-run variance is real: S2 and S3 timings were 14 to 37 s; S10 took 61 s once and 156 s once (cause not investigated).
