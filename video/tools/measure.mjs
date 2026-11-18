import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const p = b.contexts().flatMap(c => c.pages()).find(x => x.url().includes('4317'));
await p.evaluate(() => window.__deskmatesDemo.openDesks());
await new Promise(r => setTimeout(r, 1500));
const r = await p.evaluate(() => ({ w: innerWidth, h: innerHeight, tiles: [0,1,2,3].map(i => { const e = document.querySelector(`[data-am-desk-tile="${i}"]`); const b = e?.getBoundingClientRect(); return b ? { x: b.x / innerWidth, y: b.y / innerHeight, w: b.width / innerWidth, h: b.height / innerHeight } : null; }) }));
console.log(JSON.stringify(r));
await p.evaluate(() => window.__deskmatesDemo.closeDesks());
await b.close();
