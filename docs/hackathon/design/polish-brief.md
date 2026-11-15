# Design polish pass (orchestrator's direction, 2026-11-14 23:50)

Read after `rulings.md` and `ux-spec.md`. Where this file differs from them, this file wins: it is newer and comes from the user's own feedback after seeing the build.

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

## What the user said (D-033)

- The front end can still be improved. Keep using Astryx. **Custom components are allowed where we need them.**
- The meeting and call layout is "kind of weird": **the chat box is up, not down.**
- Give the whole app, not only the meeting, the "overall professionalism and final touches" that make it look well designed. "We want to go all out": the goal is the Figma design prize.
- Do it without affecting functionality. Critique your own work and improve it.

## Where we are, honestly

The build is clean and calm, and it is also generic. It looks like a well-kept design-system demo: correct spacing, default components, grey everywhere. Nothing is wrong and nothing is memorable. A judge who sees fifty projects will not remember it. The job of this pass is to keep the calm and add **identity, hierarchy and finish**.

Specific weaknesses, from the orchestrator's review of the current screenshots:

1. **Everyone looks the same.** With no photos yet, every person is a grey circle with two letters. The product's whole idea is that these are colleagues with faces; the UI currently says "four rows of a list".
2. **Both sides of a conversation are the same grey bubble.** There is no instant read of who said what.
3. **The call stage has dead space and a stranded control.** The type box sits in the middle of the right column with emptiness under it. The face tile is a small box in a big column.
4. **The meeting grid is four dark rectangles with letters.** It is tidy and lifeless.
5. **No motion at all.** Everything appears and disappears instantly, which reads as unfinished, not as calm.
6. **Small roughness everywhere:** the sidebar footer stacks the user's name over two tiny icons; presence dots are 8 px specks; two filled black buttons compete on one screen (Summon meeting and Take control); the desktop tile has no frame, so a dark desktop bleeds into a dark tile; timestamps, counts and money are not set in tabular figures; several icon buttons have no tooltip.

## The idea: a quiet studio where the people are the colour

Keep the thesis of `ux-spec.md` ("the portraits are the only colour") and finally make it true:

- **Chrome stays monochrome**: ink, paper and three greys from the Astryx neutral theme. No brand hue, no gradients on chrome, no decoration.
- **People carry colour.** Each employee has one soft personal tint. It appears in exactly three places: the background of their portrait when there is no photo (a monogram on their tint), a hairline of the same tint around their video or still on the stage, and nowhere else by default. When photos arrive, the photo replaces the monogram and the tint stays only as the stage hairline.
- **Ink marks the user.** The manager's own bubbles are ink with paper text. Employees' bubbles stay light. The same ink marks the one primary action on screen.
- **Status colour is rare and meaningful**: green dot working, amber dot needs you, red only for stuck and End.
- **Motion is short and physical**: things arrive, they do not pop.

## How to build custom visuals and still be pure Astryx

`npm run purity` (Astryx doctor) must stay at zero findings for `src/renderer`. Doctor flags raw elements, `style=`, `className=`, imported CSS files and icon JSX tags. It does not flag `data-*` attributes or TypeScript strings. So:

- **Every element is still an Astryx component.** No raw `<div>` or `<span>`, no `style`, no `className`, no `.css` files. Raw `<video>`, `<canvas>`, `<img>` stay inside `src/renderer/src/media/` only.
- **Custom styling lives in exactly two files**, as CSS text in TypeScript, installed once as a constructed stylesheet: `src/renderer/src/ui/styles/app.ts` and `src/renderer/src/ui/styles/stage.ts` (scaffold exists; `installStyles()` is already called from `main.tsx`). Rules attach to **`data-am-*` attributes** that you put on Astryx components (`<Card data-am="tile" data-am-speaking>`). First check that the component you use forwards `data-*` attributes to the DOM (render it and look); if one does not, wrap it in a layout component that does, or target it structurally from a parent that has the attribute.
- **Tokens only inside that CSS**: `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`, `var(--duration-*)`, `var(--ease-*)`, `var(--text-*)`, `var(--shadow-*)` if they exist (run `npx astryx docs tokens`). No hex, no rgb, no named colours. Derive tints with `color-mix()` or relative colour syntax from tokens. Lengths: prefer spacing tokens; raw pixels are allowed only for hairlines (1 px, 2 px) and for sizes that the layout maths computes.
- **Custom components** are small wrappers in `src/renderer/src/ui/` that compose Astryx components and set `data-am-*` attributes. Each one gets two lines in `docs/hackathon/design/custom-components.md`: what it is and which Astryx gap it fills (we will submit this as our gap report and show it to the judges as "how we extended the system with its own tokens").
- Light and dark must both work, because everything is built from `light-dark()` tokens.
- Respect `prefers-reduced-motion`: wrap every transition and animation in `@media (prefers-reduced-motion: no-preference)`.

## Shared pieces (names are fixed so two agents can work at once)

