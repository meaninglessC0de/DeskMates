# W0b hand-back: office with complete mock mode

Status: done. All four "done when" items pass (outputs below, trimmed). Nothing is left running (see the end).

## Files (all new)
`src/office/`: `main.ts` (boot, `createOffice()` for tests), `bus.ts`, `ids.ts`, `errors.ts`, `speed.ts`, `presets.ts`, `cast.ts`, `testkit.ts` (test helpers), `store/store.ts` (+ test), `routes/server.ts`, `employees/{office,supervisor,hiring,briefing}.ts` (+ `supervisor.test.ts`), and the four seams `spaces/`, `runtime/`, `calls/`, `sync/` (below). Also `scripts/seed.ts`, `scripts/e2e/mock.ts`, `config/cast.json`, `config/mock-desktops/` (10 JPEGs), `src/office/spaces/mock/{terminal.html,browser.html,make-images.ts}`.

## Evidence
1. `npm run typecheck:area -- src/office` -> `no type errors under src/office (tsconfig.office.json)`. `npm run typecheck:area -- scripts` is clean too. `npx vitest run src/office` -> `Test Files 3 passed (3)  Tests 34 passed (34)` (run three times in a row, stable).
   Tests: store repositories (6), team report incl. `previous` and `null` previous (4), supervisor with the mock runtime (24): hire, full script, message and steering, approve, deny, asks_first tool approval, question and answer, pause and resume, take control, stuck and Try again, screen grant (one holder, take back, expiry, host_off, the "screen" script, request refused), desktop restart/stop/start/reset, message to an offline employee, remove (also while an approval waits), colleague tools and the three-message chain guard, restart recovery of a pending approval (second office on the same data dir and database), a waiting question and a stopped desktop surviving a restart, nudges then stuck, the task budget question.
2. Office started as `MOCK_LLM=1 DESKTOPS=mock MOCK_SPEED=1 DATA_DIR=data npm run office:once`, then `npm run seed`:
```
hired Maya, Priya, Jonas, Ines
history: 56 tasks, 60 messages
ready: Maya (needs_you), Priya (working), Jonas (idle), Ines (idle)
GET /api/health -> {"ok":true,"version":"1.0.0","capabilities":{"llm":true,"desktops":"mock","calls":"audio","databricks":false,"genie":false,"hostScreen":true}}
GET /api/employees -> Maya Okafor needs_you | Publish the draft / Priya Raman working | Looking at competitors / Jonas Weber idle | Researcher / Ines Moreau idle | Designer
thumbnail.jpg 200 image/jpeg 9033 bytes      frame.jpg 200 image/jpeg 24167 bytes (bytes start ffd8 ffe0)
```
3. `MOCK_SPEED=20 npx tsx scripts/e2e/mock.ts` against an office started with `MOCK_SPEED=20` (over HTTP and the WebSocket; it starts from a clean slate and re-runs the seed at the end, `--keep` skips that):
```
PASS S1 Hire Maya from the preset (305 ms) - starting in 4 ms, greeting arrived unprompted, frame 34860 B, thumbnail 9033 B
PASS S4 Approval: approve, then deny (1788 ms) - approved run finished the 4-step plan; denied run said "Understood, I won't go ahead with that. ..."
PASS S6 A question sorts to the top and a reply resumes (113 ms) - question "Which colour should the main heading be?"
PASS S8 Stuck, banner state, Try again (680 ms) - stuck with "I couldn't get the site to load or let…", recovered through resume
PASS S9 Pause, resume, restart, reset, remove (286 ms) - pause, control, restart, stop, start, reset and remove all behaved; no orphan folders
PASS S17 No keys: disabled states and no errors (11 ms) - ask refused with 409 genie_off, calls refused with 409 calls_off, 6 read routes answer 200
6 of 6 scenarios passed
```
4. Every route answered (curl loop against the seeded office; ids shortened). Expected non-200s are marked:
```
GET /api/health 200 | GET /api/presets 200 | GET /api/employees 200 | POST /api/candidates 409 (team of four is full)
GET /api/employees/:id 200 | PATCH /api/employees/:id 200 | POST .../pause 200 | .../resume 200 | .../control 200 (x2)
GET .../thread?limit=10 200 | POST .../messages 200 | POST .../read 204 | POST /api/approvals/:id 200
GET .../thumbnail.jpg 200 | GET .../frame.jpg 200 | POST .../stream 200 | POST .../screen-grant 200 | second employee 409 | DELETE .../screen-grant 200
POST /api/calls 200 (mock call) | POST /api/calls/:id/address 204 | DELETE /api/calls/:id 204
POST /voice/calls/:id/route 200 | .../events 204 | POST /voice/v1/chat/completions 200 (SSE)
GET /api/team?range=today|week|month 200 | POST /api/team/ask 409 (genie_off) | GET /api/settings 200 | PATCH /api/settings 200
GET /media/portraits/maya.jpg 404 | GET /media/voices/maya.mp3 404 (files do not exist yet)
POST .../desktop/restart|stop|start|reset 200 | DELETE /api/employees/:id 204 | POST /api/employees {bad token} 400
POST /api/employees 200 (hire after a removal) | DELETE 204 | GET removed 404 | GET /api/nope 404 | GET / 200 (serves out/renderer, it exists)
```
Also: `DESKTOPS=cua` (the default in `readEnv`) exits with `[office] could not start: Cua desktops are not built yet (src/office/spaces/cuaSpaces.ts). Run with DESKTOPS=mock.` (exit 1) until W1 lands.

