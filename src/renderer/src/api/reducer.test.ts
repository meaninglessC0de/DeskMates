import { describe, expect, it } from 'vitest';
import type { ActivityStep, Approval, Employee, Message, ServerEvent, Task } from '../../../shared';
import { employees as fx, threads, capabilities, EMP } from '../fixtures/data';
import {
  emptyThread, initialData, MAX_STEPS, mergeThread, reduceEvent, sortEmployees, THREAD_PAGE,
} from './reducer';
import type { Data } from './reducer';

const base = (): Data => {
  const d = initialData();
  return { ...d, bootState: 'ready', employees: sortEmployees(fx), ui: { ...d.ui, selectedId: EMP.maya } };
};
const apply = (s: Data, e: ServerEvent, focused = true): Data => ({ ...s, ...reduceEvent(s, e, { focused }).patch });
const emp = (o: Partial<Employee>, id = EMP.jonas): Employee => ({ ...fx.find((e) => e.id === id)!, ...o });
const message = (o: Partial<Message>): Message => ({
  id: 'msg_X', employeeId: EMP.priya, from: 'employee', kind: 'text', text: 'hi', taskId: null, createdMs: 1000, seenMs: null, ...o,
});

describe('sidebar ordering', () => {
  it('puts needs_you, then stuck, then recent', () => {
    const list = sortEmployees([
      emp({ id: 'a', state: 'idle', lastActivityMs: 500 }),
      emp({ id: 'b', state: 'working', lastActivityMs: 900 }),
      emp({ id: 'c', state: 'stuck', lastActivityMs: 100 }),
      emp({ id: 'd', state: 'needs_you', lastActivityMs: 50 }),
      emp({ id: 'e', state: 'needs_you', lastActivityMs: 60 }),
    ]);
    expect(list.map((e) => e.id)).toEqual(['e', 'd', 'c', 'b', 'a']);
  });
  it('matches the demo order of the fixtures', () => {
    expect(sortEmployees(fx).map((e) => e.persona.firstName)).toEqual(['Maya', 'Priya', 'Jonas', 'Ines']);
  });
  it('re-sorts when an employee event changes state', () => {
    const s = apply(base(), { type: 'employee', employee: emp({ state: 'stuck', lastActivityMs: 1 }) });
    expect(s.employees.map((e) => e.persona.firstName)).toEqual(['Maya', 'Jonas', 'Priya', 'Ines']);
  });
});

