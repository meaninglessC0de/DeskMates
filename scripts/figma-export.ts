/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * Self-contained HTML copies of app screens, for import into Figma as real layers.
 *
 *   npx tsx scripts/figma-export.ts                 every frame in FRAMES
 *   npx tsx scripts/figma-export.ts thread/working  only the frames whose id contains the argument
 *   npx tsx scripts/figma-export.ts --check         also re-render each export and save a PNG beside it
 *
 * For each frame: opens `/?shot=<id>` (fixtures, no office needed) at 1440x900, then writes
 * shots/figma/<id>-<scheme>.html with every stylesheet inlined (adopted sheets included), the colour
 * scheme baked in (no media query left to decide it), images, fonts and canvases as data URIs, and
 * scripts removed. The file renders the same with no server and no network.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const W = 1440;
const H = 900;

type Scheme = 'light' | 'dark';
interface Frame { id: string; query?: string; scheme: Scheme; title: string }

/** The frames worth showing, in the order they should read on the Figma page. Ids are `<area>/<shot name>`. */
export const FRAMES: Frame[] = JSON.parse(readFileSync(join(root, 'scripts/figma-frames.json'), 'utf8')) as Frame[];

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

const frameSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#2b2d31"/><rect x="120" y="90" width="760" height="520" rx="10" fill="#f3f3f1"/><rect x="120" y="90" width="760" height="40" rx="10" fill="#dcdcd8"/><rect x="150" y="170" width="420" height="16" fill="#bdbdb8"/><rect x="150" y="204" width="560" height="16" fill="#cfcfca"/><rect x="150" y="238" width="360" height="16" fill="#cfcfca"/></svg>`;

