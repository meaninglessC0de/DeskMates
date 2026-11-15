// Smoke test for the call mind against a running, seeded office (real model, any desktops).
export {};
// Usage: OFFICE_URL=http://127.0.0.1:4327 npx tsx scripts/smoke/call-mind.ts [firstName]
// Needs ANTHROPIC_API_KEY in office's environment and calls enabled (LiveKit keys, or CALLS_REAL=1 with MOCK_LLM=1).
const base = process.env.OFFICE_URL ?? `http://127.0.0.1:${process.env.OFFICE_PORT ?? 4327}`;
const who = (process.argv[2] ?? 'Priya').toLowerCase();

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> ${r.status} ${await r.text()}`);
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}

async function ask(callId: string, speaker: string, text: string): Promise<{ answer: string; firstMs: number; totalMs: number }> {
  const t0 = Date.now();
  const r = await fetch(`${base}/voice/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-speaker': speaker },
    body: JSON.stringify({ model: callId, stream: true, messages: [{ role: 'user', content: text }] }),
  });
  if (!r.ok) throw new Error(`chat -> ${r.status} ${await r.text()}`);
  let answer = '';
  let firstMs = -1;
  let buf = '';
  for await (const part of r.body as unknown as AsyncIterable<Uint8Array>) {
    buf += Buffer.from(part).toString('utf8');
    const lines = buf.split('\n\n');
    buf = lines.pop() ?? '';
    for (const l of lines) {
      if (!l.startsWith('data: ') || l === 'data: [DONE]') continue;
      const d = JSON.parse(l.slice(6)).choices[0].delta.content as string | undefined;
      if (d) {
        if (firstMs < 0) firstMs = Date.now() - t0;
        answer += d;
      }
    }
  }
  return { answer, firstMs, totalMs: Date.now() - t0 };
}

const fail = (m: string): never => {
  throw new Error(m);
};

const employees = await j<{ id: string; persona: { firstName: string }; state: string }[]>('/api/employees');
const e = employees.find((x) => x.persona.firstName.toLowerCase() === who) ?? fail(`no employee named ${who}`);
const thread = await j<{ task: { title: string } | null }>(`/api/employees/${e.id}/thread?limit=5`);
console.log(`employee ${e.persona.firstName} (${e.state}), task: ${thread.task?.title ?? 'none'}`);
if (e.state !== 'working') console.log('note: not working right now, so the answer will say so; give them a task first to check the task is mentioned');

const info = await j<{ id: string; mock: boolean }>('/api/calls', { method: 'POST', body: JSON.stringify({ employeeIds: [e.id] }) });
if (info.mock) fail('office answered with a mock call (start it with CALLS_REAL=1, or in real mode with LiveKit keys)');
let failed = false;
try {
  const q1 = process.argv[3] ?? 'What are you doing?';
  const a = await ask(info.id, e.id, q1);
  console.log(`1. "${q1}" -> first text ${a.firstMs} ms, total ${a.totalMs} ms\n   ${a.answer}`);
  const generic = new Set(['this', 'that', 'long', 'task', 'with', 'from', 'what']);
  const words = (thread.task?.title ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !generic.has(w));
  if (words.length && !words.some((w) => a.answer.toLowerCase().includes(w.slice(0, Math.max(4, w.length - 2))))) fail(`the answer does not mention the task (${words.join(', ')})`);
  if (/[*#`]|^\s*-\s/m.test(a.answer)) fail('the answer contains markdown');
  const sentences = a.answer.split(/[.!?]+\s/).filter(Boolean).length;
  if (sentences > 4) fail(`too long for speech (${sentences} sentences)`);

  const b = await ask(info.id, e.id, 'Please also add a pricing comparison to that work, and tell me when it is done.');
  console.log(`2. instruction -> first text ${b.firstMs} ms, total ${b.totalMs} ms\n   ${b.answer}`);
  console.log('   (the office log line "was told" shows tell_worker delivered the instruction)');
  console.log('PASS');
} catch (err) {
  failed = true;
  console.error('FAIL', (err as Error).message);
} finally {
  await j(`/api/calls/${info.id}`, { method: 'DELETE' });
}
process.exit(failed ? 1 : 0);
