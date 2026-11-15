# L-desks hand-back: working and talking on the Desks view (15 Nov)

## What landed (all under src/renderer/src)
- `desks/status.ts` (+ test): `deskStatus(employee, slice)` gives the status line: `{ word, detail, tone, progress }`.
- `desks/feed.ts` (+ test): `peerMessages(threads)`, `liveBubbles`, `livePulses`, `nextExpiry`; constants (bubble 8 s, 12 s when text is over 100 chars, pulse 1.4 s, rail keeps newest 80).
- `desks/Rail.tsx`: the messages rail (Astryx ScrollableArea, List, ListItem, EmptyState, Portrait).
- `desks/DesksView.tsx`: `DeskChip` (pill with status line), `Bubble`, `Pulse`, rail wiring, `M` key, one-time backfill, expiry timer.
- `desks/layout.ts` (+ tests): `railWidth`, `deskArea(win, showRail)` (area, rail px, rail text scale). The grid is laid out in the window less the rail; with the rail hidden `deskArea` returns the whole window, so the grid is exactly as before.
- `ui/styles/stage.ts` (`desksCss`): chip, status, bubble, pulse and rail CSS, tokens only, motion under `prefers-reduced-motion: no-preference`.
- Store: `ui.desksMessages` (default true) and `setDeskMessages(on)` in `api/reducer.ts`, `api/store.ts`; reducer keeps the newest 300 steps per employee (`MAX_STEPS`). Tests added.
- Hook: `window.__deskmatesDemo.setMessages(on: boolean)` in `demo/hook.ts`. Key `M` toggles the rail (ignored while Hire, Settings or Summon is open).
- Fixtures: `fixtures/desks.ts` (`desks/working`, `desks/quiet`; `working-no-rail` = `working` with `messages=0`), `fixtures/load.ts` (`messages=0` hides the rail; desks shots use the desks fixture), `fixtures/data.ts` now exports `step`, `task`, `approval`. `desks/shots.ts` registers `working`, `quiet`, `working-no-rail`.

## How the data reaches the view
- The store already keeps steps, task and approvals per employee from the WebSocket (`threads[id]`), open conversation or not. No new event handling. When the view opens it calls `loadThread` for every employee once (backfill from `GET /api/employees/:id/thread`).
- Status line: latest step by `startedMs`, pending approval title, task (plan count, outcome) and `stateDetail`:
  - working: "Working · <latest step>"; if `stateDetail` starts with "Waiting" it is shown alone.
  - needs_you: "Needs you · <pending approval title>" (amber `--color-warning`, the only colour).
  - idle with a done task: "Done · <outcome first line>"; idle otherwise "Idle". Also Stuck, Paused, On a call, Starting, Offline.
  - "3 of 5" (done steps of plan) next to "Desk 1 · Maya" while the task is running or blocked.
- Messages: every step with `peer.direction === 'to'` is one message (sender = step's employee, receiver = `peer.employeeId`); `from` mirrors are ignored so nothing shows twice. Bubble: newest per sender while younger than 8 s (12 s if over 100 chars), keyed by step id so a new one replaces the old and re-pops. Pulse: the receiver's tile, 1.4 s, in the sender's tint. Age is `Date.now() - step.startedMs` (same machine as the office).

## Selectors (Playwright)
- Status line: `[data-am-desk-tile="N"] [data-am="desk-chip"]` (whole pill), `[data-am="desk-state"]` (state word; `data-am-tone="attention"` for needs-you), `[data-am="desk-detail"]`, `[data-am="desk-progress"]` ("3 of 5").
- Bubble: `[data-am-desk-tile="N"] [data-am="desk-bubble"]`; `[data-am="desk-bubble-to"]` ("To Jonas"), `[data-am="desk-bubble-text"]`. Ring pulse: `[data-am="desk-pulse"]` inside the receiving tile.
- Rail: `[data-am-desks-rail]`; rows `[data-am-desks-rail] li` (title `[data-am="rail-title"]`, text `[data-am="rail-text"]`, time `[data-am="rail-time"]`); empty state is the text "No messages between desks yet" (`[data-am="desks-rail-empty"]`). Absent from the DOM when hidden.
- Live check, no office (dev server on the shot page): `const { useStore } = await import('/src/api/store.ts')` then `useStore.getState().applyServerEvent({ type: 'step', step: {..., peer: { employeeId, direction: 'to', text } } })`.

## Checks (as run)
- `npm run typecheck:area -- src/renderer`: no errors. `npx vitest run src/renderer`: 11 files, 106 tests pass. `npm run purity -- src/renderer`: zero findings.
- Screenshots in `shots/desks/`: `working-` and `quiet-` at `1440x900` and `2560x1600`, `rail-on` and `rail-off`; `live-bubble.png`. Looked at working 1440 and 2560 (rail on), working 1440 (rail off), quiet 1440 (rail on); no overlap between face, pill and bubble, no clipping. Other size/state PNGs were generated but not all opened. Vite on 4348 stopped.
- Headless Chromium on the shot page: injecting a `to` step shows one bubble ("To Jonas" + text) on the sender's tile, a pulse on the receiver, a rail row; pulse gone after 2 s, bubble gone by 8.6 s; `M` and `setMessages` add and remove the rail; click on a tile opens that conversation. No console errors.

## Not done or not verified
- Not run in Electron or against the real office (live streams, real `step` timing, backfill from the real thread endpoint). Fixture desktop pictures are placeholders.
- The prefers-reduced-motion path was written (no animation, ring and bubble static) but not exercised.
- Rail text scale uses CSS `zoom` like the pill; rail width is computed in `layout.ts` (px for the `width` prop) from the 20 % rule, minimum 280 px.
- Steps are capped at 300 per employee for live events only; thread pages from the API merge uncapped.
- Events lack nothing needed. Caveat: if the office reuses one step id for a message and later changes `peer.text`, the bubble keeps the same key and will not re-pop.
