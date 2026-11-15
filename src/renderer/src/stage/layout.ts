/**
 * Stage geometry: pure functions, ux-spec sections 4.1 to 4.3 as revised by the polish brief
 * (docs/hackathon/design/polish-brief.md, "The call" and "The meeting"). Everything is in px and rounded to
 * whole pixels. The renderer feeds the results to component props (`width`, `height`), never to `style`.
 *
 * One skeleton for the one-to-one call and the meeting spotlight: a large tile on the left and a column on the
 * right, both exactly as tall as the large tile, so nothing in the column floats and no band is left empty.
 */

export interface Size {
  w: number;
  h: number;
}

export const GAP = 16;
/** Between things that belong together inside the right column (face and type box, strip tiles). */
export const STRIP_GAP = 12;
export const SIDE_PADDING = 24;
export const TOP_STRIP = 48;
/** Caption line and the control pill: 4 + 32 caption + 8 + 56 pill + 12. */
export const BOTTOM_RESERVE = 112;
export const MAX_STAGE_WIDTH = 1680;
export const INSET_BREAKPOINT = 1100;
/** The right column: about a quarter of the stage, never narrower than 280 or wider than 360. */
export const COLUMN_MIN = 280;
export const COLUMN_MAX = 360;
/** The type box docked at the bottom of the right column. */
export const COMPOSER_HEIGHT = 48;
const BOTTOM_STRIP_HEIGHT = 120;

export type OneToOneLayout = 'desktop' | 'face' | 'side';
export type LargeKind = 'desktop' | 'face';

/** The box tiles are laid out in: window minus side padding, top strip and bottom reserve. */
export function stageBox(windowW: number, windowH: number): Size {
  return { w: Math.min(windowW - 2 * SIDE_PADDING, MAX_STAGE_WIDTH), h: windowH - TOP_STRIP - BOTTOM_RESERVE };
}

const tileOf = (w: number, ratio: number): Size => ({ w, h: Math.round(w / ratio) });
const FACE_43 = 4 / 3;
const DESKTOP = 16 / 10;

/** Largest rectangle of the given aspect ratio that fits `box`. */
export function fit(box: Size, ratio: number): Size {
  const w = Math.floor(Math.min(box.w, box.h * ratio));
  return tileOf(w, ratio);
}

/**
 * Tiles are centred in the stage box; an odd leftover would put every edge on a half pixel and blur the 1 px
 * hairlines at 1x. Takes one pixel off a height when that makes the leftover even.
 */
export function evenIn(h: number, avail: number): number {
  return (avail - h) % 2 === 0 ? h : h - 1;
}

/** Width of the right column for a stage box this wide. Shared by the one-to-one call and the spotlight. */
export function columnWidth(stageW: number): number {
  return Math.max(COLUMN_MIN, Math.min(COLUMN_MAX, Math.round(stageW * 0.24)));
}

/** The column layouts need the window to be at least this wide; below it they fall back to an inset or a bottom strip. */
const hasColumn = (stageW: number): boolean => stageW >= INSET_BREAKPOINT - 2 * SIDE_PADDING;

export interface GridLayout {
  cols: number;
  rows: number;
  tile: Size;
  /** Gap between tiles in px: 16, or 40 for the two-by-two (about the logo's 13 % gap at that tile size). */
  gap: number;
}

/**
 * The live avatar video and the stills are 512 px; past one and a half times that a face looks soft, so a face tile
 * is never wider or taller than this. The stage keeps the margin rather than showing a blurred face.
 */
export const FACE_MAX = 768;

/** The two-by-two meeting is the Deskmates mark come to life: its gap is in proportion to the mark's (13 % of a tile). */
export const MARK_GAP = 40;

/**
 * Stable meeting grid for 2 to 4 people (4.2, revised in round two). Each tile is as wide as fits up to 4:3 and as
 * tall as fits up to square: the avatar video and the stills are square, so one row of two or three people gets
 * square tiles that fill the stage, and the two-by-two (height-bound) stays 4:3. Tiles never resize for the speaker.
 */
export function gridLayout(n: number, s: Size): GridLayout {
  const cols = n <= 2 ? 2 : n === 3 ? 3 : 2;
  const rows = n <= 3 ? 1 : 2;
  const gap = rows === 2 ? MARK_GAP : GAP;
  // one spacing step is taken off the height of the two-by-two so it never crowds the caption line
  const availH = (s.h - (rows === 2 ? 2 * GAP : 0) - (rows - 1) * gap) / rows;
  const w = Math.floor(Math.min((s.w - (cols - 1) * gap) / cols, availH * FACE_43, FACE_MAX));
  const h = rows === 1 ? Math.min(w, Math.floor(availH)) : Math.min(Math.floor(availH), Math.round(w / FACE_43));
  const tileH = rows === 1 ? evenIn(h, s.h) : h;
  return { cols, rows, gap, tile: { w, h: tileH } };
}

export interface SpotlightLayout {
  large: Size;
  /** `cols` 2 for four people in the column: a two-by-two that fills it (the mark again), one kind of tile for all. */
  strip: { orientation: 'vertical' | 'bottom'; tile: Size; cols: number };
  /** Width of the strip column (the one-to-one column) when the strip is vertical; null for a bottom strip. */
  column: number | null;
}

