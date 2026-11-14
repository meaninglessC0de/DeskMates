# Design rulings (orchestrator, 2026-11-14)

These settle the open points in [ux-spec.md](ux-spec.md) and reconcile it with what the Astryx spike proved ([../research/07-astryx-inventory.md](../research/07-astryx-inventory.md)). Order of authority for the front-end agents: **this file, then ux-spec.md, then 07-astryx-inventory.md for exact props.** When the spec names a component or prop that does not exist in Astryx 0.7.16, use the nearest one from 07's component reference and keep the layout and copy.

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

## Accepted as written

- **R1. The portraits are the only colour.** Neutral theme, ink accent (near-black in light, near-white in dark). Verified in a real render: inside `<Theme>` the primary button is `#1b1b1b`. The "neutral blue" in 07 is the unthemed default and does not apply. No custom theme, no theme editor.
- **R2. Stable meeting grid, ring for the speaker.** Tiles never resize when someone speaks.
- **R3. Addressing.** Clicking a tile is the dependable path and must carry the demo. A spoken first name also works. Number keys 1 to 4 too.
- **R4. Profile is a side drawer; the tray is a native menu.**
- **R5. One `Stage` component** for the one-to-one call and the meeting.
- **R6. Copy rules, the seven states, the sidebar ordering, the approval row, the activity rows, the "never do" list.** All as written.

## Changed

