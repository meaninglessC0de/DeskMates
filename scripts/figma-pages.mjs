// Writes the two static pages of the Figma file as self-contained HTML (for Figma's HTML import):
//   shots/figma/cover.html   1600 x 900 cover
//   shots/figma/brand.html   the mark, the colours, the people tints, type and the building blocks
// Usage: node scripts/figma-pages.mjs      (run `npx tsx scripts/figma-export.ts` once first: the font is read from one of its files)
// These are documents about the design, not app screens, so they are plain HTML; every value comes from
// resources/brand/*.svg, docs/hackathon/design/brand/README.md and the theme tokens.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'shots/figma');
mkdirSync(out, { recursive: true });

// --- colour: OKLCH to sRGB hex, so the importer never has to understand oklch() ---
function oklch(l, c, h) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S];
  const to = (x) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)));
  return `#${lin.map((x) => to(x).toString(16).padStart(2, '0')).join('')}`;
}

// --- sources ---
const svg = (name) => readFileSync(join(root, 'resources/brand', name), 'utf8').replace(/<\?xml[^>]*\?>/, '').trim();
const sized = (markup, px) => markup.replace(/<svg([^>]*)>/, (_m, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${px}" height="${px}">`);
const mark = svg('deskmates-mark.svg');
const small = svg('deskmates-mark-small.svg');
const icon = svg('deskmates-app-icon.svg');
const portrait = (name) => `data:image/jpeg;base64,${readFileSync(join(root, 'config/portraits', `${name}-sq.jpg`)).toString('base64')}`;

let fontFace = '';
const exported = existsSync(out) ? readdirSync(out).find((f) => f.endsWith('.html') && !['cover.html', 'brand.html'].includes(f)) : null;
if (exported) fontFace = (readFileSync(join(out, exported), 'utf8').match(/@font-face\s*\{[^}]*\}/g) ?? []).filter((f) => f.includes('Figtree')).join('\n');
if (!fontFace) console.warn('No exported screen found: pages will fall back to the system font. Run scripts/figma-export.ts first.');

const brand = [
  { name: 'Blue', hue: 262, tile: '#72a3fe', handle: '#4f76be', lc: '0.720 0.143', person: 'Maya Chen', role: 'Web developer', file: 'maya' },
  { name: 'Orange', hue: 62, tile: '#fd9e3d', handle: '#bf7220', lc: '0.780 0.155', person: 'Priya Raman', role: 'Marketer', file: 'priya' },
  { name: 'Pink', hue: 357, tile: '#f874a9', handle: '#ba4f7b', lc: '0.729 0.170', person: 'Jonas Weber', role: 'Researcher', file: 'jonas' },
  { name: 'Green', hue: 160, tile: '#34cb8b', handle: '#0f9663', lc: '0.749 0.155', person: 'Ines Moreau', role: 'Designer', file: 'ines' },
];
const hues = [262, 62, 357, 160, 300, 200, 90, 25];
const ground = '#14161b';
const base = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}`;
const doc = (title, w, css, body) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=${w}">\n<title>${title}</title>\n<style>\n${fontFace}\n${base}\n${css}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

// --- cover ---
{
  const css = `
