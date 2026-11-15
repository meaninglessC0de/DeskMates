# L-scenario hand-back: `scripts/demo/live.ts` ("launch day")

## Command and flags

    npx tsx scripts/demo/live.ts [--reset | --reuse] [--stagger-s N] [--timeout-min N] [--auto-approve-others]

Hidden test flags: `--people maya,ines` (subset; task texts adapt to who is present), `--print-tasks`. Environment as `run.ts` (`DEMO_OFFICE_URL` default 4317, `DEMO_MIN_FREE_GB`). **Always set `DEMO_OFFICE_URL` when testing: the script hires and (with `--reset`) removes people.** Details and what the audience sees: README section "Live demo".

- Default: fresh start; stops with a clear message if people exist. `--reset` removes everyone through the API and waits until the list is empty. `--reuse` keeps matches by first name, tidies each (wmctrl closes only application windows, then pkill of firefox/terminal/editors, `~/work` and loose files moved to `~/work-old-<n>`), requires state idle or stuck, re-seeds Maya. Memory check before each hire (4 GB, `vm_stat` free + inactive).
- Hire order Maya, Priya, Jonas, Ines; tasks sent in order Jonas, Ines, Priya, Maya with `--stagger-s` between (the narration loop already runs while they go out).
- Narration (poll every 5 s, a line only on change): state + detail, plan done/total with the in-progress step, each new activity step, messages to Sam, `[hh:mm:ss] A -> B: text` for teammate messages (deduplicated across both threads), approvals when raised, `!!!` lines for questions, non-push approvals, stuck/offline.
- Finished: Jonas, Priya, Ines have a `done` message; Maya has the push approval pending AND (checked in her Space) branch with a commit, `site/index.html` present and committed, clean tree, tests pass, terminal open; AND messages Jonas>Priya, Priya>Maya, Ines>Maya, Maya>Ines, Ines>Maya after the Maya>Ines one. Maya dropping back out of that state prints a `!!!` line.
- Report: table, message log, approval id, cost, minutes; `shots/demo/live-last-run.json`; frames `shots/demo/live/<name>.jpg`. Exit 0 / 2 timeout / 1 error.
- `run.ts` is unchanged in behaviour: shared code moved to `scripts/demo/lib.ts` (api, hire, seed, frames, Space exec); `--bogus` and the preflight error path re-checked, typecheck clean.

## The four task texts (from Sam, full set)

### Jonas
Hi Jonas, Sam here. Today is launch day: we ship our fixed checkout together with a new launch page, and the team needs your research first. The desktops do not share files, so anything you send a colleague must be written out in the message itself. Please look at how three hosted shop builders (Shopify, Squarespace and BigCommerce) handle pricing and discount codes on their public pages, public pages only and no logins. As soon as you have the three most useful facts, send them to Priya in a message: she is writing the launch page copy and is waiting for them. After that, make a one-page comparison chart as a single HTML file (inline CSS or SVG only, nothing loaded from the network) and keep it open in Firefox on screen. Tell me when you are done.

### Ines
Hi Ines, Sam here. Today is launch day: we ship our fixed checkout with a new launch page, and I need you to design that page. The desktops do not share files, so anything you send a colleague must be written out in the message itself, not left as a file path. Please make a short style guide (three colours as hex codes, a typeface and a spacing scale) and a mockup of the page as an HTML page, and keep the mockup open in Firefox. Once the design is settled, send Maya a compact build spec in a message: the colours, fonts and layout in about five lines, because she builds the page. Later Maya will send you the HTML of the page she built, for your review. Wait for it, save it to a file on your own desktop and open it in Firefox beside your mockup. Then reply to Maya with exactly two concrete fixes, or just "ship it" if it needs none. Keep your mockup open on screen at the end. Tell me when you are done.

### Priya
Hi Priya, Sam here. Today is launch day: we ship our fixed checkout with a new launch page. Please write the launch page copy: a headline, a one-sentence subhead, three benefit lines and a short pricing note. The desktops do not share files, so anything you send a colleague must be written out in the message itself. Jonas is looking at how Shopify, Squarespace and BigCommerce handle pricing and discount codes and will send you the three most useful facts. Wait for them and use one of them in the pricing note. Keep the copy open on screen. When it is final, send the copy to Maya in a message, because she builds the page from it. After that, write the launch post (about 120 words) that announces the fixed checkout and the new page, and keep it open on screen too. Tell me when you are done.

