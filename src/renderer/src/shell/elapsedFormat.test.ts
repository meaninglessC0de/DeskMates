import { describe, expect, it } from 'vitest';
import { formatElapsed, nextElapsedTick } from './elapsedFormat';

const MIN = 60_000;

describe('formatElapsed', () => {
  it('shows seconds only under a minute', () => {
    expect(formatElapsed(0)).toBe('0 s');
    expect(formatElapsed(42_900)).toBe('42 s');
    expect(formatElapsed(59_999)).toBe('59 s');
  });
  it('shows whole minutes from one minute on', () => {
    expect(formatElapsed(MIN)).toBe('1 min');
    expect(formatElapsed(40 * MIN + 1000)).toBe('40 min');
    expect(formatElapsed(59 * MIN + 59_000)).toBe('59 min');
  });
  it('shows hours and minutes', () => {
    expect(formatElapsed(72 * MIN)).toBe('1 h 12 min');
    expect(formatElapsed(120 * MIN + 5000)).toBe('2 h');
  });
  it('never goes negative', () => {
    expect(formatElapsed(-5000)).toBe('0 s');
  });
});

describe('nextElapsedTick', () => {
  it('ticks each second under a minute and at each minute after', () => {
    expect(nextElapsedTick(10_000)).toBeLessThanOrEqual(1020);
    expect(nextElapsedTick(10_500)).toBeLessThanOrEqual(520);
    const t = nextElapsedTick(40 * MIN + 1000);
    expect(t).toBeGreaterThan(50_000);
    expect(t).toBeLessThanOrEqual(59_020);
  });
});
