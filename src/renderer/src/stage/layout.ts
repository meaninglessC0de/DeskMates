/**
 * Stage geometry: pure functions, ux-spec sections 4.1 to 4.3. Everything is in px and rounded to
 * whole pixels. The renderer feeds the results to component props (`width`, `height`), never to `style`.
 */

export interface Size {
  w: number;
  h: number;
}

export const GAP = 16;
export const STRIP_GAP = 12;
export const SIDE_PADDING = 24;
export const TOP_STRIP = 48;
export const BOTTOM_RESERVE = 104;
export const MAX_STAGE_WIDTH = 1600;
export const INSET_BREAKPOINT = 1100;
const BOTTOM_STRIP_HEIGHT = 120;

export type OneToOneLayout = 'desktop' | 'face' | 'side';
export type LargeKind = 'desktop' | 'face';

/** The box tiles are laid out in: window minus side padding, top strip and bottom reserve. */
export function stageBox(windowW: number, windowH: number): Size {
  return { w: Math.min(windowW - 2 * SIDE_PADDING, MAX_STAGE_WIDTH), h: windowH - TOP_STRIP - BOTTOM_RESERVE };
}

const tileOf = (w: number, ratio: number): Size => ({ w, h: Math.round(w / ratio) });
const FACE_43 = 4 / 3;
const FACE_45 = 4 / 5;
const DESKTOP = 16 / 10;

/** Largest rectangle of the given aspect ratio that fits `box`. */
export function fit(box: Size, ratio: number): Size {
  const w = Math.floor(Math.min(box.w, box.h * ratio));
  return tileOf(w, ratio);
}

export interface GridLayout {
  cols: number;
  rows: number;
  tile: Size;
}

/** Stable meeting grid for 2 to 4 people (4.2): the largest 4:3 tile that fits. Tiles never resize for the speaker. */
export function gridLayout(n: number, s: Size): GridLayout {
  if (n <= 2) return { cols: 2, rows: 1, tile: faceTile(Math.min((s.w - GAP) / 2, (s.h * 4) / 3)) };
  if (n === 3) return { cols: 3, rows: 1, tile: faceTile(Math.min((s.w - 2 * GAP) / 3, (s.h * 4) / 3)) };
  return { cols: 2, rows: 2, tile: faceTile(Math.min((s.w - GAP) / 2, (((s.h - GAP) / 2) * 4) / 3)) };
}

function faceTile(w: number): Size {
  return tileOf(Math.floor(w), FACE_43);
}

export interface SpotlightLayout {
  large: Size;
  strip: { orientation: 'vertical' | 'bottom'; tile: Size };
}

/** One large tile (a desktop or a face) plus a strip of every face (4.2, "Spotlight mode"). */
export function spotlightLayout(n: number, s: Size, kind: LargeKind): SpotlightLayout {
  const tile = n >= 4 ? { w: 200, h: 150 } : { w: 232, h: 174 };
  const vertical = s.h >= n * tile.h + (n - 1) * STRIP_GAP;
  const ratio = kind === 'desktop' ? DESKTOP : FACE_43;
  if (vertical) {
    return {
      large: fit({ w: s.w - tile.w - GAP, h: s.h }, ratio),
      strip: { orientation: 'vertical', tile },
    };
  }
  return {
    large: fit({ w: s.w, h: s.h - BOTTOM_STRIP_HEIGHT - GAP }, ratio),
    strip: { orientation: 'bottom', tile: { w: 160, h: 120 } },
  };
}

export type OneToOneGeometry =
  | { kind: 'column'; large: Size; small: Size; largeKind: LargeKind; column: number }
  | { kind: 'inset'; large: Size; small: Size; largeKind: LargeKind }
  | { kind: 'side'; large: Size; small: Size };

/**
 * One-to-one layouts (4.3). `desktop` is A (desktop large), `face` is B (face large), `side` is C.
 * Below 1100 px wide the right column becomes an inset on the large tile.
 * The right column is 280 px at 1280 wide and grows with the window up to 360.
 */
export function oneToOneLayout(layout: OneToOneLayout, windowW: number, windowH: number): OneToOneGeometry {
  const s = stageBox(windowW, windowH);
  if (layout === 'side') {
    const t = fit({ w: (s.w - GAP) / 2, h: s.h }, DESKTOP);
    return { kind: 'side', large: t, small: t };
  }
  const largeKind: LargeKind = layout === 'desktop' ? 'desktop' : 'face';
  if (windowW < INSET_BREAKPOINT) {
    const large = largeKind === 'desktop' ? fit(s, DESKTOP) : { w: s.w, h: s.h };
    const small = largeKind === 'desktop' ? { w: 200, h: 250 } : { w: 200, h: 125 };
    return { kind: 'inset', large, small, largeKind };
  }
  const column = Math.max(280, Math.min(360, Math.round(s.w * 0.2273)));
  const box: Size = { w: s.w - column - GAP, h: s.h };
  if (largeKind === 'desktop') {
    return { kind: 'column', large: fit(box, DESKTOP), small: tileOf(column, FACE_45), largeKind, column };
  }
  return { kind: 'column', large: box, small: tileOf(column, DESKTOP), largeKind, column };
}
