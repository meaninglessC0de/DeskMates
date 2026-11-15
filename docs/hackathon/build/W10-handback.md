# W10 hand-back: integration tests (real.ts and soak.ts)

Status: both scripts run to the end and print their tables. `ui.ts` was not written (told to wait). Nothing of mine is running (`lsof -ti:4330` empty) and no Space of mine remains (SDK list: only `local:emp-01m7e6zhnn28vjcdc4x10wtwd7`, which belongs to another agent and was there before I started).

## Files
`scripts/e2e/real.ts`, `scripts/e2e/soak.ts`, `scripts/e2e/lib/harness.ts` (everything shared; builds on `scripts/smoke/runtime-lib.ts`). `npm run typecheck:area -- scripts` is clean. Evidence: `shots/e2e/` (gitignored). Issues: `docs/hackathon/build/issues.md` (I-1 to I-9).

## How to run
```
npx tsx scripts/e2e/real.ts [--only S2,S3] [--keep] [--model claude-haiku-5-5] [--budget 3] [--repeat 1] [--port 4330] [--data data-w10]
npx tsx scripts/e2e/soak.ts [--minutes 30] [--budget 3] [--min-gb 6] [--model ...] [--port 4330] [--data data-w10] [--keep] [--force]
```
- real.ts starts its own office (`DESKTOPS=cua`, `DATABRICKS_SYNC=off`, `MAX_TEAM=4`, clean `data-w10`), hires on demand (Maya = web_developer, Priya = marketer, Jonas = researcher; matched by role, never by surname), prints `PASS`/`FAIL` per scenario with evidence, seconds, cost here and so far, saves evidence to `shots/e2e/<S>/` (`frame.jpg`, `thread.json`; on a failure also `fail-last-events.json` (last 20 events), `fail-office-log.txt`, `fail-thread-<name>.json`, `fail-frame-<name>.jpg`), removes every employee, stops office, verifies no Space of ours is left and the port is free, exits 1 on any failure. Per-scenario hard timeouts (5 min; S2+S3 8 min; S4 and S9 7 min; S10 6 min). `--budget` aborts and skips the rest when summed cost passes it. `--repeat N` runs the chosen list N times (flakiness). S2 and S3 are one driver (S3 steers S2), so `--only S3` runs both and prints S3.
- Direct checks bypass the product: `Run.sh()` runs a command in the employee's Space through the SDK (file contents, git repo state, `wmctrl` window titles, `pgrep`), `sdkSpaceIds()` lists Spaces, `employeeProcs()` maps `claude` processes to employees by working folder.
- soak.ts: three employees (web developer builds a multi-page site, researcher writes a note with source URLs, data analyst cleans a messy CSV with a script); when one goes idle and time remains he gets a follow-up task; approvals auto-approve, stuck employees get "Try again" (max 3). Every minute: `vm_stat` free and inactive, VM resident memory (Virtualization.framework process plus the Lima host agent), each employee's state and `claude` process RSS, cost. Stops early under `--min-gb` free+inactive (default 6), refuses to start under it unless `--force`. Verdict checks: ran the full time, nobody offline or stuck at the end, files produced.

## Result table (last full run, Haiku 5.5, run-full.log; $0.012 for the whole run, 8.9 min)
| # | Result | Time | Evidence |
| --- | --- | --- | --- |
| S1 | PASS | 13 s | hire answered in 3 ms as "Starting desktop"; desktop up 5.7 s; first message 8 to 9 s; frame is the XFCE desktop (panel, dock) `shots/e2e/S1/frame.jpg` |
| S2 | FAIL | 14 s | everything but the plan: done bubble, clean activity lines, `index.html` in `~/work/site`, window "Our Team - Firefox" with `file:///home/cua/work/site/index.html`, cost and active time on the task. No plan ever appeared (I-4) |
| S3 | PASS | 14 s | steer delivered unseen then seen in 0.0 to 4 s, same task, final heading `#1e66f5` |
| S4 | PASS | 19 s | approval row, state `needs_you`, notify `approval`, nothing written before the answer; approved: file has the text; denied twice: nothing written, she says she stopped |
| S5 | PASS | 12 s | bare repo created inside the Space; approval "Publish team site with git push" with 0 commits; denied; still 0 commits. Maya set to `asks_big_steps` first (I-5) |
| S6 | PASS (asked a question) | 5 s | one question, `needs_you`, sorted first; reply resumed her, three taglines |
| S7 | FAIL (this run) | 270 s | Maya asked the manager before applying the tagline (I-7). Passed in 2 earlier full runs (peer steps `to`/`from` in both threads, tagline on page, no loop) |
| S8 | PASS (this run) | 21 s | stuck with reason; "Try again" cleared it. Flaky: see ratios (I-1) |
| S9 | PASS | 9 s | pause, resume, restart keeps `~/s9_keep.txt`, reset erases it, remove: 404, Space gone from the SDK list, no process or folder left |
| S10 | PASS | 156 s | SIGKILL while `sleep 45` ran; office back in 1.8 s; same Spaces; Priya idle; Maya finished and wrote `resumed`; no orphan `claude` processes |

Flakiness ratios (from all runs, product behaviour, not test bugs): S2 plan present 0/8 (not a bug, I-4); S3 pass 6/6 after fixing my own heading parser; S8 stuck 4/7 (question 2, plain done 1); S7 pass 3/4 with context from S6, 0/3 standalone (a freshly hired Priya has no brief); S1, S4, S5, S6, S9 passed every run; S10 passed every run once the trigger was fixed (it waits for the command to be running in the Space).

Sonnet 5.5 on S2+S3: same result as Haiku (plan missing, rest passes), $0.149.

## Soak (`--minutes 6`, run twice; second run in soak-run2.log, `shots/e2e/soak.json`)
```
min  free+in   free  vm MB  | maya state rss MB | jonas state rss MB | kenji state rss MB | cost
   0    11.8    1.4    7045 | idle       157 | idle       157 | idle       158 |  $0.0000
   1    11.6    1.0    7064 | working    336 | working    343 | idle       290 |  $0.0053
   3    11.5    0.8    7284 | idle       408 | working    350 | idle       335 |  $0.1403
   6    11.7    0.7    7333 | idle       417 | idle       370 | idle       394 |  $0.2072
```
VERDICT PASS both times: 6 min, free+inactive never under 11.5 GB, VM 7.0 to 7.4 GB resident (three employee desktops plus one foreign Space), employee processes 157 to 430 MB each, files produced (5 html pages; note with 6 to 13 URLs; clean.csv with 330 to 360 rows), spend $0.14 to $0.21. With Haiku the tasks take about a minute each, so follow-ups fire every 1 to 2 minutes (3 per person in 6 minutes); the plan mirror carried plans on long tasks (25, 7, 4 task events). For the long run: tasks are not ten minutes each, the follow-up chain has 4 tasks per person, after that they stay idle; give more follow-ups in `people[].tasks` if you want continuous load for 30 minutes.

## Spend
Whole session: about $0.75 (about $0.45 of Haiku across 8 full or partial real.ts runs, repeats and 2 soaks; $0.15 for the one Sonnet run), under the $6 cap.

## Things the next agent must know
- The reported cost can lag by a few seconds (I-9); the budget guard uses the larger of event costs and the team report plus costs banked from removed employees.
- Cast surnames changed (Maya Chen); scripts match first names and role keys only.
- Do not run two of my scripts, or real.ts and a smoke script, on port 4330 at once.
- After a killed run: `lsof -ti:4330`, kill it, and delete leftover `local:emp-` Spaces whose employee folder exists in `data-w10/employees/` (the cleanup does this itself when it can start office).