describe('events', () => {
  it('hello sets capabilities and connected', () => {
    const s = apply(base(), { type: 'hello', capabilities: { ...capabilities, genie: true } });
    expect(s.capabilities?.genie).toBe(true);
    expect(s.connected).toBe(true);
  });
  it('employee creates and selects the first employee when none is selected', () => {
    const s = apply(initialData(), { type: 'employee', employee: fx[0]! });
    expect(s.employees).toHaveLength(1);
    expect(s.ui.selectedId).toBe(EMP.maya);
  });
  it('employee_removed drops the employee, its thread and moves the selection', () => {
    let s = base();
    s = { ...s, threads: { [EMP.maya]: emptyThread() }, ui: { ...s.ui, desktopOpen: { [EMP.maya]: true } } };
    s = apply(s, { type: 'employee_removed', id: EMP.maya });
    expect(s.employees.find((e) => e.id === EMP.maya)).toBeUndefined();
    expect(s.threads[EMP.maya]).toBeUndefined();
    expect(s.ui.desktopOpen[EMP.maya]).toBeUndefined();
    expect(s.ui.selectedId).toBe(s.employees[0]!.id);
  });
  it('message appends in time order and ignores duplicates', () => {
    let s = base();
    s = apply(s, { type: 'message', message: message({ id: 'msg_B', createdMs: 2000 }) });
    s = apply(s, { type: 'message', message: message({ id: 'msg_A', createdMs: 1000 }) });
    s = apply(s, { type: 'message', message: message({ id: 'msg_B', createdMs: 2000, text: 'edited' }) });
    const m = s.threads[EMP.priya]!.messages;
    expect(m.map((x) => x.id)).toEqual(['msg_A', 'msg_B']);
    expect(m[1]!.text).toBe('edited');
  });
  it('message_seen sets seenMs', () => {
    let s = apply(base(), { type: 'message', message: message({ id: 'msg_U', from: 'user' }) });
    s = apply(s, { type: 'message_seen', id: 'msg_U', employeeId: EMP.priya, seenMs: 5000 });
    expect(s.threads[EMP.priya]!.messages[0]!.seenMs).toBe(5000);
  });
  it('typing toggles and a reply clears it', () => {
    let s = apply(base(), { type: 'typing', employeeId: EMP.priya, on: true });
    expect(s.threads[EMP.priya]!.typing).toBe(true);
    s = apply(s, { type: 'message', message: message({}) });
    expect(s.threads[EMP.priya]!.typing).toBe(false);
  });
  it('step keeps a recent window per employee', () => {
    let s = base();
    for (let i = 0; i < MAX_STEPS + 20; i++) {
      s = apply(s, { type: 'step', step: { id: `evt_${String(i).padStart(4, '0')}`, employeeId: EMP.priya, taskId: null, sentence: 'x', status: 'ok', startedMs: i, endedMs: null } });
    }
    const steps = s.threads[EMP.priya]!.steps;
    expect(steps).toHaveLength(MAX_STEPS);
    expect(steps[steps.length - 1]!.startedMs).toBe(MAX_STEPS + 19);
  });
  it('step upserts by id', () => {
    const step: ActivityStep = { id: 'evt_1', employeeId: EMP.priya, taskId: null, sentence: 'Opened it', status: 'running', startedMs: 10, endedMs: null };
    let s = apply(base(), { type: 'step', step });
    s = apply(s, { type: 'step', step: { ...step, status: 'ok', endedMs: 20 } });
    expect(s.threads[EMP.priya]!.steps).toHaveLength(1);
    expect(s.threads[EMP.priya]!.steps[0]!.status).toBe('ok');
  });
  it('task replaces the same task and keeps the newest', () => {
    const t = threads[EMP.maya]!.task!;
    let s = apply(base(), { type: 'task', task: t });
    const updated: Task = { ...t, plan: t.plan.map((p) => ({ ...p, status: 'done' as const })) };
    s = apply(s, { type: 'task', task: updated });
    expect(s.threads[EMP.maya]!.task!.plan.every((p) => p.status === 'done')).toBe(true);
    const older: Task = { ...t, id: 'tsk_OLD', assignedMs: t.assignedMs - 1000 };
    s = apply(s, { type: 'task', task: older });
    expect(s.threads[EMP.maya]!.task!.id).toBe(t.id);
  });
  it('approval creates then resolves in place', () => {
    const a: Approval = { id: 'apr_1', employeeId: EMP.maya, taskId: null, title: 'Deploy', detail: '', kind: 'big_step', status: 'pending', createdMs: 1, resolvedMs: null };
    let s = apply(base(), { type: 'approval', approval: a });
    s = apply(s, { type: 'approval', approval: { ...a, status: 'approved', resolvedMs: 2 } });
    expect(s.threads[EMP.maya]!.approvals).toHaveLength(1);
    expect(s.threads[EMP.maya]!.approvals[0]!.status).toBe('approved');
  });
  it('toast bumps the sequence', () => {
    let s = apply(base(), { type: 'toast', text: 'one', tone: 'info' });
    s = apply(s, { type: 'toast', text: 'two', tone: 'error' });
    expect(s.toast).toEqual({ seq: 2, text: 'two', tone: 'error' });
  });
  it('notify yields a shell notification unless the user is looking at that thread', () => {
    const e: ServerEvent = { type: 'notify', employeeId: EMP.priya, title: 'Priya', body: 'Done', kind: 'done' };
    expect(reduceEvent(base(), e, { focused: true }).effects).toHaveLength(1);
    const looking = { ...base(), ui: { ...base().ui, selectedId: EMP.priya } };
    expect(reduceEvent(looking, e, { focused: true }).effects).toHaveLength(0);
    expect(reduceEvent(looking, e, { focused: false }).effects).toHaveLength(1);
  });
});

describe('unread counts', () => {
  it('are set by employee events and untouched by messages for other threads', () => {
    let s = apply(base(), { type: 'employee', employee: emp({ unread: 3 }, EMP.priya) });
    s = apply(s, { type: 'message', message: message({ employeeId: EMP.priya }) });
    expect(s.employees.find((e) => e.id === EMP.priya)!.unread).toBe(3);
  });
  it('clear and mark read when a message arrives in the open thread', () => {
    const s0 = base();
    const r = reduceEvent(s0, { type: 'message', message: message({ employeeId: EMP.maya }) }, { focused: true });
    const next = { ...s0, ...r.patch };
    expect(next.employees.find((e) => e.id === EMP.maya)!.unread).toBe(0);
    expect(r.effects).toEqual([{ type: 'markRead', employeeId: EMP.maya }]);
  });
  it('keep counting when the window is not focused', () => {
    const r = reduceEvent(base(), { type: 'message', message: message({ employeeId: EMP.maya }) }, { focused: false });
    expect(r.effects).toHaveLength(0);
  });
});

