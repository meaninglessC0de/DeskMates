// One board of every exported screen, as a single self-contained HTML page (for one Figma import).
// Usage: npx tsx scripts/figma-export.ts && node scripts/figma-board.mjs      writes shots/figma/board.html
// Each screen keeps its own markup inside a 1440 x 900 frame; the stylesheet is shared, taken from the first
// light export. A frame is the containing block for its fixed parts (dialogs, the call stage), and a dark
// screen is made dark by colour scheme alone, which is how the app itself does it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = join(root, 'shots/figma');
const frames = JSON.parse(readFileSync(join(root, 'scripts/figma-frames.json'), 'utf8'));
const W = 1440;
const H = 900;
const COLS = 3;
const GAP = 160;
const PAD = 200;
const TITLE = 96;

const fileOf = (f) => join(dir, `${f.id.replace(/\//g, '-')}-${f.scheme}.html`);
const read = (f) => {
  const html = readFileSync(fileOf(f), 'utf8');
  const style = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
  const bodyOpen = html.match(/<body([^>]*)>/);
  const body = html.slice(html.indexOf(bodyOpen[0]) + bodyOpen[0].length, html.lastIndexOf('</body>'));
  const htmlAttrs = (html.match(/<html([^>]*)>/) ?? ['', ''])[1];
  return { style, body, bodyAttrs: bodyOpen[1], htmlAttrs };
};

const missing = frames.filter((f) => !existsSync(fileOf(f)));
if (missing.length) {
  console.error(`Missing exports: ${missing.map((f) => f.id).join(', ')}. Run scripts/figma-export.ts first.`);
  process.exit(1);
}

const first = read(frames.find((f) => f.scheme === 'light'));
// the single-screen rule that pins html and body to one screen does not apply to a board
const shared = first.style.replace(/html\{color-scheme:[^}]*\}html,body\{[^}]*\}/, '');

const rows = Math.ceil(frames.length / COLS);
const boardW = PAD * 2 + COLS * W + (COLS - 1) * GAP;
const boardH = PAD * 2 + 220 + rows * (H + TITLE) + (rows - 1) * GAP;

const cells = frames
  .map((f, i) => {
    const s = read(f);
    const n = String(i + 1).padStart(2, '0');
    return `<section class="am-cell">
<div class="am-cap"><span class="am-n">${n}</span><span class="am-t">${f.title}</span></div>
<div class="am-screen am-${f.scheme}"${s.htmlAttrs.replace(/\slang="[^"]*"/, '')}><div class="am-body"${s.bodyAttrs}>${s.body}</div></div>
</section>`;
  })
  .join('\n');

const css = `
html,body{margin:0;padding:0;width:${boardW}px;height:${boardH}px;overflow:visible;background:#f4f4f2;color-scheme:light;}
.am-board{width:${boardW}px;height:${boardH}px;box-sizing:border-box;padding:${PAD}px;background:#f4f4f2;font-family:Figtree,-apple-system,BlinkMacSystemFont,sans-serif;}
.am-head{height:220px;display:flex;flex-direction:column;gap:16px;color:#1b1b1b;}
.am-head b{font-size:72px;font-weight:600;letter-spacing:-1.6px;line-height:1.1;}
.am-head span{font-size:28px;line-height:1.4;color:#474747;}
.am-grid{display:grid;grid-template-columns:repeat(${COLS},${W}px);column-gap:${GAP}px;row-gap:${GAP}px;}
.am-cell{width:${W}px;height:${H + TITLE}px;display:flex;flex-direction:column;}
.am-cap{height:${TITLE}px;display:flex;align-items:center;gap:20px;color:#1b1b1b;}
.am-n{font-size:22px;font-weight:600;color:#6a6a6a;font-variant-numeric:tabular-nums;}
.am-t{font-size:30px;font-weight:600;letter-spacing:-.3px;}
.am-screen{position:relative;width:${W}px;height:${H}px;overflow:hidden;transform:translate(0,0);border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 24px 60px rgba(0,0,0,.10);color-scheme:light;background:#fff;}
.am-body{width:${W}px;height:${H}px;position:relative;overflow:hidden;}
.am-screen.am-dark{background:#1b1b1b;}
.am-dark,.am-dark *{color-scheme:dark !important;}
*,*::before,*::after{animation:none!important;transition:none!important;}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${boardW}">
<title>Deskmates: screens</title>
<style>${shared}</style>
<style>${css}</style>
</head>
<body>
<div class="am-board">
<div class="am-head"><b>Deskmates: every screen</b><span>Taken from the running app. Each frame is the real Astryx markup, as editable layers.</span></div>
<div class="am-grid">
${cells}
</div>
</div>
</body>
</html>
`;
writeFileSync(join(dir, 'board.html'), html);
console.log(`wrote shots/figma/board.html  ${frames.length} screens  ${boardW} x ${boardH}  ${(html.length / 1024 / 1024).toFixed(1)} MB`);
