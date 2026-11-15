# Critique, round two: independent design juror (2026-11-15, 01:10)

Reviewer: an independent agent that did not build the UI. I read `README.md`, `brief.md`, `polish-brief.md`, `polish-brief-2.md` and `brand/README.md`, and looked at `brand-sheet.png`. Then I opened about 150 fixture screenshots in `shots/*` (taken 00:22 to 00:28, the end of round one) and drove the live app (mock office on 4351, Vite on 4361, Playwright at 960x640, 1280x800, 1440x900 and 1728x1117, light and dark). I also ran `scripts/smoke/shell.ts` (all checks passed).

**How current this is:** the app changed while I was measuring. Round-two work that had already landed live by 01:05 is marked **[landed]**: Desks on first run, Desks in the full Hire dialog, tint bars in Team, the face beside the last bubble of a run, the arrow cursor, chrome `user-select: none`, thin scrollbars, the "Call with Maya · 1 min" line. Every finding below that cites `shots/<area>/...` comes from a round-one still; check it against the live app before you fix it. Findings that cite `shots/critique/...` or "live" were measured at 01:00 to 01:08. My own screenshots are in `shots/critique/`.

Coordinates are CSS px at 1280x800 unless stated. "Owner" is **app** (shell, thread, desktop, hire, profile, settings, team and shared pieces) or **stage** (call, meeting, picker).

---

## 1. Verdict

1. **Where it stands:** calm, correct and finally personal. The portraits, the ink bubbles and the four-desk mark make it look like a product rather than a kit demo. It is at roughly Linear-2021 level of finish, not yet Things or FaceTime.
2. **Not yet a winner, reason 1. The important moments are the weakest-designed.** "Needs you" is drawn as a 1.49:1 amber speck. A call has no visible "calling" moment. Ending a call cuts away instantly. Errors are saturated slabs in four different colours.
3. **Reason 2. Exactness is still about 90%.** The thread has three different left text edges (468, 481, 493 px). The sidebar and top bar headers sit on different baselines. Drawers cut text off mid-word. Team does not share the thread's column. A row with an unread count is 4 px taller than its neighbours.
4. **Reason 3. Character appears in two places, not everywhere.** The four desks show up on first run and in the full Hire dialog. Everywhere else the product sounds like a template: robotic seed copy ("Done. Build the pricing page is finished and saved." six times), "Meeting · 4:13", "Model: Connected".
5. **Already at winning level, do not break:** (a) the thread's ink-versus-light bubbles, with grouped corners at 2 px gaps and 6 px inner radii; (b) the one-to-one call skeleton, where the composer's bottom edge sits exactly level with the desktop tile at y 655; (c) the first-run Desks and the tint palette, which carry the brand's exact hue angles through the whole app.

---

## 2. Top 25 findings (ranked by effect on a juror)

**1. Call: connecting state** · stage · motion/content
Live: 0.6 s after pressing Call, the stage already shows the full face and a "Thinking" chip, and the caption reads "You: How is it going?" (`shots/critique/call-connecting-1280.png`). There is no visible moment where she is being called. The round-one still (`shots/stage/connecting-*.png`) shows only a 10 px spinner in the chip and a lone End button.
Fix: while the call state is `connecting`, the face tile shows the person's tint wash with `Portrait` 96 centred, `DeskLoader` (24 px) under it, and "Calling Maya" in 15 px secondary text 12 px below. The desktop tile stays dark with no chip. The control pill shows only End. Hold the state for at least 600 ms, even if media is ready sooner, so the moment reads. Then cross-fade to the face over 240 ms.

**2. Sidebar and approval card: the amber "needs you" dot** · app · colour/contrast
Live computed colour is `rgb(255,206,47)`. On the white selected row and the white approval card that is **1.49:1**, against the 3:1 that WCAG 1.4.11 asks of a meaningful graphic. The most important signal in the product is its faintest mark (`shots/critique/thread-live-light.png`, the dot at x 45, y 93 and the approval dot at x 465, y 617). By contrast the idle grey dot is 4.8:1.
Fix: amber = `light-dark(oklch(0.64 0.14 70), oklch(0.82 0.16 80))` (about 3.4:1 on white). Use the theme's warning token if `npx astryx docs tokens` lists one that is at least as dark. Apply it to the presence dot, the approval dot, the "Needs you" dot in the desktop panel header and the picker.

**3. Sidebar: timestamps are interactive** · app · states/accessibility
Each row's time is an Astryx Timestamp. Live, tabbing through four rows adds **8 extra tab stops**: a `TIME` element with the browser's default 1 px blue ring `rgb(0,95,204)`, then a "Copy November 15, 2026 at 12:57…" button positioned at x 371, inside the top bar. On focus a popover reading "November 15, 2026 at 12:57:31 AM GMT+0" opens over the brand, and it **stays open** after focus moves to the next row (`shots/critique/focus-sidebar-sheet.png`).
Fix: render the time as plain `Text` (size sm, secondary, `tabular-nums`) with no copy action and no popover. Put the full date into the row's accessible label only. Do the same for thread times if they use the same component.

