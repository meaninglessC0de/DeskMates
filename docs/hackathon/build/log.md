# Build log (orchestrator's running record; append only)

Read this first after any context loss. The plan is `../plan.md`; briefs are `../spec/workstreams.md`.

## Standing facts

- Started: 2026-11-14 22:40, on the user's "Start the build".
- User decisions: Synthesia cast, all Linux desktops, Sonnet 5.5 default, lend-screen as a stretch (D-029).
- **Git: authorised (D-032).** Commit on branch `build/night-1` at every gate and push it to `origin` as progress is made. Only the orchestrator commits. Never commit `.env.local`, `data*/`, `vendor/cua`, `vendor/_research`. End commit messages with the Co-Authored-By line.
- **Spending cap: $50 on the Anthropic key for the night (D-032).** Tests use `claude-haiku-5-5`; quality runs and the demo scenario use Sonnet 5.5. Stop real-mode testing if the scripts' reported spend passes $40.
- **Deadline: submission 12:00 on 15 Nov; fully functional by 08:00; the demo is a video.** A feature has to work reliably enough to record once; phase 5 produces a shot list for the video.
- Keys: Anthropic, LiveKit and Databricks (host, warehouse, token) are set and verified (23:35). Synthesia, cast ids, Genie space id, MLflow experiment id, Deepgram and ElevenLabs are empty. Re-check with the names-only command below. Never print key values.
  `awk -F= '/^[A-Z_]+=/{ if (length($2)>0) print $1": set"; else print $1": empty" }' .env.local`
- Cua: runtime and Linux image cached in `~/.cua`; embedded runtime, no daemon; VM capped at 12 GB / 6 CPUs. At most 3 real desktops at once across the whole machine.
- Mac kept awake by a `caffeinate` background process (12 h) and the app's keep-awake hold. A check-in fires at minutes 17 and 47 of each hour.
- Preflight B0 (tools): pass. B1 (Cua): pass. B2 to B7 need keys or the user and have not run.

## Phase status

| Phase | State | Notes |
| --- | --- | --- |
| 1a. W0a skeleton | done 22:58 | committed |
| 1b. W0b office mock, W0c renderer skeleton | done 23:27 | committed |
| Gate 1 | passed 23:30 | typecheck, 34 + 30 tests, e2e mock 6/6. Found: renderer crashes against live office (zustand selector in PlanSection); sent to W3, W4, W5 |
| 2. W1 to W9 | running | W3, W4, W5, W6 since 23:05; W1, W2, W7, W8, W9 since 23:32 |
| 3. Integration | | |
| 4. End-to-end, fix loop, design review | | |
| 5. Wrap | | |

## Journal

