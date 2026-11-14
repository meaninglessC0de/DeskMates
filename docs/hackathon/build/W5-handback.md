# W5 hand-back: the stage (call and meeting screens)

Status: done, with the cuts listed below. Owns `src/renderer/src/stage/**` (except `useLiveKit.ts`, untouched).

## Read this first
- **No store change needed.** Selectors in my files return stable references (`useStore(s => s.call)`, `s.employees`, `s.settings?.captions ?? true`); derived arrays are built in render.
- **`CallSession` changed** (`useCall.ts`): added `startedMs: number` and `micBlocked: boolean`. `micBlocked` comes from `navigator.permissions` (microphone `denied`) inside `useCall`; `useLiveKit.ts` and `LiveKitMedia` are unchanged, so W7's replacement needs nothing new.
- **Retry for a participant that "couldn't join" is not built** (there is no API to retry one). "Try again" on a failed call ends and restarts it; "Ask again" on "No answer" calls `addressCall`.
- `stage/*` shots: `fixtures/load.ts` always builds a default call for area `stage`; `Stage` replaces it on mount from `?s=<scenario>` (`stage/fixtures.ts`). The `picker` shot sets `call` to null so the app and the open picker render.
- `SummonPicker` imports `PresenceDot` from `shell/` (W3). If W3 renames it, fix the import.
- The Playwright script `scripts/shots.ts` has no viewport option; 1728 x 1117 was taken with my own scratch script (not in the repo).

## Done when
- Layout unit tests: `npx vitest run src/renderer/src/stage` -> `Test Files 1 passed, Tests 14 passed`. They reproduce every cell of the ux-spec 4.2 table (960, 1280, 1728, 2560 wide), the spotlight examples (984 x 615 desktop, vertical strip at 1280 N=4, bottom strip at 960 N=3) and the one-to-one A, B, C, inset sizes.
- `npm run typecheck:area -- src/renderer/src/stage` clean. `npm run purity -- src/renderer/src/stage` -> "5 source files with JSX: no raw element ... no custom styling".
- `npm run shots -- stage` -> `60 screenshots written, 0 failed` (30 states, light and dark; the stage is always dark so the pairs match, except `picker`, which is the app).
- 1728 x 1117 checked for one-to-one, meetings of 3 and 4, spotlight (measured tiles 632 x 474 for N=4).
- **Live check ran** against office on 4325 (mock, seeded), without `?shot`: a call from the top bar's Call button and a meeting from the picker ("Everyone", 4 people), 35 s each, no console error, no error boundary. Also exercised live: `s` swap, `l` cycle, layout menu, `Cmd+.` ends, key `2` and the tile addresses (`POST /calls/:id/address` seen), hover "Show desktop" then `g` back to the grid.

## States in `stage/shots.ts` (all screenshotted)
One-to-one: connecting, quiet, one-to-one (they speak), you-speaking, you-muted, thinking, thinking-long (Still thinking plus "Maya is thinking"), no-answer (Ask again), failed, dropped (banner), mic-blocked, face-focus, side-by-side, portraits. Meetings: 2, 3, 3 quiet, 3 thinking, 4, 4 you-speaking, 3 and 4 spotlight with a desktop, 3 connecting, joining, dropped, failed (couldn't join), no-answer, left (reflows to 2), 3 with portraits. `picker`.

## Decisions
- R10: `SelectableCard isSelected` ring reads clearly (near-white 2 px on dark); fallback not used. Ring is debounced (150 ms in, 400 ms out) in `signals.ts`.
- Top strip title is centred (clears the Electron traffic lights) and the timer shows only while live.
- Tiles with a portrait file or a video track get a dark scrim under the chip; initials tiles have no scrim.
- Picker is a `Dialog` (width 360), not a `Popover` (no trigger ref from W3's button). Same rows, Everyone, cap of 4, offline/paused disabled, "Start meeting" (one person starts the call).
- Right column in one-to-one is 280 px at 1280 and grows to 360 at larger windows (ux-spec gives only the 1280 value).
- "Open System Settings" is a plain link to `x-apple.systempreferences:...Privacy_Microphone`; no bridge call exists for it.

## Not built
Type box ("Message Maya") on the stage, hand raise, add to meeting, auto bring-up of a desktop, connection-quality dot, 175/410 ms fades and FLIP transitions (layout changes are instant), Retry on a participant that could not join, drag. Number keys, M, C, L, S, G, Cmd+. work; `T` does not exist.

## Least happy with
1. The N=4 grid fills the whole stage box, so the tiles sit 17 px above the caption line (spec geometry; looks tight at 1280 x 800).
2. One-to-one layout A: the 280 x 350 face sits centred beside a 585 px desktop with empty space above and below it (the type box that balanced this in the spec was cut).
3. Initials-only tiles are quiet to the point of blank next to the live desktop; it will look better once portraits exist. Also the heavy black scrim strip under the desktop chip.
