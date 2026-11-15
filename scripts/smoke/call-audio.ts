// Real audio check: Chromium joins a call through the web renderer with a fake microphone that plays a spoken question.
// Needs office running with real calls and LiveKit keys, and the web renderer (WEB_PORT) proxying to it.
//
//   npx tsx scripts/smoke/call-audio.ts --who Maya --say "What are you working on right now?"
//   npx tsx scripts/smoke/call-audio.ts --who Maya --who Priya --who Jonas --say "Priya, how is the campaign going?" --expect Priya
//
// Options: --web http://127.0.0.1:4337  --office ws://127.0.0.1:4327/ws  --lead 8 (seconds of silence before the speech)
//          --expect <first name> (the speaker that must answer first)  --wait 60 (seconds to wait for the answer)
// macOS only for the speech file (`say`, `afconvert`).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const arg = (name: string): string[] => {
  const out: string[] = [];
  for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === `--${name}`) out.push(process.argv[++i]);
  return out;
};
const web = arg('web')[0] ?? 'http://127.0.0.1:4337';
const wsUrl = arg('office')[0] ?? 'ws://127.0.0.1:4327/ws';
const apiBase = wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
const who = arg('who').length ? arg('who') : ['Maya'];
const say = arg('say')[0] ?? 'What are you working on right now?';
const lead = Number(arg('lead')[0] ?? 8);
const waitS = Number(arg('wait')[0] ?? 60);
const expectFirst = arg('expect')[0];
const wantAnswers = Number(arg('answers')[0] ?? 1);   // meetings: how many speakers' final answers to wait for

const dir = path.resolve(import.meta.dirname, '../../data-w7/call-audio');
mkdirSync(dir, { recursive: true });

/** `say` to a 48 kHz mono 16-bit wav with silence before and after. Returns the speech length in seconds. */
function makeWav(text: string, out: string): number {
  const aiff = out.replace(/\.wav$/, '.aiff');
  const raw = out.replace(/\.wav$/, '-raw.wav');
  if (spawnSync('say', ['-o', aiff, text]).status !== 0) throw new Error('say failed');
  if (spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', aiff, raw]).status !== 0) throw new Error('afconvert failed');
  const buf = readFileSync(raw);
  let p = 12;
  let data = Buffer.alloc(0);
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'data') data = buf.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  const rate = 48000;
  const silence = (s: number): Buffer => Buffer.alloc(Math.round(rate * s) * 2);
  const pcm = Buffer.concat([silence(lead), data, silence(4)]);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(out, Buffer.concat([header, pcm]));
  return data.length / 2 / rate;
}

const speechSeconds = makeWav(say, path.join(dir, 'question.wav'));
console.log(`question "${say}" (${speechSeconds.toFixed(1)} s of speech after ${lead} s of silence)`);

const emps = (await (await fetch(`${apiBase}/api/employees`)).json()) as { id: string; persona: { firstName: string; name: string } }[];
const ids = who.map((n) => emps.find((e) => e.persona.firstName.toLowerCase() === n.toLowerCase())?.id ?? (() => { throw new Error(`no employee ${n}`); })());
const nameOf = (id: string | null): string => emps.find((e) => e.id === id)?.persona.firstName ?? String(id);

type Ev = { at: number; text: string; raw: any };
const events: Ev[] = [];
const t0 = Date.now();
const ws = new WebSocket(wsUrl);
ws.onmessage = (m) => {
  const e = JSON.parse(String(m.data));
  if (e.type !== 'call') return;
  const k = e.event;
  const text =
    k.kind === 'state' ? `state ${k.state} (${k.mode})` :
    k.kind === 'participant' ? `participant ${nameOf(k.employeeId)} ${k.state}` :
    k.kind === 'speaker' ? `speaker ${k.employeeId ? nameOf(k.employeeId) : '-'} ${k.phase}` :
    k.kind === 'caption' ? `caption ${k.from === 'user' ? 'user' : nameOf(k.from)} ${k.final ? 'final' : 'partial'}: ${k.text}` : `${k.kind}`;
  events.push({ at: Date.now(), text, raw: k });
};
await new Promise((r) => (ws.onopen = r as () => void));

