# Build plan (the one plan; edit in place)

**Status (2026-11-14, 22:30):** research finished, design finished, plan written and independently reviewed (`build/plan-review.md`: 4 blockers and 32 gaps found, all folded back into the specs). The user has made the four scope decisions (section 10). Waiting on the keys and permissions in `spec/preflight.md`. No product code exists yet.

This file is the map. The detail lives in:

| File | Holds |
| --- | --- |
| [brief.md](brief.md) | What the user asked for |
| [spec/contracts.md](spec/contracts.md) | Data model, HTTP and WebSocket API, tools, env, mock mode. Frozen interface between agents |
| [spec/employee-runtime.md](spec/employee-runtime.md) | How an employee thinks and works: loop, prompts, permissions, calls |
| [design/ux-spec.md](design/ux-spec.md) and [design/rulings.md](design/rulings.md) | Every screen; the rulings win where they differ |
| [spec/workstreams.md](spec/workstreams.md) | One brief per build agent, with acceptance checks |
| [spec/test-plan.md](spec/test-plan.md) | Scenarios, the fix loop, exit criteria |
| [spec/preflight.md](spec/preflight.md) | What the user must provide and what is proven before the night |
| [research/](research/) | Evidence: 01 Cua runtime, 02 Cua streaming, 03 Cua Driver, 04 agent harness, 05 avatar and voice, 06 Databricks, 07 Astryx, 08 live Cua test |

## 1. Product in one paragraph

Agent Manager (working name) is a Mac app where you hire a small team of AI employees. Each has a name, a face, a voice, a role and its own Linux desktop running on your Mac, separate from yours. You talk to each one in an iMessage-style thread. Give one a task and it works on its desktop for as long as it takes, showing a short plan and a quiet line for each thing it does, asking you only when its permission level says it should. You can watch any desktop live, take control of it, video-call an employee (a moving face next to its screen), or summon several into a meeting. A Team view shows hours, tasks and cost per employee, mirrored to Databricks. The app lives in the menu bar and notifies you when someone needs you.

## 2. What the research settled

| Question | Answer | Evidence |
| --- | --- | --- |
| What did "Meta Muse, OpenAI Dots, Claude Duet" mean? | Three real, closed products from the last ten weeks: always-on personal agents with their own cloud computer that message you first. Nothing to fork; the pattern is our brief. | 04 |
| Which agent harness? | **Claude Agent SDK** (TypeScript) as a library: one long session per employee. It already has approval callbacks, mid-task steering, compaction, resume and budgets, and Cua ships a working example on it. Fallback: `pi` behind the same interface. | 04 |
| What is a "Cua Space"? | A desktop with Cua's daemon inside. On this Mac: a Linux desktop (container in a small VM that Cua manages itself, no Docker, 3 to 7 s to create once warm) or a macOS VM (24 GB image, **at most two running**, by Apple's limit). | 01, 03 |
| Does it really work here? | **Yes, proven live.** `npm i @trycua/cua` with no installer, account or prompt; a Linux desktop came up; the driver opened example.com, clicked, typed and ran commands; the H.264 stream delivered frames; internet on and off switched live. About 2 GB of host memory per desktop, so **4 employees at most** on this 32 GB Mac. | 08 |
| How does an employee operate its desktop? | The Space serves Cua Driver as an MCP server over HTTP. One config entry binds an employee to its own desktop. Shell and files come from the Space daemon. | 03 |
| How do we show the desktop live? | Cua streams H.264 over a local WebSocket; a self-contained browser viewer can be copied into our app. A snapshot call gives thumbnails. Fallback: polling frames. | 02 |
| Fork Cua's own app? | No. Its apps need a Rust build and carry their own UI kit. We build our own Astryx app and use Cua's SDK, driver and viewer. | 02 |
| Per-employee permissions? | **Feasible.** Enforced in our harness (tool groups, an approval callback, live changes), plus the Space's network on or off. Three levels and four switches. | 03, 01 |
| Lend the user's real screen to one employee? | **Feasible**, as a second driver on the host attached to one employee at a time and revocable. Needs a one-time install and two macOS permission clicks by the user. | 03 |
| Which avatar provider? | **Synthesia** for the moving face (the bounty in our own track). It only animates its own synthetic avatars, so faces come from a cast of about 8, and the portrait is a still of the same avatar. Speech comes from LiveKit's included speech, Deepgram or ElevenLabs. Anam is the only provider that animates a freshly generated face, but its free tier caps calls at 3 minutes. | 05 |
| Group meeting? | **Feasible in a staged form:** one room, one avatar session that swaps faces, our app decides who speaks. One voice at a time. | 05 |
| Databricks, without forcing it? | The team's timesheet and audit store: local SQLite is the source of truth, mirrored to Delta tables; the Team view reads the warehouse; an "Ask about your team" box uses Genie; one MLflow trace per employee session if the Free Edition allows. Running the employees' model on Databricks is ruled out. | 06 |
| Astryx for everything? | Yes. A Vite 8 + React 19 build passes `astryx doctor` clean. Gaps (video tiles, a pinned control bar, icons) all have Astryx-only compositions. No StyleX, no other UI library. | 07 |
| Figma prize | No public rule text exists. The plan: push the finished hero screens into a Figma file with the Figma connector, plus one page documenting the system. | 07, ux-spec 7.5 |

