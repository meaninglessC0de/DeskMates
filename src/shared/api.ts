import type {
  Approval, ActivityStep, Candidate, CallInfo, Capabilities, Employee, Message, Permissions,
  Persona, RolePreset, Settings, Task, TeamReport,
} from './types.ts';

/** Error body of every non-2xx response. `message` is a plain sentence the UI can show. */
export interface ApiError {
  error: { code: string; message: string };
}

/** Known error codes (others are possible). */
export type ApiErrorCode = 'team_full' | 'screen_busy' | 'host_off' | 'genie_off' | 'not_found' | 'bad_request' | 'internal';

/** Route builders. Every path is relative; the renderer never uses an absolute office URL. */
export const routes = {
  health: () => '/api/health',
  presets: () => '/api/presets',
  employees: () => '/api/employees',
  candidates: () => '/api/candidates',
  employee: (id: string) => `/api/employees/${id}`,
  pause: (id: string) => `/api/employees/${id}/pause`,
  resume: (id: string) => `/api/employees/${id}/resume`,
  control: (id: string) => `/api/employees/${id}/control`,
  desktop: (id: string, action: 'restart' | 'reset' | 'start' | 'stop') => `/api/employees/${id}/desktop/${action}`,
  thread: (id: string, opts?: { before?: number; limit?: number }) => {
    const q: string[] = [];
    if (opts?.before !== undefined) q.push(`before=${opts.before}`);
    if (opts?.limit !== undefined) q.push(`limit=${opts.limit}`);
    return `/api/employees/${id}/thread${q.length ? `?${q.join('&')}` : ''}`;
  },
  messages: (id: string) => `/api/employees/${id}/messages`,
  read: (id: string) => `/api/employees/${id}/read`,
  approval: (id: string) => `/api/approvals/${id}`,
  thumbnail: (id: string) => `/api/employees/${id}/thumbnail.jpg`,
  stream: (id: string) => `/api/employees/${id}/stream`,
  frame: (id: string) => `/api/employees/${id}/frame.jpg`,
  screenGrant: (id: string) => `/api/employees/${id}/screen-grant`,
  calls: () => '/api/calls',
  call: (id: string) => `/api/calls/${id}`,
  callAddress: (id: string) => `/api/calls/${id}/address`,
  team: (range: TeamReport['range']) => `/api/team?range=${range}`,
  teamAsk: () => '/api/team/ask',
  settings: () => '/api/settings',
  portrait: (file: string) => `/media/portraits/${file}`,
  voice: (file: string) => `/media/voices/${file}`,
  ws: () => '/ws',
  // voice worker endpoints (no /api prefix, called only by the voice worker)
  voiceChat: () => '/voice/v1/chat/completions',
  voiceRoute: (callId: string) => `/voice/calls/${callId}/route`,
  voiceEvents: (callId: string) => `/voice/calls/${callId}/events`,
} as const;

// GET /api/health
export interface HealthResponse { ok: true; version: string; capabilities: Capabilities }

// GET /api/presets -> RolePreset[]
export type PresetsResponse = RolePreset[];

// GET /api/employees -> Employee[]
export type EmployeesResponse = Employee[];

// POST /api/candidates
export interface CandidateRequest { roleKey: string; description?: string; exclude?: string[] }
export type CandidateResponse = Candidate;

// POST /api/employees (hire)
export interface HireRequest {
  token: string;
  overrides?: Partial<Pick<Persona, 'name' | 'personality'>> & { permissions?: Partial<Permissions> };
}
export type HireResponse = Employee;

// GET /api/employees/:id
export type EmployeeResponse = Employee;

// PATCH /api/employees/:id
export interface PatchEmployeeRequest {
  persona?: Partial<Persona>;
  permissions?: Partial<Permissions>;
  model?: string;
}

// DELETE /api/employees/:id -> 204 (no body)

// POST /api/employees/:id/pause | resume, desktop/restart | reset | start | stop -> Employee (no body)
export type EmployeeActionResponse = Employee;

// POST /api/employees/:id/control
export interface ControlRequest { on: boolean }

// GET /api/employees/:id/thread?before=<ms>&limit=50
export interface ThreadResponse {
  messages: Message[];
  steps: ActivityStep[];
  approvals: Approval[];
  task: Task | null;
}

// POST /api/employees/:id/messages
export interface SendMessageRequest { text: string }
export type SendMessageResponse = Message;

// POST /api/employees/:id/read -> 204

// POST /api/approvals/:id
export interface ApprovalDecisionRequest { decision: 'approve' | 'deny'; scope?: 'once' | 'task'; note?: string }
export type ApprovalDecisionResponse = Approval;

// GET /api/employees/:id/thumbnail.jpg -> JPEG, 480 px wide

// POST /api/employees/:id/stream
export interface StreamRequest { mode: 'view' | 'control' }
export type StreamResponse =
  | { kind: 'cua-media'; wsUrl: string; ticket: string; mediaSessionId: string; expiresMs: number }
  | { kind: 'frames'; url: string };

// GET /api/employees/:id/frame.jpg -> JPEG, full size

// POST /api/employees/:id/screen-grant
export interface ScreenGrantRequest { minutes: number | null }
export type ScreenGrantResponse = Employee;
// DELETE /api/employees/:id/screen-grant -> Employee

// POST /api/calls
export interface CreateCallRequest { employeeIds: string[] }
export type CreateCallResponse = CallInfo;

// POST /api/calls/:id/address -> 204
export interface AddressRequest { employeeId: string }

// DELETE /api/calls/:id -> 204

// GET /api/team?range=today|week|month
export type TeamResponse = TeamReport;

// POST /api/team/ask
export interface TeamAskRequest { question: string; conversationId?: string }
export interface TeamAskResponse {
  answer: string;
  sql: string | null;
  columns: string[];
  rows: string[][];
  conversationId: string;
}

// GET /api/settings | PATCH /api/settings
export type SettingsResponse = Settings;
export type PatchSettingsRequest = Partial<Settings>;

// Voice worker endpoints
export interface VoiceChatRequest {
  model: string;                 // the call id
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  stream?: boolean;
}
export interface VoiceRouteRequest { utterance: string }
export interface VoiceRouteResponse { speakers: string[] }
