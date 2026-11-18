import React from 'react';
import { Img, staticFile } from 'remotion';
import { E_IN, E_IO, E_OUT, FONT, MONO, Rect, TINT, clamp, lerp, prog, smoothNoise, wrect } from './util';
import { abs as absStyle } from './Media';
import { Easing } from 'remotion';

const E_FLY = Easing.bezier(0.42, 0, 0.12, 1);

// ----------------------------------------------------------------------------------------------
// Sam's Mac: wallpaper + menu bar
// ----------------------------------------------------------------------------------------------
export const MarkIcon: React.FC<{ size: number }> = ({ size }) => {
  const g = size * 0.1;
  const s = (size - g) / 2;
  const r = s * 0.3;
  const tile = (x: number, y: number, c: string) => (
    <div style={{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: r, background: c }} />
  );
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {tile(0, 0, '#72a3fe')}
      {tile(s + g, 0, '#fd9e3d')}
      {tile(0, s + g, '#f874a9')}
      {tile(s + g, s + g, '#47d9a0')}
    </div>
  );
};

export const MacBase: React.FC<{ t: number; opacity: number }> = ({ t, opacity }) => {
  const clock = 'Sun 15 Nov  11:32';
  return (
    <div style={{ position: 'absolute', left: -200, top: -200, width: 2320, height: 1480, opacity }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #27364d 0%, #1b2536 55%, #151c29 100%)' }} />
      <div
        style={{
          position: 'absolute',
          left: 200,
          top: 200,
          width: 1920,
          height: 30,
          background: 'rgba(14,16,22,0.62)',
          color: '#E6E9F0',
          fontFamily: FONT,
          fontSize: 15,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          paddingLeft: 22,
          zIndex: 5,
        }}
      >
        <span style={{ fontWeight: 700 }}>Finder</span>
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
        <span>Go</span>
        <span>Window</span>
        <span>Help</span>
        <div style={{ position: 'absolute', left: 1728, top: 6, width: 17, height: 17 }}>
          <MarkIcon size={17} />
        </div>
        <span style={{ position: 'absolute', left: 1765, top: 0, height: 30, display: 'flex', alignItems: 'center', opacity: 0.9, whiteSpace: 'nowrap' }}>{clock}</span>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------------------------
// Windows in the pile
// ----------------------------------------------------------------------------------------------
const Dots: React.FC = () => (
  <div style={{ display: 'flex', gap: 7 }}>
    {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
      <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c }} />
    ))}
  </div>
);

const TitleBar: React.FC<{ title: string; dark?: boolean; overlay?: boolean }> = ({ title, dark = true, overlay }) => (
  <div
    style={{
      position: overlay ? 'absolute' : 'relative',
      left: 0,
      top: 0,
      right: 0,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 12,
      gap: 12,
      background: dark ? 'rgba(32,34,40,0.96)' : 'rgba(236,237,240,0.97)',
      color: dark ? '#B7BCC8' : '#555',
      fontFamily: FONT,
      fontSize: 12.5,
      flex: '0 0 28px',
    }}
  >
    <Dots />
    <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center' }}>{title}</span>
  </div>
);

type Tok = [string, string];
const C = { kw: '#c678dd', fn: '#61afef', str: '#98c379', num: '#d19a66', com: '#6b7385', pl: '#abb2bf' };
const CODE: Tok[][] = [
  [['def ', C.kw], ['apply_discount', C.fn], ['(subtotal, code):', C.pl]],
  [['    rate = DISCOUNTS.', C.pl], ['get', C.fn], ['(code, ', C.pl], ['0', C.num], [')', C.pl]],
  [['    ', C.pl], ['return ', C.kw], ['round', C.fn], ['(subtotal * (', C.pl], ['1', C.num], [' - rate), ', C.pl], ['2', C.num], [')', C.pl]],
  [['', C.pl]],
  [['def ', C.kw], ['checkout_total', C.fn], ['(cart, code=', C.pl], ['None', C.kw], ['):', C.pl]],
  [['    subtotal = ', C.pl], ['sum', C.fn], ['(i.price * i.qty ', C.pl], ['for ', C.kw], ['i ', C.pl], ['in ', C.kw], ['cart)', C.pl]],
  [['    # discount comes off before tax', C.com]],
  [['    total = ', C.pl], ['apply_discount', C.fn], ['(subtotal, code)', C.pl]],
  [['    ', C.pl], ['return ', C.kw], ['round', C.fn], ['(total + ', C.pl], ['tax', C.fn], ['(total), ', C.pl], ['2', C.num], [')', C.pl]],
  [['', C.pl]],
  [['@app.route', C.fn], ['(', C.pl], ['"/checkout"', C.str], [', methods=[', C.pl], ['"POST"', C.str], ['])', C.pl]],
  [['def ', C.kw], ['checkout', C.fn], ['():', C.pl]],
  [['    data = request.', C.pl], ['get_json', C.fn], ['()', C.pl]],
  [['    ', C.pl], ['return ', C.kw], ['jsonify', C.fn], ['(total=', C.pl], ['checkout_total', C.fn], ['(data[', C.pl], ['"cart"', C.str], ['], data.', C.pl], ['get', C.fn], ['(', C.pl], ['"code"', C.str], [')))', C.pl]],
];

