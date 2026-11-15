import { describe, expect, it } from 'vitest';
import type { ActivityStep, Message } from '../../../shared';
import { BUBBLE_LONG_MS, BUBBLE_MS, FEED_MAX, PULSE_MS, bubbleMs, feedRows, liveBubbles, livePulses, nextExpiry, peerMessages } from './feed';

const st = (id: string, employeeId: string, startedMs: number, peer?: ActivityStep['peer']): ActivityStep => ({ id, employeeId, taskId: null, sentence: 's', status: 'ok', startedMs, endedMs: null, peer });

const threads = {
  a: { steps: [st('1', 'a', 100, { employeeId: 'b', direction: 'to', text: 'Hello Jonas' }), st('x', 'a', 150), st('3', 'a', 300, { employeeId: 'b', direction: 'from', text: 'reply' })] },
  b: { steps: [st('2', 'b', 200, { employeeId: 'a', direction: 'to', text: 'Hi back' }), st('4', 'b', 120, { employeeId: 'a', direction: 'from', text: 'Hello Jonas' })] },
};

describe('peerMessages', () => {
  it('lists one message per sent step, oldest first, ignoring the receiver mirror and plain steps', () => {
    expect(peerMessages(threads).map((m) => [m.id, m.from, m.to])).toEqual([['1', 'a', 'b'], ['2', 'b', 'a']]);
  });
  it('keeps the newest 80', () => {
    const steps = Array.from({ length: 100 }, (_, i) => st(`m${String(i).padStart(3, '0')}`, 'a', i, { employeeId: 'b', direction: 'to', text: 'x' }));
    const out = peerMessages({ a: { steps } });
    expect(out).toHaveLength(80);
    expect(out[79]!.id).toBe('m099');
  });
});

describe('bubbles and pulses', () => {
  const msgs = peerMessages(threads);
  it('a bubble lasts 8 s, a long text 12 s', () => {
    expect(bubbleMs('short')).toBe(BUBBLE_MS);
    expect(bubbleMs('x'.repeat(150))).toBe(BUBBLE_LONG_MS);
    expect(Object.keys(liveBubbles(msgs, 100 + BUBBLE_MS - 1))).toEqual(['a', 'b']);
    expect(Object.keys(liveBubbles(msgs, 200 + BUBBLE_MS - 1))).toEqual(['b']);
    expect(Object.keys(liveBubbles(msgs, 100 + BUBBLE_MS + 1))).toEqual(['b']);
  });
  it('one bubble per sender: the newest wins', () => {
    const two = peerMessages({ a: { steps: [st('1', 'a', 100, { employeeId: 'b', direction: 'to', text: 'one' }), st('2', 'a', 200, { employeeId: 'c', direction: 'to', text: 'two' })] } });
    expect(liveBubbles(two, 300).a?.text).toBe('two');
  });
  it('the receiver pulses briefly, in the message sender', () => {
    expect(livePulses(msgs, 100 + 10).b?.from).toBe('a');
    expect(livePulses(msgs, 100 + PULSE_MS + 1).b).toBeUndefined();
  });
  it('nextExpiry is the soonest end still ahead', () => {
    expect(nextExpiry(msgs, 100 + 10)).toBe(100 + PULSE_MS);
    expect(nextExpiry(msgs, 100 + PULSE_MS + 1)).toBe(200 + PULSE_MS);
    expect(nextExpiry(msgs, 10_000)).toBeNull();
  });
});

describe('feedRows', () => {
  const m = (id: string, employeeId: string, from: Message['from'], kind: Message['kind'], text: string, createdMs: number): Message => ({ id, employeeId, from, kind, text, taskId: null, createdMs, seenMs: null });
  const feed = {
    a: { steps: [st('p1', 'a', 300, { employeeId: 'b', direction: 'to', text: 'desk to desk' })], messages: [m('m1', 'a', 'employee', 'text', 'hello boss', 100), m('m2', 'a', 'employee', 'done', 'finished', 400), m('m3', 'a', 'system', 'system', 'Call with a', 50), m('m4', 'a', 'employee', 'system', 'divider', 60), m('m5', 'a', 'user', 'text', 'everyone, start', 1000), m('m6', 'a', 'user', 'text', 'just you', 5000)] },
    b: { steps: [], messages: [m('m7', 'b', 'employee', 'question', 'may I?', 200), m('m8', 'b', 'user', 'text', 'everyone, start', 1900)] },
    c: { steps: [], messages: [m('m9', 'c', 'user', 'text', 'everyone, start', 3500)] },
  };
  it('merges peers, employee-to-manager and manager-to-employee rows by time, skipping system lines', () => {
    const rows = feedRows(feed);
    expect(rows.map((r) => r.id)).toEqual(['m1', 'm7', 'p1', 'm2', 'm5', 'm9', 'm6']);
  });
  it('tags done and question rows only', () => {
    const rows = feedRows(feed);
    expect(rows.map((r) => r.tag)).toEqual([null, 'Asks', null, 'Done', null, null, null]);
  });
  it('one row "to the team" for the same text within two seconds, a later copy is its own row', () => {
    const rows = feedRows(feed);
    expect(rows.find((r) => r.id === 'm5')).toMatchObject({ fromId: null, toId: null, team: true });
    expect(rows.find((r) => r.id === 'm9')).toMatchObject({ fromId: null, toId: 'c', team: false });
    expect(rows.find((r) => r.id === 'm6')).toMatchObject({ fromId: null, toId: 'a', team: false });
  });
  it('keeps desk-to-desk rows as they were and caps at 60', () => {
    expect(feedRows(feed).find((r) => r.id === 'p1')).toMatchObject({ fromId: 'a', toId: 'b', team: false, text: 'desk to desk' });
    const many = { a: { steps: [], messages: Array.from({ length: 90 }, (_, i) => m(`x${String(i).padStart(3, '0')}`, 'a', 'employee', 'text', 'hi', i)) } };
    const rows = feedRows(many);
    expect(rows).toHaveLength(FEED_MAX);
    expect(rows[rows.length - 1]!.id).toBe('x089');
  });
});
