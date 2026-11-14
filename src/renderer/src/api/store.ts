import { create } from 'zustand';
import type {
  ApprovalDecisionRequest, Candidate, CandidateRequest, Employee, HireRequest, PatchEmployeeRequest,
  Settings, StreamRequest, StreamResponse, TeamAskRequest, TeamAskResponse,
} from '../../../shared';
import { api, ApiClientError } from './client';
import { connectWs } from './ws';
import { notifyShell, prepareCall } from './shellBridge';
import { isShot } from '../fixtures/shot';
import {
  THREAD_PAGE, emptyThread, initialData, mergeApprovals, mergeMessages, mergeThread, reduceEvent,
  removeEmployeeData, sortEmployees, upsertEmployee,
} from './reducer';
import type { CallSlice, Data, Effect, TeamRange, UiState } from './reducer';

export type { CallSlice, Caption, Data, ParticipantState, TeamRange, ThreadSlice, UiState } from './reducer';

/**
 * Store contract for every area agent.
 *
 * Data is in `Data` (reducer.ts). Actions below call `api/client.ts`, apply the result to the store
 * and (for dialog flows: fetchCandidate, hire, askTeam) rethrow `ApiClientError` so the dialog can
 * show its own message. All other actions show a toast on failure and return null or false.
 * Server pushes arrive through `applyServerEvent` (api/ws.ts calls it for every WebSocket event).
 */
export interface Actions {
  // boot and sync
  boot(): Promise<void>;
  refresh(): Promise<void>;
  startRealtime(): () => void;
  applyServerEvent(e: Parameters<typeof reduceEvent>[1]): void;
  setData(patch: Partial<Data>): void;
  // ui (all synchronous)
  setUi(patch: Partial<UiState>): void;
  setView(view: UiState['view']): void;
  toggleDesktop(employeeId: string, open?: boolean): void;
  showToast(text: string, tone?: 'info' | 'error'): void;
  // employees
  selectEmployee(id: string): Promise<void>;
  fetchCandidate(req: CandidateRequest): Promise<Candidate>;
  hire(req: HireRequest): Promise<Employee>;
  patchEmployee(id: string, req: PatchEmployeeRequest): Promise<Employee | null>;
  removeEmployee(id: string): Promise<boolean>;
  pauseEmployee(id: string): Promise<Employee | null>;
  resumeEmployee(id: string): Promise<Employee | null>;
  setControl(id: string, on: boolean): Promise<Employee | null>;
  desktopAction(id: string, action: 'restart' | 'reset' | 'start' | 'stop'): Promise<Employee | null>;
  openStream(id: string, req: StreamRequest): Promise<StreamResponse | null>;
  grantScreen(id: string, minutes: number | null): Promise<Employee | null>;
  revokeScreen(id: string): Promise<Employee | null>;
  // thread
  loadThread(id: string): Promise<void>;
  loadOlder(id: string): Promise<void>;
  sendMessage(id: string, text: string): Promise<boolean>;
  markRead(id: string): Promise<void>;
  decideApproval(id: string, req: ApprovalDecisionRequest): Promise<boolean>;
  // calls
  startCall(employeeIds: string[]): Promise<boolean>;
  addressCall(employeeId: string): Promise<void>;
  endCall(): Promise<void>;
  // team and settings
  loadTeam(range?: TeamRange): Promise<void>;
  askTeam(req: TeamAskRequest): Promise<TeamAskResponse>;
  updateSettings(patch: Partial<Settings>): Promise<boolean>;
}

export type Store = Data & Actions;

const messageOf = (e: unknown): string => (e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : 'Something went wrong');

