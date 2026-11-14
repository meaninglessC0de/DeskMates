import type { DatabaseSync } from 'node:sqlite';
import { TABLE_ORDER } from './sql.ts';
import type { SyncTable } from './types.ts';

export interface OutboxRow {
  id: number;
  table: SyncTable;
  rowId: string;
  payload: Record<string, unknown>;
}

export interface OutboxBatch {
  table: SyncTable;
  rows: OutboxRow[];
}

/**
 * The pending writes, in the store's own SQLite file (the `outbox` table the store creates: id is the sequence number).
 * A later write for the same table and key replaces an earlier one that has not been sent.
 */
export class Outbox {
  private unsent: number;

  constructor(private db: DatabaseSync, private now: () => number = Date.now) {
    // The store creates this table; standalone databases (tests, the smoke script) get the same shape.
    db.exec(`CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_ms INTEGER NOT NULL,
      sent_ms INTEGER
    )`);
    this.unsent = this.countFromDb();
  }

  private countFromDb(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE sent_ms IS NULL').get() as { n: number }).n;
  }

  /** Appends a row, dropping an unsent earlier version of the same row. Returns the new sequence number. */
  append(table: SyncTable, rowId: string, payload: Record<string, unknown>): number {
    const dropped = this.db.prepare('DELETE FROM outbox WHERE table_name = ? AND row_id = ? AND sent_ms IS NULL').run(table, rowId);
    const res = this.db.prepare('INSERT INTO outbox (table_name, row_id, payload, created_ms) VALUES (?,?,?,?)')
      .run(table, rowId, JSON.stringify(payload), this.now());
    this.unsent += 1 - Number(dropped.changes);
    return Number(res.lastInsertRowid);
  }

  pending(): number {
    return this.unsent;
  }

  /** Unsent rows in the given tables. */
  pendingIn(tables: SyncTable[]): number {
    let n = 0;
    for (const t of tables) n += (this.db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE table_name = ? AND sent_ms IS NULL').get(t) as { n: number }).n;
    return n;
  }

  /** The oldest unsent rows, at most `perTable` for each table (only `tables` if given), tables in parent-first order, rows in sequence order. */
  next(perTable: number, tables?: SyncTable[]): OutboxBatch[] {
    const out: OutboxBatch[] = [];
    for (const table of TABLE_ORDER) {
      if (tables && !tables.includes(table)) continue;
      const rows = this.db.prepare('SELECT id, row_id, payload FROM outbox WHERE table_name = ? AND sent_ms IS NULL ORDER BY id LIMIT ?').all(table, perTable) as
        { id: number; row_id: string; payload: string }[];
      if (rows.length) out.push({ table, rows: rows.map((r) => ({ id: r.id, table, rowId: r.row_id, payload: JSON.parse(r.payload) })) });
    }
    return out;
  }

  /** Removes rows after a confirmed SUCCEEDED. Rows superseded while the statement ran are already gone. */
  markSent(ids: number[]): void {
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      this.db.prepare(`DELETE FROM outbox WHERE id IN (${chunk.map(() => '?').join(',')})`).run(...chunk);
    }
    this.unsent = this.countFromDb();
  }
}
