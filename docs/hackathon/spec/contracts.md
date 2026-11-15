# Contracts (frozen interface between all workstreams)

Owner: orchestrator. Build agents may not change this file; they ask the orchestrator, who edits it and tells every affected agent. The TypeScript source of truth is `src/shared/` (created in phase 1 from this document). If the code and this file disagree, the code in `src/shared/` wins and this file gets fixed.

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

## 1. Processes and ports

| Process | Language | Started by | Listens on | Purpose |
| --- | --- | --- | --- | --- |
| **office** (the daemon) | Node 26, TypeScript, ESM | `npm run office`, or Electron main as a child | `127.0.0.1:4317` HTTP + WebSocket | Everything with state: employees, desktops, agent runtimes, messages, approvals, calls, sync |
| **renderer** | React 19 + Astryx, Vite 8 | Electron window, or `npm run web` in a browser at `127.0.0.1:4318` | none | The UI. Talks to office over HTTP and one WebSocket only |
| **shell** | Electron 45 main + preload | `npm run dev` / `npm start` | none | Window, tray, native notifications, microphone permission, starts office and voice |
| **voice** | Python 3.12, `uv` | office, as a child, only when LiveKit keys exist | none (connects out to LiveKit Cloud) | LiveKit Agents worker: speech in, speech out, avatar |

Rules:
- The renderer never uses Electron IPC for data. It works unchanged in a plain browser tab. The only shell bridge is `window.shell` (section 7), and every use is optional (`window.shell?.notify(...)`).
- **How the renderer reaches office:** it always uses relative URLs (`/api/...`, `/media/...`, `/voice/...` never, `/ws`). In development the Vite server proxies `/api`, `/media` and `/ws` to `VITE_OFFICE_URL` (default `http://127.0.0.1:4317`). For `npm start`, office itself serves the built renderer from `out/renderer` at `/`, and the Electron window loads `http://127.0.0.1:<OFFICE_PORT>/`. There is no CORS anywhere. The one exception is the live-desktop media socket: the `wsUrl` in a stream ticket is a loopback Cua address the renderer connects to directly.
- Every path office writes is under `DATA_DIR` (default `data`), resolved to an absolute path at boot. Nothing hardcodes `data/`.
- office is the only process that holds secrets. It reads them from `.env.local` at the repo root. Nothing secret is ever sent to the renderer.
- All ids are ULIDs with a prefix: `emp_`, `msg_`, `tsk_`, `apr_`, `evt_`, `call_`.
- All times are epoch milliseconds (`number`), named `*Ms`.

## 2. Data model (`src/shared/types.ts`)

