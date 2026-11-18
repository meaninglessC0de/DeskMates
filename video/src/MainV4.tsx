import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import manifest from '../clips-v4.json';

const FPS = 30;
const ease = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);
const back = Easing.bezier(0.34, 1.56, 0.64, 1);
const outCubic = Easing.bezier(0.33, 1, 0.68, 1);
const glide = Easing.bezier(0.22, 1, 0.36, 1);
const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const tw = (t: number, a: number, b: number, from = 0, to = 1, e = ease) => interpolate(t, [a, b], [from, to], { ...C, easing: e });
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
const MONO = '"SF Mono", Menlo, Monaco, monospace';

type Key = 'maya' | 'priya' | 'jonas' | 'ines';
const ORDER: Key[] = ['maya', 'priya', 'jonas', 'ines'];
const P: Record<Key, { name: string; full: string; role: string; color: string; desk: number; img: string; wall: [string, string] }> = {
  maya: { name: 'Maya', full: 'Maya Chen', role: 'Web developer', color: '#5B8CFF', desk: 1, img: 'img/maya-sq.jpg', wall: ['#3d6bff', '#18bfae'] },
  priya: { name: 'Priya', full: 'Priya Raman', role: 'Marketer', color: '#FF9F43', desk: 2, img: 'img/priya-sq.jpg', wall: ['#ff8a3d', '#ff4566'] },
  jonas: { name: 'Jonas', full: 'Jonas Weber', role: 'Researcher', color: '#EE5A9C', desk: 3, img: 'img/jonas-sq.jpg', wall: ['#ee5a9c', '#7b52ff'] },
  ines: { name: 'Ines', full: 'Ines Moreau', role: 'Designer', color: '#2FCB8B', desk: 4, img: 'img/ines-sq.jpg', wall: ['#23c48e', '#2b86ff'] },
};
const SAM = '#B79CFF';

// ---------- recorded clips (v2) ----------
type Clip = { src: string; from?: number; at?: number; rate?: number; crop?: { x: number; y: number; w: number; h: number }; audio?: boolean; replacesLines?: string[]; appFaces?: boolean; appLabels?: boolean };
const CLIPS = ((manifest as unknown as { clips?: Record<string, Clip | null> }).clips) ?? {};
const clipOf = (id: string): Clip | null => { const c = CLIPS[id]; return c && c.src ? c : null; };
// A clip fills its parent box. `at` defaults to the slot start so frame 0 of the clip (plus `from`) is the slot's first frame.
const ClipVideo: React.FC<{ c: Clip; slotStart: number; fit?: 'fill' | 'cover' }> = ({ c, slotStart, fit = 'fill' }) => {
  const k = c.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const at = c.at ?? slotStart;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0b0c10' }}>
      <Sequence from={Math.round(at * FPS)} layout="none">
        <OffthreadVideo
          src={staticFile(c.src)}
          trimBefore={Math.round((c.from ?? 0) * FPS)}
          playbackRate={c.rate ?? 1}
          muted={!c.audio}
          style={{ position: 'absolute', left: `${(-k.x / k.w) * 100}%`, top: `${(-k.y / k.h) * 100}%`, width: `${100 / k.w}%`, height: `${100 / k.h}%`, objectFit: fit === 'cover' ? 'cover' : 'fill' }}
        />
      </Sequence>
    </div>
  );
};
const skippedLines = new Set<string>(Object.values(CLIPS).flatMap((c) => (c && c.audio && c.replacesLines) || []));

// ---------- voice schedule (seconds) ----------
type Line = { id: string; t: number; d: number; who: 'narrator' | 'sam' | Key; text: string; real?: boolean };
const LINES: Line[] = [
  { id: 'n01', t: 0.5, d: 4.19, who: 'narrator', text: "This is Sam's Mac. Sam runs a startup with four AI agents." },
  { id: 'n02', t: 6.4, d: 6.4, who: 'narrator', text: 'A coder, a marketer, a researcher and a designer. All working at once, in one pile of windows.' },
  { id: 'n03', t: 13.4, d: 3.98, who: 'narrator', text: "Who's doing what? Like every founder, Sam scrolls through logs." },
  { id: 'n04', t: 19.9, d: 2.79, who: 'narrator', text: 'Now watch what happens when Sam opens Deskmates.' },
  { id: 'n05', t: 28.2, d: 8.56, who: 'narrator', text: "Every agent gets its own computer. Maya's code goes to her desk. Priya's post to hers. Jonas's research to his. Ines's designs to hers." },
  { id: 'n06', t: 39.0, d: 1.78, who: 'narrator', text: 'And every agent gets a face.' },
  { id: 'rc1', t: 42.05, d: 5.8, who: 'maya', real: true, text: "Hi Sam, Maya here. I'm on the checkout discount bug, and the push is waiting on your go-ahead." },
  { id: 'n07', t: 48.15, d: 2.92, who: 'narrator', text: 'So Sam can talk to the team, face to face.' },
  { id: 's01', t: 51.3, d: 2.0, who: 'sam', text: 'Okay team, standup!' },
  { id: 'rm1', t: 53.4, d: 7.4, who: 'maya', real: true, text: 'Morning, all. Quick update from me: the checkout discount bug is found and fixed, tests are run, and the commit is on fix/checkout-discount.' },
  { id: 's03', t: 62.55, d: 1.14, who: 'sam', text: 'Jonas?' },
  { id: 'rj1', t: 64.4, d: 4.0, who: 'jonas', real: true, text: 'The pricing chart is at work/pricing.html.' },
  { id: 's06', t: 69.0, d: 2.29, who: 'sam', text: 'Ines, what about onboarding?' },
  { id: 'ri1', t: 73.4, d: 3.3, who: 'ines', real: true, text: 'Both versions now have two screens each.' },
  { id: 's04', t: 76.9, d: 2.01, who: 'sam', text: 'Version B. Ship it.' },
  { id: 'n08', t: 81.95, d: 2.53, who: 'narrator', text: 'Then they get back to work, and they help each other.' },
  { id: 'n09', t: 87.15, d: 2.22, who: 'narrator', text: 'Big steps still come to Sam first.' },
  { id: 's05', t: 89.65, d: 1.0, who: 'sam', text: 'Approve.' },
  { id: 'n10', t: 92.95, d: 4.64, who: 'narrator', text: 'Every hour, task and dollar is on the record in Databricks, so Sam can just ask.' },
  { id: 'n11', t: 106.95, d: 4.81, who: 'narrator', text: 'Deskmates. Your AI team, with a desk, a face, and a seat at the table.' },
];
const speaking = (t: number, who: string) => LINES.some((l) => l.who === who && t >= l.t + 0.05 && t <= l.t + l.d - 0.1);

// ---------- world (four desks) ----------
const DW = 1600, DH = 1000, GAP = 80;
const deskXY = (k: Key) => { const i = ORDER.indexOf(k); return { x: (i % 2) * (DW + GAP), y: Math.floor(i / 2) * (DH + GAP) }; };
const FULL = { cx: 1640, cy: 1040, z: 0.48 };
const deskCam = (k: Key, z = 1.05, dx = 0, dy = 0) => { const p = deskXY(k); return { cx: p.x + DW / 2 + dx, cy: p.y + DH / 2 + dy, z }; };
type Cam = { cx: number; cy: number; z: number };
const KEYS: Array<[number, Cam]> = [
  [24.0, { cx: 1640, cy: 1040, z: 0.9 }],
  [27.4, FULL],
  [30.1, FULL],
  [31.0, deskCam('maya')],
  [32.1, deskCam('maya')],
  [32.9, deskCam('priya')],
  [33.8, deskCam('priya')],
  [34.6, deskCam('jonas')],
  [35.5, deskCam('jonas')],
  [36.3, deskCam('ines')],
  [37.3, deskCam('ines')],
  [38.4, FULL],
  [41.0, FULL],
  [41.9, deskCam('maya', 1.05)],
  [48.3, deskCam('maya', 1.05)],
  [49.3, FULL],
  [90.0, FULL],
  [106.75, FULL],
  [109.75, { cx: 1640, cy: 1040, z: 0.4 }],
];
function camera(t: number): Cam {
  if (t <= KEYS[0][0]) return KEYS[0][1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [ta, a] = KEYS[i], [tb, b] = KEYS[i + 1];
    if (t >= ta && t <= tb) {
      const p = (ta === 24.0 ? outCubic : ease)((t - ta) / (tb - ta));
      const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      const dip = dist > 600 && a.z > 0.8 && b.z > 0.8 ? 1 - 0.3 * Math.sin(Math.PI * p) : 1;
      return { cx: lerp(a.cx, b.cx, p), cy: lerp(a.cy, b.cy, p), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), p)) * dip };
    }
  }
  return KEYS[KEYS.length - 1][1];
}
type Rect = { x: number; y: number; w: number; h: number };
const toScreen = (r: Rect, c: Cam): Rect => ({ x: 960 + (r.x - c.cx) * c.z, y: 540 + (r.y - c.cy) * c.z, w: r.w * c.z, h: r.h * c.z });
const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) });

