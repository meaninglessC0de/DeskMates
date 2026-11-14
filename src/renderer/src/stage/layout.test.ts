import { describe, expect, it } from 'vitest';
import { gridLayout, oneToOneLayout, spotlightLayout, stageBox } from './layout';

describe('stageBox', () => {
  it('subtracts padding, top strip and bottom reserve (ux-spec 4.1)', () => {
    expect(stageBox(1280, 800)).toEqual({ w: 1232, h: 648 });
    expect(stageBox(960, 640)).toEqual({ w: 912, h: 488 });
    expect(stageBox(1728, 1117)).toEqual({ w: 1600, h: 965 });
    expect(stageBox(2560, 1440)).toEqual({ w: 1600, h: 1288 });
  });
});

describe('gridLayout reproduces the table in ux-spec 4.2', () => {
  const table: [number, number, number[], number[], number[]][] = [
    [960, 640, [448, 336], [293, 220], [314, 236]],
    [1280, 800, [608, 456], [400, 300], [421, 316]],
    [1728, 1117, [792, 594], [522, 392], [632, 474]],
    [2560, 1440, [792, 594], [522, 392], [792, 594]],
  ];
  for (const [w, h, n2, n3, n4] of table) {
    it(`${w} x ${h}`, () => {
      const s = stageBox(w, h);
      const t = (n: number): number[] => {
        const g = gridLayout(n, s);
        return [g.tile.w, g.tile.h];
      };
      expect(t(2)).toEqual(n2);
      expect(t(3)).toEqual(n3);
      expect(t(4)).toEqual(n4);
    });
  }

  it('uses 1x2, 1x3 and 2x2 grids', () => {
    const s = stageBox(1280, 800);
    expect(gridLayout(2, s)).toMatchObject({ cols: 2, rows: 1 });
    expect(gridLayout(3, s)).toMatchObject({ cols: 3, rows: 1 });
    expect(gridLayout(4, s)).toMatchObject({ cols: 2, rows: 2 });
  });
});

describe('spotlightLayout (ux-spec 4.2)', () => {
  it('N=3 at 1280 x 800: desktop 984 x 615, strip 232 wide', () => {
    const l = spotlightLayout(3, stageBox(1280, 800), 'desktop');
    expect(l.large).toEqual({ w: 984, h: 615 });
    expect(l.strip).toEqual({ orientation: 'vertical', tile: { w: 232, h: 174 } });
  });
  it('N=4 at 1280 x 800 uses the vertical strip of 200 x 150 tiles (636 <= 648)', () => {
    const l = spotlightLayout(4, stageBox(1280, 800), 'face');
    expect(l.strip).toEqual({ orientation: 'vertical', tile: { w: 200, h: 150 } });
  });
  it('N=3 at 960 x 640 falls back to the bottom strip (546 > 488)', () => {
    const l = spotlightLayout(3, stageBox(960, 640), 'desktop');
    expect(l.strip).toEqual({ orientation: 'bottom', tile: { w: 160, h: 120 } });
    expect(l.large.h).toBeLessThanOrEqual(488 - 120 - 16);
  });
});

describe('oneToOneLayout (ux-spec 3.6 and 4.3)', () => {
  it('A at 1280 x 800: desktop 936 x 585, face 280 x 350', () => {
    expect(oneToOneLayout('desktop', 1280, 800)).toMatchObject({
      kind: 'column', large: { w: 936, h: 585 }, small: { w: 280, h: 350 },
    });
  });
  it('B at 1280 x 800: face fills 936 x 648, desktop 280 x 175', () => {
    expect(oneToOneLayout('face', 1280, 800)).toMatchObject({
      kind: 'column', large: { w: 936, h: 648 }, small: { w: 280, h: 175 },
    });
  });
  it('C at 1280 x 800: two tiles 608 x 380', () => {
    expect(oneToOneLayout('side', 1280, 800)).toMatchObject({
      kind: 'side', large: { w: 608, h: 380 }, small: { w: 608, h: 380 },
    });
  });
  it('below 1100 wide the column becomes a 200 x 250 inset on a full-width desktop', () => {
    const g = oneToOneLayout('desktop', 1000, 700);
    expect(g.kind).toBe('inset');
    expect(g.small).toEqual({ w: 200, h: 250 });
    expect(g.large.w / g.large.h).toBeCloseTo(1.6, 1);
  });
  it('the right column grows with the window but stops at 360', () => {
    const g = oneToOneLayout('desktop', 1728, 1117);
    expect(g.kind === 'column' && g.column).toBe(360);
  });
});
