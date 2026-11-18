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
const MENU: Pose = { cx: 1483, cy: 245, z: 2.2 }; // the menu bar, readable
const BADGE: Pose = { cx: 1000, cy: 430, z: 1.15 }; // Ines's "Chosen: Version B"
const KPI: Pose = { cx: 990, cy: 330, z: 1.2 }; // the Team view's numbers
const KFS: KF[] = [
  { t: 0, pose: { cx: 960, cy: 540, z: 1.07 } },
  { t: 5.5, pose: GRID, e: E_OUT },
  { t: 13.3, pose: GRID },
  { t: 16.4, pose: { cx: 960, cy: 552, z: 1.22 } },
  { t: 19.5, pose: { cx: 960, cy: 552, z: 1.27 } },
  { t: 21.4, pose: GRID },
  { t: 22.0, pose: GRID },
  { t: 22.95, pose: MENU },
  { t: 23.85, pose: MENU },
  { t: 26.6, pose: GRID, e: E_OUT },
  { t: 27.8, pose: GRID },
  { t: 28.85, pose: tilePose(0) },
  { t: 29.7, pose: tilePose(0) },
  { t: 30.6, pose: tilePose(1) },
  { t: 31.3, pose: tilePose(1) },
  { t: 32.0, pose: tilePose(2) },
  { t: 33.0, pose: tilePose(2) },
  { t: 33.7, pose: tilePose(3) },
  { t: 35.0, pose: tilePose(3) },
  { t: 36.6, pose: GRID },
  { t: 40.0, pose: GRID },
  { t: 41.6, pose: P_CALL },
  { t: 48.3, pose: P_CALL },
  { t: 49.9, pose: GRID },
  { t: 82.1, pose: GRID },
  { t: 83.1, pose: BADGE },
  { t: 83.6, pose: BADGE },
  { t: 84.5, pose: GRID },
  { t: 96.4, pose: GRID },
  { t: 98.0, pose: KPI },
  { t: 101.3, pose: KPI },
  { t: 102.6, pose: GRID },
];

// ---------------------------------------------------------------- timeline constants
const DESKS_OFFSET = 14.0; // desks take = edit - 14
const DESKS_VIDEO_END = 52.6;
const CALL_OFFSET = 32.06; // call take = edit - 32.06 (Maya's line starts 10.14 at 42.2)
const MEET_FLY_IN = 52.2;
const MEET_LAND = 54.3;
const MEET_RET0 = 84.75;
const MEET_RET1 = 86.85;

// meeting take mapping pieces: from edit time e0, take = e0Take + (edit - e0)
const MEET_PIECES: { e0: number; take0: number; cut?: boolean }[] = [
  { e0: 52.4, take0: 7.6 }, // faces land, quiet
  { e0: 54.6, take0: 21.0 }, // quiet, then Maya's update
  { e0: 65.2, take0: 31.75, cut: true }, // Maya's desktop (the app's empty switch frames skipped, morph covers the join)
  { e0: 67.0, take0: 42.87 }, // Maya's desktop, matching frames
  { e0: 67.25, take0: 43.27, cut: true }, // Jonas's desktop on "Jonas?" (push covers the join)
  { e0: 69.8, take0: 47.7 }, // Jonas speaks, matching frames
  { e0: 74.6, take0: 54.48 }, // Jonas's desktop, matching frames
  { e0: 74.75, take0: 54.75, cut: true }, // Ines's desktop on "Ines" (push covers the join)
  { e0: 76.9, take0: 71.9 }, // Ines speaks, matching frames
  { e0: 81.9, take0: 79.5 }, // quiet, matching frames
  { e0: 83.5, take0: 84.17 }, // unpin at 84.2 (morph covers it)
];
const MEET_END = 84.72; // freeze on meeting_end.png after this
const DISS = 0.4;

