# D1 round two hand-back: app screens, exactness and character

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

Before: `shots/_round1/<area>/`. After: `shots/<area>/`. Functionality frozen; additions listed at the end.

## Shared pieces (built first)
- `ui/DeskLoader.tsx`: `DeskLoader({ size?: number = 40, label?: string })`. The mark's four tiles in exact brand colours, breathing clockwise (opacity 1 to 0.35, 1.2 s, 0.3 s stagger), static under reduced motion, `role="status"` named by the label.
- `ui/Desks.tsx`: `Desks({ people?: { id, name, portraitUrl }[], size?: number = 96, onAdd?: () => void })`. Mark geometry (gap 6.1 % = 13/213, handle 42 x 9 at 3.5 above centre, 30 % radius as the CSS stand-in for the superellipse). Empty desk = soft tint of its slot; filled = the person's tint at brand strength with the darker handle, so the seeded team is the logo.
- **Stage leave:** `App.tsx` keeps `<Stage />` mounted 240 ms after `store.call` becomes null (`useStageLeave`). The stage is always wrapped in `<VStack data-am-stage-root>`; during those 230 ms the wrapper also has **`data-am-leaving=""`**, is `position: fixed; inset: 0; z-index: 10; pointer-events: none` over the app, and fades out (`am-leave`, `--duration-fast-max`, `--ease-exit`; rules in `ui/styles/app.ts`). Delay is now **240 ms** (matches the entry). The stage instance is the same one (stable tree position), but `useCall()` sees `call === null` for those 230 ms, so participants are empty: **stage agent, snapshot the last call inside Stage if tiles vanishing during the fade shows.** Verified live: attribute seen, no console error.

