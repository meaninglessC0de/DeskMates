# D2 round two hand-back: the stage, the last one percent

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

Before: `shots/_round1/stage/`. After: `shots/stage/` (64 written, 0 failed). Live (no `?shot`, mock office 4332, production build served on 4342): `shots/live-d2-r2/` (call and four-person meeting, 30 s each, keys, tile click, Tab, ⌘.; no console error, no error boundary; `*-00-calling.png` 250 ms after Call, `*-leaving.png` mid-fade). Real Electron window: `shots/live-d2-r2/electron-call.png` (built app against the mock office).

## Read this first
- `CallSession`, store and shortcuts unchanged. Optional additions only: `CaptionLine` hint gained `action?`; `useCaptionLine` gained an optional 4th argument; `ChipState` gained `lead: 'loader'` and `calling?`; `StageTile` gained `centre?`; `SpaceView`'s frame `<img>` now has `alt=""` with the name on its `AspectRatio` (`role="img"`, `aria-label`) so a failed frame never shows the broken-image glyph.
- **Leave fade (confirmed live):** `App.tsx` unmounts the stage for one render before `leaving` is set, then mounts it again, so a ref alone cannot keep the last frame. `Stage` keeps the last frame with people in it in a module variable and renders it while there is no call. Measured live: root opacity 0.92 / 0.60 / 0.21 at 30 / 80 / 150 ms with both tiles still drawn. Suggest to the app agent (not changed by me): compute `mounted` as `live || was.current` in the same render to avoid the remount.
- Stage banners use the app's `data-am-banner`; on the stage the band is raised one tone (the muted token equals the stage ground).

