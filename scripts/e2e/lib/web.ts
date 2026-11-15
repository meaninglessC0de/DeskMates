// Helpers for scripts/e2e/ui.ts: a Vite web server of our own that proxies to our office, and a guard that
// collects everything a page logs (console errors, uncaught exceptions, the error boundary).
// Additions only: nothing here is used by real.ts or soak.ts.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { ROOT } from './harness.ts';

export interface Web {
  url: string;
  close(): Promise<void>;
}

/**
 * The renderer as a plain web page (vite.web.config.ts), proxying /api, /media and /ws to `officeUrl`.
 * No file watcher and no HMR: the page must not reload while a test is running, even if someone edits src/ meanwhile.
 */
export async function startWeb(port: number, officeUrl: string): Promise<Web> {
  process.env.VITE_OFFICE_URL = officeUrl;
  const server: ViteDevServer = await createServer({
    configFile: path.join(ROOT, 'vite.web.config.ts'),
    server: { port, strictPort: true, host: '127.0.0.1', watch: null, hmr: false },
    logLevel: 'silent',
  });
  await server.listen();
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

export const ERROR_BOUNDARY = /Something went wrong/i;

/** Everything the page logged, with a mark so a scenario only judges what happened during it. */
export class PageGuard {
  readonly lines: string[] = [];
  readonly problems: string[] = [];

  constructor(readonly page: Page) {
    page.on('console', (m) => {
      const t = m.type();
      const line = `[${t}] ${m.text()}`;
      this.lines.push(line);
      if (t === 'error') this.problems.push(`console error: ${m.text().slice(0, 300)}`);
    });
    page.on('pageerror', (e) => {
      this.lines.push(`[pageerror] ${e.message}`);
      this.problems.push(`uncaught exception: ${e.message.slice(0, 300)}`);
    });
  }

  mark(): { lines: number; problems: number } {
    return { lines: this.lines.length, problems: this.problems.length };
  }

  /** Problems since `mark`, plus the error boundary if it is showing now. */
  async check(mark: { problems: number }): Promise<string[]> {
    const out = this.problems.slice(mark.problems);
    try {
      if (await this.page.getByText(ERROR_BOUNDARY).first().isVisible({ timeout: 100 })) out.push('the error boundary is showing ("Something went wrong")');
    } catch {
      /* page is closing */
    }
    return out;
  }

  save(file: string, from = 0): void {
    writeFileSync(file, this.lines.slice(from).join('\n') + '\n');
  }
}

export function freshDir(dir: string): string {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const exists = existsSync;
