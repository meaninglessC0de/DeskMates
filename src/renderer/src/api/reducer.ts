import type {
  ActivityStep, Approval, CallInfo, Capabilities, Employee, Message, RolePreset, ServerEvent,
  Settings, Task, TeamReport, ThreadResponse,
} from '../../../shared';

export type TeamRange = TeamReport['range'];

export interface ThreadSlice {
  messages: Message[];
  steps: ActivityStep[];
  approvals: Approval[];
  task: Task | null;
  typing: boolean;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
}

export interface Caption { id: string; from: 'user' | string; text: string; final: boolean }
export type ParticipantState = 'joining' | 'present' | 'dropped' | 'failed' | 'left';
export interface CallSlice {
  /** null until the POST /api/calls response arrives (events may arrive before it) */
  id: string | null;
  info: CallInfo | null;
  employeeIds: string[];
  state: 'connecting' | 'live' | 'failed';
  mode: 'avatar' | 'audio';
  participants: Record<string, ParticipantState>;
  speaker: { employeeId: string | null; phase: 'thinking' | 'speaking' | 'idle' };
  captions: Caption[];
  captionSeq: number;
  hands: string[];
}

export interface UiState {
  view: 'thread' | 'team' | 'desks';
  /** The view the Desks view returns to (Esc, the back control). */
  viewBeforeDesks: 'thread' | 'team';
  /** Faces on the Desks view: shown or hidden (the F key, the demo hook). Kept here so it can be set before the view opens. */
  desksFaces: boolean;
  selectedId: string | null;
  hireOpen: boolean;
  profileOpen: boolean;
  settingsOpen: boolean;
  summonOpen: boolean;
  /** per employee: is the desktop panel open */
  desktopOpen: Record<string, boolean>;
}

export interface Toast { seq: number; text: string; tone: 'info' | 'error' }

/** All data in the store (everything except the actions). */
export interface Data {
  bootState: 'idle' | 'loading' | 'ready' | 'error';
  bootError: string | null;
  connected: boolean;
  /** always sorted: needs_you, stuck, then lastActivityMs descending */
  employees: Employee[];
  threads: Record<string, ThreadSlice>;
  presets: RolePreset[];
  settings: Settings | null;
  capabilities: Capabilities | null;
  team: Partial<Record<TeamRange, TeamReport>>;
  teamRange: TeamRange;
  teamLoading: boolean;
  teamError: string | null;
  teamConversationId: string | null;
  call: CallSlice | null;
  ui: UiState;
  toast: Toast | null;
}

export const THREAD_PAGE = 50;
export const MAX_CAPTIONS = 12;

export function emptyThread(): ThreadSlice {
  return { messages: [], steps: [], approvals: [], task: null, typing: false, loaded: false, loading: false, error: null, hasMore: false };
}

export const initialUi = (): UiState => ({
  view: 'thread', viewBeforeDesks: 'thread', desksFaces: true, selectedId: null, hireOpen: false, profileOpen: false, settingsOpen: false, summonOpen: false, desktopOpen: {},
});

export const initialData = (): Data => ({
  bootState: 'idle', bootError: null, connected: false, employees: [], threads: {}, presets: [], settings: null,
  capabilities: null, team: {}, teamRange: 'today', teamLoading: false, teamError: null, teamConversationId: null,
  call: null, ui: initialUi(), toast: null,
});

const rank = (e: Employee): number => (e.state === 'needs_you' ? 0 : e.state === 'stuck' ? 1 : 2);

/** Sidebar order: needs_you, stuck, then most recent activity. */
export function sortEmployees(list: Employee[]): Employee[] {
  return [...list].sort((a, b) => rank(a) - rank(b) || b.lastActivityMs - a.lastActivityMs || a.id.localeCompare(b.id));
}

function mergeById<T extends { id: string }>(a: T[], b: T[], key: (x: T) => number): T[] {
  const map = new Map<string, T>();
  for (const x of a) map.set(x.id, x);
  for (const x of b) map.set(x.id, x);
  return [...map.values()].sort((x, y) => key(x) - key(y) || x.id.localeCompare(y.id));
}

export const mergeMessages = (a: Message[], b: Message[]): Message[] => mergeById(a, b, (m) => m.createdMs);
export const mergeSteps = (a: ActivityStep[], b: ActivityStep[]): ActivityStep[] => mergeById(a, b, (s) => s.startedMs);
export const mergeApprovals = (a: Approval[], b: Approval[]): Approval[] => mergeById(a, b, (x) => x.createdMs);

/** Merge a thread page (newest page first on the wire) into a slice; merge order is by time. */
export function mergeThread(slice: ThreadSlice, page: ThreadResponse, opts: { older?: boolean } = {}): ThreadSlice {
  return {
    ...slice,
    messages: mergeMessages(slice.messages, page.messages),
    steps: mergeSteps(slice.steps, page.steps),
    approvals: mergeApprovals(slice.approvals, page.approvals),
    task: opts.older ? slice.task : page.task ?? slice.task,
    loaded: true,
    loading: false,
    error: null,
    hasMore: opts.older || !slice.loaded ? page.messages.length >= THREAD_PAGE : slice.hasMore,
  };
}

export type Effect =
  | { type: 'markRead'; employeeId: string }
  | { type: 'notify'; employeeId: string; title: string; body: string; portraitUrl: string };

export interface ReduceContext { focused: boolean }

export interface Reduced { patch: Partial<Data>; effects: Effect[] }

const none: Reduced = { patch: {}, effects: [] };

