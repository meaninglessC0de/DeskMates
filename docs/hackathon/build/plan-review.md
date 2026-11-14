# Plan review (defects only)

Reviewer pass over `plan.md`, `spec/*`, `design/*` against the real package types (`@anthropic-ai/claude-agent-sdk@0.3.325`, `livekit-server-sdk@2.19.3`, `livekit-client@2.24.1`, `@trycua/cua@0.27.4`, `@mlflow/claude-code@0.5.0`, all unpacked in the scratchpad) and `vendor/cua`. `research/08-cua-live-spike.md` does not exist yet, so nothing could be checked against it. Read `docs/hackathon/README.md` first; front end must use Astryx.

Counts: 4 blockers, 32 should-fix, 18 minor.

---

## Blockers

**B1. Ten agents share one tree, and `npm run office` is `tsx watch` over the whole of `src/office/**`.**
Evidence: `workstreams.md` W0 step 2 (`office` = `tsx watch src/office/main.ts`); W1, W2, W7, W8 all own folders inside `src/office/`; common rule 6 (each agent runs its own office).
Why it hurts: every save by any agent restarts every other agent's office (kills live Claude sessions mid-smoke-test, breaks `runtime-resume`), and one half-written file in W2's folder makes W1's, W7's and W8's offices fail to import. Agents will spend the night chasing errors that are not theirs.
Fix: W0 provides `office:once` (`tsx src/office/main.ts`, no watch) and the brief says "never use watch scripts; run office once, restart it yourself after your own edits; write each file in one edit and run your area's typecheck before moving on". Add the per-area typecheck commands (see S24).

**B2. W1 and W2 are told to start from `research/08-cua-live-spike.md`, which does not exist, and the Cua facts in research 01/03 do not match the SDK types.**
Evidence: `workstreams.md` W1 Read ("its 'Copy-paste reference' is your starting code"), W2 Read, `employee-runtime.md` section 3 ("Exact call in research/08"). Real types (`@trycua/cua/dist/native/cua_sdk.d.ts`):
- `SpaceCreateOptions.memoryMb?: bigint` and `timeoutMs?: bigint` (research 01 section 3 passes `memoryMb: 3072`, a type error and probably a runtime throw; needs `3072n`).
- `SpaceLike.bash(command: string, timeoutMs: bigint | undefined)` returns `SpaceBashResult { stdout; stderr; exitCode?: number; signal?; timedOut: boolean; error?; rendered }`.
- `mcpConfig(service, path)` exists on `SandboxLike` (`embedded().sandboxes()`), not on `SpaceLike`. The plan's `mcpEndpoint -> { url, token }` has no direct Space method. Nearest real mechanisms: (a) `sandboxes()` handle `.mcpConfig('env','/mcp')` (research 03 section 2.3), (b) `SpaceLike.spacesd().endpoint()` (a string, no token), (c) skip HTTP MCP and expose the driver in-process by proxying `SpaceLike.listTools(service)` and `SpaceLike.callTool(tool, argumentsJson, service, timeoutMs)` through `createSdkMcpServer`. The plan mixes `spaces()` and `sandboxes()` registries without saying which one an employee Space lives in.
Fix: make 08 a hard gate. The orchestrator must confirm before phase 2 that 08 exists and contains (1) create/start/stop/delete with bigint fields, (2) the MCP endpoint route that actually answered `tools/list`, (3) the stream ticket route, (4) live `setNetwork`. Pre-decide fallback (c) above in the W1/W2 briefs so a failed spike does not stall them. Correct the `memoryMb` snippet in research 01.

**B3. `maxBudgetUsd` and `maxTurns` are per-`query()` lifetime and cannot be raised on a live query; the keep-going table assumes both.**
Evidence: `sdk.d.ts` `Options.maxBudgetUsd` ("Maximum budget in USD for the query. The query will stop if this budget is exceeded, returning an `error_max_budget_usd` result"), `maxTurns` ("before the query stops"), `SDKResultError.total_cost_usd` ("maxBudgetUsd counts only the spend since this query() call started"). No `setMaxBudget` or `setMaxTurns` exists on `Query` (methods: interrupt, setPermissionMode, setModel, setMaxThinkingTokens, applyFlagSettings, setMcpServers, streamInput, ...). Plan: `employee-runtime.md` section 2 (`maxBudgetUsd: TASK_BUDGET_USD`, default 5, "per task") and 4.3 ("On yes, raise the budget by the same amount and deliver Continue"; "deliver Continue up to 3 times").
Why it hurts: with one long-lived query per employee, $5 is the cap for the whole process lifetime across all tasks, not per task. The second task of a busy night ends the session, the "raise the budget" step has no API, and whether the input stream stays usable after an `error_max_*` result is unknown.
Fix: set the SDK caps as high backstops (for example `maxBudgetUsd: 50`, `maxTurns: 2000`); implement the per-task $5 check in the supervisor from the cost delta (S5) and, when it trips, `interrupt()` and ask the user. If an `error_max_*` result does arrive, recovery is: dispose the query and start a new one with `resume: sessionId` and a larger cap. Add this as an explicit B2 proof item ("what happens to the stream after error_max_turns").

