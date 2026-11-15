import type { Approval, Employee, Message, TeamReport } from '../../../shared';
import { candidates, capabilities, callInfo, employees, presets, settings, teamReport, threads } from './data';

/**
 * The transport used in `?shot=` mode instead of fetch: answers every route of contracts
 * section 3 from the fixtures, in memory, with no network. Mutations return plausible objects
 * and do not persist (the store applies the results itself).
 */
let counter = 0;
const nextId = (prefix: string): string => `${prefix}_FAKE${String(++counter).padStart(22, '0')}`;

function find(id: string): Employee {
  const e = employees.find((x) => x.id === id);
  if (!e) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  return e;
}

export async function fakeRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const [pathname = '', search = ''] = path.split('?');
  const q = new URLSearchParams(search);
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  const b = (body ?? {}) as Record<string, unknown>;

  if (parts[0] !== 'api') throw new Error(`fake api: unexpected path ${path}`);
  const [, a, id, c, d] = parts;

  if (a === 'health') return { ok: true, version: 'fixture', capabilities };
  if (a === 'presets') return presets;
  if (a === 'settings') return method === 'PATCH' ? { ...settings, ...b } : settings;
  if (a === 'team' && id === 'ask') {
    return { answer: 'Maya closed the most tasks this week.', sql: null, columns: ['name', 'tasks'], rows: [['Maya Chen', '5'], ['Priya Raman', '3']], conversationId: 'conv_fixture' };
  }
  if (a === 'team') return teamReport((q.get('range') as TeamReport['range'] | null) ?? 'today');
  if (a === 'candidates') {
    const key = String(b.roleKey ?? '');
    const exclude = (b.exclude as string[] | undefined) ?? [];
    const pool = candidates.filter((x) => !employees.some((e) => e.persona.name === x.persona.name));
    const byRole = pool.filter((x) => x.persona.roleKey === key);
    const fresh = [...byRole, ...pool].filter((x) => !exclude.includes(x.token));
    return fresh[0] ?? candidates[0];
  }
  if (a === 'calls') {
    if (method === 'POST' && !id) return callInfo(((b.employeeIds as string[] | undefined) ?? []).slice(0, 4));
    return undefined;
  }
  if (a === 'approvals' && id) {
    const found = Object.values(threads).flatMap((t) => t.approvals).find((x) => x.id === id);
    if (!found) throw Object.assign(new Error('not_found'), { code: 'not_found' });
    const next: Approval = { ...found, status: b.decision === 'deny' ? 'denied' : 'approved', resolvedMs: Date.now() };
    return next;
  }
  if (a === 'employees') {
    if (!id) {
      if (method === 'POST') {
        const cand = candidates.find((x) => x.token === b.token) ?? candidates[0]!;
        const overrides = (b.overrides ?? {}) as { name?: string; personality?: string };
        return {
          ...employees[0]!, id: nextId('emp'), unread: 0,
          persona: { ...cand.persona, ...(overrides.name ? { name: overrides.name } : {}), ...(overrides.personality ? { personality: overrides.personality } : {}) },
          state: 'starting', stateDetail: 'Starting desktop', createdMs: Date.now(), lastActivityMs: Date.now(),
        } satisfies Employee;
      }
      return employees;
    }
    const e = find(id);
    if (!c) {
      if (method === 'PATCH') return { ...e, ...b, permissions: { ...e.permissions, ...((b.permissions as object | undefined) ?? {}) } };
      if (method === 'DELETE') return undefined;
      return e;
    }
    if (c === 'thread') {
      const t = threads[id];
      return t ?? { messages: [], steps: [], approvals: [], task: null };
    }
    if (c === 'messages') {
      const m: Message = {
        id: nextId('msg'), employeeId: id, from: 'user', kind: 'text', text: String(b.text ?? ''),
        taskId: null, createdMs: Date.now(), seenMs: null,
      };
      return m;
    }
    if (c === 'read') return undefined;
    if (c === 'pause') return { ...e, state: 'paused', stateDetail: 'Paused by you' };
    if (c === 'resume') return { ...e, state: 'idle', stateDetail: e.persona.role };
    if (c === 'control') return { ...e, controlledByUser: Boolean(b.on), state: b.on ? 'paused' : 'idle', stateDetail: b.on ? 'You have control' : e.persona.role };
    if (c === 'desktop') return { ...e, state: d === 'stop' ? 'offline' : e.state, stateDetail: d === 'stop' ? 'Desktop is off' : e.stateDetail };
    if (c === 'stream') return { kind: 'frames', url: `/api/employees/${id}/frame.jpg` };
    if (c === 'screen-grant') {
      return { ...e, screenGrant: method === 'DELETE' ? null : { untilMs: b.minutes ? Date.now() + Number(b.minutes) * 60_000 : null } };
    }
  }
  throw new Error(`fake api: no fixture for ${method} ${path}`);
}