/**
 * One large tile (a desktop or a face) plus a strip of every face (4.2, "Spotlight mode").
 * Vertical: the strip is the one-to-one column (same width), top-aligned with the large tile and never taller
 * than it; each tile is 4:3 when that fits, otherwise as tall as the column allows; four people make a two-by-two
 * that fills the column (so every strip is one kind of tile, video or photo, never a cropped band). Below 1100 px: a
 * bottom strip of 160 x 120 tiles.
 */
export function spotlightLayout(n: number, s: Size, kind: LargeKind): SpotlightLayout {
  const ratio = kind === 'desktop' ? DESKTOP : FACE_43;
  if (hasColumn(s.w)) {
    const column = columnWidth(s.w);
    const fitted = fit({ w: s.w - column - GAP, h: s.h }, ratio);
    const large = { w: fitted.w, h: evenIn(fitted.h, s.h) };
    if (n >= 4) {
      const tile = { w: Math.floor((column - STRIP_GAP) / 2), h: Math.floor((large.h - STRIP_GAP) / 2) };
      return { large, strip: { orientation: 'vertical', tile, cols: 2 }, column };
    }
    const h = Math.min(Math.round(column / FACE_43), Math.floor((large.h - (n - 1) * STRIP_GAP) / n));
    return { large, strip: { orientation: 'vertical', tile: { w: column, h }, cols: 1 }, column };
  }
  return {
    large: fit({ w: s.w, h: s.h - BOTTOM_STRIP_HEIGHT - GAP }, ratio),
    strip: { orientation: 'bottom', tile: { w: 160, h: 120 }, cols: n },
    column: null,
  };
}

export type OneToOneGeometry =
  | {
      kind: 'column';
      largeKind: 'desktop';
      large: Size;
      /** The face, filling the column above the type box. */
      small: Size;
      composer: Size;
      column: number;
      /** Height of the large tile and of the column. */
      row: number;
    }
  | {
      /** B: one centred column, the face over the type box; the desktop is an inset in the face's corner. */
      kind: 'focus';
      large: Size;
      small: Size;
      composer: Size;
      row: number;
    }
  | { kind: 'inset'; large: Size; small: Size; largeKind: LargeKind }
  | { kind: 'side'; large: Size; small: Size };

/**
 * One-to-one layouts (4.3, revised). `desktop` is A, `face` is B, `side` is C.
 * A: the desktop (16:10) on the left; the right column is exactly as tall: the face fills it and the type box is
 *    docked at the bottom, its bottom edge level with the desktop's.
 * B: one centred column exactly as tall as A's row: a 4:3 face over the type box docked at its bottom; the desktop is a 200 x 125 inset in the face's bottom-right corner. (A narrow right
 *    column holding only a small desktop and the type box would leave an empty band above them.)
 * C: the desktop (16:10) and the face (square) side by side at one height, no type box.
 * Below 1100 px wide the column becomes an inset on the large tile and the type box is not shown.
 */
export function oneToOneLayout(layout: OneToOneLayout, windowW: number, windowH: number): OneToOneGeometry {
  const s = stageBox(windowW, windowH);
  if (layout === 'side') {
    // The desktop (16:10) and the face (square, the avatar video's own shape) at one height, as large as fits.
    const h = evenIn(Math.floor(Math.min(s.h, (s.w - GAP) / (DESKTOP + 1))), s.h);
    return { kind: 'side', large: { w: Math.round(h * DESKTOP), h }, small: { w: h, h } };
  }
  const largeKind: LargeKind = layout === 'desktop' ? 'desktop' : 'face';
  if (!hasColumn(s.w)) {
    const large = largeKind === 'desktop' ? fit(s, DESKTOP) : { w: s.w, h: s.h };
    const small = largeKind === 'desktop' ? { w: 160, h: 200 } : { w: 200, h: 125 };
    return { kind: 'inset', large, small, largeKind };
  }
  const column = columnWidth(s.w);
  const fitted = fit({ w: s.w - column - GAP, h: s.h }, DESKTOP);
  const desktop = { w: fitted.w, h: evenIn(fitted.h, s.h) };
  const row = desktop.h;
  if (largeKind === 'desktop') {
    return { kind: 'column', largeKind, large: desktop, small: { w: column, h: row - COMPOSER_HEIGHT - STRIP_GAP }, composer: { w: column, h: COMPOSER_HEIGHT }, column, row };
  }
  // 4:3, not the full width: the avatar video is 512 px square, so a wider tile would crop the head and upscale it.
  const fittedFace = fit({ w: Math.min(desktop.w, FACE_MAX), h: row - COMPOSER_HEIGHT - STRIP_GAP }, FACE_43);
  const focusRow = evenIn(fittedFace.h + STRIP_GAP + COMPOSER_HEIGHT, s.h);
  const face = { w: fittedFace.w, h: focusRow - STRIP_GAP - COMPOSER_HEIGHT };
  return { kind: 'focus', large: face, small: { w: 200, h: 125 }, composer: { w: face.w, h: COMPOSER_HEIGHT }, row: focusRow };
}