**B4. W0 is the serial gate for everything and is far too large for one agent in about an hour.**
Evidence: `workstreams.md` W0 (about 30 dependencies and a Playwright install; full SQLite store; every HTTP route and the WebSocket; presets, cast; two mock implementations including a scripted 20-second runtime with real-waiting approvals; the supervisor state machine; a mock call event sequence; team report SQL; seed; shots; the entire renderer skeleton with about 20 placeholder components, API client, reconnecting WebSocket, zustand store; Electron window; two vite configs; README) against `plan.md` section 7 ("60 min").
Fix: split into W0a (orchestrator does the 5-minute part itself before launching anyone: `package.json`, install, tsconfigs, `.env.example`, `.gitignore`, `src/shared/**` generated from contracts) then W0b (office: store, routes, WebSocket, mock spaces and runtime, supervisor, seed) and W0c (renderer skeleton, api client and store, shots, electron-vite config, minimal main) running in parallel, both reading only `src/shared`. Gate when both pass. Expect 90 minutes, and say so in the plan.

---

## Should fix

### Claude Agent SDK and runtime

**S1. Several offices and daemons: `cua daemon` start and stop is owned by each W1/W2/W6 office.**
Evidence: W1 step 3 ("Start and stop whatever long-lived Cua process ... as a child of office"); W1, W2 (`runtime-desktop.ts`), W6 and W7 all run real offices on different ports at the same time; research 01 says the daemon is a single instance (`~/.cua/cua.sock`).
Fix: the orchestrator starts one daemon (or decides on `embedded()` only) before phase 2 and writes it in `build/log.md`; W1's code connects if one answers and never stops one it did not start.

**S2. MCP tool deferral can make the desktop tools invisible.**
Evidence: `McpHttpServerConfig.alwaysLoad` ("Default: tools are deferred when tool search is enabled"), `createSdkMcpServer({ alwaysLoad })`; `ENABLE_TOOL_SEARCH` is a real env name in `sdk.mjs`. The plan restricts built-ins to `['TodoWrite','WebSearch','WebFetch']`, so the `ToolSearch` built-in is absent while Cua's 60-plus tools may be deferred behind it.
Fix: in the spec set `alwaysLoad: true` on the `desktop` http config and on `createSdkMcpServer` for `office` and `space`, and `ENABLE_TOOL_SEARCH: 'false'` in `env`. B2 must assert that `system/init.tools` contains `mcp__desktop__*` names and that the model actually calls one.

**S3. The `desktop` URL and token go stale when a Space restarts or resets, and `setMcpServers` has sharp edges.**
Evidence: `employee-runtime.md` section 3 ("fetched fresh at every start()"), contracts `desktop/restart` and `reset` (reset deletes and recreates the Space); `Query.setMcpServers` doc: "a call that leaves out a stdio, sse or http server passed in the `mcpServers` option does not disconnect it ... To be able to remove a server later, add it with this method instead of in `mcpServers`".
Fix: on any desktop restart, reset or start, the supervisor disposes the runtime and starts a new one with `resume` (simplest). For the host server attach/detach (section 2 note), add `host` through `setMcpServers` (not the initial `mcpServers`) and always pass the full set (`desktop`, `space`, `office`, `host`) each call.

