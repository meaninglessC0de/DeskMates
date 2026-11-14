/**
 * Smoke test for the real Cua Spaces implementation. Creates ONE Space named test-w1-smoke, exercises
 * every method of the `Spaces` seam, and deletes it. Run: npx tsx scripts/smoke/spaces.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { embedded } from '@trycua/cua';
import { readEnv } from '../../src/shared/index.ts';
import { createCuaSpaces } from '../../src/office/spaces/cuaSpaces.ts';
import { createHostDriver } from '../../src/office/spaces/hostDriver.ts';

process.env.CUA_TELEMETRY ??= '0';
process.env.DO_NOT_TRACK ??= '1';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'shots/smoke');
const PREFIX = 'test-w1-';
const EMP = 'emp_SMOKE';
const SPACE_ID = `local:${PREFIX}smoke`;

const env = readEnv({ ...process.env, DESKTOPS: 'cua' });
const spaces = createCuaSpaces({ dataDir: path.join(ROOT, 'data-w1'), env, namePrefix: PREFIX });

const t0 = Date.now();
let failures = 0;
const lap = (label: string, detail = '') => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] PASS ${label}${detail ? ` - ${detail}` : ''}`);
function check(cond: unknown, label: string, detail = ''): void {
  if (cond) lap(label, detail);
  else {
    failures++;
    console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] FAIL ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8;

async function countFrames(wsUrl: string, ms: number): Promise<{ text: number; binary: number; bytes: number }> {
  const counts = { text: 0, binary: 0, bytes: 0 };
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') counts.text++;
    else {
      counts.binary++;
      counts.bytes += (ev.data as ArrayBuffer).byteLength;
    }
  };
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('websocket error'));
  });
  await new Promise((r) => setTimeout(r, ms));
  ws.close();
  return counts;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const host = createHostDriver({ env });
  const hs = await host.status();
  check(!hs.installed || typeof hs.permitted === 'boolean', 'host driver status', JSON.stringify(hs));
  check((await host.mcpConfig()).args[0] === 'mcp', 'host driver mcpConfig');

  check((await spaces.state(EMP)) === 'absent', 'state before create is absent');
  const progress: string[] = [];
  const [a, b] = await Promise.all([
    spaces.ensure(EMP, { internet: true, onProgress: (m) => progress.push(m) }),
    spaces.ensure(EMP, { internet: true }),
  ]);
  check(a.id === SPACE_ID && b.id === SPACE_ID && a.state === 'running', 'ensure x2 concurrently', `${a.id} progress: ${progress.join(' > ')}`);
  const listed = (await embedded().spaces().list()).filter((s) => s.id === SPACE_ID);
  check(listed.length === 1, 'one Space for two concurrent ensures', `${listed.length} listed`);
  check(await spaces.healthy(EMP), 'healthy');

  const un = await spaces.exec(EMP, 'uname -a');
  check(un.exitCode === 0 && /Linux/.test(un.stdout), 'exec uname -a', un.stdout.trim());
  const bad = await spaces.exec(EMP, 'echo err >&2; exit 3');
  check(bad.exitCode === 3 && bad.stderr.includes('err'), 'exec exit code and stderr', `exit ${bad.exitCode}`);
  const slow = await spaces.exec(EMP, 'sleep 5', { timeoutMs: 500 });
  check(slow.timedOut, 'exec timeout reported', `timedOut ${slow.timedOut}`);

  await spaces.writeFile(EMP, '~/work/note.txt', 'hello from W1\n');
  const back = await spaces.readFile(EMP, 'work/note.txt');
  check(back === 'hello from W1\n', 'write then read a file (home-relative)', JSON.stringify(back));
  await spaces.writeFile(EMP, '/tmp/bytes.bin', new Uint8Array([1, 2, 3]));
  check((await spaces.exec(EMP, 'wc -c < /tmp/bytes.bin')).stdout.trim() === '3', 'write bytes');
  await spaces.readFile(EMP, '~/nope.txt').then(
    () => check(false, 'reading a missing file rejects'),
    (e: Error) => check(true, 'reading a missing file rejects', e.message),
  );

  const t1 = Date.now();
  const shot = await spaces.screenshot(EMP);
  const shotMs = Date.now() - t1;
  writeFileSync(path.join(OUT, 'space.jpg'), shot);
  check(isJpeg(shot) && shot.length > 5000, 'screenshot is a JPEG', `${shot.length} B in ${shotMs} ms -> shots/smoke/space.jpg`);
  const png = await (await embedded().spaces().space(SPACE_ID)).screenshot(undefined);
  writeFileSync(path.join(OUT, 'space.png'), Buffer.from(png.image));
  check(png.width === 1280, 'raw SDK PNG saved', `${png.width}x${png.height} -> shots/smoke/space.png`);
  const th = await spaces.thumbnail(EMP);
  writeFileSync(path.join(OUT, 'space-thumb.jpg'), th);
  check(isJpeg(th), 'thumbnail is a JPEG', `${th.length} B`);

  const mcp = await spaces.mcpEndpoint(EMP);
  check(mcp.url.startsWith('http://127.0.0.1') && Object.keys(mcp.headers).some((k) => /authorization/i.test(k)), 'mcpEndpoint shape', `${mcp.url} headers ${Object.keys(mcp.headers).join(',')}`);
  const client = new Client({ name: 'w1-smoke', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }));
  const tools = (await client.listTools()).tools;
  await client.close();
  check(tools.length > 50, 'MCP tools/list through the returned endpoint', `${tools.length} tools`);

  const st = await spaces.openStream(EMP, 'view');
  check(st.kind === 'cua-media' && !!st.ticket && !!st.mediaSessionId, 'openStream returns a cua-media ticket', st.kind === 'cua-media' ? `${st.wsUrl.replace(/ticket=.*/, 'ticket=...')} expiresMs ${st.expiresMs}` : st.kind);
  if (st.kind === 'cua-media') {
    const c = await countFrames(st.wsUrl, 3000);
    check(c.binary >= 3, 'binary frames over the WebSocket in 3 s', `${c.binary} binary (${c.bytes} B), ${c.text} text`);
  }

  await spaces.setInternet(EMP, false);
  const off = await spaces.exec(EMP, 'curl -sS -m 6 -o /dev/null -w "%{http_code}" https://example.com');
  check(off.exitCode !== 0, 'internet off: curl fails', `exit ${off.exitCode} ${off.stderr.trim().slice(0, 80)}`);
  await spaces.setInternet(EMP, true);
  const on = await spaces.exec(EMP, 'curl -sS -m 10 -o /dev/null -w "%{http_code}" https://example.com');
  check(on.exitCode === 0 && on.stdout.trim() === '200', 'internet on: curl succeeds', `HTTP ${on.stdout.trim()}`);

  const ts = Date.now();
  await spaces.sleep(EMP);
  check((await spaces.state(EMP)) === 'asleep', 'sleep', `${Date.now() - ts} ms`);
  check(!(await spaces.healthy(EMP)), 'asleep is not healthy');
  await spaces.exec(EMP, 'true').then(
    () => check(false, 'exec on a sleeping desktop rejects'),
    (e: Error) => check(true, 'exec on a sleeping desktop rejects', e.message),
  );
  const tw = Date.now();
  await spaces.wake(EMP);
  const kept = await spaces.readFile(EMP, '~/work/note.txt');
  check(kept === 'hello from W1\n', 'wake keeps the file', `${Date.now() - tw} ms`);

  // ensure on a sleeping Space wakes it (no second create)
  await spaces.sleep(EMP);
  const e2 = await spaces.ensure(EMP, { internet: true });
  check(e2.state === 'running' && (await spaces.readFile(EMP, '~/work/note.txt')) === 'hello from W1\n', 'ensure wakes a sleeping Space and keeps files');
}

async function cleanup(): Promise<void> {
  await spaces.remove(EMP).catch((e) => console.log('cleanup remove failed:', (e as Error).message));
  const left = (await embedded().spaces().list()).filter((s) => s.name.startsWith(PREFIX));
  check(left.length === 0, 'delete leaves no test-w1- Space', `${left.length} left`);
}

try {
  await main();
} catch (e) {
  failures++;
  console.log('FAIL unexpected error:', e instanceof Error ? `${e.message} ${(e as { tag?: string }).tag ?? ''}` : e);
  if (e instanceof Error && e.stack) console.log(e.stack.split('\n').slice(0, 5).join('\n'));
} finally {
  await cleanup();
}
console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