// windows on each desk (desk-local coords) and where the intro windows land
const DESK_WIN: Record<string, { k: Key; r: Rect; land: number }> = {
  editor: { k: 'maya', r: { x: 70, y: 100, w: 860, h: 540 }, land: 25.3 },
  term: { k: 'maya', r: { x: 640, y: 430, w: 880, h: 500 }, land: 25.5 },
  notes: { k: 'priya', r: { x: 120, y: 110, w: 980, h: 760 }, land: 25.7 },
  browser: { k: 'jonas', r: { x: 90, y: 100, w: 1120, h: 720 }, land: 25.9 },
  design: { k: 'ines', r: { x: 160, y: 100, w: 1060, h: 820 }, land: 26.1 },
};
const FACE_LOCAL: Rect = { x: 1251, y: 42, w: 310, h: 402 }; // the app's face card in a desk tile, measured
// The agents' real windows: crop in the landing frame (px) and where that window sits on its desk (desk units).
const REAL_WIN: Record<string, { k: Key; crop: Rect; land: Rect; at: number }> = {
  term: { k: 'maya', crop: { x: 156, y: 96, w: 680, h: 422 }, land: { x: 3, y: 39, w: 1030, h: 640 }, at: 25.3 },
  jonas: { k: 'jonas', crop: { x: 154, y: 890, w: 1056, h: 535 }, land: { x: 0, y: 30, w: 1600, h: 810 }, at: 25.5 },
  priya: { k: 'priya', crop: { x: 1350, y: 92, w: 1056, h: 533 }, land: { x: 0, y: 33, w: 1600, h: 807 }, at: 25.7 },
  ines: { k: 'ines', crop: { x: 1350, y: 890, w: 1056, h: 535 }, land: { x: 0, y: 30, w: 1600, h: 810 }, at: 25.9 },
};
const CropWin: React.FC<{ id: string; w: number; h: number }> = ({ id, w, h }) => {
  const c = REAL_WIN[id].crop; const sc = w / c.w;
  return (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', borderRadius: Math.max(4, 8 * sc), boxShadow: '0 24px 60px rgba(10,10,30,0.38), 0 0 0 1px rgba(0,0,0,0.15)', background: '#222' }}>
      <Img src={staticFile('img/desks-land.png')} style={{ position: 'absolute', left: -c.x * sc, top: -c.y * sc, width: 2560 * sc, height: 1600 * sc, maxWidth: 'none' }} />
    </div>
  );
};
const faceWorld = (k: Key): Rect => { const p = deskXY(k); return { x: p.x + FACE_LOCAL.x, y: p.y + FACE_LOCAL.y, w: FACE_LOCAL.w, h: FACE_LOCAL.h }; };
const FACE_POP: Record<Key, number> = { maya: 39.55, priya: 39.75, jonas: 39.95, ines: 40.15 };

// ---------- intro (Sam's Mac, screen space) ----------
type IW = { id: string; owner: Key | null; r: Rect; t: number; title: string };
const INTRO: IW[] = [
  { id: 'term', owner: 'maya', r: { x: 100, y: 110, w: 720, h: 447 }, t: 0.7, title: 'Terminal' },
  { id: 'jonas', owner: 'jonas', r: { x: 960, y: 96, w: 860, h: 436 }, t: 1.4, title: 'Competitor pricing' },
  { id: 'priya', owner: 'priya', r: { x: 250, y: 470, w: 860, h: 434 }, t: 2.1, title: 'Launch post' },
  { id: 'ines', owner: 'ines', r: { x: 1000, y: 470, w: 860, h: 436 }, t: 2.8, title: 'Onboarding' },
  { id: 'chat', owner: null, r: { x: 70, y: 360, w: 420, h: 330 }, t: 3.5, title: 'agent chat' },
  { id: 'zsh4', owner: null, r: { x: 760, y: 650, w: 560, h: 330 }, t: 4.2, title: 'zsh (4)' },
];

const Box: React.FC<{ r: Rect; style?: React.CSSProperties; children?: React.ReactNode }> = ({ r, style, children }) => (
  <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, ...style }}>{children}</div>
);

// ---------- window chrome + contents ----------
const Win: React.FC<{ w: number; h: number; title: string; mac?: boolean; dark?: boolean; children?: React.ReactNode; glow?: string }> = ({ w, h, title, mac, dark, children, glow }) => (
  <div style={{ width: w, height: h, borderRadius: mac ? 12 : 8, overflow: 'hidden', background: dark ? '#1c1d22' : '#fbfbfc', boxShadow: `0 24px 60px rgba(10,10,30,0.35), 0 0 0 1px rgba(0,0,0,0.12)${glow ? `, 0 0 0 6px ${glow}` : ''}`, display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
    <div style={{ height: 34, flex: '0 0 34px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8, background: dark ? '#2a2b31' : '#ececef', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
      {mac ? (
        <>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: '#ff5f57' }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: '#febc2e' }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: '#28c840' }} />
        </>
      ) : null}
      <div style={{ flex: 1, textAlign: 'center', fontSize: 14, color: dark ? '#aeb0b8' : '#55565c', fontWeight: 500 }}>{title}</div>
      {!mac ? <div style={{ fontSize: 14, color: dark ? '#aeb0b8' : '#55565c' }}>— ▢ ✕</div> : null}
    </div>
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
  </div>
);

const CODE = [
  ['export function checkoutTotal(cart, code) {', '#c792ea'],
  ['  const subtotal = sum(cart.items);', '#d6deeb'],
  ['  const taxed = subtotal * (1 + cart.taxRate);', '#d6deeb'],
  ['  // bug: discount was applied after tax', '#637777'],
  ['  const discounted = applyDiscount(subtotal, code);', '#addb67'],
  ['  return round(discounted * (1 + cart.taxRate));', '#d6deeb'],
  ['}', '#c792ea'],
  ['', ''],
  ['export const RATES = { WELCOME10: 0.1, SPRING: 0.15 };', '#82aaff'],
];
const Code: React.FC<{ t: number }> = ({ t }) => (
  <div style={{ position: 'absolute', inset: 0, background: '#011627', padding: '18px 22px', fontFamily: MONO, fontSize: 17, lineHeight: '29px' }}>
    {CODE.map(([s, c], i) => (
      <div key={i} style={{ color: c, whiteSpace: 'pre', opacity: i === 4 ? 0.6 + 0.4 * Math.sin(t * 3) ** 2 : 1, background: i === 4 ? 'rgba(173,219,103,0.08)' : undefined }}>
        <span style={{ color: '#4b6479', marginRight: 18 }}>{String(i + 1).padStart(2, ' ')}</span>
        {s}
      </div>
    ))}
  </div>
);

