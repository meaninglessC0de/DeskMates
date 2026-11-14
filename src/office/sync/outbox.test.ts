import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { Store } from '../store/store.ts';
import { Outbox } from './outbox.ts';

describe('outbox', () => {
  it('uses the table the store already created', () => {
    const s = new Store(':memory:');
    const o = new Outbox(s.db);
    o.append('tasks', 't1', { task_id: 't1' });
    expect((s.db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n).toBe(1);
  });

  it('a later write for the same key replaces an unsent earlier one', () => {
    const o = new Outbox(new DatabaseSync(':memory:'));
    o.append('tasks', 't1', { v: 1 });
    o.append('tasks', 't2', { v: 1 });
    const seq = o.append('tasks', 't1', { v: 2 });
    expect(o.pending()).toBe(2);
    const rows = o.next(10)[0].rows;
    expect(rows.map((r) => [r.rowId, r.payload.v])).toEqual([['t2', 1], ['t1', 2]]);
    expect(rows[1].id).toBe(seq);
  });

  it('keeps the same key in different tables apart', () => {
    const o = new Outbox(new DatabaseSync(':memory:'));
    o.append('tasks', 'x', { a: 1 });
    o.append('messages', 'x', { a: 2 });
    expect(o.pending()).toBe(2);
  });

  it('hands out parent tables first and rows in sequence order, capped per table', () => {
    const o = new Outbox(new DatabaseSync(':memory:'));
    o.append('usage', 'u1', {});
    o.append('messages', 'm1', {});
    o.append('tasks', 't1', {});
    o.append('employees', 'e1', {});
    o.append('tasks', 't2', {});
    o.append('tasks', 't3', {});
    const batches = o.next(2);
    expect(batches.map((b) => b.table)).toEqual(['employees', 'tasks', 'messages', 'usage']);
    expect(batches[1].rows.map((r) => r.rowId)).toEqual(['t1', 't2']);
    const ids = batches.flatMap((b) => b.rows.map((r) => r.id));
    o.markSent(ids);
    expect(o.pending()).toBe(1);
    expect(o.next(2)[0].rows[0].rowId).toBe('t3');
  });

  it('a row superseded while its batch is in flight is not lost', () => {
    const o = new Outbox(new DatabaseSync(':memory:'));
    o.append('tasks', 't1', { v: 1 });
    const inFlight = o.next(10)[0].rows.map((r) => r.id);
    o.append('tasks', 't1', { v: 2 });
    o.markSent(inFlight);
    expect(o.pending()).toBe(1);
    expect(o.next(10)[0].rows[0].payload.v).toBe(2);
  });

  it('survives a restart: pending rows are counted from the database', () => {
    const db = new DatabaseSync(':memory:');
    new Outbox(db).append('tasks', 't1', {});
    expect(new Outbox(db).pending()).toBe(1);
  });
});
