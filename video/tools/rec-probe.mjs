import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const pages = b.contexts().flatMap(c => c.pages());
for (const p of pages) {
  console.log('PAGE', p.url());
  const r = await p.evaluate(async () => {
    const a = window.electronAPI; const out = {};
    out.keys = Object.keys(a || {});
    for (const k of ['getScreenRecordingPermissionStatus','getAccessibilityPermissionStatus','getRecordingPreferences','getShortcuts','getRecordingsDirectory','getPlatform','getSelectedSource','getCountdownDelay']) {
      try { out[k] = await a[k](); } catch (e) { out[k] = 'ERR ' + e.message; }
    }
    out.text = document.body.innerText.slice(0, 500);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
}
await b.close();
