# Morning report (orchestrator, 15 November 2026)

Read this first. Everything here was checked by running it, unless it says otherwise.

## Where it stands

**Deskmates works end to end in real mode.** At 02:00 I ran the real app through its own interface, with Sonnet 5.5, real Cua desktops, LiveKit, Synthesia and Databricks:

| Step | Result |
| --- | --- |
| Hire Maya (web developer) from the first-run screen | Row appears at once, desktop up in about 6 s, she says hello by herself in about 14 s |
| "Make a one-page site about our team and show it to me in the browser" | Built on her desktop, opened in Firefox, reported done. The live desktop panel streams her real screen |
| "Make the heading green, then publish with git push" | An approval card "Publish with git push" with the exact command. Approved: pushed, and she verified it |
| Video call with Maya | Her face (Synthesia) beside her live desktop, 3.3 s after the call started; greeting spoken; "Call with Maya · 1 min" in the thread |
| Hire Priya (marketer); "Ask Priya for a tagline and put it under the heading" | Maya asked Priya, Priya answered from her own desktop, the tagline is on the page, pushed after approval |
| Summon meeting with both | Both tiles, one live face at a time; "Meeting · 1 min · Maya, Priya" in the thread |
| Team view | Time, tasks and cost per person from Databricks ("Synced with Databricks · now"), and the question "What did Maya work on today, and what did it cost?" answered with a table |
| Stop and restart the office in the middle | Conversation, team and desktops all came back |

Automated checks on the final code: 350 office tests and 79 renderer tests pass; the Astryx purity check finds nothing; the UI test (`npx tsx scripts/e2e/ui.ts`, a browser clicking through the app against scripted employees) passes 11 of 11; the real suite result is at the end of this file.

## How to run it

```bash
npm run build && npm start
```

That is the Mac app (window, menu bar, notifications); it starts everything else itself. Two employees from my test run (Maya and Priya) are still there with their history. For a clean start for the video, remove both from their "..." menu.

## What only you can check (ten minutes, before recording)

1. **Speak on a call.** I could not use a microphone. The spoken path was tested by a script with a recorded voice (answers in 2 to 3.5 s), not by a person. Check that she hears you, and that each person's voice suits their face in a meeting.
2. **The Mac shell.** Menu-bar icon in light and dark, the notification when someone needs you, the first-time prompts for microphone and notifications.
3. **The Figma file** (below): one minute of tidying.

## The Figma file

https://www.figma.com/design/YODWHUmMnsyE4EdtZUF7X4 (in your drafts, "Suhaan M's team").

- **Cover** and **Brand and foundations**: done and checked in Figma.
- **Screens**: a board of all 18 screens (light and dark), each one the app's real markup as editable layers with the right font. Figma's free plan limits how many automated calls can be made, and the limit was reached while the screens were going in. So the page also holds nine loose single screens from before the limit, three of which (the hire dialogs) are missing their dialog. **Please delete those nine loose 1440 x 900 frames named "Deskmates" and keep the big board.** I could not look at the board inside Figma after the limit, only at the same file rendered here (`shots/figma/board.png`), so give it a glance.
- The free plan also allows only three pages, hence Cover, Screens, Brand.
- Everything is reproducible: `npx tsx scripts/figma-export.ts`, `node scripts/figma-board.mjs`, `node scripts/figma-pages.mjs`.

## Databricks

- New, clean schema `workspace.deskmates` (the old `workspace.agent_manager` holds only test rows; drop it whenever you like).
- I created the Genie space ("Deskmates team") by API and put its id in `.env.local`, so the question box works. You do not need to create anything.
- MLflow traces: "Open traces" in the Team view.
- The tables currently hold my test run (Maya and Priya, about 4 tasks). They make the Team view look alive; if you want them empty for the video, say so and I will clear them.

## The video

`docs/hackathon/demo-shot-list.md`: nine shots, two and a half minutes, with what to type and say, and a fallback for each. Every shot was run tonight except speaking into the microphone.

## What changed overnight that you should know

- **Name and logo**: Deskmates everywhere; the mark is in `resources/brand/`.
- **Two design rounds** (Opus agents plus an independent Opus critic): four desks on first run, the brand loader, each person's colour in the Team view, the calling moment, a meeting of four seated as the logo.
- **Every preset now asks before big steps** (the web developer used to work independently), so the approval moment happens without setup.
- **Real runs found 17 issues** (`build/issues.md`); all are fixed except the leftovers listed under rough edges below. The ones worth knowing: a test script was deleting the running app's desktops; the office could fail to start after a quick restart; calls failed if another program held port 8081.

## Known rough edges (not fixed)

- On Sonnet the plan sometimes is written once and not ticked step by step; it is now completed when the task is reported done.
- The 512 px avatar video is slightly soft in the largest call layout.
- The Team report from Databricks counts task cost only; small chat-only turns are in the local total but not in the warehouse figure (a few cents).
- Lending your real screen to an employee is built up to the grant (banner, countdown, take it back) against a stand-in; driving your real Mac needs the Cua host driver installed and two permission clicks, and was not attempted.
- No packaged `.app`; it runs with `npm start`.

## Spend

My estimate from the scripts' own counts is about $4 of the $50 Anthropic cap (tests on Haiku, the live run and confirmations on Sonnet); the Anthropic console has the exact figure. Databricks: a few minutes of the serverless warehouse. Synthesia: a few minutes of avatar time (the call checks earlier in the night plus my two one-minute calls); I do not have the exact number. Nothing was bought or signed up for.

## Final real suite

REAL_SUITE_RESULT
