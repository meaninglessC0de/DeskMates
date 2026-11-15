# Design polish, round two: the last one percent (orchestrator, 2026-11-15 00:55)

Read after `polish-brief.md`. Everything there still holds (the idea, the technique, the finish checklist, functionality frozen). This file adds what round two is for.

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

## What the user said (D-035)

"I can already see a visible improvement, and now it looks really, really professional. We've reached 99%, but we want to push for that final 1% to have it be a perfect design. Critique every tiny layer, make the fixes, and have that professional design that oozes character and follows great UI practices."

So round two is not another redesign. The structure, palette and components stay. Round two is **exactness** and **character**.

## Exactness: critique layer by layer

For every screen and every state, in light and dark, go through these layers one at a time. Do not look at the screen "as a whole" until the end; a whole-screen glance is how the last one percent hides. Measure in the browser (element boxes, computed styles, contrast) instead of judging by eye wherever a number exists.

1. **Geometry.** Every left edge, right edge and baseline that should line up, does, to the pixel. Columns share a grid across screens (the thread column, the Team column and the dialog content should feel like the same page). Optical centring where mathematical centring looks off (icons in buttons, a face in a circle, text in a pill). Equal gaps really are equal. Nothing is 1 or 2 px off its neighbour.
2. **Spacing rhythm.** One scale. Related things closer than unrelated things, everywhere. No orphan gaps (a lone 20 px among 16s and 24s). Paddings inside similar containers match.
3. **Typography.** One scale, few weights. Check every text: size, weight, line height, colour role (primary, secondary, disabled). Headings do not shout. Numerals tabular where they change or align. No widows in two-line copy; no text closer than its own line height to an edge. Truncation with an ellipsis, never a wrap that pushes layout. Curly quotes and proper ellipses in copy.
4. **Colour and contrast.** Text contrast at least 4.5:1 (3:1 for large text and for the meaningful parts of icons and controls), in both themes: measure it. In dark, surfaces separate by tone. Tints equal in weight. Status colours only for status. No pure black or pure white surprises on photos.
5. **Component states.** Every interactive thing has rest, hover, pressed, focus-visible, disabled and (where it applies) selected and loading states that are distinct and quiet. Tab through every screen: order makes sense, focus is always visible, nothing traps.
6. **Icons.** One size and stroke per bar, optically aligned with the text beside them, the same glyph for the same idea everywhere.
7. **Content.** Every string read aloud: short, human, sentence case, consistent terms (one word for one thing across the app), no jargon, no tool names. Empty, loading and error copy is specific and kind.
8. **Motion.** Each of the motions is the right length and curve, never blocks input, never plays twice, respects reduced motion. Add the two that are missing (below). Remove any that draw attention to themselves.
9. **Edges.** A very long name; a 300-character message; a thread with one message and with two hundred; zero, one and four people; a plan of one step and of twelve; no portrait; a failed image; 960 x 640, 1280 x 800, 1440 x 900, 1728 x 1117. Nothing breaks, jumps or looks abandoned.
10. **Platform fit (macOS).** Chrome text is not selectable (`user-select: none` on the frame, sidebar, bars and buttons; conversation text stays selectable). Buttons use the default cursor, not the hand, as native Mac apps do; links keep the hand. The title-bar area is clear of content and drags the window. Scroll areas use thin overlay-style scrollbars. Text is antialiased the way Mac apps render it. Check all of this in the real Electron window (run `npx tsx scripts/smoke/shell.ts` or launch the built app), not only in a browser tab.

Write the findings per screen as you go (in your hand-back), each with what you measured, then fix them all. "Looks fine" is not a finding; "the approval card's left edge is 2 px right of the bubbles above it" is.

## Character: where Deskmates becomes itself

The name and the logo arrived after round one. The logo is four desks. The product allows a team of four. That is not a coincidence to waste: **four desks, four mates** is the idea that should now run quietly through the app. Character comes from a few deliberate, repeated ideas, never from decoration.