```ts
export type EmployeeState =
  | 'offline'    // desktop stopped
  | 'starting'   // desktop booting or runtime attaching
  | 'idle'
  | 'working'
  | 'needs_you'  // waiting on an approval or an answer
  | 'paused'
  | 'stuck'
  | 'on_call';

export type PermissionLevel = 'asks_first' | 'asks_big_steps' | 'independent';

export interface Permissions {
  level: PermissionLevel;         // default 'asks_big_steps'
  internet: boolean;              // default true
  commands: boolean;              // default true  (shell in its own desktop)
  myScreen: boolean;              // default false (may ask to use the user's real screen)
  teammates: boolean;             // default true  (may message other employees)
}

export interface Persona {
  name: string;                   // "Maya Chen"
  firstName: string;              // "Maya"
  role: string;                   // "Web developer"
  roleKey: string;                // preset key or 'custom'
  personality: string;            // one line, shown in the UI
  workingStyle: string;           // one or two sentences, prompt only
  starters: string[];             // up to 3 short task starters
  portraitUrl: string;            // served by office: /media/portraits/<file>
  voice: { provider: 'livekit' | 'deepgram' | 'elevenlabs'; voiceId: string; label: string; sampleUrl: string | null };  // sampleUrl: /media/voices/<file>, null = hide "Hear"
  avatarId: string | null;        // Synthesia interactive avatar id, null = audio-only calls
}

export interface Employee {
  id: string;
  persona: Persona;
  permissions: Permissions;
  state: EmployeeState;
  stateDetail: string;            // sidebar second line, max 40 chars, sentence case (who sets it: see below)
  stateSinceMs: number;
  spaceId: string | null;         // Cua Space id, e.g. 'local:emp-01j...'
  sessionId: string | null;       // Claude Agent SDK session id (for resume)
  model: string;                  // e.g. 'claude-sonnet-5-5'
  unread: number;
  lastActivityMs: number;
  screenGrant: { untilMs: number | null } | null;   // set while this employee holds the user's screen; untilMs null = until stopped
  desktopSinceMs: number | null;  // when the desktop last came up; null when off
  pendingRestart: boolean;        // a setting was changed that applies at the next desktop restart
  controlledByUser: boolean;      // the user has taken control of the desktop (state is 'paused', stateDetail 'You have control')
  createdMs: number;
}

export type MessageKind =
  | 'text'        // a normal chat bubble
  | 'question'    // employee asked something and is waiting
  | 'done'        // employee finished a task (summary)
  | 'system';     // divider-style line: "Call with Maya · 12 min"

export interface Message {
  id: string;
  employeeId: string;             // the thread this belongs to
  from: 'user' | 'employee' | 'system';
  kind: MessageKind;
  text: string;
  taskId: string | null;
  createdMs: number;
  seenMs: number | null;          // for user messages: when the employee consumed it
}

export interface ActivityStep {   // one quiet line inside an activity group
  id: string;
  employeeId: string;
  taskId: string | null;
  sentence: string;               // "Opened the staging site" (past tense, max 40 chars, no paths or tool names)
  status: 'running' | 'ok' | 'error';
  startedMs: number;
  endedMs: number | null;
  peer?: { employeeId: string; direction: 'to' | 'from'; text: string };  // colleague messages
}

export interface PlanStep { title: string; status: 'pending' | 'in_progress' | 'done' }

export interface Task {
  id: string;
  employeeId: string;
  title: string;                  // first 60 chars of the assignment, cleaned
  assignedBy: 'user' | string;    // 'user' or an employee id
  status: 'running' | 'blocked' | 'done' | 'failed' | 'cancelled';
  plan: PlanStep[];
  outcome: string | null;
  assignedMs: number;
  finishedMs: number | null;
  activeMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  numTurns: number;
  traceId: string | null;
}

export interface Approval {
  id: string;
  employeeId: string;
  taskId: string | null;
  title: string;                  // noun phrase: "Deploy to staging"
  detail: string;                 // the resolved action, one line: "Runs deploy.sh on staging.example.com"
  kind: 'tool' | 'big_step' | 'screen';
  screenMinutes?: number;         // kind 'screen'
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdMs: number;
  resolvedMs: number | null;
}

export interface CallInfo {
  id: string;
  employeeIds: string[];          // 1 = one-to-one call, 2..4 = meeting
  livekitUrl: string;
  token: string;                  // user token for this room
  room: string;
  mode: 'avatar' | 'audio';       // what office expects; the client downgrades if the avatar never joins
  mock: boolean;                  // true = no LiveKit; the renderer uses the scripted CallSession
  startedMs: number;
}

export interface TeamRow {
  employeeId: string; name: string; role: string; portraitUrl: string;
  activeMs: number; tasksDone: number; tasksFailed: number; costUsd: number; lastActivityMs: number;
}
export interface TeamReport {
  range: 'today' | 'week' | 'month';
  totals: { activeMs: number; tasksDone: number; costUsd: number };
  previous: { activeMs: number; tasksDone: number; costUsd: number } | null;   // the period before, for the "+6 vs last week" line; null = no data
  rows: TeamRow[];
  source: 'databricks' | 'local';
  syncedMs: number | null;
  experimentUrl?: string | null;  // MLflow experiment page (one trace per employee session); absent or null = hide the link
}

export interface RolePreset {
  key: string; role: string; blurb: string;        // "Web developer", "Builds and fixes software"
  icon: string;                                     // lucide icon name
  workingStyle: string; starters: string[];
  defaultPermissions: Permissions; defaultModel: string;
}

export interface Candidate {      // a proposed person in the hire dialog
  token: string;                  // opaque; pass back to hire
  persona: Persona;
}

export interface Settings {
  userName: string;               // default: the macOS account's first name; shown in the sidebar footer and told to employees
  appearance: 'light' | 'dark' | 'system';
  notifyMessages: boolean; notifyDone: boolean; captions: boolean;
}

export interface Capabilities {   // what is configured on this machine; drives disabled states
  llm: boolean;                   // ANTHROPIC_API_KEY present and valid
  desktops: 'cua' | 'mock';
  calls: 'avatar' | 'audio' | 'off';
  databricks: boolean;
  genie: boolean;
  hostScreen: boolean;            // cua-driver installed and permitted on the host (true in mock mode: MockHost)
}
```

