# W4 hand-back: hire, profile, settings, team

Status: all four surfaces built, screenshotted (light and dark) and checked live against a mock office. No store or client change needed.

## Evidence
- `npm run typecheck:area -- src/renderer` -> no type errors. `npm run purity -- src/renderer/src/{hire,profile,settings,team}` -> clean for each (1 source file with JSX each... no raw element, icon or custom styling).
- `npm run shots -- hire|profile|settings|team` -> 14 / 12 / 6 / 16 screenshots, 0 failed. Shots in `shots/<area>/`.
- Live (office `MOCK_LLM=1 MOCK_GENIE=1 MOCK_SPEED=5 MAX_TEAM=6 DESKTOPS=mock`, port 4324, data-w4, seeded; Vite on 4334 proxied to it; Playwright, no `?shot`): script output in the report below, screenshots in `shots/live-w4/`. Console errors 0 and no error boundary after boot, hire, profile, team, settings.
  - Preset hire: chose Operations, Shuffle moved Amara to Kenji, "Hire Kenji" -> 5th person in sidebar, greeting message present in thread.
  - Described role: "Someone who answers customer emails politely" -> hired Amara, roleKey `custom`. The server titled the role "Someone Who Answers" (office naming, not mine).
  - Permissions: level independent, internet off, commands off, teammates off, screen on (after the Allow dialog); all persisted after `page.reload()`; personality saved on blur and persisted.
  - Team: today `1.8 h / 8 / $1.48`, week `7.7 / 24 / $5.88`, month `16.3 / 40 / $11.08`; UI numbers equal API totals; "vs yesterday / last week / last month" lines present (previous is non-null in the live office).
  - Ask with `MOCK_GENIE=1`: answer text, small result table shown (query is inside "Show query", collapsed).
  - Settings: choosing Dark saved (`appearance: dark`) and the app switched.
- Processes started by me (office 4324, vite 4334) are stopped.

## Files
`hire/HireDialog.tsx`, `hire/shots.ts`; `profile/ProfileDrawer.tsx`, `profile/shotState.ts` (screenshot-only overrides), `profile/shots.ts`; `settings/SettingsDialog.tsx`, `settings/shots.ts`; `team/TeamView.tsx`, `team/shots.ts`.

## Behaviour
- Hire: step 1 is quiet rows (balanced density, no scrolling at 1280x800), a "Describe a role" row that expands to a textarea and a Continue button (8+ characters). Step 2: 144 px avatar (initials until `portraitUrl` is set), name, role, personality, Hear (only when `voice.sampleUrl` is set), Shuffle (passes `exclude` of seen tokens), Edit (name, personality, three permission levels), one "Hire <first name>". `team_full` shows "Your team is full. Remove someone to hire again." on step 1 (it arrives from the candidates call); other hire errors show an inline error banner. Content scrolls and the Hire button stays pinned when Edit is open.
- Profile: drawer 400 px, non-modal (no scrim), no footer. Radio level, four switches (all via `patchEmployee` at once), screen switch asks first, personality saves on blur ("Couldn't save" on error), "Applies after <first>'s desktop restarts" when `pendingRestart`, desktop line with uptime, Restart (becomes Start when off) and Reset with AlertDialog.
- Settings: name (saves 600 ms after typing stops, no Save button), appearance, two notification switches, captions, and a plain Connections list (Model, Desktops, Calls, Databricks, each a `StatusDot`).
- Team: three numbers, table sorted by hours descending (sortable), name cell opens that conversation, skeleton, error banner with Retry, empty state. Ask box only when `capabilities.genie`; "Synced" line only when `databricks || genie` and `syncedMs` is set.

## Deviations
- Name edit is a "Name" field at the top of the Edit section, not click-to-edit on the name (Astryx `Text` has no click and `TextInput` no blur event).
- No "Couldn't create a portrait" banner (the cast portraits are files; Avatar falls back to initials by itself).
- Ask box needs `genie` (not just `databricks`) because the API answers `genie_off` otherwise.
- Vertical dividers between the three team numbers did not render in an `HStack`, so they are separated by whitespace only.
- Screenshot-only hooks read through `useShot()` / `getShot()`: `hear=1` (pretends a voice sample exists so the Hear button is shown; nothing is played), `confirm=`, `pending=`, `off=`, `empty=`, `ask=`. They do nothing without `?shot`.
- The shared scratchpad is used by several agents; my live scripts are in `scratchpad/w4/`.

## Notes for others
- Theme `appearance` already applies in `main.tsx`; confirmed live.
- A sidebar row for a described-role hire shows the server's role string verbatim ("Someone Who Answers").
- `npm run shots` once failed with a transient Vite error from another agent's file (`./MediaTheme` import); a rerun was clean.

## Least happy visually
1. Hire step 2 back chevron sits a little lower than the title.
2. Team table text is inset slightly from the numbers above it (table cell padding), and the Ask result pushes "Show query" below the first screen.
3. Profile switch list: labels and switches are spread across the width; looks fine but plainer than the radio block above.
