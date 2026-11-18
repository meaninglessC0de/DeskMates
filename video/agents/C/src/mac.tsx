import React from 'react';
import {
  COLORS, FONT, MONO, H, W, WHO, WIN, Who, camAt, clamp, eback, eio, eout, lerp, seg, smoother, toScreen, T,
} from './lib';
import {At, Crop, SRC, useT} from './ui';

// ---------- Sam's Mac: the "before" pile (real windows cropped from the Desks take + drawn fixtures) ----------

type Base = {x: number; y: number; s: number; rot: number; pop: number; ph: number};
const BASE: Record<Who, Base> = {
  jonas: {x: 175, y: 105, s: 0.86, rot: -1.2, pop: 0.6, ph: 0.3},
  priya: {x: 730, y: 100, s: 0.74, rot: 1.0, pop: 1.5, ph: 1.7},
  ines: {x: 150, y: 500, s: 0.78, rot: -0.6, pop: 2.4, ph: 2.9},
  maya: {x: 640, y: 440, s: 1.0, rot: 1.4, pop: 3.2, ph: 4.1},
};
const FLY_ORDER: Who[] = ['maya', 'priya', 'jonas', 'ines'];
const FLY0 = 24.15;
const FLY_GAP = 0.24;
const FLY_DUR = 1.9;
export const flyStart = (w: Who) => FLY0 + FLY_GAP * FLY_ORDER.indexOf(w);
export const landTime = (w: Who) => flyStart(w) + FLY_DUR;
const TILT: Record<Who, number> = {maya: -3.2, priya: 3.4, jonas: -2.6, ines: 3.0};
const ARC: Record<Who, number> = {maya: 60, priya: -80, jonas: 70, ines: -70};

const shakeAmp = (t: number) => 0.5 * (seg(t, T.shakeIn, T.shakeIn + 0.7) - seg(t, 19.3, 20.0));

type Pose = {cx: number; cy: number; s: number; rot: number; op: number; m: number};
function pilePose(w: Who, t: number, withShake = true): Pose {
  const b = BASE[w];
  const ww = WIN[w].w * b.s;
  const wh = WIN[w].h * b.s;
  const drift = seg(t, 5.5, 7.5);
  let x = b.x + ww / 2 + drift * 4 * Math.sin(t * 0.7 + b.ph);
  let y = b.y + wh / 2 + drift * 3 * Math.cos(t * 0.55 + b.ph);
  let rot = b.rot + drift * 0.25 * Math.sin(t * 0.5 + b.ph);
  if (w === 'priya') x += 90 * eio(seg(t, 8.6, 9.9));
  if (w === 'jonas') y -= 26 * eio(seg(t, 10.6, 11.9));
  if (w === 'ines') x += 40 * eio(seg(t, 11.8, 13.0));
  if (withShake) {
    const a = shakeAmp(t);
    x += a * 2.2 * Math.sin(t * 53 + b.ph * 3);
    y += a * 2.0 * Math.sin(t * 47 + b.ph * 5);
    rot += a * 0.14 * Math.sin(t * 61 + b.ph);
  }
  const pp = seg(t, b.pop, b.pop + 0.55);
  const m = 0.9 + 0.1 * eback(pp);
  return {cx: x, cy: y, s: b.s * m, rot, op: clamp(seg(t, b.pop, b.pop + 0.3)), m};
}

function poseAt(w: Who, t: number): Pose & {e: number} {
  const st = flyStart(w);
  if (t < st) return {...pilePose(w, t), e: 0};
  const p0 = pilePose(w, st, false);
  const cam = camAt(t);
  const r = toScreen(cam, WIN[w]);
  const c1 = {x: r.x + r.w / 2, y: r.y + r.h / 2};
  const e = smoother(seg(t, st, st + FLY_DUR));
  const dx = c1.x - p0.cx;
  const dy = c1.y - p0.cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const arc = ARC[w] * Math.sin(Math.PI * e);
  return {
    cx: lerp(p0.cx, c1.x, e) + nx * arc,
    cy: lerp(p0.cy, c1.y, e) + ny * arc,
    s: Math.exp(lerp(Math.log(p0.s), Math.log(cam.k), e)),
    rot: lerp(p0.rot, 0, e) + TILT[w] * Math.sin(Math.PI * e),
    op: 1,
    m: 1,
    e,
  };
}