Who sets `stateDetail` (always at most 40 characters, cut with an ellipsis):

| State | `stateDetail` |
| --- | --- |
| `idle`, `offline` | the role ("Web developer"), or "Desktop is off", or "Couldn't start desktop" after a failed boot |
| `starting` | "Starting desktop" |
| `working` | the last `set_activity` sentence, else the task title |
| `needs_you` | the approval title, or the question text |
| `stuck` | the `report_stuck` reason, or the supervisor's reason |
| `paused` | "Paused by you", or "You have control" while `controlledByUser` |
| `on_call` | "On a call with you" |

Money is US dollars everywhere (`costUsd`), formatted in the UI with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`. The UX spec's pound signs are examples only.

## 3. HTTP API (office, JSON, prefix `/api`)

Errors: non-2xx with `{ "error": { "code": string, "message": string } }`. `message` is a plain sentence that the UI can show.

| Method and path | Body | Returns | Notes |
| --- | --- | --- | --- |
| `GET /api/health` | | `{ ok: true, version, capabilities: Capabilities }` | |
| `GET /api/presets` | | `RolePreset[]` | the 8 presets from the UX spec section 6.3 |
| `GET /api/employees` | | `Employee[]` | sorted: needs_you, stuck, then by `lastActivityMs` desc |
| `POST /api/candidates` | `{ roleKey: string, description?: string, exclude?: string[] }` | `Candidate` | `roleKey: 'custom'` requires `description`. `exclude` = candidate tokens already shown (Shuffle); when it has used up the free cast members it starts again from the first. When the team already has `MAX_TEAM` people: 409 `team_full`, message "Your team is full. Remove someone to hire again." |
| `POST /api/employees` | `{ token: string, overrides?: Partial<Pick<Persona,'name'|'personality'>> & { permissions?: Partial<Permissions> } }` | `Employee` | Hire. Returns at once with `state: 'starting'`; the desktop and runtime come up in the background. A failed boot is reported later as `state: 'offline'`, `stateDetail: "Couldn't start desktop"` and a `toast` event; there is no dialog-level failure |
| `GET /api/employees/:id` | | `Employee` | |
| `PATCH /api/employees/:id` | `{ persona?: Partial<Persona>, permissions?: Partial<Permissions>, model?: string }` | `Employee` | applies live |
| `DELETE /api/employees/:id` | | `204` | stops runtime, deletes the desktop and the thread |
| `POST /api/employees/:id/pause` / `resume` | | `Employee` | `resume` on a `stuck` employee means "Try again": it clears `stuck` and tells the employee to try again |
| `POST /api/employees/:id/control` | `{ on: boolean }` | `Employee` | Take control or give back. `on: true` pauses the employee's loop (`controlledByUser`); `on: false` resumes it and tells the employee the manager used its desktop |
| `POST /api/employees/:id/desktop/restart` / `reset` / `start` / `stop` | | `Employee` | `stop` suspends the desktop (files and open apps are kept; it still holds memory); `start` wakes it; `restart` is suspend then start; `reset` deletes the Space and creates a fresh one (files are erased). The Cua SDK's own `stop` wipes the desktop's files, so office never calls it except inside `reset` and remove |
| `GET /api/employees/:id/thread?before=<ms>&limit=50` | | `{ messages: Message[], steps: ActivityStep[], approvals: Approval[], task: Task \| null }` | newest page first; the client merges by time |
| `POST /api/employees/:id/messages` | `{ text: string }` | `Message` | delivers to the employee; steers if working |
| `POST /api/employees/:id/read` | | `204` | clears `unread` |
| `POST /api/approvals/:id` | `{ decision: 'approve' \| 'deny', scope?: 'once' \| 'task', note?: string }` | `Approval` | |
| `GET /api/employees/:id/thumbnail.jpg` | | JPEG, 480 px wide | cached 3 s; 404 when offline |
| `POST /api/employees/:id/stream` | `{ mode: 'view' \| 'control' }` | `{ kind: 'cua-media', wsUrl: string, ticket: string, mediaSessionId: string, expiresMs: number } \| { kind: 'frames', url: string }` | `expiresMs` is an absolute time (epoch milliseconds), like every `*Ms` field. `frames` is the fallback: `url` is `/api/employees/:id/frame.jpg` |
| `GET /api/employees/:id/frame.jpg` | | JPEG, full size | a fresh screenshot on every GET (office limits it to 4 per second per employee); served in mock mode too |
| `POST /api/employees/:id/screen-grant` | `{ minutes: number \| null }` | `Employee` | user lends their real screen. `null` minutes = until stopped. 409 `screen_busy` when another employee holds it; 409 `host_off` when `capabilities.hostScreen` is false |
| `DELETE /api/employees/:id/screen-grant` | | `Employee` | take it back |
| `POST /api/calls` | `{ employeeIds: string[] }` | `CallInfo` | 1 to 4 ids |
| `POST /api/calls/:id/address` | `{ employeeId: string }` | `204` | meeting: the user clicked a tile |
| `DELETE /api/calls/:id` | | `204` | ends the call for everyone |
| `GET /api/team?range=today\|week\|month` | | `TeamReport` | |
| `POST /api/team/ask` | `{ question: string, conversationId?: string }` | `{ answer: string, sql: string \| null, columns: string[], rows: string[][], conversationId: string }` | 409 `genie_off` when not configured |
| `GET /api/settings` / `PATCH /api/settings` | `Partial<Settings>` | `Settings` | |
| `GET /media/portraits/:file` | | image | served straight from `config/portraits/` (no copy), so a portrait added later appears without a restart |
| `GET /media/voices/:file` | | audio | served from `config/voices/`; 404 when absent |

Voice endpoints (called only by the voice worker, same port, no `/api` prefix):

| Method and path | Purpose |
| --- | --- |
| `POST /voice/v1/chat/completions` | OpenAI-compatible, streaming SSE. `model` = the call id. Header `X-Speaker: <employeeId>` says whose turn it is (in a one-to-one call it may be omitted). See `employee-runtime.md` section 8 |
| `POST /voice/calls/:id/route` | Meetings: body `{ utterance: string }`, returns `{ speakers: string[] }` (employee ids, in speaking order) |
| `POST /voice/calls/:id/events` | The worker reports one of: `{ type: 'joined' }`, `{ type: 'avatar_ready' }`, `{ type: 'avatar_failed', reason }`, `{ type: 'user_transcript', text, final }`, `{ type: 'speech_started', employeeId }`, `{ type: 'agent_transcript', employeeId, text, final }`, `{ type: 'speech_ended', employeeId }`, `{ type: 'participant', employeeId, state }`, `{ type: 'ended' }` |

## 4. WebSocket (`ws://127.0.0.1:4317/ws`)

