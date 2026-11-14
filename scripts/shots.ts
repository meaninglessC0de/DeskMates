/**
 * Screenshots of every registered state, light and dark.
 *
 *   npm run shots                      all areas
 *   npm run shots -- team              one area
 *   npm run shots -- --web <url>       use a running renderer instead of starting a Vite dev server
 *
 * Reads `export const shots` from src/renderer/src/<area>/shots.ts (those files must stay plain data),
 * opens `/?shot=<area>/<name>[&<query>]` at 1280x800 (scale 2), and writes shots/<area>/<name>-light.png
 * and -dark.png. Exits 1 if a page logs a console error, throws, or renders the error boundary.
 * Fixture portraits and desktop frames do not exist on disk, so /media and frame/thumbnail requests are
 * answered with placeholder SVGs here.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const areasDir = join(root, 'src/renderer/src');

interface Shot { name: string; query?: string }

function parseArgs(argv: string[]): { area: string | null; web: string | null } {
  let area: string | null = null;
  let web: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--web') web = argv[++i] ?? null;
    else if (!a.startsWith('-') && area === null) area = a;
  }
  return { area, web };
}

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createNetServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });
}

async function loadRegistry(only: string | null): Promise<Map<string, Shot[]>> {
  const out = new Map<string, Shot[]>();
  for (const d of readdirSync(areasDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (only && d.name !== only) continue;
    const file = join(areasDir, d.name, 'shots.ts');
    if (!existsSync(file)) continue;
    const mod = (await import(pathToFileURL(file).href)) as { shots?: Shot[] };
    if (mod.shots?.length) out.set(d.name, mod.shots);
  }
  return out;
}

function hue(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function portraitSvg(file: string): string {
  const tone = 78 + (hue(file) % 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="hsl(30 8% ${tone}%)"/><circle cx="40" cy="38" r="16" fill="hsl(30 8% ${tone - 22}%)"/><path d="M8 100 C8 70 24 62 40 62 C56 62 72 70 72 100 Z" fill="hsl(30 8% ${tone - 22}%)"/></svg>`;
}

const frameSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#2b2d31"/><rect x="120" y="90" width="760" height="520" rx="10" fill="#f3f3f1"/><rect x="120" y="90" width="760" height="40" rx="10" fill="#dcdcd8"/><rect x="150" y="170" width="420" height="16" fill="#bdbdb8"/><rect x="150" y="204" width="560" height="16" fill="#cfcfca"/><rect x="150" y="238" width="360" height="16" fill="#cfcfca"/></svg>`;

async function main(): Promise<number> {
  const { area, web } = parseArgs(process.argv.slice(2));
  const registry = await loadRegistry(area);
  if (registry.size === 0) {
    console.error(area ? `no shots registered for area "${area}"` : 'no shots registered');
    return 1;
  }

  let server: Awaited<ReturnType<typeof createServer>> | null = null;
  let base = web;
  if (!base) {
    const port = await freePort();
    server = await createServer({
      configFile: join(root, 'vite.web.config.ts'),
      server: { port, strictPort: true, host: '127.0.0.1' },
      logLevel: 'error',
    });
    await server.listen();
    base = `http://127.0.0.1:${port}`;
  }
  base = base.replace(/\/$/, '');

  const browser = await chromium.launch();
  let failures = 0;
  let written = 0;

  try {
    const visit = async (path: string, scheme: 'light' | 'dark', file: string | null): Promise<string[]> => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme });
      const page = await context.newPage();
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
      await page.route(/\/media\/portraits\//, (r) => r.fulfill({ contentType: 'image/svg+xml', body: portraitSvg(r.request().url()) }));
      await page.route(/\/api\/employees\/[^/]+\/(frame|thumbnail)\.jpg/, (r) => r.fulfill({ contentType: 'image/svg+xml', body: frameSvg }));
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.evaluate('document.fonts.ready');
      await page.waitForTimeout(600);
      if ((await page.getByText('Something went wrong').count()) > 0) problems.push('error boundary rendered');
      if (file) await page.screenshot({ path: file });
      await context.close();
      return problems;
    };

    // warm-up: first Vite load may re-optimise dependencies; its result is ignored
    await visit('/?shot=shell/sidebar', 'light', null);

    for (const [name, shots] of registry) {
      const dir = join(root, 'shots', name);
      mkdirSync(dir, { recursive: true });
      for (const s of shots) {
        const path = `/?shot=${name}/${s.name}${s.query ? `&${s.query}` : ''}`;
        for (const scheme of ['light', 'dark'] as const) {
          const file = join(dir, `${s.name}-${scheme}.png`);
          const problems = await visit(path, scheme, file);
          if (problems.length) {
            failures++;
            console.error(`FAIL ${name}/${s.name} (${scheme})`);
            for (const p of problems) console.error(`  ${p}`);
          } else {
            written++;
            console.log(`ok   shots/${name}/${s.name}-${scheme}.png`);
          }
        }
      }
    }
  } finally {
    await browser.close();
    await server?.close();
  }

  console.log(`${written} screenshots written, ${failures} failed`);
  return failures ? 1 : 0;
}

process.exit(await main());
