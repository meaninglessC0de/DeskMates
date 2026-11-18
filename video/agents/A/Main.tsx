import React from 'react';
import { AbsoluteFill, Easing, Img, staticFile, useCurrentFrame } from 'remotion';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '@astryxdesign/theme-neutral/fonts.css';
import cues from './cues.json';
import {
  CALL_FACE, CALL_FACE_WORLD, CALL_PLATE, CALL_Z, E_IN, E_IO, E_OUT, E_SOFT, FONT, FPS, GRID, H, KF, MEET_PX, NAME_BY, P_CALL, Pose, Rect, TILE_PX, TINT,
  TINT_BY, W, WIN, WIN_RADIUS, cardPx, cardW, clamp, lerp, lerpRect, meetW, poseAt, prog, tilePose, tileW, wrect,
} from './util';
import { MediaCrop, Plate, Vid, abs, CropSrc } from './Media';
import { ARRIVE, Cursor, LogWindow, MacBase, MarkHighlight, MarkIcon, MenuPopover, PILE, PileLayer } from './Mac';

const E_FLY2 = Easing.bezier(0.45, 0, 0.12, 1);
const BG = '#141416';

const Layer: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, isolation: 'isolate', ...style }}>{children}</div>
);

// ---------------------------------------------------------------- camera
const KFS: KF[] = [
  { t: 0, pose: { cx: 960, cy: 540, z: 1.07 } },
  { t: 5.5, pose: GRID, e: E_OUT },
  { t: 13.3, pose: GRID },
  { t: 16.4, pose: { cx: 960, cy: 552, z: 1.22 } },
  { t: 19.5, pose: { cx: 960, cy: 552, z: 1.27 } },
  { t: 21.5, pose: GRID },
  { t: 28.1, pose: GRID },
  { t: 29.15, pose: tilePose(0) },
  { t: 30.0, pose: tilePose(0) },
  { t: 30.9, pose: tilePose(1) },
  { t: 31.6, pose: tilePose(1) },
  { t: 32.3, pose: tilePose(2) },
  { t: 33.3, pose: tilePose(2) },
  { t: 34.0, pose: tilePose(3) },
  { t: 35.3, pose: tilePose(3) },
  { t: 36.9, pose: GRID },
  { t: 39.6, pose: GRID },
  { t: 41.2, pose: P_CALL },
  { t: 48.3, pose: P_CALL },
  { t: 49.9, pose: GRID },
];

// ---------------------------------------------------------------- timeline constants
const DESKS_OFFSET = 14.0; // desks take = edit - 14
const DESKS_VIDEO_END = 52.6;
const CALL_OFFSET = 32.06; // call take = edit - 32.06 (Maya's line starts 10.14 at 42.2)
const MEET_FLY_IN = 52.2;
const MEET_LAND = 54.3;
const MEET_RET0 = 86.6;
const MEET_RET1 = 88.7;

// meeting take mapping pieces: from edit time e0, take = e0Take + (edit - e0)
const MEET_PIECES = [
  { e0: 52.4, take0: 7.6 }, // faces land, quiet
  { e0: 54.6, take0: 21.0 }, // quiet stretch before Maya
  { e0: 67.0, take0: 41.9 }, // Jonas pin
  { e0: 69.8, take0: 47.7 }, // Jonas
  { e0: 74.6, take0: 53.7 }, // Ines pin
  { e0: 77.2, take0: 71.5 }, // Ines
  { e0: 82.6, take0: 79.5 },
  { e0: 85.0, take0: 83.8 },
];
const MEET_END = 86.8; // freeze on meeting_end.png after this
const DISS = 0.4;

const meetSrc = (): CropSrc[] => []; // placeholder to keep types tidy