const PileWindow: React.FC<{w: Who}> = ({w}) => {
  const t = useT();
  if (t < BASE[w].pop || t > landTime(w) + 0.8) return null;
  const p = poseAt(w, t);
  const ww = WIN[w].w * p.s;
  const wh = WIN[w].h * p.s;
  const cam = camAt(t);
  const bottom = lerp(10, 26 * cam.k, p.e);
  const top = w === 'maya' ? lerp(6, 0, p.e) : lerp(8, 0, p.e);
  const br = w === 'maya' ? `${top}px` : `${top}px ${top}px ${bottom}px ${bottom}px`;
  const sh = 1 - p.e;
  const take0 = 8.0;
  return (
    <div
      style={{
        position: 'absolute',
        left: p.cx - ww / 2,
        top: p.cy - wh / 2,
        width: ww,
        height: wh,
        transform: `rotate(${p.rot}deg)`,
        opacity: p.op,
        borderRadius: br,
        overflow: 'hidden',
        boxShadow: `0 ${26 * sh}px ${64 * sh}px rgba(0,0,0,${0.38 * sh}), 0 2px ${6 * sh}px rgba(0,0,0,${0.3 * sh})`,
      }}
    >
      <Crop src={SRC.desks} crop={WIN[w]} s={p.s} t0={0} t1={24} take0={0.8} rate={0.3} />
      <Crop src={SRC.desks} crop={WIN[w]} s={p.s} t0={24} t1={29} take0={take0} />
    </div>
  );
};

// ---------- drawn windows ----------
const Traffic: React.FC = () => (
  <div style={{display: 'flex', gap: 8, position: 'absolute', left: 14, top: 12}}>
    {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
      <div key={c} style={{width: 12, height: 12, borderRadius: 6, background: c}} />
    ))}
  </div>
);