function withThread(s: Data, id: string, f: (t: ThreadSlice) => ThreadSlice): Partial<Data> {
  return { threads: { ...s.threads, [id]: f(s.threads[id] ?? emptyThread()) } };
}

export function upsertEmployee(s: Data, employee: Employee): Partial<Data> {
  const rest = s.employees.filter((e) => e.id !== employee.id);
  const employees = sortEmployees([...rest, employee]);
  const selectedId = s.ui.selectedId ?? employees[0]?.id ?? null;
  return { employees, ui: selectedId === s.ui.selectedId ? s.ui : { ...s.ui, selectedId } };
}

export function removeEmployeeData(s: Data, id: string): Partial<Data> {
  const employees = s.employees.filter((e) => e.id !== id);
  const { [id]: _t, ...threads } = s.threads;
  const { [id]: _d, ...desktopOpen } = s.ui.desktopOpen;
  const selectedId = s.ui.selectedId === id ? employees[0]?.id ?? null : s.ui.selectedId;
  const profileOpen = s.ui.selectedId === id ? false : s.ui.profileOpen;
  return { employees, threads, ui: { ...s.ui, selectedId, desktopOpen, profileOpen } };
}

function callFor(s: Data, callId: string): CallSlice | null {
  const c = s.call;
  if (!c) return null;
  if (c.id !== null && c.id !== callId) return null;
  return c;
}

/** Pure: apply one WebSocket event. Returns a patch for the store plus side effects to run. */
export function reduceEvent(s: Data, e: ServerEvent, ctx: ReduceContext = { focused: true }): Reduced {
  switch (e.type) {
    case 'hello':
      return { patch: { capabilities: e.capabilities, connected: true }, effects: [] };

    case 'employee':
      return { patch: upsertEmployee(s, e.employee), effects: [] };

    case 'employee_removed':
      return { patch: removeEmployeeData(s, e.id), effects: [] };

    case 'message': {
      const m = e.message;
      const patch = withThread(s, m.employeeId, (t) => ({ ...t, messages: mergeMessages(t.messages, [m]), typing: m.from === 'employee' ? false : t.typing }));
      const looking = s.ui.selectedId === m.employeeId && s.ui.view === 'thread';
      if (m.from === 'employee' && looking) {
        const employees = s.employees.map((x) => (x.id === m.employeeId ? { ...x, unread: 0 } : x));
        return { patch: { ...patch, employees }, effects: ctx.focused ? [{ type: 'markRead', employeeId: m.employeeId }] : [] };
      }
      return { patch, effects: [] };
    }

    case 'message_seen':
      return {
        patch: withThread(s, e.employeeId, (t) => ({
          ...t, messages: t.messages.map((m) => (m.id === e.id ? { ...m, seenMs: e.seenMs } : m)),
        })),
        effects: [],
      };

    case 'typing':
      return { patch: withThread(s, e.employeeId, (t) => ({ ...t, typing: e.on })), effects: [] };

    case 'step':
      return { patch: withThread(s, e.step.employeeId, (t) => ({ ...t, steps: mergeSteps(t.steps, [e.step]) })), effects: [] };

    case 'task':
      return {
        patch: withThread(s, e.task.employeeId, (t) => ({
          ...t,
          task: !t.task || t.task.id === e.task.id || e.task.assignedMs >= t.task.assignedMs ? e.task : t.task,
        })),
        effects: [],
      };

    case 'approval':
      return { patch: withThread(s, e.approval.employeeId, (t) => ({ ...t, approvals: mergeApprovals(t.approvals, [e.approval]) })), effects: [] };

    case 'call': {
      const ev = e.event;
      const c = callFor(s, e.callId);
      if (!c) return none;
      const base: CallSlice = c.id === null ? { ...c, id: e.callId } : c;
      switch (ev.kind) {
        case 'state':
          if (ev.state === 'ended') return { patch: { call: null }, effects: [] };
          return { patch: { call: { ...base, state: ev.state, mode: ev.mode } }, effects: [] };
        case 'participant':
          return { patch: { call: { ...base, participants: { ...base.participants, [ev.employeeId]: ev.state } } }, effects: [] };
        case 'speaker':
          return { patch: { call: { ...base, speaker: { employeeId: ev.employeeId, phase: ev.phase } } }, effects: [] };
        case 'caption': {
          const last = base.captions[base.captions.length - 1];
          const replace = last && !last.final && last.from === ev.from;
          const nextCaption: Caption = { id: replace ? last.id : `cap-${base.captionSeq}`, from: ev.from, text: ev.text, final: ev.final };
          const captions = [...(replace ? base.captions.slice(0, -1) : base.captions), nextCaption].slice(-MAX_CAPTIONS);
          return { patch: { call: { ...base, captions, captionSeq: replace ? base.captionSeq : base.captionSeq + 1 } }, effects: [] };
        }
        case 'hand':
          return {
            patch: { call: { ...base, hands: ev.raised ? [...new Set([...base.hands, ev.employeeId])] : base.hands.filter((x) => x !== ev.employeeId) } },
            effects: [],
          };
      }
      return none;
    }

    case 'notify': {
      const looking = ctx.focused && s.ui.selectedId === e.employeeId && s.ui.view === 'thread';
      if (looking) return none;
      const emp = s.employees.find((x) => x.id === e.employeeId);
      return { patch: {}, effects: [{ type: 'notify', employeeId: e.employeeId, title: e.title, body: e.body, portraitUrl: emp?.persona.portraitUrl ?? '' }] };
    }

    case 'toast':
      return { patch: { toast: { seq: (s.toast?.seq ?? 0) + 1, text: e.text, tone: e.tone } }, effects: [] };
  }
}
