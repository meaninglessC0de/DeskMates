import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const p = b.contexts().flatMap(c => c.pages()).find(x => x.url().includes('4317'));
const r = await p.evaluate(() => ({ hook: Object.keys(window.__deskmatesDemo || {}), size: [innerWidth, innerHeight], am: [...new Set([...document.querySelectorAll('[data-am]')].map(e => e.getAttribute('data-am')))].slice(0, 40) }));
console.log(JSON.stringify(r));
await b.close();