const EditorBody: React.FC<{ t: number }> = ({ t }) => {
  const caretOn = Math.floor(t * 2) % 2 === 0;
  const typedLines = 7 + Math.min(CODE.length - 7, Math.max(0, Math.floor((t - 6) * 0.55)));
  return (
    <div style={{ flex: 1, background: '#1d2026', padding: '14px 0', fontFamily: MONO, fontSize: 15.5, lineHeight: '23px', overflow: 'hidden' }}>
      {CODE.slice(0, typedLines).map((line, i) => (
        <div key={i} style={{ display: 'flex', whiteSpace: 'pre' }}>
          <span style={{ width: 44, textAlign: 'right', paddingRight: 16, color: '#4b5263' }}>{i + 1}</span>
          {line.map(([s, c], j) => (
            <span key={j} style={{ color: c }}>{s}</span>
          ))}
          {i === typedLines - 1 && caretOn ? <span style={{ background: '#6aa2ff', width: 8, marginLeft: 1 }}>&nbsp;</span> : null}
        </div>
      ))}
    </div>
  );
};

const ZSH_LINES = [
  '$ git status',
  'On branch fix/checkout-discount',
  'Changes not staged for commit:',
  '  modified:   shop/checkout.py',
  '$ python -m unittest',
  '..................................',
  '..................',
  'Ran 50 tests in 0.002s',
  'OK',
  '$ git diff --stat',
  ' shop/checkout.py | 6 +++---',
  '$ tail -f agents.log',
];
const TermBody: React.FC<{ t: number; seed?: number; lines?: string[] }> = ({ t, seed = 0, lines = ZSH_LINES }) => {
  const chars = Math.max(0, Math.floor((t - 1.5 - seed) * 38));
  const full = lines.join('\n');
  const shown = full.slice(0, chars % (full.length + 60));
  const caretOn = Math.floor(t * 2.2) % 2 === 0;
  return (
    <div style={{ flex: 1, background: '#14161b', color: '#cfd5e1', fontFamily: MONO, fontSize: 14.5, lineHeight: '21px', padding: '10px 14px', whiteSpace: 'pre', overflow: 'hidden' }}>
      {shown}
      {caretOn ? <span style={{ background: '#cfd5e1' }}>&nbsp;</span> : null}
    </div>
  );
};