**S4. Paths and environment of the employee subprocess.**
Evidence: `employee-runtime.md` section 2: `cwd: 'data/employees/${id}'` and `CLAUDE_CONFIG_DIR: 'data/employees/${id}/.claude'` are relative; contracts section 6 hardcodes `data/`, but W1 to W9 use `DATA_DIR=data-wN`. `Options.env` doc: "REPLACES the subprocess environment entirely". The plan spreads `process.env`; when office was started from a Claude Code session (build agents, orchestrator) that includes `CLAUDECODE` and other `CLAUDE_CODE_*` variables.
Fix: spec `path.resolve(DATA_DIR, 'employees', id)` for both; build `env` from an allowlist (`PATH`, `HOME`, `ANTHROPIC_API_KEY`, `MCP_TOOL_TIMEOUT` if set, `ENABLE_TOOL_SEARCH`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY`) and delete every inherited `CLAUDE*` variable first.

**S5. Cost accounting after `resume` double counts unless the baseline is persisted.**
Evidence: `SDKResultError.total_cost_usd` doc: "cumulative across turns ... a resumed or forked session continues from the total its transcript saved ... (so the first result already carries the earlier turns)"; `usage` is "per-turn in streaming-input sessions", `modelUsage` is cumulative. Plan 4.3: "store the delta".
Fix: persist `lastTotalUsd` per employee in `kv`; delta = `total_cost_usd - lastTotalUsd` (if negative, treat as a reset and use the total); never start the baseline at 0 after a restart. Take tokens from `modelUsage` deltas the same way, or from `usage` per turn.

**S6. Tool names in the gate, group lists and `disallowedTools` are bare; the SDK uses `mcp__<server>__<tool>`.**
Evidence: `employee-runtime.md` section 6 rule 2 ("`set_config`, `install_extension`, ... are in `disallowedTools`"), section 4.4 (`desktop.launch_app`), `canUseTool(toolName, ...)` receives `mcp__desktop__launch_app`; `disallowedTools?: string[]` removes exact tool names.
Fix: one sentence in section 3: `toolGroups.ts` strips `mcp__<server>__` and keeps the server as a separate key; `disallowedTools` is built at start from `tools/list` as `mcp__desktop__<name>` for every ADMIN tool that the live server reports, and the gate also denies them (belt and braces).

**S7. The gate's "family `desktop:{app name}`" cannot be computed from tool inputs.**
Evidence: `employee-runtime.md` section 6 ("keyed by family: `desktop:{app name}` for every ACT or BROWSER tool aimed at that app's windows"); Cua action tools take `element_token`, `window_id`, `pid`, or `target` (research 03 section 1), never an app name.
Fix: pre-decide for v1 a single family `desktop` with approval title "Use the desktop" and detail "Click, type and navigate on her desktop for this task", or require a cached `pid/window_id -> app name` map filled from `launch_app`, `list_windows` and `get_window_state` results observed in the stream.

**S8. Pending approvals and test scenario S10 (restart office mid-task) are undefined.**
Evidence: `employee-runtime.md` 4.5 ("Never auto-approve"), contracts `Approval.status: 'expired'` with no producer; test-plan S10. A restarted office loses the pending `canUseTool` and `request_approval` promises; `resume` then sees a dangling tool call.
Fix: on boot, mark every `pending` approval `expired`, set the employee `idle`/`working` per its task, and deliver `<office>Your approval request was lost because the app restarted. Ask again if you still need it.</office>` after resume.

**S9. Take control has no contract, state or runtime hook.**
Evidence: ux 3.3 (state line "You're in control", "her loop pauses", row line "Waiting for you"), test S11 ("her loop waits and then continues"); contracts `POST /stream {mode:'control'}` only returns a ticket; `EmployeeState` has no matching value; `employee-runtime.md` never mentions control.
Fix: define that opening a `control` stream (or `POST /api/employees/:id/control {on}`) calls `setPaused(true)` with `stateDetail: 'Waiting for you'` and state `paused`; closing or "Give back" resumes. Say who owns it (W2 supervisor) and add it to the W6 and W3 briefs.

**S10. Mid-run steering and "Seen" depend on unverified CLI behaviour; names for the fallbacks are not given.**
Evidence: `SDKUserMessage.priority?: 'now' | 'next' | 'later'`, `uuid?`, `SDKUserMessageReplay { isReplay: true }` exist in `sdk.d.ts`, but no `Options` field enables replay (the CLI flag would go through `extraArgs`, unverified, `replay-user-messages` is not found in `sdk.mjs`). `parent_tool_use_id: string | null` is required on `SDKUserMessage`.
Fix: spec the exact input shape (`{ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, uuid, priority: 'next' }`), and say "Seen = the next `assistant` message after the delivery" as the default, with `extraArgs: { 'replay-user-messages': null }` as an optional upgrade B2 may test.

**S11. MLflow gives one trace per `query()`, not per task, and finishes only when the stream ends.**
Evidence: `research/06-databricks.md` ("One trace per `query()` call ... must consume the stream to the end for the trace to finalise"); `@mlflow/claude-code/dist/tracedClaudeAgent.js` (`LiveTracingContext` per call); `plan.md` demo ("open a task's trace"), `Task.traceId`, D-025. The wrapper also forces `forwardSubagentText: true`. Peer dependency is `claude-agent-sdk ^0.2.0`, so `npm install` fails without `--legacy-peer-deps` (W0 step 1 says "if they fail to install, leave them out").
Fix: either drop "trace per task" from the demo and Team view (say "one trace per employee session"), or open a new traced `query()` per task (costly, loses the long session). Tell W0 to install both packages with `--legacy-peer-deps`, and say how `Task.traceId` is obtained (it is not exposed; leave null and link to the experiment).

### Contract coverage (screen X needs Y; contract has no Z)

**S12. Voice worker endpoints disagree between documents.**
`employee-runtime.md` 8.1 and 8.3 use `POST /voice/calls/:id/route` and speech start/end ("`speaking` when the worker reports speech start"); `contracts.md` section 3 lists only `/voice/v1/chat/completions` and `/voice/calls/:id/events` with types `joined | avatar_ready | avatar_failed | user_transcript | agent_transcript | ended`. Stage speaker rings (ux 4.4, 4.7 thinking ladder) need `speech_started` and `speech_ended` per speaker. Fix: add `/route` and the two event types to contracts; specify that the `X-Speaker` header is set per turn by overriding `llm_node` (the stock `openai.LLM` is created once per session).

**S13. Meeting tiles need per-participant state and a track-to-employee mapping.**
Evidence: ux 4.5 tile table (Joining, Not answering, Dropped, Couldn't join, Left) and 4.2; `CallSession` has one `videoTrack`; `call` events carry only call-level `state` and a `speaker`. With one avatar session (plan section 2), only the current speaker's tile can hold video. Fix: add `{ kind: 'participant', employeeId, state: 'joining'|'present'|'dropped'|'failed'|'left' }` to the `call` event, and state in `useCall` docs that `videoTrack` renders in the tile of `speaker` (last speaker when idle), all other tiles show the still.

**S14. "Hear" has no data source.**
Evidence: ux 3.4 and 3.5 ("Plays a 3 s voice sample"); W4 ("plays `GET /media/voices/<id>.mp3` if it exists"); contracts has no such route, `Persona.voice` has no `sampleUrl`, and no workstream creates the files (W7 builds `capture-portraits.ts` only). Fix: add `voice.sampleUrl: string | null` to `Persona`, a static `/media/voices/` route in W0, and a `scripts/capture-voices.ts` (3 s TTS per cast voice via the configured provider, or skipped) owned by W7. Hear hidden when null (already W4's rule).

**S15. Lent-screen "until I stop" cannot be represented.**
Evidence: contracts `Employee.screenGrant: { untilMs: number } | null` versus `POST /screen-grant { minutes: number | null }`; ux 3.3.3 banner "Ends in 8:42". Fix: `untilMs: number | null` (null = until stopped; banner hides the countdown).

**S16. Team view deltas and unit.**
Evidence: ux 3.9 ("+6 vs last week" under each number); `TeamReport.totals` has no previous period. Fix: add `previous?: { activeMs; tasksDone; costUsd }` to `TeamReport` (computed in `sync/team.ts`; omit when no data). Also state that cost is USD and formatted with `Intl.NumberFormat('en-US', { currency: 'USD' })`; the ux sample shows pounds.

**S17. Smaller screens that need one more field each.**
- Sidebar footer "You / Suhaan" and the briefing's `{userName}` (`employee-runtime.md` 4.7): `GET /api/settings` has no name. Add `userName` (default `os.userInfo().username`, editable in Settings).
- Profile "Desktop: Running · 3 h 12 min": no desktop uptime. Add `Employee.desktopSinceMs: number | null`.
- Profile "Applies after her desktop restarts" (runtime section 6): `PATCH /employees/:id` returns `Employee` only. Return `{ employee, appliesAfterRestart?: boolean }` or add `Employee.pendingRestart: boolean`.
- Tray "Pause everyone": `onTrayAction` union has no `pause_all`; add `{ type: 'pause_all' }`.
- Hire step 2 "Edit -> Voice selector": no voices list and `overrides` has no voice. Add `GET /api/voices` and `voice` to `overrides`, or cut the selector in the W4 brief.
- Hire failure ("Couldn't set up her desktop"): `POST /api/employees` returns at once; failures are asynchronous. State that a failed boot sets `state: 'offline'`, `stateDetail: 'Couldn't start desktop'`, plus a `toast`, and drop the dialog-level failure banner from W4.
- Stuck "Try again" (ux 3.2, test S8): no endpoint. Say `POST /resume` on a stuck employee delivers `<office>Try again.</office>` and clears `stuck`.
- `stateDetail` is "max 40 chars" in contracts and "max 32" in ux 2.2, and nothing says who sets it for `needs_you` and `stuck`. Pick 40 and add "needs_you: the approval title or the question text, cut to 40; stuck: the `report_stuck` reason".

**S18. Cast of 8 versus unlimited hires.** R16 and `/api/candidates`: "preferring cast members not yet hired" is undefined once all 8 are hired (and `exclude` exhausted). Fix: return a hired cast member again with a new name suffix, or return 409 `cast_exhausted` and W4 shows the one-line message; say which.

### Cross-document consistency and ownership

**S19. Unowned files that phases 2 to 5 depend on.** None of W0 to W9 create or own: `scripts/e2e/mock.ts`, `real.ts`, `ui.ts`, `soak.ts` (test-plan layers 2 to 6, plan phase 3); `src/renderer/src/api/**` after W0 (W3 to W6 all need store fixes and none may edit it); `config/portraits/**` and `config/cast.json` after W0 (W7's `capture-portraits.ts` writes there; office copies portraits only at boot); `electron.vite.config.ts` and `index.html` after W0 (W9 needs both); `stage/useLiveKit.ts` does not exist when W5's `useCall.ts` imports it (W0 does not list a stub); the `?shot=` fixtures router (lives in `App.tsx`, W3's, but W4 and W5 must register states) and `scripts/shots.ts`'s state list (W0's). Fix: assign `api/**` and `App.tsx` to W3; assign `scripts/e2e/mock.ts` to W0b and `real.ts`, `ui.ts`, `soak.ts` to a named phase-3 agent; add `config/portraits/**` to W7's Owns and say the office watches or re-copies it; add `electron.vite.config.ts` to W9; have W0c create a `useLiveKit.ts` stub; make shots data-driven (each area owns `src/renderer/src/<area>/shots.ts` exporting `{ name, query }[]`; `scripts/shots.ts` imports all four) with PNG names prefixed by area.

**S20. Frame fallback route missing from the contract and the owner.** W1 `stream.ts` returns `/api/employees/:id/frame.jpg`; contracts section 3 has no such route; routes live in W0's `http/`. Add it to contracts (mock serves it too) and tell W0.

**S21. Tracing call site.** W8 says "tracedQuery ... (W2 already calls it)". Neither `employee-runtime.md` section 2 (`query({ ... })`) nor W2's Build list mentions it, and W0's stub is described only as "no-op stubs". Fix: W0 exports `tracedQuery` from `src/office/sync/tracing.ts` (identity); runtime section 2 calls `tracedQuery(query)(...)`; W2 Build lists it.

**S22. `employee-runtime.md` says "W3 implements sections 1 to 7"; W3 is the UI core.** Should be W2. Also W2's Build list omits section 7 (hiring: described-role Haiku call, candidates, introduction message), so the real `POST /api/candidates` for `roleKey: 'custom'` is built by nobody (W0 only writes mocks; add a deterministic mock for custom roles).

**S23. Environment variables used but not in contracts section 8.** `DATA_DIR`, `WEB_PORT`, `VITE_OFFICE_URL`, `EMPLOYEE_TASK_BUDGET_USD`, `CALL_HANDS`, `CUA_BIN` if used, `USER_NAME`. W0 builds `env.ts` and `.env.example` "exactly as contracts.md", so they will be missing. Add them.

**S24. No per-area typecheck command.** Common rule 7 says "Type-check your own area with the command in your section"; no section has one, and `npm run check` runs `astryx doctor --built .` over everyone's half-built files (and doctor exits 0 on warnings per research 07 section 3.1, so an agent cannot tell pass from fail by exit code). Fix: W0 provides `npm run typecheck:area -- <glob>` (or four `tsconfig.<area>.json` files) and `npm run purity -- <folder>` that greps doctor output for "purity" findings in that folder and exits 1 if any.

**S25. How the renderer reaches office is not decided.** The renderer on `:4318`..`:4339` calls office on another port; contracts say nothing about CORS and `@fastify/cors` is not in W0's dependency list; the Electron renderer loaded from `file://` cannot use relative URLs either. Fix: one sentence: Vite dev servers proxy `/api`, `/media` and `/ws` to `VITE_OFFICE_URL`, the renderer uses relative URLs, and in Electron the main process loads the renderer from office (`GET /` serves `out/renderer`) or from the dev server; the media WebSocket (`wsUrl`) goes straight to the Cua bridge. Note that browsers cannot set WebSocket headers, so check `SpaceLike.websocketHeaders()` is empty for local Spaces (research 02 says the ticket in the URL is enough).

**S26. Resource contention during phase 2.** W1, W2 (`runtime-desktop`), W6 and W7 all create real Spaces concurrently on one Mac; each Space is 2 CPUs and 3 GB plus the runtime VM, but only the soak test has a limit ("at most 3 real desktops"). Fix: add a global rule in the common brief: at most one Space per agent, delete it when the script ends, and W1 may use two for its two-Space test only while W2 and W6 are not running desktop tests (orchestrator sequences it in `build/log.md`).

### Feasibility and verification without a human

**S27. W2 cannot pass without a key and has no key-free test of the SDK event handling.** Fix: ask W2 for a `FakeQuery` (a scripted async generator of `SDKMessage`s) behind the same factory, used by vitest for the keep-going table, session id capture, result subtypes, cost delta, and approval flow, so most of W2's "Done when" is checkable offline.

**S28. W7 cannot verify audio without a microphone, and the suggested method needs a missing dependency.** W7 "Done when" says publish a recorded file "from a script"; publishing audio from Node needs `@livekit/rtc-node`, which is not in W0's list. Nearest check an agent can run: Playwright Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>` against the `:4337` page, asserting a `user_transcript` and an answer event reach office. For the Python side, LiveKit Agents' text test mode (`AgentSession.run(user_input=...)`) checks the brain endpoint with no audio.

**S29. W9 and W0 "Done when" need a human for notifications and a window.** macOS notification permission and a visible Electron window cannot be clicked or screenshotted unattended. Nearest checks: Playwright `_electron.launch` on the built main, `app.evaluate` to read the `Tray` context menu labels, a test hook (`AGENT_MANAGER_TEST=1`) that records `new Notification(...)` calls and lets the script fire the click handler, `page.screenshot()` of the BrowserWindow (no Screen Recording permission), and `pgrep` for orphans (already in the plan).

**S30. Screen grant has no acceptance check in any workstream.** Brief item 9 is Must; the plan demotes it to stretch for the install only, but the grant API, mutex, banner, countdown, `request_screen` approval and revoke are all built tonight, and none of W0 to W9 lists them under "Done when". Fix: W0 includes a `MockHost` (grant on, host tools return a fixed string) and W2 and W3 "Done when" each include one grant/revoke round trip in mock mode.

**S31. W0's mock desktop needs "a small set of bundled desktop screenshots" nobody can capture.** Cua is not available to W0. Fix: say W0 generates five 1280x800 PNGs by rendering simple HTML (a terminal-like window, a browser-like window) with Playwright, committed under `config/mock-desktops/`.

**S32. Preflight lacks tool checks.** Add a B0 line: `node -v` (26.x), `npm`, `uv --version`, a Python 3.10 to 3.14 for `uv`, `git`, `uname -m`, free disk of at least 30 GB, free RAM, `npx playwright install chromium` done, and for the Figma deliverable (plan phase 5) a test call to the Figma connector (`whoami`) with a team or plan key for `create_new_file`.

---

## Minor

- M1. Python version: contracts section 1 says 3.11, `plan.md` section 3 says 3.12; `livekit-agents 1.8.12` requires `>=3.10,<3.15`. Say 3.12.
- M2. W0 "`typescript@5.9`" is not an exact version; use `5.9.3`. `zod` must be `^4` (SDK peer `zod ^4.0.0`; current 4.6.7) and `@modelcontextprotocol/sdk` `^1.29.0` (1.32.2), `@anthropic-ai/sdk` `>=0.93.0` (1.8.0): list exact versions in W0 so the peer set resolves.
- M3. `tool()` handlers must return a `CallToolResult` (`{ content: [{ type: 'text', text }] }`), not a string; the contract says tools "return short plain text". Add one line to W2.
- M4. TodoWrite input is `{ todos: { content; status: 'pending'|'in_progress'|'completed'; activeForm }[] }` (`sdk-tools.d.ts` `TodoWriteInput`). `PlanStep.title` = `content`; the mapper in 4.2 should say so.
- M5. Model ids `claude-sonnet-5-5` and `claude-haiku-5-5`: the SDK's own doc examples use `claude-sonnet-5`; add "list models once with the key (`GET /v1/models`) and fix the ids in `.env.example`" to B2.
- M6. Agent dispatch metadata is a string: `new RoomAgentDispatch({ agentName, metadata: JSON.stringify(...) })` set on `token.roomConfig = new RoomConfiguration({ agents: [...] })` (both exported by `livekit-server-sdk`; `AccessToken.roomConfig` exists). `contracts`/`employee-runtime.md` 8.1 write "metadata = { ... }". Also `publishData` takes `Uint8Array`, so the `{ type: 'say' }` message must be encoded.
- M7. `ux-spec` 4.6 "auto bring-up" (`show_desktop` event) is not in rulings' Cut table and not in contracts. Add to Cut.
- M8. `ux-spec` 3.12 "Microphone" selector in Settings is neither cut nor in W4's brief. Cut it explicitly.
- M9. W9 should set `webPreferences.backgroundThrottling: false`, otherwise the hidden window's timers and WebSocket handling may lag and delay `notify` handling while the app lives in the tray.
- M10. W8 Owns reads "`src/office/sync/**` (except `team.ts`'s local computation, which you extend, not replace)". Say plainly that W8 owns `team.ts` and must keep its exported function signature and unit tests.
- M11. `research 04` recommends `effort: 'medium'` as default; `employee-runtime.md` says "leave the default". Pick one (leave default is fine; delete the research line or note it).
- M12. `ux-spec` 3.4 says the first message arrives "within 2 s"; with a real model and a 60 s desktop boot that is not achievable (mock only). Change to "arrives by itself once the desktop is up" for S1.
- M13. `CallInfo.livekitUrl: ''` means mock; the renderer's selection of `useLiveKit` depends on it. Add `mode: 'mock'` or a `mock: true` field instead of an empty-string convention.
- M14. `Message` has no `options` field, so `ask_user({ options })` buttons cannot render. Either drop `options` from the tool or add `options?: string[]` to `Message`.
- M15. `.gitignore` in W0 must also ignore `data-w*/`, `shots/`, and `voice/.venv`.
- M16. `npx playwright install chromium` writes outside the repo (`~/Library/Caches/ms-playwright`); fine, but the common rule "no system installs" should say it is allowed for W0.
- M17. Per-agent screenshots in a shared `shots/` folder overwrite each other; prefix by area (see S19).
- M18. Preflight A3 says user pastes avatar ids into `config/cast.json` while W0 creates that file; say the orchestrator merges the ids after W0 and before W7.

---

## SDK name table (`@anthropic-ai/claude-agent-sdk@0.3.325`, from `sdk.d.ts` and `sdk-tools.d.ts`)

| Name used in the plan | Status | Exact real form or note |
| --- | --- | --- |
| `query({ prompt, options })` | exists | `query(_params: { prompt: string \| AsyncIterable<SDKUserMessage>; options?: Options }): Query` |
| `prompt` as async iterable | exists | `SDKUserMessage` requires `type: 'user'`, `message: MessageParam`, `parent_tool_use_id: string \| null`; optional `uuid`, `priority?: 'now'\|'next'\|'later'`, `session_id` |
| `systemPrompt` plain string | exists | `systemPrompt?: string \| string[] \| { type: 'custom'; prompt; snapshot? } \| { type: 'preset'; preset: 'claude_code'; append?; ... }` |
| `cwd` | exists | `cwd?: string` (defaults to `process.cwd()`; use an absolute path) |
| `env` | exists, differs in meaning | "When set, this value REPLACES the subprocess environment entirely ... not merged with `process.env`" |
| `settingSources: []` | exists | `settingSources?: SettingSource[]` (`'user' \| 'project' \| 'local'`); `[]` = isolation; omitting loads all |
| `tools` list of built-in names | exists | `tools?: string[] \| { type: 'preset'; preset: 'claude_code' }`; `[]` disables all built-ins |
| `strictMcpConfig` | exists | `strictMcpConfig?: boolean` |
| `mcpServers` http with headers | exists | `McpHttpServerConfig = { type: 'http'; url; headers?: Record<string,string>; tools?; timeout?; alwaysLoad? }` |
| `createSdkMcpServer` | exists | `createSdkMcpServer({ name, version?, instructions?, tools?, alwaysLoad?, timeout? })` returns `McpSdkServerConfigWithInstance` (type `'sdk'`) |
| `tool(...)` | exists | `tool(name, description, zodRawShape, handler: (args, extra) => Promise<CallToolResult>, extras?: { annotations?; searchHint?; alwaysLoad? })`; needs `zod ^4` (peer) |
| `permissionMode: 'default'` | exists | `'default' \| 'acceptEdits' \| 'bypassPermissions' \| 'plan' \| 'dontAsk' \| 'auto'` |
| `canUseTool` | exists | `(toolName, input, { signal, suggestions?, blockedPath?, mcpServer?, decisionReason?, title?, displayName?, description?, defaultToNo?, ... }) => Promise<PermissionResult>`; `PermissionResult = { behavior: 'allow'; updatedInput?; updatedPermissions?; ... } \| { behavior: 'deny'; message: string; interrupt?; ... }` (`updatedInput` optional here) |
| `disallowedTools`, `allowedTools` | exist | `string[]`; use full `mcp__server__tool` names |
| `maxTurns` | exists, semantics differ | per query lifetime; cannot be changed on a live query (B3) |
| `maxBudgetUsd` | exists, semantics differ | per query lifetime; result subtype `error_max_budget_usd`; cannot be raised live (B3) |
| `resume` | exists | `resume?: string`; mutually exclusive with `continue` |
| `abortController` | exists | `abortController?: AbortController` |
| `Query.interrupt()` | exists | `interrupt(): Promise<SDKControlInterruptResponse \| undefined>` (response has `still_queued: string[]`) |
| `Query.setMcpServers` | exists, sharp edges | `setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>`; omitted servers from the initial `mcpServers` are not disconnected (S3) |
| `Query.streamInput` | exists | `streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>`, "used internally"; a never-ending `prompt` iterable (as planned) is enough |
| `system/init` and `session_id` | exists | `SDKSystemMessage { type: 'system'; subtype: 'init'; ...; tools: string[]; mcp_servers: {...}[]; session_id: string; uuid }` |
| Result subtype for max turns | exists | `SDKResultError.subtype: 'error_during_execution' \| 'error_max_turns' \| 'error_max_budget_usd' \| 'error_max_structured_output_retries'`; success is `subtype: 'success'` with `result: string` |
| `total_cost_usd` | exists, cumulative | "Cumulative estimated cost ... for this query() call ... a resumed session continues from the total its transcript saved" (S5) |
| `TodoWrite` name and input | exists | `TodoWriteInput { todos: { content: string; status: 'pending' \| 'in_progress' \| 'completed'; activeForm: string }[] }` |
| `WebSearch` | exists | `WebSearchInput { query; allowed_domains?; blocked_domains? }` |
| `WebFetch` | exists | `WebFetchInput { url; prompt; offset? }` |
| "SDK reports it consumed" (seen) | partly | `SDKUserMessageReplay { type: 'user'; isReplay: true; uuid; session_id }` exists, but no `Options` flag turns it on; CLI flag unverified (S10) |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY`, `ENABLE_TOOL_SEARCH`, `MCP_TOOL_TIMEOUT` | exist as env names | present in `sdk.mjs` |

### Lighter checks

| Package | Mismatch only |
| --- | --- |
| `livekit-server-sdk@2.19.3` | none. `AccessToken` has `roomConfig` (`RoomConfiguration`), and `RoomAgentDispatch` and `RoomConfiguration` are exported. `metadata` is a string (M6). |
| `livekit-client@2.24.1` | none. `Room.connect`, `LocalParticipant.setMicrophoneEnabled(enabled, options?, publishOptions?)`, `RoomEvent.TrackSubscribed`, `RoomEvent.DataReceived`, `publishData(data: Uint8Array, options?)`, `ParticipantAttributesChanged` exist. |
| `@trycua/cua@0.27.4` | `memoryMb` and `timeoutMs` are `bigint`; `bash(cmd, timeoutMs: bigint \| undefined)`; `write(path, content: ArrayBuffer)`; `delete_` exists (`SpacesLike.delete_`); `start`/`stop` return `SpacePowerReport`; network setter is `setNetwork(space, settings: NetworkSettings, widen: boolean, tree: boolean)` (and `setEgress`); `thumbnail(maxAgeMs?: bigint)` returns `SpaceThumbnail`; `screenshot(options)` returns `Screenshot`; `openStream(options: SpaceStreamOptions)` returns `SpaceStreamTicket { wsUrl, ticket, mediaSessionId, ... }` (the right SDK route for W1, no gRPC-Web needed); `mcpConfig` is only on `SandboxLike` (B2); `SpaceLike` also has `agentStart` and other Cua-agent methods (cut, unused). |
| `@mlflow/claude-code@0.5.0` | `createTracedQuery(queryFn)` exports as researched; one trace per call (S11); peer `claude-agent-sdk ^0.2.0`. |
| Python (`pypi`) | `livekit-agents` and `livekit-plugins-synthesia` both 1.8.12; npm Synthesia plugin is 1.10.0 (unused). |

---

## Brief coverage (`brief.md`)

| Item | Where covered | Verdict |
| --- | --- | --- |
| Must 1. One Cua Space per employee, Cua Driver tools | W1, W2 (`desktop` http MCP) | Covered; interface unproven until 08 exists (B2) |
| Must 2. Long-horizon, reuse an open-source harness | Agent SDK as a library (D-016), `pi` fallback | Covered; the budget and turn caps break the "keeps looping" promise as written (B3) |
| Must 3. Personas from presets or a described role; portrait generated at creation | R16, cast of 8 stills | **Contradicted on purpose** ("generated at creation" replaced by a cast); surfaced as decision 1. Cast exhaustion undefined (S18). Real described-role candidate generation is unowned (S22) |
| Must 4. iMessage-style panel, self-messaging, notifications, employee-to-employee | W3, W2 section 4.6, W9 | Covered |
| Must 5. Live screen from the chat | W6, W3 | Covered; frames route missing in contracts (S20) |
| Must 6. Video call, moving face, voice, live screen copy | W5, W7 | Covered; audio and face are not verifiable unattended (S28) |
| Must 7. Summon meeting, top right, drop if hard | W3, W5, W7 section 8.3 | Covered; voice contract gaps (S12, S13) |
| Must 8. Per-employee permissions, report feasibility | `employee-runtime.md` section 6, D-021 | Covered; family keying not computable (S7); the "report back" is not listed as a morning-report item. Add it to phase 5 |
| Must 9. Main-screen access, permanent or temporary | contracts, W1 `hostDriver.ts`, W2, W3 | **Weakened**: demoted to stretch for the install; no workstream tests the grant flow (S30); Take control (S9) is separate and also unspecified |
| Must 10. Runs as an app, in the background, light | W9, soak test | Covered for `npm run dev`; a packaged `.app` is Stretch only, so "runs as an app" is the dev shell |
| Design: Astryx only, uncluttered, meeting gets its own pass | rulings, ux-spec section 4 | Covered |
| Sponsors: choose among Synthesia, ElevenLabs, Anam, fal | research 05, D-023 | Covered |
| Sponsors: Databricks only where it fits | W8, D-025 | Covered; "trace per task" does not hold (S11) |
| Figma prize | plan section 6 and phase 5; ux 7.5 | Covered by the orchestrator in phase 5; no owner or connector check beforehand (S32) |
| Out of scope: injection defences | Cut table | Covered |
| How built: one-shot overnight, Fable plus Sonnet agents, reuse over rewrite | plan section 7, workstreams | Covered; reuse = SDK, driver, viewer (accepted) |
| After the build: end-to-end test, iterate | test-plan | Covered; `scripts/e2e/*` unowned (S19) |

---

## Feasibility smells per workstream (most likely failure and the sentence that prevents it)

| W | Most likely to fail unattended | One extra sentence |
| --- | --- | --- |
| W0 | Too large; dependency install with peer conflicts (`@mlflow/*`); mock desktop images; Electron window check | Split as in B4; "install with `--legacy-peer-deps`"; "generate mock desktop PNGs with Playwright from HTML"; "verify Electron with Playwright `_electron`, not by eye" |
| W1 | `memoryMb` bigint and the Space-to-MCP route; starting a second daemon; browser WebSocket headers | "Use `3072n`; use the MCP route recorded in 08, else proxy `listTools`/`callTool`; connect to the running daemon and never stop it; confirm `websocketHeaders()` is empty for local Spaces" |
| W2 | Tool deferral; budget semantics; stale desktop URL; app-name family; relative paths | S2, B3, S3, S7, S4 as one-liners; "write a `FakeQuery` first" (S27) |
| W3 | Store bugs it cannot fix; Astryx composition for activity rows (R12); "shots" states owned by others | Give W3 `api/**`; "if `Collapsible` fights the chat layout use one `ChatSystemMessage` per step, do not spend more than 20 minutes" (already R12; repeat in the brief) |
| W4 | Hear and voices list with no data; hire failure state; Ask box states with no mock Genie | S14, S17; "W0's mock `/api/team/ask` returns a fixed answer when `capabilities.genie` is faked on" |
| W5 | Per-participant states without events; importing the missing `useLiveKit.ts`; the ring on a dark `SelectableCard` | S13, S19; keep R10's "decide by screenshot" |
| W6 | Reading `vendor/` at runtime instead of copying; `reopen` wiring; HiDPI canvas; frame fallback route | "Copy exactly `mediaSession.ts`, `mediaWire.ts`, `h264.ts`, `audio.ts`, `audioWorklet.js` (they import only each other, verified); `MediaTicket` needs `ticketExpiresAt` as an RFC 3339 string, convert from `expiresMs`" |
| W7 | Per-speaker `X-Speaker` header with stock `openai.LLM`; Synthesia access; no microphone | S12, S28; "if `FEATURE_NOT_IN_PLAN` is raised, ship audio-only and write it in the hand-back (already the plan)" |
| W8 | Databricks token or warehouse absent; MLflow per-query trace | "Finish against unit tests and the fake" (already in the brief); S11 |
| W9 | Notifications and tray unverifiable; `process.execPath` is Electron, not Node, for the child; `backgroundThrottling` | S29; "spawn office with the `node` found by `which node` at startup, resolved to an absolute path" |

"Done when" checks that need a human or a missing key, with the nearest check an agent can do:

| Check | Why not unattended | Nearest agent-doable check |
| --- | --- | --- |
| W0 `npm run dev` opens a window | No display interaction | Playwright `_electron.launch`, `page.screenshot()` |
| W2 smoke scripts | Need `ANTHROPIC_API_KEY` | `FakeQuery` vitest suite (S27) |
| W7 real call in the browser, microphone | Microphone, Synthesia key | Chromium fake-audio flags and text-mode agent test (S28) |
| W7 avatar swap latency | Needs a Synthesia key | Record "not verified" and leave `avatar_failed` path under test with a stub |
| W9 notification click opens the thread | macOS permission prompt | Test hook that records `Notification` calls and fires `click` (S29) |
| W8 against a real warehouse | Token may be absent | Recorded-response fake (already in the brief) |
| Test-plan scenarios S12, S13, S15, S16 | Microphone, host driver install, human click | Mock call script; mock host driver; tray menu read by `app.evaluate` |
| W1 smoke needing a Space | Fine if 08 passed | n/a |

---

## Ordering and time

- W0 does not yet produce everything W1 to W9 need: add the items in S19 to S25 (`useLiveKit.ts` stub, the frame route, `tracedQuery` export, the complete env list, the Vite proxy, per-area typecheck and purity scripts, the mock desktop PNGs, `MockHost`, the shots manifest).
- Hidden dependencies between parallel workstreams: W2 `runtime-desktop` needs W1's Spaces; W6 real-mode check needs W1; W5 imports W7's `useLiveKit.ts`; W3 and W4 need W0's store to be correct; W1, W2, W6 and W7 share one machine, one daemon and one RAM budget (S1, S26). The plan says "nothing else waits on anything" in section 7; only the first three are acknowledged.
- Realistic times: W0 as one agent 2 to 3 hours; split per B4 about 90 minutes. A pre-night orchestrator step (package.json, install, shared types) removes about 20 minutes of the serial path.
- Findings to write back: this file is the only change made. Nothing in `decisions.md` or `research-log.md` was edited (orchestrator-only). Items worth logging by the orchestrator: B3 (budget semantics), S11 (one trace per query, D-025 impact), and the `memoryMb: bigint` correction to research 01.