// ---------------------------------------------------------------- share switches (golden)
// The app switches shares instantly; these overlays turn each switch into a smooth move between the real frames.
const KP = 0.6; // take px -> plate px
const pr = (r: Rect): Rect => ({ x: r.x * KP, y: r.y * KP, w: r.w * KP, h: r.h * KP });
const MAIN_PX: Rect = { x: 48, y: 162, w: 1840, h: 1148 };
const STRIP_PX: Rect[] = [
  { x: 1920, y: 162, w: 284, h: 562 },
  { x: 2228, y: 162, w: 284, h: 562 },
  { x: 1920, y: 748, w: 284, h: 562 },
  { x: 2228, y: 748, w: 284, h: 562 },
];
const STAGE = '#1b1b1b';
const STILL = (take: string): CropSrc => ({ kind: 'img', url: `agents/golden/meet_${take}.png` });
const meetVid = (e0: number, e1: number, take0: number): CropSrc => ({ kind: 'vid', url: 'media/raw/meeting.mp4', edit0: e0, edit1: e1, take0 });
const COVER: Rect = { x: 0, y: 150 * KP, w: 2560 * KP, h: 1170 * KP }; // between the title and the control bar

// grid <-> spotlight: the faces glide between grid and strip, the shared desktop grows in (or shrinks away)
const LayoutMorph: React.FC<{ t: number; t0: number; d: number; from: CropSrc; to: CropSrc; toGrid?: boolean }> = ({ t, t0, d, from, to, toGrid }) => {
  if (t < t0 || t > t0 + d + 0.02) return null;
  const p = prog(t, t0, t0 + d, E_IO);
  const m = prog(p, 0.25, 0.8, E_SOFT);
  const main = pr(MAIN_PX);
  const ms = toGrid ? lerp(1, 0.9, p) : lerp(0.9, 1, p);
  const mo = toGrid ? 1 - prog(p, 0, 0.7, E_SOFT) : prog(p, 0.15, 1, E_SOFT);
  const mainSrc = toGrid ? from : to;
  return (
    <>
      <div style={{ ...abs(COVER), background: STAGE }} />
      <div style={{ ...abs(main), transform: `scale(${ms})`, transformOrigin: '50% 50%', opacity: mo }}>
        <MediaCrop rect={{ x: 0, y: 0, w: main.w, h: main.h }} src={mainSrc} sr={MAIN_PX} radius={12} />
      </div>
      {[0, 1, 2, 3].map((i) => {
        const a = pr(toGrid ? STRIP_PX[i] : MEET_PX[i]);
        const b = pr(toGrid ? MEET_PX[i] : STRIP_PX[i]);
        const r = lerpRect(a, b, p);
        const rel = { x: 0, y: 0, w: r.w, h: r.h };
        return (
          <div key={i} style={{ ...abs(r), borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
            <MediaCrop rect={rel} src={from} sr={toGrid ? STRIP_PX[i] : MEET_PX[i]} opacity={1 - m} />
            <MediaCrop rect={rel} src={to} sr={toGrid ? MEET_PX[i] : STRIP_PX[i]} opacity={m} />
          </div>
        );
      })}
    </>
  );
};

// spotlight -> spotlight: the outgoing share slides out left, the incoming one slides in from the right
const SharePush: React.FC<{ t: number; t0: number; d: number; from: CropSrc; to: CropSrc }> = ({ t, t0, d, from, to }) => {
  if (t < t0 || t > t0 + d + 0.02) return null;
  const p = prog(t, t0, t0 + d, E_IO);
  const main = pr(MAIN_PX);
  const sh = main.w * 0.22;
  return (
    <div style={{ ...abs(main), overflow: 'hidden', borderRadius: 12, background: STAGE }}>
      <MediaCrop rect={{ x: -sh * p, y: 0, w: main.w, h: main.h }} src={from} sr={MAIN_PX} opacity={1 - prog(p, 0, 0.75, E_SOFT)} />
      <MediaCrop rect={{ x: sh * (1 - p), y: 0, w: main.w, h: main.h }} src={to} sr={MAIN_PX} opacity={prog(p, 0.2, 1, E_SOFT)} />
    </div>
  );
};

// hold a strip face still while that person mouths words that were cut from the audio
const Hold: React.FC<{ t: number; t0: number; t1: number; i: number; still: string }> = ({ t, t0, t1, i, still }) =>
  t >= t0 && t < t1 ? <MediaCrop rect={pr(STRIP_PX[i])} src={STILL(still)} sr={STRIP_PX[i]} radius={10} /> : null;

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
// golden: every cue starts on its first word and ends on its last (word timings from the voice files and the takes)
const SUBS: Sub[] = (
  [
    [0.6, 4.46, 'narrator', "This is Sam's Mac. Sam runs a startup with four AI agents."],
    [6.0, 9.2, 'narrator', 'A coder, a marketer, a researcher and a designer.'],
    [9.42, 11.9, 'narrator', 'All working at once, in one pile of windows.'],
    [13.4, 14.2, 'narrator', "Who's doing what?"],
    [14.36, 16.95, 'narrator', 'Like every founder, Sam scrolls through logs.'],
    [19.4, 21.75, 'narrator', 'Now watch what happens when Sam opens Deskmates.'],
    [27.0, 28.75, 'narrator', 'Every agent gets its own computer.'],
    [29.06, 30.5, 'narrator', "Maya's code goes to her desk."],
    [30.73, 31.95, 'narrator', "Priya's post to hers."],
    [32.12, 33.6, 'narrator', "Jonas's research to his."],
    [33.85, 35.35, 'narrator', "Ines's designs to hers."],
    [36.8, 38.2, 'narrator', 'And every agent gets a face.'],
    [42.2, 43.9, 'maya', 'Hi Sam, Maya here.'],
    [44.34, 45.84, 'maya', "I'm on the checkout discount bug,"],
    [45.84, 48.0, 'maya', 'and the push is waiting on your go-ahead.'],
    [48.9, 51.45, 'narrator', 'So Sam can talk to the team, face to face.'],
    [52.0, 53.55, 'sam', 'Okay team, standup!'],
    [54.9, 56.4, 'sam', 'Maya, show me the fix?'],
    [57.8, 59.9, 'maya', 'Morning, all. Quick update from me.'],
    [59.92, 62.2, 'maya', 'The checkout discount bug is found and fixed,'],
    [62.32, 65.3, 'maya', 'tests are run, and the commit is on fix/checkout-discount.'],
    [67.1, 67.75, 'sam', 'Jonas?'],
    [70.42, 74.45, 'jonas', 'The pricing chart is at work/pricing.html'],
    [74.6, 76.85, 'sam', 'Ines, what about onboarding?'],
    [78.4, 81.8, 'ines', 'Both versions now have two screens each.'],
    [82.1, 83.7, 'sam', 'Version B. Ship it.'],
    [86.45, 88.65, 'narrator', 'Then they get back to work, and they help each other.'],
    [91.15, 92.95, 'narrator', 'Big steps still come to Sam first.'],
    [93.65, 94.45, 'sam', 'Approve.'],
    [95.55, 98.5, 'narrator', 'Every hour, task and dollar is on the record in Databricks,'],
    [98.59, 99.9, 'narrator', 'so Sam can just ask.'],
    [108.75, 111.5, 'narrator', 'Deskmates. Your AI team, with a desk,'],
    [111.63, 113.1, 'narrator', 'a face, and a seat at the table.'],
  ] as [number, number, string, string][]
).map(([t0, t1, who, text]) => ({ t0, t1, who, text }));
void chunk;
void DUR;

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
  const a = 106.6;
  if (t < a || t > 109.4) return null;
  const inP = prog(t, a, a + 1.0, Easing.bezier(0.22, 0.9, 0.3, 1));
  const outP = prog(t, 108.75, 109.3, E_IN);
  const y = lerp(-130, 8, inP) - 160 * outP;
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
const AP_IN = 91.45;
const AP_CLICK = 93.85;
const AP_OUT = 95.15;
const ApproveCard: React.FC<{ t: number }> = ({ t }) => {
  if (t < AP_IN || t > AP_OUT + 0.6) return null;
  const inP = prog(t, AP_IN, AP_IN + 1.0, Easing.bezier(0.22, 0.9, 0.3, 1));
  const outP = prog(t, AP_OUT, AP_OUT + 0.55, E_IN);
  const y = lerp(-170, 0, inP) - 190 * outP;
  const rect: Rect = { ...APPROVE_CARD, y: APPROVE_CARD.y + y };
  const btn = approveBtn();
  // cursor: arrives from upper right, hovers, clicks at AP_CLICK
  const cIn = prog(t, 92.85, 93.6, E_IO);
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
          src={{ kind: 'vid', url: 'media/raw/approve.mp4', edit0: AP_IN, edit1: AP_OUT + 0.7, take0: 0.9 }}
          sr={APPROVE_SR}
          radius={10}
        />
      </div>
      {t > 92.85 && t < AP_OUT ? (
        <div style={{ position: 'absolute', left: cx, top: cy + (t > 93.6 ? y : 0), opacity: cIn * (1 - prog(t, 94.75, 95.05, E_IO)), transform: `scale(${press ? 0.86 : 1})`, transformOrigin: '2px 2px', zIndex: 5 }}>
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
const END0 = 109.15;

const EndCard: React.FC<{ t: number }> = ({ t }) => {
  if (t < END0) return null;
  const plateFade = prog(t, END0 + 0.1, END0 + 0.65, E_IO);
  const m = prog(t, END0 + 0.45, END0 + 1.95, Easing.bezier(0.5, 0, 0.15, 1));
  const col = prog(t, END0 + 1.2, END0 + 1.8, E_IO);
  const svgIn = prog(t, END0 + 1.9, END0 + 2.3, E_IO);
  const wm = prog(t, 110.75, 111.45, E_OUT);
  const tg = prog(t, 113.25, 113.95, E_OUT); // after the narrator's subtitle has gone, so the line is never doubled
  const fc = (i: number) => prog(t, 113.9 + i * 0.14, 114.5 + i * 0.14, Easing.bezier(0.3, 1.3, 0.5, 1));
  const ln = prog(t, 114.9, 115.6, E_OUT);
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
    if (i === 0 && ((t >= 40.35 && t < 41.7) || (t >= 48.3 && t < 49.9 + 0.02))) return true; // call morph
    return false;
  };

  // meeting plate opacity
  const meetO = prog(t, 52.4, 53.0, E_SOFT) * (1 - prog(t, MEET_RET0 + 0.1, MEET_RET0 + 0.7, E_SOFT));
  // call plate + veil
  const callO = prog(t, 40.95, 41.55, E_SOFT) * (1 - prog(t, 48.35, 48.95, E_SOFT));
  const veilO = prog(t, 40.7, 41.65, E_SOFT) * (1 - prog(t, 48.35, 49.5, E_SOFT));
  // team slide
  const teamIn = prog(t, 95.45, 96.4, Easing.bezier(0.25, 0.9, 0.3, 1));
  const teamOut = prog(t, 106.45, 107.35, Easing.bezier(0.5, 0, 0.3, 1));
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
                  <Vid src="media/raw/call.mp4" edit0={40.8} edit1={49.2} take0={callTake(40.8)} />
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '85.5%', bottom: 0, background: '#1a1a1a' }} />
                </Plate>
              </div>
            ) : null}
            <FaceFlyer
              t={t}
              t0={40.35}
              t1={41.6}
              from={cardW(0)}
              to={CALL_FACE_WORLD}
              fromSrc={DESK_FACES}
              fromSr={cardPx(0)}
              toSrc={{ kind: 'vid', url: 'media/raw/call.mp4', edit0: 40.35, edit1: 41.7, take0: callTake(40.35) }}
              toSr={{ x: CALL_FACE.x * 2560, y: CALL_FACE.y * 1600, w: CALL_FACE.w * 2560, h: CALL_FACE.h * 1600 }}
              r0={12}
              r1={10}
              mix={[0.8, 1.0]}
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
              mix={[0.0, 0.2]}
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
                      const start = k === 0 || p.cut ? p.e0 : p.e0 - DISS / 2;
                      const end = next ? (next.cut ? next.e0 + 0.04 : next.e0 + DISS / 2 + 0.05) : MEET_END + 0.1;
                      if (t < start || t > end) return null;
                      const o = k === 0 || p.cut ? 1 : prog(t, p.e0 - DISS / 2, p.e0 + DISS / 2, E_SOFT);
                      return (
                        <div key={k} style={{ position: 'absolute', inset: 0, opacity: o }}>
                          <Vid src="media/raw/meeting.mp4" edit0={start} edit1={end} take0={p.take0 + (start - p.e0)} />
                        </div>
                      );
                    })
                  ) : (
                    <Img src={staticFile('agents/A/meeting_end.png')} style={{ width: '100%', height: '100%', display: 'block' }} />
                  )}
                  {/* golden: smooth share switches and held faces */}
                  <Hold t={t} t0={65.95} t1={69.8} i={0} still="34.6" />
                  <Hold t={t} t0={69.0} t1={70.38} i={2} still="71.0" />
                  <Hold t={t} t0={74.42} t1={77.0} i={2} still="71.0" />
                  <Hold t={t} t0={81.74} t1={84.2} i={3} still="80.5" />
                  <LayoutMorph t={t} t0={65.2} d={0.75} from={STILL('31.50')} to={meetVid(65.2, 66.05, 31.75)} />
                  <SharePush t={t} t0={67.25} d={0.6} from={STILL('43.00')} to={meetVid(67.25, 67.9, 43.27)} />
                  <SharePush t={t} t0={74.75} d={0.6} from={STILL('54.50')} to={meetVid(74.75, 75.4, 54.75)} />
                  <LayoutMorph t={t} t0={84.2} d={0.5} from={STILL('84.80')} to={MEET_END_IMG} toGrid />
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
                  mix={[0.82, 1.0]}
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
                  mix={[0.0, 0.18]}
                />
              </React.Fragment>
            ))}
          </Layer>

          {/* golden: Maya's tile rings when Sam asks her; Ines's real "Chosen: Version B" badge is pointed out */}
          <Layer>
            {t > 54.95 && t < 56.0 ? (
              <div style={{ ...abs(pad(meetW(0), 2)), borderRadius: 16, boxShadow: '0 0 0 3px #5B8CFF, 0 0 26px rgba(91,140,255,0.55)', opacity: prog(t, 54.95, 55.15, E_OUT) * (1 - prog(t, 55.6, 56.0, E_IO)) }} />
            ) : null}
            {t > 82.45 && t < 84.2 ? (
              <div style={{ position: 'absolute', left: 982, top: 278, width: 167, height: 30, borderRadius: 15, boxShadow: '0 0 0 2px #2FCB8B, 0 0 18px rgba(47,203,139,0.6)', opacity: prog(t, 82.45, 82.7, E_OUT) * (1 - prog(t, 83.8, 84.15, E_IO)) }} />
            ) : null}
          </Layer>

          {/* desk-to-desk messages */}
          <Layer>
            <Bubble t={t} t0={87.05} t1={88.45} t2={89.15} from={tileW(1)} to={tileW(2)} who={1} text="Could you send me one line on how competitors handle discount vs tax order?" />
            <Bubble t={t} t0={89.2} t1={90.5} t2={91.1} from={tileW(2)} to={tileW(1)} who={2} text="Shopify's help docs say discounts come off the subtotal before tax, so we match them." />
          </Layer>

          {/* the Team view */}
          {t > 95.35 && t < 107.55 ? (
            <Layer style={{ transform: `translateY(${teamY}px)` }}>
              <Plate rect={WINR} bg="#fdfdfd">
                <Vid src="media/raw/team.mp4" edit0={95.45} edit1={101.15} take0={0.3} rate={1} />
                <Vid src="media/raw/team.mp4" edit0={101.15} edit1={102.18} take0={6.0} rate={16} />
                <Vid src="media/raw/team.mp4" edit0={102.18} edit1={107.55} take0={22.5} rate={1} />
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