## Known faults (brief) and the juror's stage findings
| Finding | Done |
| --- | --- |
| Calling moment (juror #1) | Portrait dimmed (64 % body, fades 230 ms), `DeskLoader` 40 over "Calling Maya" in label weight, at least 600 ms even when the call connects at once (`useRinging`); captions and the timer wait; only End in the pill. Then the dim fades and the chip fades in. Meetings: each tile dimmed with a 16 px loader before "Joining". Live screenshot `call-00-calling.png`. |
| Leave fade (#5) | Above. |
| Three-person meeting, side by side, two-person (#6) | Row tiles are as wide as fits up to 4:3 and as tall as fits up to square (the stills and the 512 px video are square): 2 people 608 x 608 (bands 16 px, were 92), 3 people 400 x 400 (were 400 x 300). Side by side: desktop 16:10 and a square face at one height, 746 x 466 + 466 x 466 (bands 87, were 130). Two-plus-one for three people not taken: tiles would shrink to 394 x 296 and the row stops being symmetric. |
| 1728 x 1117 one-to-one leaves ~70 px | **Not changed, because** the row is width-bound: the stage already spans the window (1680), so a taller row needs a narrower face column (face 280 x 805: crops the hair and upscales 1.6x) or a non-16:10 desktop. Measured gap 71 px (6 %) above and below; it is symmetric. |
| Softness and the 4:5 still | `FACE_MAX` 768 (1.5 x the source) caps grid tiles and the face-focus tile. The 4:5 still was not used: in every tall tile the visible width is narrower than 4:5, so the 4:5 and square files show identical pixels; in wide tiles the square file matches the video exactly (no jump). |
| Head crops for all eight | Anchor per tile shape (`data-am-crop`): tall 40 %, 4:3 25 %, 16:10 18 %. Checked all eight people at 378 x 284, 296 x 183, 358 x 752, 296 x 514, 466 x 466, 160 x 200: whole head and chin in every crop. |
| Four-person spotlight mixes kinds (#13) | The strip is now one kind of tile: a two-by-two of 142 x 281 face tiles that fills the column (the mark again), photo or video, names only. |
| End contrast 4.09 (#11) | End is error mixed 64 % into body: white text 5.41:1 (measured). |
| Face chip on photo (#12) | One 28 px blurred capsule (body at 72 %) for every label on media (faces and desktops), detail text at label size; the face gradient scrim is gone. On a tint wash: plain text. |
| Monogram tiles heavy (#13) | Wash is the tint line 22 % into surface (was 34 % into body); disc bright, monogram a darker mark. |
| Desktop: two labels, broken image (#19) | Broken image fixed (`alt=""`). The "Desktop" title bar is inside the mock desktop image served by office, not our UI; a real desktop (checked with `shots/smoke/w1-frame.jpg`) has its own top panel and a centred dock that our bottom-left chip does not touch. |
| Picker (#22) | Square, check and minus glyphs in every row's end slot (Everyone shows minus when some are picked); no state words; the Everyone row shows the four desks filling as people are picked, in desk order. Count in the primary label **not added**: ux-spec says the label never shows a count. |
| Top strip alignment | **Not changed, because** the Electron traffic lights sit at the top-left of the strip; left-aligning the name at x 24 collides with them. The strip, caption and pill share the centre line (measured 640). |
| Caption speaker label 12 vs 17 | Label at 14 (label size), secondary, on the caption's baseline; caption text weight 500 (was 600). |
| "You're muted" in the top strip | Moved to the caption line; the muted mic is a filled light disc with the slashed glyph. |
| "Ask again" inside the chip | Moved to the caption line: "Maya didn't answer [Ask again]"; chip says "No answer". |
| "Thinking" twice | Caption hint removed; the chip carries Thinking / Still thinking. |
| Failed state: text on black | Portrait 96 (or the stack for a meeting) above "Couldn't reach Maya" · "The call didn't connect. Try again in a moment." |
| Face tile focus: browser blue ring | System focus ring (2 px accent) drawn on the tile's hairline layer, one step inside the edge, above the media; distinct from the speaking ring on the edge. Tab order: tiles (each followed by its Show desktop action), type box, Mute, Captions, Layout, End. |
| Face focus bands (B) | **Not changed, because** the face is already the height-limited 4:3 maximum with the type box docked under it; wider means a non-4:3 crop and more upscaling. |
| Meeting top strip "Meeting" | "Maya, Priya, Jonas and Ines · 4:13", one line, ellipsis. |
| Ring not seen live | Checked live: the ring follows the speaker (debounced 150 / 400 ms) and fades 175 ms (`meeting-03.png`). |
| Monitor glyph on a tile | **Not changed, because** it is the Show desktop action, shown on hover or keyboard focus of every tile, with a tooltip. |
| Someone leaves silently | "Priya left" in the caption line for 2 s. |

## Character
- **Four desks, four mates:** in a meeting everyone sits at their own desk: tiles are ordered by tint slot, so a team of four is the mark (blue, orange / pink, green), with the mark's gap (40 px, about 10 % of a tile; was 16). Number keys follow the order on screen. Spotlight with four: the strip is a two-by-two too. Picker: the four desks fill as you pick.
- **Brand loader** for calling and joining.

## Layer pass (measured, 1280 x 800, live DOM)
- Geometry: centred blocks now land on whole pixels (`evenIn`: tiles were at y 80.5, now 81); chip inset 16 px left and bottom on every tile (was 24 on all, now equal and closer to the corner radius); top strip, caption and pill centred at x 640.0.
- Type: top strip 14/500 name, 12 supporting role and timer on one baseline (the timer's inline box differs; baselines match); caption 17/500, label 14 secondary on the same baseline.
- Contrast: supporting text on the stage 6.43:1; caption 17.2:1; End 5.41:1; face chips sit on a 72 % body capsule (white 14 px on the worst room ≥ 7:1 by sampling).
- Hit targets: Mute, Captions, Layout 44 x 44, End 84 x 44; pill 52 tall, 4 px padding.
- Motion: stage in 230 ms; layout cross-fade 230 ms; ring 175 ms; dim 230 ms; video over still 310 ms; chip fade-in 230 ms; all in the reduced-motion guard; the leave fade is the app's.

## Layout cells changed this round (`layout.test.ts`, 24 pass)
Grid N=2: 960 448x448, 1280 608x608, 1728 768x767, 2560 768x768 (were 4:3, 448x336, 608x456, 832x624, 832x624). N=3: 293x292, 400x400, 549x549, 549x548. N=4 (gap 40): 272x204, 378x284, 590x442, 768x576. A 1280: desktop 920x574, face 296x514. B: face 685x514. C: 746x466 + 466x466. Spotlight N=3 desktop 920x574; N=4 strip 2 x 2 of 142x281.

## My three remaining criticisms
1. 1728 x 1117 still leaves a symmetric 71 px above and below the one-to-one row (width-bound; see above).
2. The 512 px avatar is the ceiling: even capped at 1.5x, faces in the two-person meeting at 1728 are visibly soft next to the crisp chrome.
3. The meeting order by desk means a summoned order is not kept; deliberate (everyone has a desk), but it should be confirmed with the user.
