# Live demo runbook: "launch day" (build session, 15 Nov, edit in place)

Four AI employees ship a fixed checkout and a launch page together, on four real desktops, with nobody telling them the steps. The audience watches the Desks view: four live desktops, a status line on each, and a feed of every message the team sends. Local only: nothing here has been pushed.

## What the audience sees

1. Four desks come alive. Each person reads the brief ("you own this together, work it out between you") and starts on their own part: Maya fixes a real bug in the shop's code, Jonas reads competitors' pricing pages in Firefox, Priya writes the copy, Ines designs the page.
2. They talk to each other without being told to. The feed on the right fills with real hand-offs: facts, copy, a design spec, the built page going out for review, fixes coming back, sign-offs. They also tell "Sam" what they decided, unprompted.
3. A desk reads "Waiting for Priya" when someone really is waiting, and carries on by itself when the message arrives.
4. About two minutes in, Sam changes the plan: a launch-week offer (LAUNCH15) and a new "How the fix works" section. The team sorts out between them who does what, and everything is signed off again.
5. Maya's desk turns amber: "Needs you · Push fix/checkout-discount". You click her desk and press Approve. She pushes and reports done.

## Before you go on (about five minutes)

1. Quit heavy apps and plug in power. Four desktops take about 8 GB.
2. Start the app on the demo team (separate data; your own team is untouched):

```bash
npm run demo:app
```

3. In a second terminal, hire the team on fresh desktops (about one to two minutes) and stop there:

```bash
npm run demo -- --reset --prepare
```

4. In the app press Cmd+D for the Desks view. `M` shows or hides the message feed, `F` the faces, `Esc` goes back.

## On stage

```bash
npm run demo -- --go
```

The terminal narrates everything with times (`[+1:24] Priya -> Maya: …`), so you can also read from it. When Maya's desk turns amber, click it and press Approve. That is the only thing you have to do.

One command for everything (hire and run) if you have the time on stage: `npm run demo -- --reset`. The two-minute scripted version: `npm run demo -- --reset --quick`.

## What to say

- "Nobody gave them steps. Each one owns a part of the launch, and they work out the hand-offs between themselves."
- "That feed is every message they send: to each other and to me. I did not ask for any of those updates."
- "Jonas is waiting for Priya. He is not stuck: he will pick up the moment her message lands."
- "Now I change the plan in the middle." (the change request goes out by itself at about two minutes) "Watch them sort out who does what."
- "Nothing is published until I say so." (press Approve)

## Measured (real desktops, Sonnet 5.5, fresh team each time)

| Run | Mode | Kickoff to Maya's push request | Messages between desks | Messages to Sam | Needed the manager before the end | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | quick (scripted steps) | 2.0 min | 8 | few | no | $0.62 |
| 2 | team brief, change at 1:30 | 8.1 min (4 of them a stall, since fixed) | 42 | 28 | no | $1.25 |
| 3 | team brief, change at 2:00 | stopped at 4 min | 60 | | yes: a question and a delete approval (both since fixed) | |
| 4 | team brief, change at 2:00 | 4.8 min | 52 | 24 | no | $2.13 |
| 5 | team brief, on-screen mode, change at 2:41 | **7.6 min** | 45 | 29 | no (Maya asked one question and carried on without the answer) | $2.51 |

## If something needs you during the run

- **A desk turns amber before the end.** Someone asked you something or wants an approval. Click the desk, answer in a line or press Approve. The script prints these loudly (`!!!`).
- **A desk says "Stuck".** Click it and press Try again.
- **Someone waits a long time.** After two and a half minutes without a reply they are told to carry on or ask again, by the office, without you.
- **Start over.** `npm run demo -- --reset` gives a fresh team and clean desktops in about two minutes.

## How it works, in one paragraph each

- **Agency.** The brief gives a goal and ownership, not steps. Every employee's standing instructions have an Initiative section (pick up the next useful thing, offer teammates what they will need, flag problems with a concrete fix, keep the manager posted at real milestones) and a way to wait for a teammate (`wait_for_colleague`) instead of stopping.
- **On-screen mode** (`ON_SCREEN=1`, set by `npm run demo:app`). Web reading goes through Firefox on the desktop, and a small "Work log" window on every desktop shows each command as it runs. The work is the same; it happens where people can see it.
- **Safety stays on.** Publishing still needs your approval. One card per step.

## Known limits

- You approve the push yourself. The build session's own safety rules do not let it answer an employee's approval, which is right.
- Rebuilding while the app runs leaves a blank window until the app is restarted.
- Runs differ: the team decides its own hand-offs, so times and message counts move by a minute or two.