function termLines(t: number): Array<[string, string]> {
  const L: Array<[string, string]> = [['~/work/shop $ npm test', '#e6e6e6']];
  const run = ['  checkout › totals', '  checkout › tax', '  checkout › discount before tax', '  cart › rounding', '  api › orders'];
  const n = Math.max(0, Math.min(run.length, Math.floor((t % 9) * 1.2)));
  if (t < 41) {
    for (let i = 0; i < n; i++) L.push([`  ✓${run[i].slice(1)}`, '#7ee787']);
    L.push(['  ⠋ running 48 tests…', '#9da3ad']);
  } else {
    for (const r of run) L.push([`  ✓${r.slice(1)}`, '#7ee787']);
    L.push(['', '']);
    L.push(['  48 passing (1.9s)', '#7ee787']);
    L.push(['~/work/shop $ git commit -m "Apply discount before tax"', '#e6e6e6']);
    L.push(['[fix/checkout-discount 3f2a91c] 2 files changed', '#9da3ad']);
    if (t > 90.6) {
      L.push(['~/work/shop $ git push origin fix/checkout-discount', '#e6e6e6']);
      if (t > 91.3) L.push(['To staging:shop.git', '#9da3ad']);
      if (t > 91.7) L.push([' * [new branch]  fix/checkout-discount', '#9da3ad']);
      if (t > 92.1) L.push(['  ✓ pushed, ready for review', '#7ee787']);
    }
  }
  return L;
}
const Term: React.FC<{ t: number; big?: boolean }> = ({ t, big }) => {
  const L = termLines(t);
  const show = L.slice(-14);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#15161b', padding: '16px 20px', fontFamily: MONO, fontSize: big ? 20 : 17, lineHeight: big ? '32px' : '28px' }}>
      {show.map(([s, c], i) => (
        <div key={i} style={{ color: c, whiteSpace: 'pre', fontWeight: s.includes('48 passing') || s.includes('pushed') ? 700 : 400 }}>{s}</div>
      ))}
      <span style={{ display: 'inline-block', width: 10, height: 20, background: '#e6e6e6', opacity: Math.floor(t * 2) % 2 ? 1 : 0 }} />
    </div>
  );
};

const BARS = [
  { n: 'Us', v: 12, c: '#5B8CFF', cut: false },
  { n: 'Ledgerly', v: 9, c: '#9aa0ad', cut: true },
  { n: 'Tallybook', v: 14, c: '#9aa0ad', cut: true },
  { n: 'Billfox', v: 16, c: '#9aa0ad', cut: false },
];
const Chart: React.FC<{ t: number; grow: number; tags: number }> = ({ t, grow, tags }) => (
  <div style={{ position: 'absolute', inset: 0, background: '#fff', padding: '26px 34px', fontFamily: FONT }}>
    <div style={{ height: 30, borderRadius: 15, background: '#f0f1f4', marginBottom: 22, fontSize: 14, color: '#777', display: 'flex', alignItems: 'center', paddingLeft: 16 }}>jonas/research/pricing.html</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: '#1d1e22' }}>Competitor pricing</div>
    <div style={{ fontSize: 15, color: '#777', marginBottom: 26 }}>Starter plan, per month · sources in notes</div>
    {BARS.map((b, i) => {
      const p = tw(grow, i * 0.15, 0.6 + i * 0.15, 0, 1, out);
      return (
        <div key={b.n} style={{ display: 'flex', alignItems: 'center', marginBottom: 18, gap: 14 }}>
          <div style={{ width: 110, fontSize: 17, color: '#333', fontWeight: b.n === 'Us' ? 700 : 500 }}>{b.n}</div>
          <div style={{ height: 34, width: `${(b.v / 18) * 62 * p}%`, background: b.c, borderRadius: 6 }} />
          <div style={{ fontSize: 17, color: '#333', opacity: p }}>${b.v}</div>
          {b.cut ? (
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: '#fff', background: '#EE5A9C', padding: '4px 10px', borderRadius: 999, transform: `scale(${tw(tags, i * 0.2, i * 0.2 + 0.4, 0, 1, back)})` }}>PRICE CUT</div>
          ) : null}
        </div>
      );
    })}
  </div>
);

const NOTES = ['# The new checkout is here', '', 'Paying for Tally now takes one step,', 'and discount codes just work.', '', 'Cheaper than Tallybook, simpler than Billfox.', '— numbers from Jonas'];
const Notes: React.FC<{ t: number; chars: number }> = ({ chars }) => {
  let left = chars;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fffdf6', padding: '28px 34px', fontFamily: FONT, fontSize: 22, lineHeight: '36px', color: '#2a2a2a' }}>
      {NOTES.map((s, i) => {
        const shown = s.slice(0, Math.max(0, left));
        left -= s.length + 1;
        return <div key={i} style={{ fontWeight: i === 0 ? 800 : 400, fontSize: i === 0 ? 30 : 22, color: i === NOTES.length - 1 ? '#EE5A9C' : undefined, minHeight: 36 }}>{shown}</div>;
      })}
    </div>
  );
};

const Phone: React.FC<{ v: 'A' | 'B'; ship: number; scale?: number }> = ({ v, ship }) => (
  <div style={{ position: 'relative', width: 250, height: 500, borderRadius: 38, background: '#111', padding: 10, boxShadow: ship > 0 ? `0 0 0 ${8 * ship}px #2FCB8B` : '0 10px 30px rgba(0,0,0,0.25)' }}>
    <div style={{ width: '100%', height: '100%', borderRadius: 30, overflow: 'hidden', background: v === 'A' ? '#f6f3ff' : '#0f1222', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 22, gap: 14 }}>
      <div style={{ width: 150, height: 150, borderRadius: v === 'A' ? 24 : 75, marginTop: 30, background: v === 'A' ? 'linear-gradient(135deg,#8b7bff,#ff8fb6)' : 'linear-gradient(135deg,#2FCB8B,#5B8CFF)' }} />
      <div style={{ width: 170, height: 18, borderRadius: 9, background: v === 'A' ? '#2d2a40' : '#fff', marginTop: 18 }} />
      <div style={{ width: 130, height: 10, borderRadius: 5, background: v === 'A' ? '#b9b4cf' : '#59607a' }} />
      <div style={{ width: 150, height: 10, borderRadius: 5, background: v === 'A' ? '#b9b4cf' : '#59607a' }} />
      <div style={{ marginTop: 'auto', width: 190, height: 46, borderRadius: 23, background: v === 'A' ? '#6c5cff' : '#2FCB8B', color: '#fff', fontFamily: FONT, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>Get started</div>
    </div>
    {ship > 0 ? (
      <div style={{ position: 'absolute', top: -24, right: -30, background: '#2FCB8B', color: '#fff', fontFamily: FONT, fontWeight: 800, fontSize: 20, padding: '8px 16px', borderRadius: 999, transform: `scale(${ship}) rotate(6deg)`, boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }}>✓ Ship it</div>
    ) : null}
  </div>
);
const Design: React.FC<{ t: number; ship: number }> = ({ ship }) => (
  <div style={{ position: 'absolute', inset: 0, background: '#eef0f4', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 90, fontFamily: FONT }}>
    {(['A', 'B'] as const).map((v) => (
      <div key={v} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <Phone v={v} ship={v === 'B' ? ship : 0} />
        <div style={{ fontSize: 22, fontWeight: 700, color: '#333' }}>Version {v}</div>
      </div>
    ))}
  </div>
);

const Logs: React.FC<{ t: number; fast?: boolean; size?: number }> = ({ t, fast, size = 15 }) => {
  const who: Array<[string, string]> = [['maya', '#5B8CFF'], ['priya', '#FF9F43'], ['jonas', '#EE5A9C'], ['ines', '#2FCB8B']];
  const REAL: Array<[number, string]> = [[0, 'Ran a command'], [2, 'Read shopify.com'], [2, 'Read wix.com'], [2, 'Read squarespace.com'], [1, 'Messaged Jonas'], [2, 'Priya asked something'], [1, 'Ran a command'], [3, 'Saved index.html'], [3, 'Opened file'], [0, 'Opened Xfce4 terminal'], [3, 'Ran a command'], [2, 'Searched the web'], [2, 'Messaged Priya'], [1, 'Jonas replied'], [2, 'Read bigcommerce.co.uk'], [2, 'Ran a command'], [2, 'Opened file'], [1, 'Saved launch_post.md'], [1, "Couldn't open file"], [1, 'Saved launch_post.html']];
  const off = Math.floor(t * (fast ? 40 : 6));
  const rows = Math.floor(900 / (size * 1.6));
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0e0f13', padding: '10px 16px', fontFamily: MONO, fontSize: size, lineHeight: `${size * 1.6}px`, overflow: 'hidden' }}>
      {Array.from({ length: rows }).map((_, i) => {
        const n = off + i;
        const [wi, line] = REAL[(n * 7) % REAL.length];
        const [w, c] = who[wi];
        return (
          <div key={i} style={{ whiteSpace: 'pre', color: '#9ea3ad' }}>
            <span style={{ color: '#555' }}>{String(9000 + n).padStart(5, '0')} </span>
            <span style={{ color: c }}>[{w}]</span> {line}
          </div>
        );
      })}
    </div>
  );
};

const Chat: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#fff', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT, fontSize: 15 }}>
    {['agent-2: which repo?', 'agent-1: rate limited, retrying', 'agent-3: need design tokens', 'agent-4: is this the right file?', 'agent-2: waiting for input'].map((s, i) => (
      <div key={i} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', background: i % 2 ? '#e9eefc' : '#f1f1f3', borderRadius: 12, padding: '8px 12px', color: '#333' }}>{s}</div>
    ))}
  </div>
);

