# Workstreams: one brief per build agent

Owner: orchestrator. Each section below is handed to one Sonnet build agent, together with the common rules. The orchestrator (Claude Fable) runs them, checks every acceptance item itself, and steers. Sequence and timing are in `plan.md`. This version includes the fixes from `build/plan-review.md`.

## Common rules (prepended to every brief)

1. **Read first, in this order:** `docs/hackathon/README.md`, `docs/hackathon/brief.md`, `AGENTS.md`, `docs/hackathon/plan.md`, `docs/hackathon/spec/contracts.md`, then the files your section names. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.
2. **You own only the paths listed under "Owns".** Never create, edit, move or delete a file outside them. If you need a change elsewhere (a new dependency, a contract change, a fix in someone else's folder), describe the exact change in a message to the orchestrator and carry on with everything that does not depend on it. Other agents are working in the same tree at the same time.
3. **The contract is frozen.** `src/shared/**` and `docs/hackathon/spec/contracts.md` change only through the orchestrator.
4. **Dependencies are frozen.** Do not run `npm install <pkg>`, edit `package.json` or touch the lockfile. If something is missing, ask.
5. **No git commands that change anything** (no add, commit, checkout, stash, reset, clean). `git status` and `git diff` are fine.
6. **Never use a watch script.** Start office with `npm run office:once` (no file watching) on your own port and data folder (table below), and restart it yourself after your own edits. Other agents save files in `src/office/` all the time; a watcher would restart your process on their saves. Start servers in the background and poll; never run a foreground command that does not exit. Stop every process you started before you finish (`pgrep -f` to check).
7. **Write each file completely in one edit**, then run your area's checks, before moving on. A half-written file in the shared tree breaks other agents' imports.
8. **Your checks:** `npm run typecheck:area -- <your folder>` (reports type errors only in files under that folder), `npx vitest run <your folder>`, and for front-end folders `npm run purity -- <your folder>` (exits 1 on any Astryx purity finding there). Errors in files you do not own are not yours: do not fix them, mention them in the hand-back.
9. **Real desktops are scarce.** Each one holds about 2 GB of this Mac's memory. At most one Cua Space per agent at a time, named `test-<your id>-...`, deleted (`delete_`, not `stop`) when your script ends. Use the SDK's embedded runtime (`embedded()`); never run `cua daemon`, `cua runtime` or `cua config` commands, and never touch a Space whose name does not start with your prefix.
10. **Reuse before writing.** The research files contain code that was actually run on this machine: `research/08-cua-live-spike.md` (Cua) and `research/07-astryx-inventory.md` section 4.2 (Astryx toolchain and doctor-clean screens). Copy from them. Read library types from `node_modules` instead of guessing an API; `build/plan-review.md` has a table of the Agent SDK's real names.
11. **Front-end work:** follow `design/rulings.md`, then `design/ux-spec.md`, then `research/07-astryx-inventory.md` for props. Astryx components only. No `<div>`, `<span>`, `style=`, `className=`, CSS files, StyleX, raw hex or px. Run `npx astryx component <Name>` before using a component for the first time. Icons are `lucide-react` components passed as values. Register your screens' states in `src/renderer/src/<your area>/shots.ts` (`export const shots = [{ name, query }]`) and, before you finish, run `npm run shots -- <your area>`, open the PNGs in `shots/<your area>/` with your image reader, in light and dark, and fix what looks wrong.
12. **No extras.** Build what your section lists. No new features, settings, abstractions for the future, analytics, or security hardening. Keep comments rare.
13. **Costs.** Anything that calls a paid API uses `claude-haiku-5-5` and the smallest input that proves the point. A smoke script costs cents. Never loop a paid call.
14. **Nobody is awake.** Do not wait for a human. If a check needs a person (a microphone, a macOS permission prompt, a sign-in) or a key that is not in `.env.local`, do the nearest check you can do alone (your section names it), and say plainly in the hand-back what remains unverified.
15. **If something is impossible as specified**, do not silently build something else. Build the closest thing that works, and say exactly what differs and why.
16. **Hand-back.** When done, write `docs/hackathon/build/<your id>-handback.md`: what works (with the commands you ran and their real output, trimmed), what does not, deviations from the spec, anything the next agent must know. Then report to the orchestrator in under 250 words. Report failures as plainly as successes.

Ports and data folders:

| Agent | OFFICE_PORT | WEB_PORT | DATA_DIR |
| --- | --- | --- | --- |
| W0b, W0c, orchestrator | 4317 | 4318 | `data` |
| W1 | 4321 | | `data-w1` |
| W2 | 4322 | | `data-w2` |
| W3 | 4323 | 4333 | `data-w3` |
| W4 | 4324 | 4334 | `data-w4` |
| W5 | 4325 | 4335 | `data-w5` |
| W6 | 4326 | 4336 | `data-w6` |
| W7 | 4327 | 4337 | `data-w7` |
| W8 | 4328 | | `data-w8` |
| W9 | 4329 | 4339 | `data-w9` |
| W10 | 4330 | 4340 | `data-w10` |

---

## W0a · Skeleton (orchestrator, or one short agent; 20 minutes)

**Owns:** `package.json`, lockfile, `tsconfig*.json`, `.gitignore`, `.env.example`, `src/shared/**`, `scripts/typecheck-area.mjs`, `scripts/purity.mjs`.

**Build:**
1. `package.json`: one package, `"type": "module"`, exact versions (no `^`). Keep Astryx 0.7.16 and React 19.3.1. Add `electron@45.3.2`, `electron-vite@6.0.0`, `vite@8.3.8`, `@vitejs/plugin-react` (the version in the Astryx spike), `typescript@5.9.3`, `tsx`, `vitest`, `playwright@1.65.1`, `fastify@5.12.8`, `@fastify/static`, `@fastify/websocket`, `zod` (latest 4.x; the Agent SDK's peer is `^4`), `ulid`, `zustand@5.1.0`, `lucide-react` (the version already installed transitively), `livekit-client@2.24.1`, `livekit-server-sdk@2.19.3`, `@anthropic-ai/sdk` (latest 1.x), `@anthropic-ai/claude-agent-sdk@0.3.325`, `@trycua/cua@0.27.4`, `@modelcontextprotocol/sdk` (latest 1.x), `dotenv`, and `@mlflow/core@0.5.0`, `@mlflow/claude-code@0.5.0`. Install with `npm install --legacy-peer-deps` (the MLflow package's peer range names an older Agent SDK). Then `npx playwright install chromium` (writes to the user's cache folder; allowed).
2. Scripts: `office` and `office:once` (both `tsx src/office/main.ts`; there is no watch script), `web` (`vite --config vite.web.config.ts`), `dev` (`electron-vite dev`), `build`, `start`, `seed`, `shots`, `typecheck` (whole repo), `typecheck:area` (runs `tsc --noEmit` for the right project and prints only errors under the given folder; exit 1 if any), `purity` (runs `astryx doctor --built .` and exits 1 if a purity finding is under the given folder), `test` (`vitest run`), `check` (typecheck, test, purity on `src/renderer`).
3. `src/shared/`: `types.ts`, `events.ts`, `api.ts` (route builders, request and response types), `env.ts` (every variable in contracts section 8, with defaults), exactly as `contracts.md`.
4. `.gitignore` adds `data/`, `data-w*/`, `shots/`, `out/`, `voice/.venv/`, `vendor/cua/`, and `!.env.example` (the existing `.env.*` rule would otherwise hide it). `.env.local` already exists with the user's keys: read its variable names, never print or copy its values, and never overwrite it.

**Done when:** `npm ls` shows no missing packages; `node -e "import('@trycua/cua').then(m=>console.log(Object.keys(m).length))"` prints a number; `npx tsc --noEmit -p tsconfig.json` passes on `src/shared`.

---

## W0b · Office with complete mock mode (parallel with W0c)

**Goal:** `npm run office:once` gives every route and event in the contract, backed by mock desktops and scripted employees, with a seam for each real implementation.

**Owns (this phase only):** `src/office/**`, `scripts/seed.ts`, `scripts/e2e/mock.ts`, `config/cast.json`, `config/mock-desktops/**`.

**Read:** `spec/contracts.md` (all), `spec/employee-runtime.md` sections 1, 4 and 7, `design/ux-spec.md` section 6.3.

**Build:**
1. Boot (`main.ts`: load `.env.local`, honour `OFFICE_PORT` and `DATA_DIR`, repair after a crash as contracts section 6 says), SQLite store with migrations on `node:sqlite` (it works on this Node: verified), repositories, the full HTTP API and WebSocket, static `/media/portraits` from `config/portraits/` and `/media/voices` from `config/voices/`, and `GET /` serving `out/renderer` when it exists.
2. `presets.ts` (the 8 presets with `defaultModel`, `defaultPermissions`, `workingStyle`, `starters`), `cast.ts` reading `config/cast.json` (the 8 people of the UX spec: name, first name, personality, portrait file name, voice, `avatarId: null`). A missing portrait file gives an empty `portraitUrl`; the UI falls back to initials.
3. The seams, each a folder with an `index.ts` factory that picks an implementation from env, and a typed interface in `types.ts`:
   - `spaces/`: `Spaces` (`ensure`, `wake`, `sleep`, `reset`, `remove`, `healthy`, `exec`, `readFile`, `writeFile`, `screenshot`, `thumbnail`, `mcpEndpoint` returning `{ url, headers }`, `openStream`, `setInternet`, `state`), plus `HostDriver` (`status`, `mcpConfig`). `MockSpaces` and `MockHost` are complete. `cuaSpaces.ts` and `hostDriver.ts` are stubs that throw "not built yet", imported dynamically only when `DESKTOPS=cua`. Make the five mock desktop images as contracts section 9 says.
   - `runtime/`: `EmployeeRuntime` from the spec. `MockRuntime` is complete: the 20-second script, the "stuck" and "ask" variants, approvals that really wait for the API, a screen-grant variant ("screen" in the message makes it call the mock host and report). `claudeRuntime.ts` is a stub loaded only when `MOCK_LLM` is not `1`.
   - `employees/`: `EmployeeSupervisor` (state machine, inbox, hiring flow with the deterministic described-role mock, pause, take control, screen grant with the one-holder mutex and expiry, remove) written against the interfaces, so it is real code that W2 extends.
   - `calls/`: routes registered; mock calls as contracts section 9. Real implementation is W7's.
   - `sync/`: `team.ts` computes `TeamReport` (with `previous`) from SQLite, with unit tests (final code; W8 later adds the warehouse path around it). `databricks.ts`, `genie.ts` are no-op stubs; `tracing.ts` exports `tracedQuery = (q) => q`.
4. `scripts/seed.ts`: the four seeded employees and history from contracts section 9. `scripts/e2e/mock.ts`: drives scenarios S1, S4, S6, S8, S9 and S17 of the test plan against a running mock office over HTTP and WebSocket and exits non-zero on the first failure.

**Done when:** `npm run typecheck:area -- src/office` and `npx vitest run src/office` pass; with `MOCK_LLM=1 DESKTOPS=mock npm run office:once` and `npm run seed`, `scripts/e2e/mock.ts` passes and its output is in the hand-back.

---

## W0c · Renderer skeleton and tooling (parallel with W0b)

**Goal:** a renderer that boots in a browser and in Electron, wired to the contract, with a named placeholder for every region so later agents never touch each other's files.

**Owns (this phase only):** `src/renderer/**`, `src/main/**`, `src/preload/**`, `electron.vite.config.ts`, `vite.web.config.ts`, `scripts/shots.ts`, `README.md`.

**Read:** `spec/contracts.md` sections 1 to 4 and 7, `research/07-astryx-inventory.md` sections 4.2 and 4.4, `design/rulings.md`.

**Build:**
1. `index.html`, `main.tsx` wired exactly as `AGENTS.md` says (reset.css, astryx.css, `Theme` with `astryx-themes.js`), `App.tsx` (first run, shell, or stage; reads `?shot=<area>/<name>` and renders that area's fixture state), `api/client.ts` (relative URLs), `api/ws.ts` (reconnecting), `api/store.ts` (zustand: employees, threads, approvals, tasks, call, settings, capabilities; one action per API call).
2. Both Vite configs proxy `/api`, `/media` and `/ws` to `VITE_OFFICE_URL`; port from `WEB_PORT`.
3. Placeholders with final file names and props, each rendering a labelled Astryx `EmptyState` plus live data from the store:
   - `shell/AppFrame.tsx`, `shell/Sidebar.tsx`, `shell/TopBar.tsx`, `shell/FirstRun.tsx`, `shell/shots.ts`
   - `thread/Conversation.tsx`, `thread/shots.ts`
   - `desktop/DesktopPanel.tsx`, `desktop/shots.ts`
   - `media/SpaceView.tsx` (props `{ employeeId: string; mode: 'view' | 'control'; onState?: (s: 'connecting' | 'live' | 'offline' | 'error') => void }`; this first version polls `frame.jpg` into an `<img>` inside `AspectRatio`), `media/AvatarVideo.tsx` (props `{ track: MediaStreamTrack | null; audio: MediaStreamTrack | null; fallbackSrc: string; name: string }`)
   - `hire/HireDialog.tsx`, `profile/ProfileDrawer.tsx`, `settings/SettingsDialog.tsx`, `team/TeamView.tsx`, each with a `shots.ts`
   - `stage/Stage.tsx`, `stage/SummonPicker.tsx`, `stage/shots.ts`, `stage/useCall.ts` (interface `CallSession { state; mode; micOn; setMic(on); participants; speaker; captions; videoTrack; audioTrack; end() }`, a mock implementation driven by the WebSocket `call` events, and selection of the real one when `CallInfo.mock` is false), `stage/useLiveKit.ts` (a stub exporting the real hook's signature and throwing "not built yet")
4. `scripts/shots.ts` (Playwright): takes an optional area, imports every `src/renderer/src/*/shots.ts`, visits each state against the given office and web URLs, writes `shots/<area>/<name>-light.png` and `-dark.png` at 1280 x 800.
5. `src/main/index.ts`: one `BrowserWindow` loading the dev server or office's `/`. Nothing else (W9 builds the shell).
6. `README.md`: how to run, in 15 lines.

**Done when:** `npm run typecheck:area -- src/renderer` and `npm run purity -- src/renderer` pass; against W0b's mock office the placeholders show live data in a browser; `npm run shots` writes PNGs; a Playwright `_electron.launch` script opens the built app and saves a screenshot of its window (this replaces looking at it by eye).

---

## W1 · Desktops (Cua Spaces)

**Goal:** the real `Spaces` implementation: one Linux desktop per employee, controllable and viewable.

**Owns:** `src/office/spaces/**` (except `types.ts`), `scripts/smoke/spaces.ts`.

**Read:** `research/08-cua-live-spike.md` (all: its "Copy-paste reference" is code that ran on this machine and is your starting point; where it disagrees with any other document, it wins), then the SDK types in `node_modules/@trycua/cua/dist/`.

**Start from** the module that passed its smoke test on this machine: `<scratch>/cua-spike/cua-ref.mjs` and `cua-ref-smoke.mjs`, where `<scratch>` is `/private/tmp/claude-502/-Users-suhaan-Desktop-imperial-ai-hack/e8cda6e2-1ab7-4114-b736-8a443be0d374/scratchpad` (also printed in full in 08, "Copy-paste reference"). Port it to TypeScript; do not redesign it.

**Facts proven in the live test (08):**
- Use `embedded()`. No daemon is needed for create, exec, files, screenshot, thumbnail, stream or MCP. Images and the runtime are already downloaded (`~/.cua`, 7 GB); a warm create takes 3 to 7 seconds, the first after the runtime VM was down about 20 to 35.
- 64-bit fields are `bigint` (`memoryMb: 3072n`, timeouts); `labels` and `env` are `Map`s; `bash(command, timeoutMs)` returns `{ stdout, stderr, exitCode, timedOut, ... }`; `write` takes an `ArrayBuffer`; there is no read-into-memory call (download to a temp folder, or `cat`); `delete_` deletes.
- **`stop` wipes the desktop's files.** `sleep` is the SDK's `suspend`, `wake` is `start`. Call the SDK's `stop` nowhere. `reset` is `delete_` then create.
- The MCP endpoint comes from the sandbox handle: `embedded().sandboxes().connect('local:<name>')` then `mcpConfig('env', '/mcp')` gives `{ url, headers: [{ name: 'x-cua-env-authorization', value: 'Bearer ...' }] }`. Return it as `{ url, headers: Record<string, string> }`. The port changes every time the Space starts.
- `space.openStream({ codecs: [], maxFps: 15, maxDimension: 1280, audio: false, policy: 'view_only' | 'allow_activation' })` returns `{ wsUrl, ticket, mediaSessionId, ticketExpiresAt, ... }` with no daemon and no extra headers; the ticket lasts about 60 s unless `ticketTtlMs` is set (use 10 minutes).
- `space.thumbnail(undefined)` gives a 320 x 200 JPEG in about 20 ms.
- `spaces.setNetwork(id, NetworkSettings.create({ preset: 'internet' | 'none' }), false, false)` applies live.
- After a crash of the runtime VM, `list()` still says `running` but every call fails with "instance ... not found": `healthy()` is a 5-second `bash('true')`, and `ensure` must delete such a stale entry and create a fresh Space.
- Native errors often carry no message, only a `.tag`: log the tag.

**Build:**
1. `cuaSpaces.ts` implementing `Spaces`: Space name `emp-<lowercase ulid>`, `Image.linux()`, 2 CPUs, `3072n` MB, label `employee=<id>`, network preset from the employee's internet switch; `ensure` is idempotent (find by name, create if missing, wake if asleep, replace if stale) and reports progress through a callback; `thumbnail` cached 3 s; `mcpEndpoint`; `setInternet(on)` live.
2. `stream.ts`: `openStream(employeeId, mode)` returning the `cua-media` ticket, or `{ kind: 'frames', url }` if opening a stream throws. The `frame.jpg` route's handler is yours to provide as an exported function (`frameJpeg(employeeId)`, a PNG screenshot re-encoded to JPEG, or the thumbnail if re-encoding needs a missing dependency); the route itself already exists.
3. No daemon. No `cua` CLI calls from office except read-only ones for diagnosis.
4. `hostDriver.ts`: `status()` (is `cua-driver` installed and permitted: run its read-only status command; false if the binary is absent) and `mcpConfig()` (the stdio config). No installation.
5. `scripts/smoke/spaces.ts`: create, exec `uname -a`, write and read a file, screenshot to `shots/smoke/space.png`, thumbnail, MCP `tools/list` count, open a stream and count frames for 3 s, internet off and on, sleep, wake (the file written earlier must still be there), delete.

**Done when:** the smoke script passes end to end with real output; `DESKTOPS=cua MOCK_LLM=1` office can hire a mock employee whose `frame.jpg` shows a real Linux desktop; nothing you created is left running.

---

## W2 · Employee runtime (the brain)

**Goal:** a real employee that takes a task, works on its own desktop for as long as it takes, talks like a colleague, asks when it should, and finishes.

**Owns:** `src/office/runtime/**` (except `types.ts`), `src/office/employees/**`, `scripts/smoke/runtime-*.ts`.

**Read:** `spec/employee-runtime.md` sections 1 to 7 (your specification), `build/plan-review.md` ("SDK name table" and S2 to S10), `research/04-agent-harness.md` section 5, `research/03-cua-driver.md` sections 1, 5.2 and 10, `research/08-cua-live-spike.md` (MCP section), the SDK types in `node_modules/@anthropic-ai/claude-agent-sdk/`, and Cua's example `vendor/cua/libs/cua-driver/examples/agent-sdks/claude_agent.ts`.

**Build, in this order:**
1. `fakeQuery.ts`: a scripted async generator of SDK messages behind the same factory as the real `query`, so that everything below can be unit-tested with no key.
2. `inbox.ts`, `prompt.ts` (system prompt and briefing, verbatim from the spec), `toolGroups.ts`, `gate.ts`, `activityMapper.ts`, `watchdog.ts`, `officeTools.ts`, `spaceTools.ts`, then `claudeRuntime.ts`, then the supervisor's end-of-turn rules, task limits, restart recovery (4.8), take control (4.9), screen grant with `setMcpServers`, and real hiring of a described role (section 7: one `claude-haiku-5-5` call with a JSON schema output).
3. Unit tests (vitest, no network, using `fakeQuery`): every row of the gate's order; the activity mapper; the keep-going table and task limits; session id capture; cost delta across a resume; the colleague guards; the risky-command pattern; approval allow and deny; a screen grant and revoke against `MockHost`; recovery after a restart with a pending approval.

**Smoke scripts (need `ANTHROPIC_API_KEY`; each under $0.30; `EMPLOYEE_MODEL=claude-haiku-5-5`). If the key is absent, skip them and say so:**
- `runtime-chat.ts`: mock desktop; "hi, who are you?"; one bubble, state `idle`, no task.
- `runtime-task.ts`: mock desktop; "Create a file called hello.txt in ~/work containing today's date, then tell me you're done"; a plan or steps, a `done` bubble, the file present, cost recorded.
- `runtime-steer.ts`: start a slow task, send "actually name it hi.txt" mid-way; the final file is `hi.txt`.
- `runtime-approval.ts`: level `asks_first`; an Approval appears; approve through the API; completion. Then deny one; the employee says so and stops or finds another way.
- `runtime-desktop.ts`: real Space (only after the orchestrator says W1 has landed); "Open example.com in the browser and tell me the page heading"; the answer contains "Example Domain"; a step "Opened example.com".
- `runtime-colleagues.ts`: two employees; one exchange; the guard stops a loop.
- `runtime-resume.ts`: kill office mid-task, start it again; the session resumes and finishes.

**Done when:** unit tests pass; every smoke script that could run passes with real output in the hand-back, including the resident memory of one employee process and the cost of each script.

---

## W3 · UI core: frame, sidebar, thread, desktop panel

**Goal:** the screens the user lives in, finished to the standard in `design/rulings.md` ("What finished looks like", items 1 to 3 and 8).

**Owns:** `src/renderer/src/shell/**`, `src/renderer/src/thread/**`, `src/renderer/src/desktop/**`, `src/renderer/src/App.tsx`, `src/renderer/src/api/**` (other UI agents send you store or client fixes they need; apply them quickly).

**Read:** `design/rulings.md`, `design/ux-spec.md` sections 0, 2, 3.1 to 3.3, 3.10, 5 and 7.2, `research/07-astryx-inventory.md` sections 1.5, 2 (screens 1, 2, 8), 3.3 and the spike files in 4.2.

**Build:** AppFrame (AppShell, SideNav, top bar with identity block, Call and Desktop icon buttons, More menu, and the one primary "Summon meeting" at the far right), Sidebar (rows, presence, ordering, unread, Hire button, footer with the user's name, Team and Settings), FirstRun, Conversation (day dividers, bubbles with runs, typing, activity groups collapsed by default, approval row and its resolved form, question bubbles, composer, the states in 3.2 including "Try again" on stuck), DesktopPanel (header line with Timer, `SpaceView`, Take control and Give back wired to `POST /control` and the stream mode, Lend my screen popover, plan list, expand, the states in 3.3.2, the lent-screen banner with and without a countdown). Keyboard shortcuts from the rulings. For activity rows: if composing them with `Collapsible` fights the chat layout for more than 20 minutes, use one `ChatSystemMessage` per step (rulings R12).

**Done when:** against mock office with seed data, every state in ux-spec 3.1 to 3.3 and 3.10 is in your `shots.ts` and screenshotted in light and dark; sending a message in the UI shows the whole scripted sequence live; Approve and Deny work; a mock screen grant shows the banner and "Take it back" ends it; purity is clean; you have compared your screenshots with the wireframes and fixed what differs.

---

## W4 · UI flows: hire, profile, settings, team

**Goal:** the four secondary surfaces, same standard (rulings items 4 and 7).

**Owns:** `src/renderer/src/hire/**`, `src/renderer/src/profile/**`, `src/renderer/src/settings/**`, `src/renderer/src/team/**`.

**Read:** `design/rulings.md`, `design/ux-spec.md` sections 0, 3.4, 3.5, 3.9, 3.12, 5, 6.3, `research/07-astryx-inventory.md` sections 1.5 and 2 (screens 3, 4, 7).

**Build:** HireDialog (two steps in one dialog; preset rows; Describe a role; the proposal with Hear, Shuffle and Edit; "Hire <first name>"; "Hear" plays `persona.voice.sampleUrl` and is hidden when it is null; Edit offers personality and permission level only, no voice selector; the `team_full` message; no dialog-level boot failure), ProfileDrawer (personality, three levels, four switches, "Applies after her desktop restarts" when `pendingRestart`, desktop state with uptime from `desktopSinceMs`, restart and reset with AlertDialog; every change PATCHes at once), SettingsDialog (your name, appearance, notifications, captions; a read-only "Connections" list from `capabilities`: Model, Desktops, Calls, Databricks, each a plain row with a `StatusDot`; no microphone selector), TeamView (range control, three numbers with the "vs last period" line when `previous` exists, table, the Ask box and "Synced" line only when `capabilities.genie` or `databricks`; answer text, a small result table and a collapsed "Show query").

**Done when:** against mock office: hire a preset and a described role end to end and see the new person arrive in the sidebar and greet you; change every permission and see it persist after reload; the team view shows seeded numbers in all three ranges and, with `MOCK_GENIE=1`, an answer; all states in your `shots.ts` screenshotted in light and dark; purity clean.

---

## W5 · The stage: call and meeting screens

**Goal:** the centrepiece (rulings items 5 and 6). One `Stage` for one-to-one and meetings.

**Owns:** `src/renderer/src/stage/**` except `useLiveKit.ts` (W7's).

**Read:** `design/rulings.md` (R2, R3, R5, R8, R9, R10 especially), `design/ux-spec.md` sections 3.6, 3.7 and all of 4, `research/07-astryx-inventory.md` section 2 (screens 5 and 6) and the spike's `call-stage.tsx`.

**Build:** `layout.ts` (pure functions implementing the maths in 4.1 to 4.3; unit-tested against the table of sizes in 4.2), `Stage.tsx` (dark Theme root, top strip, tiles, caption line, docked control bar), `Tile.tsx` (face tile using `AvatarVideo`, desktop tile using `SpaceView`, name chip, state variants from the tables in 3.6.2 and 4.5 driven by `participants`), layouts A, B and C for one-to-one, grid and spotlight for 2 to 4, the swap and "Show desktop" interactions, `Captions.tsx`, `ControlBar.tsx`, `SummonPicker.tsx` (popover, Everyone, cap of 4, starts a one-to-one call when one is chosen). The one video track renders in the current speaker's tile; every other tile shows a still. Everything reads from the `CallSession` returned by `useCall()`; clicking a tile calls `POST /api/calls/:id/address`. Not built: auto bring-up of a shared desktop, add to meeting, raise hand.

**Done when:** in mock mode you can start a call from the top bar and a meeting from the picker with 2, 3 and 4 people; every state in the two state tables is in your `shots.ts` and screenshotted; layout unit tests pass; the stage looks right at 1280 x 800 and 1728 x 1117; purity clean.

---

## W6 · Live desktop view

**Goal:** the real, smooth live view of a Space inside `SpaceView`, with a fallback that always works.

**Owns:** `src/renderer/src/media/**`.

**Read:** `research/02-cua-streaming-and-apps.md` (all), `research/08-cua-live-spike.md` (stream section), the viewer source in `vendor/cua/libs/cua/crates/cua-spacesd-html5/web/src/core/` and the MIT example `vendor/cua/examples/streaming/typescript-web/app.js`.

**Build:** copy exactly `mediaSession.ts`, `mediaWire.ts`, `h264.ts`, `audio.ts` and `audioWorklet.js` into `media/cua-viewer/` (they import only each other), keeping their licence headers and adding `media/cua-viewer/NOTICE.md` (source path, commit `0147fb8d`, licence FSL-1.1-MIT, "unmodified except for import paths"). Do not import from `vendor/` at run time. `SpaceView.tsx`: asks `POST /api/employees/:id/stream`; for `cua-media` attaches a `MediaSession` to a `<canvas>` inside `AspectRatio` (the viewer's ticket wants the expiry as an RFC 3339 string: convert from `expiresMs`), reopens before the ticket expires and after a drop, opens a new session when `mode` changes, pauses when hidden, handles high-density displays; for `frames` (or after two failed attaches) polls `frame.jpg` twice a second into an `<img>`. Reports `connecting`, `live`, `offline`, `error` through `onState`. In `control` mode forwards pointer and keyboard the way the viewer does. `AvatarVideo.tsx`: attaches the given video and audio tracks to one `<video>`; shows the still when there is no track; exports `captureStill(video): Promise<Blob>`.

**Done when:** with `DESKTOPS=mock` the frames fallback shows; then, once the orchestrator says W1 has landed, with a real Space the canvas shows live motion (run a command in the Space that prints text every half second and check with Playwright screenshots two seconds apart that the canvas pixels differ) and survives two minutes including one ticket renewal; the renderer's CPU while one view is live is reported; purity clean (the only raw elements are `<canvas>`, `<video>`, `<img>`).

---

## W7 · Calls: voice worker, call mind, meeting router

**Goal:** press Call, talk to an employee, hear and see them answer from their real working context. Then a meeting.

**Owns:** `voice/**`, `src/office/calls/**`, `src/renderer/src/stage/useLiveKit.ts`, `scripts/smoke/call-*.ts`, `scripts/capture-portraits.ts`, `scripts/capture-voices.ts`, `config/portraits/**`, `config/voices/**`.

**Read:** `spec/employee-runtime.md` section 8, `spec/contracts.md` (voice endpoints, `call` events, `CallInfo`), `research/05-avatar-voice.md` sections 3, 6, 7, 10 and 11, the quickstart in `vendor/_research/interactive-avatar-quickstarts/minimal/` and the skill in `vendor/_research/skills/`.

**Build, in this order, each step working before the next:**
1. office: LiveKit token minting with agent dispatch (metadata is a JSON string), `POST /api/calls`, `DELETE`, `/address`, `/route`, the events endpoint, state changes and thread messages.
2. office: the call mind (`/voice/v1/chat/completions`). Smoke it with a script before any audio exists (`scripts/smoke/call-mind.ts`: a seeded working employee is asked "what are you doing?"; the streamed answer is in character and mentions the task).
3. `voice/agent.py` (Python 3.12 through `uv`; `pyproject.toml` pins `livekit-agents` and its plugins at 1.8.12): audio-only one-to-one. Speech in and out through LiveKit Inference by default, Deepgram or ElevenLabs when their keys exist; the language step is an overridden `llm_node` that calls our endpoints. Posts `joined`, transcripts, `speech_started`, `speech_ended` and `ended` to office. office spawns the worker at boot when LiveKit keys exist and restarts it if it dies. Check the Python side with LiveKit Agents' text test mode (a typed user turn, no audio).
4. `useLiveKit.ts`: the real `CallSession` (connect, microphone, remote tracks, data messages, clean teardown).
5. The avatar: Synthesia session attached before the agent session starts, 20-second fallback to audio-only, `avatar_ready` and `avatar_failed`. If Synthesia answers that the feature is not in the plan, ship audio-only and say so.
6. `scripts/capture-portraits.ts`: for each cast member with an avatar id, a 15-second session, one frame saved as `config/portraits/<name>.jpg` (4:5) and `<name>-sq.jpg` (square). `scripts/capture-voices.ts`: a 3-second sample per cast voice into `config/voices/`. Both skip what already exists and do nothing without keys.
7. Meetings: the router, avatar swap and voice switch per speaker, `participant`, `speaker` and `caption` events.
8. Only if all of the above is solid: raise hand, behind `CALL_HANDS=1`.

**Checks you can do without a person:** a Playwright Chromium page at `:4337` launched with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<a wav of a spoken question>` joins the call; assert that office receives a `user_transcript` and an `agent_transcript`, and record the time from the end of the audio file to `speech_started`. Make the wav with the configured text-to-speech.

**Done when:** steps 1 to 4 pass those checks (or, with no LiveKit keys, steps 1 and 2 pass and the rest is written and type-checked); step 5 when a Synthesia key exists; step 7 routes by name in a three-person meeting. The hand-back lists exactly what a person must still try at the microphone.

---

## W8 · Databricks: mirror, team report, ask, traces

**Goal:** the team's timesheet lives in Databricks, and the app never depends on it.

**Owns:** `src/office/sync/**` (including `team.ts`: keep its exported signature and its unit tests passing), `scripts/databricks-setup.ts`, `scripts/smoke/databricks.ts`.

**Read:** `research/06-databricks.md` sections 2, 3, 10, 11 and "Recommended integration" (the DDL and env names are final).

**Build:** the outbox (rows appended on every write to employees, tasks, events, messages, usage), the sink (batched idempotent MERGE through `POST /api/2.0/sql/statements`, flush every 30 s or 200 rows, a circuit breaker that opens after 3 failures for 5 minutes), `databricks-setup.ts` (runs the DDL), the team report read path (warehouse with an 8-second budget, then cache, then local), `genie.ts` behind `/api/team/ask` with a 5-per-minute limiter, and `tracing.ts`: `tracedQuery` wraps the Agent SDK `query` with `@mlflow/claude-code` when `MLFLOW_EXPERIMENT_ID` is set and is the identity otherwise. MLflow gives one trace per employee session, not per task, and it completes only when the session ends; so `Task.traceId` stays null and the Team view links to the experiment page. Unit tests for the outbox, the breaker and the MERGE builder.

**Done when:** with credentials, the smoke script creates the tables, syncs seed data, reads the team report back from the warehouse and asks Genie one question (if a Genie space id exists), with timings; without credentials, everything is silent and the local report is unchanged. If credentials are absent, finish against the unit tests and a recorded-response fake, and say so.

---

## W9 · The Mac shell

**Goal:** it behaves like a Mac app that lives in the background.

**Owns:** `src/main/**`, `src/preload/**`, `resources/**`, `electron.vite.config.ts`, `scripts/smoke/shell.ts`.

**Read:** `design/ux-spec.md` sections 3.1 (window chrome) and 3.11, `design/rulings.md` R17, `contracts.md` sections 1 and 7, `research/07-astryx-inventory.md` section 4.4.

**Build:** single-instance app; window 1280 x 800, minimum 960 x 640, hidden-inset title bar with the drag region injected by `insertCSS`, `backgroundThrottling: false`; starts office as a child using the system `node` resolved to an absolute path at startup (not Electron's own binary), stops it on quit, waits for `/api/health` before showing the window, and shows a plain native error dialog if office cannot start; closing the window hides it and the app stays in the menu bar; tray with a template icon and the native menu in 3.11 (people with states, Summon meeting, Hire, Pause everyone or Resume everyone, Open, Quit; "Take it back" while the screen is lent); native notifications with the portrait, click opens the thread; Dock badge; `askMicrophone`; the preload bridge exactly as the contract. With `AGENT_MANAGER_TEST=1` notifications are recorded in memory and exposed to tests instead of shown, and the click handler can be fired by a test. An app icon and a tray icon as simple monochrome template PNGs in `resources/`.

**Done when (all by `scripts/smoke/shell.ts`, Playwright `_electron`):** the app launches and a screenshot of its window is saved; the tray menu's labels, read through `app.evaluate`, list the seeded team and the actions; a mock approval produces a recorded notification, and firing its click selects that thread; after quit, `pgrep -f "src/office/main"` is empty. The hand-back says that real notification display and the microphone prompt were not seen by a person.

---

## W10 · Integration tests (phase 3)

**Goal:** scripts that prove the product's promises against the real thing, and that the orchestrator can rerun after every fix.

**Owns:** `scripts/e2e/real.ts`, `scripts/e2e/ui.ts`, `scripts/e2e/soak.ts`, `scripts/e2e/lib/**`.

**Read:** `spec/test-plan.md` (all), the hand-backs in `docs/hackathon/build/`.

**Build:** `real.ts` (real model on `claude-haiku-5-5`, real desktops; scenarios S1 to S10 over HTTP and WebSocket, one at a time, with a named result per scenario and evidence saved under `shots/e2e/`), `ui.ts` (Playwright against the renderer and real office: S1, S2, S4, S9, S14 and S17 through the UI, with a screenshot at each step), `soak.ts` (three employees, three different tasks, 30 minutes; samples host memory and each process's memory every minute; stops if free memory falls under 6 GB; prints a table). Every script deletes what it creates.

**Done when:** each script runs to the end and prints a pass or fail per scenario with the evidence paths. Failures are reported, not fixed: fixing belongs to the owner of the failing area.