## The seams (what W1, W2, W7, W8 build against)
Rule kept: outside a seam's folder only `index.ts` and `types.ts` are imported. Each seam has `types.ts`, `index.ts` (factory, dynamic `import()` of the real file), a complete mock, and a real-file stub that throws "not built yet".

**`spaces/`** (W1 replaces `cuaSpaces.ts` and `hostDriver.ts`). `Spaces` is keyed by employee id: `ensure(id, {internet, onProgress})`, `wake`, `sleep`, `reset(id, opts)`, `remove`, `healthy`, `exec(id, cmd, {timeoutMs})` -> `{stdout, stderr, exitCode, timedOut}`, `readFile(id, path)` (utf8), `writeFile(id, path, string|Uint8Array)`, `screenshot(id)` (**full-size JPEG Buffer, fresh each call; backs frame.jpg**: office calls it, you do not provide a route handler), `thumbnail(id)` (480 px JPEG Buffer; office caches 3 s), `mcpEndpoint(id)` -> `{url, headers: Record<string,string>}`, `openStream(id, mode)` -> `StreamResponse`, `setInternet(id, on)` (reject if it cannot apply live: the supervisor then sets `pendingRestart`), `state(id)` -> `absent|asleep|running|error`. `ensure/wake/reset` return `{ id: 'local:emp-...', state }` (stored as `Employee.spaceId`). Factories: `createCuaSpaces({dataDir, env})` and `createHostDriver({env})` (stubs). `HostDriver`: `status()` -> `{installed, permitted, detail}`, `mcpConfig()` -> stdio config, optional `mockCall(tool)` (mock only). Mock keeps desktop state on disk (`<DATA_DIR>/mock-spaces/<id>/`, `.asleep` marker) so it survives an office restart like a real Space; its `exec` really runs `/bin/sh -c` with cwd inside that folder (dev only).