// ---------------------------------------------------------------- faces flying
const FaceFlyer: React.FC<{
  t: number;
  t0: number;
  t1: number;
  from: Rect;
  to: Rect;
  fromSrc: CropSrc;
  fromSr: Rect;
  toSrc: CropSrc;
  toSr: Rect;
  r0?: number;
  r1?: number;
  mix?: [number, number];
}> = ({ t, t0, t1, from, to, fromSrc, fromSr, toSrc, toSr, r0 = 12, r1 = 10, mix = [0.2, 0.7] }) => {
  if (t < t0 || t > t1 + 0.02) return null;
  const p = prog(t, t0, t1, E_FLY2);
  const r = lerpRect(from, to, p);
  const m = prog(p, mix[0], mix[1], E_SOFT);
  const lift = Math.sin(Math.PI * p);
  const rel: Rect = { x: 0, y: 0, w: r.w, h: r.h };
  return (
    <div
      style={{
        ...abs(r),
        borderRadius: lerp(r0, r1, p),
        overflow: 'hidden',
        boxShadow: `0 ${10 * lift}px ${30 * lift}px rgba(0,0,0,${0.35 * lift})`,
        transform: `rotate(${(1 - p) * 0 + lift * 1.2}deg)`,
      }}
    >
      <MediaCrop rect={rel} src={fromSrc} sr={fromSr} opacity={1 - m} />
      <MediaCrop rect={rel} src={toSrc} sr={toSr} opacity={m} />
    </div>
  );
};

const DESK_FACES: CropSrc = { kind: 'img', url: 'agents/A/desks_faces.png' };
const DESK_PRE: CropSrc = { kind: 'img', url: 'agents/A/desks_pre.png' };
const MEET_END_IMG: CropSrc = { kind: 'img', url: 'agents/A/meeting_end.png' };

const pad = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });

// ---------------------------------------------------------------- subtitles
const DUR: Record<string, number> = {
  n01: 4.19, n02: 6.4, n03: 3.98, n04: 2.79, n05: 8.56, n06: 1.78, n07: 2.92, n08: 2.53, n09: 2.22, n10: 4.64, n11: 4.81,
  s01: 2.0, s02: 1.96, s03: 1.14, s04: 2.01, s05: 1.0, s06: 2.29,
};
type Sub = { t0: number; t1: number; who: string; text: string };
const chunk = (text: string, max = 58): string[] => {
  const sentences = text.match(/[^.!?]+[.!?]?/g)!.map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length <= max) cur = (cur + ' ' + s).trim();
    else {
      if (cur) out.push(cur);
      cur = s;
    }
  }
  if (cur) out.push(cur);
  const fin: string[] = [];
  for (const c of out) {
    if (c.length <= max + 12) fin.push(c);
    else {
      const words = c.split(' ');
      const half = Math.ceil(words.length / 2);
      fin.push(words.slice(0, half).join(' '), words.slice(half).join(' '));
    }
  }
  return fin;
};
const SUBS: Sub[] = [];
const addSubs = (t0: number, dur: number, who: string, text: string) => {
  const cs = chunk(text);
  const total = cs.reduce((a, c) => a + c.length + 6, 0);
  let t = t0;
  for (const c of cs) {
    const d = (dur * (c.length + 6)) / total;
    SUBS.push({ t0: t, t1: t + d, who, text: c });
    t += d;
  }
};
cues.vo.forEach((v) => {
  if (v.id === 'n05') {
    const parts: [number, number, string][] = [
      [0.0, 1.6, 'Every agent gets its own computer.'],
      [2.06, 3.43, "Maya's code goes to her desk."],
      [3.73, 4.78, "Priya's post to hers."],
      [5.12, 6.48, "Jonas's research to his."],
      [6.85, 8.17, "Ines's designs to hers."],
    ];
    parts.forEach(([a, b, tx]) => SUBS.push({ t0: v.t + a, t1: v.t + b + 0.25, who: v.who, text: tx }));
  } else addSubs(v.t, DUR[v.id] - 0.1, v.who, v.text);
});
cues.chars.forEach((c) => addSubs(c.t, c.to - c.from, c.who, c.text));

const Subtitles: React.FC<{ t: number }> = ({ t }) => {
  const s = SUBS.find((x) => t >= x.t0 && t < x.t1 + 0.12);
  if (!s) return null;
  const o = prog(t, s.t0, s.t0 + 0.12, E_OUT) * (1 - prog(t, s.t1, s.t1 + 0.12, E_IO));
  const named = s.who !== 'narrator';
  return (
    <div style={{ position: 'absolute', left: 0, width: W, top: 1004, height: 56, display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: o }}>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 31,
          fontWeight: 600,
          letterSpacing: 0.1,
          color: '#fff',
          background: 'rgba(10,11,14,0.66)',
          padding: '7px 22px 8px',
          borderRadius: 14,
          whiteSpace: 'nowrap',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
        }}
      >
        {named ? <span style={{ color: TINT_BY[s.who], fontWeight: 800, marginRight: 12 }}>{NAME_BY[s.who]}</span> : null}
        {s.text}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- notifications and bubbles
