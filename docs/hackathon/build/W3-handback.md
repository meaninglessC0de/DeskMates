# W3 hand-back: UI core (frame, sidebar, thread, desktop panel)

Status: done for the brief, checked against fixtures and a live seeded mock office. Not done: items listed under "Not built".

## Read this first
- **Live check passes.** Office on 4323 (`MOCK_LLM=1 DESKTOPS=mock MOCK_SPEED=5 OFFICE_PORT=4323 DATA_DIR=data-w3 npm run office:once`), seeded with `OFFICE_PORT=4323 npm run seed`, Vite on 4333 with `VITE_OFFICE_URL=http://127.0.0.1:4323`. A Playwright script (not `?shot`) loaded the app, opened the desktop panel, sent messages, approved, lent the screen, took control: **0 console errors, 0 page errors, no error boundary** at every step. Script and evidence: `shots/live/` (01 to 12). The script is `live-w3*.mjs` in my scratchpad; it is small and can be moved to `scripts/e2e/` by the orchestrator if wanted.
- **The selector crash is fixed.** `PlanSection` selected `?? []` (new array each call). Now a module constant `NO_PLAN`. I audited every `useStore(` in `api/`, `shell/`, `thread/`, `desktop/`, `App.tsx` and `main.tsx`: all others return a stored reference or a primitive.
- **Fixture changes (`fixtures/data.ts`, now allowed):** steps last 60 s instead of 40 s, so Maya's group reads "Worked for 6 min" (label = sum of the steps' own durations); Priya's question bubble is 20 min ago instead of 40 so it sorts after her first reply.

## What exists
- `shell/`: `AppFrame` (AppShell elevated, lent-screen banner with live countdown and "Take it back", toast when the grant ends, all shortcuts: `⌘N`, `⇧⌘M`, `⇧⌘D`, `⇧⌘V`, `⌘I`, `⌘T`, `⌘,`, `⇧⌘P`), `Sidebar` (rows, presence dot, needs-you and stuck lines in primary text, time over neutral unread badge, Hire with tooltip, footer user name, Team and Settings, "No one yet"), `TopBar` (identity block opens the profile drawer, live `Timer` while working, Call, Desktop toggle, More menu with Profile, Pause or Resume, Restart desktop, Remove (AlertDialog), divider, the one primary "Summon meeting", disabled with a tooltip when only one person), `FirstRun`, `PresenceDot`, `presence.ts` (+ test), `Countdown`, `shotState.ts` (shot-only state).
- `thread/`: `model.ts` (+ test: runs, activity groups, day dividers, bubble grouping, "Worked for" format), `Conversation` (loading skeleton, error with Try again, empty state with role starters that fill the composer, composer "Message Maya" with error status and kept text on a failed send, typing, newest time, "Delivered" or "Seen"), `Messages`, `ActivityGroupRow` (Collapsible, collapsed, steps as sentences, 8 rows then "Show N more", running group shows spinner, latest step and Timer), `ApprovalRow` (Deny and Approve; "Not now" and "Allow" for screen requests; resolved: "You approved this · 10:42"), `StateBanner` (stuck: Show desktop and Try again; offline: Start desktop, hidden while the panel is open because the panel has it; paused: Resume).
- `desktop/`: `DesktopPanel` (440 px docked; Drawer under 1100 px; expand with `⇧⌘↩`, collapse with `Esc` or "Back to chat"), `DesktopExpanded` and `DesktopSide` (320 px column), `parts.tsx` (state line with Timer, `Screen` with connecting, off, can't-show and lent states, Take control or Give back via `POST /control` (SpaceView `mode` follows `controlledByUser`), Lend my screen popover (10 min, 30 min, 1 hour, until I stop; disabled with a tooltip when the permission is off), plan list with "Show all (N)").
- `api/store.ts`: `sendMessage` no longer toasts on failure (the composer shows the error). Nothing renamed.
- `App.tsx`: calls `applyShotState`, keys `Conversation` by employee.
- Shots registered: shell 7, thread 14, desktop 10 (light and dark each).

## Evidence
- `npm run typecheck:area -- src/renderer` -> `no type errors under src/renderer`.
- `npx vitest run src/renderer/src` -> all pass (presence, model, plus the W0c tests).
- `npm run purity -- src/renderer/src/{shell,thread,desktop}` -> each "no raw element Astryx has a component for, no hand-drawn or library icon, and no custom styling."
- Live Playwright run (see above): load, desktop panel with plan, send to Priya (bubble, scripted sequence, ask variant raises a question and "Needs you"), Approve on Maya -> "You approved this", Ines "screen" message -> Allow -> grant -> toast "Ines is back on their own desktop" when the mock releases it, manual Lend my screen -> banner "Ends in 9:59" -> Take it back -> banner gone, Take control -> Give back -> Take control. Narrow window (1000 px): desktop opens as a Drawer, `⇧⌘D` closes it.

## Deviations and not built
- **Presence dots** are `StatusDot` (8 px) for every state, not `AvatarStatusDot` (20 px): the amber needs-you dot only exists as `StatusDot`, and mixed sizes looked uneven. On a call is the ink dot; no icons in dots. Cost: dots are small.
- **Lent banner** is an Astryx `Banner status="info"`, which is blue, and the stuck banner is red: both are spec'd real statuses but they are the loudest things on screen when they appear.
- Not built: context menu on sidebar rows; queueing sidebar reorder while the pointer is over the list; the "New" unread divider; hover timestamps (time is shown only under the newest message); "Not delivered" bubble with Retry (the composer shows the error and keeps the text); "Loading older" has no shot; resizable desktop panel; the outline while controlling; the "Reconnecting" overlay on the screen (SpaceView does not report it); `↩` and `⌘⌫` on a focused approval; "Delivered" does not turn into "Seen" live with the mock office (no `message_seen` event is sent for new messages).
- Copy avoids "her" and "she" (personas have no gender field): "Give them a first task", "Message Maya. Delivered when the desktop is on", "Maya is still working".
- Shot params added in `shell/shotState.ts`: `as`, `control`, `lent`, `myscreen`, `typing`, `approval`, `plan`; read in place: `expand=1`, `popover=lend`, `screen=connecting|error`, `sendfail=1` (composer error state).

## Notes for the next agent
- Any store hook must return a stable reference (see `decisions.md`, 2026-11-14 W3).
- `useHotkeys` registers `mod+...` combos with `allowInInputs`, so they work while the composer has focus.
- `npm run shots` is slow while other agents also run it (3 to 4 minutes per area).
