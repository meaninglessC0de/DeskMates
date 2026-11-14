import { describe, expect, it } from 'vitest';
import { employees } from '../fixtures/data';
import { sortEmployees } from '../api/reducer';
import { presenceOf, rowLine, topBarLine } from './presence';

describe('presence', () => {
  it('colours only working, needs you and stuck', () => {
    expect(presenceOf('working')).toMatchObject({ variant: 'success' });
    expect(presenceOf('needs_you')).toMatchObject({ variant: 'warning' });
    expect(presenceOf('stuck')).toMatchObject({ variant: 'error' });
    expect(presenceOf('on_call')).toMatchObject({ variant: 'accent' });
    for (const s of ['idle', 'paused'] as const) expect(presenceOf(s)).toMatchObject({ variant: 'neutral' });
    expect(presenceOf('offline')).toEqual({ kind: 'none' });
    expect(presenceOf('starting')).toEqual({ kind: 'spinner' });
  });

  it('emphasises only the needs-you and stuck rows', () => {
    const emphasised = employees.filter((e) => rowLine(e).emphasised).map((e) => e.persona.firstName);
    expect(emphasised).toEqual(['Maya']);
    expect(rowLine({ ...employees[2]!, state: 'stuck', stateDetail: "Staging site won't load" }).emphasised).toBe(true);
  });

  it('puts needs you first in the sidebar order of the demo', () => {
    expect(sortEmployees(employees).map((e) => e.persona.firstName)).toEqual(['Maya', 'Priya', 'Jonas', 'Ines']);
  });

  it('builds the top bar line', () => {
    expect(topBarLine(employees[0]!)).toEqual({ prefix: 'Web developer · Needs you', timer: false });
    expect(topBarLine({ ...employees[0]!, state: 'working' })).toEqual({ prefix: 'Web developer · Working · ', timer: true });
  });
});