const MacWin: React.FC<{
  x: number; y: number; w: number; h: number; title: string; dark?: boolean; t0: number;
  children: React.ReactNode; rot?: number; dismiss?: number;
}> = ({x, y, w, h, title, dark, t0, children, rot = 0, dismiss}) => {
  const t = useT();
  if (t < t0) return null;
  const pp = seg(t, t0, t0 + 0.55);
  const m = 0.9 + 0.1 * eback(pp);
  const d = dismiss !== undefined ? eio(seg(t, dismiss, dismiss + 0.8)) : 0;
  const sc = m * (1 - 0.8 * d);
  const dx = (960 - (x + w / 2)) * d * 0.9;
  const dy = (540 - (y + h / 2)) * d * 0.9;
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 12, overflow: 'hidden',
        background: dark ? '#1d1f24' : '#f6f6f7', opacity: clamp(seg(t, t0, t0 + 0.3)) * (1 - d),
        transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${sc})`,
        boxShadow: '0 26px 64px rgba(0,0,0,.38), 0 2px 6px rgba(0,0,0,.3)',
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          height: 38, background: dark ? '#2a2c33' : '#e6e6e8', position: 'relative', color: dark ? '#b9bcc6' : '#555',
          fontSize: 14, textAlign: 'center', lineHeight: '38px',
        }}
      >
        <Traffic />
        {title}
      </div>
      {children}
    </div>
  );
};

const ZSH = [
  'sam@mac ~ % ls agents/',
  'maya  priya  jonas  ines',
  'sam@mac ~ % git -C shop log --oneline -3',
  'a41c9e2 fix discount order',
  'sam@mac ~ % open work/pricing.html',
  'sam@mac ~ % python3 -m http.server 8000',
  'Serving HTTP on :: port 8000 ...',
  'sam@mac ~ % ',
].join('\n');

const ZshWin: React.FC = () => {
  const t = useT();
  const shown = ZSH.slice(0, Math.max(0, Math.floor((t - 5.2) * 11)));
  const lines = shown.split('\n').slice(-8);
  const blink = Math.floor(t * 2.2) % 2 === 0;
  return (
    <MacWin x={110} y={850} w={700} h={220} title="zsh (4)" dark t0={5.0} rot={-0.8} dismiss={24.0}>
      <div style={{padding: '14px 18px', fontFamily: MONO, fontSize: 17, lineHeight: '24px', color: '#d6d9e0', whiteSpace: 'pre'}}>
        {lines.join('\n')}
        <span style={{opacity: blink ? 1 : 0}}>█</span>
      </div>
    </MacWin>
  );
};

const CHAT: [Who, string][] = [
  ['maya', 'running the checkout tests'],
  ['priya', 'drafting the launch post'],
  ['jonas', 'reading competitor pricing'],
  ['ines', 'two onboarding designs'],
  ['maya', 'committed on a new branch'],
  ['priya', 'asked Jonas something'],
];
const ChatWin: React.FC = () => {
  const t = useT();
  return (
    <MacWin x={1390} y={118} w={420} h={560} title="agent chat" t0={4.2} rot={0.9} dismiss={24.0}>
      <div style={{padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 14}}>
        {CHAT.map(([who, text], i) => {
          const a = clamp(seg(t, 4.8 + i * 1.3, 5.3 + i * 1.3));
          return (
            <div key={i} style={{display: 'flex', gap: 12, alignItems: 'center', opacity: a, transform: `translateY(${(1 - a) * 8}px)`}}>
              <div style={{width: 30, height: 30, borderRadius: 15, background: COLORS[who], flex: 'none'}} />
              <div style={{fontSize: 18, color: '#222', lineHeight: '22px'}}>
                <b style={{textTransform: 'capitalize'}}>{who}</b> {text}
              </div>
            </div>
          );
        })}
      </div>
    </MacWin>
  );
};

// agents.log
const LOGS: Record<Who, string[]> = {
  maya: ['Ran a command', 'Opened Xfce4 terminal', 'Ran a command', 'Ran a command'],
  priya: ['Saved launch_post.md', 'Saved launch_post.html', 'Messaged Jonas', 'Opened file', 'Priya asked something'],
  jonas: ['Read shopify.com', 'Read wix.com', 'Read squarespace.com', 'Read bigcommerce.co.uk', 'Searched the web', 'Messaged Priya'],
  ines: ['Saved index.html', 'Opened file', 'Ran a command', 'Saved index.html'],
};
const hash = (n: number) => {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return x >>> 0;
};
const logLine = (n: number) => {
  const who = WHO[hash(n) % 4];
  const arr = LOGS[who];
  const text = arr[hash(n + 99) % arr.length];
  const s = 41520 + Math.floor(n * 1.3);
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return {who, text, ts: `${hh}:${mm}:${ss}`};
};
const LogWin: React.FC = () => {
  const t = useT();
  const t0 = T.logIn;
  const t1 = 20.7;
  if (t < t0 || t > t1) return null;
  const a = clamp(seg(t, t0, t0 + 0.7)) * (1 - clamp(seg(t, 19.8, t1)));
  const sc = lerp(0.93, 1, eout(seg(t, t0, t0 + 0.8))) * lerp(1, 1.04, seg(t, 19.8, t1));
  const speed = 330; // px/s
  const off = ((t - t0) * speed + 4000) % 30;
  const first = Math.floor(((t - t0) * speed + 4000) / 30);
  const rows = [];
  for (let i = 0; i < 27; i++) {
    const L = logLine(first + i);
    rows.push(
      <div key={first + i} style={{height: 30, lineHeight: '30px', whiteSpace: 'pre', fontSize: 20}}>
        <span style={{color: '#6b7280'}}>{L.ts} </span>
        <span style={{color: COLORS[L.who]}}>[{L.who}]</span>
        <span style={{color: '#e5e7eb'}}> {L.text}</span>
      </div>,
    );
  }
  return (
    <div
      style={{
        position: 'absolute', left: 330, top: 120, width: 1260, height: 860, opacity: a, transform: `scale(${sc})`,
        borderRadius: 14, overflow: 'hidden', background: '#101216', boxShadow: '0 40px 100px rgba(0,0,0,.55)', fontFamily: MONO,
      }}
    >
      <div style={{height: 44, background: '#23252c', position: 'relative', color: '#aab', fontSize: 16, textAlign: 'center', lineHeight: '44px'}}>
        <Traffic />
        agents.log
      </div>
      <div style={{position: 'absolute', left: 26, top: 58 - off, overflow: 'hidden'}}>{rows}</div>
    </div>
  );
};

// ---------- menu bar + wallpaper + cursor ----------
const MarkIcon: React.FC<{size: number}> = ({size}) => (
  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: size * 0.1, width: size, height: size}}>
    {(['maya', 'priya', 'jonas', 'ines'] as Who[]).map((w) => (
      <div key={w} style={{background: COLORS[w], borderRadius: size * 0.22}} />
    ))}
  </div>
);

const MenuBar: React.FC = () => (
  <div
    style={{
      position: 'absolute', left: 0, top: 0, width: W, height: 30, background: 'rgba(14,16,28,.42)', color: '#fff',
      fontFamily: FONT, fontSize: 15, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 24,
    }}
  >
    <div style={{width: 12, height: 14, borderRadius: 6, background: '#fff'}} />
    <b>Finder</b>
    <span>File</span><span>Edit</span><span>View</span><span>Go</span><span>Window</span><span>Help</span>
    <div style={{flex: 1}} />
    <span style={{opacity: 0.85}}>Sat 15 Nov</span>
    <span style={{opacity: 0.85}}>11:32</span>
    <div style={{marginLeft: 8, position: 'absolute', right: 186, top: 7}}>
      <MarkIcon size={16} />
    </div>
  </div>
);

const TRAY_X = 1920 - 186 + 8; // centre of tray mark icon

const Menu: React.FC = () => {
  const t = useT();
  const open = seg(t, 22.7, 22.9) * (1 - seg(t, 24.0, 24.12));
  if (open <= 0) return null;
  const hi = seg(t, 23.5, 23.6);
  const press = t > 24.0 ? 1 : 0;
  const items = ['Show desks', 'Open Deskmates', 'Summon meeting', 'Quit Deskmates'];
  return (
    <div
      style={{
        position: 'absolute', right: 120, top: 34, width: 280, borderRadius: 12, background: 'rgba(250,250,252,.96)',
        padding: 6, fontFamily: FONT, fontSize: 16, opacity: open, transform: `translateY(${(1 - open) * -6}px)`,
        boxShadow: '0 20px 50px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.08)',
      }}
    >
      {items.map((s, i) => (
        <div
          key={s}
          style={{
            padding: '8px 12px', borderRadius: 7, color: i === 0 && hi > 0.5 ? '#fff' : '#1c1c1e',
            background: i === 0 && hi > 0.5 ? (press ? '#2f66e0' : '#3b78f5') : 'transparent',
            borderTop: i === 3 ? '1px solid transparent' : undefined,
          }}
        >
          {s}
        </div>
      ))}
    </div>
  );
};

const CURSOR: [number, number, number][] = [
  [6.0, 1250, 520], [7.6, 960, 330], [9.4, 520, 690], [11.2, 1260, 310], [13.0, 1010, 590],
  [20.5, 1010, 590], [22.4, 1739, 15], [23.5, 1650, 62], [24.0, 1650, 62], [24.5, 1650, 62],
];
const Cursor: React.FC = () => {
  const t = useT();
  if (t < 6.0 || t > 25.4) return null;
  let i = 0;
  while (i < CURSOR.length - 2 && t >= CURSOR[i + 1][0]) i++;
  const a = CURSOR[i];
  const b = CURSOR[i + 1];
  const p = smoother(seg(t, a[0], b[0]));
  const x = lerp(a[1], b[1], p);
  const y = lerp(a[2], b[2], p);
  const fade = clamp(seg(t, 6.0, 6.4)) * (1 - seg(t, 24.8, 25.4));
  const click = Math.max(
    1 - clamp(Math.abs(t - 22.62) / 0.12),
    1 - clamp(Math.abs(t - 23.98) / 0.12),
  );
  return (
    <svg width="30" height="36" viewBox="0 0 30 36" style={{position: 'absolute', left: x - 3, top: y - 2, opacity: fade, transform: `scale(${1 - 0.12 * click})`, transformOrigin: '3px 2px'}}>
      <path d="M3 2 L3 27 L9.5 21.2 L14.2 31.6 L18.4 29.8 L13.8 19.6 L22.5 19.2 Z" fill="#111" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
};

const Dock: React.FC = () => {
  const t = useT();
  const cols = ['#7aa7ff', '#ff9f43', '#58c27d', '#c084fc', '#f472b6', '#9aa3b2', '#60a5fa'];
  return (
    <div
      style={{
        position: 'absolute', left: 560, bottom: 14, width: 800, height: 84, borderRadius: 24, background: 'rgba(255,255,255,.16)',
        display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'center', opacity: clamp(seg(t, 0.2, 1.0)),
        boxShadow: '0 0 0 1px rgba(255,255,255,.18) inset',
      }}
    >
      {cols.map((c, i) => (
        <div key={i} style={{width: 58, height: 58, borderRadius: 14, background: c, opacity: 0.9}} />
      ))}
    </div>
  );
};

/** Everything of the Mac scene that is not a real desk window. */
export const MacScene: React.FC = () => {
  const t = useT();
  // gentle push-in while the log is open, then ease back
  const push = 1 + 0.07 * (smoother(seg(t, 14.0, 18.6)) - smoother(seg(t, 19.7, 22.2)));
  const out = seg(t, 24.35, 25.35);
  if (t > 25.5) return null;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: 1 - out, transform: `scale(${1 + 0.05 * out})`}}>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, #2a2f6b 0%, #5a49a8 48%, #c77aa8 100%)',
        }}
      />
      <MenuBar />
      <div style={{position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: '960px 540px'}}>
        <Dock />
      </div>
    </div>
  );
};

/** The four real windows (live crops of the Desks recording): pile, then flight onto their desks. */
export const PilePart: React.FC = () => {
  const t = useT();
  const push = 1 + 0.07 * (smoother(seg(t, 14.0, 18.6)) - smoother(seg(t, 19.7, 22.2)));
  const fl = t >= 24.0;
  // windows are in the pushed layer until they start to fly (push is back to 1 by then)
  return (
    <div style={{position: 'absolute', inset: 0, transform: fl ? undefined : `scale(${push})`, transformOrigin: '960px 540px', pointerEvents: 'none'}}>
      {/* back-to-front in pop order (z-order of the pile): ChatWin/ZshWin render below in MacScene; real windows above */}
      {(['jonas', 'priya', 'ines', 'maya'] as Who[]).map((w) => (
        <PileWindow key={w} w={w} />
      ))}
      <ChatWin />
      <ZshWin />
    </div>
  );
};

export const LogLayer: React.FC = () => {
  const t = useT();
  const push = 1 + 0.07 * (smoother(seg(t, 14.0, 18.6)) - smoother(seg(t, 19.7, 22.2)));
  return (
    <div style={{position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: '960px 540px'}}>
      <LogWin />
    </div>
  );
};

export const MenuLayer: React.FC = () => (
  <>
    <Menu />
    <Cursor />
  </>
);
