# W2 hand-back: the employee runtime (the brain)

Status: done and run for real. Unit and integration tests pass with no key; all seven smoke scripts were run against the real model (`claude-haiku-5-5`) and, for `runtime-desktop`, a real Cua Space. Total real spend for the night: a few cents (see the table).

## What was built

`src/office/runtime/` (new unless marked): `fakeQuery.ts` (scripted stand-in for the SDK's `query`: same factory shape, same messages; the gate callback and the in-process tools really run), `inbox.ts`, `prompt.ts` + `systemPromptTemplate.ts` (the spec's system prompt, generated verbatim from `employee-runtime.md` section 5), `toolGroups.ts`, `gate.ts`, `activityMapper.ts`, `watchdog.ts` (repeat detector), `officeTools.ts`, `spaceTools.ts`, `sdkServers.ts`, `errors.ts` (`RuntimeUnavailable`), `claudeRuntime.ts` (replaces the stub), `testHost.ts` (test helpers), `fixtures/cua-desktop-tools.json` (the live 71-tool list), `index.ts` (one export line added).
`src/office/employees/`: `supervisor.ts` (extended, see below), `hiring.ts` (real described-role hiring), `office.ts` (passes the injectable client), `runtime.integration.test.ts`.
`scripts/smoke/runtime-{lib,chat,task,steer,approval,desktop,colleagues,resume}.ts`.

`ClaudeRuntime` drives the supervisor through exactly the same `RuntimeHost` port as `MockRuntime`; the UI saw no difference in the smoke runs (same events: steps, plan, bubbles, approvals, typing, seen).

## Evidence