// a call that was just closed frees its people a few seconds later
for (let i = 0; i < 40; i++) {
  const now = (await (await fetch(`${apiBase}/api/employees`)).json()) as { id: string; state: string }[];
  if (!now.some((e) => ids.includes(e.id) && e.state === 'on_call')) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.join(dir, 'question.wav')}%noloop`],
});
const ctx = await browser.newContext({ permissions: ['microphone'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('page error:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 200)); });
// browser-side code is kept as strings: this project compiles scripts without the DOM library
await page.addInitScript(`
  window.__pcs = [];
  const PC = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...a) { const pc = new PC(...a); window.__pcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = PC.prototype;
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); window.__micStart = window.__micStart || Date.now(); return s; };
`);
await page.goto(web);
await page.waitForFunction('document.body.innerText.length > 50', null, { timeout: 20000 });
// through the UI, as a person would: one person = open their thread and press Call; several = Summon meeting
const fullNames = who.map((n) => emps.find((e) => e.persona.firstName.toLowerCase() === n.toLowerCase())!.persona.name);
if (ids.length === 1) {
  await page.getByText(fullNames[0], { exact: true }).first().click();
  await page.getByRole('button', { name: 'Call', exact: true }).click();
} else {
  // the picker starts with the open thread's person already ticked: open the first person's thread, tick the others
  await page.getByText(fullNames[0], { exact: true }).first().click();
  await page.getByRole('button', { name: 'Summon meeting' }).click();
  for (const n of fullNames.slice(1)) await page.getByRole('dialog').getByText(n, { exact: true }).click();
  await page.screenshot({ path: path.join(dir, 'picker.png') });
  await page.getByRole('button', { name: 'Start meeting' }).click();
}
const ok = true;
console.log(`startCall -> ${ok}`);

// avatar calls: sample the <video> a few times while the answer is spoken, and keep two frames to look at
const frameJs = `(() => {
  const v = document.querySelector('video');
  if (!v || !v.videoWidth) return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 80;
  const x = c.getContext('2d'); x.drawImage(v, 0, 0, 64, 80);
  const d = x.getImageData(0, 0, 64, 80).data; const big = document.createElement('canvas'); big.width = v.videoWidth; big.height = v.videoHeight;
  big.getContext('2d').drawImage(v, 0, 0);
  return { px: Array.from(d), png: big.toDataURL('image/jpeg', 0.8), w: v.videoWidth, h: v.videoHeight, t: v.currentTime };
})()`;
type Sample = { at: number; px: number[]; png: string };
const samples: Sample[] = [];
let sampling = true;
const sampler = (async () => {
  while (sampling) {
    const f = (await page.evaluate(frameJs).catch(() => null)) as { px: number[]; png: string } | null;
    if (f) samples.push({ at: Date.now(), px: f.px, png: f.png });
    await new Promise((r) => setTimeout(r, 250));
  }
})();

const deadline = Date.now() + waitS * 1000;
const firstSpeaking = (): Ev | undefined => events.find((e) => e.raw.kind === 'speaker' && e.raw.phase === 'speaking');
const answered = (): boolean => events.some((e) => e.raw.kind === 'caption' && e.raw.from !== 'user' && e.raw.final) && events.some((e) => e.raw.kind === 'speaker' && e.raw.phase === 'idle');
// the first speaking is the greeting; wait for the answer to the question, which comes after the user's final transcript
const userFinal = (): Ev | undefined => events.find((e) => e.raw.kind === 'caption' && e.raw.from === 'user' && e.raw.final);
while (Date.now() < deadline) {
  const u = userFinal();
  if (u && events.filter((e) => e.at > u.at && e.raw.kind === 'caption' && e.raw.from !== 'user' && e.raw.final).length >= wantAnswers) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 1500));
sampling = false;
await sampler;

const micStart = (await page.evaluate('window.__micStart || null')) as number | null;
const stats = (await page.evaluate(`(async () => {
  const out = [];
  for (const pc of window.__pcs) {
    const rep = await pc.getStats();
    rep.forEach((s) => { if (s.type === 'inbound-rtp') out.push({ kind: s.kind, bytes: s.bytesReceived, level: s.totalAudioEnergy ?? null, tracks: s.framesDecoded ?? 0 }); });
  }
  return out;
})()`)) as { kind: string; bytes: number; level: number | null; tracks: number }[];
console.log('rtp stats:', JSON.stringify(stats), 'micStart', micStart);
const videoIn = stats.filter((s) => s.kind === 'video' && s.bytes > 0);
const audioIn = stats.filter((s) => s.kind === 'audio' && s.bytes > 0);

console.log('\ntimeline (ms since start):');
for (const e of events) console.log(`  ${String(e.at - t0).padStart(6)}  ${e.text}`);

const u = userFinal();
const answerSpeaking = u ? events.find((e) => e.at > u.at && e.raw.kind === 'speaker' && e.raw.phase === 'speaking') : undefined;
const answerCaption = u ? events.find((e) => e.at > u.at && e.raw.kind === 'caption' && e.raw.from !== 'user' && e.raw.final) : undefined;
const endOfAudio = micStart ? micStart + (lead + speechSeconds) * 1000 : null;
console.log('\nresults:');
const checks: [string, boolean, string][] = [
  ['a final user_transcript reached office', !!u, u ? u.raw.text : 'none'],
  ['a final agent_transcript reached office after it', !!answerCaption, answerCaption ? `${nameOf(answerCaption.raw.from)}: ${answerCaption.raw.text}` : 'none'],
  ['speech_started (speaker speaking) for the answer', !!answerSpeaking, answerSpeaking ? nameOf(answerSpeaking.raw.employeeId) : 'none'],
  ['speech_ended (speaker idle) after it', !!answerSpeaking && events.some((e) => e.at > answerSpeaking.at && e.raw.kind === 'speaker' && e.raw.phase === 'idle'), ''],
  ['remote audio received in the page (inbound-rtp audio bytes > 0)', audioIn.length > 0, audioIn.map((s) => `${s.bytes} B`).join(', ') || 'none'],
  ...(arg('avatar').length ? ([['avatar: remote video decoded in the page', videoIn.length > 0, videoIn.map((s) => `${s.bytes} B, ${s.tracks} frames`).join(', ') || 'none'], ['avatar: state live reported with mode avatar', events.some((e) => e.raw.kind === 'state' && e.raw.state === 'live' && e.raw.mode === 'avatar'), '']] as [string, boolean, string][]) : []),
];
if (expectFirst) checks.push([`${expectFirst} answered first`, !!answerSpeaking && nameOf(answerSpeaking.raw.employeeId).toLowerCase() === expectFirst.toLowerCase(), answerSpeaking ? nameOf(answerSpeaking.raw.employeeId) : 'none']);
for (const [name, pass, note] of checks) console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${note ? ` - ${note}` : ''}`);
if (samples.length) {
  const diff = (a: Sample, b: Sample): number => a.px.reduce((t, v, i) => t + Math.abs(v - b.px[i]), 0) / a.px.length;
  const inRange = (from: number, to: number): Sample[] => samples.filter((x) => x.at >= from && x.at <= to);
  const meanDiff = (xs: Sample[]): number => (xs.length > 1 ? xs.slice(1).reduce((t, x, i) => t + diff(xs[i], x), 0) / (xs.length - 1) : NaN);
  const speaking = answerSpeaking && answerCaption ? inRange(answerSpeaking.at, answerCaption.at) : [];
  const quiet = u ? inRange(u.at - 4000, u.at - 500) : [];
  console.log(`  video: ${samples.length} samples, mean frame-to-frame change while speaking ${meanDiff(speaking).toFixed(2)} (${speaking.length} samples) vs quiet ${meanDiff(quiet).toFixed(2)} (${quiet.length} samples)`);
  if (speaking.length > 3) {
    for (const [i, k] of [Math.floor(speaking.length / 3), Math.floor((2 * speaking.length) / 3)].entries())
      writeFileSync(path.join(dir, `speaking-${i + 1}.jpg`), Buffer.from(speaking[k].png.split(',')[1], 'base64'));
    console.log(`  saved two frames from the speech to ${dir}/speaking-1.jpg and speaking-2.jpg`);
  }
}
if (samples.length > 3) {
  // when did the picture change? the biggest frame-to-frame jump in the two seconds before each speaker starts speaking
  const jump = (i: number): number => samples[i].px.reduce((t, v, k) => t + Math.abs(v - samples[i - 1].px[k]), 0) / samples[i].px.length;
  for (const e of events.filter((x) => x.raw.kind === 'speaker' && x.raw.phase === 'speaking' && (!u || x.at > u.at))) {
    let best = -1, bestAt = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i].at > e.at - 3000 && samples[i].at < e.at + 1000 && jump(i) > best) { best = jump(i); bestAt = samples[i].at; }
    console.log(`  ${nameOf(e.raw.employeeId)} starts speaking at ${e.at - t0} ms; the picture changed most at ${bestAt - t0} ms (jump ${best.toFixed(1)}), ${bestAt - e.at} ms from it`);
  }
}
if (endOfAudio && answerSpeaking) console.log(`  time from end of the audio file to speech_started: ${answerSpeaking.at - endOfAudio} ms (estimated from when the microphone opened)`);
if (u && answerSpeaking) console.log(`  time from the final user transcript to speech_started: ${answerSpeaking.at - u.at} ms`);

await page.getByRole('button', { name: /^End/ }).first().click().catch(() => console.log('no End button found; closing the page instead'));
for (let i = 0; i < 20; i++) {
  const now = (await (await fetch(`${apiBase}/api/employees`)).json()) as { id: string; state: string }[];
  if (!now.some((e) => ids.includes(e.id) && e.state === 'on_call')) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await browser.close();
ws.close();
process.exit(checks.every((c) => c[1]) ? 0 : 1);
