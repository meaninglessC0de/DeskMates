# L: readable progress (activity sentences and a ticking plan)

Files changed (mine only): `src/office/runtime/activityMapper.ts`, `activityMapper.test.ts`, `claudeRuntime.ts`, `claudeRuntime.test.ts`. Nothing committed or pushed. `npm run typecheck` and `npx vitest run src/office/runtime` pass (178 tests).

## 1. Activity sentences (I-21)

`describeCommand(command)` (exported from `activityMapper.ts`) names the purpose of a shell command. Heredoc bodies and quoted text are masked first (so `echo "git push"` or a heredoc that mentions `git push` never counts), `bash -c '...'` is unwrapped, then the command is split on `&&  ||  ;  |` and newlines. Each part is scored and the highest score wins, so tests and git beat `cd` and `ls`. No match gives the old "Ran a command".

| Command pattern | Sentence | Score |
| --- | --- | --- |
| `npm test`, `npm run test*`, `npx vitest`, `pytest`, `python -m pytest/unittest`, `node --test`, `go/cargo test`, `make test`, `jest`, `mocha` | Ran the tests | 100 |
| `git commit` | Committed the change | 95 |
| `git push` | Pushed the branch | 94 |
| `git checkout -b`, `git switch -c`, `git branch <name>` | Started a branch | 92 |
| `npm start`, `npm run dev/serve`, `python -m http.server`, vite, uvicorn, flask run, `node server.js &` | Started a local server | 90 |
| `npm/pip/apt/brew/... install <name>` | Installed <name> (or "Installed dependencies") | 85 |
| `npm run build`, `make`, `tsc`, `cargo build` | Built the project | 80 |
| `eslint`, `prettier`, `ruff`, `npm run lint`, `tsc --noEmit` | Checked the code style / the types | 78 |
| `xfce4-terminal`, `firefox`, ... started from the shell | Opened <App> | 75 |
| `python3 f.py`, `node f.js`, `bash f.sh`, `./f.sh`, `npx tsx f.ts` | Ran <f> | 70 |
| `python3 - <<EOF`, `python3 -c`, `node -e` | Ran a Python snippet / Ran a script | 66 |
| `npm run <other>` | Ran the <other> script | 66 |
| `curl`, `wget` | Fetched a page | 60 |
| `git init` / `git clone` / `git pull` | Set up a repository / Cloned a repository / Pulled the latest changes | 60 |
| `sed -i ... f`, `tee f`, `> f`, `>> f`, `cat > f <<EOF` | Edited <f> / Wrote <f> | 58 |
| `git status/diff/log/show/remote` | Checked the repository | 56 |
| `git add` | Staged the changes | 54 |
| other git | Ran git <sub> | 50 |
| `rm`, `rmdir` | Removed files | 42 |
| `mkdir`, `cp`, `mv`, `touch`, `chmod`, `ln`, `tar`, `zip` | Organised files | 40 |
| `kill`, `pkill` | Stopped a process | 40 |
| `ls`, `cat`, `grep`, `find`, `head`, `tail`, `tree`, `wc`, `diff`, `sed` (read) | Looked through the files | 30 |
| `ps`, `lsof`, `ss` | Checked running processes | 25 |
| `sleep` | Waited a moment | 10 |
| `cd`, `echo`, `export`, anything else | Ran a command | fallback |