/** Runs in the page. Returns one self-contained HTML document as a string. */
async function serialise({ scheme, width, height }: { scheme: Scheme; width: number; height: number }): Promise<string> {
  const toDataUrl = async (url: string): Promise<string | null> => {
    try {
      if (url.startsWith('data:')) return url;
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => fail(r.error);
        r.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // 1. stylesheet text, with the colour scheme decided here instead of by a media query
  const other: Scheme = scheme === 'dark' ? 'light' : 'dark';
  // the importer has its own viewport, so viewport units are fixed to this frame's size (done before any data URI is in the text)
  const fixUnits = (text: string): string =>
    text.replace(/(-?\d*\.?\d+)(?:d|s|l)?v(h|w)\b/g, (_m, n: string, axis: string) => `${((Number(n) * (axis === 'h' ? height : width)) / 100).toFixed(2)}px`);
  const inlineUrls = async (raw: string, base: string): Promise<string> => {
    let text = fixUnits(raw);
    const urls = Array.from(new Set(Array.from(text.matchAll(/url\((['"]?)([^'")]+)\1\)/g)).map((m) => m[2]!))).filter((u) => !u.startsWith('data:') && !u.startsWith('#'));
    for (const u of urls) {
      const data = await toDataUrl(new URL(u, base).href);
      if (data) text = text.split(u).join(data);
    }
    return text;
  };
  const all = async (rules: CSSRuleList, base: string): Promise<string> => {
    const parts: string[] = [];
    for (const r of Array.from(rules)) parts.push(await ruleText(r, base));
    return parts.join('\n');
  };
  const ruleText = async (rule: CSSRule, base: string): Promise<string> => {
    if (rule instanceof CSSImportRule) {
      // an imported sheet (the web font) is pulled in whole; a cross-origin one is read as text
      const href = new URL(rule.href, base).href;
      try {
        if (rule.styleSheet) return await all(rule.styleSheet.cssRules, href);
      } catch {
        /* cross-origin: fall through */
      }
      try {
        return await inlineUrls(await (await fetch(href)).text(), href);
      } catch {
        return '';
      }
    }
    if (rule instanceof CSSMediaRule) {
      const cond = rule.conditionText;
      if (cond.includes(`prefers-color-scheme: ${other}`) || cond.includes(`prefers-color-scheme:${other}`)) return '';
      if (cond.includes('prefers-reduced-motion')) return '';
      const inner = await all(rule.cssRules, base);
      if (cond.includes(`prefers-color-scheme: ${scheme}`) || cond.includes(`prefers-color-scheme:${scheme}`)) return inner;
      return `@media ${cond} {\n${inner}\n}`;
    }
    if (rule instanceof CSSLayerBlockRule) return `@layer ${rule.name} {\n${await all(rule.cssRules, base)}\n}`;
    if (rule instanceof CSSSupportsRule) return `@supports ${rule.conditionText} {\n${await all(rule.cssRules, base)}\n}`;
    return inlineUrls(rule.cssText, base);
  };
  const sheets: CSSStyleSheet[] = [...Array.from(document.styleSheets), ...Array.from(document.adoptedStyleSheets)];
  let css = '';
  for (const sheet of sheets) {
    const base = sheet.href ?? location.href;
    let text: string;
    try {
      text = await all(sheet.cssRules, base);
    } catch {
      if (!sheet.href) continue;
      try {
        text = await inlineUrls(await (await fetch(sheet.href)).text(), sheet.href);
      } catch {
        continue;
      }
    }
    // light-dark() follows color-scheme, so the scheme is fixed wherever it is declared
    text = text.replace(/color-scheme:\s*light dark/g, `color-scheme: ${scheme}`);
    css += `\n/* ${sheet.href ? new URL(sheet.href).pathname : 'inline'} */\n${text}\n`;
  }

  // 2. a copy of the document with media made static
  const live = Array.from(document.querySelectorAll<HTMLElement>('img, canvas, video'));
  const marks = new Map<string, string>();
  let n = 0;
  for (const el of live) {
    const key = `am-export-${n++}`;
    el.setAttribute('data-am-export', key);
    let data: string | null = null;
    if (el instanceof HTMLImageElement) data = await toDataUrl(el.currentSrc || el.src);
    else if (el instanceof HTMLCanvasElement) {
      try {
        data = el.toDataURL('image/png');
      } catch {
        data = null;
      }
    } else if (el instanceof HTMLVideoElement) {
      if (el.readyState < 2 || el.videoWidth === 0) {
        // no picture in it (fixtures have no live video): its poster if it has one, otherwise leave it out so the
        // still underneath shows, as it does in the app
        data = el.poster ? await toDataUrl(el.poster) : null;
        if (!data) el.setAttribute('data-am-drop', '');
      } else
      try {
        const c = document.createElement('canvas');
        c.width = el.videoWidth || el.clientWidth;
        c.height = el.videoHeight || el.clientHeight;
        c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height);
        data = c.toDataURL('image/jpeg', 0.9);
      } catch {
        data = el.poster ? await toDataUrl(el.poster) : null;
      }
    }
    if (data) marks.set(key, data);
  }

  // what the browser does not render (closed popovers and tooltips, closed dialogs, hidden parts) is left out,
  // because the importer does not know the top layer or the hidden states
  const hidden: Element[] = [];
  const walk = (el: Element): void => {
    const cs = getComputedStyle(el);
    const gone =
      cs.display === 'none' ||
      cs.visibility === 'hidden' ||
      cs.visibility === 'collapse' ||
      (el.hasAttribute('popover') && !el.matches(':popover-open')) ||
      (el instanceof HTMLDialogElement && !el.open && !(el.hasAttribute('popover') && el.matches(':popover-open'))) ||
      el.hasAttribute('hidden');
    if (gone) {
      hidden.push(el);
      return;
    }
    for (const c of Array.from(el.children)) walk(c);
  };
  walk(document.body);
  hidden.forEach((el) => el.setAttribute('data-am-drop', ''));
  // Modal dialogs and open popovers live in the browser's top layer, which a static copy does not have: without help a
  // dialog falls to the end of the page. Each is pinned where it is on screen, with its backdrop drawn as a real element.
  const tops: { key: string; style: string; backdrop: string | null }[] = [];
  let topN = 0;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('dialog[open], [popover]'))) {
    const modal = el instanceof HTMLDialogElement && el.matches(':modal');
    const popped = el.hasAttribute('popover') && el.matches(':popover-open');
    if (!modal && !popped) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const key = `top-${topN++}`;
    el.setAttribute('data-am-top', key);
    const bg = modal ? getComputedStyle(el, '::backdrop').backgroundColor : '';
    tops.push({
      key,
      // inset first (it would reset left and top if it came later); the box is already where its transform put it
      style: `display:${getComputedStyle(el).display};position:fixed;inset:auto;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;max-width:none;max-height:none;opacity:${getComputedStyle(el).opacity};visibility:visible;transform:none;translate:none;scale:none;z-index:${1000 + topN};`,
      backdrop: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : null,
    });
  }
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  hidden.forEach((el) => el.removeAttribute('data-am-drop'));
  document.querySelectorAll('video[data-am-drop]').forEach((el) => el.removeAttribute('data-am-drop'));
  clone.querySelectorAll('[data-am-drop]').forEach((el) => el.remove());
  document.querySelectorAll('[data-am-top]').forEach((el) => el.removeAttribute('data-am-top'));
  for (const t of tops) {
    const el = clone.querySelector<HTMLElement>(`[data-am-top="${t.key}"]`);
    if (!el) continue;
    el.removeAttribute('data-am-top');
    el.setAttribute('style', `${el.getAttribute('style') ?? ''};${t.style}`);
    if (t.backdrop) {
      const shade = document.createElement('div');
      shade.setAttribute('style', `position:fixed;left:0;top:0;width:${width}px;height:${height}px;background:${t.backdrop};z-index:999;`);
      el.parentElement?.insertBefore(shade, el);
    }
  }
  clone.querySelectorAll('script, link, style, noscript, template').forEach((el) => el.remove());
  for (const el of Array.from(clone.querySelectorAll<HTMLElement>('[data-am-export]'))) {
    const key = el.getAttribute('data-am-export')!;
    el.removeAttribute('data-am-export');
    const data = marks.get(key);
    if (el.tagName === 'IMG') {
      if (data) el.setAttribute('src', data);
      el.removeAttribute('srcset');
      el.removeAttribute('loading');
      continue;
    }
    // canvas and video become an <img> that keeps every attribute, so the same rules still match
    const img = document.createElement('img');
    for (const a of Array.from(el.attributes)) if (!['src', 'autoplay', 'muted', 'playsinline', 'poster', 'width', 'height'].includes(a.name)) img.setAttribute(a.name, a.value);
    const src = document.querySelector<HTMLElement>(`[data-am-export="${key}"]`);
    const cs = src ? getComputedStyle(src) : null;
    const keep = cs ? `display:${cs.display === 'inline' ? 'inline-block' : cs.display};width:${cs.width};height:${cs.height};object-fit:${cs.objectFit};object-position:${cs.objectPosition};border-radius:${cs.borderRadius};` : '';
    img.setAttribute('style', `${keep}${el.getAttribute('style') ?? ''}`);
    if (data) img.setAttribute('src', data);
    el.replaceWith(img);
  }
  live.forEach((el) => el.removeAttribute('data-am-export'));

  // inline background images set through style attributes
  for (const el of Array.from(clone.querySelectorAll<HTMLElement>('[style*="url("]'))) {
    let style = el.getAttribute('style') ?? '';
    for (const m of Array.from(style.matchAll(/url\((['"]?)([^'")]+)\1\)/g))) {
      const u = m[2]!;
      if (u.startsWith('data:')) continue;
      const data = await toDataUrl(new URL(u, location.href).href);
      if (data) style = style.split(u).join(data);
    }
    el.setAttribute('style', style);
  }

  const htmlAttrs = Array.from(clone.attributes).map((a) => `${a.name}="${a.value.replace(/"/g, '&quot;')}"`).join(' ');
  const body = clone.querySelector('body')!;
  const bodyAttrs = Array.from(body.attributes).map((a) => `${a.name}="${a.value.replace(/"/g, '&quot;')}"`).join(' ');
  const fixed = `html{color-scheme:${scheme} !important;}html,body{width:${width}px;height:${height}px;margin:0;overflow:hidden;}*,*::before,*::after{animation:none!important;transition:none!important;}`;
  return `<!doctype html>\n<html ${htmlAttrs}>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=${width}">\n<title>${document.title}</title>\n<style>${css}\n${fixed}</style>\n</head>\n<body ${bodyAttrs}>${body.innerHTML}</body>\n</html>\n`;
}

async function prepare(page: Page): Promise<void> {
  await page.route(/\/media\/portraits\//, (r) => {
    const name = decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop() ?? '');
    const real = join(root, 'config/portraits', name);
    if (name && !name.includes('..') && existsSync(real)) return r.fulfill({ contentType: 'image/jpeg', body: readFileSync(real) });
    return r.abort();
  });
  const desk = join(root, 'docs/hackathon/design/figma/desktop-frame.jpg');
  await page.route(/\/api\/employees\/[^/]+\/(frame|thumbnail)\.jpg/, (r) =>
    existsSync(desk) ? r.fulfill({ contentType: 'image/jpeg', body: readFileSync(desk) }) : r.fulfill({ contentType: 'image/svg+xml', body: frameSvg }),
  );
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const only = args.find((a) => !a.startsWith('-')) ?? null;
  const frames = FRAMES.filter((f) => !only || f.id.includes(only));
  if (frames.length === 0) {
    console.error('no frames match');
    return 1;
  }

  const port = await freePort();
  const server = await createServer({ configFile: join(root, 'vite.web.config.ts'), server: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const outDir = join(root, 'shots/figma');
  let failed = 0;

  try {
    // warm-up, as in shots.ts
    {
      const ctx = await browser.newContext({ viewport: { width: W, height: H } });
      const p = await ctx.newPage();
      await prepare(p);
      await p.goto(`${base}/?shot=shell/sidebar`, { waitUntil: 'networkidle' }).catch(() => {});
      await ctx.close();
    }
    for (const f of frames) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: f.scheme });
      const page = await ctx.newPage();
      await prepare(page);
      await page.emulateMedia({ colorScheme: f.scheme });
      await page.goto(`${base}/?shot=${f.id}${f.query ? `&${f.query}` : ''}`, { waitUntil: 'networkidle' });
      await page.evaluate('document.fonts.ready');
      await page.waitForTimeout(900);
      // tsx wraps named inner functions in a helper that does not exist in the page
      await page.evaluate('globalThis.__name = (f) => f');
      const html = await page.evaluate(serialise, { scheme: f.scheme, width: W, height: H });
      const file = join(outDir, `${f.id.replace(/\//g, '-')}-${f.scheme}.html`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
      await page.screenshot({ path: file.replace(/\.html$/, '.app.png') });
      await ctx.close();
      let note = '';
      if (check) {
        // the export on its own: default (light) scheme, no network
        const c2 = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'light', offline: true });
        const p2 = await c2.newPage();
        const problems: string[] = [];
        p2.on('requestfailed', (r) => problems.push(r.url().slice(0, 80)));
        await p2.goto(pathToFileURL(file).href, { waitUntil: 'load' });
        await p2.waitForTimeout(300);
        await p2.screenshot({ path: file.replace(/\.html$/, '.export.png') });
        await c2.close();
        if (problems.length) {
          failed++;
          note = `  NOT self-contained: ${problems.length} request(s), first ${problems[0]}`;
        }
      }
      console.log(`ok   ${file.replace(`${root}/`, '')}  ${(html.length / 1024).toFixed(0)} kB${note}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(await main());