function content(id: string, t: number) {
  switch (id) {
    case 'editor': return <Code t={t} />;
    case 'term': return <Term t={t} />;
    case 'browser': return <Chart t={t} grow={t < 24 ? tw(t, 8, 11) : tw(t, 33.6, 35.0)} tags={t < 24 ? 0 : tw(t, 34.4, 35.4)} />;
    case 'notes': return <Notes t={t} chars={t < 24 ? Math.floor((t - 2.8) * 14) : 60 + Math.floor((t - 26) * 10)} />;
    case 'design': return <Design t={t} ship={0} />;
    case 'chat': return <Chat />;
    case 'zsh4': return <Logs t={t} />;
    default: return null;
  }
}
const TITLES: Record<string, string> = { editor: 'checkout.ts — Code', term: 'Terminal', notes: 'launch-post.md — Text Editor', browser: 'Competitor pricing — Firefox', design: 'Onboarding — Firefox' };

// ---------- a desk (world space) ----------
const Face: React.FC<{ k: Key; w: number; h: number; t: number; ring?: boolean; card?: number }> = ({ k, w, h, t, ring, card = 0 }) => {
  const sp = ring ?? speaking(t, k);
  const bw = Math.max(2, Math.min(w, h) * 0.022);
  const photoH = lerp(h, h * 0.72, card);
  return (
    <div style={{ width: w, height: h, borderRadius: Math.min(w, h) * 0.07, overflow: 'hidden', position: 'relative', boxShadow: `0 18px 40px rgba(0,0,0,0.35), inset 0 0 0 ${bw}px ${sp ? '#3ddc84' : P[k].color}`, background: `color-mix(in srgb, ${P[k].color} 28%, #17171b)` }}>
      <Img src={staticFile(P[k].img)} style={{ position: 'absolute', left: bw * card * 2, top: bw * card * 2, width: w - bw * card * 4, height: photoH - bw * card * 2, borderRadius: Math.min(w, h) * 0.05 * card, objectFit: 'cover', objectPosition: '50% 35%' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: photoH, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: '#fff', fontSize: h * 0.085, fontWeight: 600, opacity: card }}>{P[k].name}</div>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', boxShadow: `inset 0 0 0 ${bw}px ${sp ? '#3ddc84' : P[k].color}` }} />
    </div>
  );
};

