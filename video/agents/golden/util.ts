import { Easing, interpolate } from 'remotion';

export const W = 1920;
export const H = 1080;
export const FPS = 30;
export const DURATION = 120;

// The app window (2560x1600 recordings) placed at scale K inside the 1920x1080 frame.
export const K = 0.6;
export const WIN = { x: 192, y: 20, w: 1536, h: 960 };
export const FR = { w: 2560, h: 1600 };
export const WIN_RADIUS = 22;

export type Rect = { x: number; y: number; w: number; h: number };
export type Pose = { cx: number; cy: number; z: number };

export const wx = (px: number) => WIN.x + px * K;
export const wy = (py: number) => WIN.y + py * K;
export const wrect = (r: Rect): Rect => ({ x: wx(r.x), y: wy(r.y), w: r.w * K, h: r.h * K });

export const TINT = ['#5B8CFF', '#FF9F43', '#EE5A9C', '#2FCB8B'];
export const NAMES = ['Maya', 'Priya', 'Jonas', 'Ines'];
export const TINT_BY: Record<string, string> = {
  maya: TINT[0],
  priya: TINT[1],
  jonas: TINT[2],
  ines: TINT[3],
  sam: '#E9ECF2',
  narrator: '#FFFFFF',
};
export const NAME_BY: Record<string, string> = { maya: 'Maya', priya: 'Priya', jonas: 'Jonas', ines: 'Ines', sam: 'Sam' };

// Desk tiles in frame pixels (measured from desks.mp4) and the face card inside a tile.
export const TILE_PX: Rect[] = [
  { x: 154, y: 70, w: 1056, h: 660 },
  { x: 1350, y: 70, w: 1056, h: 660 },
  { x: 154, y: 870, w: 1056, h: 660 },
  { x: 1350, y: 870, w: 1056, h: 660 },
];
export const CARD_REL = { x: 0.782, y: 0.042, w: 0.194, h: 0.402 };
export const cardPx = (i: number): Rect => {
  const t = TILE_PX[i];
  return { x: t.x + CARD_REL.x * t.w, y: t.y + CARD_REL.y * t.h, w: CARD_REL.w * t.w, h: CARD_REL.h * t.h };
};
export const tileW = (i: number) => wrect(TILE_PX[i]);
export const cardW = (i: number) => wrect(cardPx(i));

// Meeting grid tiles (frame px).
export const MEET_PX: Rect[] = [
  { x: 484, y: 128, w: 756, h: 568 },
  { x: 1320, y: 128, w: 756, h: 568 },
  { x: 484, y: 776, w: 756, h: 568 },
  { x: 1320, y: 776, w: 756, h: 568 },
];
export const meetW = (i: number) => wrect(MEET_PX[i]);

// Maya's call: desktop panel and face tile as fractions of the window.
export const CALL_PANEL = { x: 0.01875, y: 0.1, w: 0.71875, h: 0.718 };
export const CALL_FACE = { x: 0.75, y: 0.101, w: 0.231, h: 0.643 };

// ---------- math ----------
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const E_IO = Easing.bezier(0.5, 0, 0.2, 1);
export const E_SOFT = Easing.bezier(0.4, 0, 0.2, 1);
export const E_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const E_OUT3 = Easing.bezier(0.22, 0.8, 0.3, 1);
export const E_IN = Easing.bezier(0.5, 0, 0.9, 0.6);
export const prog = (t: number, a: number, b: number, e: (x: number) => number = E_IO) => e(clamp((t - a) / (b - a)));
export const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({
  x: lerp(a.x, b.x, p),
  y: lerp(a.y, b.y, p),
  w: lerp(a.w, b.w, p),
  h: lerp(a.h, b.h, p),
});

export type KF = { t: number; pose: Pose; e?: (x: number) => number };
export const poseAt = (kfs: KF[], t: number): Pose => {
  if (t <= kfs[0].t) return kfs[0].pose;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t <= b.t) {
      const p = (b.e ?? E_IO)(clamp((t - a.t) / (b.t - a.t)));
      return {
        cx: lerp(a.pose.cx, b.pose.cx, p),
        cy: lerp(a.pose.cy, b.pose.cy, p),
        z: Math.exp(lerp(Math.log(a.pose.z), Math.log(b.pose.z), p)),
      };
    }
  }
  return kfs[kfs.length - 1].pose;
};

// Camera pose that centres a tile.
export const tilePose = (i: number, z = 2.05): Pose => {
  const r = tileW(i);
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 - 8, z };
};

// Camera pose that makes Maya's tile land exactly on the call's desktop panel (match move).
const T0 = tileW(0);
export const CALL_Z = (CALL_PANEL.w * WIN.w) / T0.w;
const panelScreen = { x: WIN.x + CALL_PANEL.x * WIN.w, y: WIN.y + CALL_PANEL.y * WIN.h };
export const P_CALL: Pose = {
  z: CALL_Z,
  cx: T0.x - (panelScreen.x - W / 2) / CALL_Z,
  cy: T0.y - (panelScreen.y - H / 2) / CALL_Z,
};
export const GRID: Pose = { cx: W / 2, cy: H / 2, z: 1 };

// screen (identity-camera) rect -> world rect under pose P_CALL
export const screenToWorldCall = (r: Rect): Rect => ({
  x: (r.x - W / 2) / CALL_Z + P_CALL.cx,
  y: (r.y - H / 2) / CALL_Z + P_CALL.cy,
  w: r.w / CALL_Z,
  h: r.h / CALL_Z,
});
export const CALL_PLATE: Rect = screenToWorldCall(WIN);
export const CALL_FACE_SCREEN: Rect = {
  x: WIN.x + CALL_FACE.x * WIN.w,
  y: WIN.y + CALL_FACE.y * WIN.h,
  w: CALL_FACE.w * WIN.w,
  h: CALL_FACE.h * WIN.h,
};
export const CALL_FACE_WORLD = screenToWorldCall(CALL_FACE_SCREEN);

export const FONT = "'Figtree', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const MONO = "'SF Mono', Menlo, Monaco, 'DejaVu Sans Mono', monospace";

export const smoothNoise = (t: number, s: number) =>
  (Math.sin(t * 37.1 + s * 3.7) + 0.6 * Math.sin(t * 23.3 + s * 1.9) + 0.4 * Math.sin(t * 61.7 + s * 5.1)) / 2;

export const interp = interpolate;