One connection per renderer. Server sends JSON events; the client sends nothing except `{ "type": "ping" }`. On connect the server sends `hello` and the client then loads state over HTTP. On reconnect the client refetches (no replay).

```ts
export type ServerEvent =
  | { type: 'hello'; capabilities: Capabilities }
  | { type: 'employee'; employee: Employee }                 // created or changed (whole object)
  | { type: 'employee_removed'; id: string }
  | { type: 'message'; message: Message }
  | { type: 'message_seen'; id: string; employeeId: string; seenMs: number }
  | { type: 'typing'; employeeId: string; on: boolean }      // composing a chat reply
  | { type: 'step'; step: ActivityStep }                     // created or updated (same id)
  | { type: 'task'; task: Task }                             // created or changed (plan updates ride here)
  | { type: 'approval'; approval: Approval }                 // created or resolved
  | { type: 'call'; callId: string; event:
        | { kind: 'state'; state: 'connecting' | 'live' | 'ended' | 'failed'; mode: 'avatar' | 'audio' }
        | { kind: 'participant'; employeeId: string; state: 'joining' | 'present' | 'dropped' | 'failed' | 'left' }
        | { kind: 'speaker'; employeeId: string | null; phase: 'thinking' | 'speaking' | 'idle' }
        | { kind: 'caption'; from: 'user' | string; text: string; final: boolean }
        | { kind: 'hand'; employeeId: string; raised: boolean } }
  | { type: 'notify'; employeeId: string; title: string; body: string; kind: 'approval' | 'question' | 'done' | 'stuck' | 'screen' | 'message' }
  | { type: 'toast'; text: string; tone: 'info' | 'error' };
```

