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