## 3. Architecture

```
┌──────────────────────────── the user's Mac ─────────────────────────────┐
│                                                                          │
│  Electron shell ── window, tray, notifications, mic permission           │
│      │ starts                                                            │
│      ▼                                                                   │
│  office (Node daemon, 127.0.0.1:4317) ◄──HTTP + WebSocket── renderer     │
│   ├─ store (SQLite)                                   (React + Astryx,   │
│   ├─ EmployeeSupervisor × N                            also runs in a    │
│   │    ├─ Claude Agent SDK session ──► Anthropic API   browser tab)      │
│   │    ├─ permission gate, inbox, watchdog                               │
│   │    └─ tools: desktop (HTTP MCP) · space · office · host              │
│   │                  │                         │                         │
│   ├─ Spaces (Cua SDK) ─► Cua runtime VM         └─► Cua Driver on the    │
│   │                       ├─ Space A (Linux desktop + daemon)  real Mac  │
│   │                       ├─ Space B                      (only during   │
│   │                       └─ Space C                       a screen      │
│   │     live video ◄── WebSocket (H.264) ──► renderer      grant)        │
│   ├─ calls: tokens, call mind (fast model), meeting router               │
│   │      ▲ localhost                                                     │
│   │  voice worker (Python, LiveKit Agents) ──► LiveKit Cloud ◄── renderer│
│   │                                              ▲                       │
│   │                                   Synthesia avatar (joins the room)  │
│   └─ sync: outbox ──► Databricks (Delta tables, Genie, MLflow)           │
└──────────────────────────────────────────────────────────────────────────┘
```

Why it is shaped this way:
- **A daemon with a thin shell.** Everything stateful is a plain Node process with an HTTP API. Build agents and tests can drive the whole product with `curl` and a browser tab, with no Electron in the loop, and the app keeps working with the window closed.
- **The harness runs on the host; the hands are in the Space.** The employee's session has no host file or shell tools at all. Its only way to touch a computer is its own desktop, so isolation does not depend on the model behaving.
- **Two minds per employee.** The long-running worker cannot answer a spoken question in a second, so a small fast "call mind" speaks for the employee on calls. It reads the worker's live situation and passes instructions back.
- **Mock mode is a first-class implementation**, not a test stub: scripted employees and fake desktops behind the same interfaces. The whole UI is built and judged against it before any key exists, and it is the demo's last-resort fallback.
- **Memory sets the team size.** Each desktop holds about 2 GB for as long as it exists (measured), and this Mac idles at 19 GB used. The team is capped at 4 (`MAX_TEAM`), the Cua runtime VM at 12 GB and 6 CPUs (already set in `~/.cua/config.toml` by the live test), each desktop at 2 CPUs and 3 GB.
- **Every outside service is optional at runtime.** No LiveKit keys: calls are disabled with a one-line reason. No Databricks: local numbers. No Synthesia: audio-only calls.