export const useStore = create<Store>()((set, get) => {
  const toast = (text: string, tone: 'info' | 'error' = 'error'): void => {
    set((s) => ({ toast: { seq: (s.toast?.seq ?? 0) + 1, text, tone } }));
  };
  /** Run an API action; on failure show a toast and return null. */
  async function attempt<T>(f: () => Promise<T>): Promise<T | null> {
    try {
      return await f();
    } catch (e) {
      toast(messageOf(e));
      return null;
    }
  }
  const putEmployee = (e: Employee | null): Employee | null => {
    if (e) set((s) => upsertEmployee(s, e) as Partial<Store>);
    return e;
  };
  const runEffects = (effects: Effect[]): void => {
    for (const fx of effects) {
      if (fx.type === 'markRead') void get().markRead(fx.employeeId);
      else notifyShell({ employeeId: fx.employeeId, title: fx.title, body: fx.body, portraitUrl: fx.portraitUrl });
    }
  };

  return {
    ...initialData(),

    // boot and sync
    async boot() {
      set({ bootState: 'loading', bootError: null });
      try {
        const [health, presets, employees, settings] = await Promise.all([api.health(), api.presets(), api.employees(), api.settings()]);
        const sorted = sortEmployees(employees);
        set((s) => ({
          bootState: 'ready', capabilities: health.capabilities, presets, settings, employees: sorted,
          ui: { ...s.ui, selectedId: s.ui.selectedId && sorted.some((e) => e.id === s.ui.selectedId) ? s.ui.selectedId : sorted[0]?.id ?? null },
        }));
        const id = get().ui.selectedId;
        if (id) await get().selectEmployee(id);
      } catch (e) {
        set({ bootState: 'error', bootError: messageOf(e) });
      }
    },

    async refresh() {
      const out = await attempt(() => Promise.all([api.health(), api.employees(), api.settings()]));
      if (!out) return;
      const [health, employees, settings] = out;
      set((s) => {
        const sorted = sortEmployees(employees);
        const selectedId = s.ui.selectedId && sorted.some((e) => e.id === s.ui.selectedId) ? s.ui.selectedId : sorted[0]?.id ?? null;
        return { capabilities: health.capabilities, employees: sorted, settings, ui: { ...s.ui, selectedId } };
      });
      const id = get().ui.selectedId;
      if (id) await get().loadThread(id);
    },

    startRealtime() {
      return connectWs({
        onEvent: (e) => get().applyServerEvent(e),
        onOpen: () => {
          set({ connected: true });
          if (get().bootState === 'ready') void get().refresh();
        },
        onClose: () => set({ connected: false }),
      });
    },

    applyServerEvent(e) {
      const focused = typeof document === 'undefined' ? true : document.hasFocus();
      const { patch, effects } = reduceEvent(get(), e, { focused });
      if (Object.keys(patch).length) set(patch as Partial<Store>);
      runEffects(effects);
    },

    setData(patch) {
      set(patch as Partial<Store>);
    },

    // ui
    setUi(patch) {
      set((s) => ({ ui: { ...s.ui, ...patch } }));
    },
    setView(view) {
      set((s) => ({ ui: { ...s.ui, view } }));
    },
    toggleDesktop(employeeId, open) {
      set((s) => ({ ui: { ...s.ui, desktopOpen: { ...s.ui.desktopOpen, [employeeId]: open ?? !s.ui.desktopOpen[employeeId] } } }));
    },
    showToast: toast,

    // employees
    async selectEmployee(id) {
      const emp = get().employees.find((e) => e.id === id);
      set((s) => ({
        employees: s.employees.map((e) => (e.id === id ? { ...e, unread: 0 } : e)),
        ui: { ...s.ui, selectedId: id, view: 'thread' },
      }));
      if (emp && emp.unread > 0) void get().markRead(id);
      await get().loadThread(id);
    },

    async fetchCandidate(req) {
      return api.candidate(req);
    },

    async hire(req) {
      const employee = await api.hire(req);
      set((s) => upsertEmployee(s, employee) as Partial<Store>);
      set((s) => ({ ui: { ...s.ui, hireOpen: false } }));
      await get().selectEmployee(employee.id);
      return employee;
    },

    async patchEmployee(id, req) {
      return putEmployee(await attempt(() => api.patchEmployee(id, req)));
    },

    async removeEmployee(id) {
      const ok = await attempt(async () => {
        await api.removeEmployee(id);
        return true;
      });
      if (!ok) return false;
      set((s) => removeEmployeeData(s, id) as Partial<Store>);
      const next = get().ui.selectedId;
      if (next) await get().selectEmployee(next);
      return true;
    },

    async pauseEmployee(id) {
      return putEmployee(await attempt(() => api.pause(id)));
    },
    async resumeEmployee(id) {
      return putEmployee(await attempt(() => api.resume(id)));
    },
    async setControl(id, on) {
      return putEmployee(await attempt(() => api.control(id, { on })));
    },
    async desktopAction(id, action) {
      return putEmployee(await attempt(() => api.desktop(id, action)));
    },
    openStream(id, req) {
      return attempt(() => api.stream(id, req));
    },
    async grantScreen(id, minutes) {
      return putEmployee(await attempt(() => api.grantScreen(id, minutes)));
    },
    async revokeScreen(id) {
      return putEmployee(await attempt(() => api.revokeScreen(id)));
    },

    // thread
    async loadThread(id) {
      // shot mode: fixtures are already loaded, and a shot may ask for a loading or error state
      if (isShot() && get().threads[id]) return;
      set((s) => ({ threads: { ...s.threads, [id]: { ...(s.threads[id] ?? emptyThread()), loading: true, error: null } } }));
      try {
        const page = await api.thread(id, { limit: THREAD_PAGE });
        set((s) => ({ threads: { ...s.threads, [id]: mergeThread(s.threads[id] ?? emptyThread(), page) } }));
      } catch (e) {
        set((s) => ({ threads: { ...s.threads, [id]: { ...(s.threads[id] ?? emptyThread()), loading: false, error: messageOf(e) } } }));
      }
    },

    async loadOlder(id) {
      const t = get().threads[id];
      const oldest = t?.messages[0]?.createdMs;
      if (!t || !t.hasMore || oldest === undefined) return;
      const page = await attempt(() => api.thread(id, { before: oldest, limit: THREAD_PAGE }));
      if (page) set((s) => ({ threads: { ...s.threads, [id]: mergeThread(s.threads[id] ?? emptyThread(), page, { older: true }) } }));
    },

    async sendMessage(id, text) {
      // no toast: the composer shows "Couldn't send" itself and keeps the text
      const m = await api.sendMessage(id, text).catch(() => null);
      if (!m) return false;
      set((s) => ({ threads: { ...s.threads, [id]: { ...(s.threads[id] ?? emptyThread()), messages: mergeMessages((s.threads[id] ?? emptyThread()).messages, [m]) } } }));
      return true;
    },

    async markRead(id) {
      set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, unread: 0 } : e)) }));
      await attempt(() => api.markRead(id));
    },

    async decideApproval(id, req) {
      const a = await attempt(() => api.decideApproval(id, req));
      if (!a) return false;
      set((s) => ({ threads: { ...s.threads, [a.employeeId]: { ...(s.threads[a.employeeId] ?? emptyThread()), approvals: mergeApprovals((s.threads[a.employeeId] ?? emptyThread()).approvals, [a]) } } }));
      return true;
    },

    // calls
    async startCall(employeeIds) {
      await prepareCall();
      const placeholder: CallSlice = {
        id: null, info: null, employeeIds, state: 'connecting', mode: 'audio', participants: {},
        speaker: { employeeId: null, phase: 'idle' }, captions: [], captionSeq: 0, hands: [],
      };
      set((s) => ({ call: placeholder, ui: { ...s.ui, summonOpen: false } }));
      const info = await attempt(() => api.createCall(employeeIds));
      if (!info) {
        set({ call: null });
        return false;
      }
      set((s) => (s.call ? { call: { ...s.call, id: info.id, info, mode: info.mode } } : {}));
      return true;
    },
    async addressCall(employeeId) {
      const id = get().call?.id;
      if (id) await attempt(() => api.addressCall(id, employeeId));
    },
    async endCall() {
      const id = get().call?.id;
      set({ call: null });
      if (id) await attempt(() => api.endCall(id));
    },

    // team and settings
    async loadTeam(range) {
      const r = range ?? get().teamRange;
      if (isShot() && (get().team[r] || get().teamLoading || get().teamError)) return;
      set({ teamRange: r, teamLoading: true, teamError: null });
      try {
        const report = await api.team(r);
        set((s) => ({ team: { ...s.team, [r]: report }, teamLoading: false }));
      } catch (e) {
        set({ teamLoading: false, teamError: messageOf(e) });
      }
    },
    async askTeam(req) {
      const out = await api.teamAsk({ ...req, conversationId: req.conversationId ?? get().teamConversationId ?? undefined });
      set({ teamConversationId: out.conversationId });
      return out;
    },
    async updateSettings(patch) {
      const prev = get().settings;
      if (prev) set({ settings: { ...prev, ...patch } });
      const next = await attempt(() => api.patchSettings(patch));
      if (!next) {
        if (prev) set({ settings: prev });
        return false;
      }
      set({ settings: next });
      return true;
    },
  };
});

/** Selectors. */
export const selectSelected = (s: Store): Employee | null => s.employees.find((e) => e.id === s.ui.selectedId) ?? null;
export const selectLive = (s: Store): boolean => s.call !== null;
export const needsAttention = (s: Store): number => s.employees.filter((e) => e.state === 'needs_you' || e.state === 'stuck').length;