body{width:1600px;height:900px;background:${ground};color:#fff;overflow:hidden}
.cover{width:1600px;height:900px;display:flex;align-items:center;justify-content:space-between;padding:0 128px}
.left{display:flex;flex-direction:column;gap:40px;width:640px}
.lockup{display:flex;align-items:center;gap:28px}
.name{font-size:96px;font-weight:600;letter-spacing:-2.4px;line-height:1}
.line{font-size:34px;font-weight:400;line-height:1.3;color:rgba(255,255,255,.72);letter-spacing:-.3px}
.meta{display:flex;flex-direction:column;gap:8px;font-size:17px;line-height:1.4;color:rgba(255,255,255,.48)}
.desks{display:grid;grid-template-columns:260px 260px;gap:34px}
.desk{width:260px;height:260px;border-radius:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.desk img{width:132px;height:132px;border-radius:66px;object-fit:cover;display:block}
.who{display:flex;flex-direction:column;align-items:center;gap:2px}
.who b{font-size:20px;font-weight:600;color:#14161b;line-height:1.2}
.who span{font-size:15px;font-weight:500;color:rgba(20,22,27,.66);line-height:1.2}`;
  const desks = brand.map((b) => `<div class="desk" style="background:${b.tile}"><img src="${portrait(b.file)}" alt=""><div class="who"><b>${b.person}</b><span>${b.role}</span></div></div>`).join('\n');
  const body = `<div class="cover">
<div class="left">
<div class="lockup">${sized(mark, 104)}<div class="name">Deskmates</div></div>
<div class="line">Hire a team of AI employees.<br>Give each one a desk of their own.</div>
<div class="meta"><div>Imperial AI Hack 2026 · Autonomous Agents</div><div>Every screen built with Astryx, on the neutral theme</div></div>
</div>
<div class="desks">
${desks}
</div>
</div>`;
  writeFileSync(join(out, 'cover.html'), doc('Deskmates: cover', 1600, css, body));
}

// --- brand and foundations ---
{
  const tokens = existsSync(join(root, 'scripts/figma-tokens.json')) ? JSON.parse(readFileSync(join(root, 'scripts/figma-tokens.json'), 'utf8')) : { neutrals: [], type: [], radii: [], spacing: [] };
  const css = `
body{width:1600px;background:#fff;color:#1b1b1b}
.sheet{width:1600px;padding:96px 128px 128px;display:flex;flex-direction:column;gap:96px}
.head{display:flex;flex-direction:column;gap:12px}
.eyebrow{font-size:15px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:#6a6a6a}
h1{font-size:56px;font-weight:600;letter-spacing:-1.2px;line-height:1.1}
h2{font-size:28px;font-weight:600;letter-spacing:-.4px;line-height:1.2}
p{font-size:18px;line-height:1.5;color:#474747;max-width:760px}
.section{display:flex;flex-direction:column;gap:32px}
.row{display:flex;align-items:flex-end;gap:48px}
.cell{display:flex;flex-direction:column;align-items:flex-start;gap:14px}
.cap{font-size:14px;line-height:1.35;color:#6a6a6a}
.cap b{color:#1b1b1b;font-weight:600}
.plate{display:flex;align-items:center;justify-content:center;border-radius:24px}
.swatches{display:grid;grid-template-columns:repeat(4,312px);gap:32px}
.swatch{display:flex;flex-direction:column;gap:14px}
.chip{width:312px;height:168px;border-radius:40px;display:flex;align-items:center;justify-content:center}
.handle{width:132px;height:28px;border-radius:14px}
.tints{display:flex;flex-direction:column;gap:14px}
.tintrow{display:flex;align-items:center;gap:14px}
.tintrow .lab{width:150px;font-size:14px;color:#6a6a6a}
.t{width:140px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}
.people{display:flex;gap:28px}
.person{display:flex;align-items:center;gap:14px;padding:12px 20px 12px 12px;border-radius:20px;width:316px}
.person img{width:56px;height:56px;border-radius:28px;object-fit:cover;display:block}
.person b{font-size:17px;font-weight:600;display:block;line-height:1.25}
.person span{font-size:14px;color:#474747;line-height:1.25}
.neutrals{display:grid;grid-template-columns:repeat(6,200px);gap:24px}
.n{display:flex;flex-direction:column;gap:10px}
.nchip{width:200px;height:96px;border-radius:16px;border:1px solid rgba(0,0,0,.08)}
.type{display:flex;flex-direction:column;gap:18px}
.trow{display:flex;align-items:baseline;gap:32px}
.trow .lab{width:220px;font-size:14px;color:#6a6a6a}
.scale{display:flex;align-items:flex-end;gap:24px}
.box{background:#1b1b1b;border-radius:4px}
.rad{width:96px;height:96px;background:#f1f1f1;border:1px solid rgba(0,0,0,.08)}`;

  const marks = `<div class="row">
<div class="cell"><div class="plate" style="width:280px;height:280px;background:${ground}">${sized(mark, 168)}</div><div class="cap"><b>The mark</b><br>Four desks, each with its handle</div></div>
<div class="cell"><div class="plate" style="width:280px;height:280px;background:#f1f1f1">${sized(mark, 168)}</div><div class="cap"><b>On light</b><br>Same colours, no outline</div></div>
<div class="cell"><div class="plate" style="width:280px;height:280px;background:#fff">${sized(icon, 232)}</div><div class="cap"><b>App icon</b><br>The mark at 62% of its ground</div></div>
<div class="cell"><div class="row" style="gap:28px;height:280px;align-items:center">${sized(mark, 64)}${sized(mark, 32)}${sized(mark, 24)}${sized(small, 20)}${sized(small, 16)}</div><div class="cap"><b>Sizes</b><br>Under 24 px the handles go and the gap widens</div></div>
</div>`;

  const swatches = `<div class="swatches">${brand
    .map((b) => `<div class="swatch"><div class="chip" style="background:${b.tile}"><div class="handle" style="background:${b.handle}"></div></div><div class="cap"><b>${b.name} · hue ${b.hue}</b><br>Tile ${b.tile} · oklch ${b.lc} ${b.hue}<br>Handle ${b.handle}</div></div>`)
    .join('')}</div>`;

  const tintRow = (label, fn, ink) => `<div class="tintrow"><div class="lab">${label}</div>${hues.map((h) => `<div class="t" style="background:${fn(h)};color:${ink(h)}">${h}</div>`).join('')}</div>`;
  const tints = `<div class="tints">
${tintRow('Tint, light theme', (h) => oklch(0.9, 0.05, h), (h) => oklch(0.42, 0.1, h))}
${tintRow('Tint, dark theme', (h) => oklch(0.36, 0.055, h), (h) => oklch(0.88, 0.07, h))}
${tintRow('Line (data mark)', (h) => oklch([0.72, 0.78, 0.729, 0.749, 0.74, 0.75, 0.79, 0.74][hues.indexOf(h)], [0.143, 0.155, 0.17, 0.155, 0.15, 0.13, 0.15, 0.15][hues.indexOf(h)], h), () => '#14161b')}
</div>`;

  const people = `<div class="people">${brand
    .map((b) => `<div class="person" style="background:${oklch(0.9, 0.05, b.hue)}"><img src="${portrait(b.file)}" alt=""><div><b style="color:${oklch(0.42, 0.1, b.hue)}">${b.person}</b><span>${b.role}</span></div></div>`)
    .join('')}</div>`;

  const neutrals = tokens.neutrals.length
    ? `<div class="section"><h2>Neutral theme</h2><p>Astryx's neutral theme, unchanged. One accent: ink. Status colours only for status.</p><div class="neutrals">${tokens.neutrals
        .map((n) => `<div class="n"><div class="nchip" style="background:${n.light}"></div><div class="cap"><b>${n.name}</b><br>${n.token}<br>${n.light} · dark ${n.dark}</div></div>`)
        .join('')}</div></div>`
    : '';
  const type = tokens.type.length
    ? `<div class="section"><h2>Type</h2><p>Figtree, four weights, one short scale.</p><div class="type">${tokens.type
        .map((t) => `<div class="trow"><div class="lab">${t.name} · ${t.size}/${t.line} · ${t.weight}</div><div style="font-size:${t.size}px;line-height:${t.line}px;font-weight:${t.weight}">${t.sample}</div></div>`)
        .join('')}</div></div>`
    : '';
  const shape =
    tokens.radii.length || tokens.spacing.length
      ? `<div class="section"><h2>Space and shape</h2><div class="row" style="align-items:flex-start;gap:96px"><div class="cell"><div class="scale">${tokens.spacing
          .map((s) => `<div class="cell" style="align-items:center;gap:10px"><div class="box" style="width:${s.px}px;height:${s.px}px"></div><div class="cap">${s.px}</div></div>`)
          .join('')}</div><div class="cap"><b>Spacing</b> · one scale, from the theme</div></div><div class="cell"><div class="scale">${tokens.radii
          .map((r) => `<div class="cell" style="align-items:center;gap:10px"><div class="rad" style="border-radius:${r.px}px"></div><div class="cap">${r.name} · ${r.px}</div></div>`)
          .join('')}</div><div class="cap"><b>Corners</b></div></div></div></div>`
      : '';

  const body = `<div class="sheet">
<div class="head"><div class="eyebrow">Deskmates · brand and foundations</div><h1>Four desks, four mates.</h1><p>A quiet studio where the people are the colour. The interface is Astryx's neutral theme with ink as the only accent; colour belongs to the team. Each person takes one of the mark's hues, in hire order, and keeps it everywhere they appear.</p></div>
<div class="section"><h2>The mark</h2>${marks}</div>
<div class="section"><h2>Brand colour</h2><p>Flat, equal in visual weight rather than equal in lightness. Handles keep the tile's hue, about 0.15 L darker.</p>${swatches}</div>
<div class="section"><h2>People tints</h2><p>The first four people take the mark's hues; four more follow for a larger cast. A tint is a soft ground for a face or a name, never a status.</p>${tints}${people}</div>
${neutrals}
${type}
${shape}
</div>`;
  writeFileSync(join(out, 'brand.html'), doc('Deskmates: brand and foundations', 1600, css, body));
}
console.log('wrote shots/figma/cover.html and shots/figma/brand.html');
