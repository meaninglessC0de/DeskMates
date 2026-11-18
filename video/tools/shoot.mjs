// Record v2 takes: drives the Deskmates app (CDP 9333, window.__deskmatesDemo) while Recordly (CDP 9444) records its window.
// Usage: node tools/shoot.mjs <take> [...]
//   desks <secs> <facesAt>      Desks view while the team works; faces pop at facesAt
//   call <first> <secs>         one-to-one call (Synthesia face), ends after secs
//   meeting                     the standup: summon all four, Sam's typed lines, pins, end
//   approve <first> <secs>      thread of <first> with its pending approval, approved at 3 s
//   team <question>             Team view, question typed into the ask box
// Every take writes video/media/takes/<take>-<n>.json: the mp4 path and a log of timed events and captions.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [take, ...args] = process.argv.slice(2);
const OFFICE = 'http://127.0.0.1:4317';
const rec = (...a) => execFileSync('node', ['tools/recordly.mjs', ...a], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emps = await (await fetch(`${OFFICE}/api/employees`)).json();
const ORDER = ['Maya', 'Priya', 'Jonas', 'Ines'];
const id = (first) => emps.find((e) => e.persona.firstName === first)?.id;
const all = ORDER.map(id).filter(Boolean);

const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = b.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('4317'));
const demo = (fn, ...a) => page.evaluate(([fn, a]) => window.__deskmatesDemo[fn](...a), [fn, a]);

