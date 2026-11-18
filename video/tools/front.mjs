import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const p = b.contexts().flatMap(c => c.pages()).find(x => x.url().includes('4317'));
await p.bringToFront();
await p.evaluate(() => window.focus());
await b.close();