Stack, pinned: Node 26, TypeScript 5.9.3, Electron 45.3.2, electron-vite 6.0.0, Vite 8.3.8, React 19.3.1, Astryx 0.7.16, Fastify 5, `node:sqlite`, zustand 5, `@anthropic-ai/claude-agent-sdk` 0.3.325, `@trycua/cua` 0.27.4, `livekit-client` 2.24, `livekit-server-sdk` 2.19, Python 3.12 with `livekit-agents` 1.8 and `livekit-plugins-synthesia` 1.8 through `uv`.

Models: employees default to `claude-sonnet-5-5` (decision 3); the call mind, hiring a described role and all tests use `claude-haiku-5-5`.

## 4. Repository layout

```
AgentManager/
  package.json                  one package, exact versions
  electron.vite.config.ts  vite.web.config.ts  tsconfig*.json
  astryx-themes.js              generated, never edited
  .env.example   .env.local (ignored)
  config/cast.json  config/portraits/
  src/shared/                   the contract in TypeScript
  src/office/                   the daemon
    main.ts  http/  ws.ts  store/
    employees/                  supervisor, hiring, presets, cast
    runtime/                    Claude runtime, mock runtime, gate, prompt, tools, watchdog
    spaces/                     Cua and mock desktops, stream, host driver
    calls/                      LiveKit, call mind, router, worker supervision
    sync/                       outbox, Databricks, team report, Genie, tracing
  src/main/  src/preload/       Electron
  src/renderer/src/             shell/ thread/ desktop/ media/ hire/ profile/ settings/ team/ stage/ api/
  voice/                        Python worker
  scripts/                      seed, shots, smoke/, e2e/, databricks-setup, capture-portraits
  data/ (ignored)   shots/ (ignored)
  vendor/cua/ (ignored; shallow clone at 0147fb8d, reference and source of the copied viewer)
  docs/hackathon/
```

`vendor/cua` stays out of git (610 MB). The few viewer files we use are copied into `src/renderer/src/media/cua-viewer/` with their licence headers. Cua itself is consumed as the published `@trycua/cua` package.

## 5. Scope