const log = [];
let t0 = 0;
const mark = (what) => { const t = (Date.now() - t0) / 1000; log.push({ t, what }); console.log(t.toFixed(2), what); };
let capTimer = null;
function watchCaptions() {
  let last = '';
  capTimer = setInterval(async () => {
    try {
      const s = await page.evaluate(() => [...document.querySelectorAll('[data-am="caption"]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
      if (s && s !== last) { last = s; mark(`caption: ${s}`); }
    } catch {}
  }, 200);
}
async function start() {
  rec('select', 'Electron — Deskmates');
  rec('start');
  t0 = Date.now();
  mark('rec start');
}
async function stop(name) {
  if (capTimer) clearInterval(capTimer);
  mark('rec stop');
  const out = rec('stop').split('\n').pop();
  fs.mkdirSync('media/takes6', { recursive: true });
  const n = fs.readdirSync('media/takes6').filter((f) => f.startsWith(name)).length + 1;
  fs.writeFileSync(`media/takes6/${name}-${n}.json`, JSON.stringify({ file: out, log }, null, 1));
  console.log('FILE', out);
}
async function waitCaption(re, maxMs) {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const s = await page.evaluate(() => [...document.querySelectorAll('[data-am="caption"]')].map((e) => e.innerText).join(' '));
    if (re.test(s)) return true;
    await sleep(250);
  }
  return false;
}
// wait until the named person has spoken and then gone quiet for quietMs
async function waitAnswer(first, maxMs = 25000, quietMs = 1600) {
  const until = Date.now() + maxMs;
  const capNow = async () => page.evaluate(() => [...document.querySelectorAll('[data-am="caption"]')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' '));
  let lastText = await capNow(), lastChange = Date.now(), heard = false;
  while (Date.now() < until) {
    const s = await page.evaluate(() => [...document.querySelectorAll('[data-am="caption"]')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' '));
    if (s !== lastText) { lastText = s; lastChange = Date.now(); if (s.includes(first) && s.replace(first, '').trim().length > 4) heard = true; }
    if (heard && Date.now() - lastChange > quietMs) return true;
    await sleep(200);
  }
  return false;
}


// wait for the app's own "Speaking" chip: until someone starts speaking, then until nobody has spoken for quietMs
async function waitSpeech(startMs = 15000, maxMs = 45000, quietMs = 1800) {
  const speaking = async () => page.evaluate(() => /\bSpeaking\b/.test(document.body.innerText));
  const t0 = Date.now();
  while (Date.now() - t0 < startMs && !(await speaking())) await sleep(150);
  let quietSince = null;
  while (Date.now() - t0 < maxMs) {
    if (await speaking()) quietSince = null;
    else if (quietSince === null) quietSince = Date.now();
    else if (Date.now() - quietSince > quietMs) return true;
    await sleep(150);
  }
  return false;
}

if (take === 'desks') {
  const secs = Number(args[0] || 70), facesAt = Number(args[1] || 40);
  try { await page.evaluate(() => window.__deskmatesDemo.setMessages && window.__deskmatesDemo.setMessages(false)); } catch {}
  await demo('setFaces', false);
  await demo('openDesks');
  await sleep(2500);
  await start();
  await sleep(facesAt * 1000);
  await demo('setFaces', true); mark('faces on');
  await sleep((secs - facesAt) * 1000);
  await stop('desks');
} else if (take === 'call') {
  const who = args[0] || 'Maya', secs = Number(args[1] || 16);
  await demo('openThread', id(who));
  await sleep(1200);
  await start();
  watchCaptions();
  await sleep(1500);
  mark('startCall'); await demo('startCall', id(who));
  const q = args[2];
  if (q) {
    await sleep(16500); // the greeting must finish, or the question is dropped
    mark(`say: ${q}`); await demo('say', q);
    const tq = Date.now();
    await waitAnswer(who, 40000, 6000);
    const lq = 12000 - (Date.now() - tq); if (lq > 0) await sleep(lq);
    await sleep(1500);
  } else await sleep(secs * 1000);
  mark('endCall'); await demo('endCall');
  await sleep(2500);
  await stop(`call-${who.toLowerCase()}`);
} else if (take === 'meeting') {
  // v6: one continuous standup; each question pins that person's desktop as it is asked
  await sleep(500);
  await start();
  watchCaptions();
  await sleep(1500);
  mark('summon'); await demo('summon', all);
  for (let i = 0; i < 20; i++) { try { const m = page.getByRole('button', { name: 'Mute' }); if (await m.count()) { if ((await m.first().getAttribute('aria-pressed')) !== 'true') await m.first().click(); mark('muted ' + (await m.first().getAttribute('aria-pressed'))); break; } } catch {} await sleep(500); }
  await sleep(17000); // greetings must finish, or the first question is dropped
  const lines = [
    ["Okay team, standup! Maya, how's the checkout fix?", 'Maya'],
    ['Jonas, what did you find on pricing?', 'Jonas'],
    ['Ines, which onboarding should we ship?', 'Ines'],
    ['Version B. Ship it.', 'Ines'],
  ];
  for (const [text, who] of lines) {
    if (text !== 'Version B. Ship it.') { await demo('pin', id(who)); mark(`pin ${who}`); await sleep(400); }
    mark(`say: ${text}`);
    const ok = await demo('say', text);
    if (!ok) mark('say failed');
    await waitSpeech(15000, 45000, 1800);
    mark(`answered: ${who}`);
    await sleep(1200);
  }
  await sleep(1200);
  await demo('pin', null); mark('unpin');
  await sleep(1500);
  mark('endCall'); await demo('endCall');
  await sleep(2500);
  await stop('meeting');
} else if (take === 'approve') {
  const who = args[0] || 'Maya', secs = Number(args[1] || 9);
  const th = await (await fetch(`${OFFICE}/api/employees/${id(who)}/thread?limit=100`)).json();
  const items = JSON.stringify(th);
  const m = [...items.matchAll(/"id":"(apr_[A-Za-z0-9]+)"[^}]*?"status":"pending"/g)].map((x) => x[1]);
  const apr = m[m.length - 1];
  console.log('approval', apr);
  await demo('openThread', id(who));
  await sleep(1200);
  await start();
  await sleep(3000);
  mark('approve');
  try { await page.getByRole('button', { name: 'Approve' }).last().click({ timeout: 3000 }); console.log('clicked'); } catch { console.log('hook', await demo('approve', apr || 'apr_01M7FF6HBX0HFTC6XM6CTHXAXH')); }
  await sleep((secs - 3) * 1000);
  await stop(`approve-${who.toLowerCase()}`);
} else if (take === 'team') {
  const q = args.join(' ') || 'Who did the most this week?';
  await demo('openTeam');
  await sleep(1500);
  await start();
  await sleep(2000);
  const box = page.locator('input[placeholder*="Ask"]').first();
  await box.click(); await box.pressSequentially(q, { delay: 45 }); mark('typed'); await box.press('Enter');
  await sleep(22000);
  await stop('team');
}
await b.close();
