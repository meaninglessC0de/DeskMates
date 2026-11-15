# Custom components and tokens (how we extended Astryx with its own tokens)

Read first: `docs/hackathon/README.md`. Front end must use Astryx (read `AGENTS.md`); write findings back to `docs/hackathon/`.

Every custom piece is a small wrapper around Astryx components. Styling is CSS text in `ui/styles/app.ts` (app agent) and `ui/styles/stage.ts` (stage agent), Astryx tokens only, attached through `data-am-*` attributes. This file doubles as our gap report.

## App agent (D1)

### Personal tints (`ui/tint.ts`, `ui/styles/app.ts`)
- **What:** eight soft per-person hues (0-3 are the Deskmates logo's blue 262, orange 62, pink 357, green 160; 4-7 violet 300, teal 200, amber 90, coral 25; one lightness and chroma for all, `oklch()` inside `light-dark()`), `--am-tint-0..7` (background), `--am-tint-ink-0..7` (text on it) and `--am-tint-line-0..7` (the brand-strength hairline, oklch 0.75 0.15), resolving per theme through `light-dark()`, so they follow light and dark and the nested dark stage Theme. Declared on `:root, [data-astryx-theme], [data-theme]`. Any element with `data-am-tint="N"` also gets the shorthands `var(--am-tint)`, `var(--am-tint-ink)`, `var(--am-tint-line)`.
- **API:** `tintIndex(id, name?, portraitUrl?) -> 0..7`. Each cast face owns one slot (Maya blue, Priya orange, Jonas pink, Ines green: the seeded demo reads as the logo) (keyed by portrait file or first name), so a team never repeats a colour; anyone else (the user, a custom name) gets a stable FNV hash of the id. With only `id`, the employee is looked up in the store, so `tintIndex(employeeId)` on the stage matches the sidebar. `tintVars(...)` returns `{ index, bg, ink, attr }`.
- **Gap filled:** Astryx has no per-entity colour; Avatar initials are always the same grey.

### `Portrait` (`ui/Portrait.tsx`)
- **What:** `<Portrait person={{ id, name, portraitUrl }} size={24|32|40|56|96|144|number} presence?={EmployeeState} tooltip?={boolean} />`. Astryx `Avatar` with the photo (the `-sq.jpg` square crop for `/media/portraits/*`, original as `fallbackSrc`; cropped a little tighter at 40 px and below, with a hairline ring), otherwise the monogram on the person's tint (`data-am-portrait`, `data-am-tint`). Sizes snap to Avatar's supported sizes (56 -> 60). `presence` renders the existing `PresenceDot` in Avatar's status slot, cut out with a surface-coloured ring. Shot flag `portraits=none` forces the monogram.
- **Gap filled:** Avatar fallback colour per person.

### Logo
- The interim two-ring `Mark` was replaced by the brand agent's `ui/Logo.tsx` (Deskmates mark) in the sidebar header; `Mark.tsx` and its CSS were removed.

### `Desks` (`ui/Desks.tsx`), round two
- **What:** `<Desks people?={{ id, name, portraitUrl }[]} size?={number} onAdd?={() => void} />`. The mark at human scale: a two-by-two `Grid` of `Center` tiles (`data-am-desk="empty|filled|add"`), tile 100 / gap 13 of 213 (gap 6.1 %), 30 % corner radius (closest CSS to the superellipse), the handle as `::after` (42 x 9, 3.5 above centre). Empty desks are the soft tint of their brand slot; a filled desk is the person's tint at full brand strength (`--am-tint-line-*`) with the darker handle (`--am-tint-handle-*`), so the seeded team reads as the logo. `onAdd` turns the first empty desk into an `IconButton` ("Hire a deskmate").
- **Used in:** first run (empty, 144 px), hire dialog team-full state (filled, 64 px). Two of the three allowed places.
- **Gap filled:** no capacity or slot motif in Astryx.

### `DeskLoader` (`ui/DeskLoader.tsx`), round two
- **What:** `<DeskLoader size?={number} label?={string} />`. The mark's four tiles at exact brand colours breathing clockwise (opacity 1 to 0.35, 1.2 s, 0.3 s stagger), static under reduced motion; `role="status"` with the label as its name.
- **Used in:** app start ("Opening Deskmates"), hire step 2 while finding a candidate, a desktop starting ("Starting Priya's desktop"); the stage agent uses it for "Calling Maya".
- **Gap filled:** Spinner is the only indeterminate indicator.

### Round-two hooks
| Hook | On | What it does |
| --- | --- | --- |
| `data-am-run="text|other|cont"`, `data-am-avatar-gap` | `ChatMessage`, `Center` | The face sits beside the last bubble of a run (bottom-aligned, lifted off the time line by one supporting line); a run's trailing activity or approval continues in a second `ChatMessage` with an empty avatar slot, 4 px below |
| composer `:has()` rules | `.astryx-chat-composer` | One-line composer anchored only on Astryx's documented classes; falls back to the stock layout if they change |
| `data-am-identity-stack`, `data-am-identity="in|out"` | `VStack` | Hire Shuffle: faces cross-fade in one grid cell after the next face is preloaded; text swaps without ghosting |
| `data-am-arrive` | `ListItem` | A newly hired row rises in once |
| `data-am-page`, `data-am-page-header` | Team `VStack`, header `HStack` | Team column shares the thread's centred column; header text aligns to it |
| `data-am-share`, `data-am-share-fill` | `HStack`, `Center` | Team: each person's hours against the busiest, a 56 x 4 bar in their tint |
| `data-am-stage-root`, `data-am-leaving` | `VStack` in `App.tsx` | The stage stays mounted 230 ms after a call ends and fades out |
| platform rules | chrome classes | `user-select: none` on chrome, arrow cursor on controls, thin scrollbars, antialiased text |
| `::selection`, `caret-color` | thread | Brand-blue selection wash; ink caret |

### Styling hooks (attributes on plain Astryx components, rules in `ui/styles/app.ts`)
| Hook | On | What it does | Gap |
| --- | --- | --- | --- |
| `data-am-thread` | `VStack` around `ChatLayout` | Centred 768 px reading column; ink manager bubbles (`--color-accent` / `--color-on-accent`); employee bubbles a 7 % ink wash that works in dark; 2 px run spacing; 62ch bubble cap; one-line composer with the send button inline; newest bubble rises 6 px and fades in 175 ms | ChatMessageBubble has no sender colour variant; ChatComposer has no single-line layout |
| `data-am-approval` | `Section variant="transparent"` | Hairline card (`--color-border-emphasized`, `--radius-container`) instead of a grey slab | none (composition) |
| `data-am-activity`, `data-am-plan` | `Collapsible`, `VStack` | Tight checklist rows; one 16 px icon column so check, spinner and circle never shift the text | Item has no fixed start-slot width |
| `data-am-people`, `data-am-row` | `List`, `ListItem` in `SideNav` | 2 px between rows; selected row lifts to paper with a hairline, hover stays a wash; colour cross-fade on state change | ListItem's selected and hover states are both grey washes |
| `data-am-portrait-size`, `--am-cut` | `Avatar` (via `Portrait`) | 10 px presence dot at 40 px with a 2 px ring in the colour behind it (`--am-cut`: sidebar body, paper on the selected row) | AvatarStatusDot only takes three variants; StatusDot has no cut-out ring |
| `.astryx-status-dot[data-variant=warning]` | StatusDot | Needs-you dot uses the strong amber fill (`--color-warning`) instead of the olive text colour | Theme maps the warning icon colour to dark yellow |
| `data-am-screen` | `VStack` around `SpaceView` | Hairline frame and container radius so a dark desktop never bleeds into the panel; ink ring while you are in control; dashed paper frame when off or lent | none (composition) |
| `data-am-panel` | `LayoutPanel` | Desktop panel slides in 230 ms | LayoutPanel has no entrance motion |
| `data-am-quiet` | `Banner status="info"` | Desktop off and paused read as a quiet muted band, not a blue alert; stuck keeps its red | Banner has no neutral status |
| `data-am-tile` | `Center` | One size of muted rounded tile for the hire role icons | no icon-tile primitive |
| `data-am-identity` | `VStack` (keyed by candidate) | Hire step 2: face and name cross-fade on Shuffle | no cross-fade primitive |
| `data-am-num`, `.astryx-timestamp` | Text, Timestamp | Tabular figures for times, durations, counts, money | Timestamp has no tabular option |
| `data-am-synced` | `HStack` | Quiet underlined "Open traces" link in the Databricks synced line | none |

Every motion sits inside `@media (prefers-reduced-motion: no-preference)` and uses `--duration-fast*` and `--ease-entrance`.

## Stage agent (D2): the call and meeting stage

All rules in `ui/styles/stage.ts`, scoped under `[data-am="stage"]` (the stage's `AppShell`, inside the nested dark `Theme`), tokens only; every transition inside the reduced-motion guard.

### `StageTile` (`ui/StageTile.tsx`)
- **What:** the one frame for every tile on the stage: `SelectableCard` (when pressable) or `Card`, `kind="face" | "desktop"`, `tint`, `hasRing`, `hasMedia`, `isDimmed`, `chip`. Draws a 1 px hairline (`::before`, in the person's `--am-tint-line` for faces, a 10 % ink line for desktops) and the 2 px speaking ring (`::after`, `--color-accent`, fades in `--duration-fast`) **above** video, photo and canvas; container radius, clipped; desktops letterbox on `--color-background-body`. No photo: the person's tint as a dim wash (`--am-tint-line` 34 % into body) and the monogram as a darker mark on a bright soft disc of the same tint (the logo's coloured squares with their dash). Photo or video: a short eased gradient scrim under the label only.
- **Gap filled:** Astryx has no media tile: SelectableCard's ring is an inset shadow that video covers, there is no per-person colour, and Overlay's scrim is a solid band.

### `StageChip` (`ui/StageChip.tsx`)
- **What:** the label in a tile's corner: name in label weight, one supporting word (role in a meeting, or "Speaking", "Thinking", "Listening", "Joining", "Couldn't join"), optional spinner before and action after ("Ask again", the spotlight's close). Plain text on a face (over the scrim or the wash); a small blurred capsule on a desktop, so the dock is not darkened by a full-width scrim. Truncates with an ellipsis.
- **Gap filled:** Token is a tag with one tone and no secondary text.

### `ControlPill` (`ui/ControlPill.tsx`)
- **What:** a capsule `HStack` (`role="toolbar"`) holding the call controls; buttons inside become 40 px circles (`--size-element-lg` + one step); End is the only coloured control (error mixed into body, primary text) after a divider gap.
- **Gap filled:** no pill container in Astryx (ux-spec gap G6); Toolbar and Card have fixed radii.

### Styling hooks (attributes on plain Astryx components)
| Hook | On | What it does | Gap |
| --- | --- | --- | --- |
| `data-am="composer"` | `VStack` around `ChatComposer` | One-line type box docked at the bottom of the right column: body laid out as a row with the send button inline, container radius, hairline, input capped at one line | ChatComposer has no single-line layout |
| `data-am="caption"`, `data-am-shown` | `HStack` | The caption line keeps the last words in place and fades them out after silence; name and words share a baseline | no fade-out on unmount |
| `data-am="stage-body"` (keyed by layout) and the stage root | `VStack`, `AppShell` | 230 ms cross-fade when the stage opens and when the layout changes | no cross-fade primitive |
| `data-am="video-layer"`, `data-am-playing` | `VStack` over the still; `<video>` in `media/AvatarVideo` | The live video fades in over the still once frames arrive; still and video share the square framing (`-sq.jpg`), crop (`cover`) and anchor (40 %), so nothing jumps | no media cross-fade |
| `data-am-video` | `<video>` in `AvatarVideo` | `object-position: center 40%` so heads stay whole in 4:3 tiles | AspectRatio `fit` has no anchor |
| `data-am-space` | `Card` in `media/SpaceView` | Transparent, square-cornered inside the tile frame | none (composition) |
| `data-am="stage-top"` | `HStack` | Tabular figures for the call timer | Timer has no tabular option |
| `data-am="inset"` | `VStack` around a small tile laid on a large one | `--shadow-high` so it lifts off the tile under it | none |
| `data-am-picker`, `data-am="people-stack"` | `List`, `HStack` in the summon picker | Reuses the sidebar's `data-am-people` row style; overlapping 24 px portraits with a popover-coloured cut | AvatarGroup cannot take `Portrait` |