There is one avatar video track per call. The renderer shows it in the tile of the current speaker (the last speaker while nobody speaks); every other tile shows that person's still.

`notify` is the trigger for a native notification. The shell shows it only when the window is not focused on that employee's thread; the renderer decides and calls `window.shell?.notify`.

## 5. Office tools given to every employee (in-process MCP server `office`)

Names as the model sees them: `mcp__office__<name>`. All return short plain text, wrapped as an MCP result (`{ content: [{ type: 'text', text }] }`). None blocks except `request_approval` and `request_screen`.

| Tool | Input (zod) | Behaviour |
| --- | --- | --- |
| `message_user` | `{ text: string }` | Posts a chat bubble to the manager. Returns "sent". |
| `ask_user` | `{ question: string }` | Posts a question bubble, sets state `needs_you`. Returns "Asked. The answer will arrive as a new message. Continue other useful work if there is any, otherwise end your turn." |
| `request_approval` | `{ title: string, detail: string }` | Creates an Approval (`kind: 'big_step'`), sets `needs_you`, **waits** for the decision. Returns "approved" or "denied: <note>". |
| `finish_task` | `{ summary: string }` | Marks the current task done, posts a `done` bubble with the summary, state `idle`. |
| `report_stuck` | `{ reason: string, tried: string }` | State `stuck`, posts a bubble, notifies. |
| `set_activity` | `{ sentence: string }` | Sets `stateDetail` and opens a new ActivityStep (closes the previous one). Present tense, max 40 chars. |
| `message_colleague` | `{ to: string, text: string }` | `to` = first name. Delivers to their inbox. Refused when `permissions.teammates` is false, when the hop guard trips, or when the name is unknown (the error lists valid names). |
| `list_colleagues` | `{}` | First name, role and state of everyone else. |
| `save_note` | `{ text: string }` | Appends to this employee's long-term notes (kept by office, survives desktop resets, shown to the employee at the start of every session). |
| `request_screen` | `{ reason: string, minutes: number }` | Only when `permissions.myScreen`. Creates an Approval (`kind: 'screen'`), waits. On approve, the `host` tools become usable until the grant ends. |
| `release_screen` | `{}` | Gives the user's screen back early. |

The plan checklist is the SDK's built-in `TodoWrite` tool (input `{ todos: { content, status: 'pending' | 'in_progress' | 'completed', activeForm }[] }`), mirrored by office into `Task.plan` (`title` = `content`, `completed` = `done`). There is no custom plan tool.

Desktop tools:
- `mcp__desktop__*`: the Cua Driver tools of this employee's own Space (HTTP MCP), limited to the allow-list in `employee-runtime.md` section 3.
- `mcp__space__shell`, `mcp__space__read_file`, `mcp__space__write_file`: in-process, bound to this employee's Space.
- `mcp__host__*`: the Cua Driver on the user's real Mac. Always denied unless `Employee.screenGrant` is live.

## 6. Storage (office, SQLite at `<DATA_DIR>/office.db`, via `node:sqlite`)

Tables mirror section 2: `employees` (persona and permissions as JSON columns), `messages`, `steps`, `tasks` (plan as JSON), `approvals`, `usage`, `notes`, `settings`, `outbox` (Databricks sync queue), `kv`. Column names are snake_case of the field names; times are `*_ms INTEGER`. The Databricks DDL in `research/06-databricks.md` ("Table schemas") is the mirror target and uses the same names for the shared columns.

`data/` and `data-w*/` are gitignored. `<DATA_DIR>/employees/<id>/` (absolute) is each employee's host-side working folder (the Agent SDK `cwd` and config dir). Portraits, voice samples and mock desktop images are not data: they live in `config/portraits/`, `config/voices/` and `config/mock-desktops/` and are committed.

On boot office repairs what a crash left behind: every `pending` approval becomes `expired`, every `running` step is closed, and each employee is brought back by its supervisor (see `employee-runtime.md` section 4.8).