const Avatar: React.FC<{ src: string; size: number; ring?: string }> = ({ src, size, ring }) => (
  <Img src={staticFile(src)} style={{ width: size, height: size, borderRadius: size, objectFit: 'cover', boxShadow: ring ? `0 0 0 3px ${ring}` : undefined, flex: `0 0 ${size}px` }} />
);

const Bubble: React.FC<{ t: number; t0: number; t1: number; t2: number; from: Rect; to: Rect; who: number; text: string }> = ({ t, t0, t1, t2, from, to, who, text }) => {
  if (t < t0 || t > t2 + 0.3) return null;
  const pin = prog(t, t0, t0 + 0.35, E_OUT);
  const fly = prog(t, t0 + 0.2, t1, E_FLY2);
  const out = 1 - prog(t, t2, t2 + 0.3, E_IO);
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;
  const tx = to.x + to.w / 2;
  const ty = to.y + to.h / 2;
  const x = lerp(fx, tx, fly);
  const y = lerp(fy, ty, fly) - 110 * Math.sin(Math.PI * fly);
  const sc = lerp(0.85, 1, pin) * lerp(1, 0.94, fly);
  const w = 372;
  const names = ['Maya', 'Priya', 'Jonas', 'Ines'];
  const imgs = ['maya', 'priya', 'jonas', 'ines'];
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y - 52,
        width: w,
        opacity: pin * out,
        transform: `scale(${sc}) rotate(${(0.5 - fly) * 2.2}deg)`,
        background: '#fff',
        color: '#1b1d22',
        borderRadius: 18,
        padding: '13px 16px 14px',
        fontFamily: FONT,
        boxShadow: '0 18px 44px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.06)',
        display: 'flex',
        gap: 12,
      }}
    >
      <Avatar src={`img/${imgs[who]}-sq.jpg`} size={38} ring={TINT[who]} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: TINT[who], marginBottom: 2 }}>{names[who]}</div>
        <div style={{ fontSize: 17, lineHeight: '23px', fontWeight: 500 }}>{text}</div>
      </div>
    </div>
  );
};

const PriyaNotification: React.FC<{ t: number }> = ({ t }) => {
  const a = 109.0;
  if (t < a || t > 112.2) return null;
  const inP = prog(t, a, a + 1.1, Easing.bezier(0.22, 0.9, 0.3, 1));
  const outP = prog(t, 111.0, 111.6, E_IN);
  const y = lerp(-130, 30, inP) - 160 * outP;
  return (
    <div
      style={{
        position: 'absolute',
        left: 1430,
        top: y,
        width: 440,
        opacity: inP * (1 - outP),
        background: 'rgba(255,255,255,0.98)',
        borderRadius: 20,
        padding: '15px 18px',
        fontFamily: FONT,
        color: '#1b1d22',
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        boxShadow: '0 22px 60px rgba(0,0,0,0.38), 0 0 0 1px rgba(0,0,0,0.06)',
      }}
    >
      <Avatar src="img/priya-sq.jpg" size={56} ring={TINT[1]} />
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: TINT[1] }}>Priya Raman</div>
        <div style={{ fontSize: 18, lineHeight: '24px', fontWeight: 500 }}>The launch post is now a styled web page.</div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- approval card (real crop of the thread)
