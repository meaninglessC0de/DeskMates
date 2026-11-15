# UX spec: Agent Manager (working name)

Status: design sub-agent output, 2026-11-14. Confidence tags: `verified` (read from the source), `reported` (search snippet or second-hand), `unverified` (my judgement).
Audience: front-end coding agents. Every screen below is specified so that no design decision is left to the implementer. If something is missing, choose the quieter option and add it to the "Gaps" list in section 7.

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`. Nothing in this file overrides D-001 to D-015.

## 0. Design thesis and ground rules

**Thesis: the portraits are the only colour.** The chrome is monochrome (Astryx neutral theme, ink accent), so the faces of the team carry all the warmth. Calm like Linear, familiar like iMessage, polished like FaceTime. Colleagues, not processes.

Ground rules (apply to every section):

1. Astryx only. Raw elements allowed only for the media surfaces: `<video>`/`<canvas>` for the avatar and the live desktop, always inside Astryx `AspectRatio`. No `<div>`, no raw hex, no raw px (use spacing steps `gap={n}`/`padding={n}` and `var(--*)` tokens).
2. One primary action per view (Astryx `Button variant="primary"`), placed on the trailing edge. Everything else is `secondary` or `ghost`.
3. Icons in toolbars, text where the action is not universally understood. Exception, by user request: "Summon meeting" is a text button.
4. Copy: sentence case, no exclamation marks, no emoji, no trailing full stop on labels, contractions are fine. Employees speak in the first person and are brief. The UI itself never speaks in the first person.
5. Every view has an empty, loading and error state (specified below).
6. Window: default 1280 x 800, minimum 960 x 640. Spacing steps used: 2 (8), 3 (12), 4 (16), 6 (24), 8 (32).

Layout vocabulary used in wireframes: `1 col = 16 px`, `1 row = 36 px` unless the diagram says otherwise. Wireframes are proportional sketches, not pixel masters.

---

## 1. Research and principles

### 1.1 What I checked (all browsed 2026-11-14)

| Topic | Source | Finding used | Tag |
| --- | --- | --- | --- |
| macOS sidebars | https://developer.apple.com/design/human-interface-guidelines/sidebars | At most two hierarchy levels; allow hide/show (button or View menu), do not hide by default; icons use accent colour sparingly; **avoid critical information or actions at the bottom of a sidebar** (windows get moved so the bottom hides) | verified |
| macOS toolbars | https://developer.apple.com/design/human-interface-guidelines/toolbars | Leading edge = sidebar toggle + title; trailing edge = important items and **the single primary action**; max about three groups; prefer symbols without borders; do not title with the app name; titles under about 15 characters; every toolbar command also exists in the menu bar | verified |
| Sheets | https://developer.apple.com/design/human-interface-guidelines/sheets | macOS sheets are always modal, one at a time, sensible default size; avoid Cancel + Done + Back together; use a panel for repeated input; use a separate window or full screen for prolonged tasks (basis for the call stage) | verified |
| Notifications | https://developer.apple.com/design/human-interface-guidelines/notifications | Concise; one notification per thing; communication notifications show the sender's contact image; up to four actions with short titles and icons; do not notify for what is already on screen (badge or insert instead); errors are alerts, not notifications | verified |
| Menu bar extras | https://developer.apple.com/design/human-interface-guidelines/the-menu-bar | Use a symbol; **show a menu, not a popover**; user decides whether it appears (offer at setup); do not rely on its presence; add a Dock menu too | verified |
| Linear's calm | https://linear.app/now/behind-the-latest-design-refresh | "Calm through pruning"; "Don't compete for attention you haven't earned"; dim navigation, fewer and softer borders, smaller and fewer icons, no coloured icon backgrounds | verified |
| Google Meet layout | https://support.google.com/meet/answer/10550593 | One persistent bottom bar; leave button separated from mic/camera to avoid accidental hang-up; Auto layout adapts to window and participant count; Spotlight and Sidebar layouts; floating self-view with one other person | verified |
| Zoom layouts | https://foxonline.temple.edu/guides/zoom/changing-video-layout and https://devforum.zoom.us/t/layout-switch-action-gallery-view-vs-active-speaker/17841 | Speaker view puts the talker large; gallery view marks the talker with a border instead of resizing; pinning disables auto-switching; layout control top right | reported |
| FaceTime | https://support.apple.com/guide/facetime/change-your-view-of-a-call-fctm35523/mac | Default enlarges active speakers; Grid (4+ people) uses a uniform grid with an automatic highlight; double-click enlarges a tile; pin up to two; "Automatic prominence while speaking" can be turned off to stop tiles resizing | reported |
| Agent apps | https://cursor.com/blog/agent-computer-use and https://the-decoder.com/new-cursor-3-ditches-the-classic-ide-layout-for-an-agent-first-interface-built-around-parallel-ai-fleets/ | Each agent in its own VM; user can take over the agent's remote desktop; agents return recorded demos; one sidebar lists all agents and clicking opens its work. Neither article shows status labels or "needs attention" flags, which is the gap we fill | verified |
| Devin / Manus | https://featureorfuture.substack.com/p/cognition (snippet) | Devin lets you "take over" its computer like tapping a coworker on the shoulder; Manus asks explicit approval before local actions | reported |
| Agent UX patterns | https://www.theskinsfactory.com/uiux-design-blog/ai-agent-ux-design, https://pub.towardsai.net/designing-for-ai-agents-8-ux-patterns-that-build-trust-in-2026-713a0c926933, https://www.kunalganglani.com/blog/tool-approval-patterns-ai-agents (snippets; pages blocked on fetch) | Human-readable state model (planning, doing, waiting on you); approval and undo deserve primary-button care; humans at risky moments, not every step; approval UI must show the resolved action; autonomy levels as a plain setting | reported |
| Figma prize judging | https://contra.com/figma-hackathon-terms, https://thenewviews.com/figma-makeathon/, https://ucidesignathon26.devpost.com, https://wasp.sh/blog/2025/11/10/design-ai-thon-winners | Other Figma-sponsored events score: design quality and craft, innovation and creativity, storytelling and presentation, effective use of Figma; one Devpost Figma track scored "Visual Craft & Depth" and "Design Originality"; Wasp's design hackathon winners showed personality beyond a template, documented reasoning, and went further than a static file. **No public listing for this event's Figma prize exists (Q-002 stays open).** | reported |
| Astryx | `npx astryx docs principles`, `component`, `search` (v0.7.16) | See section 5 and section 7 | verified |

### 1.2 Principles I apply (14)

1. **Colleagues, not processes.** Name, face and a sentence in every place a process id would appear. No ids, paths, tool names or JSON in the main UI. (iMessage, Apple communication notifications)
2. **The faces are the colour.** Chrome stays monochrome; status colour appears only as a presence dot or an error. This is also the distinctive look for the Figma judges.
3. **Attention is earned.** Navigation recedes; the thing that needs you is the only emphasised row on screen. (Linear)
4. **One primary action per view, trailing edge.** "Summon meeting" in the window, "Hire" in the hire dialog, "Start meeting" in the picker, "Take control" in the desktop panel, "Approve" on a request. (Apple toolbars)
5. **Show the work as a sentence, never a log.** Activity is one quiet line per step, grouped and collapsed. The live desktop is the receipt, not the transcript. (agent UX patterns, Cursor demos)
6. **Approval is a primary control with the resolved action visible.** The employee asks in words, and a compact row states exactly what will run. Approve is the dark button. (agent UX patterns)
7. **Human-readable state model.** Seven states with exact labels (section 2.2). The row line says what they are doing, the dot says how they are.
8. **Take over, never lose sight.** One click takes control of a live desktop and one click gives it back. (Devin, Cursor)
9. **Stable stage, ring for speaker.** In a meeting tiles do not resize when someone speaks; the speaker gets a ring. Enlarging happens only when you choose or when a desktop is shown. (Zoom gallery, FaceTime grid with auto-prominence off)
10. **One persistent control bar, End far from Mute.** Bottom centre, auto-hides on idle, never covers captions. (Meet)
11. **Dark only where media lives.** The stage is dark inside a system-appearance app; chrome is not. A nested Astryx `Theme mode="dark"`, nothing hand-painted.
12. **Sheets for scoped tasks, panels for repeated ones, a window for a prolonged one.** Hire = dialog (one at a time); profile = side drawer (non-modal inspector); call = full-window stage. (Apple sheets)
13. **Notify once, notify useful, never when it is already on screen.** One notification per request, actions in the notification, badge instead when the conversation is open. (Apple notifications)
14. **Restraint in motion.** Three motions only (section 5.6). Everything uses theme duration tokens and honours reduced motion.

### 1.3 What the judges will see in the first 60 seconds (design the demo path)

Open app (sidebar of faces, one amber dot) -> click the amber one -> a human sentence and a compact Approve row -> Approve -> activity rows collapse -> toggle the desktop panel (live screen) -> Call (dark stage, face + desktop) -> End -> "Summon meeting" (picker, 3 faces) -> meeting stage with a raised hand. Every one of these frames must be screenshot-ready. The Figma export (section 7.5) should contain exactly these frames.

---

## 2. Information architecture and state model

### 2.1 Destinations

```
Window (one)
├─ Sidebar (always): app name, Hire, employees (stack), footer: You, Team, Settings
├─ Main area
│   ├─ Conversation with the selected employee      <- the home. Default destination.
│   │     ├─ Desktop panel (toggle, split on the right; can expand to fill)
│   │     └─ Profile drawer (inspector, opens on the right over the panel)
│   ├─ Team view (quiet third destination: numbers + table)
│   └─ First-run empty state (no employees)
├─ Dialog: Hire
├─ Dialog: Settings
├─ Popover: Summon picker (anchored to the top-right button)
└─ Full-window stages (replace the shell while active, dark): Call, Meeting
```

Navigation rules:

- The sidebar selection is the only navigation state. Selecting an employee shows their conversation. `Team` in the footer swaps the main area to the Team view; selecting any employee swaps back.
- The desktop panel remembers per employee whether it was open (default closed). Expanded state is not remembered.
- Starting a call or meeting replaces the whole window content with the stage (sidebar hidden). Ending returns to exactly the previous view (same employee, same scroll, same panel state).
- Notification click: opens the app, selects that employee, scrolls to the message, focuses the approval row if any.
- Back/forward: not needed. `Esc` closes the topmost dialog, drawer or popover, then collapses the expanded desktop.

### 2.2 Employee state model

Seven states. The **label** is the exact word shown. The **dot** is `AvatarStatusDot` (corner of the portrait). The **row line** is the muted second line in the sidebar. Presence dots always carry a text label for accessibility (the `label` prop); Astryx composes it into the avatar's accessible name.

| State | Label | Dot (Astryx) | Sidebar row line (muted unless noted) | Top bar line | Meaning |
| --- | --- | --- | --- | --- | --- |
| Idle | Idle | `AvatarStatusDot variant="neutral"` (grey ring) | Role, for example "Web developer" | `Web developer · Idle` | Online, nothing running, ready |
| Working | Working | `AvatarStatusDot variant="success"` (filled green) | Current activity, present tense, max 32 chars: "Fixing the checkout bug" | `Web developer · Working · 42 min` (`Timer elapsed`) | Running a task by itself |
| Needs you | Needs you | `StatusDot variant="warning" isPulsing` passed to Avatar `status` (see gap G4), pulses 2 times only | The question or request in **primary** text colour, not muted: "Wants to deploy to staging" | `Web developer · Needs you` | Waiting on an approval or an answer |
| On a call | On a call | `AvatarStatusDot variant="neutral" icon={video}` | "On a call with you · 04:12" (`Timer`) | `Web developer · On a call` | In a one-to-one call or meeting |
| Paused | Paused | `AvatarStatusDot variant="neutral" icon={pause}` | "Paused by you" | `Web developer · Paused` | You paused the loop; desktop kept |
| Stuck | Stuck | `AvatarStatusDot variant="error"` (red, minus bar) | The reason, primary colour: "Staging site won't load" | `Web developer · Stuck` | Failed or looping; needs help |
| Offline | Offline | none (no dot). Row text stays muted. | "Desktop is off" | `Web developer · Offline` | VM stopped or still starting. Transient "Starting" shows a `Spinner size="xsm"` in place of the dot with the row line "Starting desktop" |

Transitions: Idle -> Working (task given or message received) -> Needs you (request raised) -> Working (answered) -> Idle (finished, with a message). Any -> Paused (you pause). Any -> Stuck (agent reports failure or watchdog). Any -> On a call (call starts) and back to the prior state afterwards. Offline <-> everything else via Start desktop.

Sidebar ordering (explicit): **Needs you first, then Stuck, then everyone else by most recent activity.** Order changes with no animation except a 175 ms opacity fade of the moved row (`--duration-fast`). Never reorder while the pointer is over the list (queue the reorder until the pointer leaves) so rows do not jump under the cursor.

Badge rule: `Badge` is used only for the unread message count in the sidebar row (neutral variant, count only, hidden at 0). Status is never a Badge.

Dock badge and menu bar dot show the number of employees in **Needs you** or **Stuck**, not unread messages.

### 2.3 Global keyboard shortcuts (register with Astryx `useHotkeys`)

Every toolbar item also exists in the macOS menu bar (Apple rule). Menus: App (Settings `⌘,`, Quit), File (Hire `⌘N`, Summon meeting `⇧⌘M`), View (Toggle sidebar `⌘\`, Desktop `⇧⌘D`, Team `⌘T`), Employee (Call `⇧⌘V`, Pause or resume `⇧⌘P`, Profile `⌘I`), Window.

| Action | Shortcut |
| --- | --- |
| Hire | `⌘N` |
| Quick switch employee | `⌘K` (Astryx `CommandPalette`, rows = employees; optional, build last) |
| Select employee 1 to 9 | `⌘1` to `⌘9` |
| Next or previous employee | `⌥⌘↓` / `⌥⌘↑` |
| Toggle desktop panel | `⇧⌘D` |
| Expand or collapse desktop | `⇧⌘↩` (also `Esc` to collapse) |
| Call the selected employee | `⇧⌘V` |
| Summon meeting | `⇧⌘M` |
| Profile | `⌘I` |
| Team view | `⌘T` |
| Toggle sidebar | `⌘\` |
| Settings | `⌘,` |
| Focus composer | `⌘L` |
| Approve focused request | `↩`; Deny `⌘⌫` |

---

## 3. Screen-by-screen spec

Conventions in each screen: **Primary** = the one primary action. **Keys** = shortcuts. **Motion** = what animates (tokens: fast `--duration-fast` 175 ms, medium `--duration-medium` 410 ms, easing `--ease-standard`/`--ease-move`/`--ease-exit`). Reduced motion: opacity only, 200 ms cap (Astryx handles this).

### 3.1 App shell

Window chrome (shell concern, not Astryx): hidden-inset titlebar. Traffic lights sit inside the sidebar header, which therefore has 28 px extra top inset; the sidebar header and the top bar are draggable regions (`-webkit-app-region: drag`, interactive children `no-drag`). This is the only permitted raw CSS and lives in the Electron/Tauri window config, not in components.

```
1280 x 800   1 col = 16 px   1 row = 36 px
+----------------+---------------------------------------------------------------+
|  o  o  o       |(MO) Maya Chen              (vid) (mon) (...) | [Summon meeting]|  56 px
|  Agent Manager+|     Web developer · Working · 42 min                           |
|----------------|---------------------------------------------------------------|
|(MO)* Maya O.  2m                                                                |
|     Fixing the checkout bug                    [Desktop panel: toggled on]       |
|(PR)* Priya R. 1h   1                                                            |
|     Drafting the launch email        conversation column 560                     |
|(JW)o Jonas W. Mon                    (theirs left, yours right)                 |
|     Researcher                                                                  |
|(IM)o Ines M.  Mon                                                               |
|     Designer                                                                    |
|                                                                                 |
|----------------|                          +--------------------------------+    |
|(You) Suhaan    |                          | Message Maya               (^) |    |
| [team] [gear]  |                          +--------------------------------+    |
+----------------+---------------------------------------------------------------+
 280 px           1000 px
 * = presence dot. Rows 64 px. Top bar 56 px.