**`runtime/`** (W2 replaces `claudeRuntime.ts`). `EmployeeRuntime` and `InboxItem` exactly as the spec. A runtime is built by `RuntimeFactory = (deps: RuntimeDeps) => EmployeeRuntime` with `deps = { env, host: RuntimeHost, spaces, hostDriver, home, signal }`. **`RuntimeHost` is the port the supervisor offers** (everything a runtime may do): the eleven office tools as methods (`messageUser, askUser, requestApproval({title,detail,kind?}) -> {approved,note,scope}, finishTask, reportStuck, setActivity, messageColleague, listColleagues, saveNote, requestScreen -> text, releaseScreen`, each returning the tool text) and reports (`employee(), sessionStarted(id), turnStarted(), turnEnded({interrupted?, error?, costUsd, inputTokens, outputTokens, numTurns}), toolUsed('desktop'|'space'|'web'), step(sentence,{status?,peer?}), endStep(id,status,sentence?), setPlan(steps), noteSdkMessage()`). The supervisor applies the keep-going table, nudges, limits, task open/close, typing, "seen", steps de-duplication; the runtime only reports. `onPermissionsChanged()` is called after a permissions PATCH: **the runtime must build and deliver the `<office>` notice itself** (the supervisor does not). The supervisor delivers the briefing (plain text, no tags: wrap it) as the first item of every start, then the intro item (`You have just been hired...`, restart notes), then items held while it was down. `toolUsed` opens the task; `setPlan` opens one if needed.

**`calls/`** (W7 replaces `realCalls.ts`). `Calls`: `mode()`, `start(ids)`, `end(callId)`, `address(callId, id)`, `route(callId, utterance)`, `chat(callId, speakerId, req, signal): AsyncIterable<string>` (text deltas; office formats the SSE), `event(callId, ev)`, `boot()`, `stop()`. Factory `createCalls(env, host: CallsHost)`: real when LiveKit keys are set and `MOCK_LLM` is off, else the scripted mock when `MOCK_LLM=1`, else `mode() === 'off'`. `CallsHost` is the only door into office: `emit, employee(id), setOnCall(id, callId|null), postSystemMessage, deliverToWorker(id, InboxItem), situation(id)` (state, task, plan, last 8 steps, last 6 bubbles, waiting-on, notes, user name: exactly the call-mind prompt inputs), `screenshot(id)`. Throw `CallError(status, code, message)` for refusals.

