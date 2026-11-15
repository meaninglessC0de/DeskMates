/**
 * Launches the built Electron app (run `npx electron-vite build` first), waits for the first window,
 * saves shots/smoke/electron-window.png and exits 0. It opens the fixture state shell/sidebar, so no
 * office is needed.
 */
import { _electron as electron } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const out = join(root, 'shots/smoke/electron-window.png');
mkdirSync(join(root, 'shots/smoke'), { recursive: true });

const app = await electron.launch({
  args: [join(root, 'out/main/index.js')],
  cwd: root,
  env: { ...process.env, AGENT_MANAGER_SHOT: 'shell/sidebar' },
});
let code = 0;
try {
  const win = await app.firstWindow();
  const errors: string[] = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForLoadState('load');
  await win.getByText('Maya Chen').first().waitFor({ timeout: 15_000 });
  await win.evaluate('document.fonts.ready');
  await win.waitForTimeout(500);
  await win.screenshot({ path: out });
  const size = win.viewportSize();
  console.log(`window title "${await win.title()}", viewport ${size?.width}x${size?.height}`);
  console.log(`saved ${out}`);
  if (errors.length) {
    console.error(errors.join('\n'));
    code = 1;
  }
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await app.close();
}
process.exit(code);
