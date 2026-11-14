// Shared helpers for the office unit tests. Not imported by production code.
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Employee, ServerEvent } from '../shared/index.ts';
import { readEnv } from '../shared/index.ts';
import { createOffice, type BootOptions } from './main.ts';
import type { Office } from './employees/office.ts';

export interface Harness {
  office: Office;
  dir: string;
  events: ServerEvent[];
  waitFor<T extends ServerEvent>(what: string, pred: (e: ServerEvent) => e is T, opts?: { from?: number; timeoutMs?: number }): Promise<T>;
  mark(): number;
  state(id: string, state: Employee['state'], from?: number): Promise<Employee>;
  hire(roleKey: string): Promise<Employee>;
  cleanup(): Promise<void>;
}

export type Ev<K extends ServerEvent['type']> = Extract<ServerEvent, { type: K }>;

export async function harness(opts: { env?: Record<string, string>; dir?: string; dbFile?: string; boot?: Partial<BootOptions> } = {}): Promise<Harness> {
  process.env.MOCK_SPEED = process.env.MOCK_SPEED ?? '400';
  const dir = opts.dir ?? mkdtempSync(path.join(os.tmpdir(), 'office-test-'));
  const env = readEnv({ MOCK_LLM: '1', DESKTOPS: 'mock', DATA_DIR: dir, USER_NAME: 'Sam', ...opts.env });
  const { office } = await createOffice({ env, dbFile: opts.dbFile ?? ':memory:', ...opts.boot });
  const events: ServerEvent[] = [];
  office.bus.subscribe((e) => events.push(e));
  office.boot();
  await office.ready;

  const waitFor: Harness['waitFor'] = async (what, pred, o = {}) => {
    const start = Date.now();
    let i = o.from ?? 0;
    for (;;) {
      while (i < events.length) {
        const e = events[i++];
        if (pred(e)) return e;
      }
      if (Date.now() - start > (o.timeoutMs ?? 10_000)) throw new Error(`Timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  return {
    office, dir, events, waitFor,
    mark: () => events.length,
    async state(id, state, from) {
      const e = await waitFor(`${id} ${state}`, (x): x is Ev<'employee'> => x.type === 'employee' && x.employee.id === id && x.employee.state === state, { from });
      return e.employee;
    },
    async hire(roleKey) {
      const c = await office.candidate({ roleKey });
      return office.hire(c.token);
    },
    async cleanup() {
      await office.shutdown();
      office.store.close();
      if (!opts.dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}
