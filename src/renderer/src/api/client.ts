import { routes } from '../../../shared';
import type {
  ApprovalDecisionRequest, ApprovalDecisionResponse, CandidateRequest, CandidateResponse,
  ControlRequest, CreateCallResponse, EmployeeActionResponse, EmployeeResponse, EmployeesResponse,
  HealthResponse, HireRequest, HireResponse, PatchEmployeeRequest, PatchSettingsRequest,
  PresetsResponse, ScreenGrantResponse, SendMessageResponse, SettingsResponse, StreamRequest,
  StreamResponse, TeamAskRequest, TeamAskResponse, TeamResponse, ThreadResponse, TeamReport,
} from '../../../shared';
import { fakeRequest } from '../fixtures/fakeApi';
import { isShot } from '../fixtures/shot';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

async function realRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError('network', "Can't reach your team", 0);
  }
  if (res.status === 204) return undefined;
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiClientError(err?.code ?? 'internal', err?.message ?? `Request failed (${res.status})`, res.status);
  }
  return json;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const out = isShot() ? await fakeRequest(method, path, body) : await realRequest(method, path, body);
  return out as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body);

/** One function per HTTP route of contracts section 3. All paths are relative. */
export const api = {
  health: () => get<HealthResponse>(routes.health()),
  presets: () => get<PresetsResponse>(routes.presets()),
  employees: () => get<EmployeesResponse>(routes.employees()),
  candidate: (req: CandidateRequest) => post<CandidateResponse>(routes.candidates(), req),
  hire: (req: HireRequest) => post<HireResponse>(routes.employees(), req),
  employee: (id: string) => get<EmployeeResponse>(routes.employee(id)),
  patchEmployee: (id: string, req: PatchEmployeeRequest) => request<EmployeeResponse>('PATCH', routes.employee(id), req),
  removeEmployee: (id: string) => request<void>('DELETE', routes.employee(id)),
  pause: (id: string) => post<EmployeeActionResponse>(routes.pause(id)),
  resume: (id: string) => post<EmployeeActionResponse>(routes.resume(id)),
  control: (id: string, req: ControlRequest) => post<EmployeeActionResponse>(routes.control(id), req),
  desktop: (id: string, action: 'restart' | 'reset' | 'start' | 'stop') => post<EmployeeActionResponse>(routes.desktop(id, action)),
  thread: (id: string, opts?: { before?: number; limit?: number }) => get<ThreadResponse>(routes.thread(id, opts)),
  sendMessage: (id: string, text: string) => post<SendMessageResponse>(routes.messages(id), { text }),
  markRead: (id: string) => post<void>(routes.read(id)),
  decideApproval: (id: string, req: ApprovalDecisionRequest) => post<ApprovalDecisionResponse>(routes.approval(id), req),
  stream: (id: string, req: StreamRequest) => post<StreamResponse>(routes.stream(id), req),
  grantScreen: (id: string, minutes: number | null) => post<ScreenGrantResponse>(routes.screenGrant(id), { minutes }),
  revokeScreen: (id: string) => request<ScreenGrantResponse>('DELETE', routes.screenGrant(id)),
  createCall: (employeeIds: string[]) => post<CreateCallResponse>(routes.calls(), { employeeIds }),
  addressCall: (callId: string, employeeId: string) => post<void>(routes.callAddress(callId), { employeeId }),
  endCall: (callId: string) => request<void>('DELETE', routes.call(callId)),
  team: (range: TeamReport['range']) => get<TeamResponse>(routes.team(range)),
  teamAsk: (req: TeamAskRequest) => post<TeamAskResponse>(routes.teamAsk(), req),
  settings: () => get<SettingsResponse>(routes.settings()),
  patchSettings: (req: PatchSettingsRequest) => request<SettingsResponse>('PATCH', routes.settings(), req),
};