| Tier | Items |
| --- | --- |
| **Must** (the night is a failure without these) | Hire from presets and from a description · one Linux desktop per employee · the long-running loop with plan, activity lines, steering, finish and stuck · approvals with three permission levels and four switches · chat with unread, ordering and notifications · live desktop in the panel (smooth stream, or frames as the fallback) · pause, resume, restart, reset, remove · restart-safe sessions · Team view from local data · tray and background running · mock mode · everything Astryx, doctor clean, light and dark |
| **Should** (expected, each has a clean off state) | One-to-one call, audio first then the Synthesia face · take control of a desktop · teammates messaging each other · Databricks mirror, Team view from the warehouse, Ask box · the meeting (staged, one voice at a time) · Figma file of the hero screens |
| **Stretch** (only when everything above passes) | Lend my screen on the real Mac (the grant flow itself is built and tested tonight against a mock host; the real host driver needs the user's install and two permission clicks) · MLflow trace per employee session · raise hand in meetings · packaged `.app` with icon |
| **Cut** | Everything in the "Cut" table of `design/rulings.md` · macOS desktops (user decision) · prompt-injection defences · teleporting signed-in apps · Cua's own agent layer · charts · Anam, fal |

## 6. Sub-track coverage

| Prize | Where it shows in the product | How judges see it in 30 seconds |
| --- | --- | --- |
| Main track: Autonomous Agents | Employees that plan, use a real computer, run code, recover, ask, finish, and work in parallel for hours | Give Maya a build task, watch her desktop, steer her mid-task, approve one step, see the result |
| Synthesia | The call and the meeting: the employee's face answers from its live working context, next to its screen | Call Maya: "What are you doing right now?" She answers correctly. "Make it green." It turns green on her screen |
| Databricks | Timesheets and audit in Delta, the Team view, Ask (Genie), traces (MLflow) | Team view "Synced just now", ask "Who cost the most this week and on what?", open an employee's session trace in MLflow |
| Figma | The whole app: one calm system, monochrome chrome, faces as the only colour, and a Figma file generated from the real components | Open the app. Then the Figma file with the hero frames and the system page |

## 7. The build, phase by phase

All build agents are Sonnet. The orchestrator (Fable) briefs, checks, steers and decides; it does not trust a report without running the acceptance commands itself.

| Phase | Who | What | Rough time |
| --- | --- | --- | --- |
| 0. Preflight | user + orchestrator | `spec/preflight.md` parts A, B, C | 45 min, user present |
| 1. Foundation | W0a (orchestrator or a short agent), then W0b and W0c together | Dependencies and the contract in code (20 min); then office with complete mock mode, and the renderer skeleton with tooling, in parallel | 90 min |
| — gate — | orchestrator | `npm run check`, `scripts/e2e/mock.ts`, first screenshots, an Electron window screenshot. Commit. | 15 min |
| 2. Parallel build | W1 to W9 together | Desktops · employee runtime · UI core · UI flows · stage · live view · calls · Databricks · Mac shell | 2 to 3 h |
| — gates — | orchestrator | Each workstream's "Done when", run by the orchestrator as it lands; corrections sent back to the same agent | rolling |
| 3. Integration | orchestrator + W10 + fix agents | W10 writes `scripts/e2e/real.ts`, `ui.ts`, `soak.ts`; real mode end to end by API, scenarios S1 to S10. Fix seams. Commit. | 60 to 90 min |
| 4. End-to-end and polish | orchestrator + test and fix agents | Through the UI and the Mac app: all scenarios, the visual review against `design/rulings.md`, the soak test, the fix loop | 2 h |
| 5. Wrap | orchestrator | Figma file, demo data and script, README, screenshots, `decisions.md` and `research-log.md` brought up to date, morning report, final commit | 45 min |

Dependencies inside phase 2: W2 (runtime) and W6 (live view) start against the mock and run their real-desktop checks only after the orchestrator announces that W1 has landed. W5 (stage) builds against scripted call events and gets real tracks when W7's `useLiveKit.ts` lands. W3 owns the shared API client and store, so W4, W5 and W6 send it the fixes they need. W1, W2, W6 and W7 share one machine, one Cua runtime VM and one memory budget: one real desktop per agent, and the orchestrator sequences the heavier tests in `build/log.md`. W3, W4, W8 and W9 need only the foundation.

### How the orchestrator runs the night

- **Briefs.** Each agent gets the common rules plus its section of `spec/workstreams.md`, verbatim, plus any corrections from preflight. Every brief repeats: read `docs/hackathon/README.md` first; front end must use Astryx; write findings back to `docs/hackathon/`.
- **One tree, separate folders.** Agents share the working tree and own disjoint paths. Only W0a touches dependencies. Each agent has its own ports and data folder, runs office without a file watcher, writes whole files, and checks only its own folder (`typecheck:area`, `purity`).
- **Memory.** `docs/hackathon/build/log.md` is the orchestrator's running record (phase, what landed, what failed, decisions, next action), appended at every gate, so the night survives context compaction. Agents leave `build/<id>-handback.md`. Issues live in `build/issues.md`.
- **Steering.** When an agent drifts (a raw element, a new dependency, a file outside its folder, a feature nobody asked for), the orchestrator messages it with the exact correction. Two failed attempts at the same thing means a fresh agent with the full history, or the orchestrator narrows the task.
- **Contract changes** go through the orchestrator, are made once in `src/shared/` and `contracts.md`, and are announced to every agent that uses the changed part.
- **Commits.** On a branch `build/night-1`, at each gate, if the user allows (preflight A7). Nothing is pushed without the user's say.
- **Stall guard.** A 30-minute scheduled check-in re-reads the log and continues.
- **Cutting.** If a Should item is not passing by the end of phase 4's second fix round, it is switched off cleanly and reported, rather than left half-working.

## 8. Demo script (3 minutes)

1. Open the app: four faces, one amber dot. "This is my team."
2. Click Maya (needs you): she asks to deploy; Approve. Activity lines collapse into "Worked for 6 min".
3. Open her desktop panel: her real Linux desktop, live, mid-task. Type "make the heading blue" in the chat: she changes course.
4. Hire a new person by describing a role: a face, a name, one line of personality. Hire. Their desktop boots and they say hello by themselves.
5. Call Maya: her face, her screen. "What are you working on?" She answers from her actual state.
6. Summon meeting with three people: "Priya, what's the tagline?" Priya answers; click Jonas's tile, he answers.
7. Team view: hours, tasks, cost, "Synced just now" from Databricks. Ask: "Who cost the most this week?"
8. Close the window. A notification arrives from the menu bar: "Maya: Finished the page. Take a look?"

Recorded fallbacks for steps 5 to 7 are captured in phase 5.

## 9. Risks and what happens if they bite

| Risk | Likelihood | What we do |
| --- | --- | --- |
| No Anthropic key before the night | the user decides | Build and verify everything in mock mode; real-mode phases wait for the morning |
| Cua's stream viewer will not embed | low to medium (the stream itself is proven; the viewer in our renderer is not yet) | Frames fallback (2 per second) is built first and always available |
| The Agent SDK behaves differently from its types (tool subset, steering order, tools deferred) | medium | Every name was checked against the real type file; proof run B2 before the night covers behaviour; the spec names the alternative for each option |
| Synthesia access is not enabled for hackathon keys | medium | Audio-only calls are the baseline; the face is three lines on top |
| Call latency feels slow | medium | Fast model, cached prompt, a spoken filler at 2.5 s, push-to-talk option |
| Memory: several desktops, several sessions, Electron and a call | medium | Measured: about 2 GB per desktop, never returned while it exists. Team capped at 4; desktops at 2 CPUs and 3 GB; runtime VM at 12 GB; the soak test runs 3 and stops under 6 GB free. Close other heavy apps for the demo |
| A desktop's files vanish (Cua's `stop` wipes them; a crash of the runtime VM or a reboot loses them) | medium | office never calls `stop`; "Desktop off" is suspend; a health check rebuilds a lost desktop and tells the employee; notes and plans live in office's own store |
| Databricks Free Edition is slow or blocks tokens | medium | Local source of truth; warehouse reads have an 8 s budget and a cache; sync has a circuit breaker |
| Agents collide in the shared tree | low | Disjoint ownership, frozen dependencies, separate ports; the orchestrator is the only committer |
| Astryx cannot express something | low | The rulings already replace the three known cases; anything new is composed from Astryx parts or cut, never hand-rolled |
| Licence: the copied viewer is FSL-1.1-MIT (source-available, not for a competing hosted service) | low for a hackathon | Kept in one folder with a notice; replaceable by the MIT example viewer |