Other tools:
- File tools use the base name only: `write_file` "Wrote <f>" (was "Saved"), `edit_file` "Edited <f>", `read_file` "Read <f>" (it had no step before). Failed forms: "Couldn't write/edit/read <f>".
- Desktop: `launch_app` unchanged ("Opened example.com", "Opened Firefox") but a `launch_path` that carries a whole command line now keeps the program only (real run produced the junk "Opened Shop hold e "python3 m unittest…"; now "Opened Xfce4 terminal"). `kill_app` "Closed <App>". `type_text` that ends with Enter is described like a shell command (so a test run typed into a visible terminal reads "Ran the tests"); other typing still makes no step.
- Sentences are clipped to 40 characters, never contain a path or the command text, secrets in a command never reach the sentence (checked in tests).
- The supervisor collapses identical consecutive sentences in a task into one step, so two "Looked through the files" in a row show once.

## 2. Plan ticking (claudeRuntime.ts)

Mechanism: Agent SDK 0.3.325 hooks, passed in `Options.hooks` (verified in `sdk.d.ts`: `PostToolUseHookSpecificOutput.additionalContext`, `PreToolUseHookSpecificOutput.permissionDecision`). Confirmed on a real session: the CLI records the text as a `hook_additional_context` attachment next to the tool result, and Sonnet answers it with a TodoWrite on its next action.

Why this over the inbox (`deliver({kind:'office'})`, which the repeat watchdog uses): a hook rides along with the tool result the model is already reading, starts no turn of its own, adds no extra `<office>` user message, and cannot disturb turn bookkeeping (`working`, `spoke`, `unacked`).

- `PlanNudge` class (exported, unit-tested): counts tool calls since the last TodoWrite. TodoWrite resets the count and stores the plan. A call that usually finishes a step (activity sentence starting "Ran the tests", "Committed", "Pushed", "Started a branch", "Wrote", "Edited", "Opened") counts double.
- At six (weighted) calls the PostToolUse hook returns: `Office: tick the plan steps you have finished before you carry on. Your plan has not changed for 6 actions and still shows "<open step>" as open. Call TodoWrite now with every finished step marked completed and the next one in progress.` The count then restarts, so a plan that stays stale gets one reminder per six actions, never one per call.
- Never when there is no plan, an empty plan, or every step is ticked. Reset at the end of every turn.
- Guard on `finish_task` (a PreToolUse hook matched to `mcp__office__finish_task`): if the plan still has open steps it is sent back once ("tick the plan, then call finish_task again"), so the plan is complete before the report. Re-armed by any plan write. This is the only slightly invasive part; to drop it, delete `planFinishHook` and its entry in `hooks`.
- Debug: nothing is logged; the reminders can be seen as `hook_additional_context` lines in the session transcript under `data-*/employees/*/.claude/projects/`.

## 3. Real desktop check (office on 4338, `DATA_DIR=data-c2`, Sonnet 5.5, one desktop)

Setup: Databricks sync off, MLflow/LiveKit empty (calls off), `GET /api/health` ok. Free plus inactive memory 11 to 15 GB before each hire. Maya hired through the API, seeded with the shop (50 tests, 8 failing), five-step task: fix the checkout bug, run the tests in a terminal on screen, commit on `fix/checkout-discount`, CHANGELOG entry and commit, report. Polled the thread every 4 s. Times are seconds after the hire's task-sent mark; plan string: `>` in progress, `x` done, `.` pending.

Run 3 (final code):

```
 18s task sent
 22s PLAN [>....]  (5 steps written by TodoWrite)
 22s Checked the repository
 26s Ran the tests
 30s Looked through the files
 34s PLAN [x>...]  (step 1 ticked after the first reminder, 6 actions in)
 34s Opened Xfce4 terminal   -> 42s "Couldn't open Xfce4 terminal" (D-Bus launch not confirmed in 8 s, desktop tool)
 46s Wrote term.log          (shell: xfce4-terminal started in the background, output to a log)
 50s Committed the change
 54s PLAN [xxxxx]  (second reminder, one TodoWrite ticks steps 2 to 5, then finish_task)
 58s task done, $0.080
```

Transcript confirms: reminder 1 after action 7, answered by TodoWrite (step 1) at once; reminder 2 after action 12, answered by TodoWrite ticking all remaining steps at action 14, then finish_task. The finish guard did not fire (plan already ticked). "Ran a command" lines: 0 (6 sentences). One sentence is slightly off: "Wrote term.log" for a command whose purpose was opening the terminal (redirect of the terminal's log); minor.

Earlier runs on the same task: run 1 (before the reminder was strengthened, text without the open step name) plan sat at `[>....]` from 22 s to 54 s then `[xxxxx]`; "Ran a command" appeared 0 times; run 2 (new reminder, no milestone weight) `[x>...]` at 29 s then `[xxxxx]` at 41 s with a single mid-task tick.

Pass criteria: at least three steps ticked before the task was reported done: yes (all five, in two writes, both before `finish_task`); "Ran a command" at most twice: yes (0 in all three runs). Honest limit: Sonnet finishes this task in about 40 seconds, so the ticks come in two clusters (one at about 16 s in, four near the end), not one per step. A longer task would show more ticks, because the reminder repeats every six actions.

## 4. Could not verify

- A long task (several minutes) with the reminder repeating more than twice, and the finish guard actually firing on a real session (covered by unit tests only).
- Haiku behaviour, the four-employee load, and the app UI showing the new sentences.
- `type_text` into a terminal producing "Ran the tests" (unit-tested; Maya used the shell and `launch_app` instead).
- The other agent's prompt sentence about ticking was not in place when I ran; results above are from the runtime reminder alone.

## 5. Spend and cleanup

Three Maya runs on Sonnet, about $0.17 each including the hello turn: about $0.5 total (under $1.50). Maya removed through the API (204, no employees left), office on 4338 stopped, nothing listening. Ports 4317, 4318, 4337, 4339, 4348 and other Spaces untouched. `data-c2/` remains on disk and can be deleted.