1. **The desks.** The first-run screen is currently three overlapping faces and "Hire your first employee": generic. Make it the logo at human scale: four empty desks in a two-by-two (soft tints of the four brand colours, each with its small handle, the same squircle geometry as the mark), with one clear action to fill the first. As people are hired, a desk is theirs: the same four-desk motif can appear, small and quiet, wherever capacity is the point (for example the hire dialog's header or the "team is full" state: four filled desks). Use it in at most three places. Build it as one custom component (`ui/Desks.tsx`), from the mark's own numbers (`docs/hackathon/design/brand/README.md`).
2. **The brand loader.** One loading indicator for the moments that take time and matter: the app starting, a desktop starting ("Starting her desktop"), finding a candidate, a call connecting. The four tiles of the mark, breathing in sequence (opacity only, about 1.2 s per cycle, staggered; static under reduced motion). `ui/DeskLoader.tsx`. Ordinary small spinners stay where they are; this is for the four or five big waits.
3. **The word.** They are "deskmates" in the product's own voice where it is natural: "Hire your first deskmate", "Your team is full: four desks, four deskmates." Do not rename states or controls into cute words: Working, Needs you, Idle, Paused, Stuck, Offline stay exactly as they are, and "Summon meeting" is the user's own wording. One voice: warm, brief, plain.
4. **Tint as data.** The personal tint may now appear in one more place: as the colour of that person's small data mark in the Team view (a thin bar showing each person's share of the hours, in their tint, beside the number). It makes the table read at a glance and ties numbers to people. No other new uses of tint.
5. **Selection and caret.** Selected text in the conversation uses a soft brand blue wash; the caret in the composer is ink. Small, and felt.
6. **Arrivals.** When someone is hired, their row arrives in the sidebar (rise and fade, 200 ms) and their desk fills. When a call ends, the stage leaves with the same cross-fade it arrived with (the app must wait about 230 ms before removing the stage: app agent's change in `App.tsx`), and the thread shows the quiet line "Call with Maya · 12 min".

## Known faults from round one (fix these first)

App screens:
- In a run of bubbles the face sits at the top; it should sit beside the last bubble of the run.
- Shuffle in the hire dialog fades in instead of cross-fading, and an uncached photo flashes the tint: preload the next face and cross-fade.
- The one-line composer relies on the chat composer's internal structure: make it robust (target only what Astryx exposes as attributes, and fall back gracefully) or find the supported way.
- The Team view's lower half is empty and plain: see "Tint as data"; also check the column grid against the thread's.
- First run: see "The desks".
- The stage has no leave fade (needs the delay in `App.tsx`).

Stage:
- At 1728 x 1117 the one-to-one row leaves about 70 px of empty stage above and below: let the row grow to use the height, up to a sensible maximum, keeping the proportions.
- The 512 px avatar video and stills look soft in large tiles: cap the face tile's size where softness shows, and prefer the 4:5 still (`maya.jpg`, less cropping) when the tile is tall and the video is not playing, with the cross-fade to video hiding the change; judge by screenshot whether the framing change is acceptable, otherwise keep one framing and cap the size.
- The tall face tile crops the head tightly: check every one of the eight people in every layout; no forehead or chin cut.
- Side by side leaves wide bands: size the two tiles to the stage.
- A four-person spotlight mixes one video tile with portrait rows: make the strip one consistent kind of tile.
- The connecting state is plain: the person's portrait with the brand loader and "Calling Maya".

## An independent critique is coming

A separate reviewer, who has not seen your reasoning, is looking at every screen as a design juror and writing `docs/hackathon/design/critique-round-2.md`. The orchestrator will send you its findings for your screens when it is ready. Treat each as a defect to fix or to answer in one line in your hand-back ("not changed, because ..."). Do not wait for it: start now with your own layer-by-layer pass and the known faults.

## Rules that have not changed

- Astryx components only; custom visuals through `data-am-*` attributes and token-only CSS in `ui/styles/app.ts` and `ui/styles/stage.ts`; brand hues may be literal `oklch()`; `npm run purity -- src/renderer` at zero.
- No change to functionality, store, actions, routes or exported component props (additions that are optional are fine; report them).
- The cast's names: Maya Chen, Priya Raman, Jonas Weber, Ines Moreau, Kenji Watanabe, Amara Lim, Marcus Reyes, Hannah Brooks. Never the old surnames.
- Before and after: the screenshots at the start of this round are in `shots/_round1/<area>/`.
- Same checks before you finish as in round one, plus the real Electron window looked at once.
- Hand-back: `docs/hackathon/build/<id>-round2-handback.md`: findings per layer per screen with what you measured, what you changed, what you chose not to change and why, and your own three remaining criticisms.
