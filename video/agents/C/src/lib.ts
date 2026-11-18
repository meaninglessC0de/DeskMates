// Shared constants, easing, geometry and timing for editor C's Deskmates edit.
export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const DUR = 120 * FPS;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
export const eio = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const eout = (x: number) => 1 - Math.pow(1 - x, 3);
export const eout5 = (x: number) => 1 - Math.pow(1 - x, 5);
export const ein = (x: number) => x * x * x;
export const eback = (x: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export type Rect = { x: number; y: number; w: number; h: number };
export type Who = 'maya' | 'priya' | 'jonas' | 'ines';
export const WHO: Who[] = ['maya', 'priya', 'jonas', 'ines'];

export const COLORS: Record<Who, string> = {
  maya: '#5B8CFF',
  priya: '#FF9F43',
  jonas: '#EE5A9C',
  ines: '#2FCB8B',
};
export const NAMES: Record<Who, string> = { maya: 'Maya', priya: 'Priya', jonas: 'Jonas', ines: 'Ines' };
export const FULL: Record<Who, string> = {
  maya: 'Maya Chen',
  priya: 'Priya Raman',
  jonas: 'Jonas Weber',
  ines: 'Ines Moreau',
};
export const FONT = '-apple-system, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
export const MONO = 'Menlo, "SF Mono", Monaco, monospace';

// the recorded app window is 2560x1600 in every raw take (the same Electron window)
export const VW = 2560;
export const VH = 1600;

// Desks view (measured: fractions of the frame, 16:10 tiles)
export const TW = 1056;
export const TH = 660;
export const TILE: Record<Who, Rect> = {
  maya: { x: 154.1, y: 70.1, w: TW, h: TH },
  priya: { x: 1349.9, y: 70.1, w: TW, h: TH },
  jonas: { x: 154.1, y: 870.1, w: TW, h: TH },
  ines: { x: 1349.9, y: 870.1, w: TW, h: TH },
};
export const TILE_R = 26;
const rel = (who: Who, r: Rect): Rect => ({ x: TILE[who].x + r.x, y: TILE[who].y + r.y, w: r.w, h: r.h });
export const CARD = (who: Who) => rel(who, { x: 826, y: 28, w: 205, h: 265 });
export const PILL = (who: Who) => rel(who, { x: 33, y: 562, w: 266, h: 61 });
// the app window inside each desktop
export const WIN: Record<Who, Rect> = {
  maya: { x: 155, y: 92, w: 681, h: 426 },
  priya: { x: TILE.priya.x, y: TILE.priya.y + 21, w: TW, h: TH - 21 },
  jonas: { x: TILE.jonas.x, y: TILE.jonas.y + 21, w: TW, h: TH - 21 },
  ines: { x: TILE.ines.x, y: TILE.ines.y + 21, w: TW, h: TH - 21 },
};
export const DESK_NO: Record<Who, number> = { maya: 1, priya: 2, jonas: 3, ines: 4 };

// Meeting (px in the 2560x1600 take)
export const GRID: Record<Who, Rect> = {
  maya: { x: 484, y: 128, w: 756, h: 568 },
  priya: { x: 1320, y: 128, w: 756, h: 568 },
  jonas: { x: 484, y: 776, w: 756, h: 568 },
  ines: { x: 1320, y: 776, w: 756, h: 568 },
};
export const STRIP: Record<Who, Rect> = {
  maya: { x: 1920, y: 162, w: 284, h: 562 },
  priya: { x: 2228, y: 162, w: 284, h: 562 },
  jonas: { x: 1920, y: 748, w: 284, h: 562 },
  ines: { x: 2228, y: 748, w: 284, h: 562 },
};
// shared-desktop rectangle in the meeting (spotlight) and in the call
export const SHARE: Rect = { x: 48.5, y: 161, w: 1839, h: 1148.5 };

// Call take placed so its desktop rectangle sits exactly on Maya's desk tile
export const CALL_C = TW / SHARE.w; // 0.5743
export const CALL_TX = TILE.maya.x - SHARE.x * CALL_C;
export const CALL_TY = TILE.maya.y - SHARE.y * CALL_C;
export const callToWorld = (r: Rect): Rect => ({
  x: r.x * CALL_C + CALL_TX,
  y: r.y * CALL_C + CALL_TY,
  w: r.w * CALL_C,
  h: r.h * CALL_C,
});
export const CALL_FACE_LOCAL: Rect = { x: 1920, y: 162, w: 591, h: 1029 };
export const CALL_FRAME = callToWorld({ x: 0, y: 0, w: VW, h: VH });

// camera: screen = (W/2 + (wx - cx) * k, H/2 + (wy - cy) * k)
export const K0 = 0.675;
export type Cam = { x: number; y: number; k: number };
export const FIT: Cam = { x: 1280, y: 800, k: K0 };
const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const mayaC = center(TILE.maya);
const priyaC = center(TILE.priya);
const jonasC = center(TILE.jonas);
const inesC = center(TILE.ines);
const callC = center(CALL_FRAME);
const KD = 1.45;
const KCALL = Math.min(1840 / CALL_FRAME.w, 1040 / CALL_FRAME.h);

type KF = Cam & { t: number; ease?: 'io' | 'out' | 'sm'; arc?: number };
const KFS: KF[] = [
  { t: 0, ...FIT },
  { t: 24.0, x: 1280, y: 800, k: K0 * 1.3 },
  { t: 27.2, ...FIT, ease: 'out' },
  { t: 29.35, ...FIT },
  { t: 30.45, x: mayaC.x, y: mayaC.y, k: KD, ease: 'sm', arc: 0.0 },
  { t: 31.35, x: mayaC.x, y: mayaC.y, k: KD },
  { t: 32.2, x: priyaC.x, y: priyaC.y, k: KD, ease: 'sm', arc: 0.16 },
  { t: 32.95, x: priyaC.x, y: priyaC.y, k: KD },
  { t: 33.8, x: jonasC.x, y: jonasC.y, k: KD, ease: 'sm', arc: 0.18 },
  { t: 34.6, x: jonasC.x, y: jonasC.y, k: KD },
  { t: 35.45, x: inesC.x, y: inesC.y, k: KD, ease: 'sm', arc: 0.14 },
  { t: 36.7, x: inesC.x, y: inesC.y, k: KD },
  { t: 38.0, ...FIT, ease: 'sm' },
  { t: 41.3, ...FIT },
  { t: 42.5, x: mayaC.x, y: mayaC.y, k: 1.5, ease: 'sm' },
  { t: 44.0, x: callC.x, y: callC.y, k: KCALL, ease: 'sm' },
  { t: 49.7, x: callC.x, y: callC.y, k: KCALL },
  { t: 51.2, x: mayaC.x, y: mayaC.y, k: 1.5, ease: 'sm' },
  { t: 52.7, ...FIT, ease: 'sm' },
  { t: 200, ...FIT },
];
export function camAt(t: number): Cam {
  let i = 0;
  while (i < KFS.length - 2 && t >= KFS[i + 1].t) i++;
  const a = KFS[i];
  const b = KFS[i + 1];
  const raw = seg(t, a.t, b.t);
  const f = b.ease === 'out' ? eout5 : b.ease === 'io' ? eio : smoother;
  const p = b.ease ? f(raw) : 0;
  const arc = b.arc ?? 0;
  const k = Math.exp(lerp(Math.log(a.k), Math.log(b.k), p)) * (1 - arc * Math.sin(Math.PI * p));
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), k };
}
export const toScreen = (c: Cam, r: Rect): Rect => ({
  x: W / 2 + (r.x - c.x) * c.k,
  y: H / 2 + (r.y - c.y) * c.k,
  w: r.w * c.k,
  h: r.h * c.k,
});

// ---- timeline (seconds in the final video) ----
export const T = {
  n01: 0.8, n02: 6.0, n03: 13.4, n04: 20.2,
  logIn: 14.0, shakeIn: 14.3, click: 24.0,
  n05: 28.3, n06: 39.0,
  deskOff: 16.0, // desks take time = t - 16 (faces pop at take 24.0 = 40.0 s)
  callOffset: 33.46, // call take = t - 33.46 (Maya speaks at take 10.14 = 43.6 s)
  n07: 49.8, s01: 52.9, s02: 56.0,
  s03: 68.2, s06: 77.0, s04: 85.0,
  n08: 89.6, n09: 95.6, s05: 98.2, n10: 100.0, n11: 111.9,
};
