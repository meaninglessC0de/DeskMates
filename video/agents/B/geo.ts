// Geometry, timing helpers and measured positions for edit B.
export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const DURATION = 120;

// The Deskmates window as it sits on Sam's Mac: 2560x1600 recordings scaled by S.
export const S = 0.6;
export const WX = 192;
export const WY = 42;
export const WW = 1536;
export const WH = 960;
export const WIN_BG = 'rgb(26,26,26)';

export type R = {x: number; y: number; w: number; h: number};

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const rng = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeIO5 = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOut5 = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeIn = (t: number) => t * t * t;
export const sine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const lerpR = (a: R, b: R, p: number): R => ({
  x: lerp(a.x, b.x, p),
  y: lerp(a.y, b.y, p),
  w: lerp(a.w, b.w, p),
  h: lerp(a.h, b.h, p),
});

// source (2560x1600) px -> world
export const wx = (x: number) => WX + x * S;
export const wy = (y: number) => WY + y * S;
export const srcR = (x: number, y: number, w: number, h: number): R => ({
  x: wx(x),
  y: wy(y),
  w: w * S,
  h: h * S,
});

export const NAMES = ['maya', 'priya', 'jonas', 'ines'] as const;
export type Name = (typeof NAMES)[number];
export const COLORS: Record<Name | 'sam' | 'narrator', string> = {
  maya: '#5B8CFF',
  priya: '#FF9F43',
  jonas: '#EE5A9C',
  ines: '#2FCB8B',
  sam: '#B8A8FF',
  narrator: '#FFFFFF',
};
export const FULL: Record<Name, string> = {
  maya: 'Maya Chen',
  priya: 'Priya Raman',
  jonas: 'Jonas Weber',
  ines: 'Ines Moreau',
};

// Desks view tiles in source px
export const TILE_SRC: Record<Name, [number, number]> = {
  maya: [154, 70],
  priya: [1350, 70],
  jonas: [154, 870],
  ines: [1350, 870],
};
export const TILE_W = 1056;
export const TILE_H = 660;
export const tileR = (n: Name): R => srcR(TILE_SRC[n][0], TILE_SRC[n][1], TILE_W, TILE_H);

// Face cards (with 12 px margin, matching the stills)
export const CARD_M = 12;
export const cardSrc = (n: Name) => {
  const [tx, ty] = TILE_SRC[n];
  return {x: tx + 826 - CARD_M, y: ty + 28 - CARD_M, w: 205 + 2 * CARD_M, h: 265 + 2 * CARD_M};
};
export const cardR = (n: Name): R => {
  const c = cardSrc(n);
  return srcR(c.x, c.y, c.w, c.h);
};

// Meeting grid tiles and spotlight strip tiles (source px)
export const GRID_SRC: Record<Name, [number, number]> = {
  maya: [484, 128],
  priya: [1320, 128],
  jonas: [484, 776],
  ines: [1320, 776],
};
export const gridR = (n: Name): R => srcR(GRID_SRC[n][0], GRID_SRC[n][1], 756, 568);
export const STRIP_SRC: Record<Name, [number, number]> = {
  maya: [1920, 162],
  priya: [2228, 162],
  jonas: [1920, 748],
  ines: [2228, 748],
};
export const stripR = (n: Name): R => srcR(STRIP_SRC[n][0], STRIP_SRC[n][1], 284, 562);

// Call / spotlight panels
export const PANEL_SRC = {x: 48, y: 162, w: 1840, h: 1148};
export const panelR = (): R => srcR(48, 162, 1840, 1148);
export const callFaceR = (): R => srcR(1920, 164, 590, 1026);