const DeskBody: React.FC<{ k: Key; t: number; inMeeting?: boolean }> = ({ k, t, inMeeting }) => {
  const p = P[k];
  const wins = Object.entries(DESK_WIN).filter(([, v]) => v.k === k);
  return (
    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 120% at 15% 10%, ${p.wall[0]}, ${p.wall[1]})` }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 36, background: 'rgba(20,22,28,0.82)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 18, fontFamily: FONT, color: '#e8e8ea', fontSize: 15 }}>
        <span style={{ fontWeight: 700 }}>Applications</span>
        <span style={{ opacity: 0.6 }}>{p.full}'s desktop · Linux</span>
        <span style={{ marginLeft: 'auto', opacity: 0.8 }}>09:41</span>
      </div>
      {wins.map(([id, v]) => {
        const shown = inMeeting || t >= v.land;
        const ship = k === 'ines' ? tw(t, 76.5, 77.0, 0, 1, back) : 0;
        return (
          <Box key={id} r={v.r} style={{ opacity: shown ? 1 : 0 }}>
            <Win w={v.r.w} h={v.r.h} title={TITLES[id]} dark={id === 'term' || id === 'editor'}>
              {id === 'design' ? <Design t={t} ship={ship} /> : id === 'browser' ? <Chart t={t} grow={inMeeting ? tw(t, 64.6, 66.4) : tw(t, 33.6, 35.0)} tags={inMeeting ? tw(t, 67.0, 68.2) : tw(t, 34.4, 35.4)} /> : id === 'term' ? <Term t={t} big /> : content(id, t)}
            </Win>
          </Box>
        );
      })}
    </div>
  );
};

const Desk: React.FC<{ k: Key; t: number; faceHidden: boolean }> = ({ k, t, faceHidden }) => {
  const pos = deskXY(k);
  const fp = tw(t, FACE_POP[k], FACE_POP[k] + 0.45, 0, 1, back);
  const big = k === 'maya' ? tw(t, 41.6, 42.3) * (1 - tw(t, 45.6, 46.4)) : 0;
  const deskClip = clipOf(`desk.${k}`);
  const callClip = k === 'maya' ? clipOf('call.maya') : null;
  const fr = { x: FACE_LOCAL.x - 120 * big, y: FACE_LOCAL.y, w: FACE_LOCAL.w + 120 * big, h: FACE_LOCAL.h + 136 * big };
  return (
    <div style={{ position: 'absolute', left: pos.x, top: pos.y, width: DW, height: DH, borderRadius: 28, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,0.45)' }}>
      {deskClip ? <ClipVideo c={deskClip} slotStart={24.0} /> : <DeskBody k={k} t={t} />}
      {false && callClip && t >= 41.2 && t <= 48.6 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: tw(t, 41.2, 41.8) * (1 - tw(t, 47.9, 48.5)) }}>
          <ClipVideo c={callClip} slotStart={41.9} />
        </div>
      ) : null}
      {!faceHidden && !deskClip?.appFaces && t >= FACE_POP[k] ? (
        <Box r={fr} style={{ transform: `scale(${fp})`, transformOrigin: '80% 20%' }}>
          <Face k={k} w={fr.w} h={fr.h} t={t} />
        </Box>
      ) : null}
      {deskClip?.appLabels ? null : <div style={{ position: 'absolute', left: 40, bottom: 40, display: 'flex', alignItems: 'center', gap: 18, background: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '18px 36px 18px 26px', fontFamily: FONT, fontSize: 54, fontWeight: 700, color: '#17181c', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <div style={{ width: 26, height: 26, borderRadius: 13, background: P[k].color }} />
        Desk {P[k].desk} · {P[k].name}
      </div>}
    </div>
  );
};

// ---------- meeting (screen space) ----------
const GRID: Rect[] = [{ x: 363, y: 36, w: 567, h: 426 }, { x: 990, y: 36, w: 567, h: 426 }, { x: 363, y: 522, w: 567, h: 426 }, { x: 990, y: 522, w: 567, h: 426 }];
const STRIP: Rect[] = [{ x: 1440, y: 61.5, w: 213, h: 421.5 }, { x: 1671, y: 61.5, w: 213, h: 421.5 }, { x: 1440, y: 501, w: 213, h: 421.5 }, { x: 1671, y: 501, w: 213, h: 421.5 }];
const MAIN: Rect = { x: 60, y: 96, w: 1472, h: 920 };
const M_IN = 51.25, M_OUT = 79.5;
const SPOT_IN = 58.7;
function spotWho(t: number): Key | null {
  if (t < SPOT_IN) return null;
  if (t < 64.6) return 'maya';
  if (t < 71.0) return 'jonas';
  return 'ines';
}

// Edit list over the real standup take (take times from the recording's own audio).
const XF = 0.3; // seconds of crossfade between takes
const MEET_SEGS: Array<{ at: number; from: number; dur: number; xf?: boolean }> = [
  { at: 51.25, from: 22.1, dur: 2.05 },             // grid, quiet: Sam "Okay team, standup!"
  { at: 53.3, from: 24.15, dur: 7.65 },             // grid, Maya's update (contiguous)
  { at: 60.95, from: 31.8, dur: 1.2 },              // the app's own switch to Maya's desktop (contiguous)
  { at: 62.15, from: 43.0, dur: 2.2, xf: true },    // Maya's desktop -> the app's switch to Jonas (matching frames)
  { at: 64.35, from: 48.25, dur: 4.05, xf: true },  // Jonas's desktop, Jonas speaks (matching frames)
  { at: 68.4, from: 52.3, dur: 3.7 },               // the app's switch from Jonas to Ines (contiguous)
  { at: 72.1, from: 72.1, dur: 1.25, xf: true },    // Ines's desktop (matching frames)
  { at: 73.35, from: 73.35, dur: 3.35 },            // Ines speaks (contiguous)
  { at: 76.7, from: 79.2, dur: 3.0, xf: true },     // Ines's desktop, quiet: Sam "Version B. Ship it." (matching frames)
];
const MEET_AUDIO: Array<{ at: number; from: number; dur: number }> = [
  { at: 53.3, from: 24.15, dur: 7.6 },   // Maya
  { at: 64.35, from: 48.25, dur: 4.05 }, // Jonas, to "...pricing.html"
  { at: 73.35, from: 73.35, dur: 3.35 }, // Ines, to "...two screens each"
];
const Meeting: React.FC<{ t: number }> = ({ t }) => {
  if (t < M_IN - 0.35 || t > M_OUT + 1.65) return null;
  const bg = tw(t, M_IN - 0.3, M_IN + 0.15) * (1 - tw(t, M_OUT + 1.05, M_OUT + 1.6));
  const recO = tw(t, M_IN + 1.9, M_IN + 2.3) * (1 - tw(t, M_OUT - 0.05, M_OUT + 0.3));
  const sp = tw(t, SPOT_IN, SPOT_IN + 0.8);
  const who = spotWho(t);
  const secs = Math.max(0, Math.floor(t - M_IN));
  const cam = camera(t);
  const mc = clipOf('meeting');
  const faceHold = mc ? 1 - tw(t, M_IN + 1.95, M_IN + 2.35) * (1 - tw(t, M_OUT - 0.35, M_OUT + 0.05)) : 1; // recorded tiles take over once the faces have landed
  return (
    <AbsoluteFill>
      {mc ? (
        <AbsoluteFill style={{ opacity: bg }}>
          <AbsoluteFill style={{ background: '#1b1b1d' }} />
          <AbsoluteFill style={{ opacity: recO }}>
          {MEET_SEGS.map((g, i) => {
            const pre = g.xf ? XF : 0;
            const o = g.xf ? tw(t, g.at - XF, g.at, 0, 1, ease) : 1;
            return (
              <Sequence key={i} from={Math.round((g.at - pre) * FPS)} durationInFrames={Math.round((g.dur + pre + (MEET_SEGS[i + 1]?.xf ? XF : 0) + 1 / FPS) * FPS)} layout="none">
                <OffthreadVideo src={staticFile(mc.src)} trimBefore={Math.round((g.from - pre) * FPS)} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: o }} />
              </Sequence>
            );
          })}
          {MEET_AUDIO.map((g, i) => (
            <Sequence key={`a${i}`} from={Math.round(g.at * FPS)} durationInFrames={Math.round(g.dur * FPS)} layout="none">
              <Audio src={staticFile(mc.src)} trimBefore={Math.round(g.from * FPS)} volume={(f) => Math.min(1, f / 2, (g.dur * FPS - f) / 3)} />
            </Sequence>
          ))}
          </AbsoluteFill>
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ background: '#151517', opacity: mc ? 0 : bg, display: mc ? 'none' : undefined }}>
        <div style={{ position: 'absolute', top: 30, width: '100%', textAlign: 'center', fontFamily: FONT, fontSize: 24, color: '#eee', fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: '#ff453a', marginRight: 12, opacity: 0.6 + 0.4 * Math.sin(t * 4) }} />
          Monday standup <span style={{ color: '#8a8a90', fontWeight: 400 }}> · Maya, Priya, Jonas and Ines · 0:{String(secs).padStart(2, '0')}</span>
        </div>
        {/* main shared desktop */}
        {who ? (
          <Box r={MAIN} style={{ opacity: sp, transform: `scale(${0.94 + 0.06 * sp})`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
            {ORDER.filter((k) => k === 'maya' || k === 'jonas' || k === 'ines').map((k) => {
              const ranges: Record<string, [number, number]> = { maya: [SPOT_IN, 64.6], jonas: [64.6, 71.0], ines: [71.0, 99] };
              const [a, b] = ranges[k];
              const vis = tw(t, a, a + 0.6) * (1 - tw(t, b, b + 0.6));
              const slide = (1 - tw(t, a, a + 0.6, 0, 1, out)) * 80;
              if (vis <= 0) return null;
              return (
                <div key={k} style={{ position: 'absolute', inset: 0, opacity: vis, transform: `translateX(${slide}px)` }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: DW, height: DH, transform: `scale(${MAIN.w / DW})`, transformOrigin: '0 0' }}>
                    <DeskBody k={k} t={t} inMeeting />
                  </div>
                  <div style={{ position: 'absolute', left: 22, top: 56, background: P[k].color, color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 20, padding: '8px 18px', borderRadius: 999 }}>{P[k].name} is sharing Desk {P[k].desk}</div>
                </div>
              );
            })}
          </Box>
        ) : null}
        {/* control pill */}
        <div style={{ position: 'absolute', bottom: 34, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 16, background: '#25252a', borderRadius: 999, padding: '12px 18px', alignItems: 'center' }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 52, height: 52, borderRadius: 26, background: '#38383e' }} />)}
          <div style={{ width: 120, height: 52, borderRadius: 26, background: '#d9534f', color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>End</div>
        </div>
      </AbsoluteFill>
      {/* faces: fly in from desks, grid, strip, fly back */}
      {ORDER.map((k, i) => {
        const deskR = toScreen(faceWorld(k), cam);
        const fin = tw(t, M_IN + 0.25 + i * 0.13, M_IN + 1.45 + i * 0.13, 0, 1, ease);
        const fout = tw(t, M_OUT - 0.1 + i * 0.1, M_OUT + 1.2 + i * 0.1, 0, 1, ease);
        const inMeeting = lerpRect(GRID[i], STRIP[i], sp);
        let r = lerpRect(deskR, inMeeting, fin);
        r = lerpRect(r, deskR, fout);
        const lift = Math.sin(Math.PI * fin) * (1 - fout) * 60 + Math.sin(Math.PI * fout) * 60;
        const rot = Math.sin(Math.PI * fin) * (i % 2 ? 6 : -6) * (1 - fout) + Math.sin(Math.PI * fout) * (i % 2 ? -6 : 6);
        return (
          <Box key={k} r={{ ...r, y: r.y - lift }} style={{ transform: `rotate(${rot}deg)`, opacity: faceHold }}>
            <Face k={k} w={r.w} h={r.h} t={t} card={Math.max(1 - fin, fout)} />
          </Box>
        );
      })}
    </AbsoluteFill>
  );
};
const meetingOwnsFaces = (t: number) => t >= M_IN + 0.2 && t <= M_OUT + 1.6;

// ---------- intro scene ----------
const MENU_ROWS = ['Maya Chen    Working', 'Priya Raman    Working', 'Jonas Weber    Working', 'Ines Moreau    Working', '---', 'Show desks', 'Summon meeting…', 'Hire…'];
function cursorAt(t: number): { x: number; y: number } {
  const pts: Array<[number, number, number]> = [[19.6, 1180, 760], [21.3, 1563, 16], [21.9, 1563, 16], [22.9, 1640, 213], [24.2, 1640, 213]];
  if (t <= pts[0][0]) return { x: pts[0][1], y: pts[0][2] };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ta, xa, ya] = pts[i], [tb, xb, yb] = pts[i + 1];
    if (t <= tb) { const p = ease((t - ta) / (tb - ta)); return { x: lerp(xa, xb, p), y: lerp(ya, yb, p) - Math.sin(Math.PI * p) * 40 }; }
  }
  return { x: pts[pts.length - 1][1], y: pts[pts.length - 1][2] };
}
const Cursor: React.FC<{ x: number; y: number; press: number }> = ({ x, y, press }) => (
  <svg style={{ position: 'absolute', left: x - 4, top: y - 2, transform: `scale(${1 - 0.15 * press})`, transformOrigin: '4px 2px', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.35))' }} width="34" height="40" viewBox="0 0 34 40">
    <path d="M4 2 L4 32 L12 25 L17 37 L22 35 L17 23 L28 23 Z" fill="#111" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
  </svg>
);

const Intro: React.FC<{ t: number }> = ({ t }) => {
  if (t > 27.6) return null;
  const s = (t < 6 ? tw(t, 0, 6, 1.08, 1.0, out) : t < 14.2 ? 1 : t < 19.5 ? tw(t, 14.2, 19.3, 1.0, 1.1) : tw(t, 19.5, 21.2, 1.1, 1.0)) * (1 - 0.06 * tw(t, 23.7, 25.0, 0, 1, ease));
  const bgO = 1 - tw(t, 23.8, 24.9, 0, 1, ease);
  const fadeIn = tw(t, 0, 0.8);
  const jit = tw(t, 14.3, 14.8) * (1 - tw(t, 19.2, 19.6));
  const menuO = tw(t, 21.65, 21.8) * (1 - tw(t, 23.45, 23.6));
  const hover = t > 22.8;
  const press = (t > 21.55 && t < 21.75) || (t > 23.2 && t < 23.4) ? 1 : 0;
  const cur = cursorAt(t);
  const cam = camera(t);
  const introClip = clipOf('intro');
  return (
    <AbsoluteFill style={{ opacity: introClip ? 1 : fadeIn }}>
      {introClip ? (
        <AbsoluteFill style={{ opacity: bgO }}>
          <ClipVideo c={introClip} slotStart={0} fit="cover" />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: '50% 45%', display: introClip ? 'none' : undefined }}>
        <AbsoluteFill style={{ background: 'radial-gradient(130% 120% at 20% 10%, #7a4dff 0%, #c04bd9 45%, #ff7aa8 100%)', opacity: bgO }} />
        {INTRO.map((w) => {
          const pop = tw(t, w.t, w.t + 0.4, 0, 1, back);
          if (t < w.t) return null;
          const jx = jit * Math.sin(t * 29 + w.t * 9) * 1.4, jy = jit * Math.cos(t * 23 + w.t * 7) * 1.4;
          if (t >= 24.0) {
            if (!w.owner) {
              const g = 1 - tw(t, 24.0, 24.5);
              if (g <= 0) return null;
              return <Box key={w.id} r={w.r} style={{ transform: `scale(${g})`, opacity: g }}><Win w={w.r.w} h={w.r.h} title={w.title} mac dark={w.id === 'zsh4'}>{content(w.id, t)}</Win></Box>;
            }
            return null; // owner windows fly in the hero layer
          }
          return (
            <Box key={w.id} r={{ ...w.r, x: w.r.x + jx, y: w.r.y + jy }} style={{ transform: `scale(${0.85 + 0.15 * pop})`, opacity: pop }}>
              {w.owner ? <CropWin id={w.id} w={w.r.w} h={w.r.h} /> : <Win w={w.r.w} h={w.r.h} title={w.title} mac dark={w.id === 'zsh4'}>{content(w.id, t)}</Win>}
            </Box>
          );
        })}
        {/* agents.log */}
        {t > 14.2 && t < 20.2 ? (
          <Box r={{ x: 230, y: 80, w: 1460, h: 900 }} style={{ opacity: tw(t, 14.2, 14.55) * (1 - tw(t, 19.5, 20.1)), transform: `scale(${0.94 + 0.06 * tw(t, 14.2, 14.7, 0, 1, glide)})` }}>
            <Win w={1460} h={900} title="agents.log — 14,382 lines" mac dark>
              <Logs t={t} fast size={19} />
            </Win>
          </Box>
        ) : null}
        {/* menu bar */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 32, background: 'rgba(255,255,255,0.28)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 22, fontFamily: FONT, fontSize: 15, color: '#1b1b1f', opacity: bgO }}>
          <span style={{ fontWeight: 800 }}>●</span><span style={{ fontWeight: 700 }}>Finder</span><span>File</span><span>Edit</span><span>View</span><span>Go</span><span>Window</span><span>Help</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 30, height: 24, borderRadius: 6, background: menuO > 0 ? 'rgba(0,0,0,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Img src={staticFile('img/deskmates-mark.svg')} style={{ width: 18, height: 18 }} />
            </div>
            <span>Wi‑Fi</span><span>100%</span><span>Mon 9:41 AM</span>
          </div>
        </div>
        {/* menu */}
        {menuO > 0 ? (
          <div style={{ position: 'absolute', left: 1520, top: 34, width: 300, background: 'rgba(246,246,248,0.97)', borderRadius: 12, padding: 6, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', opacity: menuO, transform: `translateY(${(1 - menuO) * -6}px)`, fontFamily: FONT, fontSize: 15, color: '#1b1b1f' }}>
            <div style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#888' }}>DESKMATES</div>
            {MENU_ROWS.map((r, i) => (r === '---' ? <div key={i} style={{ height: 1, background: '#ddd', margin: '4px 8px' }} /> : (
              <div key={i} style={{ padding: '5px 12px', borderRadius: 6, background: r === 'Show desks' && hover ? '#3b82f6' : 'transparent', color: r === 'Show desks' && hover ? '#fff' : undefined, display: 'flex', justifyContent: 'space-between', fontWeight: r === 'Show desks' ? 600 : 400 }}>
                <span>{r.split('    ')[0]}</span>
                <span style={{ opacity: 0.55 }}>{r.split('    ')[1] ?? (r === 'Show desks' ? '⇧⌘D' : r.startsWith('Summon') ? '⇧⌘M' : r.startsWith('Hire') ? '⌘N' : '')}</span>
              </div>
            )))}
          </div>
        ) : null}
        {/* dock */}
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12, padding: 10, borderRadius: 22, background: 'rgba(255,255,255,0.3)', opacity: bgO }}>
          {['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#111827', '#ec4899'].map((c, i) => <div key={i} style={{ width: 54, height: 54, borderRadius: 13, background: `linear-gradient(160deg, ${c}, ${c}aa)` }} />)}
        </div>
      </AbsoluteFill>
      {/* hero: owner windows fly to their desks */}
      {t >= 24.0 ? INTRO.filter((w) => w.owner).map((w, i) => {
        const rw = REAL_WIN[w.id];
        const d = deskXY(rw.k);
        const target = toScreen({ x: d.x + rw.land.x, y: d.y + rw.land.y, w: rw.land.w, h: rw.land.h }, cam);
        const start = 24.05 + i * 0.2;
        const p = tw(t, start, rw.at + 0.25, 0, 1, glide);
        if (p >= 1) return null;
        const r = lerpRect(w.r, target, p);
        const rot = Math.sin(Math.PI * Math.min(1, p * 1.15)) * (i % 2 ? 4 : -4);
        return (
          <Box key={w.id} r={{ ...r, y: r.y - Math.sin(Math.PI * p) * 36 }} style={{ transform: `rotate(${rot}deg)` }}>
            <CropWin id={w.id} w={r.w} h={r.h} />
          </Box>
        );
      }) : null}
      {t < 24.4 && !introClip ? <Cursor x={cur.x} y={cur.y} press={press} /> : null}
    </AbsoluteFill>
  );
};

// ---------- the call opens out of Maya's face card and closes back into it ----------
const CALL_FACE = { x: 0.75, y: 0.10125, w: 0.23125, h: 0.6425 }; // the face tile in the call window, measured
const CALL_WIN: Rect = { x: 96, y: 0, w: 1728, h: 1080 };
const CallOverlay: React.FC<{ t: number }> = ({ t }) => {
  const c = clipOf('call.maya');
  if (!c || t < 41.8 || t > 48.7) return null;
  const card = toScreen(faceWorld('maya'), camera(t));
  const w0 = card.w / CALL_FACE.w, h0 = w0 / 1.6;
  const from: Rect = { x: card.x - CALL_FACE.x * w0, y: card.y + card.h / 2 - (CALL_FACE.y + CALL_FACE.h / 2) * h0, w: w0, h: h0 };
  const o = tw(t, 41.85, 42.2) * (1 - tw(t, 48.3, 48.6));
  const pOpen = tw(t, 41.9, 42.8, 0, 1, glide), pClose = tw(t, 47.95, 48.55, 0, 1, ease);
  const r = lerpRect(lerpRect(from, CALL_WIN, pOpen), from, pClose);
  const dim = 0.5 * tw(t, 41.9, 42.5) * (1 - tw(t, 47.95, 48.5));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(8,8,12,${dim})` }} />
      <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, opacity: o, borderRadius: 18 * (r.w / CALL_WIN.w), overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.5)', background: '#1b1b1d' }}>
        <ClipVideo c={c} slotStart={41.9} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '15%', background: '#1b1b1d' }} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- overlays after the meeting ----------