describe('thread merge', () => {
  const page = (ids: number[]) => ({
    messages: ids.map((n) => message({ id: `msg_${n}`, createdMs: n })), steps: [], approvals: [], task: null,
  });
  it('merges pages by time whatever the arrival order', () => {
    let t = mergeThread(emptyThread(), page([5, 6, 7]));
    t = mergeThread(t, page([1, 2, 3]), { older: true });
    t = mergeThread(t, page([6, 7, 8]));
    expect(t.messages.map((m) => m.createdMs)).toEqual([1, 2, 3, 5, 6, 7, 8]);
  });
  it('tracks hasMore from the page size and keeps the task of the newest page', () => {
    const full = { ...page(Array.from({ length: THREAD_PAGE }, (_, i) => i + 100)), task: threads[EMP.maya]!.task };
    let t = mergeThread(emptyThread(), full);
    expect(t.hasMore).toBe(true);
    expect(t.task).not.toBeNull();
    t = mergeThread(t, page([1, 2]), { older: true });
    expect(t.hasMore).toBe(false);
    expect(t.task).not.toBeNull();
  });
});

describe('call events', () => {
  const placeholder = (): Data => ({
    ...base(),
    call: { id: null, info: null, employeeIds: [EMP.maya], state: 'connecting' as const, mode: 'audio' as const, participants: {}, speaker: { employeeId: null, phase: 'idle' as const }, captions: [], captionSeq: 0, hands: [] },
  });
  it('adopts the call id from the first event (events can beat the HTTP response)', () => {
    const s = apply(placeholder(), { type: 'call', callId: 'call_1', event: { kind: 'state', state: 'live', mode: 'audio' } });
    expect(s.call?.id).toBe('call_1');
    expect(s.call?.state).toBe('live');
  });
  it('ignores events for another call', () => {
    let s = apply(placeholder(), { type: 'call', callId: 'call_1', event: { kind: 'state', state: 'live', mode: 'audio' } });
    s = apply(s, { type: 'call', callId: 'call_2', event: { kind: 'state', state: 'failed', mode: 'audio' } });
    expect(s.call?.state).toBe('live');
  });
  it('tracks participants and speaker', () => {
    let s = apply(placeholder(), { type: 'call', callId: 'c', event: { kind: 'participant', employeeId: EMP.maya, state: 'present' } });
    s = apply(s, { type: 'call', callId: 'c', event: { kind: 'speaker', employeeId: EMP.maya, phase: 'speaking' } });
    expect(s.call?.participants[EMP.maya]).toBe('present');
    expect(s.call?.speaker).toEqual({ employeeId: EMP.maya, phase: 'speaking' });
  });
  it('updates a partial caption in place, then starts a new one', () => {
    let s = placeholder();
    const cap = (text: string, final: boolean) => ({ type: 'call', callId: 'c', event: { kind: 'caption', from: EMP.maya, text, final } }) as ServerEvent;
    s = apply(s, cap('Hel', false));
    s = apply(s, cap('Hello there', true));
    s = apply(s, cap('Next', false));
    expect(s.call!.captions.map((c) => [c.text, c.final])).toEqual([['Hello there', true], ['Next', false]]);
    expect(new Set(s.call!.captions.map((c) => c.id)).size).toBe(2);
  });
  it('raises and lowers hands', () => {
    let s = apply(placeholder(), { type: 'call', callId: 'c', event: { kind: 'hand', employeeId: EMP.maya, raised: true } });
    expect(s.call?.hands).toEqual([EMP.maya]);
    s = apply(s, { type: 'call', callId: 'c', event: { kind: 'hand', employeeId: EMP.maya, raised: false } });
    expect(s.call?.hands).toEqual([]);
  });
  it('ended clears the call; events with no call are ignored', () => {
    let s = apply(placeholder(), { type: 'call', callId: 'c', event: { kind: 'state', state: 'ended', mode: 'audio' } });
    expect(s.call).toBeNull();
    s = apply(s, { type: 'call', callId: 'c', event: { kind: 'state', state: 'live', mode: 'audio' } });
    expect(s.call).toBeNull();
  });
});