- **R7. Icons: `lucide-react`**, added to `package.json` as a direct dependency (it is already installed as the neutral theme's own icon source). Always pass the component as a value (`<Icon icon={Video} />`, `icon={<Icon icon={Video} />}`); never write an icon as its own JSX tag, because `astryx doctor` flags that. Do not add `@heroicons/react`; when a scaffolded template imports heroicons, swap them for lucide.
- **R8. Control bar is docked, not floating.** Astryx `Overlay` cannot pin to the window. Use `LayoutFooter` centred, with no divider, on the dark stage. Drop the auto-hide behaviour (and gap G10). Everything else about the bar stands: Mute, Captions, Layout, (Add in meetings), a gap, End.
- **R9. Dark stage = `<Theme mode="dark">` wrapping an `AppShell contentPadding={0}`**, rendered as the app root while a call is live (conditional render, not a dialog). The nested Theme alone paints no background.
- **R10. Speaking ring.** Try `SelectableCard isSelected` first, as specified. If its ring does not read clearly on the dark stage, use the `Card` variant swap from the spike plus `StatusDot variant="accent" isPulsing` in the name chip. Decide by looking at a screenshot, not by guessing.
- **R11. Sidebar rows** are `ListItem`s inside `SideNav` (the spike's proven tree), with `Avatar size={40}`, the presence dot in the avatar's `status` slot, one muted description line, and time over an unread `Badge variant="neutral"`. The spike used a blue badge; neutral is required.
- **R12. Activity rows must not use `ChatToolCalls`** (monospace tool names). Compose them from `Collapsible` and compact rows as the spec says. If that composition fights the chat layout, the fallback is one `ChatSystemMessage` per step. Never show a tool name, path or command in the thread.
- **R13. Start pages only from the ten clean templates** (`blank`, `contact-form`, `dashboard-composition`, `form-wizard-dialog`, `settings`, `shell-nav`, `shell-side-nav`, `table`, `table-grouped`, `table-page`). No StyleX anywhere. `ai-chat` and `messaging-shell` may be read for structure but not scaffolded.
- **R14. Hire dialog step 1 stays a list of rows** (the spec), not a card grid (07's suggestion). Rows are quieter and match the sidebar.
- **R15. Team view has no chart.** Three numbers and one table. The "Ask about your team" input and the "Synced" line appear only when Databricks is configured.
- **R16. Faces come from a fixed cast**, not a generator: `config/cast.json` lists 8 people (name, portrait file, voice, avatar id). "Shuffle" steps through cast members not yet hired. The hire dialog's "Finding the right person" state is kept but lasts under a second for presets. (Reason: the live-avatar provider only animates its own avatars; see plan.md.)
- **R17. Window chrome.** Hidden-inset title bar; the drag region is injected by the Electron main process with `webContents.insertCSS` (no CSS file in the renderer). In a plain browser tab there is no title bar inset.
- **R18. Raw elements.** `<video>`, `<canvas>` and `<img>` only, each inside `AspectRatio`, and only in `src/renderer/src/media/`. Nothing else raw anywhere. `npx astryx doctor --built .` must report zero purity findings.

## Cut from the first build (do not implement; leave no dead UI)

| Item in ux-spec | Why |
| --- | --- |
| Command palette (`⌘K`), `⌘1` to `⌘9`, next/previous employee keys | Not needed for the demo |
| Dock menu, "Open at login", "Show in menu bar" switch | The tray is simply on |
| Notification action buttons (Approve, Deny, inline Reply) | Unsigned apps cannot rely on them; a click opens the thread at the request |
| "Undo" on approve, "Seen" receipts beyond a single "Delivered" then "Seen" | Extra state for little value |
| Attach files in the composer | Out of scope |
| Draggable inset tile, auto-hiding bar, hover "Focus" on face tiles | Cut with R8; "Show desktop" on hover stays |
| "Add to meeting" during a meeting | Start a new meeting instead |
| Responsive collapse of the sidebar to an avatar rail under 1000 px | Minimum window is 960; test at 1280 x 800 and 1440 x 900 |
| Raise hand and "Call on" | Built last, behind a flag, only if everything else is solid |
| Auto bring-up of a desktop when an employee "shares" (ux-spec 4.6) | No such event exists; the user brings a desktop up with "Show desktop" |
| Voice selector in the hire dialog's Edit, microphone selector in Settings | No list of voices or devices is exposed; the voice comes with the cast member |
| Hire dialog's "Couldn't set up her desktop" banner | Hiring returns at once; a failed boot shows on the sidebar row and as a toast |
| Options as buttons on a question bubble | Questions are plain text |

## Small corrections to the ux-spec

- The employee's first message arrives by itself once the desktop is up (about a minute with a real desktop), not "within 2 s".
- `stateDetail` (the sidebar's second line) is at most 40 characters everywhere.
- Money is US dollars.
- The sidebar footer shows the user's name from Settings.
- A team is at most 4 people on this Mac (memory; `MAX_TEAM`), chosen from a cast of 8 faces. When it is full the hire dialog shows one line: "Your team is full. Remove someone to hire again."
- Profile, Desktop: "Restart" keeps her files and open apps; "Reset" erases them (the AlertDialog already says so). "Desktop is off" means asleep, not erased.
- "Take control" pauses the employee ("Waiting for you"); "Give back" resumes them.

## Kept keyboard shortcuts

`⌘N` hire, `⇧⌘M` summon, `⇧⌘D` desktop panel, `⇧⌘V` call, `⌘I` profile, `⌘T` team, `⌘,` settings, `↩` send, `⇧↩` newline, `Esc` close; on the stage `M` mute, `C` captions, `L` layout, `S` swap, `1`-`4` address, `⌘.` end.

## What "finished" looks like (the orchestrator checks these by screenshot)

1. The sidebar at 1280 x 800 with four people: one amber "needs you" row at the top in primary text, nothing else emphasised, no colour anywhere except faces and three presence dots.
2. A thread with one collapsed "Worked for 6 min" line, one approval row whose Approve is the only dark button in the main area, and a composer that reads "Message Maya".
3. The desktop panel open at 440 px with a live 16:10 screen, "Take control" as the only primary button in the panel, and a plan of five rows.
4. The hire dialog, step 2: a 144 px portrait, name, one line of personality, three quiet buttons, one "Hire Maya".
5. The call: dark, two tiles, a caption line, a docked bar whose only filled control is End.
6. The meeting with three people: three equal tiles, one ring, captions, nothing moving.
7. The Team view: three large numbers, one table, generous whitespace.
8. Dark appearance of 1, 2 and 3.

If any of these looks like a developer tool, a dashboard template or a chatbot, it is not finished.
