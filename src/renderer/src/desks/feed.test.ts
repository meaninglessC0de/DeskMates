import { describe, expect, it } from 'vitest';
import type { ActivityStep } from '../../../shared';
import { BUBBLE_LONG_MS, BUBBLE_MS, PULSE_MS, bubbleMs, liveBubbles, livePulses, nextExpiry, peerMessages } from './feed';

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
