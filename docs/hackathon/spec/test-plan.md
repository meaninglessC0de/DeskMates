# Test plan and the fix loop

Owner: orchestrator. Used in phases 3 and 4 of `plan.md`. Every check here is run by the orchestrator or by a test agent it briefs; a build agent's own report is never the evidence.

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

## Layers

| Layer | What | Command | When |
| --- | --- | --- | --- |
| 1. Static | Types, unit tests, Astryx purity | `npm run check` | After every workstream and after every fix |
| 2. Mock end to end | The whole app with scripted employees and fake desktops | `scripts/e2e/mock.ts` (API and WebSocket; written by W0b) and `npm run shots` | After phases 1 and 2 |
| 3. Real, headless | Real model, real Cua desktops, no UI | `scripts/e2e/real.ts` (W10) | Phase 3 |
| 4. Real, through the UI | A browser drives the renderer against real office | orchestrator, with the built-in browser, plus `scripts/e2e/ui.ts` (W10, Playwright) | Phase 4 |
| 5. The Mac app | Electron window, tray, notifications | `scripts/smoke/shell.ts` (W9, Playwright driving Electron), then the orchestrator by screenshot | Phase 4 |
| 6. Soak | Three employees working at once for 30 minutes | `scripts/e2e/soak.ts` (W10) | Phase 4, last |

## Scenarios (the product's promises, each checked at layers 2, 3 and 4)

| # | Scenario | Pass means |
| --- | --- | --- |
| S1 | Hire Maya from the preset | She appears within 1 s as "Starting desktop"; her desktop is running within 60 s; her first message arrives by itself once it is up; the live view shows her desktop |
| S2 | Give Maya a real task: "Make a one-page site about our team in ~/work/site and show it to me in the browser" | A plan appears and ticks over; activity lines read like sentences; the browser in her desktop ends on the page; a `done` bubble summarises it; the task has cost and time |
| S3 | Steer mid-task: "Make the heading blue" while S2 runs | Her message shows Delivered then Seen; the final page has a blue heading; she did not restart from scratch |
| S4 | Approval: set Priya to "Asks first", ask her to save a file | An approval row and a notification; Approve lets her continue; a second run with Deny makes her stop and say so |
| S5 | Big step: default level, ask Maya to "publish it with `git push`" | She asks through an approval before the push; nothing is pushed if denied |
| S6 | A question: "Write a tagline for us" to Priya with no context | She either asks one clear question (state Needs you, sorted to the top) or makes a sensible choice and says so; replying resumes her |
| S7 | Teammates: ask Maya to "get a tagline from Priya and put it on the page" | One exchange between them visible as activity lines in both threads; the page shows the tagline; no loop |
| S8 | Stuck: ask Jonas to open a site that does not exist and log in | He reports stuck with what he tried; the banner shows; "Try again" works |
| S9 | Pause, resume, restart desktop, reset desktop, remove | Each does what it says; no orphan Space or process afterwards |
| S10 | Restart office in the middle of S2 | Everyone comes back in the right state; Maya finishes |
| S11 | Take control of Maya's desktop, type in her terminal, give back | Input lands; her loop waits and then continues |
| S12 | One-to-one call with Maya while she works | Connects within 15 s (audio) or 30 s (face); she answers a question about what she is doing correctly; "make the heading green" said on the call reaches her work; the thread gets the call line |
| S13 | Summon meeting with three people | Saying a name or clicking a tile makes that person answer; one voice at a time; ending returns everyone to work |
| S14 | Team view | Numbers match the tasks just run; with Databricks on, "Synced" shows a time and a question to the Ask box returns an answer; with it off, the same numbers come from local data |
| S15 | Lend my screen | Against the mock host (always): a banner with a countdown; the employee uses a host tool; "Take it back" ends it at once and she says she is back on her own desktop; a second employee is refused while the first holds it. Against the real Mac (only if the host driver is installed): she can read a window on it |
| S16 | Background | Close the window: the tray stays, a notification arrives when someone needs you, clicking it opens the right thread |
| S17 | No keys | With no LiveKit and no Databricks configured, the Call and Summon buttons and the Ask box are disabled with one-line reasons, and nothing errors |

## Visual review (orchestrator)

For each of the eight frames in `design/rulings.md` ("What finished looks like") plus first run, hire step 1, profile, settings and every error and empty state: open the screenshot in light and dark and check, in this order: alignment and spacing rhythm, one primary action, copy (sentence case, no filler, no tool names), colour (only faces and presence dots), states present, nothing that looks like a developer console. Write the defects as a numbered list per screen with the file to change, and send it to a fresh front-end agent with the common rules. Repeat until a full pass finds nothing. Cap: three rounds per screen; anything still wrong after that is logged in `build/log.md` with a screenshot.

## The fix loop

1. Run the layer. Record each failure in `docs/hackathon/build/issues.md`: id, scenario, what happened, evidence (log lines, screenshot path), owner area.
2. Group failures by owner area and hand each group to one agent with: the issue list, the files it may touch, and the instruction to find the cause before changing code, fix it, add a test that would have caught it where that is cheap, and rerun the scenario.
3. The orchestrator reruns the scenario itself. Passing closes the issue. A fix that fails twice gets a different agent with the full history of what was tried.
4. Never weaken a scenario to make it pass. If a promise cannot be kept, the feature is switched off cleanly (button disabled with a reason, per S17) and the cut is written into `decisions.md` and the morning report.

## Cost and safety limits during testing

- Model spend for the whole night is capped by the user's answer in `preflight.md`. `scripts/e2e/real.ts` uses `claude-haiku-5-5` unless a scenario is about quality (S2 runs once on the default model for the demo recording).
- At most 3 real desktops at a time across everything running on the machine (each holds about 2 GB); every script deletes what it creates; the soak test checks host memory before starting and stops if free memory is under 6 GB.
- Tests never use the host driver except S15, and S15 runs only read-only actions on the real Mac.
- Nothing is pushed, published or sent anywhere outside this machine by a test. S5's `git push` targets a local bare repository created by the test.

## Exit criteria for the night

Must pass: S1 to S4, S6, S9, S10, S14 (local), S16, S17, static checks, and the visual review of frames 1 to 4, 7 and 8.
Should pass: S5, S7, S8, S11, S12 (at least audio), S14 with Databricks, frames 5 and 6.
May be cut with a note: S13, S15 on the real Mac, the avatar face, raise hand.

Things only a person can confirm, listed in the morning report rather than tested at night: speaking into the microphone on a real call, the look of a native notification, the macOS permission prompts.
