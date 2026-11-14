import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './breaker.ts';

describe('circuit breaker', () => {
  const make = () => {
    const clock = { t: 1000 };
    const changes: string[] = [];
    const b = new CircuitBreaker({ threshold: 3, openMs: 300_000, now: () => clock.t, onChange: (s) => changes.push(s) });
    return { b, clock, changes };
  };

  it('opens after three failures in a row and stays open for five minutes', () => {
    const { b, clock, changes } = make();
    b.failure(); b.failure();
    expect(b.state()).toBe('closed');
    expect(b.allow()).toBe(true);
    b.failure();
    expect(b.state()).toBe('open');
    expect(b.allow()).toBe(false);
    clock.t += 299_999;
    expect(b.allow()).toBe(false);
    expect(changes).toEqual(['open']);
  });

  it('a success resets the count', () => {
    const { b } = make();
    b.failure(); b.failure(); b.success(); b.failure(); b.failure();
    expect(b.state()).toBe('closed');
  });

  it('lets one probe through when half-open; success closes it', () => {
    const { b, clock, changes } = make();
    b.failure(); b.failure(); b.failure();
    clock.t += 300_000;
    expect(b.state()).toBe('half-open');
    expect(b.allow()).toBe(true);
    expect(b.allow()).toBe(false); // only one probe at a time
    b.success();
    expect(b.state()).toBe('closed');
    expect(b.allow()).toBe(true);
    expect(changes).toEqual(['open', 'closed']);
  });

  it('a failed probe re-opens for another five minutes', () => {
    const { b, clock } = make();
    b.failure(); b.failure(); b.failure();
    clock.t += 300_000;
    expect(b.allow()).toBe(true);
    b.failure();
    expect(b.state()).toBe('open');
    clock.t += 299_000;
    expect(b.allow()).toBe(false);
    clock.t += 1000;
    expect(b.allow()).toBe(true);
  });

  it('trips at once on a credential problem', () => {
    const { b } = make();
    b.failure(true);
    expect(b.state()).toBe('open');
  });
});
