# D2 hand-back: stage design polish (call and meeting)

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

Status: done. Owns `stage/**` (not `useLiveKit.ts`, untouched), the visual side of `media/AvatarVideo.tsx` and `media/SpaceView.tsx`, `ui/styles/stage.ts`, `ui/StageTile.tsx`, `ui/StageChip.tsx`, `ui/ControlPill.tsx`. Uses the app agent's `Portrait` and tint properties everywhere (stage, strip, picker).

## Read this first
- **`CallSession` unchanged.** No store change. Selectors untouched (`s.call`, `s.employees`, `s.settings?.captions ?? true`).
- **Same functionality:** tile click addresses, `1`-`4`, `M` `C` `L` `S` `G` `⌘.`, layout menu, Show desktop, Swap, type box sends with `sendMessage`, End, mute, captions. Live run confirmed (below).
- **`AvatarVideo`:** new optional `ratio` prop (default 4:5 as before) and two `data-am-*` attributes on the `<video>` (`data-am-video`, `data-am-playing` set from `onPlaying`/`onEmptied`; visual only). Connection code unchanged. **`SpaceView`:** `data-am-space={mode}` on its Card only.
- Stage shots now show the **real cast stills** by default (imported from `config/portraits/` in `stage/fixtures.ts`, so they work whatever `scripts/shots.ts` serves); `portraits=none` gives the monogram fallback.
- Not mine but seen: `src/renderer/src/thread/model.test.ts` has 1 failing test (thread fixture text); stage tests all pass.

## What changed and why
1. **One-to-one A** (the complaint): desktop framed on the left; a right column exactly as tall as the desktop: the face fills it, the type box is docked at the bottom, its bottom edge level with the desktop's. The row is centred in the stage box, so any spare height is a symmetric margin, never a band inside the column. Column = 24 % of the stage, 280-360 px.
2. **B (face focus) departs from the brief:** a narrow right column holding only a small desktop and the type box always left a ~330 px empty band above them (tried, screenshot looked like the original fault). B is now one centred column, as tall as A's row: a **4:3** face over the docked type box, the desktop as a 200 x 125 inset in the face's corner. 4:3 rather than full width because the avatar video is 512 px square: a 920 px wide tile cropped the head and upscaled it visibly.
3. **C** unchanged geometry (two 16:10 tiles); no type box.
4. **Spotlight shares the skeleton:** same large desktop size and the same column width as A; strip tiles top-aligned, never taller than the desktop. Short strip tiles (4 people, 296 x 134) become rows (portrait circle + name and role), like the sidebar, because a photo cropped to a 2:1 band shows only eyes; a tile with the live video stays a video tile. Below 1100 px: bottom strip of 160 x 120 tiles that stack portrait over name.
5. **Face tile:** photo or video fills it (`cover`, `object-position: center 40%`: whole head in 4:3, eyes just above middle; the tall column crops only the sides). Still and video both use the square framing (`-sq.jpg`, same as the 512 px video), same crop and anchor, and the video layer fades in over the still once frames arrive: no jump. Eased gradient scrim under the chip. 1 px hairline in the person's tint, 2 px accent ring above the media that fades in. No photo: dim tint wash, bright soft disc with a darker monogram (the logo's squares with their dash). With the four brand tints the 2 x 2 meeting reads as the Deskmates logo (fixture order set to hire order: blue, orange / pink, green).
6. **Control pill** (custom): capsule, 40 px circular buttons, divider gap, End the only coloured control (error mixed into body, primary text). Tooltips with keys on every control.
7. **Caption line:** large type, speaker name in supporting text on the same baseline, your words secondary; the last line stays and fades after silence.
8. **Top strip:** one centre line with the caption and the pill: name, role, timer (tabular figures).
9. **Ground and frames:** stage on `--color-background-body`, tiles and pill on surface; desktops letterbox on body inside a hairline frame; the desktop label is a small blurred capsule so it never darkens the dock.
10. **Motion:** stage opens with a 230 ms fade; layout changes cross-fade (body keyed by layout); ring fade 175 ms; caption fade; video-over-still fade 310 ms. All in the reduced-motion guard, all token durations.
11. **Picker:** `Portrait` rows with the sidebar's own row style (`data-am-people`), overlapping 24 px portraits on "Everyone".

## Layout cells that changed (`layout.test.ts`, 22 tests pass)
- Bottom reserve 104 -> 112 (pill); max stage width 1600 -> 1680. `stageBox` 1280x800 1232x648 -> 1232x640; 960x640 912x488 -> 912x480; 1728x1117 1600x965 -> 1680x957; 2560x1440 1600x1288 -> 1680x1280.
- Grid N=4: 960 304x228 -> 298x224; 1280 410x308 -> 405x304; 1728 622x467 -> 616x462; 2560 792x594 -> 832x624. Grid 1728 N=2 792x594 -> 832x624, N=3 522x392 -> 549x412; 2560 N=2/N=3 the same. 960 and 1280 N=2/N=3 unchanged.
- One-to-one A 1280: desktop 936x585 -> 920x575, face 280x350 -> 296x515, type box 296x48 (new). B: face 936x648 -> 686x515 (4:3), desktop 280x175 column -> 200x125 inset. C 608x380 unchanged. Inset (<1100): face 200x250 -> 160x200.
- Spotlight 1280 N=3: desktop 984x615 -> 920x575, strip 232x174 -> 296x183; N=4 200x150 -> 296x134; 960 N=3 bottom strip unchanged (large 550x344).

## Checks
- `npm run typecheck:area -- src/renderer`: no type errors. `npx vitest run src/renderer/src/stage`: 22 passed. `npm run purity -- src/renderer`: 35 files, zero findings.
- `npm run shots -- stage`: 64 written, 0 failed (two earlier runs had a `createRoot` console error caused by another agent's concurrent edit of `main.tsx` triggering HMR mid-run; clean on rerun).
- Live, no `?shot`, mock office on 4332 (`data-d2`, seeded), renderer 4342: a call (top-bar Call) and a 4-person meeting (picker, Everyone), 30 s each, plus `l`, `c`, a tile click, Tab focus and `⌘.`: no console error, no error boundary. Screens in `shots/live-d2/`.
- Also checked by my own script at 1440x900, 1728x1117 and 1000x700 (not in the repo).

## Before and after
`shots/_before/stage/<name>-dark.png` vs `shots/stage/<name>-dark.png` for every name. Renamed or new: `portraits*` shots are gone (faces are real by default); monogram fallback is `one-to-one-monogram`, `meeting-monogram`, `meeting-4-monogram`, `meeting-4-spotlight-monogram`. Best pairs to show: `one-to-one`, `meeting-4` (and `meeting-4-monogram`), `face-focus`, `meeting-4-spotlight`, `picker`.

## My remaining criticisms, most important first
1. At 1728 x 1117 the one-to-one row leaves ~70 px of stage above and below it: honest geometry (a 16:10 desktop beside a column on a 16:10 window is width-bound) but the composition is less taut than at 1280.
2. C (side by side) leaves wide symmetric bands above and below the pair, and the live avatar video is 512 px, so B and large meeting tiles at big windows show visible softness.
3. In a real 4-person spotlight the speaker's tile shows video while the others are rows: correct, but a mixed strip; and the stage still cuts out instantly on End (the leave fade needs `App.tsx` to delay unmounting, outside my files).