- 22:40 Build started. Launched W0a.
- 22:46 User replied: commit and push as progress is made; $50 cap; functional by 08:00, submission 12:00, video demo. Recorded as D-032.
- 22:58 W0a done and verified by the orchestrator (typecheck, exact pins, scripts). Committed and pushed. Notes: Electron binary needed `node node_modules/electron/install.js`; purity script scans the given folder (`--built .` would scan vendor clones); src/shared uses `import type` and `.ts` extensions. Launched W0b and W0c.
- 23:05 W0c done and verified (typecheck, 30 tests, purity clean, shots render with the neutral theme, Electron window smoke). Added root vitest.config.ts excluding vendor. Committed and pushed. Launched W3, W4, W5, W6 against fixtures while W0b finishes; W1, W2, W7, W8, W9 wait for W0b.
- 23:30 W0b done and verified by the orchestrator (office typecheck, 34 tests, seeded office, e2e mock 6 of 6). Committed and pushed. Core office files (`main.ts`, `routes/`, `store/`, `bus.ts`) have no owner: agents may make small additive edits there and must list them. Launched W1, W2, W7, W8, W9.
- Known contract drift to reconcile at integration: W0b uses extra error codes (`not_pending`, `candidate_taken`, `calls_off`, `employee_unavailable`, `employee_busy`, `desktop_off`); `MOCK_SPEED` is read from process.env; `CallsHost` lives in `employees/office.ts`.
- 23:21 W6 Part A done and verified (typecheck, purity, screenshot of a real Cua desktop streaming into SpaceView). Committed and pushed. Part B (through real office endpoints, two-minute soak) waits for W1; resume W6 by message when W1 lands.
- 23:24 W5 done; orchestrator reviewed stage screenshots (one-to-one, meetings of 3 and 4, spotlight, picker). Committed and pushed. Sent W5 a polish list: heavy scrim band on the desktop tile, top-align the one-to-one right column and add the compact type box, breathing room under the 4-grid.
- 23:25 W4 done; orchestrator reviewed hire, profile and team screenshots (good). Committed and pushed. Sent W4 and W3 polish notes: initials instead of the grey silhouette when there is no portrait, drawer tooltip on open, team table alignment.
- 23:28 W1 done; orchestrator re-ran scripts/smoke/spaces.ts (ALL PASSED, 14 s). Fixed one integration bug: stream ticket `expiresMs` was relative, viewer expects absolute epoch ms. Committed and pushed. Resumed W6 for Part B.
- 23:28 W3 done (frame, sidebar, thread, desktop panel; selector crash fixed; live checks ran). Reviewing screenshots.
- 23:29 W3 committed (reviewed: good). Resumed W3 for shell-bridge wiring (setTray, setBadge, onTrayAction, onNotificationClick, askMicrophone), a neutral lent banner and minute-granularity timers.
- 23:29 W9 done (Mac shell; smoke passes ~30 checks). Committed and pushed. Its renderer gaps are the bridge wiring W3 is adding.
- 23:31 User added keys to .env.local. Verified by the orchestrator: Anthropic (both model ids exist, a call works), LiveKit (room service answers), Databricks (statement API, 1 s, catalog workspace). Still empty: SYNTHESIA_API_KEY, cast ids, DATABRICKS_GENIE_SPACE_ID, MLFLOW_EXPERIMENT_ID, DEEPGRAM, ELEVENLABS. Told W2, W7 and W8 to run their real checks before handing back (budgets: W2 $5, W7 $2, W8 none).
- 23:33 W3 follow-up done and committed (shell bridge wiring, neutral lent banner, minute timers; 69 renderer tests).
- 23:34 W6 Part B done and committed: live desktop in the real app shell through real office endpoints, soak with renewals, take control, fallback.
- 23:34 W4 polish done and committed (initials in shots, drawer focus, team alignment, capped answer table).
- 23:40 W5 polish done and committed (compact name chips, type box under the face, top-aligned column, 4-grid breathing room; fixed two bugs with real images).
- 23:44 W8 done against the real workspace (setup idempotent, flush ~10 s, report read ~1 s, MLflow trace listed, Genie API answers). Committed and pushed. Orchestrator changes: mock offices no longer sync to Databricks unless DATABRICKS_SYNC_MOCK=1; MLFLOW_EXPERIMENT_ID written to .env.local. TODO at wrap: truncate the five Delta tables (they hold test rows from agents' offices) and reseed from the demo office; add optional experimentUrl to TeamReport and show it in the Team view; the user must create the Genie space.
- 23:48 User feedback (D-033): take the front end further for the Figma prize; custom components allowed; the call's type box must be at the bottom. Wrote design/polish-brief.md, scaffolded ui/styles (constructed stylesheet, data-am-* attributes, tokens only; purity stays at zero), saved shots/_before. Launched two OPUS design agents (user allowed Opus): D1 app screens + shared Portrait and tints (ports 4331/4341, data-d1), D2 call and meeting stage (ports 4332/4342, data-d2). W7 still owns stage/useLiveKit.ts. Still running besides: W2 (brain, real smokes), W7 (calls, real checks).
- 23:59 W2 done. Orchestrator re-ran: 333 office tests pass; runtime-desktop smoke PASS (real Haiku employee on a real Cua desktop reported "Example Domain" in 22 s, $0.005, 310 MB per employee process). Committed and pushed. SDK findings: TodoWrite needs CLAUDE_CODE_ENABLE_TASKS=false; init lists 28 desktop + 11 office + 3 space tools; steering lands at the next tool boundary.
- 00:00 Launched W10 (scripts/e2e/real.ts and soak.ts; ui.ts waits for the design pass). Synthesia key is now set and config/cast-ids.txt has 8 ids (origin to be confirmed by W7); told W7 to run avatar, portrait capture and swap checks within 15 min of avatar time. TeamReport gained optional experimentUrl (office attaches it when source is databricks); told D1 to show an "Open traces" link. Running now: W7, W10, D1 (Opus), D2 (Opus).
- 00:15 User named the app Deskmates and sent a logo reference (D-034). Launched a Sonnet brand agent (logo from scratch, app icon, tray glyph, favicon, ui/Logo.tsx, brand sheet, APP_NAME in the shell). Told D1 to rename in the renderer, use Logo, and align tints 0-3 with the logo colours in hire order; told D2 for information. Wrap TODO: rename the Databricks schema agent_manager -> deskmates when the test rows are cleared.
- 00:18 W7 done with real keys: call mind in character, audio round trip through the UI with a fake microphone (end of speech to first text 1.7-3.5 s), three-person meeting routes by name, Synthesia avatar ready 3.1 s after call start, swap_avatar ~1 s, portraits captured for all eight ids (Amara and Hannah share a face, so Hannah was dropped: cast of 7). Merged avatar ids and LiveKit voice ids into config/cast.json. Committed and pushed. Not verified by a person: real microphone, whether the voice changes with the face in a meeting. One office test (runtime.integration briefing) failed once under load and passed 4 re-runs: flaky, low priority.
- 00:18 Push needed a larger HTTP buffer once (set http.postBuffer for this repo); now up to date at a21a507. Told D1 and D2 that real portraits exist (photo is now the primary state; monogram is the fallback).
- 00:23 Brand agent done: Deskmates mark (variant "Handle", flat), small variant, app icon and icns, tray template, favicon, ui/Logo.tsx, brand sheet. Orchestrator reviewed the brand sheet and explorations: good. Committed and pushed. Hue angles: blue 262, orange 62, pink 357, green 160.