**`sync/`** (W8). `Sync`: `status()` -> `{databricks, genie, syncedMs}`, `record(table, row)` (called after every write to employees, tasks, steps, messages, usage: the outbox hook; the store's `onWrite`), `teamReport(range)`, `ask(question, conversationId)`, `boot()`, `stop()`. `createSync({env, data: TeamData})` returns the local implementation unless `DATABRICKS_SYNC=on` and host, token and warehouse are set; then it imports `databricks.ts` (stub: throws) and **falls back to local with a console warning** if that throws. `team.ts` exports `computeTeamReport(data, range, now?)` (final, tested) and `periodFor`. `genie.ts` and `databricks.ts` are stubs; `tracing.ts` exports `tracedQuery = (q) => q`. With `MOCK_GENIE=1` the local sync answers `/api/team/ask` with a fixed-shape answer built from local data.

## Behaviour worth knowing
- **Mock script (`MOCK_SPEED` read straight from `process.env`; it is not in `src/shared/env.ts`)**: any message runs reply (1.5 s), three steps, a four-step plan ticking, an approval at about 12 s, then two steps and a `done` bubble (about 20 s). Keywords: "stuck" (two steps, the second fails, then `report_stuck`), "ask" (a question, then a short finish after the answer), "screen" (asks for the screen if not already lent, reads a window through `MockHost`, reports, releases), "long" (a 4-minute working loop with `set_activity` sentences; Priya in the seed). Approval kind is `tool` titled "Save a file" at level `asks_first`, else `big_step` "Publish the draft". Deny: she says "Understood, I won't go ahead with that..." and finishes. A manager message while working is steered ("Got it, I'll fold that in.") and marked seen; one that arrives while she is idle or in her greeting is queued.
- State derivation is one function (`supervisor.compute`): desktop starting/down, paused or controlled, stuck, pending approval or question (needs_you), on_call, open task (working), idle. `stateDetail` is clipped to 40 characters with an ellipsis.
- Tasks: opened by the first `toolUsed`/`setPlan`; the title is the last manager message cut to 60; `blocked` while needs_you; `activeMs` counts time in `working`; cost, tokens and turns come from each `turnEnded`; a `usage` row per turn. "Try again" reopens the failed task.
- Restart recovery: pending approvals become `expired`, running steps close, screen grants clear, running desktops get their runtime back with the briefing and the 4.8 notice, stopped desktops stay `offline`, a waiting question keeps `needs_you`.
- Thread route: `messages` newest page first, each list oldest first inside the page; `task` is the open task, else the latest one (any status).
- WebSocket: `hello` on connect; client `ping` is accepted and ignored (there is no pong in the contract).
- `GET /api/employees/:id/frame.jpg` serves the last frame if called again within 250 ms (4 per second limit) instead of a 429.
- Dev routes exist only when `MOCK_LLM=1`: `POST /api/dev/seed` (raw upsert of employees patches, tasks, messages, steps, approvals) and `POST /api/dev/capabilities` (body overrides any `Capabilities` field, e.g. `{"calls":"off"}` to see the disabled Call, Summon and Ask states; `{}` resets). Useful for W3 to W5 shots.
- `capabilities.calls` is `'audio'` in mock mode (scripted calls) and `'off'` without LiveKit keys otherwise; `capabilities.llm` is true in mock mode.
- Cast: `config/cast.json` is a plain array of 8 with an extra `roleKey` and `id` per person (needed to prefer the person whose role matches). A preset candidate is the free cast member whose role matches, else the first free one, so a Shuffle gives a different face with the preset's role and **that person's own personality line** (for example Priya as a web developer reads "Warm and curious. Thinks in audiences."). Candidate tokens are stateless (base64url of the persona and cast id). Portrait and voice sample URLs are recomputed from disk at candidate and hire time: `portraitUrl` is `''` and `sampleUrl` null until files exist (`config/portraits/<first>.jpg`; voices are looked for as `config/voices/<first lowercase>.(mp3|wav|m4a|ogg)`, W7 may rename).
- The described-role hire is deterministic and offline in every mode (`employees/hiring.ts: describeRole`); W2 replaces it with the Haiku call.

## Deviations and contract problems
1. `MOCK_SPEED` is not in `Env` (read from `process.env` in `src/office/speed.ts`).
2. Error codes beyond `ApiErrorCode` in `src/shared/api.ts`: `not_pending` (409, approval already handled), `candidate_taken` (409), `calls_off` (409), `employee_unavailable` and `employee_busy` (409, call refused), `desktop_off` (404, thumbnail/frame/stream of an off desktop). Suggest adding them to the union.
3. Hire and call creation answer 200 (not 201) to match "Returns Employee/CallInfo" in the table.
4. Contract 9 says mock calls exist; section 8 says no keys means calls are off. Resolved as above (mock reports `audio`), with the dev override to see the off state.
5. `ThreadResponse.task`: contract does not say which task; latest (see above).
6. Static files: `/media/portraits` and `/media/voices` are small hand-written handlers (read from disk on every request), not `@fastify/static`, because `config/portraits/` does not exist yet and a missing root throws at registration. `@fastify/static` serves `out/renderer` (registered at boot only if `out/renderer/index.html` exists, with an index fallback for unknown non-API paths).
7. Ownership gap: `src/office/main.ts`, `routes/`, `store/`, `bus.ts`, `presets.ts`, `cast.ts` have no owner after W0b. `CallsHost` is implemented in `employees/office.ts`, which is W2's folder; if W7 needs more from office it needs a change there (or by the orchestrator). Adding a route belongs in `routes/server.ts`.
8. Not done / not verified: nothing was shown to a browser (W0c's renderer was not run against this office by me); `pendingRestart` is set for personality, working style and model edits and for an internet change the Space refuses, but the mock Space never refuses, so the "Applies after her desktop restarts" line only appears after a personality or model edit in mock mode; the watchdog's stall detection is implemented but only unit-tested through nudges (no 4-minute test); `request_screen` while the user's own grant is live is not specially handled.
9. `npm audit` and the experimental `node:sqlite` warning are unchanged (the warning did not print on Node 26.12).

## Cleanup
Office was stopped and `pgrep -f "src/office/main"` is empty (see the final report). `data/` (gitignored) still holds the seeded database; delete it for a clean start.
