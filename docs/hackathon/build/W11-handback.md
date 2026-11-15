# W11 hand-back: UI end-to-end test (`scripts/e2e/ui.ts`)

Status: written, runs in mock mode in about 45 s, passes twice in a row except S17, which fails on a real product bug (I-10). The `--real` run was written but **not run** (skipped, see below). Nothing of mine is left running (ports 4381 and 4391 free; employee processes of the no-keys office are stopped by the script).

## Files
`scripts/e2e/ui.ts` (the test), `scripts/e2e/lib/web.ts` (new: own Vite web server proxying to our office with no watcher and no HMR; a page guard that collects console errors, uncaught exceptions and the error boundary). Nothing under `src/` touched. `npm run typecheck:area -- scripts` is clean. Issue written: I-10 in `build/issues.md`.

## How to run
```
npx tsx scripts/e2e/ui.ts                 # mock office (MOCK_LLM=1 DESKTOPS=mock MOCK_SPEED=2, DATABRICKS_SYNC=off), costs nothing
npx tsx scripts/e2e/ui.ts --real          # real desktop and claude-haiku-5-5, S1 and S2 only, budget $0.50
flags: --speed 2  --port 4381  --web 4391  --data data-w11  --headed  --keep  --budget 0.5  --model <id>
```
- Starts its own office and its own Vite server (`VITE_OFFICE_URL` points at our office), drives Chromium at 1440x900 by role and accessible name only. Every label is in the `LABELS` object at the top of `ui.ts`; the page is retried for a few minutes if it fails to compile (a file mid-edit).
- Evidence: `shots/e2e-ui/<S>/NN-step.png`; on a failure also `fail.png`, `console.txt` (everything the page logged), `office-log.txt` (last 120 office lines), `page.txt` (accessibility tree).
- Every scenario also fails on a console error, an uncaught exception or the error boundary ("Something went wrong"). None occurred in any run.
- Exit code 1 on any FAIL. S17 restarts the office on the same port as a no-keys office (`MOCK_LLM=0`, no LiveKit or Databricks settings, an invalid model key so nothing can spend).

## Result table (last mock run)
| Scenario | Result | s | Evidence |
| --- | --- | --- | --- |
| S1 first run, hire, first message | PASS | 4.0 | empty state has exactly one button "Hire"; role picked, candidate with name and photo, row after 0.2 s, greeting 1.4 s later |
| S2 task | PASS | 9.5 | plan appeared and 3 steps ticked, 3 activity groups, done bubble, row back to Idle |
| S3 steer | PASS | 1.3 | message footer went Delivered then Seen (recorded by a MutationObserver), she answered |
| S4 approval, Approve | PASS | 0.6 | "Publish the draft" in the thread, sidebar row "Needs you" naming it, Approve continued her |
| S4b Deny (Priya set to Asks first in the profile) | PASS | 11.5 | office agrees on the level, "Save a file" approval, Deny made her stop and say so |
| S9 desktop, profile level, pause/resume | PASS | 2.7 | frame.jpg loaded in the panel and closed; level change confirmed by the office; paused and resumed |
| S9b remove both | PASS | 2.6 | rows gone, office agrees, empty state back |
| S12 call | PASS | 2.3 | stage with her tile and Mute, Captions, Layout, End; ended; "Call with Maya" line in the chat |
| S13 summon | PASS | 3.0 | two people, two tiles, tile click, ended; "Meeting" line in the chat |
| S14 team view | PASS | 0.1 | table cells equal `/api/team` per person, figures not all zero |
| S17 no keys | **FAIL** | 1.9 | Call disabled with tooltip "Calls are off" (pass); Summon meeting enabled with no reason (I-10) |

## Product bugs found
- **I-10** (medium): "Summon meeting" stays enabled when calls are off (`TopBar.tsx`, `AppFrame.tsx` hotkey). The test will pass once it is disabled with a reason.
- Not a bug, a ruling: the team view hides the Ask box without Databricks (R15), so "absent" passes in S17 although `test-plan.md` says "disabled with a reason".

## Flaky or fragile
- Nothing flaky in 5 consecutive mock runs (timings within 0.3 s). The steer check depends on MOCK_SPEED=2 (the steer is delivered about 0.4 s before she picks it up); at speeds above 4 "Delivered" may be too brief to see.
- Call tiles are `role=checkbox` inputs that Playwright cannot click (not visible); the test clicks their bounding box with the mouse. If the tile markup changes, only `s13` needs touching.
- Mock-only strings (greeting, activity, approval titles, done text) are in `LABELS` under "mock script"; the real run does not use them.
- Labels re-read at the end: copy had already moved ("Hire your first deskmate"); matched by loose regexes. Design agents were still editing `TopBar.tsx`, `Sidebar.tsx`, `Stage.tsx`, `TeamView.tsx` during my runs; the last run passed on their latest state.

## `--real` run
**Skipped.** Port 4372 was in use (another agent's desktop; `lsof -ti:4372` returned PIDs) at the time of the final check, and the rule says to skip the real run then. The real path (S1 and S2 only, hire through the dialog, task "Make a one-page site about our team in ~/work/site and show it to me in the browser", approves whatever approval appears, plan is a soft check because of I-4, cleanup through `Run.cleanup`, budget $0.50) is written and typechecks but is untested. Run it once when ports 4371 and 4372 are free: `npx tsx scripts/e2e/ui.ts --real`.