## 10. Decisions needed from the user

Defaults in bold are what the plan assumes until told otherwise.

Decided by the user on 2026-11-14 (D-029):
1. **Faces: a cast of 8 Synthesia avatars.** The portrait is a still of the same avatar.
2. **Desktops: all Linux.** No macOS desktops.
3. **Employee model: Sonnet 5.5** by default.
4. **Lend my screen: later, as a stretch.** The grant flow is built and tested against a mock host tonight; the real host driver waits for the user's install and permission clicks.

Still needed:
5. Git: may the orchestrator commit locally on `build/night-1`, and push it at the end?
6. A spending cap for the night on the Anthropic key.
7. When is the submission deadline, and is the demo live or a video?

## 11. Cost

| Item | Estimate |
| --- | --- |
| Building (Sonnet build agents, Fable orchestrating) | Covered by the Claude subscription this session runs on |
| Employees at runtime and tests, on the user's API key | $5 to $20 for the night on Sonnet 5.5; under $2 on Haiku 5.5 |
| LiveKit Cloud | Free plan: 1,000 agent minutes, about 50 minutes of included speech |
| Synthesia | 10 credits a minute; 50,000 prize credits is 83 hours; a free key advertises 500 minutes |
| Databricks | Free Edition |
| Cua | Free for local use; no account |