1. Type checks: `npm run typecheck:area -- src/office/runtime` -> `no type errors under src/office/runtime`; `-- src/office/employees` -> `no type errors under src/office/employees`; `-- src/office` and `-- scripts` clean too.
2. `npx vitest run src/office` -> `Test Files 23 passed (23)  Tests 332 passed (332)` (the runtime and employees part is 156 + 49 tests; the rest is other agents' tests in the same tree). Coverage, all with `fakeQuery` and no network:
   - Gate: every row of the order for each of the three levels and each switch (`gate.test.ts`, about 45 cases): office tools, admin/unknown denial, host only with a grant, commands off, internet off, independent, big steps (RISKY and the risky shell pattern ask, the rest allow), asks first (OBSERVE, TodoWrite, read_file, web allow; ACT as one `desktop` family; shell and files families; risky never remembered), live reading of permission edits, approval allow, deny (note reaches the model), scope `task` memory and its clearing, scope `once`.
   - Allow-list and `disallowedTools`: 28 allowed, built from the 71-tool fixture into 43 full names (`mcp__desktop__create_space` etc.); a never-seen tool the server reports is disallowed too; the known list is the fallback when `tools/list` fails (`toolGroups.test.ts`, `claudeRuntime.test.ts`).
   - Activity mapper table, sentences clipped to 40 characters with no paths or tool names (`activityMapper.test.ts`).
   - End-of-turn table and task limits through the real supervisor (`runtime.integration.test.ts`): ask_user, finish_task, report_stuck, plain conversation, two nudges then "Stopped making progress", nudge counter reset by a tool call, `error_max_turns` (new query with `resume` and "Continue."), `error_during_execution` (one restart, then a plain sentence), cost limit question ("I've used $1.50 on this. Keep going?", yes raises the limit, no cancels), the 300-turn question, task cost/tokens/turns.
   - Session id capture, cost delta across a resume with a persisted baseline, baseline reset when the total goes down.
   - Inbox formatting and ordering (the four spec examples, briefing and notices, coalescing, pause, passive items held back, drain), colleague message guards (the three-message chain and the 20 per minute limit are `Office.colleagueGuard`, covered by the existing supervisor tests; the runtime test checks that a refusal is returned as a tool error).
   - Approval round trips through the supervisor and the API (asks first), screen grant and revoke against `MockHost` including the full-set `setMcpServers` calls (`{space, office}` plus `host`, plus `desktop` with real desktops), restart recovery with a pending approval (second office on the same database: approval expired, query started with `resume`, the "approval request was lost" note), take control and give back.
   - No key: hire works, the employee is `stuck` with "I can't start: no API key is set.", a held message is retried and reported again, no crash.
   - Real hiring of a described role with an injected fake client (model id, JSON schema output, clamping, fallback when the call fails or returns junk, deterministic path with `MOCK_LLM=1` and with no key).
3. `MOCK_SPEED=20 npx tsx scripts/e2e/mock.ts` against `MOCK_LLM=1 DESKTOPS=mock MOCK_SPEED=20` on port 4399: `6 of 6 scenarios passed` (S1, S4, S6, S8, S9, S17).
4. `MOCK_LLM=0` with an empty key, mock desktops, port 4398:
```
GET /api/health -> {"ok":true,...,"capabilities":{"llm":false,"desktops":"mock",...}}
Ines Moreau stuck | I can't start: no API key is set. | mock:emp-01m7e7s9bp9vhv91j7hmtjse64
thread: [('employee', 'text', "I can't start: no API key is set.")]
```
5. The seven smoke scripts exist and were run (next section).

## Smoke scripts (all real runs, `claude-haiku-5-5`, `DATABRICKS_SYNC=off`)

Run any of them from the repo root; each starts its own clean office on `--port` (default 4322) with `--data` (default `data-w2`), prints PASS or FAIL lines with evidence, the cost and the resident memory of the employee processes, and exits 0 (all passed), 1 (a check failed) or 3 (skipped: no key in `.env.local`).

```
npx tsx scripts/smoke/runtime-chat.ts        # "hi, who are you?": one bubble, idle, no task
npx tsx scripts/smoke/runtime-task.ts        # hello.txt with today's date, steps, done bubble, cost recorded
npx tsx scripts/smoke/runtime-steer.ts       # "actually name it hi.txt" mid-task; the file is hi.txt
npx tsx scripts/smoke/runtime-approval.ts    # asks_first: approval, approve, finish; then deny and she says so
npx tsx scripts/smoke/runtime-colleagues.ts  # Maya asks Ines; then a ping-pong the guard must stop (about 2.5 minutes)
npx tsx scripts/smoke/runtime-resume.ts      # SIGKILL office mid-task, restart on the same data, session resumes
npx tsx scripts/smoke/runtime-desktop.ts     # DESKTOPS=cua by default: example.com on a real Space; deletes it at the end
         [--model claude-sonnet-5-5] [--port N] [--data dir] [--attach]
```

Results of the final full run (all seven back to back, after the last code change; trimmed from `/tmp/w2-smoke-all.txt`):

| Script | Result | Time | Cost | Employee process memory | Evidence |
| --- | --- | --- | --- | --- | --- |
| runtime-chat | PASS 7/7 | 11 s | about $0.0004 | 235 MB | one bubble "I'm Maya Okafor, a Web developer on the team ...", idle, no task, 0 task events, real session id |
| runtime-task | PASS 8/8 | 11 s | $0.0004 | 228 MB | `hello.txt` = `2026-11-14`, step "Ran a command", done bubble, task done with `0.00037 USD, 3 turns, 19697/246 tokens` |
| runtime-steer | PASS 4/4 | 38 s | $0.0005 | 277 MB | "actually name it hi.txt" marked seen 22.6 s later (after `sleep 25` returned); `hi.txt` exists, `hello.txt` does not |
| runtime-approval | PASS 10/10 | 17 s | $0.0009 | 376 MB | approval `tool: "Run a command" / "mkdir -p ~/work && printf ..."`, state `needs_you`, nothing written before the answer, 1 approval for the task (scope task), then a denial: she said "The shell refused ... so I've stopped and won't retry" |
| runtime-colleagues | PASS 7/7 | 140 s | $0.0011 | 625 MB (two employees) | Maya messaged Ines, "Maya asked something" in Ines' thread, "Ines replied" reached Maya, Maya reported it; ping-pong stopped at 3 messages, none after |
| runtime-resume | PASS 7/7 | 67 s | $0.0002 | 265 MB | SIGKILL mid `sleep 40`, restart on the same data: same session id `9af93f5b...`, `done.txt` = `resumed`, task done |
| runtime-desktop (real Space, Haiku) | PASS 6/6 | 28 s | $0.0096 | 303 MB | `local:emp-01m7e...` Space; answer after 12 s: "I opened https://example.com in Firefox and the tab and window title read "Example Domain"..."; steps "Opened example.com"; `frame.jpg` 200 (107 KB); 9 turns; Space deleted by removing the employee |

Total real spend across all runs of the night, including earlier partial runs: under $0.05 (Haiku is very cheap; the SDK reports the figures above).
An earlier run of the same desktop script passed too (14 s, 7 turns, `Opened example.com` and `Read example.com` steps, $0.0038).


## Changes outside my folders (small, additive)

- `src/office/main.ts`: `BootOptions.roleClient?: RoleClient` (type import from `employees/hiring.ts`) and `roleClient: opts.roleClient` passed to `new Office(...)` (4 lines).
- `src/office/employees/office.ts` (mine by ownership of `employees/**`, but W7's `CallsHost` lives there, untouched and still working): optional `roleClient` in `OfficeDeps`, passed to `makeCandidate`.
- Nothing in `routes/`, `store/`, `bus.ts`, `src/shared/`, `package.json`.

Supervisor changes (`employees/supervisor.ts`, mine): `turnStarted()` is now idempotent within a turn (a steering message only marks it seen and no longer resets the turn's asked/finished/stuck flags); `RuntimeUnavailable` from a runtime start puts the employee in `stuck` with the sentence and a bubble, keeps the intro and held items, and any later message or "Try again" retries the start (`ensureRuntime`); "{First name} replied" vs "asked something" for incoming colleague messages (a reply when we messaged them in the last 10 minutes).

## Real SDK behaviour that differs from, or adds to, the spec (all verified by running)

1. **`tools: ['TodoWrite', ...]` is not honoured by default**: `system/init` did not list `TodoWrite` because the CLI replaces it with TaskCreate/TaskUpdate. Fix: `CLAUDE_CODE_ENABLE_TASKS=false` in the subprocess env (now in `employeeEnv`); init then lists `TodoWrite`. The plan mirror depends on it.
2. **`system/init` arrives with the first user message**, not at process start, so `start()` does not wait for it (it would deadlock: the supervisor delivers the briefing after `start()`). The desktop-tool assertion and the session id capture happen when init arrives.
3. **`system/init` lists** (cua desktop): `WebFetch`, `WebSearch`, 28 `mcp__desktop__*` (exactly the allow-list), 11 `mcp__office__*`, 3 `mcp__space__*`, plus `TodoWrite` with the fix above; 44 tools. `alwaysLoad` plus `ENABLE_TOOL_SEARCH=false` made them all visible on turn one.
4. **Steering order:** a message delivered mid-turn reaches the model at the next tool boundary; with a `sleep 25` in flight it was marked seen 22 s later and then followed. So a long shell call delays steering by its own length. `priority: 'next'` and the next-assistant-message rule for "seen" work as specified.
5. **Memory of one employee process:** about 230 to 380 MB resident for the `claude` subprocess (two employees: 576 MB together), on top of the Space's own memory.
6. **The turn's cost arrives with `result`, after `finish_task`**: the state is already idle and the task done when the cost lands. Smoke checks wait for it.
7. Haiku drove the real desktop reliably on the one task asked of it (14 to 37 s, 7 turns); it used the keyboard-and-tree route plus `WebFetch`, never a pixel click.

## Spec points that were ambiguous or wrong, and what I chose

- Cost baseline: the runtime has no store access (`RuntimeDeps` has none), so `lastTotalUsd` is kept in `<DATA_DIR>/employees/<id>/cost-baseline.json` instead of `kv`. Same semantics (never reset to 0; negative delta counts the whole total); it is removed with the employee's folder.
- `mcp__host__*` with a live grant is allowed outright (spec rule 3 read literally); it is not subject to levels 6 to 8. Host tools are still limited to the same 28-name allow-list (plus the mock Mac's one `read_window` tool, served in-process when the host driver has `mockCall`).
- "For this task" approvals are cleared when `finish_task` or `report_stuck` run (and on dispose). A task cancelled by the user's "no" to the budget question does not clear them (the runtime is not told); they clear at the next finish.
- A final-text bubble is shown only for turns started by the manager, a colleague, or the hire note, not for turns started only by a nudge or a notice (otherwise "Okay, carrying on." bubbles would appear after every nudge).
- Briefing and notices (permission change, screen lent or returned) are held until the next item that needs an answer, or sent at once while a turn is running; sent alone while idle they would start a turn of their own.
- The brief named `cua-mcp-tools.json` as the 71-tool fixture; that file holds 179 tools of the `cua mcp` server. The 71 live tools are in `mcp-tools.json` of the same scratch folder; `fixtures/cua-desktop-tools.json` is built from it.
- `canUseTool` returns `{ behavior: 'allow', updatedInput: input }` (the type allows omitting `updatedInput`; including it is harmless and was what worked in the real runs).
- `ANTHROPIC_BASE_URL`, proxy variables and `NODE_EXTRA_CA_CERTS` pass through the env allowlist when set in office's own environment.
- Non-zero shell exit codes are shown in the tool text (`[exit N]`) and are not flagged as tool errors, so a failed `grep` does not turn an activity step red; timeouts and thrown errors are.
- `.env.local` had `DATABRICKS_SYNC=on` for the first runs of the night (the orchestrator told me later): the first smoke runs (chat, task, steer, approval, resume, the first colleagues and desktop runs) may have mirrored a few test employees and tasks to the user's workspace. Every run after the instruction, and the smoke library, set `DATABRICKS_SYNC=off`.

## Not verified

- Sonnet on the desktop task (Haiku passed, so the second run was not needed).
- A real screen grant against the real `cua-driver` (`hostScreen` is false on this Mac); only MockHost, with the in-process mock host server.
- Real hiring of a described role against the live API (tested with an injected fake client and the failure fallback). One line to check by hand: `POST /api/candidates {"roleKey":"custom","description":"someone to answer customer emails"}` with a key set.
- The watchdog's 4-minute stall and the 8-repeat stuck path with the real model (unit-tested through the fake only).
- Long sessions: compaction of the context, and resume after many hours.

## Cleanup

Every office, Space and `claude` process I started was stopped; the desktop script deletes its employee (and Space) at the end; temporary data folders `data-w2*` are left under the repo (gitignored): `data-w2` holds the last smoke run's database.
