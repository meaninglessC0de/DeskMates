import { describe, expect, it } from 'vitest';
import { EMP, NOW, ago, threads } from '../fixtures/data';
import { emptyThread } from '../api/reducer';
import { bubbleGroups, buildTimeline, dayLabel, formatWorked } from './model';

const MIN = 60_000;

describe('buildTimeline', () => {
  it('turns the Maya fixture into a day, your message and one employee run with one activity group', () => {
    const t = threads[EMP.maya]!;
    const items = buildTimeline({ messages: t.messages, steps: t.steps, approvals: t.approvals }, NOW);
    expect(items.map((i) => i.kind).filter((k) => k !== 'day')).toEqual(['user', 'employee']);
    const run = items[2]!;
    if (run.kind !== 'employee') throw new Error('expected a run');
    expect(run.parts.map((p) => p.kind)).toEqual(['message', 'message', 'activity', 'message', 'approval']);
    const act = run.parts[2]!;
    if (act.kind !== 'activity') throw new Error('expected activity');
    expect(act.group.steps).toHaveLength(6);
    expect(act.group.running).toBe(false);
  });

  it('keeps a running group at the bottom and labels it with the newest running step', () => {
    const t = threads[EMP.priya]!;
    const items = buildTimeline({ messages: t.messages, steps: t.steps, approvals: [] }, NOW);
    const run = items[items.length - 1]!;
    if (run.kind !== 'employee') throw new Error('expected a run');
    const last = run.parts[run.parts.length - 1]!;
    expect(last.kind).toBe('activity');
    if (last.kind === 'activity') {
      expect(last.group.running).toBe(true);
      expect(last.group.latest).toBe('Drafting three subject lines');
    }
  });

  it('starts a new group after your message, an approval or a long gap', () => {
    const base = threads[EMP.maya]!;
    const mk = (n: number, startedMs: number) => ({ ...base.steps[0]!, id: `s${n}`, startedMs, endedMs: startedMs + 1000 });
    const msg = (n: number, from: 'user' | 'employee', createdMs: number) => ({ ...base.messages[0]!, id: `m${n}`, from, createdMs });
    const items = buildTimeline(
      { messages: [msg(1, 'user', ago(100 * MIN)), msg(2, 'user', ago(50 * MIN))], steps: [mk(1, ago(99 * MIN)), mk(2, ago(98 * MIN)), mk(3, ago(40 * MIN)), mk(4, ago(5 * MIN))], approvals: [] },
      NOW,
    );
    const groups = items.flatMap((i) => (i.kind === 'employee' ? i.parts.filter((p) => p.kind === 'activity') : []));
    expect(groups).toHaveLength(3);
  });

  it('puts your consecutive messages in one run and system lines on their own', () => {
    const t = threads[EMP.jonas]!;
    const items = buildTimeline({ messages: t.messages, steps: [], approvals: [] }, NOW);
    expect(items.map((i) => i.kind).filter((k) => k !== 'day')).toEqual(['user', 'employee', 'system']);
    expect(items[0]!.kind).toBe('day');
  });

  it('is empty for an empty thread', () => {
    expect(buildTimeline(emptyThread(), NOW)).toEqual([]);
  });
});

describe('labels', () => {
  it('names days', () => {
    expect(dayLabel(NOW, NOW)).toBe('Today');
    expect(dayLabel(NOW - 86_400_000, NOW)).toBe('Yesterday');
    expect(dayLabel(NOW - 3 * 86_400_000, NOW)).toMatch(/^[A-Z][a-z]+day$/);
    expect(dayLabel(NOW - 30 * 86_400_000, NOW)).toMatch(/^\d{1,2} [A-Z][a-z]+$/);
  });
  it('formats worked time', () => {
    expect(formatWorked(40_000)).toBe('40 sec');
    expect(formatWorked(6 * MIN)).toBe('6 min');
    expect(formatWorked(65 * MIN)).toBe('1 h 5 min');
    expect(formatWorked(60 * MIN)).toBe('1 h');
  });
});

describe('bubbleGroups', () => {
  it('marks first, middle and last of consecutive bubbles only', () => {
    const m = (id: string) => ({ kind: 'message' as const, key: id, message: threads[EMP.maya]!.messages[0]! });
    const act = { kind: 'activity' as const, key: 'a', group: undefined as never };
    expect(bubbleGroups([m('1'), m('2'), m('3'), act, m('4')])).toEqual(['first', 'middle', 'last', undefined, undefined]);
  });
});
