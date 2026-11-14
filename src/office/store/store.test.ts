import { describe, expect, it } from 'vitest';
import type { Employee, Message, Task } from '../../shared/index.ts';
import { Store } from './store.ts';

function emp(id: string, over: Partial<Employee> = {}): Employee {
  return {
    id,
    persona: { name: 'Maya Okafor', firstName: 'Maya', role: 'Web developer', roleKey: 'web_developer', personality: 'Calm', workingStyle: 'Small steps', starters: [], portraitUrl: '', voice: { provider: 'livekit', voiceId: '', label: 'Warm', sampleUrl: null }, avatarId: null },
    permissions: { level: 'asks_big_steps', internet: true, commands: true, myScreen: false, teammates: true },
    state: 'idle', stateDetail: 'Web developer', stateSinceMs: 1, spaceId: null, sessionId: null, model: 'm', unread: 0, lastActivityMs: 1,
    screenGrant: null, desktopSinceMs: null, pendingRestart: false, controlledByUser: false, createdMs: 1, ...over,
  };
}

function task(id: string, employeeId: string, over: Partial<Task> = {}): Task {
  return { id, employeeId, title: 't', assignedBy: 'user', status: 'running', plan: [{ title: 'a', status: 'pending' }], outcome: null, assignedMs: 100, finishedMs: null, activeMs: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, numTurns: 0, traceId: null, ...over };
}

function msg(id: string, employeeId: string, createdMs: number, from: Message['from'] = 'user'): Message {
  return { id, employeeId, from, kind: 'text', text: id, taskId: null, createdMs, seenMs: null };
}