const APPROVE_SR: Rect = { x: 800, y: 885, w: 1240, h: 180 };
const APPROVE_CARD: Rect = { x: 510, y: 56, w: 900, h: 131 };
const approveBtn = () => {
  const kx = APPROVE_CARD.w / APPROVE_SR.w;
  const ky = APPROVE_CARD.h / APPROVE_SR.h;
  return { x: APPROVE_CARD.x + (1905 - APPROVE_SR.x) * kx, y: APPROVE_CARD.y + (986 - APPROVE_SR.y) * ky };
};
const AP_IN = 93.3;
const AP_CLICK = 96.0;
const AP_OUT = 97.0;
const ApproveCard: React.FC<{ t: number }> = ({ t }) => {
  if (t < AP_IN || t > AP_OUT + 0.6) return null;
  const inP = prog(t, AP_IN, AP_IN + 1.0, Easing.bezier(0.22, 0.9, 0.3, 1));
  const outP = prog(t, AP_OUT, AP_OUT + 0.55, E_IN);
  const y = lerp(-170, 0, inP) - 190 * outP;
  const rect: Rect = { ...APPROVE_CARD, y: APPROVE_CARD.y + y };
  const btn = approveBtn();
  // cursor: arrives from upper right, hovers, clicks at AP_CLICK
  const cIn = prog(t, 94.7, 95.75, E_IO);
  const cx = lerp(1500, btn.x, cIn);
  const cy = lerp(-40, btn.y, cIn) + y * 0.0;
  const press = t > AP_CLICK && t < AP_CLICK + 0.13;
  const ring = prog(t, AP_CLICK, AP_CLICK + 0.5, E_OUT);
  return (
    <>
      <div style={{ ...abs({ x: rect.x - 14, y: rect.y - 12, w: rect.w + 28, h: rect.h + 24 }), borderRadius: 24, background: '#fff', boxShadow: '0 24px 70px rgba(0,0,0,0.42)', opacity: inP * (1 - outP) }} />
      <div style={{ opacity: inP * (1 - outP) }}>
        <MediaCrop
          rect={rect}
          src={{ kind: 'vid', url: 'media/raw/approve.mp4', edit0: AP_IN, edit1: AP_OUT + 0.7, take0: AP_IN - 92.7 }}
          sr={APPROVE_SR}
          radius={10}
        />
      </div>
      {t > 94.7 && t < AP_OUT ? (
        <div style={{ position: 'absolute', left: cx, top: cy + (t > 95.75 ? y : 0), opacity: cIn * (1 - prog(t, 96.6, 96.9, E_IO)), transform: `scale(${press ? 0.86 : 1})`, transformOrigin: '2px 2px', zIndex: 5 }}>
          <svg width="28" height="34" viewBox="0 0 26 32">
            <path d="M3 2 L3 24 L9 18.5 L13 28 L17 26.3 L13 17 L21 17 Z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
      ) : null}
      {t > AP_CLICK && t < AP_CLICK + 0.6 ? (
        <div style={{ position: 'absolute', left: btn.x - 30, top: btn.y - 30, width: 60, height: 60, borderRadius: 60, border: '3px solid rgba(91,140,255,0.9)', opacity: 1 - ring, transform: `scale(${0.4 + ring})` }} />
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------- the end card
const MARK = { x0: 811, y0: 150, u: 1.4 }; // svg viewBox 213 -> 298 px
const markTile = (i: number): Rect => {
  const s = 100 * MARK.u;
  const g = 13 * MARK.u;
  return { x: MARK.x0 + (i % 2) * (s + g), y: MARK.y0 + Math.floor(i / 2) * (s + g), w: s, h: s };
};
const MARK_COL = ['#72a3fe', '#fd9e3d', '#f874a9', '#47d9a0'];
const END0 = 111.0;

const EndCard: React.FC<{ t: number }> = ({ t }) => {
  if (t < END0) return null;
  const plateFade = prog(t, END0 + 0.1, END0 + 0.65, E_IO);
  const m = prog(t, END0 + 0.45, END0 + 1.95, Easing.bezier(0.5, 0, 0.15, 1));
  const col = prog(t, END0 + 1.2, END0 + 1.8, E_IO);
  const svgIn = prog(t, END0 + 1.9, END0 + 2.3, E_IO);
  const wm = prog(t, 112.6, 113.3, E_OUT);
  const tg = prog(t, 113.2, 113.9, E_OUT);
  const fc = (i: number) => prog(t, 113.9 + i * 0.14, 114.5 + i * 0.14, Easing.bezier(0.3, 1.3, 0.5, 1));
  const ln = prog(t, 114.8, 115.5, E_OUT);
  return (
    <Layer>
      {t < END0 + 2.4 ? (
        <>
          {/* the desks plate dissolves, the four tiles stay and become the mark */}
          {TILE_PX.map((tp, i) => {
            const from = tileW(i);
            const to = markTile(i);
            const r = lerpRect(from, to, m);
            const rad = lerp(9, to.w * 0.3, m);
            return (
              <div key={i} style={{ ...abs(r), borderRadius: rad, overflow: 'hidden', opacity: 1 - svgIn }}>
                <MediaCrop rect={{ x: 0, y: 0, w: r.w, h: r.h }} src={DESK_FACES} sr={tp} />
                <div style={{ position: 'absolute', inset: 0, background: MARK_COL[i], opacity: col }} />
              </div>
            );
          })}
        </>
      ) : null}
      <div style={{ ...abs({ x: MARK.x0, y: MARK.y0, w: 213 * MARK.u, h: 213 * MARK.u }), opacity: svgIn }}>
        <Img src={staticFile('img/deskmates-mark.svg')} style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 482, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 92, letterSpacing: -1.5, color: '#F3F4F7', opacity: wm, transform: `translateY(${(1 - wm) * 16}px)` }}>
        Deskmates
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 598, textAlign: 'center', fontFamily: FONT, fontWeight: 500, fontSize: 34, color: '#AEB4C2', opacity: tg, transform: `translateY(${(1 - tg) * 12}px)` }}>
        Your AI team, with a desk, a face, and a seat at the table.
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 700, display: 'flex', justifyContent: 'center', gap: 38 }}>
        {['maya', 'priya', 'jonas', 'ines'].map((n, i) => (
          <div key={n} style={{ opacity: fc(i), transform: `scale(${lerp(0.6, 1, fc(i))})` }}>
            <Avatar src={`img/${n}-sq.jpg`} size={116} ring={TINT[i]} />
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 0, width: W, top: 880, textAlign: 'center', fontFamily: FONT, fontWeight: 500, fontSize: 22, color: '#7B8191', opacity: ln, letterSpacing: 0.3 }}>
        Built with Cua · Claude Agent SDK · Synthesia · Databricks · Astryx
      </div>
    </Layer>
  );
};