const CHAT: [string, string, string][] = [
  ['you', 'Fix the checkout total', ''],
  ['maya', 'On it. Found the discount bug.', TINT[0]],
  ['you', 'Priya, launch post?', ''],
  ['priya', 'Drafting it now.', TINT[1]],
  ['jonas', 'Competitor prices are in.', TINT[2]],
  ['ines', 'Two onboarding versions ready.', TINT[3]],
  ['you', 'Who is doing what?', ''],
];
const ChatBody: React.FC<{ t: number }> = ({ t }) => {
  const n = Math.min(CHAT.length, Math.max(0, Math.floor((t - 5.2) / 1.5)));
  return (
    <div style={{ flex: 1, background: '#f5f6f8', padding: 14, display: 'flex', flexDirection: 'column', gap: 9, fontFamily: FONT, fontSize: 14.5, overflow: 'hidden' }}>
      {CHAT.slice(0, n).map(([who, text, col], i) => (
        <div key={i} style={{ alignSelf: who === 'you' ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
          {who !== 'you' ? <div style={{ fontSize: 11.5, color: col, fontWeight: 700, marginBottom: 2 }}>{who}</div> : null}
          <div
            style={{
              background: who === 'you' ? '#1d2026' : '#ffffff',
              color: who === 'you' ? '#fff' : '#1d2026',
              padding: '8px 12px',
              borderRadius: 14,
              boxShadow: who === 'you' ? undefined : '0 0 0 1px rgba(0,0,0,0.06)',
            }}
          >
            {text}
          </div>
        </div>
      ))}
    </div>
  );
};

export type PileWin = {
  id: string;
  rect: Rect;
  pop: number;
  title: string;
  kind: 'editor' | 'zsh' | 'chat' | 'zsh2' | 'img';
  img?: string;
  dest?: Rect; // world rect on the real desk (real windows only)
  fly: number; // start of flight / shrink-away
  seed: number;
  tilt: number;
  dark?: boolean;
};

export const FLY_DUR = 2.9;
export const ARRIVE = (w: PileWin) => w.fly + FLY_DUR;

// absolute frame rects of the four real windows (frame px)
const REAL = {
  maya: { x: 157, y: 92, w: 681, h: 426 },
  priya: { x: 1350, y: 70, w: 1056, h: 545 },
  jonas: { x: 154, y: 870, w: 1056, h: 545 },
  ines: { x: 1350, y: 870, w: 1056, h: 545 },
};

export const PILE: PileWin[] = [
  { id: 'editor', rect: { x: 90, y: 80, w: 640, h: 400 }, pop: 0.6, title: 'checkout.py  shop', kind: 'editor', fly: 23.95, seed: 1, tilt: -2 },
  { id: 'jonas', rect: { x: 380, y: 196, w: 650, h: 336 }, pop: 1.2, title: 'Competitor pricing', kind: 'img', img: 'agents/A/crop_jonas.png', dest: wrect(REAL.jonas), fly: 24.19, seed: 2, tilt: 2.4 },
  { id: 'zsh', rect: { x: 1010, y: 66, w: 560, h: 330 }, pop: 1.9, title: 'zsh', kind: 'zsh', fly: 23.98, seed: 3, tilt: 2 },
  { id: 'priya', rect: { x: 1120, y: 262, w: 620, h: 320 }, pop: 2.6, title: 'Launch post', kind: 'img', img: 'agents/A/crop_priya.png', dest: wrect(REAL.priya), fly: 24.07, seed: 4, tilt: -2.4 },
  { id: 'maya', rect: { x: 150, y: 520, w: 544, h: 340 }, pop: 3.3, title: 'Terminal  shop', kind: 'img', img: 'agents/A/crop_maya.png', dest: wrect(REAL.maya), fly: 23.95, seed: 5, tilt: -2.8 },
  { id: 'ines', rect: { x: 700, y: 540, w: 660, h: 341 }, pop: 4.0, title: 'Onboarding', kind: 'img', img: 'agents/A/crop_ines.png', dest: wrect(REAL.ines), fly: 24.31, seed: 6, tilt: 2.6 },
  { id: 'chat', rect: { x: 1400, y: 590, w: 410, h: 340 }, pop: 4.8, title: 'agent chat', kind: 'chat', fly: 24.02, seed: 7, tilt: 2 },
  { id: 'zsh2', rect: { x: 540, y: 720, w: 500, h: 270 }, pop: 5.5, title: 'zsh (4)', kind: 'zsh2', fly: 24.06, seed: 8, tilt: -2 },
];

const WinBody: React.FC<{ w: PileWin; t: number; chromeOpacity: number }> = ({ w, t, chromeOpacity }) => {
  if (w.kind === 'img') {
    return (
      <div style={{ position: 'relative', flex: 1 }}>
        <Img src={staticFile(w.img!)} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
        <div style={{ opacity: chromeOpacity }}>
          <TitleBar title={w.title} overlay />
        </div>
      </div>
    );
  }
  return (
    <>
      <TitleBar title={w.kind === 'chat' ? w.title : w.title} dark={w.kind !== 'chat'} />
      {w.kind === 'editor' ? <EditorBody t={t} /> : null}
      {w.kind === 'zsh' ? <TermBody t={t} seed={0} /> : null}
      {w.kind === 'zsh2' ? <TermBody t={t} seed={2.5} lines={['$ ls ~/work', 'shop  onboarding  launch', '$ cd shop && ls', 'checkout.py  tests  README.md', '$ python -m unittest -v', 'test_free_shipping ... ok', 'test_small_orders ... ok', 'test_bad_quantity ... ok']} /> : null}
      {w.kind === 'chat' ? <ChatBody t={t} /> : null}
    </>
  );
};

export const PileLayer: React.FC<{ t: number }> = ({ t }) => {
  const shakeRamp = prog(t, 14.0, 14.7, E_OUT) * (1 - prog(t, 19.6, 20.2, E_IO));
  return (
    <>
      {PILE.map((w, idx) => {
        if (t < w.pop) return null;
        const real = !!w.dest;
        const arrive = ARRIVE(w);
        if (real && t > arrive + 0.4) return null;
        const popP = prog(t, w.pop, w.pop + 0.5, E_OUT);
        // flight / shrink-away
        let r: Rect = w.rect;
        let rot = 0;
        let opacity = popP;
        let scale = lerp(0.93, 1, popP);
        let chrome = 1;
        let dy = lerp(14, 0, popP);
        if (real) {
          const p = prog(t, w.fly, arrive, E_FLY);
          r = {
            x: lerp(w.rect.x, w.dest!.x, p),
            y: lerp(w.rect.y, w.dest!.y, p) - 48 * Math.sin(Math.PI * p),
            w: lerp(w.rect.w, w.dest!.w, p),
            h: lerp(w.rect.h, w.dest!.h, p),
          };
          rot = w.tilt * Math.sin(Math.PI * Math.pow(p, 0.8)) * (1 - 0.0 * p);
          chrome = 1 - prog(t, w.fly, w.fly + 0.5, E_IO);
          if (p > 0) {
            scale = 1;
            dy = 0;
          }
        } else {
          const q = prog(t, w.fly, w.fly + 0.45, E_IO);
          scale = lerp(scale, 0.8, q);
          opacity = opacity * (1 - prog(t, w.fly, w.fly + 0.35, E_IO));
          dy = lerp(dy, 14, q);
          if (opacity <= 0.001 && t > w.fly) return null;
        }
        // subtle shake, only once agents.log is on screen
        const sh = shakeRamp;
        const sx = smoothNoise(t, w.seed) * 2.4 * sh;
        const sy = smoothNoise(t + 3.3, w.seed + 1) * 1.9 * sh;
        const sr = smoothNoise(t + 7.7, w.seed + 2) * 0.22 * sh;
        const shadowK = real ? 1 - prog(t, w.fly + 1.0, arrive, E_IO) : 1;
        return (
          <div
            key={w.id}
            style={{
              ...absStyle(r),
              transform: `translate(${sx}px, ${sy + dy}px) rotate(${rot + sr}deg) scale(${scale})`,
              opacity,
              zIndex: idx,
              borderRadius: real ? lerp(10, 8, clamp((t - w.fly) / FLY_DUR)) : 10,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: `0 ${14 * shadowK}px ${40 * shadowK}px rgba(0,0,0,${0.38 * shadowK}), 0 0 0 1px rgba(255,255,255,0.07)`,
              background: '#14161b',
            }}
          >
            <WinBody w={w} t={t} chromeOpacity={chrome} />
          </div>
        );
      })}
      {/* a cursor-like highlight wandering over the phone mockup is the real cursor, drawn in MacOverlay */}
    </>
  );
};

// ----------------------------------------------------------------------------------------------
// agents.log, cursor, menu
// ----------------------------------------------------------------------------------------------
const ACT: Record<string, string[]> = {
  maya: ['Ran a command', 'Opened Xfce4 terminal', 'Opened file'],
  priya: ['Saved launch_post.md', 'Saved launch_post.html', 'Messaged Jonas', 'Priya asked something', 'Opened file'],
  jonas: ['Read shopify.com', 'Read wix.com', 'Read squarespace.com', 'Read bigcommerce.co.uk', 'Searched the web', 'Jonas replied', 'Messaged Priya'],
  ines: ['Saved index.html', 'Opened file', 'Ran a command', 'Opened Xfce4 terminal'],
};
const WHO = ['maya', 'priya', 'jonas', 'ines'];
const LOG = Array.from({ length: 260 }, (_, i) => {
  const a = (i * 7 + Math.floor(i / 3) * 5 + (i % 5)) % 4;
  const who = WHO[a];
  const list = ACT[who];
  const txt = list[(i * 3 + a) % list.length];
  const s = 41000 + i * 3 + (i % 4);
  const hh = '11';
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return { who, txt, ts: `${hh}:${mm}:${ss}` };
});

const LOG_RECT: Rect = { x: 270, y: 150, w: 1380, h: 780 };
export const LogWindow: React.FC<{ t: number }> = ({ t }) => {
  const a = prog(t, 14.0, 14.25, E_OUT);
  const b = 1 - prog(t, 19.5, 19.75, E_IO);
  const o = a * b;
  if (o <= 0.001) return null;
  const scroll = Math.pow(Math.max(0, t - 14.1), 1.0) * 760; // px
  const lh = 26;
  const first = Math.floor(scroll / lh);
  const off = scroll % lh;
  const rows = Math.ceil((LOG_RECT.h - 30) / lh) + 2;
  return (
    <>
      <div style={{ position: 'absolute', left: -300, top: -300, width: 2520, height: 1680, background: 'rgba(8,10,14,0.55)', opacity: o }} />
      <div
        style={{
          ...absStyle(LOG_RECT),
          opacity: o,
          transform: `scale(${lerp(0.94, 1, a) * lerp(1, 0.98, 1 - b)})`,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#0f1115',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TitleBar title="agents.log" />
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 22, top: -off, fontFamily: MONO, fontSize: 18, lineHeight: `${lh}px`, whiteSpace: 'pre', color: '#cdd3df' }}>
            {Array.from({ length: rows }, (_, k) => {
              const L = LOG[(first + k) % LOG.length];
              const col = TINT[WHO.indexOf(L.who)];
              return (
                <div key={first + k}>
                  <span style={{ color: '#6b7385' }}>{L.ts}  </span>
                  <span style={{ color: col, fontWeight: 700 }}>{`[${L.who}]`.padEnd(9, ' ')}</span>
                  <span>{L.txt}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

// cursor keyframes (world px)
const CUR: { t: number; x: number; y: number }[] = [
  { t: 0.0, x: 1500, y: 760 },
  { t: 4.2, x: 1500, y: 760 },
  { t: 5.6, x: 1010, y: 690 },
  { t: 7.2, x: 960, y: 640 },
  { t: 9.0, x: 1090, y: 700 },
  { t: 10.8, x: 1010, y: 620 },
  { t: 12.6, x: 1180, y: 660 },
  { t: 14.0, x: 1230, y: 640 },
  { t: 20.3, x: 1230, y: 640 },
  { t: 22.9, x: 1737, y: 14 },
  { t: 23.15, x: 1737, y: 14 },
  { t: 23.68, x: 1700, y: 66 },
  { t: 24.3, x: 1700, y: 66 },
];
export const cursorAt = (t: number) => {
  for (let i = 0; i < CUR.length - 1; i++) {
    const a = CUR[i];
    const b = CUR[i + 1];
    if (t <= b.t) {
      const p = E_IO(clamp((t - a.t) / (b.t - a.t)));
      return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
    }
  }
  const l = CUR[CUR.length - 1];
  return { x: l.x, y: l.y };
};

export const MenuPopover: React.FC<{ t: number }> = ({ t }) => {
  const open = prog(t, 23.15, 23.3, E_OUT) * (1 - prog(t, 23.76, 23.86, E_IO));
  if (open <= 0.001) return null;
  const hot = t > 23.55;
  return (
    <div
      style={{
        position: 'absolute',
        left: 1650,
        top: 36,
        width: 220,
        padding: 6,
        borderRadius: 11,
        background: 'rgba(34,37,45,0.97)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.09)',
        fontFamily: FONT,
        fontSize: 16,
        color: '#EEF0F5',
        opacity: open,
        transform: `translateY(${lerp(-6, 0, open)}px)`,
        zIndex: 40,
      }}
    >
      <div style={{ padding: '8px 12px', borderRadius: 7, background: hot ? '#4a79ff' : 'transparent', fontWeight: 600 }}>Show desks</div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '5px 8px' }} />
      <div style={{ padding: '8px 12px', opacity: 0.75 }}>Quit Deskmates</div>
    </div>
  );
};

export const MarkHighlight: React.FC<{ t: number }> = ({ t }) => {
  const o = prog(t, 23.1, 23.16, E_OUT) * (1 - prog(t, 23.76, 23.86, E_IO));
  if (o <= 0.001) return null;
  return <div style={{ position: 'absolute', left: 1722, top: 3, width: 29, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.18)', opacity: o, zIndex: 30 }} />;
};

export const Cursor: React.FC<{ t: number; clickAt?: number[] }> = ({ t, clickAt = [] }) => {
  const p = cursorAt(t);
  const fade = prog(t, 0.0, 0.8, E_IO) * (1 - prog(t, 24.0, 24.5, E_IO));
  if (fade <= 0.001) return null;
  const press = clickAt.some((c) => t > c && t < c + 0.12);
  return (
    <div style={{ position: 'absolute', left: p.x, top: p.y, opacity: fade, transform: `scale(${press ? 0.88 : 1})`, transformOrigin: '2px 2px', zIndex: 60 }}>
      <svg width="26" height="32" viewBox="0 0 26 32">
        <path d="M3 2 L3 24 L9 18.5 L13 28 L17 26.3 L13 17 L21 17 Z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
};
