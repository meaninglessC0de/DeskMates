# Brief from the video session to the build session (15 Nov)

From: "Deskmates demo video production" session (`local_354c329a-05eb-48e9-a811-77b10e6b184a`). To: the build orchestrator ("Agent Manager hackathon implementation plan").

Read `docs/hackathon/README.md` first; front end must use Astryx; write findings back to `docs/hackathon/`. Any sub-agent you brief gets the same line.

## Why

The user asked for the 2-minute demo video to be built from Recordly screen recordings of the live app, following their one-continuous-shot script. The corrected script is `docs/hackathon/demo-video-script.md` (read it first: it renames the human to Sam, uses Maya, Priya, Jonas and Ines seated by desk, and swaps the fake "double-booked customer call" for real features). The user asked for two things from you, and said the two sessions should message each other to resolve everything:

1. **A screen that shows a grid of the live desktops working together** (the 2x2 "world" the camera moves over).
2. **A simple end-to-end pipeline of agents doing real long-horizon tasks autonomously**, so every desk in the video shows real work.

Split: you own all app code and the pipeline. I own the script, Recordly, the edit, voices, music and subtitles. I will not edit `src/` or `scripts/` (except my own `video/` folder at the repo root, gitignored media).

## 1. Desks view (new screen, Astryx only, doctor clean)

- A 2x2 grid of every employee's **live desktop**, seated by desk (tint order, the same rule as the meeting, D-041): desk 1 Maya top-left, 2 Priya top-right, 3 Jonas bottom-left, 4 Ines bottom-right. Fewer than four: the empty desk is a quiet "Hire" tile, as on first run.
- Fills the window: no sidebar or top bar while it is open (one quiet way back, e.g. Esc and a small back control), gap = the mark gap. It is what the camera zooms around, so the tiles should be as large as the window allows and the desktops 16:10 and sharp.
- On each tile: a label pill bottom-left, large enough to read when the whole grid is on screen: "Desk 1 · Maya". A face in the top-right corner: a rounded face window with the name and the tint ring (the still portrait is fine; it is the same object that later flies into the meeting).
- **Faces toggle**: key `F` (and a programmatic hook) shows or hides the faces; showing pops them in, staggered by desk (about 150 ms apart). The video shows the desks without faces first, then "every agent gets a face".
- Click a tile: opens that person's conversation with the desktop panel.
- Opened from: an icon in the top bar, a new tray item **"Show desks"** (above "Summon meeting…", shortcut of your choice), and the hook below.
- Four live streams at once must stay smooth on this Mac at a 2560 x 1600 window; frames fallback if not.

## 2. End-to-end demo pipeline (`scripts/demo/`, real mode, Sonnet 5.5)

One command that sets up the story and lets the agents work by themselves. Real desktops, real model, no scripted results.

- Clean start; set the manager's name to **Sam** if the app has such a setting (agents should address Sam); hire Maya, Priya, Jonas, Ines (cast presets) in that order; wait for the four hellos.
- Desk prep: a wallpaper in each person's tint (nice to have); on Maya's desktop a small shop web app in `~/work/shop` (no network install needed) with a **real checkout bug** (for example the discount applied after tax) and a test suite of about 40 to 50 tests, several failing because of the bug; a git repo with a local bare remote so `git push` is real and gated by approval.
- Tasks, sent as Sam's messages in natural words:
  - **Maya:** find and fix the checkout total bug in `~/work/shop`, run the tests and leave the passing run visible in a terminal, commit on `fix/checkout-discount`, then publish with `git push`. **The push approval must stay pending** until Sam approves it during the recording.
  - **Priya:** draft the launch post for the new checkout and keep it open on screen; ask Jonas for one line about competitors to use (a real teammate message each way); tell Sam when it is ready ("The launch post is ready. Take a look?" or her own words).
  - **Jonas:** compare three real competitors' pricing (public pages, no login; pick a category that fits the shop), make a one-page chart and keep it open in Firefox.
  - **Ines:** design two versions of the mobile onboarding screen as phone mockups side by side in Firefox, labelled "Version A" and "Version B", and keep them open.
- Every final state stays open and visible on the desktop (the grid and the meeting spotlight show them).
- Prints a short report: artifact paths, timings, cost. Run it once yourself end to end and tell me how long each task takes.

## 3. Calls and the meeting (check, fix what fails)

- One-to-one call with Maya: her greeting mentions her finished work in one line (target: "Morning, Sam! I fixed the checkout bug.").
- Summon all four: the 2x2 grid seated as the logo.
- Sam's lines are **typed** into the meeting (no microphone in the recording): "Okay team, standup!", "Maya, show me the fix?", "Jonas?", "Version B. Ship it." Each goes to the named person; answers are one or two sentences, grounded in their real work.
- "Version B. Ship it." reaches Ines's worker and she marks Version B **on her own desktop** (green outline and a "Ship it" label) within about a minute.
- Pinning a person's desktop (spotlight) works from the keyboard or a hook, so I can switch Maya, Jonas, Ines on cue.

## 4. Driving the app while Recordly records

- Start the Electron app with Chrome DevTools Protocol on a fixed port (for example `DESKMATES_CDP_PORT=9333` adds `--remote-debugging-port`), so I can drive the renderer with Playwright over CDP.
- A small hook object in the renderer, e.g. `window.__deskmatesDemo` with `openDesks()`, `setFaces(bool)`, `openThread(id)`, `startCall(id)`, `summon(ids)`, `pin(id)`, `say(text)`, `endCall()`, `openTeam()`, `askTeam(q)`, `approve(approvalId)`. If an office HTTP route already does it, just tell me the route.
- Real mouse moves for the visible clicks (tray, "Show desks", Approve) I will do with real cursor events so Recordly sees them.

## 5. How we work together

- One app instance at a time on this Mac (about 2 GB per desktop; four desktops plus Recordly). You build and test; when the pipeline is ready, tell me, and we agree who runs it for the recording.
- Message me with `SendMessage` to `local_354c329a-05eb-48e9-a811-77b10e6b184a` when something lands, when you need a decision, or if anything here is unwise or infeasible (say so and propose the nearest real thing).
- Leave `docs/hackathon/build/V-handback.md` (what landed, how to run it, hooks, known issues) and log decisions in `decisions.md`.
- Priority order if time is short: pipeline (2) and Desks view (1) first, then hooks (4), then the call and meeting checks (3).
