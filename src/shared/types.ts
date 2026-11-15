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
  controlledByUser: boolean;      // the user has taken control of the desktop (state is 'paused', stateDetail 'Waiting for you')
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
  experimentUrl?: string | null;  // MLflow experiment page with one trace per employee session; absent or null = hide the link
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