```

| Element | Astryx | Props and copy |
| --- | --- | --- |
| Root | `AppShell` | `variant="elevated"` (wash sidebar, raised content with page radius), `height="fill"`, `contentPadding={0}`; `banner` slot used only for "screen lent" (3.3.3) |
| Sidebar | `SideNav` | `resizable={{defaultWidth: 280, minWidth: 240, maxWidth: 320, autoSaveId: "sidebar"}}`, `collapsible={{hasButton: false}}` (toggle is `⌘\` and a toolbar IconButton; Apple: do not hide by default) |
| Sidebar header | `SideNavHeading` in `header` | App name `Text type="label"`: "Agent Manager" (single constant `APP_NAME`, will be renamed). End: `IconButton variant="ghost" size="sm" icon={plus} label="Hire"` with `Tooltip` "Hire" + `Kbd` `⌘N`. Nothing else in the header |
| Employee row | `SideNavItem`-style row built with `Item density="spacious"` inside `SideNavSection` (no section title) | `startContent`: `Avatar size={40} name status={dot}`; `label`: employee name (`labelLines={1}`); `description`: the row line (`descriptionLines={1}`); `endContent`: `Timestamp format="auto"` over `Badge variant="neutral" label="2"` (badge only if unread > 0, never "0"); `isSelected` for the open one. Selected = Astryx selected row, no accent fill |
| Row context menu | `ContextMenu` | "Open", "Call", "Pause" or "Resume", "Profile" |
| Footer | `SideNav footer` + `footerIcons` | `Item density="compact"` with `Avatar size="sm"` "You" (user's name) and, in `footerIcons`, two `IconButton variant="ghost"`: Team (`BarChart3` icon, label "Team", `⌘T`), Settings (`Settings` icon, label "Settings", `⌘,`). Per Apple, nothing critical lives down here |
| Top bar | `LayoutHeader` of an inner `Layout` | Left cluster is one clickable block (opens Profile drawer): `Avatar size={32}` + stack: name `Text type="large"` and `Text type="supporting"` "Web developer · Working · 42 min" (state word per 2.2; `Timer` for the elapsed part). Right cluster, three groups max: **(1)** `IconButton variant="ghost" icon={video} label="Call"`, `ToggleButton isIconOnly icon={monitor} label="Desktop"` (pressed = panel open) and `DropdownMenu` trigger `IconButton icon={moreHorizontal} label="More"`; **(2)** `Divider orientation="vertical"`; **(3)** `Button variant="primary" icon={users} label="Summon meeting"` at the far top right |
| More menu | `DropdownMenu` | "Profile" `⌘I`, "Pause" or "Resume" `⇧⌘P`, "Restart desktop", divider, "Remove employee" (destructive, opens `AlertDialog`) |
| Main | inner `Layout` | `header` = top bar, `content` = conversation (`ChatLayout`), `end` = desktop panel (`LayoutPanel`) |

Primary: **Summon meeting**. Keys: see 2.3. Motion: sidebar resize has none; the desktop panel slides 410 ms (`--ease-move`) when toggled (3.3). Responsive: under 1100 px window width the panel opens as an overlay `Drawer` instead of a split; under 1000 px the sidebar auto-collapses to a 72 px avatar-only rail (Apple: collapse with the window), expanding with `⌘\`.

States of the shell:

- **Loading** (app start, <1.5 s): `Skeleton` rows (4) in the sidebar, `Skeleton` top bar, no spinner.
- **Error** (cannot reach the local service): `AppShell banner` -> `Banner status="error" container="section" title="Can't reach your team" description="Check that the app service is running" endContent={Button secondary "Retry"}`.
- **Empty**: see 3.10.

### 3.2 Conversation

Layout: `ChatLayout` (composer docked with the frosted dock) containing `ChatMessageList density="balanced"`, centred column `maxWidth ~ 680 px` (the component's own max width), left/right gutters step 6.

```
conversation column (560 px wide with panel open, 680 centred without)
                    -------------- Today --------------                 (ChatSystemMessage divider)
 (MO) Maya
      +--------------------------------------+
      | Morning. I'm starting on the checkout |
      | bug. Two things first.                |
      +--------------------------------------+
      v Worked for 6 min                                                   (Collapsible, collapsed)
                                                  +--------------------------+
                                                  | Use the blue version.    |
                                                  +--------------------------+
                                                                   Delivered
 (MO) Maya
      +--------------------------------------+
      | Tests pass. Okay if I put it on       |
      | staging?                              |
      +--------------------------------------+
      ( ! ) Deploy to staging              [ Deny ] [ Approve ]            (approval row)
            Runs deploy.sh on staging.example.com
 +------------------------------------------------------------------+
 | Message Maya                                                (^)  |   composer
 +------------------------------------------------------------------+