## Known faults, fixed
| Fault | Fix | Measured |
| --- | --- | --- |
| Face at the top of a run | `Messages.tsx` splits each employee run after its last text bubble; the face is bottom-aligned (`data-am-run="text"`), lifted by one supporting line + metadata padding; trailing activity/approval continues in a second `ChatMessage` with an empty 32 px avatar slot, 4 px below | face bottom 562 = last bubble bottom 562 (was 555 before fixing the wrapper's inline line-box gap) |
| Shuffle fade-in, tint flash | next portrait preloaded (≤ 1.5 s) before swap; old and new faces in one grid cell cross-fade 230 ms; old text hidden at once, new text fades in after 130 ms (overlapping text ghosted badly, tried first and rejected) | frame-by-frame at 60/120/200 ms: no tint, no ghosted text |
| Composer relied on internal DOM | rules anchored only on `.astryx-chat-composer`, `.astryx-chat-composer-input`, `.astryx-chat-send-button` via `:has()`; if they change, rules stop matching and the stock composer remains | 50 px one-line body, status line still shows |
| Team lower half plain; grid | share bars in tint (below); Team column centred at the thread's width, header text aligned to it | "Team" left 396 = figures 396 = table text 396; range control right 1164 = Cost text right 1164 |
| First run generic | four empty desks (144 px) + "Hire your first deskmate" | |
| No stage leave | above | |

## Character
- Desks in two places: first run (empty), hire dialog team-full (filled: the logo). A third place (hire header) was tried mentally and left out: it repeated the sidebar logo 200 px away.
- DeskLoader in: app start ("Opening Deskmates", replaces the skeleton frame), hire "Finding the right person" (replaces skeleton + spinner), desktop starting ("Starting Priya's desktop", new `desktop/starting` shot). Small spinners stay elsewhere.
- Words: "Hire your first deskmate", "Give them a role. They get their own desk and desktop.", "Four desks, four deskmates" / "Your team is full. Remove someone to hire again.", desk button "Hire a deskmate". States and controls unchanged.
- Tint as data: Team Hours column has a 56 x 4 bar per person in their tint, length = hours / busiest person's hours.
- Selection: brand-blue wash (`--am-tint-line-0` at 32 %, 55 % on ink bubbles); composer caret is ink.
- Arrivals: a newly hired sidebar row rises in (once; ids known at first load do not animate). Stage leaves with a fade. "Call with Jonas · 1 min" already shows as the thread's system line (checked live after a call).

## Layer pass (findings → fix)
- **Geometry, thread:** bubble text, activity chevron and time all at x 468; approval card at the bubble edge 452 but its dot sat at 464 → card inline padding 12 → 16, dot now on 468. Composer, day divider and user bubbles share 412–1148.
- **Geometry, Team:** header 372 vs content 396 → header gets the page column + 24 px inline padding. Column was left-aligned at 880 px while the thread is centred → centred, 816 px max.
- **Geometry, desktop panel:** "Starting" showed a grey dot and a Connecting marker over the loader → state line dot hidden while starting, Live marker hidden while starting.
- **Typography:** unchanged scale; checked no new weights (labels 500, names display-3/-2 400).
- **Contrast (measured):** monogram ink on tint 6.5–7.6 : 1 in both themes; ink bubble 17.2 : 1 (light), 16.7 : 1 (dark); employee bubble 17.1 / 12.6 : 1.
- **States:** desk add button has hover; loader has reduced-motion still; arrivals do not replay.
- **Icons:** unchanged; role tiles one size.
- **Content:** copy above; curly apostrophes are in fixture copy only where Astryx renders them; app strings use straight apostrophes in code (kept: Figtree renders them acceptably; not changed to avoid touching office-provided strings).
- **Motion:** added loader, shuffle cross-fade, row arrival, stage leave; all under the reduced-motion guard.
- **Edges:** 960 x 640 and 1728 x 1117 checked for thread + panel; long names truncate (maxLines 1).
- **Platform fit:** `user-select: none` on side nav, layout header/footer, dialog/drawer headers, buttons, tabs, radios, switches, list items, badges, table headers, system lines, metadata, desks; arrow cursor on controls, pointer only on links; thin scrollbars (`scrollbar-width: thin`, ink 22 %); antialiased text. Checked in Electron (`scripts/smoke/shell.ts`: all checks passed; `shots/smoke/shell-window.png` shows the thin overlay scrollbar and the drag header).

## Checks
typecheck clean; purity 0 findings; vitest 79/79; live Playwright run (mock office 4331, Vite 4341, data-d1): load, desktop panel, approve, send + scripted run, approve, hire step 2, Shuffle, profile, Team, Settings, call and end call: 0 console errors, no error boundary, `data-am-leaving` seen; screenshots in `shots/live-d1/`. Shot counts at the end of this file.

## Additions (optional, nothing renamed)
`ui/Desks.tsx`, `ui/DeskLoader.tsx`; `desktop/shots.ts` `starting`; `App.tsx` `useStageLeave` and the stage wrapper.

## My three remaining criticisms (updated)
1. The loader animates in screenshots, so the shot PNGs catch it at a random phase (looks like faded tiles in some frames).
2. The desk corners are a 30 % border radius, not the mark's superellipse; side by side with the logo at 144 px the difference is visible to a designer.
3. The stage fades out with empty tiles unless the stage snapshots the last call (stage agent's side).


## Juror findings (critique-round-2.md), app items
| # | Finding | Done |
| --- | --- | --- |
| 2 | Amber dot 1.49 : 1 | Light: `oklch(from var(--color-warning) 0.64 c h-14)` = rgb(196,122,0), **3.43 : 1** on white; dark keeps the bright warning (about 11 : 1 on the dark row). Applies to every warning StatusDot (sidebar, desktop panel, picker). The approval card no longer has a dot (it crowded the title once the title moved to the text edge); its hairline is that same amber instead. Second quiet cue for needs-you: the row's second line is already primary text; not adding more. |
| 3 | Timestamps focusable, popover stuck open | `hasTooltip={false}` on sidebar, thread and approval times: they render a plain `<time>` with the full date as its accessible name; 0 tab stops (checked). |
| 4 | Six banner looks | One pattern: **`data-am-banner=""` on an Astryx `Banner`** (the attribute lands on `.astryx-banner-frame`). CSS in `ui/styles/app.ts` (global, so it also works on the stage): muted surface, primary title, secondary description, status shown only by the icon colour (`.astryx-banner-icon[data-status]`: error red, warning deep amber, info/success grey), actions secondary buttons. In the thread it is a rounded band in the 736 px column. Used by stuck, offline, paused, team error and app error. **Stage agent: add `data-am-banner=""` to your Banners; nothing else needed.** Send-failed stays Astryx's composer status (one line under the composer), not changed: it is the composer's own error slot. |
| 5 | No leave fade | done, 240 ms, `data-am-leaving` on `[data-am-stage-root]` (App.tsx). |
| 7 | Drawers without an edge; profile clips | `data-am-drawer` on both drawers: 1 px emphasized border on the inline start, bottom padding; profile sections gap 6 and a 2-row personality field, so it fits at 800 px (scrollHeight 735 = clientHeight 735). Push-instead-of-cover at ≥1100: not changed (Drawer is an overlay component; would mean re-layout of the thread, a behaviour change). |
| 8 | Full team: rows clickable, overflow | Role list and "Describe a role" hidden when full; desks + "Your team is full" / "Four desks, four deskmates. Remove someone to hire again." + secondary "Open Team" (closes the dialog, opens Team). |
| 9 | Three left edges; approval width | One edge at **468**: bubble text, time, activity text (chevron hangs in the gutter at 443), approval title (card padding 16 minus the 1 px border). Approval width = bubble max (`min(80%, 60ch + 32px)`). Bubble max width now 60ch + 32 px; radius 20 px (container 12 + element 8), grouped corners unchanged. |
| 10 | Header baselines | Browser: sidebar band 64 px, brand centred at y 32 = the top-bar name's centre (32 / 32). Electron (`html[data-am-electron]`, set in `initApp` when `window.shell` exists): the shell's 28 px inset is replaced by one 8 px step on both title bands; brand centre y 50 = top bar name-and-role block centre y 50 (measured 50 / 50 with the attribute set), below the traffic lights; `scripts/smoke/shell.ts` passes every check including the traffic-light clearance (header content starts at y 38, rule ≥ 30). Optional for main: `trafficLightPosition` on the same line would let the brand move up to the name's line. |
| 14 | Robotic seed copy | Fixture copy fixed ("On it. I’ll reproduce it first.", approval "Puts the fix on the test site"). `scripts/seed.ts` is outside my scope: **owner of seed should vary acknowledgements, state outcomes and seed the greeting first.** |
| 15 | Status vocabulary | Not changed here: the sidebar's second line comes from `rowLine()`/server `stateDetail` ("Waiting for you" is the office's detail while you are in control); changing it means touching presence logic shared with tests. |
| 16 | Team grid, bars | Team column centred on the thread's width; header aligned (396/396); bars now **after** the number, 56 x 4 with a muted track, length relative to the busiest person. Stacked bar (proposal 3): not done; per-row bars tie the number to the person, which the stacked bar loses. |
| 17 | Row pitch, time alignment | Every row 56 px; time top = name top (80/80, 138/138, 196/196, 254/254). |
| 18 | Typing spinner | Three 6 px dots in a bubble, fading in turn (1.2 s, 0.2 s stagger, still under reduced motion). |
| 20 | Describe-a-role textarea | Not changed this round (the Continue button already exists under it; see shots). |
| 21 | States differ | App start uses DeskLoader; team error uses the banner pattern with "Try again"; thread error stays an EmptyState. Skeleton width in thread loading: not changed. |
| 23 | Composer shadow | Removed; 1 px emphasized hairline. |
| 24 | Settings colours, jargon | AI / Desks / Video calls / Databricks; amber for Demo and Voice only. |
| 25 | Reset confirm outline | Not changed (Astryx AlertDialog focus behaviour; not mine to restyle safely). |
| Copy | Section 4 | Done: first run "Pick a role. They get their own desk and computer.", "Try again" everywhere in my screens, app error description, "New hire" title, "Finding someone…", "You approved: <title>", "Running for 3 h", Team "Deskmate" header and empty copy. Not done: offline placeholder hint line (kept the placeholder). |
| Proposals | Section 5 | 2 (loader at start) done; 4 partially (team-full desks); 1, 3, 5 not done (restraint: Desks already in two places, logo in the header). |
| First run | Empty desks look tinted | Not changed on purpose: the orchestrator listed the tinted first-run desks as winning level. |
| Hire step 2 type | 30 light vs 11 | Name 24/600, role 13 secondary (Astryx supporting), personality body primary. |
| Team KPI 35 px | | Now display-3 medium (about 29 px). |

## Final checks (01:40)
typecheck clean; purity 0; vitest 79/79; shots shell 16, thread 30, desktop 22, hire 16, profile 12, settings 6, team 20, all 0 failed (two transient failures earlier were HMR reloads from another agent's edits, rerun clean); Electron smoke all checks passed; live run 0 console errors with `data-am-leaving` seen on call end.
