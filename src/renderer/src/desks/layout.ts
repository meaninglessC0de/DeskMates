/**
 * Geometry of the Desks view: pure functions, px rounded to whole pixels, fed to component props (`width`, `height`).
 * The two-by-two is the Deskmates mark at window scale: its gap is the mark's (13 px between 100 px tiles, so 13 % of
 * a tile's width) and the outer margin is half a gap, so every edge of the grid sits the same distance from its neighbour.
 */
import type { Size } from '../stage/layout';

export const DESKTOP_RATIO = 16 / 10;
/** Gap over tile width, from the mark (tile 100, gap 13). */
export const MARK_GAP_RATIO = 13 / 100;
/** The scale steps the pill and the face grow in (`ui/styles/app.ts`, `[data-am-desks-view][data-am-scale]`). */
export const SCALE_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3] as const;
export type DesksScale = (typeof SCALE_STEPS)[number];

export interface DesksLayout {
  tile: Size;
  gap: number;
  /** Margin around the whole grid on the axis that limits the size (the other axis is centred and larger). */
  margin: number;
  scale: DesksScale;
}

/** Tile width at which the pill and the face are at their base size. Scales in steps from there. */
const BASE_TILE = 360;

export function scaleFor(tileW: number): DesksScale {
  const want = tileW / BASE_TILE;
  let best: DesksScale = SCALE_STEPS[0];
  for (const s of SCALE_STEPS) if (s <= want + 1e-9) best = s;
  return best;
}

/** The largest 16:10 tiles for which two columns, two rows, the gap and half a gap of margin fit the window. */
export function desksLayout(win: Size): DesksLayout {
  const g = MARK_GAP_RATIO;
  const byW = win.w / (2 + 2 * g);
  const byH = win.h / (2 / DESKTOP_RATIO + 2 * g);
  let w = Math.floor(Math.max(160, Math.min(byW, byH)));
  if (w % 2) w -= 1;
  const h = Math.round(w / DESKTOP_RATIO);
  // An even leftover on both axes keeps every hairline on a whole pixel when the grid is centred.
  let gap = Math.round(w * g);
  if ((win.w - gap) % 2) gap += 1;
  return { tile: { w, h: h % 2 ? h - 1 : h }, gap, margin: Math.round(gap / 2), scale: scaleFor(w) };
}

/** Desk order: the stage's rule (tint order, which is hire order for the cast), four desks at most. */
export function seat<T extends { id: string }>(people: T[], tintOf: (p: T) => number): (T | null)[] {
  const sorted = [...people].sort((a, b) => tintOf(a) - tintOf(b) || a.id.localeCompare(b.id)).slice(0, 4);
  return [0, 1, 2, 3].map((i) => sorted[i] ?? null);
}
