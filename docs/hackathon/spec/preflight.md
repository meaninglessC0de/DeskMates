# Preflight: what must happen while the user is awake

Owner: orchestrator. The overnight build is only safe to start when part A is done and part B has passed. Anything not provided is built in its fallback form (last column) and noted in the morning report.

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

## A. From the user (about 20 minutes)

Keys go into `AgentManager/.env.local` (the orchestrator creates the file from `.env.example`; the user pastes values in their editor, not in chat). The file is gitignored.

| # | What | How | Needed for | If missing |
| --- | --- | --- | --- | --- |
| A1 | **Anthropic API key** with credit, and a spending cap for the night | console.anthropic.com, API keys. `ANTHROPIC_API_KEY=` | Every real employee, the call mind, tests | Nothing real can be tested. The app is built and verified in mock mode only. **This is the one hard requirement.** |
| A2 | **LiveKit Cloud** project | cloud.livekit.io, new project (free "Build" plan), Settings, API keys. `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Calls and meetings | Calls are built against the mock and stay disabled in the app |
| A3 | **Synthesia** API key with Interactive Avatar access, and the cast | In Synthesia: Developers, API keys, New key with scope `interactive_avatars:write`. Then Avatars: pick 8 synthetic (AI-generated, not actor) avatars that look like one team, and for each use the `...` menu, "Copy Interactive ID". Put the 8 ids, with which is a man or a woman, into `config/cast-ids.txt` (the orchestrator creates the empty file and merges the ids into `config/cast.json` after the foundation phase). `SYNTHESIA_API_KEY=` | Moving faces on calls; portraits that match the call face | Calls are audio-only with a still portrait and a speaking ring. Portraits come from the fallback set (A8) |
| A4 | **Databricks** workspace | Sign up for Free Edition (docs.databricks.com, "Free Edition", email code). Copy the workspace URL. SQL Warehouses: start "Serverless Starter Warehouse", copy its id from the URL. User menu, Settings, Developer, Access tokens: generate a 30-day token. `DATABRICKS_HOST`, `DATABRICKS_WAREHOUSE_ID`, `DATABRICKS_TOKEN`, `DATABRICKS_SYNC=on` | The Databricks bounty: mirrored timesheet, Team view from the warehouse | The Team view runs on local numbers; the sync code is built and unit-tested against a fake |
| A5 | Optional: `DEEPGRAM_API_KEY` (free credit), `ELEVENLABS_API_KEY` | Their dashboards | More speech minutes and nicer voices than LiveKit's included credit (about 50 minutes) | LiveKit's included speech is used |
| A6 | **Let the session run unattended** | In this Claude session's mode picker choose the mode that does not ask before each command, keep the Mac on power with the lid open, and do not quit the Claude app | The whole overnight run | The build stops at the first permission prompt |
| A7 | **Git** | Say whether the orchestrator may commit locally on a branch during the night, and whether it may push that branch to `origin` at the end | A clean history and a backup | Work stays uncommitted in the folder |
| A8 | **Decisions** | Answer the questions in `plan.md` section "Decisions needed from the user" | Scope | The recommended defaults are used |

Morning-after items (cannot be done before the tables exist; about 10 minutes): create the Genie space over the five tables and copy its id into `DATABRICKS_GENIE_SPACE_ID`; create an MLflow experiment and copy its id into `MLFLOW_EXPERIMENT_ID`. Steps are in `research/06-databricks.md`, "What the user must set up by hand", items 8 and 9.

Only if "Lend my screen" is in scope tonight (plan decision 4): install Cua Driver on the Mac (`/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"`, run by the user), then grant it Accessibility and Screen Recording in System Settings, Privacy and Security. The orchestrator checks the result with the driver's read-only status command.

Only if macOS desktops are in scope (plan decision 2): the one-time Local Network step in `research/01-cua-spaces-runtime.md`, preflight item 7, and a 24 GB download.

## B. Proof runs by the orchestrator, before the user leaves (about 30 minutes)

Each is a throwaway script in the scratch folder, run by a Sonnet agent, with the result appended to `research-log.md`. A failure changes the plan before the night, not during it.

| # | Proves | Needs | Pass means | If it fails |
| --- | --- | --- | --- | --- |
| B0 | The tools are here | nothing | `node -v` is 26.x; `npm`, `git`, `uv` answer; `uv` can provide Python 3.12; `uname -m` is arm64; at least 30 GB of disk and 10 GB of memory are free; Playwright's Chromium is installed; the Figma connector answers `whoami` | Install what is missing with the user present |
| B1 | Cua Linux desktop on this Mac | nothing | **Passed on 2026-11-14** (`research/08-cua-live-spike.md`: install, create, exec, files, screenshot, driver over MCP, stream, network switch). The runtime and image are cached in `~/.cua` (7 GB) | n/a |
| B2 | Claude Agent SDK as the employee brain | A1 | The model ids in `.env.example` are confirmed by listing models with the key. Two sessions at once; a message injected mid-turn changes the outcome (and whether `priority: 'now'` differs from `'next'`); an in-process tool is called; `canUseTool` pauses and resumes on our answer; `tools: ['TodoWrite','WebSearch','WebFetch']` is honoured; with `alwaysLoad` and tool search off, `system/init` lists the `mcp__desktop__` tools of a real Space and the model calls one and gets a screenshot back as an image; `setMcpServers` adds and removes a server; what the stream does after an `error_max_turns` result; memory per session is measured | Adjust `employee-runtime.md` section 2 as its notes say; if the SDK cannot be used at all, switch W2 to the `pi` fallback in `research/04-agent-harness.md` |
| B3 | Electron + Vite 8 + Astryx | nothing | `electron-vite dev` opens a window that renders an Astryx screen; `doctor` is clean | Use Electron Forge with its Vite plugin (same renderer) |
| B4 | A voice round trip | A2, the user at the microphone for one minute | The user says "hello" and hears an answer generated by our endpoint | Try Deepgram for speech if LiveKit's included speech is the cause; otherwise calls are built against the mock |
| B5 | A Synthesia face in the room | A2, A3 | A face appears, lip-synced to our text, within 30 s; one frame is saved as a portrait | Audio-only calls; ask the sponsor about access in the morning |
| B6 | Databricks is reachable with a token | A4 | One `SELECT` through the statement API returns; the wall time is recorded | Switch to the OAuth login the Databricks report names, or leave sync off |
| B7 | macOS prompts | the user | Electron's notification and microphone prompts are accepted once | They will appear in the morning at first use |

## C. What the orchestrator sets before starting

- `mcp__ccd_host__request_keep_awake` for the session; `caffeinate -dimsu` as a background process for the duration.
- `docs/hackathon/build/log.md` opened with the start time, the answers from A8, and the results of B1 to B7.
- A scheduled check-in every 30 minutes that tells the orchestrator to read `build/log.md` and continue, so a stalled agent or a lost notification cannot stop the night.
- A hard stop: if the model spend reported by the test scripts passes the cap from A1, real-mode testing stops and the remaining work continues in mock mode.