| Piece | File | Owner | Contract |
| --- | --- | --- | --- |
| `Portrait` | `ui/Portrait.tsx` | app agent | `<Portrait person={{ id, name, portraitUrl }} size={24\|32\|40\|56\|96\|144\|number} presence?={EmployeeState} />`. Photo when `portraitUrl` is non-empty and loads; otherwise the monogram (first letters of first and last name) on the person's tint, text in a darker shade of the same tint. The tint comes from `tintIndex(id)` (stable hash of the id into 8 slots). Circle. Optional presence dot, sized in proportion (10 px at 40, with a 2 px ring in the surface colour so it reads as cut out). |
| `tintIndex`, `tintVars` | `ui/tint.ts` | app agent | `tintIndex(id): 0..7`; the 8 tints are defined once in `styles/app.ts` as custom properties `--am-tint-0..7` (soft background) and `--am-tint-ink-0..7` (text on it), derived from Astryx tokens. Eight clearly different, equally soft hues that work on light and on dark. |
| app stylesheet | `ui/styles/app.ts` | app agent | everything outside the stage |
| stage stylesheet | `ui/styles/stage.ts` | stage agent | everything on the dark stage |
| `Portrait` on the stage | | stage agent uses the app agent's `Portrait`; until that file exists it keeps the current avatar and switches before finishing |

## Direction, screen by screen

### Sidebar and frame (app agent)

- Header: a small two-circle mark (the same idea as the tray icon; compose it from Astryx parts or the lucide `Users`-family glyph in a rounded ink square) and "Agent Manager" in label weight; the Hire button as a quiet icon button with a tooltip ("Hire" and its shortcut).
- Rows: `Portrait` 40 with presence; name in label weight; one line under it; time on the right in supporting text with tabular figures; unread count as a small neutral count. A needs-you row: second line in primary colour, amber dot. Hover and selected states must be visibly different from each other and both quiet. 8 px between rows is too loose for a list of people: tighten until four rows read as one group.
- Footer: one row. The user's portrait (same `Portrait`, their own tint) and name on the left; Team and Settings icon buttons on the right, each with a tooltip.
- Top bar: `Portrait` 32, name, then "Role · State · 40 min" in supporting text; Call, Desktop and More as icon buttons with tooltips and shortcuts; "Summon meeting" is the only filled button in the window.

### Conversation (app agent)

- **The manager's bubbles are ink** (accent background, on-accent text). Employees' bubbles keep the light surface. Use the bubble component's own variant if it has one; otherwise style through a `data-am` attribute.
- Runs: bubbles from the same sender within two minutes sit 2 px apart with the grouped corner radii; different senders or a pause get 16 px. The employee's portrait appears once per run, aligned to the last bubble of the run. Bubble text max width about 60 characters.
- Time: one quiet time under the last bubble of a run; "Seen" under the manager's last bubble.
- Activity: "Worked for 6 min" stays one quiet line with a small leading glyph; expanded, the steps are a tight list with a check per step and the duration right-aligned in tabular figures. The live step shows a small spinner and present-tense text.
- Approval: the same width as the widest bubble allows (do not let it hug its text), a hairline border instead of a grey slab, the amber dot, title in label weight, the resolved action under it in supporting text, Deny (secondary) and Approve (primary) on the right. While an approval is pending it is the one primary on screen: that is intended. Resolved: collapses to one supporting line.
- Composer: one line tall at rest, grows with text, the send button only becomes ink when there is text.
- New messages arrive with a 160 ms rise-and-fade; the thread never jumps.

### Desktop panel (app agent)

- The screen sits in a frame: hairline border, container radius, and a very small "Live" marker (a green dot and the word) in the header line when the stream is live, "Connecting" with a spinner otherwise.
- "Take control" becomes a **secondary** full-width button, so that "Summon meeting" is the only filled button. While the user is in control it reads "Give back" and is filled.
- "Lend my screen" stays a quiet text button under it.
- Plan: a tight checklist; done steps in secondary text with a check, the current step in primary text with a spinner, the rest hollow. No heading larger than a label.
- The panel slides in over 200 ms.

### Hire, profile, settings, team (app agent)

- Hire step 1: rows as now; add the hover state and make the icon tiles consistent (same size, same stroke).
- Hire step 2: this is the moment of delight. `Portrait` 144 centred (monogram on the tint until photos exist), the name, the role, the one-line personality, three quiet actions, one "Hire Maya". The portrait and name cross-fade on Shuffle.
- Profile: `Portrait` 96; sections separated by space, not rules; switches aligned on one right edge.
- Team: numbers in the display size with tabular figures; the table with `Portrait` 32; a quiet line "Synced with Databricks · 2 min ago" when it is; the ask box as it is.
- Settings: as it is, with the same section rhythm as the profile.

### The call (stage agent)

The user's complaint is about this screen. Rebuild its layout so nothing floats:

