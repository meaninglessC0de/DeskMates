# Deskmates brand

Assets: `resources/brand/` (mark, small mark, app icon), `resources/icon.{png,icns}`, `resources/trayTemplate*.png`, `src/renderer/src/ui/Logo.tsx`. Sheets here: `brand-sheet.png` (final), `explorations.png` (rejected variants), `reference-from-user.png` (the brief).

## The idea
Four desks side by side, each with its mate. The dash is a drawer handle (or a closed, content face). It is the user's reference, kept recognisable: four coloured rounded squares in a grid, one dash each. Moves made: continuous-curvature corners, equal-weight colour, the handle lifted above centre.

## The numbers (viewBox 213)
- Tile 100, gap 13 (13%), so the mark is 213 x 213. Tiles are superellipses |x|^4.5 + |y|^4.5 = 1 (continuous curvature), drawn as eight cubic segments, fit error under 0.03%.
- Handle 42 x 9, fully round ends (radius 4.5), 3.5 above tile centre (dead centre looks low).
- Clear space: half a tile on every side.
- App icon: 1024 canvas, ground squircle (exponent 5) 824 wide with 100 margin, soft ground shadow, mark spans 62% of the ground. Ground #1f232b to #14161b (deep neutral, a hint of blue; pure neutral looked flatter next to the pink).

## Colour (OKLCH, flat, no gradients)
| Tile | Hex | L | C | Hue | Handle hex | Handle L C |
| --- | --- | --- | --- | --- | --- | --- |
| Blue (TL) | `#72a3fe` | 0.720 | 0.143 | **262** | `#4f76be` | 0.571 0.120 |
| Orange (TR) | `#fd9e3d` | 0.780 | 0.155 | **62** | `#bf7220` | 0.624 0.132 |
| Pink (BL) | `#f874a9` | 0.729 | 0.170 | **357** | `#ba4f7b` | 0.578 0.145 |
| Green (BR) | `#34cb8b` | 0.749 | 0.155 | **160** | `#0f9663` | 0.595 0.131 |

Equal weight, not equal L: with identical L, orange read brown and heavy. Handles keep the tile's hue, about 0.15 L darker, and are tuned to the same contrast (1.8 : 1) against their own tile. Employee tints should be derived from these hue angles (262, 62, 357, 160) at L about 0.72 to 0.78, C about 0.14 to 0.17.

## Chosen and why
**B "Handle", flat.** Faithful to the reference, but the handle sits optically centred and is a little wider, which makes the drawer reading work. Flat beat the soft top-to-bottom shade (tested at 2 to 3.5% L): at 16 and 32 px they are indistinguishable, at 128 the shade is richer but the bottoms of pink and green turn muddy, and a flat mark is one hex per tile for tints, favicon and print.

## Rejected
- A faithful, centred dash: dash looks low.
- C one smiling tile: reads as an emoticon, breaks the handle idea, noise at 32 px.
- D varied dash widths: charming large, looks like a rendering error at 32 px.
- E gap 10%, exponent 5.5: reads as one object but the corners harden and the friendliness goes.
- F soft shade, G rounder (exponent 4, gap 14%): see above; G is softer and less precise.

## Small-size rule
Below 24 px use `deskmates-mark-small.svg` (gap 17%, no handles): at 16 to 20 px the 1 px handles smear into low-contrast blobs and the 0.9 px gap closes. From 24 px up use the full mark. The favicon is the small variant. The tray glyph is separate, pixel-aligned (18 px canvas, 1 px margin, tiles 7, gap 2; handles are 3 x 1 px cut-outs, crisp at 1x and 2x).

The Logo component renders the full mark; pass a size under 24 only if you accept the smeared handles (swap the import to the small SVG).