describe('Store', () => {
  it('round-trips an employee and patches single fields', () => {
    const s = new Store(':memory:');
    s.insertEmployee(emp('e1'), { castId: 'maya' });
    s.updateEmployee('e1', { state: 'working', stateDetail: 'Busy', screenGrant: { untilMs: 5 }, controlledByUser: true, unread: 3 });
    const e = s.getEmployee('e1')!;
    expect(e.state).toBe('working');
    expect(e.screenGrant).toEqual({ untilMs: 5 });
    expect(e.controlledByUser).toBe(true);
    expect(e.unread).toBe(3);
    expect(e.persona.firstName).toBe('Maya');
    expect(s.castIdsInUse()).toEqual(['maya']);
    s.updateEmployee('e1', { screenGrant: null });
    expect(s.getEmployee('e1')!.screenGrant).toBeNull();
    expect(s.getExtra('e1')).toEqual({ castId: 'maya', paused: false, stuckReason: null });
    s.setExtra('e1', { paused: true, stuckReason: 'x' });
    expect(s.getExtra('e1')).toMatchObject({ paused: true, stuckReason: 'x' });
  });

  it('pages messages newest first, oldest first within a page, and marks the user\'s seen', () => {
    const s = new Store(':memory:');
    s.insertEmployee(emp('e1'));
    for (let i = 1; i <= 7; i++) s.insertMessage(msg(`m${i}`, 'e1', i * 10, i % 2 ? 'user' : 'employee'));
    expect(s.listMessages('e1', { limit: 3 }).map((m) => m.id)).toEqual(['m5', 'm6', 'm7']);
    expect(s.listMessages('e1', { before: 50, limit: 3 }).map((m) => m.id)).toEqual(['m2', 'm3', 'm4']);
    const seen = s.markSeen('e1', 999);
    expect(seen.map((m) => m.id)).toEqual(['m1', 'm3', 'm5', 'm7']);
    expect(s.getMessage('m3')!.seenMs).toBe(999);
    expect(s.markSeen('e1', 1000)).toHaveLength(0);
    expect(s.lastMessage('e1', 'employee')!.id).toBe('m6');
  });

  it('upserts steps and tasks, finds the open task and the range', () => {
    const s = new Store(':memory:');
    s.insertEmployee(emp('e1'));
    s.upsertStep({ id: 's1', employeeId: 'e1', taskId: null, sentence: 'Opened it', status: 'running', startedMs: 5, endedMs: null });
    s.upsertStep({ id: 's1', employeeId: 'e1', taskId: null, sentence: 'Opened it', status: 'ok', startedMs: 5, endedMs: 9, peer: { employeeId: 'e2', direction: 'to', text: 'hi' } });
    const st = s.getStep('s1')!;
    expect(st.status).toBe('ok');
    expect(st.peer?.text).toBe('hi');
    s.upsertTask(task('t1', 'e1', { status: 'done', finishedMs: 200, activeMs: 50, costUsd: 0.5 }));
    s.upsertTask(task('t2', 'e1', { assignedMs: 300 }));
    expect(s.openTask('e1')!.id).toBe('t2');
    expect(s.latestTask('e1')!.id).toBe('t2');
    expect(s.getTask('t2')!.plan).toEqual([{ title: 'a', status: 'pending' }]);
    expect(s.listTasksInRange(150, 250).map((t) => t.id)).toEqual(['t1']);
    expect(s.listTasksInRange(250, 400).map((t) => t.id)).toEqual(['t2']);
  });

  it('expires pending approvals and closes running steps after a crash', () => {
    const s = new Store(':memory:');
    s.insertEmployee(emp('e1'));
    s.insertApproval({ id: 'a1', employeeId: 'e1', taskId: null, title: 'T', detail: 'D', kind: 'screen', screenMinutes: 5, status: 'pending', createdMs: 1, resolvedMs: null });
    s.insertApproval({ id: 'a2', employeeId: 'e1', taskId: null, title: 'T', detail: 'D', kind: 'tool', status: 'approved', createdMs: 2, resolvedMs: 3 });
    s.upsertStep({ id: 's1', employeeId: 'e1', taskId: null, sentence: 'x', status: 'running', startedMs: 5, endedMs: null });
    const r = s.repairAfterCrash(777);
    expect(r.expired.map((a) => a.id)).toEqual(['a1']);
    expect(s.getApproval('a1')).toMatchObject({ status: 'expired', resolvedMs: 777, screenMinutes: 5 });
    expect(s.getApproval('a2')!.status).toBe('approved');
    expect(s.getStep('s1')).toMatchObject({ status: 'ok', endedMs: 777 });
    expect(s.pendingApprovals()).toHaveLength(0);
  });

  it('keeps settings, notes and kv, and deletes an employee with its thread', () => {
    const s = new Store(':memory:');
    const defaults = { userName: 'Sam', appearance: 'system' as const, notifyMessages: true, notifyDone: true, captions: true };
    expect(s.getSettings(defaults)).toEqual(defaults);
    s.patchSettings({ appearance: 'dark', captions: false });
    expect(s.getSettings(defaults)).toMatchObject({ appearance: 'dark', captions: false, userName: 'Sam' });
    s.insertEmployee(emp('e1'));
    s.addNote('e1', 'one', 1);
    s.addNote('e1', 'two', 2);
    expect(s.listNotes('e1', 1)).toEqual(['two']);
    expect(s.listNotes('e1', 5)).toEqual(['one', 'two']);
    s.kvSet('cost:e1', '1.5');
    expect(s.kvGet('cost:e1')).toBe('1.5');
    s.insertMessage(msg('m1', 'e1', 1));
    s.upsertTask(task('t1', 'e1'));
    s.deleteEmployee('e1');
    expect(s.getEmployee('e1')).toBeUndefined();
    expect(s.listMessages('e1')).toHaveLength(0);
    expect(s.latestTask('e1')).toBeUndefined();
    expect(s.listNotes('e1', 5)).toHaveLength(0);
    expect(s.kvGet('cost:e1')).toBeUndefined();
  });

  it('migrates a fresh database and reports the sync hook', () => {
    const s = new Store(':memory:');
    const seen: string[] = [];
    s.onWrite = (t) => seen.push(t);
    s.insertEmployee(emp('e1'));
    s.upsertTask(task('t1', 'e1'));
    s.addUsage({ employeeId: 'e1', taskId: 't1', tsMs: 1, costUsd: 0.1, inputTokens: 1, outputTokens: 1 });
    expect(seen).toEqual(['employees', 'tasks', 'usage']);
    expect((s.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1);
  });
});
