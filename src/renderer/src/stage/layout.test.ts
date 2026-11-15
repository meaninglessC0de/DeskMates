import { describe, expect, it } from 'vitest';
import { columnWidth, gridLayout, oneToOneLayout, spotlightLayout, stageBox } from './layout';

describe('stageBox', () => {
  it('subtracts padding, top strip and the 112 px bottom reserve (caption line and control pill)', () => {
    expect(stageBox(1280, 800)).toEqual({ w: 1232, h: 640 });
    expect(stageBox(960, 640)).toEqual({ w: 912, h: 480 });
    expect(stageBox(1728, 1117)).toEqual({ w: 1680, h: 957 });
    expect(stageBox(2560, 1440)).toEqual({ w: 1680, h: 1280 });
  });
});

// Round two: one row of two or three people gets square tiles (the video's and the stills' own shape) that fill the
// stage; the two-by-two stays 4:3 with the mark's 40 px gap. No face tile exceeds 768 px (1.5 x the 512 px video).
// Differs from the printed ux-spec 4.2 table where the polish passes (D2) changed the stage box: N = 4 is height-bound
// (one spacing step off the height, the bottom reserve grew from 104 to 112 for the control pill, and round two set the
// two-by-two's gap to 40 px, the mark's proportion); the stage may now be 1680 wide (was 1600), which changes the
// width-bound 1728 and 2560 cells. 960 and 1280, N = 2 and 3, unchanged.
describe('gridLayout (ux-spec 4.2, revised)', () => {
  const table: [number, number, number[], number[], number[]][] = [
    [960, 640, [448, 448], [293, 292], [272, 204]],
    [1280, 800, [608, 608], [400, 400], [378, 284]],
    [1728, 1117, [768, 767], [549, 549], [590, 442]],
    [2560, 1440, [768, 768], [549, 548], [768, 576]],
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

  it('the N = 4 grid is the mark: a 40 px gap (about 10 % of a tile), and one spacing step free above the caption line', () => {
    for (const [w, h] of [[960, 640], [1280, 800], [1440, 900], [1728, 1117]] as const) {
      const s = stageBox(w, h);
      const g = gridLayout(4, s);
      expect(g.gap).toBe(40);
      expect(2 * g.tile.h + g.gap).toBeLessThanOrEqual(s.h - 16);
    }
    expect(gridLayout(3, stageBox(1280, 800)).gap).toBe(16);
  });
});

describe('evenIn: every centred block sits on whole pixels', () => {
  it('leaves an even leftover in the stage box at every size and layout', () => {
    for (const [w, h] of [[1280, 800], [1440, 900], [1728, 1117], [960, 640]] as const) {
      const s = stageBox(w, h);
      for (const l of ['desktop', 'face', 'side'] as const) {
        const g = oneToOneLayout(l, w, h);
        const block = g.kind === 'column' || g.kind === 'focus' ? g.row : g.large.h;
        expect((s.h - block) % 2).toBe(0);
      }
      // the two-by-two (two equal rows and an even gap) can only be whole-pixel when the stage box height is even
      for (const n of s.h % 2 === 0 ? [2, 3, 4] : [2, 3]) {
        const g = gridLayout(n, s);
        expect((s.h - (g.rows * g.tile.h + (g.rows - 1) * g.gap)) % 2).toBe(0);
      }
    }
  });
});

describe('FACE_MAX: a face never upscaled past 1.5 x its 512 px source', () => {
  it('caps grid tiles and the face-focus tile at large windows', () => {
    for (const n of [2, 3, 4]) {
      const t = gridLayout(n, stageBox(2560, 1440)).tile;
      expect(Math.max(t.w, t.h)).toBeLessThanOrEqual(768);
    }
    const b = oneToOneLayout('face', 1728, 1117);
    expect(b.kind === 'focus' && b.large.w).toBeLessThanOrEqual(768);
  });
});

describe('columnWidth', () => {
  it('is about a quarter of the stage, clamped to 280..360', () => {
    expect(columnWidth(912)).toBe(280);
    expect(columnWidth(1232)).toBe(296);
    expect(columnWidth(1392)).toBe(334);
    expect(columnWidth(1600)).toBe(360);
  });
});

describe('spotlightLayout: the one-to-one skeleton', () => {
  it('N=3 at 1280 x 800: desktop 920 x 574, strip = the 296 px column, tiles fill its height', () => {
    const l = spotlightLayout(3, stageBox(1280, 800), 'desktop');
    expect(l.large).toEqual({ w: 920, h: 574 });
    expect(l.strip).toEqual({ orientation: 'vertical', tile: { w: 296, h: 183 }, cols: 1 });
  });
  it('N=4 at 1280 x 800: a two-by-two of 142 x 281 tiles filling the column, exactly as tall as the desktop', () => {
    const l = spotlightLayout(4, stageBox(1280, 800), 'desktop');
    expect(l.strip).toEqual({ orientation: 'vertical', tile: { w: 142, h: 281 }, cols: 2 });
    expect(2 * 281 + 12).toBeLessThanOrEqual(l.large.h);
    expect(2 * 142 + 12).toBeLessThanOrEqual(296);
  });
  it('N=2 keeps 4:3 tiles, top-aligned', () => {
    expect(spotlightLayout(2, stageBox(1280, 800), 'desktop').strip.tile).toEqual({ w: 296, h: 222 });
  });
  it('the column matches the one-to-one column at every width', () => {
    for (const [w, h] of [[1280, 800], [1440, 900], [1728, 1117]] as const) {
      const sp = spotlightLayout(3, stageBox(w, h), 'desktop');
      const one = oneToOneLayout('desktop', w, h);
      expect(sp.strip.orientation === 'vertical' && sp.column).toBe(one.kind === 'column' && one.column);
      expect(sp.large).toEqual(one.large);
    }
  });
  it('N=3 at 960 x 640 falls back to the bottom strip', () => {
    const l = spotlightLayout(3, stageBox(960, 640), 'desktop');
    expect(l.strip).toEqual({ orientation: 'bottom', tile: { w: 160, h: 120 }, cols: 3 });
    expect(l.large).toEqual({ w: 550, h: 344 });
  });
});

describe('oneToOneLayout (polish brief, "The call")', () => {
  it('A at 1280 x 800: desktop 920 x 574; the column is as tall: face 296 x 514, 12 gap, type box 296 x 48', () => {
    const g = oneToOneLayout('desktop', 1280, 800);
    expect(g).toMatchObject({
      kind: 'column', large: { w: 920, h: 574 }, small: { w: 296, h: 514 }, composer: { w: 296, h: 48 }, column: 296, row: 574,
    });
    if (g.kind === 'column') expect(g.small.h + 12 + g.composer.h).toBe(g.large.h);
  });
  it('A at 1440 x 900 and 1728 x 1117: the column always ends level with the desktop', () => {
    for (const [w, h, desk] of [[1440, 900, { w: 1042, h: 650 }], [1728, 1117, { w: 1304, h: 815 }]] as const) {
      const g = oneToOneLayout('desktop', w, h);
      expect(g.kind).toBe('column');
      if (g.kind !== 'column') continue;
      expect(g.large).toEqual(desk);
      expect(g.small.h + 12 + g.composer.h).toBe(g.large.h);
      expect(g.large.w + 16 + g.column).toBe(stageBox(w, h).w);
    }
  });
  it('B at 1280 x 800: one centred column as tall as A: a 4:3 face 685 x 514 over a 685 x 48 type box, desktop inset 200 x 125', () => {
    const g = oneToOneLayout('face', 1280, 800);
    expect(g).toMatchObject({
      kind: 'focus', large: { w: 685, h: 514 }, small: { w: 200, h: 125 }, composer: { w: 685, h: 48 }, row: 574,
    });
    if (g.kind === 'focus') expect(g.large.h + 12 + g.composer.h).toBe(g.row);
  });
  it('C at 1280 x 800: desktop 746 x 466 and a square face 466 x 466 at one height, filling the width', () => {
    expect(oneToOneLayout('side', 1280, 800)).toMatchObject({
      kind: 'side', large: { w: 746, h: 466 }, small: { w: 466, h: 466 },
    });
  });
  it('below 1100 wide the column becomes a 160 x 200 inset on a 16:10 desktop', () => {
    const g = oneToOneLayout('desktop', 1000, 700);
    expect(g).toMatchObject({ kind: 'inset', large: { w: 864, h: 540 }, small: { w: 160, h: 200 } });
  });
});