```

| Element | Astryx | Spec and copy |
| --- | --- | --- |
| Day separator | `ChatSystemMessage variant="divider"` | "Today", "Yesterday", weekday, then date |
| Unread marker | `ChatSystemMessage variant="divider"` | "New", placed above the first unread message; removed 1.5 s after the conversation has been in view |
| Their message | `ChatMessage sender="assistant"` + `ChatMessageBubble` | `avatar={Avatar size={32}}` on the first bubble of a run only (placeholder space on the rest), `group="first|middle|last"` for runs. No sender name above (1:1). Metadata under the last bubble of a run: `Timestamp format="time"` in `Text type="supporting"`, shown on hover except for the newest message |
| Your message | `ChatMessage sender="user"` | Right aligned by the component. Metadata under your newest message only: "Delivered", changes to "Seen" when the employee has consumed it. Never "Sent", never read-receipt dots |
| Typing or thinking | `ChatMessage sender="assistant"` + ghost bubble | `Spinner size="xsm"` with `aria-label` "Maya is typing". Appears only while a reply is being composed, never for background work |
| Activity group | `Collapsible chevronPosition="start"` in a ghost `ChatMessageBubble` | Collapsed trigger: running -> `Spinner xsm` + latest step text + `Timer`; finished -> "Worked for 6 min" in `Text type="supporting"`. Expanded body: one `Item density="compact"` per step: `startContent` a 12 px `Icon` (check) or `Spinner xsm` for the live one, `label` the sentence, `endContent` duration in `Text supporting`. Max 8 rows visible then "Show 4 more" `Button ghost sm`. **Do not use `ChatToolCalls`** (it renders tool names in monospace; gap G5) |
| Activity sentences | | Past tense, plain, max 40 characters, no paths, ids or commands: "Opened the staging site", "Ran the tests", "Fixed the cart total", "Searched for competitors", "Wrote the first draft", "Saved the file to Drive". The current step may be present tense: "Opening the staging site". Errors: "Couldn't open the staging site" (the step icon becomes the error glyph and the row text uses `--color-text-error`) |
| Approval row | `Item density="compact"` inside a `Section variant="muted" padding={3}` attached under the bubble (no Card) | `startContent`: `StatusDot variant="warning"` (the only amber on screen besides the sidebar dot); `label`: the action as a noun phrase, `Text type="label"`: "Deploy to staging"; `description`: the **resolved action**, `Text supporting`: "Runs deploy.sh on staging.example.com" (what will actually execute, one line, truncated with tooltip for the full text); `endContent`: `Button variant="secondary" size="sm" label="Deny"` then `Button variant="primary" size="sm" label="Approve"` |
| Approval resolved | same row, collapsed | Single `Text supporting` line "You approved this · 10:42" or "You denied this · 10:42"; the Maya bubble stays. No undo for deny; Approve can be revoked only before it runs (button "Undo" for 5 s via `Toast`) |
| Composer | `ChatComposer` | `placeholder="Message Maya"` (first name of the open employee), `density="balanced"`, `elevation="low"`, `headerActions`: one `IconButton size="sm" ghost icon={paperclip} label="Attach"`; no model picker, no mic button in the thread; `isStopShown={false}` always. Send is the default arrow. **Sending while they work steers them**: the message is delivered immediately, shown with "Delivered" then "Seen"; there is no queue UI and no special mode |
| Attach drawer | `ChatComposerDrawer` | Appears only with files: file chips (`Token`) with remove |

States:

| State | What shows |
| --- | --- |
| Empty (new hire) | `ChatLayout emptyState`: `EmptyState icon={Avatar size={128}} title="Say hi to Maya" description="Give her a first task." actions={up to 3 ghost Buttons: role starters}`. Starters come from the preset, 3 max, 2 to 4 words each, for example developer: "Fix a bug", "Build a page", "Review my code"; marketer: "Plan a campaign", "Write a launch email", "Research competitors". Clicking a starter fills the composer and focuses it; it does not send. Within 2 s of a hire the employee posts its first message by itself: "Hi, I'm Maya. What should I start on?" so the thread is never silent |
| Working | Typical thread; top bar says `Working · 42 min`; newest activity group is live. The composer stays enabled |
| Needs approval | Bubble + approval row; sidebar dot amber; top bar "Needs you"; notification sent if the window is not focused on this thread. If the window is focused on this thread: no notification, a 175 ms insert only |
| Message failed | `ChatComposer status={{type: "error", message: "Couldn't send. Check your connection."}}`; your bubble gets metadata "Not delivered" in error colour with a `Button ghost sm` "Retry" |
| Employee stuck | Top `Banner status="error" container="section" title="Maya is stuck" description="The staging site won't load." endContent={Show desktop (secondary sm), Try again (secondary sm)}` pinned under the top bar; also a human bubble from Maya ("I'm stuck. The site won't load and I've tried twice."). Banner clears on retry |
| Desktop offline | `Banner status="info" title="Maya's desktop is off" endContent={Button secondary sm "Start desktop"}`. Composer still works (messages are delivered when she is back) with placeholder "Message Maya. She'll see it when her desktop is on" |
| Paused | `Banner status="info" title="Maya is paused" endContent={Button secondary sm "Resume"}` |
| Loading older | `ChatMessageList scrollToTopAction` (spinner at the top, built in) |
| Loading thread | 3 `Skeleton` bubbles alternating left and right |

Primary: **Send** (Enter). Keys: `↩` send, `⇧↩` newline, `⌘L` focus composer. Motion: new bubble fades and rises 8 px over 175 ms; activity rows fade in 175 ms; approval row inserts with height animation 175 ms; no typing bounce.

### 3.3 Desktop panel

A `LayoutPanel` in the `end` slot of the inner `Layout`.

```
panel 440 px (min 360, max 60% of main)     expanded = fills main area
+--------------------------------------+
| (o) Working · 42 min        [ ] [x]  |  header row 40 px: StatusDot + Timer, expand, close
|                                      |
| +----------------------------------+ |
| |                                  | |
| |      live desktop  16:10         | |  AspectRatio 16/10, radius container
| |      (440 - 32 = 408 x 255)      | |
| +----------------------------------+ |
|                                      |
| [          Take control          ]   |  Button primary, full width
|   Lend my screen                     |  Button ghost, centred
|                                      |
| Plan                                 |  Text label
|  (v) Opened the staging site         |
|  (v) Reproduced the bug              |
|  (o) Fixing the cart total           |  Spinner xsm for the current step
|  ( ) Run the tests                   |
|  ( ) Deploy to staging               |
+--------------------------------------+
```

| Element | Astryx | Spec and copy |
| --- | --- | --- |
| Panel | `LayoutPanel width={440} hasDivider isScrollable label="Desktop"` with `useResizable()` + `ResizeHandle isReversed label="Resize desktop"` | Remembered per window (`autoSaveId`). Content padding step 4 |
| Header | `Stack direction="horizontal"` | `StatusDot variant="success" isPulsing={false} label="Working"` + `Text supporting` "Working · " + `Timer`. End: `IconButton ghost size="sm" icon={maximize} label="Expand"`, `IconButton ghost size="sm" icon={close} label="Close desktop"`. The state word follows 2.2 |
| Screen | `AspectRatio ratio={16/10}` containing a raw `<canvas>` or `<video>` (the live stream), `object-fit: contain` on a `--color-background-muted` backdrop | Corner radius `--radius-container`. No bezel or fake window chrome. Hover shows nothing. Click on the screen does nothing unless in control mode |
| Take control | `Button variant="primary" width="100%" label="Take control"` | While controlling: label becomes "Give back", the screen gets a 2 px focus-ring-style outline (`--color-border-focus`), the state line reads "You're in control". Maya's own loop pauses and her state shows "Waiting for you" in the row line |
| Lend my screen | `Button variant="ghost" label="Lend my screen"` opens a `Popover` | Contents: `Selector` options "10 minutes" (default), "30 minutes", "1 hour", "Until I stop" + `Button primary sm "Lend"`. Disabled with `Tooltip` "Turn on 'Can use my screen' in her profile" when the permission is off |
| Plan | `List` of `Item density="compact"` | `startContent` `Icon` check (done, `--color-icon-secondary`) / `Spinner xsm` (current) / hollow circle icon (next). `label` in primary text for current, secondary for done and next. Max 6 visible then `Button ghost sm` "Show all (11)". Updates in place with a 175 ms fade. Section title: `Text type="label"` "Plan" (the only text heading in the panel) |
| Close | | Closing keeps the stream warm for 30 s so reopening is instant |

3.3.1 Expanded: the conversation hides, the panel fills the main area. Layout becomes `Layout content=[screen up to 16:10 centered, max 1100 px wide] end=[LayoutPanel width 320: Plan + Take control]`, header row gets `Button ghost "Back to chat"` (chevron-left icon) at the start. Motion: panel grows 410 ms `--ease-move`.

3.3.2 States:

- **Connecting**: `Skeleton` at 16:10 and `Text supporting` "Connecting to Maya's desktop" with `Spinner xsm`.
- **Offline**: `EmptyState isCompact title="Desktop is off" actions={Button primary "Start desktop"}` in place of the screen; the plan list hides.
- **Reconnecting** (stream dropped): last frame stays with a `Banner status="warning" container="section" title="Reconnecting"` overlaid at the top of the screen via `Overlay position="top"`; auto after 15 s -> error.
- **Error**: `EmptyState isCompact title="Can't show the desktop" description="She's still working." actions={Button secondary "Try again"}`.
- **Idle** (nothing running): screen shows the desktop as is; plan section replaced by `Text supporting` "No plan yet".

3.3.3 Screen lent (user's real screen given to Maya): window-wide `AppShell banner` -> `Banner status="info" container="section" title="Maya is using your screen" description="Ends in 8:42" endContent={Button secondary sm "Take it back"}` (live `Timer` countdown, `Intl` format). Her panel shows `EmptyState isCompact title="Maya is on your screen"` instead of a mirror (no infinite mirror). The menu bar item shows the lent marker (3.11). `Esc` pressed twice in the app, or the menu bar "Take it back", ends it. When time is up the banner clears with a `Toast` "Maya is back on her own desktop".

Primary: **Take control**. Keys: `⇧⌘D` toggle, `⇧⌘↩` expand, `Esc` collapse or release control. Motion: slide 410 ms; plan row transitions 175 ms.

### 3.4 Hire flow

One `Dialog` (modal sheet per Apple), `width={560}`, `purpose="form"`. Two visual steps in one surface; steps swap content with a 175 ms cross-fade, dialog height animates 410 ms.

Step 1: choose a role. No primary button is needed because choosing a row advances.

```
+--------------------------------------------------------+
| Hire                                                (x)|  DialogHeader
|                                                        |
|  [ Web developer     Builds and fixes software      > ]|  Item rows, spacious
|  [ Marketer          Campaigns, email, social       > ]|
|  [ Researcher        Finds and checks facts         > ]|
|  [ Designer          Layouts, brand, assets         > ]|
|  [ Data analyst      Questions in, answers out      > ]|
|  [ Operations        Keeps work moving              > ]|
|  [ Sales             Leads and outreach             > ]|
|  [ Writer            Drafts and edits               > ]|
|  ----------------------------------------------------  |
|  [ Describe a role                                  + ]|
+--------------------------------------------------------+
```

| Element | Astryx | Spec and copy |
| --- | --- | --- |
| Dialog | `Dialog width={560} purpose="form"` with `DialogHeader title="Hire" onOpenChange` | One sheet at a time; `Esc` closes |
| Role rows | `List` of `Item density="spacious" onClick` | `startContent`: `Icon` 20 px for the role; `label`: role name; `description`: 3 to 5 words; `endContent`: chevron-right. 8 rows, no scrolling at default height |
| Describe a role | last `Item` that expands inline | Expands to `TextArea rows={3} placeholder="Describe the role in a sentence"` and `Button variant="primary" label="Continue"` (disabled until 8+ characters; this is the only time step 1 has a primary button). Example hint as placeholder only, no helper text |

Step 2: meet them (the proposal).

```
+--------------------------------------------------------+
| (<)  Meet Maya                                      (x)|
|                                                        |
|                       (  portrait  )                   |  Avatar 144, circle
|                        Maya Chen                     |  Text large, click to edit
|                        Web developer                   |
|        Calm and exact. Asks one good question,         |  Text supporting, 2 lines max
|        then ships.                                     |
|                                                        |
|         (> Hear Maya)        (shuffle) (edit)          |  ghost buttons
|                                                        |
|                                        [  Hire Maya  ]|  primary, trailing
+--------------------------------------------------------+
```

| Element | Astryx | Spec and copy |
| --- | --- | --- |
| Header | `DialogHeader title="Meet Maya"` with `startContent={IconButton ghost icon={chevron-left} label="Back"}` | Back returns to step 1 (Apple: Back + Close, no Cancel + Done + Back) |
| Portrait | `Avatar size={144} name src` | While generating: `Skeleton` circle 144 + `Text supporting` "Finding the right person" with `Spinner xsm`; typical 2 to 6 s. Fallback if the portrait fails: initials `Avatar` and inline `Banner status="warning" title="Couldn't create a portrait" endContent={Button secondary sm "Try again"}` while Hire stays enabled |
| Name | `Text type="large"`; click turns into `TextInput` inline (Enter or blur saves) | Default is generated |
| Role | `Text supporting` | |
| Personality | `Text supporting` | One line, from section 6 |
| Hear | `Button variant="ghost" icon={play} label="Hear Maya"` | Plays a 3 s voice sample in her voice; label becomes "Playing" with `Spinner xsm`; tap again stops |
| Shuffle | `IconButton variant="ghost" icon={shuffle} label="Shuffle"` | Casts a different person (new portrait, name, personality, voice) with the same role; keeps the dialog open; 175 ms cross-fade on the portrait |
| Edit | `IconButton variant="ghost" icon={pencil} label="Edit"` | Expands under the personality: `TextArea` personality (label "Personality"), `Selector` voice (label "Voice"), `RadioList` permission level (3 rows, section 3.5) with default "Asks before big steps". Collapsed by default so the default path is one click |
| Hire | `Button variant="primary" label="Hire Maya"` | `isLoading` while the desktop is being created. On success the dialog closes (175 ms), the new row appears at the top of the sidebar with the avatar, is selected, and her first message arrives. On failure: inline `Banner status="error" title="Couldn't set up her desktop" description="Try again in a moment." endContent={Button secondary sm "Try again"}` |

Notifications permission: after the **first** hire only, trigger the macOS notification prompt (consent per Apple) with no custom preface. Microphone permission is requested at the first call.

Keys: `⌘N` open; `↑↓` move through role rows, `↩` choose, `⌘↩` Hire on step 2, `Esc` close, `⌘[` back. Motion: only the cross-fade and height animation described.

### 3.5 Profile drawer

Opened by clicking the top-bar identity block, `⌘I`, or More -> Profile. A right-side `Drawer` (non-modal inspector over the panel area; the page stays live).

```
+---------------------------------+  400 px wide, full height
| Maya Chen                  (x)|  DrawerHeader title, subtitle "Web developer"
|                                 |
|          (  portrait 96  )      |
|           (> Hear Maya)         |
|                                 |
| Personality                     |  Text label
|  [ Calm and exact. Asks ...  ]  |  TextArea, saves on blur
|                                 |
| Permissions                     |
|  ( ) Asks first                 |  RadioList, 3 rows with 1-line descriptions
|  (o) Asks before big steps      |
|  ( ) Works independently        |
|  Can use the internet     [o ]  |  Switch rows
|  Can run commands         [o ]  |
|  Can use my screen        [  ]  |
|  Can message teammates    [o ]  |
|                                 |
| Desktop                         |
|  Running · 3 h 12 min           |  Text supporting
|  [ Restart ]   [ Reset... ]     |  secondary, destructive (opens AlertDialog)
+---------------------------------+
```

| Element | Astryx | Copy |
| --- | --- | --- |
| Drawer | `Drawer side="end" width={400} label="Profile"` + `DrawerHeader title="Maya Chen" subtitle="Web developer" onOpenChange` | No footer: everything saves immediately (Switch semantics), so there is no Save or Done button |
| Portrait | `Avatar size={96}` + `Button ghost sm "Hear Maya"` | |
| Personality | `TextArea` with visible label "Personality" (`Text type="label"`); one paragraph (persona + working style, 280 chars max) | Saves on blur; no toast. Error: `status` "Couldn't save" |
| Permission levels | `RadioList` | **Asks first**: "Checks with you before anything that changes something." **Asks before big steps**: "Checks before deploying, spending, sending or deleting." **Works independently**: "Only stops when it's stuck." Default for new hires: "Asks before big steps" |
| Switches | `Switch size="md" label=...` rows in a `Stack gap={3}` | "Can use the internet" (`InfoTip`: "Browse and search"), "Can run commands" (`InfoTip`: "Use the terminal on her desktop"), "Can use my screen" (`InfoTip`: "She asks each time"), "Can message teammates". Flipping "Can use my screen" on shows a one-time `AlertDialog title="Let Maya ask to use your screen?" description="She'll ask each time, and you can take it back at any point." confirm "Allow" cancel "Cancel"` |
| Desktop | `Text supporting` state line + `Button secondary "Restart"` + `Button secondary "Reset…"` | Restart: no confirm, desktop restarts, state shows "Starting desktop". Reset: `AlertDialog title="Reset Maya's desktop?" description="Her files and open apps will be erased. Her profile stays." confirm "Reset" (destructive) cancel "Cancel"` |
| Remove | in the More menu only (not in the drawer) | `AlertDialog title="Remove Maya?" description="Her desktop and conversation will be deleted." confirm "Remove" (destructive)` |

Section headings: `Text type="label"` only (no Heading levels, no dividers; spacing step 6 between sections). Primary: none by design (an inspector with immediate effects). Keys: `Esc` closes; `⌘I` toggles. Motion: Astryx Drawer slide.

### 3.6 One-to-one call

Replaces the window with a full-window dark stage. Everything below uses Astryx; the stage root is `<Theme theme={themes[defaultThemeSlug]} mode="dark">` around the stage (nested theme per `astryx docs use-a-theme`), with the page body background `--color-background-body`. Overlays on video use `MediaTheme mode="dark"`. See section 4 for the full model, math and theming notes; this section is the screen contract.

Default layout A "Desktop focus" at 1280 x 800 (stage padding step 6 = 24 px; top strip 48; bottom reserve 104):

```
1280 x 800   1 col = 16 px   1 row = 36 px                        (all dark)
+------------------------------------------------------------------------------+
|  Maya Chen · 04:12                                                          |  top strip 48
|  +-------------------------------------------------------+  +---------------+ |
|  |                                                       |  |               | |
|  |                                                       |  |   face tile   | |
|  |               live desktop  936 x 585                 |  |   280 x 350   | |
|  |                                                       |  |   (4:5)       | |
|  |                                                       |  |  Maya         | |
|  |                                                       |  +---------------+ |
|  |                                                       |  +---------------+ |
|  |                                                       |  | Message Maya  | |
|  +-------------------------------------------------------+  +---------------+ |
|                 Maya  So I'd fix the cart total first                           |  caption line
|                 [ mic ] [ cc ] [ layout ] | [ End ]                              |  floating bar
+------------------------------------------------------------------------------+
```

| Element | Astryx | Spec |
| --- | --- | --- |
| Stage root | `Theme mode="dark"` + `Layout height="fill"` | No sidebar. `Esc` does nothing (to avoid accidental exit); `⌘.` ends |
| Top strip | `Stack direction="horizontal"` | `Text type="label"` name, `Text supporting` "·" `Timer format="clock"`. End: connection quality `StatusDot` (only shown when degraded: `warning` + tooltip "Weak connection") |
| Desktop tile | `SelectableCard padding={0} isSelected={false}` (consistent tile chrome) containing `AspectRatio ratio={16/10}` with the raw `<canvas>`/`<video>` | Radius `--radius-container`. Name chip bottom-left: `Overlay position="bottom" align="start" scrim="dark"` with `Text supporting` "Maya's desktop". Click the small tile when it is the secondary tile = swap emphasis |
| Face tile | `SelectableCard padding={0} isSelected={isSpeaking}` containing `AspectRatio ratio={4/5}` with raw `<video>` | The ring is the card's selection ring (the speaking treatment). Chip bottom-left: name; state variants in 3.6.2 |
| Type box | `ChatComposer density="compact" placeholder="Message Maya" elevation="none"` | Messages typed here go to the same thread and appear as a one-line caption for 3 s: "You  <text>". Hidden below 1100 px; opens with `T` or the keyboard icon in the bar |
| Caption line | `Overlay`-free `Text type="body" size="lg"` centred, max width 720 px | Speaker name in `Text type="supporting"` before the text; text in `--color-text-primary`; you in secondary colour. Fades 175 ms after 3 s of silence; max one line (truncate leftward, newest words visible) |
| Control bar | `Overlay position="bottom" scrim={false} align="center"` over the whole stage with `isOpen` controlled | Container: `Card padding={2} elevation="high"` holding a `Stack direction="horizontal" gap={2}`, height 56 (a rounded bar, not a pill: gap G6). Controls in order: `ToggleButton isIconOnly icon={mic|mic-off} label="Mute"` (pressed = muted, shows slashed icon, `M`), `ToggleButton icon={captions} label="Captions"` (`C`), `DropdownMenu` trigger `IconButton icon={layout} label="Layout"` (`L`; items "Desktop", "Face", "Side by side" with check on current), then `Divider orientation="vertical"` and gap step 6, then `Button variant="destructive" icon={phone-off} label="End"` (`⌘.`). Auto-hides 3 s after the last pointer move or key press (175 ms fade); never hides while a menu is open, while connecting, or while failed |

Primary: **End** (the only filled control; destructive variant). Keys on the stage: `M` mute, `C` captions, `L` cycle layout, `S` swap emphasis, `T` type, `⌘.` end. Motion: call start: shell fades out and the stage fades in over 410 ms (the theme flips under the fade); tile swap: layout crossfade 410 ms `--ease-move`; ring: 175 ms opacity; bar: 175 ms opacity.

3.6.1 Layout variants (spec):
- **A Desktop focus** (default): above.
- **B Face focus**: face tile fills the left box (936 x 648, `object-fit: cover`); desktop becomes a 280 x 175 tile at the top of the right column; the type box sits beneath it.
- **C Side by side**: two equal tiles (608 x 380 each, centred vertically), type box hidden (use `T`).
- Click the smaller tile or press `S` toggles A <-> B. The layout choice persists across calls.
- Width 960 to 1099: right column removed; the secondary tile becomes a 200 px inset tile bottom-right of the large tile, 16 px from the edges (`Overlay align="end"`), draggable between four corners is **not** built (no drag).

3.6.2 State table:

| State | Face tile | Desktop tile | Chip text | Caption line | Bar |
| --- | --- | --- | --- | --- | --- |
| Connecting (up to 15 s) | Portrait still `Avatar size={128}` centred on `--color-background-surface`, `Spinner xsm` under it | Live from the start (it already exists locally) or `Skeleton` | "Calling Maya" | none | Only End visible; no auto-hide |
| Live, quiet | Video, no ring | Live | "Maya" | none | Auto-hide cycle |
| They are speaking | Video; ring on (SelectableCard `isSelected`) | Live | "Maya" | "Maya  <streaming words>" | |
| You are speaking | Video (idle expression), no ring | Live | "Listening" (replaces name) | "You  <your words>" in secondary colour | Mute icon gets a 2 px ring while mic is open and loud |
| They are thinking (after you stop) | Video, no ring | Live | `Spinner xsm` + "Thinking" | none; after 3 s: "Maya is thinking" | |
| Muted (you) | | | | | Mute pressed; a one-off `Toast` is not needed; top strip shows `Text supporting` "You're muted" while you speak and are muted |
| Ended (you or she ends) | | | | | Stage fades out 410 ms to the thread; thread gets `ChatSystemMessage` "Call with Maya · 12 min" |
| Failed to connect | Portrait still, no spinner | Live if available | | | Centered over the stage: `EmptyState title="Couldn't reach Maya" description="Check your connection and try again." actions={Button primary "Try again", Button ghost "Back to chat"}`; bar hidden |
| Dropped mid-call | Last frame, dimmed by the scrim | Live | | | `Banner status="warning" container="section" title="Reconnecting"` at the top for up to 10 s, then the Failed state |
| Microphone blocked | Normal | Normal | | | `Banner status="error" container="section" title="Microphone is blocked" endContent={Button secondary sm "Open System Settings"}`; Mute shows pressed and disabled |

### 3.7 Summon picker

The "Summon meeting" button opens an Astryx `Popover placement="below" width={320} label="Summon meeting"` anchored under the button (a popover, not a sheet: a short, quick choice; Apple popovers for small tasks).

```
+--------------------------------+  320 px
|  (o)(o)(o)  Everyone        [ ]|   Item compact + AvatarGroup, shortcut row
|--------------------------------|
|  (MO) Maya Chen     Working [v]|  Item row, spacious: Avatar 36, name, role, check
|  (PR) Priya Raman     Idle    [v]|
|  (JW) Jonas Weber     Idle    [ ]|
|  (IM) Ines Moreau     Offline   |  disabled row
|--------------------------------|
|                   [ Start meeting ]  primary
+--------------------------------+
```

| Element | Astryx | Spec and copy |
| --- | --- | --- |
| Trigger | the top-bar `Button primary` | Disabled with `Tooltip` "Hire another employee to start a meeting" when there is only one employee (the one-to-one call covers that) |
| Everyone | `Item density="compact"` with `AvatarGroup size="xsm"` and a `CheckboxInput` (`aria-label="Everyone"`) | Selects every available employee up to 4. When more than 4 are available: label "First 4" is not used; instead the row selects the 4 most recently active and the rest are disabled with tooltip "Up to 4 at once" |
| Rows | `List` of `Item density="spacious" isSelected onClick`, one per employee | `startContent` `Avatar size={36}` with the presence dot; `label` name; `description` role; `endContent` a check `Icon` when selected (no checkbox chrome, iMessage-style) plus the state word in `Text supporting` only for Working / Needs you / Stuck. Offline and Paused rows are `isDisabled` with description "Desktop is off" / "Paused". The open employee is pre-selected |
| Start | `Button variant="primary" label="Start meeting"` full width, disabled until at least 1 selected | With exactly 1 selected it starts the one-to-one call (3.6) instead of a meeting. Label never shows a count |
| Cap | | A fifth selection is blocked: rows beyond 4 get `isDisabled` and a `Tooltip` "Up to 4 at once" |

Keys: `⇧⌘M` opens; `↑↓` move, `Space` toggle, `⌘A` Everyone, `↩` Start, `Esc` close. Motion: Astryx popover default. Empty state: none (the button is disabled). Error: if a participant cannot join (desktop failed), the stage shows their tile with the portrait and chip "Couldn't join" and a `Button ghost sm "Retry"`.

### 3.8 Meeting stage

Full spec, wireframes for 2, 3 and 4 participants, layout math and the turn-taking model are in **section 4** (the centrepiece). Shared with 3.6: dark `Theme`, control bar, caption line, auto-hide, `Esc` behaviour.

### 3.9 Team view

Reached from the sidebar footer (`⌘T`). Quiet, no cards, no charts in v1. Layout: `Layout` with `LayoutHeader` and one scrollable content area, max width 880 px, padding step 8.

```
1000 x 744 content
  Team                                        [ Today | Week | Month ]   SegmentedControl
  
   Hours worked          Tasks done            Cost
   38.5                  54                    £12.40            display-3 numbers, Divider between
   +6 vs last week       +9                    ...               Text supporting (omit if no data)

  Employee              Hours     Tasks done     Cost
  (MO) Maya Chen      14.2      21             £4.80      Table, density balanced, sortable
       Web developer
  (PR) Priya Raman       9.0      13             £3.10
  ...
```

| Element | Astryx | Copy |
| --- | --- | --- |
| Title | `Text type="large"` "Team" inside `LayoutHeader` (the one heading) | |
| Range | `SegmentedControl` | "Today", "Week", "Month"; default "Week" |
| Numbers | three `Stack` columns: value `Text type="display-3"`, label `Text type="supporting"`, delta `Text supporting` in secondary colour (no green/red arrows) | "Hours worked", "Tasks done", "Cost". Cost formatted by `Intl.NumberFormat` with the user's currency |
| Table | `Table density="balanced" hasHover dividers="rows"` | Columns: Employee (Item: `Avatar` 32 + name + role), "Hours" , "Tasks done", "Cost"; numeric columns right-aligned, tabular figures; default sort Hours descending. Row click opens that employee's conversation |
| Empty | `EmptyState title="No work yet" description="Numbers appear once your team starts on tasks."` | |
| Loading | `Skeleton` x 3 for numbers, `Skeleton` x 5 rows | |
| Error | `Banner status="error" title="Couldn't load the numbers" endContent={Button secondary sm "Retry"}` | |

Primary: none (read-only view). Optional Databricks touchpoint (for the orchestrator to accept or drop; D-005/Q-004): rows expand (`Collapsible`) to a run history list read from the Delta tables, and one `TextInput placeholder="Ask about your team's work"` below the table (Genie-style question). Attribution as `Text type="supporting"` "Run history stored in Databricks" at the bottom of the view; nothing else. `unverified` that it fits visually until real data exists. Keys: `⌘T` open, `Esc` returns to the previously open conversation. Motion: none.

### 3.10 First run (no employees)

```
+----------------+-----------------------------------------------------------+
|  o o o         |                                                           |
|  Agent Manager+|                                                           |
|                |                      (o)(o)(o)                            |  AvatarGroup of 3 preset faces, size 128-ish
|  No one yet    |               Hire your first employee                    |  EmptyState title
|                |        Give them a role. They get their own desktop.      |  description
|                |                       [   Hire   ]                        |  Button primary
|                |                                                           |
|(You) Suhaan    |                                                           |
+----------------+-----------------------------------------------------------+
```

| Element | Astryx | Copy |
| --- | --- | --- |
| Main | `EmptyState icon={AvatarGroup of three preset portraits, size 72} title="Hire your first employee" description="Give them a role. They get their own desktop." actions={Button primary "Hire"}` | Top bar is not rendered (no selection), so no "Summon meeting" |
| Sidebar list | `Text type="supporting"` "No one yet" | The sidebar footer stays |
| Hire | opens the hire dialog | `⌘N` |

First-run permissions are never batched. Notifications are asked right after the first hire, the microphone at the first call, screen access at the first "Lend my screen". Menu bar item: on by default after the first hire, with the Settings switch "Show in menu bar" (Apple wants the user to decide; this default is flagged as decision D4 in section 7).

### 3.11 Menu bar item and notifications

Both are native macOS surfaces (Astryx cannot render them: gap G1). Build them from the same data as the sidebar so labels match exactly.

**Menu bar item.** A template image (monochrome symbol, 18 pt, adapts to light and dark): a two-circle "colleagues" mark. Variants, all template images so the system recolours them:

| Condition | Glyph |
| --- | --- |
| Normal | base glyph |
| Any employee Needs you or is Stuck | base glyph + small filled dot at the top right |
| On a call or in a meeting | base glyph with a small filled video mark |
| Your screen is lent | base glyph with a ring around it |
| Everything paused | base glyph at 50 % opacity |

No animation in the menu bar (battery, calm). Click opens a **native menu** (Apple: a menu, not a popover):

```
 Maya Chen      Needs you     (18 pt round portrait at the start of each item)
 Priya Raman      Working
 Jonas Weber      Idle
 Show all…                      (only when more than 6)
 ---------------------------
 Summon meeting…        ⇧⌘M
 Hire…                  ⌘N
 ---------------------------
 Pause everyone                  (becomes "Resume everyone")
 Open Agent Manager
 Quit                    ⌘Q
```

When your screen is lent, the first two items are "Maya is using your screen" (disabled) and "Take it back". Selecting an employee opens the app on that conversation. Also provide a Dock menu with the same employee list (Apple: do not rely on the extra being present).

**Notifications** (native `Notification` with the employee's portrait as the icon; Apple communication style). Title = employee name, no ending punctuation; body = what they said, one or two sentences, max about 80 characters, sentence case with full stops; no app name, no emoji. One notification per request, replaced by id (`threadId` = employee id) so a repeated ping updates rather than stacks. Not sent when the app is focused on that thread (insert or badge instead). Errors for the app itself use in-app alerts, not notifications.

| Event | Title | Body | Actions (max 2) | Click |
| --- | --- | --- | --- | --- |
| Approval | Maya Chen | "Can I deploy this to staging?" | Approve, Deny | Opens the thread at the approval row |
| Question | Priya Raman | "Which headline do you prefer, A or B?" | Reply (inline text) | Opens the thread |
| Finished | Maya Chen | "Finished the checkout fix. Take a look?" | none | Opens the thread |
| Stuck | Maya Chen | "I'm stuck. The staging site won't load." | Reply, Show desktop | Opens the thread; Show desktop opens it with the panel on |
| Screen request | Jonas Weber | "May I use your screen for 10 minutes?" | Allow, Not now | Opens the thread at the request |
| Meeting request (optional) | Ines Moreau | "Can we talk about the logo?" | Join, Not now | Opens the call stage if Join |

Dock badge = count of employees Needs you or Stuck. Sound: the system default for approvals only; others silent. Interruption level (when the platform API allows): approvals and screen requests "active", everything else "passive".

### 3.12 Settings (brief)

`Dialog width={480}` with `DialogHeader title="Settings"`, three groups separated by spacing step 6, group titles `Text type="label"`: **Appearance**: `SegmentedControl` "Light", "Dark", "System" (default System; drives `Theme mode`). **General**: `Switch` "Show in menu bar", `Switch` "Open at login". **Notifications**: `Switch` "Messages", `Switch` "When a task finishes" (approvals and screen requests always notify and are not switchable). **Calls**: `Selector` "Microphone", `Switch` "Captions on by default" (default on). No primary button (instant effect). `⌘,` opens, `Esc` closes.

---

## 4. The call and meeting stage (centrepiece)

Scope: the one-to-one call (3.6) and the meeting stage (2 to 4 employees plus you). One component family, one layout engine: a **stage** that arranges **tiles**. A one-to-one call is just a stage with two tiles (face + desktop) of different kinds; a meeting is a stage with 2 to 4 face tiles and optional desktop tiles. Build it as one `Stage` component with a `layout` function, not two screens.

D-013 fallback: if multi-party turn-taking slips, ship only 1:1 (everything in 3.6, none of 4.4 to 4.8). The picker (3.7) then starts a call when one person is chosen and the "Summon meeting" button is hidden.

### 4.1 Stage anatomy and constants

```
+------------------------------------------------------------------+
| top strip 48: title · timer                       (degraded dot) |
|  24 px side padding                                              |
|  +------------------- stage box S -------------------------+     |
|  |  tiles laid out inside S, gap 16 (spacing step 4)       |     |
|  +---------------------------------------------------------+     |
|  caption line 32 (centred, max width 720)                        |
|  control bar 56 (floating, bottom centre)  <- bottom reserve 104 |
+------------------------------------------------------------------+
```

- Window `W x H`. Stage box `S.w = min(W - 48, 1600)`, `S.h = H - 152` (48 top strip + 104 bottom reserve). `S` is centred horizontally.
- Gap between tiles: 16 px (step 4). Tile radius `--radius-container`. Tile surface `--color-background-surface` (dark).
- Face tile aspect 4:3 in meetings, 4:5 in the 1:1 right column (portrait crop of the same stream, `object-fit: cover`, anchor top centre so heads are never cut). Desktop tile aspect 16:10 (`object-fit: contain`).
- All tiles are `SelectableCard padding={0}` hosting an `AspectRatio`; a tile is a button (click = address, see 4.5).
- Minimum window 960 x 640.

### 4.2 Layout rules by participant count (grid mode, the default)

Grid mode is a **stable** grid: tiles never resize because someone spoke. Compute the largest 4:3 tile that fits.

| N (employees) | Grid | Tile width rule |
| --- | --- | --- |
| 1 | not a meeting: use the one-to-one call (3.6) | |
| 2 | 1 x 2 | `w = min((S.w - 16) / 2, S.h * 4/3)` |
| 3 | 1 x 3 (forced; symmetric beats the slightly larger 2 + 1) | `w = min((S.w - 32) / 3, S.h * 4/3)` |
| 4 | 2 x 2 | `w = min((S.w - 16) / 2, ((S.h - 16) / 2) * 4/3)` |

The grid block is centred in `S` both ways. `h = w * 3/4`.

| Window | S (w x h) | N = 2 | N = 3 | N = 4 |
| --- | --- | --- | --- | --- |
| 960 x 640 (min) | 912 x 488 | 448 x 336 | 293 x 220 | 314 x 236 |
| 1280 x 800 (default) | 1232 x 648 | 608 x 456 | 400 x 300 | 421 x 316 |
| 1728 x 1117 (16" MacBook default) | 1600 x 965 | 792 x 594 | 522 x 392 | 632 x 474 |
| 2560 x 1440 (full screen external) | 1600 x 1288 | 792 x 594 | 522 x 392 | 792 x 594 |

**N = 2** (1280 x 800):

```
+------------------------------------------------------------------------------+
|  Meeting · 06:21                                                              |
|                                                                                |
|  +------------------------------------+ +------------------------------------+ |
|  |                                    | |                                    | |
|  |                                    | |                         [ Call on ] | |  hand chip, top right
|  |                                    | |                                    | |
|  |   Maya   (ring = speaking)         | |   Ines                             | |
|  +------------------------------------+ +------------------------------------+ |
|            Maya   I'd start with the pricing page                               |
|               [ mic ] [ cc ] [ layout ] [ add ] | [ End ]                       |
+------------------------------------------------------------------------------+
 tiles 608 x 456, centred vertically in the 648 box
```

**N = 3**:

```
+------------------------------------------------------------------------------+
|  Meeting · 06:21                                                              |
|                                                                                |
|                                                                                |
|   +-------------------+ +-------------------+ +-------------------+            |
|   |                   | |                   | |         [Call on] |            |
|   |                   | |                   | |                   |            |
|   |  Maya             | |  Ines             | |  Priya  Thinking  |            |
|   +-------------------+ +-------------------+ +-------------------+            |
|                                                                                |
|            Maya   I'd start with the pricing page                               |
|               [ mic ] [ cc ] [ layout ] [ add ] | [ End ]                       |
+------------------------------------------------------------------------------+
 tiles 400 x 300
```

**N = 4**:

```
+------------------------------------------------------------------------------+
|  Meeting · 06:21                                                              |
|     +--------------------------+  +--------------------------+                |
|     |                          |  |              [ Call on ] |                |
|     |  Maya                    |  |  Ines                    |                |
|     +--------------------------+  +--------------------------+                |
|     +--------------------------+  +--------------------------+                |
|     |                          |  |                          |                |
|     |  Priya                   |  |  Jonas                   |                |
|     +--------------------------+  +--------------------------+                |
|            Maya   I'd start with the pricing page                               |
|               [ mic ] [ cc ] [ layout ] [ add ] | [ End ]                       |
+------------------------------------------------------------------------------+
 tiles 421 x 316, grid block 858 wide, centred
```

**Spotlight mode** (a desktop or one face is brought up large). Large tile + a strip of the face tiles:

- Strip width (vertical strip on the right): 232 px for N <= 3 (tiles 232 x 174), 200 px for N = 4 (tiles 200 x 150), gap 12.
- Use the vertical strip when `S.h >= N * tileH + (N - 1) * 12`; otherwise use a bottom strip (height 120, tiles 160 x 120, centred). Examples: 1280 x 800, N = 4 -> 636 <= 648 vertical; 960 x 640, N = 3 -> 546 > 488 bottom strip.
- Large tile: the largest 16:10 (desktop) or 4:3 (face) that fits `(S.w - strip - 16) x S.h`, centred.

```
Spotlight, N = 3, 1280 x 800 (large desktop 984 x 615, strip 232 wide)
+------------------------------------------------------------------------------+
|  Meeting · 06:21                                                              |
|  +------------------------------------------------------+ +----------------+  |
|  |                                                      | | Maya (ring)    |  |
|  |                                                      | +----------------+  |
|  |           Maya's desktop  984 x 615                  | +----------------+  |
|  |                                                      | | Ines           |  |
|  |                                                      | +----------------+  |
|  |  Maya's desktop                              [x]     | +----------------+  |
|  +------------------------------------------------------+ | Priya [Call on]|  |
|                                                             +----------------+  |
|            Maya   Here is the checkout bug                                      |
|               [ mic ] [ cc ] [ layout ] [ add ] | [ End ]                       |
+------------------------------------------------------------------------------+
```

Participant changes: when someone leaves or joins, their tile fades (175 ms) and the layout reflows with a 410 ms `--ease-move` transition (FLIP). Dropping to 1 participant converts the stage to the one-to-one call (layout A) in place, keeping the same tiles, with no cut.

### 4.3 One-to-one layouts (recap with the rules)

| Layout | Large | Small | When |
| --- | --- | --- | --- |
| A Desktop focus (default) | Desktop 16:10, 936 x 585 at 1280 x 800 | Face 280 x 350 (4:5) in the right column, type box under it | W >= 1100 |
| A inset | Desktop fills `S` (16:10) | Face 200 x 250 inset bottom-right, 16 px margin (`Overlay`) | 960 <= W < 1100; type box via `T` |
| B Face focus | Face fills left box (cover) | Desktop 280 x 175, right column top, type box under it | user choice |
| C Side by side | Two tiles 608 x 380 each, centred | none | user choice |

Swap: clicking the small tile or `S` toggles A <-> B with a 410 ms `--ease-move` size-and-position transition (FLIP). The face keeps playing; the desktop keeps streaming; the ring stays on the face while she speaks in both layouts.

### 4.4 Active speaker treatment

- The speaker is shown by the tile's selection ring (`SelectableCard isSelected`, 2 px, accent which is near-white in the dark stage) fading in 175 ms. No resizing, no dimming of others, no waveform, no glow, no scale pulse.
- Debounce: a speaker change needs 150 ms of sustained speech to take the ring, and the old ring stays 400 ms after silence, so short back-channel sounds do not flicker rings.
- Only one ring at a time (floor rule below).
- The ring marks "has the floor", not "is audible": the floor passes to the addressed employee the moment you address them, before audio starts; the chip then reads "Thinking" until speech begins (4.7).
- Name chip (always visible, bottom-left of the tile): `Overlay position="bottom" align="start" scrim="dark"` inside `MediaTheme mode="dark"` with `Text type="supporting"` name. State suffix replaces the name only for: "Thinking" (with `Spinner xsm`), "Listening" (you are speaking), "Joining", "Couldn't join".
- In Spotlight mode the ring stays on the speaker's strip tile, and the large desktop tile gets no ring.

### 4.5 Turn-taking and hand raise

Rules (the product model; backend enforces, UI reflects):

1. **One floor.** One employee speaks at a time. You are always allowed to interrupt: your voice stops the current speaker within 300 ms (barge-in) and the ring clears.
2. **You address someone** in one of three equivalent ways: say their name ("Maya, what do you think?"), click or press Enter on their tile, or press `1` to `4` (tile order). The tile click gives 175 ms feedback (the ring flashes in), then the chip reads "Thinking". Addressing a hand-raised employee also lowers their hand.
3. **They raise a hand** when they have something to add and are not addressed. A **hand chip** appears on the tile top-right: `Button variant="secondary" size="sm" icon={hand} label="Call on"` (on `MediaTheme mode="dark"`). It scales in over 175 ms. It is the only affordance: no number badges, no toast. With several hands the labels read "Call on" for the first and "Call on · 2", "Call on · 3" for the rest (order of raising). Hands auto-lower after 90 s with a 175 ms fade, or when you right-click the tile and choose "Lower hand" (`ContextMenu`).
4. **You call on** them by clicking the chip (or the tile, or their key). The hand lowers, the ring moves, the chip reads "Thinking", then they speak.
5. **They may talk to each other only when asked** ("Maya, ask Ines about the logo"). The caption then reads "Maya to Ines  ..." and the ring follows whoever is speaking.
6. **Silence is fine.** If nobody is addressed and no hand is up, nothing happens. In the first 10 s of a meeting only, the caption line shows once: "Say a name or click a face" (`Text supporting`), then never again.
7. **End** ends the meeting for everyone. There is no "leave": you are the host. Everyone returns to their prior state; each thread gets `ChatSystemMessage` "Meeting · 14 min · Maya, Priya, Jonas".

Tile state table:

| State | Tile | Chip | Hand chip |
| --- | --- | --- | --- |
| Joining | `Avatar size={96}` portrait centred + `Spinner xsm` | "Joining" | no |
| Present, idle | video, no ring | name | no |
| Addressed, thinking | video, no ring | `Spinner xsm` "Thinking" | no |
| Speaking | video + ring | name | no |
| Hand raised | video, no ring | name | `Call on` chip |
| Not answering (20 s) | video | "No answer" + `Button ghost sm "Ask again"` | no |
| Dropped | last frame + scrim, `Avatar` centred | "Reconnecting" | no |
| Couldn't join | portrait, no spinner | "Couldn't join" + `Button ghost sm "Retry"` | no |
| Left | tile fades out over 175 ms, layout reflows | n/a | n/a |

Keyboard: `1` to `4` address by tile order; `Tab` moves through tiles then the bar; `Enter` or `Space` on a tile addresses; `S`/`G` handled by 4.6.

### 4.6 How the desktop tile and face tiles trade places

- Hover overlay on a face tile (`Overlay showOn="hover-or-focus" position="top" align="end" scrim={false}`): two `IconButton size="sm" variant="secondary"`: "Show desktop" (monitor) and "Focus" (maximize). They are the only hover affordances.
- **Show desktop** adds that employee's desktop as a 16:10 tile and switches to Spotlight with it large. Showing another employee's desktop replaces it (one large tile at a time).
- **Auto bring-up**: if an employee explicitly shares ("let me show you", a `show_desktop` event) and nothing is pinned, the stage enters Spotlight on her desktop automatically (410 ms). If you already have something large, her desktop does not take over; her tile shows a small monitor icon instead and the hover action pulses once.
- **Focus** enlarges a face as the large 4:3 tile (same Spotlight geometry).
- **Back to grid**: `G`, `Esc` (only while in Spotlight; otherwise `Esc` does nothing on the stage), the `x` on the large tile's chip, or clicking "Layout" -> "Grid".
- Speaker changes never change the large tile. Only you (or an explicit share) do. This is what keeps the stage calm.
- Spotlight with a desktop large still shows the speaker's face in the strip with the ring, so who is talking is always visible.
- Control of a desktop from inside a meeting is not offered (use the thread). The large desktop tile is view-only.

Layout menu (control bar) in a meeting: "Grid", "Spotlight" (greyed unless something is large), "Hide captions". In 1:1: "Desktop", "Face", "Side by side".

### 4.7 What the user sees while an employee is thinking

Ladder (all driven by the same addressed/thinking event):

| Time after you finish speaking | Addressee tile |
| --- | --- |
| 0 to 150 ms | Chip switches to `Spinner xsm` + "Thinking" (feels instant, no ring) |
| first audio | Chip returns to the name, ring in (175 ms), captions stream |
| > 1.2 s | The avatar does a small idle "thinking" motion (provided by the avatar stream, not UI) |
| > 3 s | Caption line: "Maya is thinking" (`Text supporting`) |
| > 8 s | Chip: "Still thinking" |
| > 20 s | Chip: "No answer" + `Button ghost sm "Ask again"` |

Product behaviour requested from the backend: a short natural filler from the addressee at about 2.5 s ("Let me check that.") so a pause never reads as a freeze. UI never shows a progress bar or percentage for thinking.

### 4.8 Captions

- One line, centred, above the control bar, max width 720 px, `Text type="body" size="lg"`. Speaker name in `Text type="supporting"` before the words; your own words in `--color-text-secondary`.
- Streaming: use `useStreamingText` for steady reveal. Truncate on the left so the newest words always show. Fades out 175 ms after 3 s of silence.
- Default on (Settings: "Captions on by default"); toggle `C`. When off the line is not rendered at all (no empty reserve change: the 32 px caption row stays so the layout does not jump).
- Not a transcript: no history, no scrolling. The thread keeps the call summary line only (live transcript out of scope).

### 4.9 Control bar

- Container: `Card padding={2} elevation="high"` (a rounded bar; pill radius is not available through props, gap G6) inside `Overlay position="bottom" scrim={false} align="center"` layered over the stage, 24 px above the bottom edge. Width hugs content (about 360 px for 1:1, about 440 px with Add).
- Order, left to right: Mute `ToggleButton` (`M`), Captions `ToggleButton` (`C`), Layout `DropdownMenu` (`L`), Add `IconButton` icon users-plus, label "Add to meeting" (meetings only; opens the 3.7 picker in a `Popover placement="above"`, members already in are checked and disabled), `Divider orientation="vertical"` with 24 px extra gap, End `Button variant="destructive" icon={phone-off} label="End"` (`⌘.`). End is separated from Mute by the divider and extra gap (Meet's accidental-hang-up rule).
- Icon buttons use `size="lg"` (44 px hit target), icon `md`. Each has a `Tooltip` with label and `Kbd`.
- Auto-hide: fade out 175 ms after 3 s without pointer movement or key press; fade in on pointer move, key press or focus. Never hides while: a menu or popover is open, connecting, failed, or reconnecting. Captions stay visible when the bar hides.
- Reduced motion: no fade, instant.

### 4.10 Dark stage inside a system-appearance app (Astryx theming only)

1. App root: `<Theme theme={themes[defaultThemeSlug]} mode={userAppearance}>` (`"system"` by default).
2. Stage root: a nested `<Theme theme={themes[defaultThemeSlug]} mode="dark">` around the entire stage (same theme object, only the mode differs; this is the documented nested-theme pattern in `astryx docs use-a-theme nesting-themes`). Every `light-dark()` token resolves dark inside it: body `#111112`, surface `#1F1F22`, text `#DFE2E5`, secondary text `#AAAFB5`, accent flips to near-white `#f1f1f1` (neutral theme; verified in `theme.css`), so the primary-ish controls on the stage are white-on-dark automatically. These are for reference only: write tokens (`var(--color-*)`), never the hex.
3. Anything over video (chips, hover actions, hand chip, caption backing if added) goes inside `MediaTheme mode="dark"`; `MediaTheme` is for local surface inversion, `Theme mode="dark"` is the page-wide one (do not swap them).
4. Entering: mount the stage above the shell with opacity 0 -> 1 over 410 ms, then unmount the shell; leaving is the reverse. The theme flip itself is instant but hidden under the fade. Reduced motion: instant swap.
5. The app's light/dark setting is untouched outside the stage. The hidden-inset titlebar keeps the traffic lights; they adapt to the window's effective appearance because the stage fills the window (set the window background to the stage background colour on enter, shell concern).
6. Contrast: all text uses theme tokens; none of the spec uses opacity on text.

### 4.11 Accessibility

- Tile = `SelectableCard` with `label` "Maya Chen, speaking. Press to address" (state changes update the label). Captions region `aria-live="polite"` only while captions are on.
- Every control has a visible label tooltip, a `Kbd` hint and 44 px target.
- Reduced motion: layout changes become cross-fades of at most 200 ms.
- The ring never carries meaning alone: the chip shows state text and the caption names the speaker.

---

## 5. Visual system within Astryx

### 5.1 Appearance

`Theme mode` "system" by default, switchable in Settings (Light, Dark, System). The call and meeting stage is always dark (4.10). Theme: `themes[defaultThemeSlug]` (neutral) from `astryx-themes.js`; do not edit that file. Wire once at the app root per `AGENTS.md`.

### 5.2 Colour

- The neutral theme's accent is **ink**: `--color-accent` is near-black in light and near-white in dark (verified in `@astryxdesign/theme-neutral/dist/theme.css`). Primary buttons are therefore black-on-white or white-on-black. This is the single accent. v1 adds no hue (decision D1 in section 7).
- Allowed uses of the accent: the one primary `Button` per view, selected rows (Astryx default), the focus ring, the selection ring on tiles, text links.
- Status colour is allowed only for real status, via tokens: success = the Working presence dot; warning = the Needs-you dot and the approval row's dot; error = Stuck dot, error `Banner`, the End button, the "Not delivered" caption. Nothing else may be coloured, including Badges (neutral only).
- Surfaces: page `--color-background-body`, panels and raised content `--color-background-surface` (AppShell `variant="elevated"` does this), muted wells `--color-background-muted`. No gradients, no shadows beyond Astryx's `elevation` props (`low` for the composer, `high` for the stage control bar only).

### 5.3 Type scale (Astryx tokens only)

| Use | Component | Token or type |
| --- | --- | --- |
| Employee name in sidebar and picker | `Item label` | `--text-label-*` (14 px medium) |
| Sidebar muted line, timestamps, state line, captions' speaker name, chips | `Text type="supporting"` | `--text-supporting-*` (12 px, secondary colour) |
| Top bar employee name, Team title, hire proposal name | `Text type="large"` | `--text-large-*` (17 px semibold) |
| Message body, composer, rows | default `Text`/bubble | `--text-body-*` (14 px) |
| Captions | `Text type="body" size="lg"` | body weight at 17 px |
| Team numbers | `Text type="display-3"` | `--text-display-3-*` |
| Dialog and drawer titles | `DialogHeader`/`DrawerHeader title` | component default (heading) |
| Section labels in drawer/settings | `Text type="label"` | `--text-label-*` |

No other sizes. No bold inside body copy. Numbers in the Team table use tabular figures (default of the table).

### 5.4 Spacing rhythm

Steps (token `--spacing-n`): 1 = 4, 2 = 8, 3 = 12, 4 = 16, 6 = 24, 8 = 32. Rules: page gutters 24 (step 6); inside panels 16 (step 4); between groups in drawers 24 (step 6); between a label and its control 8 (step 2); rows use Item density (compact 4 px, balanced 8 px, spacious 12 px block padding), never custom padding. Fixed heights: sidebar row 64, top bar 56, control bar 56, caption row 32. Use component `gap`/`padding` props; never margin hacks.

### 5.5 Corner radius

Only theme tokens: tiles, panels, screens `--radius-container` (12), buttons and inputs `--radius-element` (8) by default, composer `--radius-chat` (component default), dialogs and popovers component defaults, portraits circle. No custom radii. Rounded tiles are rounded rectangles, never circles.

### 5.6 Motion (restraint)

Only these animate; everything else is instant. All durations from tokens, all honour `prefers-reduced-motion`.

| Motion | Duration token | Notes |
| --- | --- | --- |
| Opacity fades (bubbles in, ring, chips, bar, captions, rows reorder) | `--duration-fast` 175 ms | bubbles also rise 8 px |
| Panel slide, dialog height, layout reflow, stage enter and leave | `--duration-medium` 410 ms | `--ease-move` for position and size, `--ease-exit` for leaving |
| Presence pulse on Needs you | 2 pulses then rest (StatusDot `isPulsing`) | never loops forever |

No bouncing, no confetti, no typing-dot bounce, no parallax, no skeleton on anything that loads under 300 ms (delay skeletons by 300 ms).

### 5.7 Portrait treatment

Circle `Avatar` everywhere except video tiles (rounded rectangle). No border, no ring, no drop shadow. Presence dot at the avatar's 4 o'clock (Astryx default). Face centred, about 60 % of the circle height.

| Context | Avatar size | Notes |
| --- | --- | --- |
| Sidebar row | 40 | dot |
| Top bar | 32 | no dot (state is in the text) |
| Message first-of-run | 32 | no dot |
| Summon picker row | 36 | dot |
| Team table | 32 | no dot |
| Hire proposal | 144 | no dot |
| Profile drawer | 96 | no dot |
| Empty states | 128 (first message), 72 in the first-run `AvatarGroup` | |
| Call/meeting tile placeholder | 128 (1:1), 96 (meeting) | stills on `--color-background-surface` |
| Menu bar menu, notification | 18 pt image (36 px @2x), 128 px for notification icon | pre-rendered PNGs of the circular crop |

Always pass `name` (initials fallback and accessible name). Always provide `fallbackSrc`.

### 5.8 Iconography

- Astryx's semantic icon names are few (close, chevronDown/Left/Right, check, success/error/warning/info, calendar, clock, externalLink, menu, moreHorizontal, search, upload, arrowUp/Down, copy, wrench, stop, microphone, funnel, eyeSlash...). There are **no** video, phone, monitor, hand, captions or paperclip icons (gap G3).
- Source for everything else: `lucide-react`, which is the neutral theme's own icon dependency (`@astryxdesign/theme-neutral` depends on `lucide-react`; v1.73.0 installed). Pass the lucide component to Astryx: `<Icon icon={Video} />`, `<IconButton icon={<Icon icon={Video} />} label="Call" />`. Never use lucide for anything but glyphs.
- Set used (lucide names): Video, Monitor, Users, UserPlus, Plus, Mic, MicOff, Captions, LayoutGrid, PhoneOff, Hand, Paperclip, Maximize2, Minimize2, Play, Shuffle, Pencil, Pause, Settings, BarChart3, Keyboard, plus role icons: Code2, Megaphone, Search, PenTool, ClipboardList, Handshake, FileText. Use semantic names (`close`, `check`, `chevronLeft`, `moreHorizontal`) wherever one exists.
- Size: `sm` (16) in rows and toolbars, `md` (20) in the control bar. Stroke width default, outline only, never filled, no bezels or circled icons (Apple). Icon colour follows text tokens; no coloured icons.

### 5.9 Never do (for the builders)

1. No `<div>` or `<span>`; no raw hex, px, margin hacks, StyleX or Tailwind, no `className` colour. Tokens and props only.
2. No other UI library, and no hand-rolled version of an Astryx component.
3. No Card around lists or panels; no Card inside Card. Cards only for tiles on the stage and the control bar.
4. No monospace, ids, file paths, JSON, stack traces or tool names in the main UI. They live in the Team view's optional run history only.
5. No emoji, exclamation marks, "AI", "assistant", "agent", "bot", "powered by" (except the single Databricks attribution if accepted), or marketing lines anywhere in the app.
6. No second primary button on a screen; no coloured Badges; Badge = unread count only.
7. No coloured icons, no coloured sidebar selection, no gradients, no glow, no waveform or pulsing around speakers.
8. No tooltips as the only label for a non-obvious action; no helper paragraphs; at most one line of hint text per view.
9. No modal on top of a modal; no toast for anything the user caused and can see.
10. No tiles that resize when someone speaks; no auto-switching of the large tile.
11. No autoplay audio; voice samples play only on click.
12. No spinner without a label that exceeds 300 ms; no progress bars for thinking.
13. No reordering the sidebar under the pointer.
14. No placeholder lorem, "Untitled", "John Doe". Fixtures use the 8 presets in section 6.
15. No text over a portrait without a scrim (`Overlay` scrim inside `MediaTheme mode="dark"`).

---

## 6. Portraits and personas

### 6.1 Casting decision (needs the orchestrator, D-014)

The face a user sees in the sidebar must be the same face that appears in the call. Therefore the portrait must be a still of the same avatar the call uses. Recommended: **cast from the avatar provider's catalogue** (stock presenters), so portrait, motion, lip-sync and voice are consistent by construction; generate only the name, personality and role mapping, and let Shuffle step through catalogue entries weighted by the role (`unverified`: catalogue breadth and any custom-avatar-from-photo option must be confirmed with the provider). If portraits are generated by an image model instead, the same image must drive the avatar; never show one face in the sidebar and another on the call.

### 6.2 Style guide (applies to catalogue crops and to generated portraits)

- **Photographic**, not illustrated. The avatar video will be photographic; illustrated portraits read as toy-like next to it.
- Head and shoulders, shoulders squared to the camera within 10 degrees, eyes at about 38 % from the top, face about 60 % of the circle height, chin clear of the crop. Master 1024 x 1280 (4:5, used by the call tile), circle crop 1:1 centred on the face for avatars (export 256 x 256).
- Background: seamless warm light grey (about `#E7E5E2`, matches the neutral theme's warm greys; for the image brief only, never for code), no environment, no blur bokeh, no logos. Soft window light from camera left, no hard shadows.
- Expression: relaxed, slight natural smile or neutral, direct eye contact. No exaggerated grins, no stock "teamwork" poses, no hands in frame.
- Wardrobe: solid muted colours (charcoal, navy, olive, sand, soft blue), plain neckline, no patterns, no logos, no jewellery that draws the eye. Colour is the only thing that varies, which is what keeps the set uniform.
- **As a set**: the eight faces vary in age (late 20s to late 50s), gender presentation, skin tone and hair; roles are not stereotyped (do not make all developers one demographic or all writers another). Same crop, same lighting, same background, same saturation. A grid of the eight in the empty state should look like one company photo shoot.
- Prompt template for generated sets (if used): "Professional head-and-shoulders portrait of a {age} {descriptor}, {hair}, relaxed natural expression, direct gaze, wearing a plain {colour} {garment}, seamless warm light grey studio background, soft diffused window light from the left, 85mm lens, natural skin texture, no text, no logos, photographic". Fix seed family and lighting words across all eight.

### 6.3 Role presets (fixtures and hire list)

| # | Role (row label) | Name | Personality (one line, shown in hire) | Working style (stored, not shown by default) | Voice | Starters (3) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Web developer | Maya Chen | Calm and exact. Asks one good question, then ships. | Small steps, runs the tests before saying done, shows the staging link | Warm alto, unhurried | Fix a bug / Build a page / Review my code |
| 2 | Marketer | Priya Raman | Warm and curious. Thinks in audiences. | Offers three options, checks competitors, never posts without approval | Bright mezzo, quick | Plan a campaign / Write a launch email / Research competitors |
| 3 | Researcher | Jonas Weber | Patient and sceptical. Cites everything. | Reads widely, keeps running notes, flags what is uncertain | Even baritone, measured | Find the facts / Compare options / Summarise a paper |
| 4 | Designer | Ines Moreau | Opinionated, and kind about it. | Sketches two directions, explains the why, asks before polishing | Soft, expressive | Sketch a layout / Improve this page / Make a logo |
| 5 | Data analyst | Kenji Watanabe | Quiet and precise. Loves a clean chart. | Checks the data first, states assumptions, ends with one paragraph | Low, calm | Clean this data / Find the trend / Build a chart |
| 6 | Operations | Amara Lim | Organised and unflappable. | Keeps checklists, chases loose ends, reports once a day | Clear, steady | Plan the week / Chase this up / Tidy my inbox |
| 7 | Sales | Marcus Reyes | Friendly and direct. Never pushy. | Researches the lead first, drafts in your voice, asks before sending | Warm tenor, relaxed | Find leads / Draft outreach / Prepare for a call |
| 8 | Writer | Hannah Brooks | Dry wit, tight prose. | Outlines first, edits twice, keeps your voice | Crisp, light | Draft a post / Edit this / Write the docs |

Role icons (lucide, 20 px) in the hire list: Code2, Megaphone, Search, PenTool, BarChart3, ClipboardList, Handshake, FileText. Names are fixtures; Shuffle produces other names with the same role and the same naming diversity. Demo default order in the sidebar: Maya (Needs you), Priya (Working), Jonas (Idle), Ines (Idle).

---

## 7. Build checklist for the front-end agents

### 7.1 Done means (per screen)

Every screen: built from an Astryx template (`npx astryx build`, `astryx template`), no `<div>`, no raw colour or px; has empty, loading and error states; keyboard reachable with visible focus; correct at 960 x 640 and 1280 x 800 and 1728 x 1117; light and dark; reduced motion tested; `npx astryx doctor --built <dir>` passes.

| Screen | Done when |
| --- | --- |
| App shell | Sidebar 280 resizable 240 to 320, rows 64 px with avatar, dot, one muted line, time, unread; Needs-you rows sort first; top bar identity + three icon buttons + one primary "Summon meeting" at far top right; collapses under 1000 px; skeleton and error banner exist |
| Conversation | Bubbles correct sides, day dividers, collapsed activity groups with human sentences, approval row with resolved action and Approve as the only dark button, "Delivered/Seen", steering works while working, six states of 3.2 designed |
| Desktop panel | 16:10 live canvas, state line with Timer, plan checklist, Take control swaps to Give back, Lend my screen popover, expand, five states of 3.3.2, lent-screen banner |
| Hire | Two steps in one dialog, 8 preset rows, Describe a role, proposal with Hear, Shuffle, Edit, one "Hire <name>" primary, generating, portrait-failed and hire-failed states, first message arrives |
| Profile | Drawer 400, personality, three-level RadioList, four Switches, Desktop restart and reset with AlertDialog, no footer |
| Call | Dark nested Theme, desktop + face tiles, layouts A/B/C and inset, bar with Mute, Captions, Layout and End, caption line, type box, all states of 3.6.2 |
| Summon picker | Popover 320 with Everyone, portrait rows, cap of 4, disabled offline rows, "Start meeting" primary, starts the 1:1 call when one is picked |
| Meeting | Grid for 2, 3, 4 per 4.2 math, spotlight with strip, ring, chips, hand raise and call on, thinking ladder, add/leave reflow, degrade to 1:1 |
| Team | Range control, three numbers, sortable table, empty, loading, error |
| First run | EmptyState with face group and Hire, no top bar |
| Menu bar and notifications | Native menu with portraits and states, five icon variants, notifications with portrait, actions and thread replacement, Dock badge |

### 7.2 The ten most likely ways it will look cheap or cluttered, and the fix

1. **It looks like a developer console** (monospace tool names, paths, durations everywhere). Fix: activity rows are sentences (3.2), `ChatToolCalls` is not used, raw detail only in the optional run history.
2. **Everything in Cards** (rows, panel sections, the profile). Fix: `Section`/`Item`/`List` only; cards exist only for stage tiles and the control bar.
3. **Status confetti** (coloured badges, pills, icons for every state). Fix: one presence dot and one muted line per row; Badge is an unread count; colour only per 5.2.
4. **Toolbar full of text buttons.** Fix: three icon buttons, one divider, one text primary (the user-requested "Summon meeting").
5. **Inconsistent faces** (some real, some initials, mixed crops and backgrounds, low-res). Fix: one casting source (6.1), one crop, preload, `fallbackSrc`, always the same circle.
6. **Hand-painted dark call screen** (hex backgrounds, mismatched greys, light controls). Fix: nested `Theme mode="dark"` and `MediaTheme` only (4.10).
7. **Jumpy meeting** (tiles resize on each speaker change, rings flicker). Fix: stable grid, ring only, 150 ms enter and 400 ms hold debounce (4.4).
8. **Missing states** (blank panel while connecting, no error text, raw spinners). Fix: use the state tables; delay skeletons by 300 ms; every error has a plain sentence and a "Try again".
9. **Chatty, robotic copy** ("Successfully", "AI Assistant is processing your request!", exclamation marks, emoji). Fix: copy rules in section 0, employees speak in the first person and briefly, the UI says nothing it does not need to.
10. **Fussy motion and chrome** (bouncy tiles, glowing rings, drop shadows, borders inside borders, double dividers, titlebar colliding with the traffic lights). Fix: only the motions in 5.6, one divider per boundary, 28 px sidebar top inset and drag regions set in window config.

### 7.3 Gaps in Astryx (report with `npx astryx gap-report`; compose first, ask before anything outside Astryx)

| # | Gap | Workaround in this spec |
| --- | --- | --- |
| G1 | No native menu bar item, native notifications, Dock menu or window chrome | Platform APIs, built from the same data (3.11); only the window drag region needs raw CSS |
| G2 | No video-call primitives (tile, participant grid, control bar, captions line) | Composed from `SelectableCard`, `AspectRatio`, `Overlay`, `Card`, `Toolbar` pieces, `Stack`, `Theme`, `MediaTheme`. Raw `<video>`/`<canvas>` only inside `AspectRatio` |
| G3 | Semantic icon set has no video, phone, monitor, hand, captions, paperclip, shuffle | Lucide components via `Icon icon={Component}` (the neutral theme's own dependency); confirm this is acceptable under D-001 |
| G4 | `AvatarStatusDot` only has success, neutral and error, no amber and no pulse | Needs-you uses `StatusDot variant="warning" isPulsing` in the Avatar `status` slot (verify it positions at 4 o'clock; unverified). Fallback: `AvatarStatusDot variant="neutral"` with `icon` set to an exclamation glyph |
| G5 | `ChatToolCalls` always renders tool names in monospace | Activity rows composed with `Collapsible` + `Item` |
| G6 | No pill or custom corner radius on `Card`/`Section` via props | Control bar is a rounded bar at `--radius-container`, not a pill |
| G7 | No typing-indicator component | `Spinner size="xsm"` with an aria-label |
| G8 | No grayscale or dimmed avatar for offline | Offline = no dot and muted text; avatar unchanged |
| G9 | No "speaking ring" | `SelectableCard` selection ring (tile click = address) |
| G10 | No idle-hide helper for overlays | `Overlay isOpen` controlled by a small pointer-idle timer in app code |
| G11 | No draggable or snapping inset tile | Fixed inset corner, not draggable |
| G12 | Neutral accent is ink, no hue | Accepted for v1 (D1). Later: one hue through `astryx experimental theme editor` |

### 7.4 The decisions I am least sure of (please confirm or overrule)

- **D1 Monochrome ink accent, no hue.** Maximum calm and distinctive next to the portraits, but could read as austere. Alternative: extend the neutral theme with one calm blue via the theme editor (about 15 minutes). Default shipped here: ink.
- **D2 Stable grid with a speaking ring in meetings** instead of the Zoom/FaceTime default of enlarging the speaker. Calmer and cheaper to build, but a static grid may look less alive on stage.
- **D3 Addressing model**: tile click or name = address, with a separate "Call on" chip for raised hands. Relies on reliable spoken-name detection; if it is flaky, the click path must carry the demo.
- **D4 Casting from the avatar provider's catalogue** rather than generating portraits, and a menu bar item that is on by default after the first hire (Apple prefers user choice). Needs provider confirmation of catalogue breadth.
- **D5 Profile as a non-modal side Drawer and the tray as a native menu** (not a rich Astryx popover). Drawer keeps the page in view and avoids a second modal; a native menu cannot show rich content but follows Apple's rule and is the only thing that works on a menu bar item.

### 7.5 Figma deliverable (Q-002 open)

No public rule text for this event's Figma prize exists, and other Figma events reward craft, originality and storytelling. Cheapest credible deliverable: after the build, render the ten hero frames of 1.3 at 1280 x 800 (plus the dark stage) and push them to one Figma file with the Figma MCP (`html_to_figma` or `send_code_to_figma`, then `use_figma` for naming and a "System" page documenting tokens, type scale, spacing, avatar sizes and the state table). `unverified` that import fidelity is acceptable; fallback is screenshots placed on named frames. Include the file link and this spec's section 1.2 principles in the submission. Do this only after the app is stable; it must not slow the build.

### 7.6 Items for the orchestrator to log (I did not edit shared docs)

- `research-log.md`: the HIG, Linear, Meet, Zoom, FaceTime, Cursor and agent-UX findings in 1.1 with their tags; "no public Figma prize listing for this event found 2026-11-14"; Astryx facts (neutral accent is ink, nested `Theme mode="dark"` supported, `lucide-react` is the neutral theme's icon source, `ChatToolCalls` monospace, `SelectableCard` ring, icon set limits).
- `decisions.md`: D1 to D5 above once the orchestrator rules on them; the 1:1-first fallback of 4 (D-013) is already compatible.
