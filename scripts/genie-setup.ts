// Creates the Genie space the Team view asks questions through (run once; prints the id to put in DATABRICKS_GENIE_SPACE_ID).
// Usage: npx tsx scripts/genie-setup.ts          creates "Deskmates team" over <catalog>.<schema>
//        npx tsx scripts/genie-setup.ts --list   lists the spaces the token can see
import dotenv from 'dotenv';
import path from 'node:path';
import { readEnv } from '../src/shared/index.ts';
import { api, normaliseHost } from '../src/office/sync/http.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
const env = readEnv(process.env as Record<string, string | undefined>);
const cfg = { host: normaliseHost(env.DATABRICKS_HOST), token: env.DATABRICKS_TOKEN, requestTimeoutMs: 60_000 };
const loc = `${env.DATABRICKS_CATALOG}.${env.DATABRICKS_SCHEMA}`;
const TITLE = 'Deskmates team';

// ids are 32 hex characters and must be in ascending order inside each list
const id = (n: number): string => `01f0de5c${n.toString(16).padStart(24, '0')}`;

const tables: [string, string][] = [
  ['daily_reports', 'One short written summary per employee per day.'],
  ['employees', 'One row per AI employee: name, role and permission level.'],
  ['events', 'Audit trail: one row per action an employee took (commands, files, clicks, approvals asked and answered, errors).'],
  ['messages', 'Every message between the manager (from_id or to_id = "user") and employees, and between employees.'],
  ['tasks', 'One row per task: who did it, status, time actually worked (active_ms), model cost in US dollars, and the result in a sentence.'],
  ['usage', 'One row per model turn with tokens and cost; sum cost_usd for spend.'],
];

const questions = [
  'Who cost the most this week?',
  'How many tasks did each person finish this week?',
  'How many hours did each person work today?',
  'Which tasks failed or got stuck, and why?',
  'What did Maya work on today?',
  'How often did each person ask for approval, and how often was it denied?',
];

const instructions = [
  'This is the record of a small team of AI employees managed by one person (the "manager", stored as "user"). People are referred to by first name: join to employees on employee_id and show employees.name, never the id.',
  'Time worked is tasks.active_ms in milliseconds: report it in hours and minutes. Money is cost_usd in US dollars: round to cents. A task is finished when status = "done". "This week" means the last 7 days, "today" means the current date, both by the *_at or ts TIMESTAMP columns.',
  'Approvals are events with kind = "permission_request" (asked) and kind = "permission_decision" (answered; status "ok" means approved and "denied" means denied).',
  'Answer in one or two plain sentences, then the table. Keep tables to the columns that answer the question.',
];

const space = {
  version: 2,
  config: { sample_questions: questions.map((q, i) => ({ id: id(0x100 + i), question: [q] })) },
  data_sources: { tables: tables.map(([t, d]) => ({ identifier: `${loc}.${t}`, description: [d] })) },
  instructions: { text_instructions: [{ id: id(0x200), content: instructions }] },
};

interface Space { space_id: string; title?: string }

async function main(): Promise<number> {
  if (!env.DATABRICKS_HOST || !env.DATABRICKS_TOKEN || !env.DATABRICKS_WAREHOUSE_ID) {
    console.error('DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_WAREHOUSE_ID are needed.');
    return 1;
  }
  const list = await api<{ spaces?: Space[] }>(cfg, 'GET', '/api/2.0/genie/spaces');
  if (process.argv.includes('--list')) {
    for (const s of list.spaces ?? []) console.log(`${s.space_id}  ${s.title ?? ''}`);
    return 0;
  }
  const existing = (list.spaces ?? []).find((s) => s.title === TITLE);
  if (existing) {
    console.log(`Already there: ${TITLE}`);
    console.log(`DATABRICKS_GENIE_SPACE_ID=${existing.space_id}`);
    return 0;
  }
  const made = await api<Space>(cfg, 'POST', '/api/2.0/genie/spaces', {
    warehouse_id: env.DATABRICKS_WAREHOUSE_ID,
    title: TITLE,
    description: `Ask about the Deskmates team: hours, tasks, cost, approvals and what each person did. Tables in ${loc}.`,
    serialized_space: JSON.stringify(space),
  });
  console.log(`Created: ${TITLE} over ${loc}`);
  console.log(`DATABRICKS_GENIE_SPACE_ID=${made.space_id}`);
  return 0;
}

process.exit(await main().catch((e: Error) => {
  console.error(e.message.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '<user>'));
  return 1;
}));