## 7. Shell bridge (`window.shell`, exposed by preload; all optional)

```ts
interface ShellBridge {
  notify(n: { employeeId: string; title: string; body: string; portraitUrl: string }): void;
  onNotificationClick(cb: (employeeId: string) => void): void;
  setBadge(count: number): void;                       // Dock badge = employees in needs_you or stuck
  setTray(rows: { id: string; name: string; state: string }[], lent: string | null): void;
  onTrayAction(cb: (a: { type: 'open'; employeeId: string } | { type: 'summon' } | { type: 'hire' } | { type: 'take_back' } | { type: 'pause_all' } | { type: 'resume_all' }) => void): void;
  askMicrophone(): Promise<boolean>;
  platform: 'darwin';
}
```

## 8. Environment (`.env.local`, gitignored; `.env.example` is committed)

```
# required for real employees
ANTHROPIC_API_KEY=
EMPLOYEE_MODEL=claude-sonnet-5-5          # default model for new hires
VOICE_MODEL=claude-haiku-5-5              # the fast "call mind"
# desktops
DESKTOPS=cua                              # cua | mock
CUA_TELEMETRY=0
DO_NOT_TRACK=1
# calls (all optional; missing = calls disabled in the UI)
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
SYNTHESIA_API_KEY=                        # missing = audio-only calls
DEEPGRAM_API_KEY=                         # missing = LiveKit Inference speech
ELEVENLABS_API_KEY=                       # optional nicer voices
# Databricks (all optional; missing = local numbers only)
DATABRICKS_SYNC=off                       # on | off
DATABRICKS_HOST=
DATABRICKS_TOKEN=
DATABRICKS_WAREHOUSE_ID=
DATABRICKS_CATALOG=workspace
DATABRICKS_SCHEMA=deskmates
DATABRICKS_GENIE_SPACE_ID=
MLFLOW_TRACKING_URI=databricks
MLFLOW_EXPERIMENT_ID=
EMPLOYEE_TASK_BUDGET_USD=5                # per task; the supervisor asks the manager when it is reached
MAX_TEAM=4                                # most employees at once on this Mac (each desktop holds about 2 GB)
CALL_HANDS=0                              # 1 = raise hand in meetings (stretch)
USER_NAME=                                # optional; default is the macOS account's first name
# testing and development
MOCK_LLM=0                                # 1 = scripted employees, no API calls
OFFICE_PORT=4317
WEB_PORT=4318
DATA_DIR=data
VITE_OFFICE_URL=http://127.0.0.1:4317     # where the Vite dev server proxies /api, /media and /ws
AGENT_MANAGER_TEST=0                      # 1 = the shell records notifications instead of showing them (tests)
```

## 9. Mock mode (so every workstream can run without keys)

`DESKTOPS=mock` and `MOCK_LLM=1` give a fully working app with no Cua, no model and no network:
- Mock desktops: `stream` returns `{ kind: 'frames' }`; `frame.jpg` cycles through the five images in `config/mock-desktops/` (1280 x 800, made once by rendering two plain HTML pages, a terminal-like window and a browser-like window, with Playwright); thumbnails use the same images; shell and file tools act on a folder under `DATA_DIR`.
- Mock host: `capabilities.hostScreen` is true, a screen grant works end to end (banner, countdown, take back), and the `host` tools return a fixed sentence.
- Mock calls: `POST /api/calls` returns `mock: true` and office plays a scripted sequence of `call` events (participants joining, connecting, live, a speaker thinking then speaking with captions, idle), repeating with the next participant every 10 seconds.
- Mock ask: with `capabilities.genie` forced on by `MOCK_GENIE=1`, `/api/team/ask` returns a fixed answer, query and small table.
- Mock hiring of a described role: a deterministic persona built from the description's first words, no model call.
- Mock employees: a scripted runtime that reacts to a message with a fixed sequence over about 20 seconds: typing, a reply, three activity steps, a plan of four steps ticking over, an approval request, then on approve two more steps and a `done` bubble. A message containing "stuck" produces the stuck path. A message containing "ask" produces a question.
- `npm run seed` creates four employees from the presets (Maya needs you, Priya working, Jonas idle, Ines idle) with a short history, matching the UX spec's demo order.

The UI is built and reviewed entirely against mock mode first. Real mode must emit the same events.
