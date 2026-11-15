# V-desks hand-back: the Desks view (15 Nov)

## What landed
- `src/renderer/src/desks/DesksView.tsx` (the view), `desks/layout.ts` (+ `layout.test.ts`), `desks/shots.ts`.
- `src/renderer/src/demo/hook.ts` (always installed from `main.tsx`; typed in `env.d.ts`).
- Store (`api/reducer.ts`, `api/store.ts`): `ui.view` gains `'desks'`, `ui.viewBeforeDesks`, `ui.desksFaces` (default true); actions `openDesks()`, `closeDesks()`, `setDeskFaces(on)`. Tests added in `store.test.ts`, `shellBridge.test.ts`.
- `App.tsx` (renders `DesksView` in place of the app frame, no sidebar or top bar), `shell/AppFrame.tsx` (mod+d), `shell/TopBar.tsx` (Desks icon button, tooltip "Desks (⌘D)", icon Grid2x2).
- Tray: `src/shared/shell.ts` (`{ type: 'desks' }` in the TrayAction union), `src/main/tray.ts` ("Show desks", `Shift+CommandOrControl+D`, directly above "Summon meeting…"; shows the window like the other actions), `api/shellBridge.ts`. `src/main/index.ts` and `src/preload/index.ts` needed no change (they pass the action through).
- `ui/Portrait.tsx` gets an optional `shape` ('rounded' for the face window). `ui/styles/stage.ts` gets the Desks CSS (`desksCss`), tokens only.
- `stage/Stage.tsx` listens for the pin event (`stage/pin.ts`); `stage/useLiveKit.ts` exposes `getConnectedRoom()`.
- `fixtures/load.ts`: area `desks` opens the view; `employees=<n>` seats the first n, `faces=0` hides faces.

## How to open it
Top-bar Desks button, mod+d, tray "Show desks" (Shift+Cmd+D), `__deskmatesDemo.openDesks()`, or `/?shot=desks/four`, `/?shot=desks/two`. Esc or the back control (top-left) returns to the view it was opened from. `F` shows or hides faces. Click a tile: that person's conversation with the desktop panel open. Esc and F are ignored while the Hire, Settings or Summon dialog is open.

## Behaviour notes
- Desk order is the stage's rule: tint order (hire order for the cast), first four, seated sequentially (desk n label = position). Fewer than four: the empty desks are quiet "Hire" tiles in their desk colour.
- Tile size: largest 16:10 tiles for which 2 x 2 + gap + half a gap of margin fit the window; gap = 13 % of tile width (the mark). 1440 x 900: tiles 596 x 372, gap 78. 2560 x 1600: 1058 x 660, gap 138. Pill and face scale in steps (1 to 3) with the tile (`zoom`, set by `data-am-scale`).
- Faces pop in (scale and fade, 360 ms) staggered 0/150/300/450 ms by desk, only when mounted (hidden to shown, or view opened); not under prefers-reduced-motion.
- Tile states: starting = DeskLoader; stream not started = DeskLoader laid over the tile until frames arrive; desktop off = "Desktop is off"; lent screen = "<Name> is on your screen" (same cases as the desktop panel). Paused shows the stream, as the panel does.

## Demo hook: `window.__deskmatesDemo`
`openDesks()`, `closeDesks()`, `setFaces(on)`, `openThread(employeeId)`, `openTeam()`, `pin(employeeId | null)`, `say(text): Promise<boolean>`.
- `pin`: dispatches `CustomEvent('deskmates:pin', { detail: { employeeId } })`; the Stage spotlights that person's desktop in a meeting, or shows the desktop large in a one-to-one call; `null` goes back to the grid or the face. Ignored if the person is not in the call, or no call is live.
- `say`: `room.localParticipant.sendText(text, { topic: 'lk.chat' })` on the connected LiveKit room; false when there is none. Wait until the greeting has finished before calling it. Not exercised against a real call (no office was run).

## Selectors (Playwright)
- Tile: `[data-am-desk-tile="0".."3"]` (desk index; add `[data-am-employee="<id>"]` for a filled desk, `[data-am-hire]` for an empty one). Click it (the wrapper carries the click).
- Face: `[data-am-face="0".."3"]` (the window inside is `[data-am="desk-face-window"]`).
- Back control: `[data-am="desks-back"]`. Top-bar button: `[data-am="desks-open"]` (also `getByRole('button', { name: 'Desks' })`).
- The view root: `[data-am-desks-view]` (`data-am-scale` = pill scale).

## Checks (as run)
- `npm run typecheck:area -- src/renderer`, `src/main`, `src/preload`, `src/shared`: no errors.
- `npx vitest run src/renderer src/main`: 9 files, 88 tests pass. (No test in these folders asserts tray labels. `scripts/smoke/shell.ts` lists tray labels but I did not touch or run it.)
- `npm run purity -- src/renderer`: zero findings.
- Screenshots in `shots/desks/` (`four` and `two`, 1440x900 and 2560x1600, faces on and off), looked at; vite on 4348 stopped. Fixture desktop frames are the placeholder SVG from `scripts/shots.ts`, so "live" content was not seen.
- Interaction check in headless Chromium (shot mode): F toggles faces, Esc and back control leave, top-bar button and mod+d (Meta+d) open, tile click opens the thread with the panel, stagger delays 0/150/300/450 ms.

## Not done or not verified
- Not run in Electron or against the real office: four live streams at 2560 x 1600, the tray item, `pin` and `say` in a real call.
- Known: Astryx's SelectableCard does not forward a click on the picture inside StageTile (its overlays count as nested pressables), so the tile wrapper has its own onClick (the card's button still handles keyboard Enter). The same may apply to `onPress` tiles on the call stage; not changed.
- `docs/hackathon/decisions.md` not edited (out of scope). Decision to log: desks are seated in tint order, sequentially, same as the meeting (D-041).
