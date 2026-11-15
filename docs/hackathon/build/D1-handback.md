# D1 hand-back: app design polish (sidebar, top bar, thread, desktop panel, hire, profile, team, settings)

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

Status: done. No store, action, route or component-prop change (two optional props added, listed below). Custom components and hooks: `design/custom-components.md`. Decisions: `decisions.md` D-D1-1 to D-D1-5.

## Evidence
- `npm run typecheck:area -- src/renderer`: no type errors. `npm run purity -- src/renderer`: 36 files, no findings.
- `npx vitest run src/renderer/src`: 76 of 77 pass. The one failure, `thread/model.test.ts` "turns the Maya fixture into a day, your message and one employee run", is **time of day, not this pass**: the fixture's messages are minutes before "now", so between 00:00 and about 01:00 they straddle midnight and the timeline (correctly) adds a "Yesterday" divider. I did not touch `model.ts`. It passes after about 01:00; a robust fix is to pin `now` to midday in that test.
- `npm run shots` for shell, thread, desktop, hire, profile, settings, team: see the last section for counts (0 failed). Real photos are now the default in every shot; monogram shots: `shell/sidebar-monogram`, `thread/maya-monogram`, `hire/step-2-monogram`, `team/week-monogram`.
- Live run (mock office `MOCK_LLM=1 DESKTOPS=mock MOCK_SPEED=5 MAX_TEAM=6`, port 4331, `data-d1`, seeded; Vite 4351 proxied; Playwright script in the scratchpad `d1/live.mjs`, no `?shot`): load, open Maya, open the desktop panel, approve, send a message and let the scripted sequence play (15 s), approve the scripted request, hire dialog to step 2 (Writer), Shuffle, profile (⌘I), Team, Settings. **0 console errors, no error boundary.** Screenshots: `shots/live-d1/{desktop-open,thread-after-send,approval,hire-step-2,profile,team,settings}.png`. (One earlier run logged "createRoot() on a container that has already been passed": that is Vite HMR re-running `main.tsx` when another agent edited `ui/styles/stage.ts` mid-run, not an app bug; the rerun was clean.)

## Before and after (`shots/_before/<area>/` vs `shots/<area>/`, `-light`/`-dark`)
| Screen | Before | After | What changed and why |
| --- | --- | --- | --- |
| Sidebar | `shell/sidebar` | `shell/sidebar`, `shell/sidebar-monogram` | Deskmates logo + name; real faces at 40 (tighter crop, hairline ring) or monograms on the person's tint; 10 px presence dot cut out of the face; amber (not olive) needs-you dot; names in label weight; 2 px between rows; selected row lifts to paper with a hairline, hover is a wash; one-row footer (your portrait on your tint, name, Team and Settings with tooltips); tabular times. |
| Top bar | (in every shot) | same | Portrait 32; tabular "Working · 40 min"; More gets a tooltip; Summon meeting stays the only filled button. |
| Thread | `thread/maya`, `working`, `history`, `send-failed` | same names + `maya-monogram` | Centred 768 px reading column; the manager speaks in ink (accent bubble, on-accent text); employee bubbles a 7 % ink wash that also works in dark (the old muted token went black-on-dark); 2 px inside runs; 62ch max line; a quiet time under every run's last bubble; approval row as a hairline card at bubble width; activity steps on one 16 px icon column with right-aligned tabular durations; composer is one line with the send button inline (status line still shows below it); the newest bubble rises 6 px and fades in. |
| Desktop panel | `desktop/open`, `working`, `in-control`, `offline` | same | Screen framed (hairline, container radius); "Live" marker (green dot + word, or spinner + "Connecting") in the header line; the state line drops its own dot so two greens never compete; Take control is secondary, Give back filled; in control the frame gets an ink ring; off and lent show a dashed 16:10 frame with a secondary Start desktop; plan rows tight with one icon column; panel slides in; Close gets a tooltip. |
| State banners | `thread/offline`, `paused` | same | Desktop off and paused are quiet muted bands, not blue alerts; stuck stays red. |
| Hire step 1 | `hire/step-1` | same | Role icons in one size of muted tile, one stroke; role names in label weight. |
| Hire step 2 | `hire/step-2` | `hire/step-2`, `step-2-monogram` | Portrait 144 (real face), name in display size, role, personality in body secondary; Shuffle and Edit as labelled quiet buttons; one centred "Hire Marcus"; face and name cross-fade on Shuffle. |
| Profile | `profile/maya` | same | Portrait 96; sections separated by space (gap 8), not rules; tabular uptime. |
| Team | `team/week` | `team/week`, `week-synced`, `week-monogram` | Figures in display-2 with tabular figures; Portrait 32 in the table; "Synced with Databricks · 2 minutes ago · Open traces" (link only when `TeamReport.experimentUrl` is set; `week-synced` shows it). |
| Settings | `settings/default` | same | Same section rhythm as profile; connection rows aligned to the content edge. |
| First run | `shell/first-run` | same | Three real faces (Portrait 72). |

## Interfaces added (nothing renamed or removed)
- `ui/tint.ts`: `tintIndex(id, name?, portraitUrl?)`, `tintVars(...)`, `TINT_COUNT`. `ui/Portrait.tsx`: `Portrait`, `PortraitProps`, `PortraitPerson`.
- `desktop/parts.tsx`: `Screen` takes optional `onState`; `StateLine` takes optional `hasDot` (default true); new exports `LiveMarker`, `shownScreenState`.
- `scripts/shots.ts`: only the `/media/portraits/*` route changed, to serve `config/portraits/<file>` when it exists (placeholder otherwise), as the orchestrator allowed.
- Fixture/shot-only: `team` shot flag `synced=1` (Databricks source, synced 2 min ago, an example `experimentUrl`).

## Own criticisms, most important first
1. The employee portrait sits at the top of a run, not beside its last bubble (D-D1-2). Bottom alignment would be more conversational, but Astryx's ChatMessage gives no per-bubble avatar slot, and runs mix bubbles, activity lines and approval cards.
2. Hire step 2's Shuffle is a fade-in of the new face, not a true cross-fade (the old face unmounts at once); with real photos there is a brief tint flash if the next image is not cached yet.
3. The composer is restyled structurally (`> div:first-child`), which depends on ChatComposer's internal DOM; an Astryx upgrade could undo the one-line layout (it would fall back to the stock two-row composer, not break).
4. "Open traces" uses `target="_blank"`; in Electron that opens a bare BrowserWindow unless main adds `setWindowOpenHandler` → `shell.openExternal` (outside my scope).
5. Dark mode state banner (muted) is darker than the surface, which reads as a band but is the one place where the dark tone order inverts.

## Notes for others
- Stage agent: `Portrait` now uses the square crop and a 1 px hairline for photos; tints 0-3 are the brand hues. Nothing to change on your side.
- Brand: `Logo` is used at 24 px in the sidebar header (the interim two-ring mark is deleted). Tints use the brand angles (262, 62, 357, 160 from the brand README; 300, 200, 90, 25 between). `--am-tint-line-*` is oklch(0.75 0.15 h), the brand tile strength, for the stage hairline.
- The cast is 7 now but the office still has a `writer` preset; the fixtures keep Hannah for that preset (her file still exists), and the hire shots use `role=sales` so they show a distinct face.
- Processes: mock office 4331 and Vite 4351 are stopped at the end of this pass; `data-d1/` can be deleted.
