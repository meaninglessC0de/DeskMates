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
}

/** Stable meeting grid for 2 to 4 people (4.2): the largest 4:3 tile that fits. Tiles never resize for the speaker. */
export function gridLayout(n: number, s: Size): GridLayout {
  if (n <= 2) return { cols: 2, rows: 1, tile: faceTile(Math.min((s.w - GAP) / 2, (s.h * 4) / 3)) };
  if (n === 3) return { cols: 3, rows: 1, tile: faceTile(Math.min((s.w - 2 * GAP) / 3, (s.h * 4) / 3)) };
  // one spacing step is taken off the height so the grid never crowds the caption line
  return { cols: 2, rows: 2, tile: faceTile(Math.min((s.w - GAP) / 2, (((s.h - 2 * GAP) / 2) * 4) / 3)) };
}

function faceTile(w: number): Size {
  return tileOf(Math.floor(w), FACE_43);
}

export interface SpotlightLayout {
  large: Size;
  strip: { orientation: 'vertical' | 'bottom'; tile: Size };
  /** Width of the strip column (the one-to-one column) when the strip is vertical; null for a bottom strip. */
  column: number | null;
}

/**
 * One large tile (a desktop or a face) plus a strip of every face (4.2, "Spotlight mode").
 * Vertical: the strip is the one-to-one column (same width), top-aligned with the large tile and never taller
 * than it; each tile is 4:3 when that fits, otherwise as tall as the column allows. Below 1100 px wide: a
 * bottom strip of 160 x 120 tiles.
 */
export function spotlightLayout(n: number, s: Size, kind: LargeKind): SpotlightLayout {
  const ratio = kind === 'desktop' ? DESKTOP : FACE_43;
  if (hasColumn(s.w)) {
    const column = columnWidth(s.w);
    const large = fit({ w: s.w - column - GAP, h: s.h }, ratio);
    const h = Math.min(Math.round(column / FACE_43), Math.floor((large.h - (n - 1) * STRIP_GAP) / n));
    return { large, strip: { orientation: 'vertical', tile: { w: column, h } }, column };
  }
  return {
    large: fit({ w: s.w, h: s.h - BOTTOM_STRIP_HEIGHT - GAP }, ratio),
    strip: { orientation: 'bottom', tile: { w: 160, h: 120 } },
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
 * C: two equal 16:10 tiles side by side, no type box.
 * Below 1100 px wide the column becomes an inset on the large tile and the type box is not shown.
 */
export function oneToOneLayout(layout: OneToOneLayout, windowW: number, windowH: number): OneToOneGeometry {
  const s = stageBox(windowW, windowH);
  if (layout === 'side') {
    const t = fit({ w: (s.w - GAP) / 2, h: s.h }, DESKTOP);
    return { kind: 'side', large: t, small: t };
  }
  const largeKind: LargeKind = layout === 'desktop' ? 'desktop' : 'face';
  if (!hasColumn(s.w)) {
    const large = largeKind === 'desktop' ? fit(s, DESKTOP) : { w: s.w, h: s.h };
    const small = largeKind === 'desktop' ? { w: 160, h: 200 } : { w: 200, h: 125 };
    return { kind: 'inset', large, small, largeKind };
  }
  const column = columnWidth(s.w);
  const desktop = fit({ w: s.w - column - GAP, h: s.h }, DESKTOP);
  const row = desktop.h;
  if (largeKind === 'desktop') {
    return { kind: 'column', largeKind, large: desktop, small: { w: column, h: row - COMPOSER_HEIGHT - STRIP_GAP }, composer: { w: column, h: COMPOSER_HEIGHT }, column, row };
  }
  // 4:3, not the full width: the avatar video is 512 px square, so a wider tile would crop the head and upscale it.
  const face = fit({ w: desktop.w, h: row - COMPOSER_HEIGHT - STRIP_GAP }, FACE_43);
  return { kind: 'focus', large: face, small: { w: 200, h: 125 }, composer: { w: face.w, h: COMPOSER_HEIGHT }, row };
}
