# V hand-back: what the video session can use (build session, 15 Nov, edit in place)

State at 11:27. Each line says whether it was run. **11:22: the app was rebuilt and restarted on the demo data with the debug port; 11:23 to 11:25: the four-person run was done on Sonnet 5.5 and finished (see "The four-person run" below).** Details: `V-desks-handback.md`, `V-pipeline-handback.md`.

## The one thing to know first

The app running on port 4317 was built before this work. It has none of it (no Desks view, no hook, no "Show desks"). To get it, the app has to be rebuilt and restarted. Agreed with the video session: not before 12:00.

```bash
npm run build
```

```bash
DATA_DIR=data-demo DESKMATES_CDP_PORT=9333 npm start
```

`DATA_DIR=data-demo` keeps the demo team apart from the user's own `data/` (D-048). Leave it out to open the user's real team.

## What is in, and how far each was checked

| Part | State |
| --- | --- |
| Desks view | Built. Type checks, 438 tests, purity and the Astryx doctor (no failures) pass. **Seen against the real office** through a browser client at 1440 x 900: three live desktops fill their tiles, pills and faces in place, the fourth desk is a "Hire" tile, no console errors (`shots/desks/live-faces-on.png`). Not yet seen inside the Mac window, nor with four streams at 2560 x 1600. |
| Tray item "Show desks" (Shift+Cmd+D) | In the code and in the shell test's expected labels. The shell test has not been re-run (it starts the app). |
| Hook `window.__deskmatesDemo` | Present in the page (checked). `openDesks`, `setFaces`, Esc and `F` exercised. `pin`, `say`, `startCall`, `summon`, `endCall`, `approve` not yet exercised on a real call. |
| Debug port `DESKMATES_CDP_PORT` | Works: `http://127.0.0.1:9333/json/version` answers and lists the app's page. Driving it with Playwright is the video session's side. |
| Pipeline `scripts/demo/run.ts` | Seed and script committed. **Maya's path run on a real desktop** (Haiku): hello in 16 s, pending push approval about half a minute after the task, terminal with "Ran 50 tests … OK" on her screen (`shots/demo/maya.jpg`). **The four-person run on Sonnet 5.5 is done** (below). |

## Driving the app

Connect: `chromium.connectOverCDP('http://127.0.0.1:9333')`, take the first page.

Hook (all on `window.__deskmatesDemo`):

| Call | Does |
| --- | --- |
| `openDesks()`, `closeDesks()` | Open or leave the Desks view |
| `setFaces(true or false)` | Show or hide the faces; may be set before the view opens. Showing pops them in 150 ms apart |
| `openThread(employeeId)`, `openTeam()` | Go to a conversation or the Team view |
| `startCall(employeeId)`, `summon([ids])`, `endCall()` | One-to-one call, meeting, hang up |
| `pin(employeeId or null)` | In a call or meeting: that person's desktop large; `null` goes back |
| `say(text)` | In a call or meeting: sends the line as typed input; the named person answers aloud. Wait for the greeting to finish first |
| `approve(approvalId)` | Approve a pending approval (for a visible click, press the card's Approve button instead) |

Selectors: tile `[data-am-desk-tile="0".."3"]`, face `[data-am-face="0".."3"]`, back `[data-am="desks-back"]`, top-bar Desks button `[data-am="desks-open"]`, view root `[data-am-desks-view]`. Keys: `F` faces, `Esc` back, Cmd+D open, Cmd+T Team, Shift+Cmd+D desktop panel of the open thread.

Office routes (base `http://127.0.0.1:4317`): `GET /api/employees` (ids, state), `POST /api/employees/:id/messages {text}`, `GET /api/employees/:id/thread`, `GET /api/employees/:id/frame.jpg` (the real desktop now, 1280 x 800), `POST /api/approvals/:id {decision: "approve" or "deny"}`, `POST /api/team/ask {question}`, `PATCH /api/settings {userName}`. A call started with `POST /api/calls` is not joined by the window; start calls through the hook or the buttons.

## The pipeline

```bash
npx tsx scripts/demo/run.ts
```

Flags: `--only maya,ines`, `--skip-hire`, `--skip-seed`, `--reuse`, `--timeout-min N`. It talks to `DEMO_OFFICE_URL` (default the app on 4317), sets the manager's name to Sam, hires Maya, Priya, Jonas, Ines in that order, seeds `~/work/shop` on Maya's desktop (50 tests, 8 failing from a real checkout bug: VAT charged before the discount is taken off), sends the four tasks and waits. Maya's `git push` approval is left pending on purpose. It prints a table and writes `shots/demo/last-run.json`.

Known gap: if anyone other than Maya raises an approval, the script does not answer it and that person waits until the timeout.

## The four-person run (11:23 to 11:25, Sonnet 5.5, real desktops, app on `data-demo`)

Hires: all four at their desks with a hello in 53 seconds. Tasks sent at 11:23:49; everything finished by 11:25:15.

| Person | Result on the desktop (frame looked at, `shots/demo/run/<name>.jpg`) | Minutes | Cost |
| --- | --- | --- | --- |
| Maya | Terminal in `~/work/shop`: "Ran 50 tests … OK". Commit on `fix/checkout-discount`. Push approval pending ("Push fix/checkout-discount") | 0.4 | $0.10 |
| Priya | Launch post open in Firefox as plain Markdown, with Jonas's line about Shopify in it | 1.3 | $0.10 |
| Jonas | "Hosted shop builders" pricing chart in Firefox: Shopify, Squarespace, BigCommerce, from their public pages | 1.3 | $0.19 |
| Ines | Version A and Version B phone mockups side by side in Firefox | 0.4 | $0.08 |

One teammate message each way between Priya and Jonas. Total $0.47. The work is quick, so a "mid-task" shot needs a follow-up message to each person at the moment of recording.

## Calls and the meeting: what is known

- This morning the user made real calls with a microphone and a three-person meeting on this build; the logs show greetings, answers, and faces and voices switching between Maya and Jonas.
- The greeting is "one short sentence and what you are on", from the person's real work. This morning Maya's was "Hi Suhaan, I'm here. I'm on the team site: the styling is pushed to main…". With the manager set to Sam she will say Sam.
- A line said in a call can reach the worker straight away: the call mind has a `tell_worker` tool, and this morning Maya used it mid-call. That is the path for "Version B. Ship it."
- Typed lines (`say`) use the voice library's own typed-input path, which interrupts and answers aloud like speech. Read in the installed library and wired in the hook; not yet tried on a real call.

## Checked since (11:35 to 11:57)

- In the video session's real takes: `startCall`, `summon`, `pin`, `say` and the Approve button all worked on real calls, and the Desks view was recorded with the four live desktops in the Mac window.
- The shell test (`npx tsx scripts/smoke/shell.ts`) passes on the new build, with "Show desks" in the tray above "Summon meeting…".
- Found in the takes and logged in `issues.md`: I-19 (call mind denied finished work while an approval was pending: fixed in the prompt, checked offline, takes effect at the next office start), I-20 (two approvals for one push: open), I-21 (activity lines read "Ran a command": open).

## Still to do

1. Hear the I-19 fix on a live call (needs the office restarted).
2. Desks view at 2560 x 1600 with four streams: not measured for smoothness.