### Maya
Hi Maya, Sam here. Today is launch day: we ship our fixed checkout together with a new launch page, and you are the one who ships it. The desktops do not share files, so what your colleagues send you arrives as message text, and anything you send them must be written out in the message itself. First, the checkout total in our shop looks wrong when a customer uses a discount code. The code is in ~/work/shop. Please find the bug and fix it, then open a terminal window on your desktop, run the tests in it and leave that window open showing the passing run. Commit the fix on a new branch called fix/checkout-discount, as its own step. Second, build the launch page as a single HTML file with inline CSS at ~/work/shop/site/index.html. The words come from Priya and the colours, fonts and layout from Ines: both will send you a message, so if either one has not arrived when you need it, wait for it. Open the finished page in Firefox and keep it open. Then send the full HTML of the page to Ines in a message and ask her to review it. Wait for her reply, which will name two fixes, apply them and reload the page. Last, commit the page on the same branch and publish the branch with git push (I will approve the push myself). Keep the terminal and the page open on screen at the end, and tell me when you are done.

(With a subset, the sentences about absent colleagues are replaced: for example Maya without Priya writes the words herself.)

## What I verified, and on what

Own office on port 4339 (`DATA_DIR=data-a`, `claude-haiku-5-5`, Databricks and calls off), two real desktops at most, memory about 14 GB free throughout.

- `npm run typecheck:area -- scripts` clean. (`npm run typecheck` shows 3 errors in `src/office/runtime/toolGroups.test.ts`, `riskyShellPatterns`, another agent's file.)
- Flag errors: unknown flag, `--reset --reuse`, bad `--stagger-s`, bad `--timeout-min`, unknown name in `--people`, empty `--people`, office not reachable, people exist without a flag: all stop with a clear message.
- Fresh start with `--people maya,ines` (twice, one with `--stagger-s 10`): hire, hello, seed verified (50 tests, 8 failing), tasks, narration, teammate messages printed as they happen (Ines>Maya spec, Maya>Ines page, Ines>Maya review), Maya's push approval left pending, finish detected in about 1.5 to 1.7 min (Haiku), frames saved. I looked at Maya's and Ines's frames: both show Firefox with the built page / the mockup.
- `--reset`: removed both, list empty after 1 s, hired fresh, full run again.
- `--reuse` tidy: found and fixed two bugs of mine on the real Space. (1) `pkill -f "http.server"` killed the exec shell itself (use `[h]ttp.server`). (2) Closing every `wmctrl` window also closed the xfce panel and desktop and brought up a "Log out" dialog; now only Firefox/terminal/editor windows are closed. After the fix, with Firefox (two windows) and a terminal open, the tidy closed them, kept the panel, and moved `~/work` to `~/work-old-1`, `-2`.
- Two stale-state paths checked: a reused person with a leftover pending approval is `needs_you` and the script stops with a clear message (after 30 s); after I denied the approval she was `stuck` and tidy accepted her.

## What I saw when someone had to wait

Nobody was marked failed and nothing needed the nudge. Ines waited for Maya ("Waiting for Maya" activity step) for 1.5 to 2 minutes at a time while Maya built, and Maya waited for Ines's review; both resumed on their own when the message arrived. `wait_for_colleague` had not landed in `src/office` yet, so they waited through their normal instructions; this was a two-person run, so waits were short. A four-person run, where Maya waits on Priya after Jonas's research, has longer waits: not seen.

## Findings worth knowing

1. **`--reuse` does not give a clean rerun of the same story.** A reused employee keeps its session: Ines answered "this is the same brief I already finished" and did not redo the work; Maya re-did the fix but started from "repo was reset" and did not wait for Ines (no teammate messages, so the run timed out with the three "missing" message lines, as designed). For a presentation, use `--reset`. `--reuse` is fine for rehearsing with new people added.
2. Employees do not know desktops are separate: Ines first sent "mockup at ~/work/launch/mockup.html" and Maya replied she could not open it. The task texts now say desktops share no files and everything must be in the message text; in the last run Ines's spec was self-contained.
3. State detail of a working employee shows the start of Sam's message ("Hi Ines, Sam here. Today is launch day:...") until a step sets it; cosmetic, in the office.
4. Waiting employees sometimes still have a half-finished final report: Maya reports a status to Sam while waiting for Ines ("Maya to Sam: ... waiting on Ines's review"); harmless.
5. `Min` for Maya is the time to push-approval pending, not to done.

## Not verified

- The real four-person run (Priya and Jonas never hired by me; Jonas>Priya and Priya>Maya, the web research, the comparison chart, the launch post: not exercised).
- The nudge / "Stopped making progress" failure path, `--auto-approve-others` (code path only), `--stagger-s` with four people, the memory-stop path (memory was never low), a non-push approval or question printing.
- The finish check for Priya and Jonas is only "reported done" plus the message conditions; whether they actually keep their artifacts open is for the frames to show.

## Spend and cleanup

About $0.2 in total by my estimate (nine short Haiku runs of one to two desktops; the team report resets when people are removed, so I have no exact figure). My office on 4339 is stopped, both employees removed (204), nothing of mine listening. `data-a/` remains on disk (gitignored). Ports 4317, 4318, 4337, 4338, 4348 never touched. Nothing committed or pushed.