// Pile window crops from the Desks take (source px)
export const CROPS: Record<Name, {x: number; y: number; w: number; h: number}> = {
  maya: {x: 154, y: 92, w: 684, h: 428},
  priya: {x: 1350, y: 92, w: 1056, h: 526},
  jonas: {x: 154, y: 892, w: 1056, h: 526},
  ines: {x: 1350, y: 892, w: 1056, h: 526},
};
export const cropLandR = (n: Name): R => srcR(CROPS[n].x, CROPS[n].y, CROPS[n].w, CROPS[n].h);

// Camera centre of each tile in the world
export const tileCenter = (n: Name) => {
  const r = tileR(n);
  return {x: r.x + r.w / 2, y: r.y + r.h / 2};
};

export type Seg = {v0: number; v1: number; t0: number; rate?: number; jump?: boolean};
export const px = (n: string) => `agents/B/px/${n}.mp4`;
export const st = (n: string) => `agents/B/st/${n}.png`;

// ---------- edit timeline (video seconds) ----------
export const T = {
  deskOffset: 15.0, // desks take = v - 15 (faces pop at take 24.0 -> v 39.0)
  logIn: 14.0,
  logOut: 20.2,
  click: 24.0,
  callIn: [41.0, 42.8] as [number, number],
  callOut: [49.0, 51.0] as [number, number],
  callOffset: 33.06, // call take = v - 33.06 (Maya speaks take 10.14 at v 43.2)
  meetIn: [52.4, 54.7] as [number, number],
  meetOut: [83.9, 86.2] as [number, number],
  approveNote: 90.8,
  approveOpen: [92.1, 93.1] as [number, number],
  approveClose: [96.2, 97.1] as [number, number],
  approveOffset: 90.2, // approve take = v - 90.2 (real click take 3.3 -> v 93.5)
  teamUp: [96.9, 97.8] as [number, number],
  teamDown: [106.7, 107.6] as [number, number],
  priyaNote: [108.0, 110.4] as [number, number],
  endCard: [111.3, 112.6] as [number, number],
};

// desks take segments
export const DESK_SEGS: Seg[] = (() => {
  const s: Seg[] = [
    {v0: 0, v1: 15, t0: 0, rate: 0},
    {v0: 15, v1: 50, t0: 0},
  ];
  for (let k = 0; k < 11; k++) s.push({v0: 50 + 7 * k, v1: 57 + 7 * k, t0: 35, jump: k > 0});
  return s;
})();

export const CALL_SEGS: Seg[] = [{v0: 39.5, v1: 52.5, t0: 39.5 - T.callOffset}];

export const MEET_SEGS: Seg[] = [
  {v0: 52.4, v1: 64.95, t0: 19.0},
  {v0: 64.95, v1: 66.0, t0: 31.55, rate: 0.4},
  {v0: 66.0, v1: 66.5, t0: 31.97},
  {v0: 66.5, v1: 67.3, t0: 42.2, jump: true},
  {v0: 67.3, v1: 68.55, t0: 43.0, rate: 0.4},
  {v0: 68.55, v1: 69.6, t0: 43.5},
  {v0: 69.6, v1: 74.8, t0: 47.2, jump: true},
  {v0: 74.8, v1: 75.1, t0: 54.25, jump: true},
  {v0: 75.1, v1: 76.5, t0: 54.55, rate: 0.4},
  {v0: 76.5, v1: 77.2, t0: 55.11},
  {v0: 77.2, v1: 81.45, t0: 72.5, jump: true},
  {v0: 81.45, v1: 87.5, t0: 79.4, jump: true},
];

export const APPROVE_SEGS: Seg[] = [{v0: 90.5, v1: 98.5, t0: 90.5 - T.approveOffset}];
export const TEAM_SEGS: Seg[] = [
  {v0: 96.5, v1: 103.0, t0: 0},
  {v0: 103.0, v1: 109, t0: 22.0, jump: true},
];