const Bubble: React.FC<{ from: Key; text: string; w?: number }> = ({ from, text, w = 470 }) => (
  <div style={{ width: w, display: 'flex', gap: 12, alignItems: 'flex-start', background: '#fff', borderRadius: 22, padding: '14px 18px', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', fontFamily: FONT }}>
    <Img src={staticFile(P[from].img)} style={{ width: 46, height: 46, borderRadius: 23, objectFit: 'cover', boxShadow: `0 0 0 3px ${P[from].color}` }} />
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: P[from].color }}>{P[from].full}</div>
      <div style={{ fontSize: 19, color: '#222', lineHeight: '26px' }}>{text}</div>
    </div>
  </div>
);
const Teamwork: React.FC<{ t: number }> = ({ t }) => {
  if (t < 82.2 || t > 86.6) return null;
  const cam = camera(t);
  const pc = toScreen({ x: deskXY('priya').x + 800, y: deskXY('priya').y + 420, w: 0, h: 0 }, cam);
  const jc = toScreen({ x: deskXY('jonas').x + 800, y: deskXY('jonas').y + 420, w: 0, h: 0 }, cam);
  const fly = (a: number, b: number, from: { x: number; y: number }, to: { x: number; y: number }, node: React.ReactNode, key: string) => {
    const p = tw(t, a, b, 0, 1, ease);
    const o = tw(t, a - 0.2, a + 0.1) * (1 - tw(t, b + 0.9, b + 1.2));
    const x = lerp(from.x, to.x, p) - 235, y = lerp(from.y, to.y, p) - 45 - Math.sin(Math.PI * p) * 140;
    return <div key={key} style={{ position: 'absolute', left: x, top: y, opacity: o, transform: `scale(${0.9 + 0.1 * Math.sin(Math.PI * p) + 0.1})` }}>{node}</div>;
  };
  return (
    <AbsoluteFill>
      {fly(82.4, 83.6, pc, jc, <Bubble from="priya" text="Could you send me one line on how competitors handle discount vs tax order?" />, 'a')}
      {fly(84.4, 85.4, jc, pc, <Bubble from="jonas" text="Shopify's help docs say discounts come off the subtotal before tax, so we match them." />, 'b')}
    </AbsoluteFill>
  );
};