```
+--------------------------------------------------------------------------+
|  Maya Chen · Web developer                              04:12          |   top strip
|  +--------------------------------------------+  +--------------------+  |
|  |                                            |  |                    |  |
|  |                                            |  |    Maya            |  |
|  |           her desktop, 16:10               |  |    (face, fills    |  |
|  |           framed, "Live"                   |  |     the column     |  |
|  |                                            |  |     height)        |  |
|  |                                            |  |                    |  |
|  |                                            |  +--------------------+  |
|  |                                            |  | Message Maya   (↑) |  |   type box at the BOTTOM,
|  +--------------------------------------------+  +--------------------+  |   its bottom edge level with the desktop's
|              Maya   I'd fix the cart total first, then run the tests.    |   caption
|                    ( mic )  ( cc )  ( layout )      ( End )              |   control bar
+--------------------------------------------------------------------------+
```

- Right column (about 320 px): the face tile takes all the height that is left; the type box is docked at the bottom of the column, its bottom edge level with the bottom of the desktop tile. No empty band anywhere in the column. Below 1100 px width the column goes away and the face becomes an inset in the desktop tile's bottom-right corner, as before.
- The face tile is a portrait-shaped surface: video or photo fills it (`cover`, anchored at the top so heads are never cut); with no photo, the person's tint as a soft wash with a large `Portrait` monogram centred. A 1 px hairline in the person's tint; when they speak, the 2 px ring. Name and a one-word state in a small chip at the bottom-left: nothing when idle, "Speaking", "Thinking", "Listening".
- The desktop tile: hairline frame, container radius, "Maya's desktop" chip as now.
- Caption: one line, larger than body, the speaker's name in supporting text in front; the manager's own words in secondary colour. It fades after silence.
- Control bar: a pill-shaped surface (this is one of the custom components: Astryx has no pill container), centred, with three icon toggles, a gap, and End as the only coloured control. Tooltips with the shortcut keys.
- Layout B (face large) and C (side by side) follow the same rule: no floating elements, the type box docked at the bottom of whichever column it is in, C without a type box.
- Entering and leaving the stage: a 240 ms cross-fade. The speaking ring fades in 160 ms.

### The meeting (stage agent)

- Tiles are the same face tile, in the grid from `layout.ts`. With monograms on tints, three or four people finally look different from each other. Name and role in the chip; the one-word state when it applies.
- The ring marks who has the floor. Nothing resizes.
- Spotlight: the large desktop on the left, the strip of face tiles on the right, top-aligned and the same width as the one-to-one column, so one-to-one and spotlight share one skeleton.
- The picker: `Portrait` rows, the same quiet selected state as the sidebar.

## Motion (both agents)

Five motions, all from the duration and easing tokens, all inside the reduced-motion guard: a new bubble (rise 6 px and fade, 160 ms); the desktop panel and the profile drawer (slide, 200 ms); a row changing state in the sidebar (cross-fade of the second line and dot, 160 ms); the stage (cross-fade, 240 ms); the speaking ring (fade, 160 ms). Nothing bounces, pulses forever or moves on hover.

## Finish checklist (both agents, every screen)

- One filled button per screen (two only when an approval is pending, by design).
- Every icon button has a tooltip; icons are one size and one stroke weight in a given bar.
- Numbers that change or line up (times, durations, counts, money) use tabular figures.
- Text never touches a container edge; nothing is closer than 8 px to anything it does not belong to; related things are closer to each other than to unrelated things.
- Left edges line up down the screen. Baselines line up across a row.
- Long names and long lines truncate with an ellipsis and never wrap a row.
- Focus is visible on every control when tabbing.
- Light and dark both look deliberate. In dark, surfaces are separated by tone, not by borders alone.
- 1280 x 800 and 1440 x 900 both look composed; 960 x 640 does not break.
- No functionality changes: same store, same actions, same props between components, same routes.

## How to work: the critique loop

1. Before changing anything, copy the current screenshots of your areas to `shots/_before/<area>/` so we can show before and after.
2. Work one screen at a time. Change, run `npm run shots -- <area>`, **open the PNG and look at it**, in light and dark.
3. Critique it in writing, as a design director would, against this file and the finish checklist. Be hard on it: name at least three things that are still wrong or merely acceptable, then fix them. Three rounds per screen at least; stop a screen only when a round finds nothing you would be embarrassed to show a design jury.
4. After all screens, look at them side by side as a set: do they share one rhythm, one type scale, one sense of weight? Fix what does not belong.
5. Run the checks: `npm run typecheck:area -- src/renderer`, `npx vitest run src/renderer`, `npm run purity -- src/renderer` (zero findings), and a live run without `?shot` against your own seeded mock office that exercises your screens with no console error and no error boundary.
6. Hand back: `docs/hackathon/build/<id>-handback.md` with the before and after file names for each screen, what you changed and why, your own remaining criticisms in order of importance, and every custom component added to `design/custom-components.md`.