// ---------- spoken lines ----------
export type Line = {
  id: string;
  who: 'narrator' | 'sam' | Name;
  text: string;
  v: number; // video time the audio starts
  d: number; // duration
  file?: string; // wav in public/media
  take?: {src: string; t0: number}; // from a recording
};
export const LINES: Line[] = [
  {id: 'n01', who: 'narrator', text: "This is Sam's Mac. Sam runs a startup with four AI agents.", v: 0.6, d: 4.19, file: 'n01'},
  {id: 'n02', who: 'narrator', text: 'A coder, a marketer, a researcher and a designer. All working at once, in one pile of windows.', v: 6.2, d: 6.4, file: 'n02'},
  {id: 'n03', who: 'narrator', text: "Who's doing what? Like every founder, Sam scrolls through logs.", v: 14.0, d: 3.98, file: 'n03'},
  {id: 'n04', who: 'narrator', text: 'Now watch what happens when Sam opens Deskmates.', v: 20.0, d: 2.79, file: 'n04'},
  {id: 'n05a', who: 'narrator', text: 'Every agent gets its own computer.', v: 28.6, d: 1.75, file: 'n05'},
  {id: 'n05b', who: 'narrator', text: "Maya's code goes to her desk. Priya's post to hers.", v: 30.5, d: 2.95},
  {id: 'n05c', who: 'narrator', text: "Jonas's research to his. Ines's designs to hers.", v: 33.6, d: 3.65},
  {id: 'n06', who: 'narrator', text: 'And every agent gets a face.', v: 39.0, d: 1.78, file: 'n06'},
  {id: 'mc', who: 'maya', text: "Hi Sam, Maya here. I'm on the checkout discount bug, and the push is waiting on your go-ahead.", v: 43.2, d: 5.78, take: {src: 'call', t0: 10.14}},
  {id: 'n07', who: 'narrator', text: 'So Sam can talk to the team, face to face.', v: 49.3, d: 2.92, file: 'n07'},
  {id: 's01', who: 'sam', text: 'Okay team, standup!', v: 52.5, d: 2.0, file: 's01'},
  {id: 's02', who: 'sam', text: 'Maya, show me the fix?', v: 55.3, d: 1.96, file: 's02'},
  {id: 'mm1', who: 'maya', text: 'Morning, all. Quick update from me.', v: 57.6, d: 1.96, take: {src: 'meeting', t0: 24.2}},
  {id: 'mm2', who: 'maya', text: 'The checkout discount bug is found and fixed, tests are run, and the commit is on fix/checkout-discount.', v: 59.76, d: 5.32},
  {id: 's03', who: 'sam', text: 'Jonas?', v: 66.7, d: 1.14, file: 's03'},
  {id: 'mj', who: 'jonas', text: 'The pricing chart is at work/pricing.html.', v: 70.72, d: 4.0, take: {src: 'meeting', t0: 48.32}},
  {id: 's06', who: 'sam', text: 'Ines, what about onboarding?', v: 74.95, d: 2.29, file: 's06'},
  {id: 'mi', who: 'ines', text: 'Both versions now have two screens each.', v: 78.1, d: 3.34, take: {src: 'meeting', t0: 73.4}},
  {id: 's04', who: 'sam', text: 'Version B. Ship it.', v: 81.7, d: 2.01, file: 's04'},
  {id: 'n08', who: 'narrator', text: 'Then they get back to work, and they help each other.', v: 85.9, d: 2.53, file: 'n08'},
  {id: 'n09', who: 'narrator', text: 'Big steps still come to Sam first.', v: 90.8, d: 2.22, file: 'n09'},
  {id: 's05', who: 'sam', text: 'Approve.', v: 93.2, d: 1.0, file: 's05'},
  {id: 'n10', who: 'narrator', text: 'Every hour, task and dollar is on the record in Databricks, so Sam can just ask.', v: 96.9, d: 4.64, file: 'n10'},
  {id: 'n11', who: 'narrator', text: 'Deskmates. Your AI team, with a desk, a face, and a seat at the table.', v: 112.7, d: 4.81, file: 'n11'},
];