// ---------------------------------------------------------------- main
export const Main: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = poseAt(KFS, t);
  const camStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: W,
    height: H,
    transformOrigin: '0 0',
    transform: `translate(${W / 2 - cam.cx * cam.z}px, ${H / 2 - cam.cy * cam.z}px) scale(${cam.z})`,
  };

  const WINR: Rect = { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h };
  const inEnd = t >= END0;

  // ---- desks plate
  const desksIn = prog(t, 24.0, 25.0, E_OUT);
  const desksOut = inEnd ? 1 - prog(t, END0 + 0.1, END0 + 0.65, E_IO) : 1;
  const desksOpacity = desksIn * desksOut;
  const rise = lerp(16, 0, desksIn);
  const macOpacity = 1 - prog(t, 24.0, 26.2, E_IO);
  const macScale = lerp(1, 0.965, prog(t, 24.0, 26.4, E_IO));

  // tile placeholders fade at each landing
  const ph = PILE.filter((w) => w.dest);
  const phIdx: Record<string, number> = { maya: 0, priya: 1, jonas: 2, ines: 3 };

  // face patches (hide the card of the real tile)
  const hidden = (i: number) => {
    if (t >= MEET_FLY_IN + 0.1 * i - 0.001 && t < MEET_RET1 - 0.1 * (3 - i) + 0.02) return true; // meeting
    if (i === 0 && ((t >= 39.95 && t < 41.3) || (t >= 48.3 && t < 49.9 + 0.02))) return true; // call morph
    return false;
  };

  // meeting plate opacity
  const meetO = prog(t, 52.4, 53.0, E_SOFT) * (1 - prog(t, MEET_RET0 + 0.1, MEET_RET0 + 0.7, E_SOFT));
  // call plate + veil
  const callO = prog(t, 40.55, 41.15, E_SOFT) * (1 - prog(t, 48.35, 48.95, E_SOFT));
  const veilO = prog(t, 40.3, 41.15, E_SOFT) * (1 - prog(t, 48.35, 49.4, E_SOFT));
  // team slide
  const teamIn = prog(t, 97.3, 98.25, Easing.bezier(0.25, 0.9, 0.3, 1));
  const teamOut = prog(t, 108.3, 109.2, Easing.bezier(0.5, 0, 0.3, 1));
  const teamY = (1 - teamIn) * 1100 + teamOut * 1100;

  const callTake = (e: number) => e - CALL_OFFSET;

  return (
    <Theme theme={neutralTheme}>
      <AbsoluteFill style={{ background: BG, overflow: 'hidden', fontFamily: FONT }}>
        <div style={camStyle}>
          {/* Sam's Mac */}
          <Layer style={{ transform: `scale(${macScale})`, transformOrigin: '960px 540px' }}>
            <MacBase t={t} opacity={macOpacity} />
          </Layer>

          {/* desks window */}
          <Layer style={{ opacity: desksOpacity, transform: `translateY(${rise}px)` }}>
            <Plate rect={WINR}>
              {t < DESKS_VIDEO_END ? (
                <Vid src="media/raw/desks.mp4" edit0={24.0} edit1={DESKS_VIDEO_END + 0.1} take0={24.0 - DESKS_OFFSET} />
              ) : (
                <Img src={staticFile('agents/A/desks_faces.png')} style={{ width: '100%', height: '100%', display: 'block' }} />
              )}
            </Plate>
            {ph.map((w) => {
              const i = phIdx[w.id];
              const o = 1 - prog(t, ARRIVE(w) - 0.05, ARRIVE(w) + 0.32, E_IO);
              if (o <= 0.001) return null;
              const r = tileW(i);
              return <div key={w.id} style={{ ...abs(r), borderRadius: 8, background: '#1c2029', opacity: o, boxShadow: `inset 0 0 0 1px ${TINT[i]}33` }} />;
            })}
            {[0, 1, 2, 3].map((i) =>
              hidden(i) ? <MediaCrop key={i} rect={pad(cardW(i), 4)} src={DESK_PRE} sr={pad(cardPx(i), 4 / 0.6)} /> : null
            )}
          </Layer>

          {/* the pile and the windows that fly onto the desks */}
          <Layer>
            <PileLayer t={t} />
          </Layer>
          <Layer>
            <LogWindow t={t} />
            <MarkHighlight t={t} />
            <MenuPopover t={t} />
            <Cursor t={t} clickAt={[23.1, 23.72]} />
          </Layer>

          {/* call with Maya: the camera lands her tile exactly on the call's desktop panel */}
          <Layer>
            <div style={{ ...abs(tileW(0)), borderRadius: 8, boxShadow: `0 0 0 5000px ${BG}`, opacity: veilO }} />
            {callO > 0.001 ? (
              <div style={{ opacity: callO }}>
                <Plate rect={CALL_PLATE} radiusScale={1 / CALL_Z}>
                  <Vid src="media/raw/call.mp4" edit0={40.4} edit1={49.2} take0={callTake(40.4)} />
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '85.5%', bottom: 0, background: '#1a1a1a' }} />
                </Plate>
              </div>
            ) : null}
            <FaceFlyer
              t={t}
              t0={39.95}
              t1={41.2}
              from={cardW(0)}
              to={CALL_FACE_WORLD}
              fromSrc={DESK_FACES}
              fromSr={cardPx(0)}
              toSrc={{ kind: 'vid', url: 'media/raw/call.mp4', edit0: 39.95, edit1: 41.3, take0: callTake(39.95) }}
              toSr={{ x: CALL_FACE.x * 2560, y: CALL_FACE.y * 1600, w: CALL_FACE.w * 2560, h: CALL_FACE.h * 1600 }}
              r0={12}
              r1={10}
              mix={[0.35, 0.8]}
            />
            <FaceFlyer
              t={t}
              t0={48.3}
              t1={49.9}
              from={CALL_FACE_WORLD}
              to={cardW(0)}
              fromSrc={{ kind: 'vid', url: 'media/raw/call.mp4', edit0: 48.3, edit1: 50.0, take0: callTake(48.3) }}
              fromSr={{ x: CALL_FACE.x * 2560, y: CALL_FACE.y * 1600, w: CALL_FACE.w * 2560, h: CALL_FACE.h * 1600 }}
              toSrc={DESK_FACES}
              toSr={cardPx(0)}
              r0={10}
              r1={12}
              mix={[0.25, 0.7]}
            />
          </Layer>

          {/* the standup */}
          <Layer>
            {meetO > 0.001 ? (
              <div style={{ opacity: meetO }}>
                <Plate rect={WINR}>
                  {t < MEET_END ? (
                    MEET_PIECES.map((p, k) => {
                      const next = MEET_PIECES[k + 1];
                      const start = k === 0 ? p.e0 : p.e0 - DISS / 2;
                      const end = next ? next.e0 + DISS / 2 + 0.05 : MEET_END + 0.1;
                      if (t < start || t > end) return null;
                      const o = k === 0 ? 1 : prog(t, p.e0 - DISS / 2, p.e0 + DISS / 2, E_SOFT);
                      return (
                        <div key={k} style={{ position: 'absolute', inset: 0, opacity: o }}>
                          <Vid src="media/raw/meeting.mp4" edit0={start} edit1={end} take0={p.take0 + (start - p.e0)} />
                        </div>
                      );
                    })
                  ) : (
                    <Img src={staticFile('agents/A/meeting_end.png')} style={{ width: '100%', height: '100%', display: 'block' }} />
                  )}
                  {[0, 1, 2, 3].map((i) => {
                    const r = meetW(i);
                    const gone = t < MEET_LAND + 0.05 * i - 0.01 || t >= MEET_RET0 + 0.1 * i;
                    return gone ? <div key={i} style={{ ...abs({ x: r.x - WIN.x - 2, y: r.y - WIN.y - 2, w: r.w + 4, h: r.h + 4 }), background: '#1a1a1a' }} /> : null;
                  })}
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '85.5%', bottom: 0, background: '#1a1a1a' }} />
                </Plate>
              </div>
            ) : null}
            {[0, 1, 2, 3].map((i) => (
              <React.Fragment key={i}>
                <FaceFlyer
                  t={t}
                  t0={MEET_FLY_IN + 0.1 * i}
                  t1={MEET_LAND + 0.05 * i}
                  from={cardW(i)}
                  to={meetW(i)}
                  fromSrc={DESK_FACES}
                  fromSr={cardPx(i)}
                  toSrc={{ kind: 'vid', url: 'media/raw/meeting.mp4', edit0: MEET_FLY_IN, edit1: MEET_LAND + 0.3, take0: 7.6 - 0.2 }}
                  toSr={MEET_PX[i]}
                  r0={12}
                  r1={14}
                  mix={[0.3, 0.75]}
                />
                <FaceFlyer
                  t={t}
                  t0={MEET_RET0 + 0.1 * i}
                  t1={MEET_RET1 - 0.1 * (3 - i)}
                  from={meetW(i)}
                  to={cardW(i)}
                  fromSrc={MEET_END_IMG}
                  fromSr={MEET_PX[i]}
                  toSrc={DESK_FACES}
                  toSr={cardPx(i)}
                  r0={14}
                  r1={12}
                  mix={[0.3, 0.75]}
                />
              </React.Fragment>
            ))}
          </Layer>

          {/* desk-to-desk messages */}
          <Layer>
            <Bubble t={t} t0={88.9} t1={90.3} t2={91.0} from={tileW(1)} to={tileW(2)} who={1} text="Could you send me one line on how competitors handle discount vs tax order?" />
            <Bubble t={t} t0={91.05} t1={92.35} t2={92.95} from={tileW(2)} to={tileW(1)} who={2} text="Shopify's help docs say discounts come off the subtotal before tax, so we match them." />
          </Layer>

          {/* the Team view */}
          {t > 97.2 && t < 109.4 ? (
            <Layer style={{ transform: `translateY(${teamY}px)` }}>
              <Plate rect={WINR} bg="#fdfdfd">
                <Vid src="media/raw/team.mp4" edit0={97.3} edit1={103.0} take0={0.3} rate={1} />
                <Vid src="media/raw/team.mp4" edit0={103.0} edit1={105.07} take0={6.0} rate={8} />
                <Vid src="media/raw/team.mp4" edit0={105.07} edit1={109.4} take0={22.5} rate={1} />
              </Plate>
            </Layer>
          ) : null}
        </div>

        {/* screen-space overlays */}
        <Layer>
          <div style={{ transformOrigin: '0 0', transform: `translate(${W / 2 - cam.cx * cam.z}px, ${H / 2 - cam.cy * cam.z}px) scale(${cam.z})` }}>
            <ApproveCard t={t} />
          </div>
        </Layer>
        <Layer>
          <PriyaNotification t={t} />
        </Layer>
        <EndCard t={t} />
        <Layer>
          <Subtitles t={t} />
        </Layer>
        <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: 1 - prog(t, 0, 1.1, E_SOFT) + prog(t, 118.3, 120, E_SOFT) }} />
      </AbsoluteFill>
    </Theme>
  );
};
