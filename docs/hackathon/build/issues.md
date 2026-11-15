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

## I-10 · Live run through the UI (orchestrator, 01:50) · A test run deleted the running app's desktop (high, fixed)

- Observed twice: while the real app ran on 4317 and Maya was working, her desktop vanished ("This desktop does not exist", connection refused). She reported stuck with what she had tried; the office recreated the desktop within a minute and she rebuilt the page by herself (files were lost: a deleted Space keeps nothing).
- Cause: `scripts/e2e/lib/harness.ts` cleanup deleted every `local:emp-*` Space that was not in its start-of-run baseline, so any desktop created by anyone while a test ran was removed at the end of that test.
- Fix: cleanup deletes only Spaces the run hired or whose employee folder is in the run's own data folder. The office itself never deletes Spaces it does not know.

## I-11 · Live run · Approval card for a chained command says "Run a command" and shows the wrong part (medium, fixed)

- Observed: Sonnet chained edit, commit and `git push` in one shell command. The card read "Run a command" with the first 120 characters (a `sed`), so the manager could not see that the big step was a push.
- Fix: `riskyShellStep` in `toolGroups.ts` names the step ("Publish with git push", "Delete files", ...) and shows the part of the chain that matched.

## I-12 · Live run · A new hire ends in "Needs you" (low, fixed)

- Observed: the hire note said "ask what to start on", Sonnet used `ask_user`, so every new hire showed the amber "Needs you" state. Fix: the note asks for a hello with `message_user` and says it is not a question.

## I-13 · Live run · Sidebar time reads "in 51s" for a fresh message (low, fixed)

- Cause: Astryx `Timestamp` reads the current time once unless `isLive` is set, so a later value is in its future. Fix: `isLive` and a key on the value, in the sidebar and the Team "synced" line.

## I-17 · S17 · "Summon meeting" stays enabled when calls are off (medium)

- Found by W11 with `scripts/e2e/ui.ts` (layer 4, mock desktops, an office started with no LiveKit and no Databricks settings; `/api/health` reports `capabilities.calls: "off"`).
- Expected (test plan S17): with no LiveKit keys the Call and Summon buttons are disabled, each with a one-line reason.
- Observed: "Call" is disabled with the tooltip "Calls are off", but "Summon meeting" is enabled (and has no reason) as soon as two people are hired; it opens the picker and "Start meeting" would call the office, which answers 409 `calls_off`.
- Evidence: `shots/e2e-ui/S17/03-summon.png`, `shots/e2e-ui/S17/fail.png`, `page.txt`; ui.ts S17 line.
- Reading: `TopBar.tsx` computes `callsOff` for the Call button but the Summon button only checks `peers < 2` (and `AppFrame.tsx` disables the `mod+shift+m` hotkey on peers only). Owner: `src/renderer/src/shell/TopBar.tsx` (and `AppFrame.tsx`): disable when `callsOff`, with the tooltip "Calls are off".
- Note on the Ask box (also S17): the team view does not render it at all without Databricks (ruling R15), so "absent" counts as passing in `ui.ts`; the test plan's "disabled with a reason" wording is superseded by R15.

## I-14 · Live run · Office does not start after a quick restart: "database is locked" (high, fixed)

- Observed: stop the office (graceful), start it again within a few seconds: `[office] could not start: database is locked`. Cause: `PRAGMA journal_mode = WAL` ran before any busy timeout was set while the old process was still closing the file. Fix: `busy_timeout = 15000` first (`store.ts`).

## I-15 · Live run · Voice worker fails to start when port 8081 is taken (medium, fixed)

- Observed: four failed starts in a row (`address already in use ('0.0.0.0', 8081)`) while another office's worker held the port; calls would not connect until it freed. Fix: `WorkerOptions(host="127.0.0.1", port=0)` in `voice/agent.py`.

## I-16 · Live run · Team shows "0.0" hours after a short first session (low, fixed)

- Fix: time under an hour reads as minutes ("12 min"), from an hour up as "5.2 h"; label "Time worked".

## I-18 · User's run · `npm start` fails: "No entry point found for electron app" (high, fixed)

- Observed 15 Nov 10:35, the first time the documented command was run as written. `package.json` had no `main` field; the shell test passed because it launches `out/main/index.js` directly. Fix: `"main": "./out/main/index.js"`.

## I-19 · Video takes · On a call Maya says the fix is not written while her push approval is pending (medium, fixed in the prompt, not yet heard on a live call)

- Observed 15 Nov 11:35 in the recorded meeting: "I haven't fixed the bug or committed anything", seconds after "found and fixed". Cause: her plan was never ticked (first step still "in progress"), her activity lines only say "Ran a command", and the call mind is told never to claim finished work, so the pending approval was the only evidence and it lost.
- Fix: the call mind is told that plan ticks can lag and that waiting on an approval means the steps before it are done; the "waiting on" line now names the approval and its command. Reproduced and re-run offline on her real situation (3 of 3 wrong before, 3 of 3 right after). Needs an office restart to take effect.

## I-20 · Video takes · Two approvals for one push (medium, open)