**4. All screens: one banner family instead of six** · app (stage for the call banners) · colour/components
Measured from the stills:
- Stuck: saturated pink slab, full width (`shots/thread/stuck-light.png`).
- Paused: neutral grey slab (`paused-light.png`).
- Offline: near-black slab in dark (`offline-dark.png`).
- Send failed: pink slab glued under the composer (`send-failed-light.png`).
- Hire full: saturated blue info slab (`hire/step-1-full-light.png`, now replaced live by the desks).
- Call: olive "Reconnecting" slab (`stage/dropped-dark.png`) and maroon "Microphone is blocked" slab (`stage/mic-blocked-dark.png`).
- Error toast: red, bottom right (`shots/critique/meeting-1728.png`).
Fix: one `Banner` look everywhere. Surface `var(--color-background-secondary)` (stage: the stage's raised surface). Text primary. A 16 px status icon in the status colour on the left. Actions as secondary buttons on the right. No tinted background. In the thread, constrain the banner to the thread column (412 to 1148), not the full pane. Send failed becomes a one-line `Text` in error colour under the composer ("Not sent. Try again" as a link), not a slab.

**5. Ending a call: no leave fade** · app (`App.tsx` delay) and stage (CSS) · motion
Live, 100 ms after End the stage is already gone and the thread is fully drawn (`shots/critique/call-ending-1280.png`). `stage.ts` has an `am-stage-out` rule, but the stage is unmounted before it can play.
Fix: on end, set `data-am-leaving` on the stage root, wait 240 ms (the same duration as the entry), then unmount. Under reduced motion, unmount at once.

**6. Meeting with 3 people, and the side-by-side layout: half the stage is empty** · stage · geometry
At 1280x800 the 3-person meeting puts three 4:3 tiles in one row, 298 px tall, with about 250 px of empty stage above and below (`shots/stage/meeting-3-thinking-dark.png`). Side by side leaves about 130 px above and below (`side-by-side-dark.png`). The 2-person meeting leaves about 110 px (`meeting-2-dark.png`). At 1728x1117 the one-to-one row still leaves about 90 px between the tiles' bottom (y 933) and the caption (y 1025) (`shots/critique/call-1728.png`).
Fix: in `layout.ts`, choose the tile aspect per count so the grid fills the available height. For 3 people at a stage aspect under 1.9, use 2 on top and 1 centred below. Otherwise relax tiles from 4:3 towards 4:5 until height is used, with a 520 px maximum tile height for avatar sharpness. In side by side, size both tiles to the available height first, then width.

**7. Profile drawer and narrow desktop panel: they overlay the thread without an edge** · app · edges/geometry
The profile drawer cuts thread text off mid-word, with no hairline, shadow or scrim (`shots/critique/profile-light.png`: "Please put together a sho|"). At 960 px the desktop panel does the same in dark, separated only by about 3% lightness (`shots/critique/desktop-960-dark.png`). At 800 px height the drawer's own content overflows and Restart / Reset… are clipped at the window bottom (`shots/profile/priya-restart-pending-dark.png`, `maya-hear-light.png`).
Fix: give drawers a `border-inline-start: 1px solid var(--color-border)` and the theme's overlay shadow token. When the drawer is modal, add the dialog scrim. The drawer body scrolls, with `padding-block-end: var(--spacing-6)`. At 1100 px and wider, the profile pushes the thread instead of covering it, the same way the desktop panel already does at 1280.

**8. Hire dialog when the team is full** · app · states/edges
[landed] The full state now shows four filled desks with "Four desks, four deskmates". But the eight role rows below are still enabled, with chevrons and hover (Data analyst highlighted). Clicking one returns a 409 (seen live). The list overflows: "Sales" is cut at the dialog's bottom edge with no fade (`shots/critique/hire2-light.png`).
Fix: when the team is full, show only the desks, the line "Your team is full. Remove someone to hire again." and one secondary button "Open Team". Hide the role list and "Describe a role". The dialog then becomes about 300 px tall.

**9. Thread: three left edges and an arbitrary approval width** · app · geometry
Live x positions: bubble edge 452, bubble text and the time under it 468, activity chevron 468 but activity text **493**, approval title **481**. The approval card runs 452 to **1077**. It matches neither the column's right edge (1148) nor the bubble maximum (452 + 556 = 1008) (`shots/critique/thread-live-light.png`).
Fix: make the approval card exactly the bubble maximum, so its right edge is 1008 and its width follows the bubble's max-width token. Inside it, pad 16 px so the title starts at 468 (put the amber dot inside that padding, overhanging to x 456). Put the activity text at 468 and its chevron in a 16 px gutter at 450 to 466, overhanging the bubble edge. Result: one text edge at 468 for bubble text, times, activity, and the approval title and detail.

**10. Frame: the sidebar header and the top bar do not share a baseline** · app · geometry/platform
In the browser, "Deskmates" (17/600) has its box at y 12 to 36 while "Maya Chen" (17/600) sits at y 22 to 42, a 10 px offset. In the real Electron window the brand is pushed down for the traffic lights and sits about 15 px **below** the name (`shots/smoke/shell-window.png`). The top bar is 84 px tall; the sidebar header is about 48.
Fix: one title band 52 px tall across both columns, and the top bar is 52 + 32 = 84 only if needed. Better: make the top bar 64 px and put the brand row and the name row on the same centre line, y = 32. In Electron, move the traffic lights (`trafficLightPosition`) to that same centre line, and indent the brand 78 px horizontally (not vertically) from the window's left edge.

**11. Call control pill: End label contrast** · stage · contrast
"End" is 14/500 white on coral: **4.09:1**, measured live, against the 4.5:1 required for normal text.
Fix: End background `oklch(0.55 0.19 27)` or the theme's strongest error step. Keep the hover a step lighter, not darker.

**12. Face tile chip: state text sits on the photo** · stage · contrast/typography
"Maya" (14/500) plus "Speaking" (12, secondary grey) is drawn straight on the video, with no backing. Over Maya's light-blue blouse the 12 px grey "Speaking" is barely legible (`shots/stage/one-to-one-light.png`, `meeting-4-dark.png` "Priya Speaking"). The desktop chip has a dark pill; the face chip does not. Two treatments for one component.
Fix: the face chip uses the same pill as "Maya's desktop": `color-mix(in oklab, black 55%, transparent)` background, 4 px 10 px padding, name 13/500 white, state 13/400 at 72% white. Same height (28 px) as the desktop chip.

**13. Meeting monogram tiles and the 4-person spotlight strip: the tints get heavy** · stage · colour
With no photo, each tile's background is the dark tint at full strength: navy, brown, maroon and green slabs (`shots/stage/meeting-4-monogram-light.png`). The brown one (slot 1, dark) reads as mud, so the four are not equal in weight. In the 4-person spotlight the strip becomes four big coloured slabs, each carrying a 24 px face (`meeting-4-spotlight-dark.png`).
Fix: tile background `color-mix(in oklab, var(--am-tint-line) 14%, var(--stage-surface))`, monogram circle in `--am-tint` with `--am-tint-ink` letters, 1 px tint hairline. In the spotlight strip, use the same face tile (4:3, cover) in all four slots, as the 3-person strip already does.

**14. Demo data: the seed copy is what jurors read, and it is robotic** · app · content
Live thread: "On it. I will run the checks before I call it done." appears 6 times, "Done. <Task title> is finished and saved." 6 times, and the greeting "Hi, I'm Maya, your web developer. What should I start on?" shows up **after** five days of finished tasks (`shots/critique/thread-live-light.png`). Sidebar second lines alternate between task titles and role names.
Fix (in `scripts/seed.ts`): vary the acknowledgements per person ("On it.", "Starting now. I'll check back when the tests pass.", "Got it, I'll draft two options."). Results should state the outcome, not the title ("Cart total is fixed. Tests pass on mobile and desktop."). Seed the greeting as the first message, dated before the first task. Use the ux-spec's past-tense task titles only where they read naturally.

**15. Status vocabulary: one state, several names** · app · content
- "Needs you" (header) versus "Waiting for you" (sidebar, `shots/desktop/in-control-light.png`).
- "Paused" (header) versus "Paused by you" (sidebar).
- "Offline" (header) versus "Desktop is off" (sidebar and banner).
- The panel header shows "Idle" while its marker says "Live" (`desktop/no-plan-light.png`).
Fix: header uses the state word only: Working · Needs you · Idle · Paused · Stuck · Offline. The sidebar's second line is the task or the reason ("Publish the draft", "Staging site won't load"), never a second name for the state. The panel header shows the state word, and "Live" only as the stream marker.

**16. Team: column grid and tint bars** · app · geometry/data
Live, the Team column runs **396 to 1164**; the thread column runs **412 to 1148**. [landed] The tint bars are 56x4 dashes with no track, all exactly 56 px wide even though they mean "share of hours" (`shots/critique/team-light.png`). Without a track they read as legend keys, not as data.
Fix: use the thread's column (max-width 736, centred). Make the bar a 64x4 track (`var(--color-border)`, radius full) holding a tint fill at `width: share%`. Put it to the right of the number, not the left, so numbers keep the right-aligned column. See also Character proposal 3.

**17. Sidebar rows: time alignment and row pitch** · app · geometry
Live, row heights are 56 / **60** / 56 / 56. The row with an unread count stacks the time over the badge (44 px tall), so the pitch is 58, 62, 58. In every row the time is vertically centred (Jonas: name box 184 to 204, time box 194 to 214), so it lines up with neither the name nor the second line.
Fix: fixed 56 px rows. The time sits on the name's line box (top, `align-self: start`, same 20 px line height). The unread count sits on the second line's box, right-aligned. With no count, the second line runs full width.

**18. Thread: typing is a spinner** · app · component/character
Typing shows a 12 px spinner next to the portrait (`shots/thread/typing-dark.png`). That is a loading glyph, not a person typing.
Fix: an employee bubble, 44x32, holding three 6 px dots in `var(--color-text-secondary)`. The dots fade 40% to 100% in turn, 1.2 s cycle, 0.2 s stagger, and stay static under reduced motion. It arrives with the same 160 ms rise as a bubble.

**19. Call desktop tile: two labels, and a broken image** · stage · content/edges
The mock desktop has its own title bar reading "Desktop" (top left) and our chip says "Maya's desktop" (bottom left): two labels for one thing (`shots/critique/call-1280.png`). When the image fails, the browser's broken-image glyph and the alt text "Desktop" show at the top left of a black tile (seen live at `?shot=stage/...`, `shots/critique/fx-stage-connecting.png`).
Fix: `alt=""` on the frame image. On error, show the tile's off state: a `Monitor` icon at 24 px and "Desktop isn't showing" in secondary text, centred. Keep only our chip as the label.

**20. Hire, "Describe a role": the textarea is clipped** · app · edges
The textarea's bottom border touches the dialog's bottom edge. The native resize handle shows. There is no submit control (`shots/hire/step-1-describe-light.png`).
Fix: `resize: none`, 3 rows, a 24 px bottom pad to the dialog edge, and a primary "Find someone" button right-aligned under the field, disabled while empty. The dialog scrolls the role list, not the field.

**21. Empty, loading and error states: placement and form differ** · app · consistency
- Thread empty: vertically centred (`thread/empty-light.png`).
- Team empty: top-aligned at y 127 (`team/empty-light.png`).
- Thread error: a lone heading at the top with a button (`thread/error-light.png`).
- Team error: a red slab (`team/error-dark.png`).
- Thread loading skeleton: spans the full pane (1240 to 1980 in the still) instead of the 736 px column (`thread/loading-light.png`).
- App loading: a bare grey sidebar (`shell/loading-light.png`).
Fix: every empty and error state is an `EmptyState`, centred in the content area: a 32 px icon (desks for empty, alert for error), a 15/600 title, one 13 px secondary line, one button. Skeletons use the real column geometry. App start uses `DeskLoader` (48 px) centred on a blank window (Character proposal 2).

**22. Summon picker: no multi-select affordance** · stage · component states
The selected row gets a hairline box and a check. Unselected rows have nothing. Nothing says you can pick several. The "Everyone" row, with its avatar stack, reads like a header. Row avatars start at x 378 (display) while the title starts at x 372 (`shots/stage/picker-light.png`).
Fix: a `Checkbox` in each row's end slot (and on Everyone, with the indeterminate state when some are picked). Selected rows use the sidebar's selected background, with no box. Align the avatars with the title's left edge. The primary label carries the count: "Start meeting · 2".

**23. Thread composer: the only drop shadow in the app** · app · decoration
The composer (412 to 1148, y 738 to 788) floats on a soft shadow plus a border. Nothing else in the window has a shadow (`shots/critique/thread-live-light.png`), and it sits 12 px from the window bottom.
Fix: no shadow. 1 px `var(--color-border)` on `var(--color-background)`, radius as now, 16 px from the bottom edge, and the same 16 px gap above it to the content.

**24. Settings: connection status colours and jargon** · app · colour/content
"Desktops: Demo" and "Calls: Voice only" both get a **green** dot (`shots/settings/default-light.png`). Green should mean fully working. "Model" is jargon.
Fix: green only for Connected / Ready / Video and voice. Amber for Demo / Voice only. Grey for Not set up / Off. Rename the rows: "Model" to "AI", "Desktops" to "Desks", "Calls" to "Video calls", "Databricks" stays (it is the sponsor, and the Team view says "Synced with Databricks").

**25. Profile, confirm Reset: the dialog itself is outlined** · app · states
A 2 to 3 px black ring is drawn around the whole confirm dialog: the dialog element took focus-visible (`shots/profile/confirm-reset-light.png`). The destructive "Reset" button is a pale pink fill next to plain "Cancel".
Fix: autofocus "Cancel". The dialog surface gets `outline: none`. "Reset" uses the danger variant's solid fill (same contrast rule as End, see #11).

---

## 3. Per-screen findings

### App frame and sidebar (app)
- Geometry: "No one yet" starts at x 20 while the logo and portraits start at 16 (`shots/critique/first-run-live-light.png`). Fix: start it at 16.
- Geometry: the footer portrait is 24 px and the row portraits 40 px; their left edges match at 16 but their centres sit at 28 and 36. Fix: footer portrait 32, centre 32. Or accept the 24 and say so in the hand-back.
- Geometry: sidebar 280 px is 29% of a 960 px window. Fix: 240 px below 1100 px wide.
- Typography: brand "Deskmates" 17/600 equals the person's name in the top bar (17/600). Fix: brand 15/600, so the person is the hierarchy's top.
- States: Hire, Team and Settings are 28x28 hit targets, while the top-bar icon buttons are 32x32. Fix: 32 everywhere in chrome.
- States: dark selected row is an outline box; light selected row is a white card (`shots/thread/maya-dark.png` versus `-light`). Two treatments. Fix: dark selected = `var(--color-background-secondary)` fill, no border.
- Content: the second line alternates between a task ("Publish the draft") and a role ("Marketer"). Fix: show the role only when there is no task, and show it in tertiary text, so a task always reads as live.
- Edges: a long name (I did not see a fixture) must truncate before the time column. Check with "Alexandria Montgomery-Smith".
- Motion: [landed] row arrival (rise 200 ms) and the second-line cross-fade exist in CSS. Not seen live.

### Conversation (app)
- Geometry: bubble radius is 28 px on a 44 px single-line bubble, so every one-liner is a full pill and two-line bubbles look like capsules (`shots/desktop/open-light.png`). Messages uses about 18. Fix: 20 px, grouped corners 6 px.
- Typography: max bubble width 556 px is about 80 characters at 14 px Figtree; the brief says about 60. Fix: `max-inline-size: min(60ch + 32px, 80%)`.
- Typography: the time under a bubble has a 14 px line box; "Seen" has a 20 px line box. The gaps under the bubble come out at 5 px and 6 to 7 px. Fix: both 12 px text in a 16 px line box, 4 px below the bubble.
- Content: an activity line can sit **above** the bubble it belongs to (Friday in `shots/thread/history-light.png`) or below it (Maya's thread). Fix: activity always precedes the result bubble it produced, in every thread.
- Content: a face can appear next to a lone "Worked for 3 min" line with no bubble (`history-light.png`). Fix: no portrait on a run that has no bubble.
- Content: "You approved this · 11:28 PM" says nothing about what was approved. Fix: "You approved: Deploy to staging · 11:28 PM".
- Content: the offline placeholder "Message Jonas. Delivered when the desktop is on" is too long for a placeholder and truncates at 960. Fix: placeholder "Message Jonas", plus a 12 px hint under the composer: "Jonas gets it when his desktop starts".
- Content: the empty thread's suggestions ("Sketch a layout", "Improve this page", "Make a logo") render as bare text with no affordance (`thread/empty-light.png`). Fix: `Chip` or secondary small buttons, 8 px gap.
- Content: [landed] "Call with Maya · 1 min" appears under the approval card. It fits, but it is the only centred system line apart from day separators. Fine as is.
- States: the stuck state shows the banner and a pending approval at the same time, giving two primaries ("Try again" in the banner and "Approve"). Fix: banner actions are secondary (see top #4), so Approve stays the one primary.
- Motion: the new-bubble rise is not verified live (mock replies arrived while I was not watching). Check it never replays when the thread re-renders on scroll.
- Edges: the scroll-to-bottom button (32x32 at 764, 694) overlaps the approval card when the thread is scrolled up. Fix: centre it 16 px above the composer and give it the surface colour with a border, not a shadow.

### Desktop panel (app)
- Geometry: "Take control" is full width (318 px) while "Lend my screen" is a centred text button. Two alignments in one stack. Fix: "Lend my screen" left-aligned as a small tertiary button under it, or both in one row (Take control 2/3, Lend 1/3).
- States: the Lend popover's "Lend" is a second filled button on screen next to Summon meeting, and the popover covers the Plan list ("Read / Chec / Draft" peek out, `shots/desktop/lend-light.png`). Fix: anchor the popover above the button, and since the popover is modal for its moment, Lend may stay primary.
- States: the current plan step has a spinner when Working and a bold hollow ring when Needs you or Paused (`desktop/in-control-light.png`). Fix: a spinner only while Working; amber dot plus primary text when Needs you; hollow ring otherwise.
- Content: the off and lent states sit in a **dashed** box ("Desktop is off", "Maya is on your screen"). Dashes appear nowhere else. Fix: the same framed tile, filled with `var(--color-background-secondary)`, centred text and action.
- Content: "Can't show the desktop. Priya is still working." shows over a stale image, with "Try again" as bare text (`desktop/cant-show-light.png`). Fix: dim the stale frame to 40% opacity and centre the message on it with a secondary "Try again".
- Typography: "Plan" 14/500 against 13 px steps is fine. Panel header "Needs you" is 12 px secondary at the top left with no name. Fix: "Maya's desktop" 13/500 plus the state marker on the right.
- Motion: the 200 ms slide was not observed live (the panel was open on reload).

### First run (app) [landed Desks]
- Content: the four desks are all tinted although nobody is hired, so empty and full look the same. Fix: empty desk = `var(--color-background-secondary)` fill, 1 px `var(--color-border)` inner hairline, handle in `var(--color-border-strong)`. Fill desk n with tint n as each person is hired (the same component in the Hire header).
- Geometry: desks are 68 px with an 8 px gap and `border-radius: 30%`. The brand is a superellipse with exponent 4.5. At 68 px a 30% radius reads rounder than the mark. Fix: radius 26%, or the mark's SVG path as `clip-path`.
- Copy: "Give them a role. They get their own desk and desktop." The second sentence says desk and desktop, which is two words for one idea. Fix: "Pick a role. They get their own desk and computer."

### Hire step 1 and step 2 (app)
- Typography: on step 2 the name is 30 px **light** weight while the role under it is 11 px (`shots/hire/step-2-light.png`). The 30-to-11 jump has no middle step. Fix: name 24/600, role 13 secondary, personality 14 primary.
- Content: the title "Meet Marcus" repeats the name in 30 px directly below it. Fix: title "New hire", or drop the title and keep only back and close.
- Content: loading reads "Meet your hire" over a grey circle and a spinner, with "Finding the right person" and a disabled "Hire" (`step-2-loading-light.png`). Fix: `DeskLoader` 48 px in place of the circle, "Finding someone…", no disabled button.
- Geometry: in edit mode the fields are full width while everything above is centred (`step-2-edit-light.png`), and the Personality field's bottom is overlapped by the Hire button. Fix: 360 px centred fields, 16 px gap above the button.
- Edges: the stale fixture `shots/hire/step-2-maya-light.png` still shows "Agent Manager", a grey silhouette and a stacked footer. Regenerate or delete it so it never reaches a deck.
- Icons: role icon tiles are consistent (28 px tile, 16 px glyph); good.

### Profile (app)
- Typography: the drawer's title "Maya Chen" 17/600 repeats the top bar beside it. Fix: drawer title "Profile"; the name sits under the 96 px portrait (15/600) with the role.
- Content: "Running · 3 h 0 min". Fix: "Running for 3 h" (drop "0 min").
- Content: four ⓘ icons beside the permission switches (decoration; the tooltips repeat the label). Fix: remove them, and put one 12 px hint under each switch only where it says something new.
- Components: the personality textarea shows a native resize handle and a "51/280" counter at rest. Fix: `resize: none`; show the counter only above 240 characters.
- States: "Reset…" uses an ellipsis correctly. Keep.

### Settings (app)
- Typography: section titles ("Appearance", "Notifications") are 14/500, the same size as the row labels at 14/400. Fix: titles 13/600 secondary, 24 px above each section, 8 px below.
- Geometry: the "Your name" input spans the full width while every other control is right-aligned. Fix: label left, input 240 px right-aligned on the same row, matching the switches' right edge.
- Colour: green dots, see top #24.

### Team (app)
- Data: "+0.2 vs yesterday" is grey whether the change is good or bad. That is fine (calm), but "Same as yesterday" and "+5 vs yesterday" use different patterns. Fix: "±0", "+5" with "vs yesterday" once, in the column header.
- Data: the ask answer lists "Kenji Watanabe" and "and 2 more" in a four-person team (`shots/team/week-answer-light.png`). Fix the fixture: four people.
- Typography: KPI figures at 35 px are the largest type in the app, larger than any heading. Fix: 28 px, weight 500, tabular.
- Geometry: the table's header "Hours ↓" is right-aligned at x 568 (still), while the tint dashes sit left of the numbers. See top #16.

### Summon picker (stage)
- See top #22. Also: "Working" is shown as plain right-aligned text on Priya's row but nothing on Maya's (Needs you). Fix: show no state text in the picker; the presence dot is enough.

### One-to-one call (stage)
- Typography: the top strip reads "Maya Chen" 14/500, "Web developer" 12, "·", "0:06" 12, centred over the whole stage at x 538 to 742. It aligns with no tile edge. Fix: name and role left-aligned at the desktop tile's left edge (x 24); timer right-aligned at the face column's right edge (x 1256), 13 px tabular.
- Typography: the caption's speaker label is 12 px against 17/500 caption text. A 5 px step with a different baseline. Fix: label 13 px secondary on the caption's baseline.
- States: "You're muted" is appended to the top strip in 12 px (`shots/stage/you-muted-light.png`). Fix: the mic toggle shows a filled pressed state in white with a `MicOff` glyph, plus a small "Muted" chip at the left of the control pill.
- States: in the "No answer" state, an "Ask again" button sits inside the face chip over the photo (`no-answer-dark.png`). Fix: show "Ask again" as a secondary button in the caption line.
- Content: "Thinking" appears twice in the long-wait state: chip "Still thinking" plus caption "Maya is thinking" (`thinking-long-light.png`). Fix: the chip only.
- Content: the failed state is text on black with no face (`failed-dark.png`). Fix: the person's `Portrait` 96 above "Couldn't reach Maya".
- Focus: the face tile is an `INPUT` ("Maya Chen. Press to address") that shows the browser's default `auto` ring in light blue, not the 2 px white ring the other stage controls use (measured live). Fix: give it the same focus-visible style as the pill buttons.
- Face focus (layout B): about 295 px empty bands left and right at 1280 (`face-focus-dark.png`). Fix: widen the face tile to the stage's height-limited 4:3 maximum.

### Meeting (stage)
- Content: the top strip says only "Meeting · 4:13". Fix: "Maya, Priya, Jonas and Ines · 4:13" (truncate with an ellipsis).
- States: I could not see a speaking ring on the live meeting (`shots/critique/meeting-1280.png`: Priya is captioned speaking, but her tile has only its tint hairline). Check that the ring follows the speaker and fades in 160 ms.
- Icons: an unexplained 12 px monitor glyph sits at the top right of Ines's tile (live). Fix: remove it, or give it a tooltip and use it consistently on every tile whose desktop can be spotlighted.
- Content: when someone leaves (`meeting-3-left-dark.png`) the grid silently re-flows. Fix: a 2 s caption line "Priya left" in secondary text.
- Spotlight 3 (`meeting-3-spotlight-dark.png`) is the best stage screen. Keep it as the template for spotlight 4.

### Banners, toasts, empty, loading and error (both)
- See top #4 and #21. Also: the toast "Priya is already on a call." is a saturated red bar overlapping the composer's right end (`shots/critique/meeting-1728.png`). Fix: Astryx Toast, neutral surface, bottom centre, 16 px above the composer.

### The set
- One title size per surface: dialogs use 20 px titles ("Hire", "Settings", "Summon meeting"), drawers 17, the Team page 17, the top bar 17. Fix: dialogs 17/600 too.
- Two primary blacks: `rgb(27,27,27)` for the user's bubbles, buttons and switches, against the black of the Lend popover and "Give back". Same token? Check that they all come from one accent token.

---

## 4. Copy review

| Where | Current | Proposed | Why |
| --- | --- | --- | --- |
| Approval detail | Runs deploy.sh on staging.example.com | Puts the fix on the test site | No tool names or file names |
| Approval detail (live) | Pushes the page to the staging site | Puts the page on the test site | "Push" and "staging" are jargon |
| App error banner | Can't reach your team / Check that the app service is running | Can't reach your team / Deskmates is reconnecting… [Try again] | "App service" is internal |
| Send failed | Couldn't send. Check your connection. | Not sent. Try again | Shorter; the link is the action |
| Thread offline placeholder | Message Jonas. Delivered when the desktop is on | Message Jonas | A hint belongs under the field |
| Stuck banner | Maya is stuck / Staging site won't load | Maya is stuck: the test site won't load | One line |
| Hire full (live) | Four desks, four deskmates / Your team is full. Remove someone to hire again. | Your team is full / Four desks, four deskmates. [Open Team] | Lead with the fact; the motto as the quiet line |
| Hire step 2 loading | Meet your hire / Finding the right person | Finding someone… | One line |
| Hire step 2 title | Meet Marcus | New hire | The name is right below it |
| Seed acknowledgement | On it. I will run the checks before I call it done. (x6) | Vary per person; use contractions ("I'll") | Robotic repetition |
| Seed result | Done. Build the pricing page is finished and saved. | Pricing page is up. Mobile and desktop both pass. | States the outcome |
| Seed reply | On it. I will reproduce it first, then fix it. | On it. I'll reproduce it first. | Contraction; shorter |
| First run | Give them a role. They get their own desk and desktop. | Pick a role. They get their own desk and computer. | "Desk" and "desktop" collide |
| Thread empty | Say hi to Ines / Give them a first task. | Say hi to Ines / Give her a first task. | Use the persona's pronoun if known; otherwise keep "them" |
| Resolved approval | You approved this · 11:28 PM | You approved: Deploy to staging · 11:28 PM | "This" is lost in history |
| Profile desktop | Running · 3 h 0 min | Running for 3 h | No zero units |
| Settings rows | Model / Desktops / Calls | AI / Desks / Video calls | Jargon; the brand word |
| Settings values | Demo, Voice only (green) | Demo, Voice only (amber) | Colour honesty |
| Team empty | No work yet / Numbers appear once your team starts on tasks. | No work yet / Numbers show up once your deskmates start a task. | The brand word, shorter |
| Team error | Couldn't load the numbers | Couldn't load the numbers. [Try again] | Same pattern as the thread |
| Meeting top strip | Meeting · 4:13 | Maya, Priya, Jonas and Ines · 4:13 | Names, not a category |
| Call failed | Check your connection and try again. | Maya's desktop didn't answer. | Specific |
| Mic blocked action | Open System Settings | Open Settings | Shorter; Mac users know which |
| Thinking long | Maya is thinking (caption) + Still thinking (chip) | Still thinking (chip only) | Duplicate |
| Timestamp popover | November 15, 2026 at 12:57:31 AM GMT+0 | (remove) | See top #3 |

**Terms used inconsistently**
- Needs you / Waiting for you.
- Paused / Paused by you.
- Offline / Desktop is off / Desktop not running.
- Desk / desktop / computer / screen: "desk" is the brand idea; "desktop" is the computer; "screen" means the user's own screen ("Lend my screen", "Can use my screen"). Keep exactly those three meanings.
- Employee / deskmate / hire: the Team table header says "Employee". Proposed: "Deskmate" in headers; "Hire" stays as the verb.
- Meeting / call: "Call with Maya · 1 min" versus "Start meeting". Fine, but the meeting's end line should read "Meeting with Maya, Priya · 6 min".
- Try again / Retry / Ask again: use "Try again" everywhere except "Ask again" (a question to a person).

---

## 5. Character: five proposals, and decoration to remove

1. **Each mate owns a desk number** (app: profile, sidebar tooltip; stage: picker). The tint slots 0 to 3 are already the mark's four tiles in order. Make it explicit. In the profile under the portrait, a 16 px small mark with only that person's tile lit and the other three at 20% opacity, plus "Desk 2" in 12 px secondary. The same lit-tile mark appears in the summon picker rows. The four colours stop being arbitrary tints and become "whose desk". When someone is removed, their desk empties in the Desks component.
2. **The brand loader at app start** (app). A 48 px `DeskLoader` centred on the blank window instead of the grey skeleton sidebar (`shots/shell/loading-light.png`). Use it only for start, "Starting her desktop", "Finding someone…" and "Calling Maya". Four tiles breathing for under a second is the most "Deskmates" frame a juror will see.
3. **Team: one stacked bar instead of four dashes** (app). Under "Hours worked", one 6 px bar the column's width, split into the four people's shares in their tints, with 2 px gaps and full-radius ends. It is the logo's colours turned into a chart: "who did the work" at a glance. Rows keep only the number. This replaces the per-row dashes (top #16).
4. **The team-full moment** (app). [landed] in Hire. Also use it where capacity matters: the Hire button's tooltip reads "Hire (⌘N) · 3 of 4 desks". At four, the "+" in the sidebar header turns into the 16 px small mark (all four lit) with the tooltip "Your team is full". That is the third and last Desks place.
5. **An empty desk as the empty thread** (app). The thread's empty state shows that person's desk tile (their tint, handle, 48 px) above "Say hi to Ines", in place of a 72 px duplicate of the header portrait (`thread/empty-light.png`). It quietly says "this is her desk; it's empty; give her work".

**Decoration without meaning (remove)**
- The composer's drop shadow (top #23).
- The four ⓘ icons beside the profile switches.
- Dashed borders in the desktop panel's off and lent states.
- The monitor glyph on a meeting tile (meeting, live).
- The avatar stack in the picker's "Everyone" row, which duplicates the four rows under it; use a checkbox row with the word "Everyone".
- The "Desktop" title bar inside the mock desktop frame (stage and panel); our chip already labels it.
- The pill shape of single-line bubbles: radius 28 on a 44 px bubble is decoration. Use 20.

---

## 6. Accessibility and platform

**Contrast (measured, WCAG ratios)**
- Amber status dot `rgb(255,206,47)` on white: **1.49:1** (needs 3:1). Fails, in the sidebar and on the approval card.
- End label on coral: **4.09:1** (needs 4.5:1). Fails.
- Secondary text in the sidebar, times and day separators: light 8.23 to 9.29:1, dark 5.65 to 6.43:1. Passes.
- Idle grey presence dot on the sidebar: 4.8:1. Passes.
- Bubble text: 17.1:1 light. Passes.
- Not computable (text over photos): the face chip's 12 px "Speaking" and "Web developer". Assume it fails on light clothing until it has a backing (top #12).

**Focus**
- The 8 junk tab stops from sidebar timestamps, plus a popover that stays open (top #3).
- After the composer's Send, one Tab lands on `BODY` (focus disappears) before the skip link. Find the invisible focusable element and remove its tabindex.
- The face tile uses the browser default `auto` ring (light blue) on the dark stage (stage).
- The confirm dialog outlines itself (top #25).
- Sidebar rows: [landed] the ring is drawn on the row (good). The header name button (opens the profile) has `outline: none` and I saw no replacement ring. Check it.

**Platform (macOS)**
- [landed by 01:05] Arrow cursor on buttons and rows, `user-select: none` on chrome, thin scrollbars, antialiased text. At 01:00 all buttons still had `cursor: pointer`; by 01:05 the live check showed `default`. Verify in the Electron window.
- In Electron the right edge showed a full-height scroll track (`shots/smoke/shell-window.png`, x about 1990 in the 2x image). Check the thin-scrollbar rule reaches the thread's scroll container.
- The sidebar header and the top bar are on different baselines in Electron (top #10).
- Red toast at the bottom right; web-style. Use a neutral toast (above).
- "Skip to content" is a web idiom. It is hidden until focused, which is fine, but Mac apps start focus in the list. Consider initial focus on the selected sidebar row.
- No window-level vibrancy or translucency in the sidebar. Linear, Things and Arc use a sidebar material in dark mode. Optional: `vibrancy: 'sidebar'` with a transparent sidebar background in Electron only.

**Best in class, concretely**
- **Things:** one type scale, with titles that never exceed the content's 1.3x. Here the KPI figure (35 px) is 2x the page heading (17 px).
- **FaceTime:** the calling state is a portrait plus "Calling…" with nothing else. Here the face appears instantly with a "Thinking" chip (top #1).
- **Linear:** every banner and toast is one neutral component with a coloured icon. Here there are six slab colours (top #4).
- **Raycast:** focus is always visible and every stop has a reason. Here 8 of the first 26 tab stops are timestamp junk.
- **Arc:** the sidebar title band and the content title share a baseline and a height. Here they are 10 to 15 px apart.

---

## 7. What I could not check

- **The traffic lights:** `shots/smoke/shell-traffic-lights.png` was not refreshed by the smoke run (still dated 23:28, still "Agent Manager" and "Maya Okafor"). I judged the header offset from `shell-window.png` only. Fix the smoke script to rewrite that file.
- **Motion curves and durations** by eye: only the absence of a leave fade was caught, in a still at 100 ms. The bubble rise, panel slide, Shuffle cross-fade and reduced-motion behaviour were not observed.
- **Hire step 2 live, the loading `DeskLoader` and Shuffle:** the seeded team was full (409). My `?shot=` URLs did not match the fixture route names, so those pages fell back to default scenes.
- **The real avatar video, voice and lip-sync** (mock office). Stills only.
- **A 200-message thread, a 12-step plan, a 300-character message and a very long name:** not seeded.
- **VoiceOver reading order:** not run.
- **Dev-only console errors:** "createRoot() on a container that has already been passed" and "showModal… element is not in a Document" appeared while other agents' edits hot-reloaded. I could not tell whether they occur in a production build. Worth one check with `vite build`.
- The mock office's data directory `data-critic/` was created as instructed. Remove it if it is not ignored by git.
