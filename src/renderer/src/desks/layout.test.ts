import { describe, expect, it } from 'vitest';
import { chipScaleFor, deskArea, desksLayout, railWidth, scaleFor, seat } from './layout';

describe('desksLayout', () => {
  it.each([[1440, 900], [2560, 1600], [1280, 800], [1920, 1080], [900, 1200]])('fits and centres a window of %i x %i', (w, h) => {
    const { tile, gap } = desksLayout({ w, h });
    const gridW = tile.w * 2 + gap;
    const gridH = tile.h * 2 + gap;
    expect(gridW).toBeLessThanOrEqual(w);
    expect(gridH).toBeLessThanOrEqual(h);
    expect(Math.abs(tile.w / tile.h - 1.6)).toBeLessThan(0.01);
    // the gap is the mark's 13 % of a tile (one pixel of rounding for the even leftover)
    expect(Math.abs(gap / tile.w - 0.13)).toBeLessThan(0.01);
    // one of the two axes is the limit: its margin is half a gap
    const slack = Math.min(w - gridW, h - gridH) / 2;
    expect(slack).toBeGreaterThanOrEqual(gap / 2 - 3);
    expect(slack).toBeLessThanOrEqual(gap / 2 + 3);
  });

  it('keeps the leftover even on both axes of an even window', () => {
    const { tile, gap } = desksLayout({ w: 1440, h: 900 });
    expect((1440 - (tile.w * 2 + gap)) % 2).toBe(0);
    expect((900 - (tile.h * 2 + gap)) % 2).toBe(0);
  });

  it('grows the pill in steps with the tile', () => {
    expect(scaleFor(300)).toBe(1);
    expect(scaleFor(596)).toBe(1.5);
    expect(scaleFor(1058)).toBe(2.75);
    expect(scaleFor(5000)).toBe(3);
  });
});

describe('chipScaleFor', () => {
  it('follows the tile in 0.05 steps, within bounds', () => {
    expect(chipScaleFor(508)).toBe(0.85);
    expect(chipScaleFor(906)).toBe(1.55);
    expect(chipScaleFor(100)).toBe(0.7);
    expect(chipScaleFor(9000)).toBe(3);
  });
});

describe('deskArea', () => {
  it('is the whole window with the rail hidden', () => {
    expect(deskArea({ w: 1440, h: 900 }, false)).toEqual({ area: { w: 1440, h: 900 }, rail: 0, railScale: 1 });
  });
  it('takes about a fifth of the window, never under the four-line minimum', () => {
    expect(railWidth({ w: 1440, h: 900 })).toBe(288);
    expect(railWidth({ w: 2560, h: 1600 })).toBe(512);
    expect(railWidth({ w: 900, h: 700 })).toBe(280);
  });
  it('lays the grid out in what is left, and the grid and rail fit together', () => {
    for (const win of [{ w: 1440, h: 900 }, { w: 2560, h: 1600 }, { w: 1280, h: 800 }]) {
      const { area, rail } = deskArea(win, true);
      const { tile, gap } = desksLayout(area);
      expect(area.w + rail).toBe(win.w);
      expect(tile.w * 2 + gap).toBeLessThanOrEqual(area.w);
      expect(tile.h * 2 + gap).toBeLessThanOrEqual(win.h);
      expect(tile.w).toBeLessThan(desksLayout(win).tile.w);
    }
  });
  it('grows the rail text in steps with its width', () => {
    expect(deskArea({ w: 1440, h: 900 }, true).railScale).toBe(1);
    expect(deskArea({ w: 2560, h: 1600 }, true).railScale).toBe(1.75);
  });
});

describe('seat', () => {
  const tint: Record<string, number> = { a: 3, b: 0, c: 1, d: 2, e: 5 };
  it('seats by tint order, four at most, empty desks as null', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    expect(seat(ids, (p) => tint[p.id]!).map((p) => p?.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(seat([{ id: 'c' }, { id: 'a' }], (p) => tint[p.id]!).map((p) => p?.id ?? null)).toEqual(['c', 'a', null, null]);
  });
});
