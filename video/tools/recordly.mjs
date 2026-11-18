#!/usr/bin/env node
// Drive Recordly (Electron, started with --remote-debugging-port=9444) over CDP.
//   node tools/recordly.mjs status
//   node tools/recordly.mjs select <window-title-substring | screen [n]>
//   node tools/recordly.mjs start [--no-audio] [--mic]
//   node tools/recordly.mjs stop            (prints the saved file path)
//   node tools/recordly.mjs last            (latest recording path)
//   node tools/recordly.mjs record <selector> <seconds> [--no-audio]
// IPC shapes read from Recordly 1.4.0 (main.cjs / HudWindow):
//   selectSource(sourceObjectFromGetSources), startNativeScreenRecording(source, {capturesSystemAudio, capturesMicrophone}),
//   setRecordingState(bool) (cursor telemetry on/off), stopNativeScreenRecording() -> {success, path}.
import { chromium } from 'playwright';

const PORT = process.env.RECORDLY_CDP_PORT || '9444';
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const args = rest.filter((a) => !a.startsWith('--'));

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const pages = browser.contexts().flatMap((c) => c.pages());
// The HUD overlay page is the one that records; any page with electronAPI works for the IPC calls.
const page = pages.find((p) => p.url().includes('hud-overlay')) || pages[0];
if (!page) { console.error('No Recordly page found on CDP port ' + PORT); process.exit(2); }
const api = (name, ...a) => page.evaluate(([n, x]) => window.electronAPI[n](...x), [name, a]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function perms() {
  const s = await api('getScreenRecordingPermissionStatus');
  const a = await api('getAccessibilityPermissionStatus');
  return { screen: s.status, accessibility: a.trusted ? 'trusted' : 'not trusted' };
}
async function sources() {
  const list = await api('getSources', { types: ['screen', 'window'], thumbnailSize: { width: 1, height: 1 }, fetchWindowIcons: false });
  return list.map(({ thumbnail, appIcon, ...s }) => s);
}
async function select(q) {
  const list = await api('getSources', { types: ['screen', 'window'], thumbnailSize: { width: 1, height: 1 }, fetchWindowIcons: false });
  let src;
  if (!q || q.toLowerCase() === 'screen') {
    const n = Number(args[1]) || 0;
    const screens = list.filter((s) => s.id.startsWith('screen:'));
    src = n ? screens[n - 1] : screens.find((s) => /Primary/.test(s.name)) || screens[0];
  } else {
    const l = q.toLowerCase();
    src = list.find((s) => (s.sourceType === 'window' || s.id.startsWith('window:')) && `${s.name} ${s.windowTitle || ''} ${s.appName || ''}`.toLowerCase().includes(l));
  }
  if (!src) throw new Error(`No source matches "${q}". Run: status`);
  await api('selectSource', src);
  const { thumbnail, appIcon, ...show } = src;
  return show;
}
async function start() {
  const p = await perms();
  if (p.screen !== 'granted') throw new Error(`Screen Recording permission for Recordly is "${p.screen}". Turn it on in System Settings > Privacy & Security > Screen Recording, then restart Recordly.`);
  const source = await api('getSelectedSource');
  if (!source) throw new Error('No source selected. Run: select <window-title|screen>');
  const audio = !flags.has('--no-audio');
  await api('setRecordingPreferences', { systemAudioEnabled: audio, microphoneEnabled: flags.has('--mic'), webcamEnabled: false });
  const r = await api('startNativeScreenRecording', source, { capturesSystemAudio: audio, capturesMicrophone: flags.has('--mic') });
  if (!r.success) throw new Error(`start failed: ${r.error || r.message}`);
  await api('setRecordingState', true); // starts cursor telemetry
  return { source: source.name, systemAudio: audio };
}
async function stop() {
  const r = await api('stopNativeScreenRecording');
  try { await api('setRecordingState', false); } catch {}
  if (!r.success) throw new Error(`stop failed: ${r.error || r.message}`);
  return r.path;
}

try {
  if (cmd === 'status') {
    console.log(JSON.stringify({ permissions: await perms(), selected: await api('getSelectedSource'), prefs: await api('getRecordingPreferences'), dir: (await api('getRecordingsDirectory')).path, sources: await sources() }, null, 2));
  } else if (cmd === 'select') {
    console.log(JSON.stringify(await select(args[0]), null, 2));
  } else if (cmd === 'start') {
    console.log(JSON.stringify(await start()));
  } else if (cmd === 'stop') {
    console.log(await stop());
  } else if (cmd === 'last') {
    const r = await api('getRecordedVideoPath');
    console.log(r.success ? r.path : r.message);
  } else if (cmd === 'record') {
    await select(args[0]);
    console.error(JSON.stringify(await start()));
    await sleep(Number(args[1] || 5) * 1000);
    console.log(await stop());
  } else {
    console.error('usage: recordly.mjs status | select <window|screen [n]> | start [--no-audio] [--mic] | stop | last | record <selector> <seconds>');
    process.exitCode = 1;
  }
} catch (e) {
  console.error('ERROR: ' + e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
