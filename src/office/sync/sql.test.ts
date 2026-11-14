import { describe, expect, it } from 'vitest';
import { parseMerge } from './fakeDatabricks.ts';
import { buildMerge, checkLocation, ddl, dedupe, literal, sqlString, TABLES } from './sql.ts';

const loc = { catalog: 'workspace', schema: 'agent_manager' };

describe('sqlString', () => {
  it('escapes quotes, backslashes, line breaks and control characters', () => {
    expect(sqlString("it's")).toBe("'it\\'s'");
    expect(sqlString('a\\b')).toBe("'a\\\\b'");
    expect(sqlString('line1\nline2\r\n\ttab')).toBe("'line1\\nline2\\r\\n\\ttab'");
    expect(sqlString('nul\0here')).toBe("'nul\\0here'");
    expect(sqlString('bell\u0007')).toBe("'bell\\u0007'");
    expect(sqlString("'; DROP TABLE x; --")).toBe("'\\'; DROP TABLE x; --'");
  });
  it('keeps unicode and replaces lone surrogates', () => {
    expect(sqlString('naïve – 日本語 – 🙂')).toBe("'naïve – 日本語 – 🙂'");
    expect(sqlString('x\ud800y')).toBe("'x�y'");
  });
  it('a backslash before a quote cannot undo the quote escape', () => {
    // value  \'  must become  \\\'  (escaped backslash, then escaped quote)
    expect(sqlString("\\'")).toBe("'\\\\\\''");
  });
});

describe('literal', () => {
  it('writes typed NULLs and numbers', () => {
    expect(literal('STRING', null)).toBe('CAST(NULL AS STRING)');
    expect(literal('STRING', undefined)).toBe('CAST(NULL AS STRING)');
    expect(literal('BIGINT', null)).toBe('CAST(NULL AS BIGINT)');
    expect(literal('BIGINT', 12.9)).toBe('CAST(12 AS BIGINT)');
    expect(literal('BIGINT', Number.NaN)).toBe('CAST(NULL AS BIGINT)');
    expect(literal('DOUBLE', 0.25)).toBe('CAST(0.25 AS DOUBLE)');
    expect(literal('DOUBLE', Infinity)).toBe('CAST(NULL AS DOUBLE)');
    expect(literal('TIMESTAMP', undefined, 1700000000000)).toBe('timestamp_millis(1700000000000)');
    expect(literal('TIMESTAMP', undefined, null)).toBe('CAST(NULL AS TIMESTAMP)');
  });
});

describe('buildMerge', () => {
  const task = (over: Record<string, unknown> = {}) => ({
    task_id: 't1', employee_id: 'e1', title: 'Fix it', assigned_by: 'user', status: 'done', assigned_ms: 1_700_000_000_000, finished_ms: null,
    active_ms: 5000, input_tokens: 10, output_tokens: 20, cost_usd: 0.0123, num_turns: 2, outcome: null, trace_id: null, updated_ms: 1_700_000_001_000, ...over,
  });

  it('builds one MERGE with derived timestamps', () => {
    const sql = buildMerge(loc, TABLES.tasks, [task(), task({ task_id: 't2' })]);
    expect(sql).toMatch(/^MERGE INTO `workspace`\.`agent_manager`\.`tasks` AS t\nUSING \(SELECT \* FROM VALUES/);
    expect(sql).toContain('ON t.`task_id` = s.`task_id`');
    expect(sql).toContain('WHEN MATCHED THEN UPDATE SET *');
    expect(sql).toContain('WHEN NOT MATCHED THEN INSERT *');
    expect(sql).toContain('timestamp_millis(1700000000000)');
    expect(sql).toContain('CAST(NULL AS TIMESTAMP)'); // finished_at, since finished_ms is null
    expect(sql.match(/\n  \(/g)).toHaveLength(2);
  });

  it('append-only tables only insert; steps land in events', () => {
    const sql = buildMerge(loc, TABLES.messages, [{ message_id: 'm1', ts_ms: 1, from_id: 'user', to_id: 'e1', channel: 'user_dm', task_id: null, body: 'hi' }]);
    expect(sql).not.toContain('WHEN MATCHED');
    expect(buildMerge(loc, TABLES.steps, [{ event_id: 'x', employee_id: 'e', ts_ms: 1 }])).toContain('`events`');
  });

  it('keeps the last of two rows with the same key', () => {
    const rows = dedupe(TABLES.tasks, [task({ title: 'old' }), task({ title: 'new' }), task({ task_id: 't9' })]);
    expect(rows.map((r) => r.title)).toEqual(['new', 'Fix it']);
  });

  it('round-trips awkward text through the statement', () => {
    const awful = "O'Brien said \"hi\" \\ back\\slash\nnew line\r\n\ttab, (parens), `ticks`, $x, 日本語 🙂, ';DROP TABLE tasks;--, \\'";
    const sql = buildMerge(loc, TABLES.tasks, [task({ title: awful, outcome: null }), task({ task_id: 't2', title: '', outcome: 'ok' })]);
    // The text never appears raw, so it cannot end a literal or add a statement.
    expect(sql).not.toContain('O\'Brien');
    expect(sql.split('\n').filter((l) => l.startsWith('  (')).length).toBe(2);
    const parsed = parseMerge(sql)!;
    expect(parsed.table).toBe('tasks');
    expect(parsed.rows[0].title).toBe(awful);
    expect(parsed.rows[0].outcome).toBeNull();
    expect(parsed.rows[0].finished_ms).toBeNull();
    expect(parsed.rows[0].assigned_at).toBe(1_700_000_000_000);
    expect(parsed.rows[0].cost_usd).toBe(0.0123);
    expect(parsed.rows[1].title).toBe('');
    expect(parsed.rows[1].outcome).toBe('ok');
  });

  it('refuses an empty batch and bad catalog names', () => {
    expect(() => buildMerge(loc, TABLES.tasks, [])).toThrow();
    expect(() => checkLocation({ catalog: 'a`b', schema: 'x' })).toThrow();
    expect(() => checkLocation({ catalog: 'workspace', schema: 'agent_manager; DROP' })).toThrow();
  });
});

describe('ddl', () => {
  it('creates the schema and the six tables in the configured location', () => {
    const d = ddl({ catalog: 'main', schema: 'team' });
    expect(d.map((x) => x.name)).toEqual(['schema', 'employees', 'tasks', 'events', 'messages', 'usage', 'daily_reports']);
    expect(d[0].sql).toBe("CREATE SCHEMA IF NOT EXISTS `main`.`team` COMMENT 'Agent Manager: AI employee activity'");
    for (const x of d.slice(1)) expect(x.sql).toContain('CREATE TABLE IF NOT EXISTS `main`.`team`.');
  });
});
