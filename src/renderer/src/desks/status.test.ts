import { describe, expect, it } from 'vitest';
import type { ActivityStep, Approval, Employee, Task } from '../../../shared';
import { employees } from '../fixtures/data';
import { deskStatus } from './status';

const base = employees[2]!;
const emp = (o: Partial<Employee>): Employee => ({ ...base, ...o });
const step = (sentence: string, startedMs: number): ActivityStep => ({ id: `s${startedMs}`, employeeId: base.id, taskId: null, sentence, status: 'ok', startedMs, endedMs: null });
const task = (o: Partial<Task>): Task => ({
  id: 't', employeeId: base.id, title: '', assignedBy: 'user', status: 'running', plan: [], outcome: null, assignedMs: 0, finishedMs: null,
  activeMs: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, numTurns: 0, traceId: null, ...o,
});
const plan = (n: number, done: number) => Array.from({ length: n }, (_, i) => ({ title: `p${i}`, status: i < done ? ('done' as const) : ('pending' as const) }));

describe('deskStatus', () => {
  it('working: the state and the latest step, with plan progress', () => {
    const s = deskStatus(emp({ state: 'working', stateDetail: 'Fixing the cart' }), { steps: [step('Read the code', 1), step('Ran the tests', 2)], approvals: [], task: task({ plan: plan(5, 3) }) });
    expect(s).toEqual({ word: 'Working', detail: 'Ran the tests', tone: 'normal', progress: '3 of 5' });
  });
  it('working with no step yet falls back to the state detail', () => {
    expect(deskStatus(emp({ state: 'working', stateDetail: 'Starting the task' }), undefined)).toMatchObject({ word: 'Working', detail: 'Starting the task', progress: null });
  });
  it('waiting is shown on its own', () => {
    expect(deskStatus(emp({ state: 'working', stateDetail: 'Waiting for Priya' }), { steps: [step('Messaged Priya', 1)], approvals: [], task: null })).toMatchObject({ word: null, detail: 'Waiting for Priya' });
  });
  it('needs you: the pending approval title, attention tone', () => {
    const a = (id: string, title: string, status: Approval['status'], createdMs: number): Approval => ({ id, employeeId: base.id, taskId: null, title, detail: '', kind: 'tool', status, createdMs, resolvedMs: null });
    const s = deskStatus(emp({ state: 'needs_you', stateDetail: 'Deploy' }), { steps: [], approvals: [a('1', 'Old one', 'approved', 1), a('2', 'Publish with git push', 'pending', 2)], task: null });
    expect(s).toMatchObject({ word: 'Needs you', detail: 'Publish with git push', tone: 'attention' });
  });
  it('done shows no outcome text, idle is idle, no progress once the task is over', () => {
    expect(deskStatus(emp({ state: 'idle' }), { steps: [], approvals: [], task: task({ status: 'done', outcome: 'Vendor B is cheapest.', plan: plan(3, 3) }) })).toEqual({ word: 'Done', detail: null, tone: 'normal', progress: null });
    expect(deskStatus(emp({ state: 'idle' }), undefined)).toMatchObject({ word: 'Idle', detail: null });
    expect(deskStatus(emp({ state: 'idle' }), { steps: [], approvals: [], task: task({ status: 'done' }) })).toMatchObject({ word: 'Done', detail: null });
  });
  it('only needs-you carries the attention tone', () => {
    for (const state of ['working', 'idle', 'stuck', 'paused', 'on_call', 'starting', 'offline'] as const) {
      expect(deskStatus(emp({ state, stateDetail: 'x' }), undefined).tone).toBe('normal');
    }
  });
});