const Approval: React.FC<{ t: number }> = ({ t }) => {
  if (t < 86.9 || t > 90.8) return null;
  const ac = clipOf('approve');
  if (ac) {
    const inP = tw(t, 86.9, 87.6, 0, 1, out), outP = tw(t, 90.1, 90.8, 0, 1, ease);
    const z = tw(t, 87.6, 88.6) * (1 - tw(t, 89.9, 90.4));
    return (
      <AbsoluteFill style={{ background: `rgba(10,10,14,${0.5 * inP * (1 - outP)})` }}>
        <div style={{ position: 'absolute', left: 200, top: 70, width: 1520, height: 950, transform: `translateY(${(1 - inP) * 900 + outP * 900}px)`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.5)' }}>
          <div style={{ width: '100%', height: '100%', transform: `scale(${1 + 0.9 * z})`, transformOrigin: '62% 66%' }}>
            <ClipVideo c={ac} slotStart={85.9} fit="cover" />
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  const inP = tw(t, 86.9, 87.5, 0, 1, back);
  const outP = tw(t, 90.2, 90.7);
  const done = t > 89.25;
  const press = t > 89.15 && t < 89.35 ? 1 : 0;
  const cx = lerp(1180, 1752, tw(t, 87.9, 89.0)), cy = lerp(860, 236, tw(t, 87.9, 89.0)) - Math.sin(Math.PI * tw(t, 87.9, 89.0)) * 30;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', right: 40, top: 40, width: 560, background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 30px 70px rgba(0,0,0,0.4)', fontFamily: FONT, transform: `translateY(${(1 - inP) * -180 - outP * 40}px)`, opacity: 1 - outP }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Img src={staticFile(P.maya.img)} style={{ width: 52, height: 52, borderRadius: 26, objectFit: 'cover', boxShadow: `0 0 0 3px ${P.maya.color}` }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#222' }}>Maya Chen <span style={{ color: '#d97706', fontWeight: 600 }}>· Needs you</span></div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#111' }}>Publish with git push</div>
          </div>
        </div>
        <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 16, background: '#f3f4f6', borderRadius: 10, padding: '10px 14px', color: '#333' }}>git push origin fix/checkout-discount</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
          {done ? (
            <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', padding: '10px 4px' }}>✓ Approved</div>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 600, padding: '10px 22px', borderRadius: 12, background: '#eee', color: '#333' }}>Deny</div>
              <div style={{ fontSize: 18, fontWeight: 700, padding: '10px 22px', borderRadius: 12, background: '#111', color: '#fff', transform: `scale(${1 - 0.06 * press})` }}>Approve</div>
            </>
          )}
        </div>
      </div>
      {t < 89.8 ? <Cursor x={cx} y={cy} press={press} /> : null}
    </AbsoluteFill>
  );
};

