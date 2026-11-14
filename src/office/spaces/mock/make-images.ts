// Renders the five mock desktop images (and their 480 px thumbnails) into config/mock-desktops/.
// Run once: npx tsx src/office/spaces/mock/make-images.ts   The output is committed.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = import.meta.dirname;
const out = path.resolve(here, '../../../../config/mock-desktops');

const shots: { file: string; page: string; v: string }[] = [
  { file: '1', page: 'terminal.html', v: '1' },
  { file: '2', page: 'terminal.html', v: '2' },
  { file: '3', page: 'browser.html', v: '1' },
  { file: '4', page: 'browser.html', v: '2' },
  { file: '5', page: 'terminal.html', v: '3' },
];

const browser = await chromium.launch();
try {
  for (const [scale, prefix] of [[1, 'desktop'], [0.375, 'thumb']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale });
    for (const s of shots) {
      const page = await ctx.newPage();
      await page.goto(`${pathToFileURL(path.join(here, s.page)).href}?v=${s.v}`);
      await page.screenshot({ path: path.join(out, `${prefix}-${s.file}.jpg`), type: 'jpeg', quality: 82, scale: 'device' });
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('wrote', shots.length * 2, 'images to', out);