- Observed 15 Nov: Maya asked with `request_approval` ("Push fix/checkout-discount"); after Approve the gate asked again for the command itself ("Publish with git push"). The first approval does not cover the gate's check.
- Proposed: tell the worker not to call `request_approval` for a shell command the office already gates (publish, send, delete), so there is one card with the exact command. That is a change to the employee prompt and its spec, so it waits for a live check.

## I-21 · Video takes · Activity lines read "Ran a command" (low, open)

- Seven of Maya's eight recent lines were "Ran a command". They tell neither the manager nor the call mind what happened. Proposed: name the command's purpose from its first word (tests, git commit, git push) the way the gate already titles risky commands.

Also seen in the takes, by design: the microphone is on when a meeting starts, so voices near the Mac are heard as the manager and answered. Mute when recording.

## I-22 · Video takes · An instruction given in a call is acknowledged aloud but never reaches the worker (high, fixed, confirmed on a live call)

- Observed four times in today's real calls (`stop=max_tokens ... tools=-` in the office log), including "Version B. Ship it." to Ines and an instruction to Jonas this morning: the person says "Got it" and nothing happens.
- Cause: the call mind's `max_tokens` was 400. Thinking, the spoken acknowledgement and the `tell_worker` call with the instruction written out did not fit, so the tool call was cut off and dropped.
- Fix: cap 1200 (the prompt, not the cap, keeps the spoken answer short). Confirmed at 12:02 on a live call: "Got it, Sam. I'll add a small 'Shipping this week' line under Version B." then `tell_worker`, and Ines made the change on her desktop and reported it.
- I-19 was confirmed on a live call at the same time: asked where she was, Maya said "The fix is in, the tests have run, and the change is committed…".

## I-23 · Design · An employee who is waiting for a teammate is nudged and then failed (high, being fixed)

- Found by reading `turnEndedInner`: with a task open and nothing to do, the office nudges twice and then fails the task as "Stopped making progress". The first demo run only worked because every reply came within a few seconds. Fix in progress: `wait_for_colleague` (D-055).

## I-24 · Integration · Rebuilding while the app runs leaves a blank window on reload (low, open, documented)

- The office lists the renderer's files when it starts, so after `npm run build` the new asset names are answered with the page itself and the window stays blank. Restart the app after a build. Does not affect a normal run.

## Live demo run 1 (12:49 to 12:53, Sonnet 5.5, fresh team, `scripts/demo/live.ts --reset`)

- Worked first time. Hires 1 min 50 s; work 2 min; $0.62. Eight messages between desks (Jonas to Priya; Maya to Priya and Ines asking; Priya to Maya twice; Ines to Maya with the spec; Maya to Ines with the full page; Ines to Maya with two fixes, one of them removing a pricing claim the page could not back up). Maya waited for Ines, Ines waited for Maya: both shown as "Waiting for …", nobody nudged or failed. Plans ticked during the work. Maya's push approval left pending.
- Seen: Priya's copy and post are plain text files, which look bare on her desk (the fuller version asks for styled pages). Maya's plan read "3 of 5" at the end although only the push was left.
- Not checked by me: pressing Approve at the end. The session's safety rules do not let me answer an employee's approval through the API, which is right: it is the presenter's click. It was exercised earlier today by the teamwork agent on its own office (one card, push went through) and on camera by the video session.

## Live demo runs 2 to 5 (13:07 to 13:42, Sonnet 5.5, fresh team each time, default team brief)

- **Run 2**: 42 messages between desks, LAUNCH15 reached code, page, copy and design, but 8.1 min of which 4 were a stall. Two causes, both fixed: the team-wide cap of 20 teammate messages a minute refused Priya's sign-off (now 90, and the refusal says to send it again); and a "ghost task" (I-25).
- **I-25 · Ghost task after finish_task (high, fixed)**: a tool call after `finish_task` in the same turn opened a new task that nothing ever closed, so the desk read "working" with no turn in flight until the four-minute stall watchdog. Diagnosis with transcript evidence: `L-priya-stall-diagnosis.md`. Fixed in `supervisor.ts` with six tests; `stalls` is also reset on progress now.
- **Run 3**: stopped at four minutes: Priya asked the manager to confirm the offer dates and Maya asked approval to `rm -rf /tmp/old`. Fixed: the brief says to decide details and tell the manager; `rm -rf` of /tmp paths is no longer a big step (other deletes still are).
- **Run 4**: clean. 4.8 min, 52 messages between desks, 24 to the manager, nothing needed the manager before the push, $2.13.
- **The user could not see the desktops change** (13:23): the streams were live, but the work went through background commands and web fetches. Fixed with on-screen mode (`ON_SCREEN=1`): a "Work log" window on every desktop shows each command as it runs, and web reading goes through Firefox on the desktop.
- **Run 5 (on-screen mode)**: 7.6 min, 45 messages between desks, 29 to the manager, LAUNCH15 on the page and in the code, $2.51. Seen on the Desks view: Jonas reading shopify.com in Firefox, the work-log windows filling, Priya saving Maya's page and opening it to proofread. Priya's work-log window was not visible in one screenshot (not investigated).