const Team: React.FC<{ t: number }> = ({ t }) => {
  if (t < 91.9 || t > 99.0) return null;
  const inP = tw(t, 91.9, 92.8, 0, 1, out);
  const outP = tw(t, 98.0, 98.8, 0, 1, ease);
  const zoom = tw(t, 95.7, 96.8) * (1 - tw(t, 97.8, 98.2));
  const s = 1 + 0.75 * zoom;
  return (
    <AbsoluteFill style={{ background: `rgba(10,10,14,${0.55 * inP * (1 - outP)})` }}>
      <div style={{ position: 'absolute', left: 200, top: 70, width: 1520, height: 950, transform: `translateY(${(1 - inP) * 900 + outP * 900}px)`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.5)' }}>
        <div style={{ width: '100%', height: '100%', transform: `scale(${s})`, transformOrigin: '30% 58%' }}>
          {clipOf('team') ? <ClipVideo c={clipOf('team')!} slotStart={91.9} fit="cover" /> : <Img src={staticFile('img/team.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ position: 'absolute', right: 24, top: 20, background: '#ff3621', color: '#fff', fontFamily: FONT, fontWeight: 700, fontSize: 18, padding: '8px 16px', borderRadius: 999, opacity: tw(t, 93.0, 93.4) }}>Synced with Databricks</div>
      </div>
    </AbsoluteFill>
  );
};

const PriyaNote: React.FC<{ t: number }> = ({ t }) => {
  if (t < 99.6 || t > 105.2) return null;
  const inP = tw(t, 99.75, 100.4, 0, 1, glide);
  const outP = tw(t, 104.3, 104.9, 0, 1, ease);
  return (
    <div style={{ position: 'absolute', right: 30, top: 30, width: 520, display: 'flex', gap: 14, alignItems: 'center', background: 'rgba(250,250,252,0.96)', borderRadius: 20, padding: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', transform: `translateX(${(1 - inP) * 140 + outP * 60}px) scale(${0.97 + 0.03 * inP})`, opacity: inP * (1 - outP), fontFamily: FONT }}>
      <div style={{ position: 'relative' }}>
        <Img src={staticFile(P.priya.img)} style={{ width: 64, height: 64, borderRadius: 32, objectFit: 'cover' }} />
        <Img src={staticFile('img/deskmates-mark.svg')} style={{ position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, background: '#fff', borderRadius: 7, padding: 2 }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#111' }}>Priya Raman</span>
          <span style={{ fontSize: 14, color: '#888' }}>now</span>
        </div>
        <div style={{ fontSize: 18, color: '#333', lineHeight: '25px' }}>The launch post is now a styled web page. Take a look?</div>
      </div>
    </div>
  );
};

const EndCard: React.FC<{ t: number }> = ({ t: tAbs }) => {
  const t = tAbs - 0.75;
  if (t < 107.6) return null;
  const o = tw(t, 107.6, 108.6);
  const tiles: Array<[string, number, number]> = [['#5B8CFF', 0, 0], ['#FF9F43', 1, 0], ['#EE5A9C', 0, 1], ['#2FCB8B', 1, 1]];
  const fade = 1 - tw(tAbs, 118.2, 119.8);
  return (
    <AbsoluteFill style={{ background: '#0d0e12', opacity: o }}>
      <AbsoluteFill style={{ opacity: fade, alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, marginTop: -120 }}>
          <div style={{ position: 'relative', width: 140, height: 140 }}>
            {tiles.map(([c, x, y], i) => {
              const p = tw(t, 108.2 + i * 0.14, 108.7 + i * 0.14, 0, 1, back);
              return <div key={i} style={{ position: 'absolute', left: x * 76, top: y * 76, width: 64, height: 64, borderRadius: 20, background: c, transform: `scale(${p}) rotate(${(1 - p) * 30}deg)` }} />;
            })}
          </div>
          <div style={{ fontSize: 130, fontWeight: 800, color: '#fff', letterSpacing: -4, opacity: tw(t, 108.8, 109.4), transform: `translateX(${(1 - tw(t, 108.8, 109.5, 0, 1, out)) * -30}px)` }}>Deskmates</div>
        </div>
        <div style={{ fontSize: 40, color: '#c9cad2', marginTop: 36, opacity: tw(t, 109.6, 110.2) }}>Your AI team, with a desk, a face, and a seat at the table.</div>
        <div style={{ display: 'flex', gap: 30, marginTop: 50 }}>
          {ORDER.map((k, i) => {
            const p = tw(t, 110.4 + i * 0.15, 110.9 + i * 0.15, 0, 1, back);
            return <Img key={k} src={staticFile(P[k].img)} style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover', boxShadow: `0 0 0 6px ${P[k].color}`, transform: `scale(${p})` }} />;
          })}
        </div>
        <div style={{ position: 'absolute', bottom: 70, fontSize: 24, color: '#7c7e88', opacity: tw(t, 111.8, 112.6) }}>Built with Cua · Claude Agent SDK · Synthesia · Databricks · Astryx</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- subtitles ----------
const NAMECOLOR: Record<string, string> = { sam: SAM, maya: P.maya.color, priya: P.priya.color, jonas: P.jonas.color, ines: P.ines.color };
const Subs: React.FC<{ t: number }> = ({ t }) => {
  const l = LINES.find((x) => t >= x.t - 0.05 && t <= x.t + x.d + 0.25);
  const bandO = clipOf('meeting') ? tw(t, M_IN + 0.4, M_IN + 0.8) * (1 - tw(t, M_OUT, M_OUT + 0.5)) : 0;
  const band = bandO > 0 ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: '#1c1c1e', opacity: bandO, zIndex: 49 }} /> : null;
  if (!l) return band;
  const o = tw(t, l.t - 0.05, l.t + 0.15) * (1 - tw(t, l.t + l.d + 0.05, l.t + l.d + 0.25));
  const label = l.who === 'narrator' ? null : l.who === 'sam' ? 'Sam' : P[l.who as Key].name;
  return (
    <>{band}<div style={{ position: 'absolute', bottom: 46, width: '100%', display: 'flex', justifyContent: 'center', opacity: o, zIndex: 50 }}>
      <div style={{ maxWidth: 1380, minWidth: l.id === 'rc1' ? 1560 : undefined, background: l.id === 'rc1' ? 'rgba(12,12,16,0.92)' : 'rgba(12,12,16,0.72)', borderRadius: 14, padding: '12px 26px', fontFamily: FONT, fontSize: 36, lineHeight: '48px', color: '#fff', textAlign: 'center', fontWeight: 500 }}>
        {label ? <span style={{ color: NAMECOLOR[l.who], fontWeight: 800 }}>{label}: </span> : null}
        {l.text}
      </div>
    </div></>
  );
};

// ---------- audio ----------
const duckAt = (t: number) => {
  let d = 0;
  for (const l of LINES) d = Math.max(d, tw(t, l.t - 0.25, l.t, 0, 1, ease) * (1 - tw(t, l.t + l.d, l.t + l.d + 0.35, 0, 1, ease)));
  return d;
};

export const MainV4: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const cam = camera(t);
  const worldO = tw(t, 23.85, 24.7, 0, 1, ease);
  const facesInMeeting = meetingOwnsFaces(t);
  return (
    <AbsoluteFill style={{ background: '#0d0e12' }}>
      {t >= 23.85 ? (
        <AbsoluteFill style={{ opacity: worldO }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 3280, height: 2080, transformOrigin: '0 0', transform: `translate(${960 - cam.cx * cam.z}px, ${540 - cam.cy * cam.z}px) scale(${cam.z})` }}>
            {ORDER.map((k) => <Desk key={k} k={k} t={t} faceHidden={facesInMeeting} />)}
          </div>
        </AbsoluteFill>
      ) : null}
      <Intro t={t} />
      <CallOverlay t={t} />
      <Meeting t={t} />
      <Teamwork t={t - 0.75} />
      <Approval t={t - 0.75} />
      <Team t={t - 0.75} />
      <PriyaNote t={t - 0.75} />
      <EndCard t={t} />
      <Subs t={t} />
      <Audio src={staticFile('media/bed.wav')} volume={(fr) => { const tt = fr / FPS; return 0.6 * (1 - 0.68 * duckAt(tt)); }} />
      <Audio src={staticFile('media/sfx.wav')} volume={0.9} />
      {LINES.filter((l) => !skippedLines.has(l.id) && !l.real).map((l) => (
        <Sequence key={l.id} from={Math.round(l.t * FPS)} durationInFrames={Math.ceil((l.d + 0.4) * FPS)}>
          <Audio src={staticFile(`media/${l.id}.wav`)} volume={l.who === 'narrator' ? 1 : 0.95} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
