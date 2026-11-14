# 07 · Astryx inventory, screen map, rules and proven toolchain

Author: research sub-agent (Sonnet), 2026-11-14. Single writer of this file. Confidence tags: `verified` = I ran the command or read the file named; `reported` = web or second-hand; `unverified` = inference.
Spike project (scratch, not in repo): `/private/tmp/claude-502/-Users-suhaan-Desktop-imperial-ai-hack/e8cda6e2-1ab7-4114-b736-8a443be0d374/scratchpad/astryx-spike` (may be cleared on reboot; every file that matters is embedded below).

## Summary (10 lines)

1. Astryx 0.7.16 has 174 components and 784 template/block entries (58 page templates); it covers 7 of our 8 screens natively, including a full `Chat*` family (ChatLayout, ChatMessage, ChatMessageBubble, ChatSystemMessage, ChatToolCalls, ChatComposer). `verified` (`npx astryx component`, `template --list`).
2. Gaps: no video/media player, no stable chart, no stat tile, no avatar-bubble "call tile", no presence-aware participant grid, no floating control-bar primitive. Every gap has a composition below. `verified`.
3. Spike passed: Vite 8 + React 19 + TS, `npm run build` in 0.38 s (0.69 s wall), `npx astryx doctor --built .` and `--built dist` exit 0; source purity check says "no raw element, no library icon, no custom styling". `verified`.
4. `doctor --built` only FAILS when the output uses no Astryx at all; everything else (raw `<div>`, inline `style`, `className`, `stylex.create`, imported `.css`, raw `<svg>`, direct icon-library JSX) is a WARNING (exit 0). AGENTS.md says fix everything it flags, so treat warnings as failures. `verified` (read `node_modules/@astryxdesign/cli/api/doctor/built-checks.mjs`, ran a fail case).
5. `<video>` and `<canvas>` are NOT flagged (not in the raw-element list). Host them with `<AspectRatio ratio={16/10} fit="cover">`. `verified`.
6. No StyleX compiler needed for the plain path. Only templates that call `stylex.create` need one; without it the whole app crashes at load ("Unexpected 'stylex.create' call at runtime"). 15 of 58 page templates use StyleX; avoid them. Exact plugin recipe proven as a fallback. `verified`.
7. Dark mode: `<Theme mode="light|dark|system">`; nesting `<Theme mode="dark">` darkens tokens but does NOT paint a background, so wrap the call stage in `AppShell`. Proven. `verified`.
8. Biggest quality win: `AppShell` + `TopNav` (Summon meeting at `endContent`) + `SideNav` holding a `List` of `ListItem` with Avatar, status dot, badge. Looks like a native Mac app. `verified` (screenshot).
9. Figma: no official Astryx Figma kit or tokens export found (site, GitHub, search). Cheapest path: `npx astryx experimental render` to static HTML, then Figma MCP html-to-figma / send-code-to-figma. `verified` no kit (3 sources); the render step is `verified`, the Figma import is `unverified`.
10. Electron: recommend electron-vite 6.0.0 (peer vite ^6 || ^7 || ^8, Node ^20.19 || >=22.12) over Forge plugin-vite 8.0.1 (still labelled experimental). `reported` + `verified` via `npm view`; not run.

---

## 1 · Inventory (task A)

### 1.1 CLI facts (`verified`)

- `npx astryx help` lists: init, component, docs, blog, swizzle, gap-report, template, upgrade, theme, integration, hook, discover, search, build, doctor, experimental, manifest. Flags worth using: `--dense` (token-efficient component docs), `--json`.
- `component <Name> --json` returns `data.props[]` (name, type, default, description). I used it to build the tables below.
- Docs topics: authoring, calendars, cli, foundations, global, guides, internationalization, layout, migration, styling, styling-libraries, tokens, typography; leaf topics: color, elevation, getting-started, icons, illustrations, is-my-code-good, motion, principles, shape, spacing, styling-overview, theme, use-a-theme, use-integrations, working-with-ai. Read `docs layout` (scaffold, structure, headers-and-footers, side-panels, layout-spacing, responsive) before building any page.
- Packages on npm (`npm view`): `@astryxdesign/core|theme-neutral|cli|build|richtext` at 0.7.16 stable. `@astryxdesign/charts` and `@astryxdesign/lab` have only `0.0.0-bootstrap.0` as `latest`; charts exists only as `0.7.17-canary.*`.
- Other first-party themes (`docs use-a-theme`): Neutral (Figtree), Butter, Chocolate, Gothic (dark only), Matcha, Stone, Y2K. Install `@astryxdesign/theme-<name>`, then `npx astryx theme add <slug>`.
- App wiring (as in AGENTS.md) works exactly as stated: `import reset.css`, `astryx.css`, `<Theme theme={themes[defaultThemeSlug]}>` from `@astryxdesign/core/theme` and the repo's `astryx-themes.js`.

### 1.2 Page templates (all 58; `npx astryx template --list --type page`)

Doctor findings and StyleX use were measured by scaffolding every page template into a scratch dir and running the same scan code doctor uses (`scanBuilt`). `verified`.

Full per-template table is in section 3.6 (58 rows). Summary: 10 templates have 0 findings and no StyleX (blank, contact-form, dashboard-composition, form-wizard-dialog, settings, shell-nav, shell-side-nav, table, table-grouped, table-page); 15 need StyleX; the rest carry 1 to 24 raw-element/style findings.

Notes: scaffolded templates import `@heroicons/react` (not in our package.json; install `@heroicons/react@^2.2.0`), some import `lucide-react` or `recharts` (extra deps). Heroicons passed into `Icon icon={X}` are fine for doctor; `<XIcon/>` as a JSX tag is flagged. Astryx's own templates contain raw `<div style>` (messaging-shell has 24 findings), so a template is a starting point, not a pass.

### 1.3 Build-kit output per screen (`npx astryx build "<idea>"`, `verified`)

| Screen idea | Template named | Blocks / components suggested |
| --- | --- | --- |
| App shell, sidebar of contacts, top-right primary button | shell-side-nav (others: shell-nav, table-inbox) | AppShellSideNavOnly, ButtonWithEndSlot, Avatar, Toast, Drawer |
| iMessage-style thread + side panel with video and checklist | ai-chat (others: table-inbox, form-two-column) | ChatMessageListShowcase, ListItemWithMetadata, Drawer, CheckboxList |
| Hire flow dialog wizard | form-wizard-dialog | DialogFormDialog, DialogShowcase, AlertDialog |
| Profile and settings | settings (others: settings-sidebar, settings-dialog) | SwitchWithDescription, SegmentedControlShowcase, Field, Switch |
| Call screen, dark stage, tiles, control bar, transcript | ai-chat (poor match) | Drawer, Lightbox, GridDashboardLayout. No template fits: see screen map |
| Summon picker | shell-top-nav (part of a page) | DialogFormDialog, MultiSelector, ComplexSelector |
| Team insights | dashboard (others: table-page, detail-page) | recharts-based blocks |
| Toasts, empty/loading/error, command search | shell-top-nav | CommandPalette*, Banner, ChatToolCalls |

### 1.4 Search results (`npx astryx search <q>`, top hits only, `verified`)

sidebar: AppShell, SideNav, shell-side-nav, Drawer, MobileNav, useResizable. navigation: AppShell, Breadcrumbs, SideNav, TabList, TopNav. app shell: AppShell, blank, messaging-shell, shell-nav, shell-side-nav, shell-top-nav. chat/message/bubble/conversation: ChatMessage, ChatMessageBubble, ChatMessageList, ai-chat, ai-chat-landing, ChatComposer*. composer: ChatComposer, ChatComposerInput, ChatComposerDrawer. text input: TextInput, TextArea. avatar: Avatar, AvatarGroup, AvatarStatusDot. presence/status: StatusDot, AvatarStatusDot, Badge. badge: Badge. list/item: List, ListItem, Item. table: Table (+ hooks). dialog/modal: Dialog, AlertDialog, BottomSheet, CommandPalette. drawer/sheet: Drawer, BottomSheet. wizard/stepper: Stepper, Step, form-wizard*. tabs: Tab, TabList, TabMenu. segmented control: SegmentedControl, ToggleButton. switch: Switch. select: Selector, ComplexSelector, MultiSelector. radio: RadioList, SelectableCard. card/tile: Card, ClickableCard, SelectableCard, Grid. stat: **no stat component** (Card + Text; dashboard templates use a local MetricCard). chart: **none stable** (templates import recharts). toast/notification: Toast, useToast, Banner. empty state: EmptyState. skeleton/spinner: Skeleton, Spinner. tooltip: Tooltip, InfoTip, HoverCard. menu: DropdownMenu, ContextMenu, MoreMenu. popover: Popover. command: CommandPalette (+ Input, List, Item, Group, Empty, Footer). video/media: **no player**; AspectRatio, Overlay, Lightbox, MediaTheme. split pane/resizable: useResizable, ResizeHandle, LayoutPanel. toolbar: Toolbar, IconButton, OverflowList. icon: Icon, IconButton. checklist: CheckboxList. progress: ProgressBar, Stepper, Spinner. tag: Token, Tokenizer, Badge. dark mode: Theme `mode`, useTheme, MediaTheme.

### 1.5 Component reference (task A, `verified` from `component <Name> --json`)

All form controls are controlled (`value` + `onChange`). Spacing steps (padding/gap): `0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10`. `SizeValue = number | string` (so `width={320}`, `height="100%"`, `maxWidth="40rem"` are all legal props). Every component also accepts `xstyle` (needs StyleX compile), `className`, `style` (both flagged by doctor: do not use).

**Frame and layout**

| Component (import path) | Key props |
| --- | --- |
| AppShell (`core/AppShell`) | `topNav`, `sideNav`, `mobileNav`, `banner`, `children`, `contentPadding` (spacing step, default 0), `height 'fill'\|'auto'` (default fill), `variant 'wash'\|'surface'\|'section'\|'elevated'` (default elevated). Sets the viewport-height root. |
| TopNav (`core/TopNav`) | `heading` (use `TopNavHeading heading logo`), `startContent`, `centerContent`, `endContent`, `label`. Sub: TopNavItem, TopNavMenu, TopNavMegaMenu. |
| SideNav (`core/SideNav`) | `header`, `topContent`, `children`, `footer`, `footerIcons`, `collapsible bool\|{defaultIsCollapsed,isCollapsed,onCollapsedChange}`, `resizable bool\|{defaultWidth,minWidth,maxWidth,autoSaveId,onWidthChange}`, `handleRef`. Sub: SideNavSection `{title REQ, subtitle, endContent, isHeaderHidden}`, SideNavItem `{label REQ, icon, selectedIcon, isSelected, href, onClick, endContent, actions, children, collapsible, size sm\|md\|lg}`, SideNavHeading `{heading REQ, icon, headingHref, subheading, menu, headerEndContent}`. Children can be any node (I put a `List` inside). |
| Layout (`core/Layout`) | slots `header`, `start`, `content`, `end`, `footer`; `height 'fill'\|'auto'`, `contentWidth`, `padding`, `children`. Sub: LayoutHeader `{hasDivider, height, padding, label}`, LayoutContent `{padding, isScrollable}`, LayoutFooter `{hasDivider, height, padding}`, LayoutPanel `{width, padding, hasDivider, isScrollable, resizable}`. Also exports Stack, StackItem, HStack, VStack, Card, Section. |
| VStack / HStack (`core/VStack`, `core/HStack`) | `gap`, `padding*`, `width`, `height`, `maxWidth`, `minHeight`, `hAlign`, `vAlign`, `justify`, `align`, `wrap`, `isScrollable`, `as`. VStack hAlign `start\|center\|end\|stretch`; HStack hAlign `start\|center\|end\|between\|around\|evenly`. |
| StackItem (`core/Stack`) | `size 'static'\|'fill'`, `isScrollable`, `crossAlignSelf`. |
| Grid / GridSpan | Grid `{columns number\|{minWidth,max,repeat 'fill'\|'fit'}, gap, rowGap, columnGap, rowHeight, align, justify, width, height, maxWidth}` (no `padding`: wrap in VStack/LayoutContent). GridSpan `{columns number\|'full', rows}`. |
| Card | `variant 'default'\|'transparent'\|'muted'\|'blue'\|'cyan'\|'gray'\|'green'\|'orange'\|'pink'\|'purple'\|'red'\|'teal'\|'yellow'`, `elevation none\|low\|med\|high`, `padding`, `width`, `height`, `maxWidth`, `minHeight`. |
| Section | `variant 'section'\|'transparent'\|'muted'`, `dividers ['top'\|'bottom'\|'start'\|'end']`, `padding*`, `width`, `height`. |
| Center | `axis both\|horizontal\|vertical`, `width`, `height`, `padding*`, `isInline`. |
| Divider | `orientation`, `label`, `variant subtle\|strong`, `isFullBleed`. |
| ScrollableArea | `axis`, `label REQ`, `width`, `height`, `maxWidth`, `padding*`. |
| Collapsible | `trigger REQ`, `defaultIsOpen`, `isOpen`, `onOpenChange`, `chevronPosition`. |
| useResizable + ResizeHandle (`core/Resizable`) | `useResizable({defaultSize,minSize,maxSize,collapsible,snaps})` returns `{size, props, isCollapsed, expand()}`; `<ResizeHandle direction isReversed hasDivider resizable={r.props} label />`. Put the handle next to a `LayoutPanel width={r.size}`. `LayoutPanel resizable` accepts only that hook's output (not a plain object; I hit a type error). |
| useMediaQuery (`core/hooks`) | `useMediaQuery('(max-width: 768px)')`. |

**Chat family** (`core/Chat`)

| Component | Key props |
| --- | --- |
| ChatLayout | `composer REQ`, `children REQ`, `emptyState`, `scrollButton`, `scrollRef`, `density compact\|balanced\|spacious`. Root is `flex:1; min-height:0` so it must sit directly in a VStack with a definite height (not inside a StackItem; I hit the overflow bug, see Errors). |
| ChatMessageList | `density`, `gap`, `align top\|bottom`, `isStreaming`, `emptyState`, `scrollToTopAction`. |
| ChatMessage | `sender 'user'\|'assistant'\|'system' REQ`, `avatar`, `name`, `metadata`, `density`. Sender sets alignment and bubble colour. |
| ChatMessageBubble | `variant 'filled'\|'ghost'`, `name`, `metadata`, `group 'first'\|'middle'\|'last'`, `width`. Children can be any node (I put Approve/Deny buttons in one). |
| ChatMessageMetadata | `timestamp`, `footer`, `status 'sending'\|'sent'\|'delivered'\|'read'\|'error'` (read receipts). |
| ChatSystemMessage | `variant 'default'\|'divider'`, `icon`, `children REQ`. Use for quiet activity rows ("Opened Figma") and date dividers. |
| ChatToolCalls | `calls REQ` of `{name, status 'pending'\|'running'\|'complete'\|'error', target, duration, node, additions, deletions, stats, errorMessage, key, resultDetail}`, `label`, `isExpanded`, `defaultIsExpanded`. One call renders inline; several collapse to a summary row. |
| ChatComposer | `onSubmit REQ (value)=>void`, `placeholder`, `isDisabled`, `onStop`, `isStopShown`, `density`, `elevation`, `drawer`, `headerActions`, `headerContext`, `input`, `footerActions`, `sendActions`, `sendButton`, `status {type,message}`. Sub: ChatComposerInput (triggers/mentions, `onFiles`), ChatSendButton, ChatDictationButton (needs `useSpeechRecognition` return), ChatComposerDrawer. |

**People, status, lists**

| Component | Key props |
| --- | --- |
| Avatar | `src`, `fallbackSrc`, `name` (initials fallback and a11y), `size 'xsm'(20)\|'sm'(24)\|'md'(36)\|'lg'(48)\|'xl'(128)\|16\|20\|24\|32\|36\|40\|48\|60\|64\|72\|96\|128\|144\|180`, `shape circle\|rounded\|square`, `status` (node), `tooltip`, `onClick`/`href`. |
| AvatarStatusDot | `variant 'success'\|'neutral'\|'error'`, `label`. Goes into `Avatar status`. |
| StatusDot | `variant 'success'\|'warning'\|'error'\|'accent'\|'neutral' REQ`, `label REQ`, `isPulsing`, `tooltip`. |
| AvatarGroup | `size`, `shape`, children Avatars; sub `AvatarGroupOverflow`. |
| Badge | `label REQ`, `variant neutral\|info\|success\|warning\|error\|blue\|cyan\|green\|orange\|pink\|purple...`, `icon`. House rule: counts only. |
| Token | `label REQ`, `size`, `color`, `icon`, `onRemove`, `onClick`. For tags (persona traits). |
| List / ListItem | List `{density, hasDividers, edge padded\|flush\|outset\|bleed, header, reorderable}`; ListItem `{label REQ, description, startContent, endContent, onClick, href, isSelected, isDisabled, align center\|start\|first-line, swipeActions}`. |
| Item | `label REQ`, `startContent`, `description`, `endContent`, `density`, `labelLines`, `descriptionLines`, `layout stacked\|inline`, `isSelected`, `isHighlighted`, `onClick`. |
| Timestamp | `value REQ (ISO or ms)`, `format 'relative'\|'relative_short'\|'auto'\|'date'\|'time'\|...`, `isLive`, `type`, `color`. |
| Timer | `startTime`, `format 'elapsed'\|'clock'` (call duration). Does not re-render per tick. |

**Actions, input, feedback**

| Component | Key props |
| --- | --- |
| Button | `label REQ`, `variant 'primary'\|'secondary'\|'ghost'\|'destructive'`, `size sm\|md\|lg`, `icon`, `isIconOnly`, `endContent`, `isLoading`, `isDisabled`, `tooltip`, `onClick`, `clickAction` (async), `href`, `width`. |
| IconButton | `label REQ`, `icon REQ`, `variant`, `size`, `tooltip`, `onClick`, `isLoading`. |
| ToggleButton / ToggleButtonGroup | `label REQ`, `isPressed`, `onPressedChange`, `icon`, `pressedIcon`, `isIconOnly`, `size`. Mute and captions toggles. |
| ButtonGroup, Toolbar | Toolbar `{label REQ, startContent, centerContent, endContent, size, gap, variant, dividers}`. |
| SegmentedControl / Item | `value`, `onChange`, `label REQ`, `size`, `layout hug\|fill`; Item `{value, label, icon, isLabelHidden}`. Permission preset. |
| Switch | `label REQ`, `value REQ (bool)`, `onChange`, `description`, `size`, `labelPosition`, `labelSpacing hug\|spread`, `isLoading`, `changeAction`. |
| RadioList / RadioListItem | RadioList `{label REQ, value, onChange, orientation, description}`; item `{value, label, description, startContent, endContent}`. |
| CheckboxList / CheckboxListItem | `{label REQ, value string[], onChange, density, hasDividers, description}`; item `{value, label, description, endContent, isChecked, onCheck, isDisabled}`. Multi-select picker and plan checklist. |
| SelectableCard | `{label REQ, isSelected REQ, onChange REQ, variant, padding, width, height}`. Role preset tiles. |
| Selector / MultiSelector / Typeahead | Selector `{label REQ, options REQ, value, onChange, hasSearch, renderOption, renderValue, variant input\|secondary\|ghost, startIcon}`; SelectorOption `{label, icon, description, endContent}`. |
| TextInput | `{label REQ, value REQ, onChange(value), size, isLabelHidden, description, startIcon, hasClear, status, onEnter, placeholder, width}`. |
| TextArea | `{label REQ, value REQ, onChange(value), rows, maxLength, description, status}`. |
| FormLayout, Field | FormLayout `{direction vertical\|horizontal\|horizontal-labels}`; Field wraps custom controls `{label REQ, inputID REQ}`. |
| Slider, NumberInput | exist (not read in detail). |
| Dialog / DialogHeader | Dialog `{isOpen REQ, onOpenChange REQ, width (default 400), maxHeight, variant 'standard'\|'fullscreen', purpose 'info'\|'form'\|'required', padding, isInline}`; DialogHeader `{title, subtitle, onOpenChange, startContent, endContent, hasDivider}`. Compose with Layout (header/content/footer). |
| AlertDialog | `{isOpen, onOpenChange, title, description, actionLabel, onAction, cancelLabel, actionVariant, isActionLoading}` (fire an employee, reset desktop). |
| Drawer / DrawerHeader | `{isOpen, onOpenChange, label REQ, side start\|end, width, hasScrim, purpose}`. Floats over content (does not reflow). For a docked side panel use a LayoutPanel. |
| Popover | `{isOpen, onOpenChange, content, placement, width, label, hasAutoFocus}` wrapping a trigger. |
| Tooltip / InfoTip / HoverCard | `<Tooltip content placement>child</Tooltip>`. |
| DropdownMenu / MoreMenu / ContextMenu | DropdownMenu `{button {label}, items REQ, placement, alignment, header, footer}` or compound `DropdownMenuItem {label, icon, description, onClick, variant default\|destructive}`; MoreMenu `{items REQ, label, variant, size}`. |
| CommandPalette | `{isOpen, onOpenChange, searchSource REQ, renderItem, emptySearchText, label, width, maxHeight}`; parts: Input, List, Item, Group, Empty, Footer. |
| Toast / useToast (`core/Toast`) | `const toast = useToast(); toast({body, type 'info'\|'error', isAutoHide, autoHideDuration, endContent, uniqueID, collisionBehavior})`. Self-mounts a viewport; do not call in the component that renders `LayerProvider`. |
| Banner | `{status 'info'\|'warning'\|'error'\|'success' REQ, title REQ, description, isDismissable, endContent, container card\|section, collapsible}`. |
| EmptyState | `{title REQ, description, icon, actions, isCompact, headingLevel}`. |
| Skeleton | `{width, height, radius, index}`. |
| Spinner | `{size sm\|md\|lg\|xl, label, shade}`. |
| ProgressBar | `{label REQ, value, max, hasValueLabel, variant accent\|success\|warning\|error\|neutral, isIndeterminate, marks}`. |
| Stepper / Step | Stepper `{activeStep, orientation, onStepClick, density}`; Step `{step REQ, label REQ, description, status, indicator, isOptional, endContent}`. |
| TabList / Tab | `{value REQ, onChange REQ, size, layout, hasDivider}`; Tab `{value, label, icon, endContent}`. |
| Table | `{data, columns [{key, header, width (pixel(n)\|proportional(n)), align, renderCell}], idKey, density, dividers, isStriped, hasHover, textOverflow, plugins}`; hooks useTableSelection, useTableSortable, useTablePagination, useTableFiltering. |
| MetadataList | key/value facts for the profile page. |
| Text / Heading | Text `{type body\|large\|label\|supporting\|code\|display-1..3, size 4xs..4xl, color primary\|secondary\|disabled\|placeholder\|accent, weight, maxLines, display}`; Heading `{level 1-6 REQ, type, weight, color, maxLines}`. |
| Icon | `{icon REQ (semantic name or SVG component), size xsm\|sm\|md\|lg, color primary\|secondary\|accent\|success\|error\|warning\|inherit, label}`. Only ~25 semantic names; use `@heroicons/react` components via `icon={XIcon}`. |
| Media | AspectRatio `{ratio REQ (number, e.g. 16/10), shape rectangle\|ellipse, fit cover\|contain\|center}`; Overlay `{content REQ, children, showOn always\|hover\|focus\|hover-or-focus, scrim dark\|light\|false, position fill\|bottom\|top, align start\|center\|end}`; MediaTheme `{mode dark\|light\|auto\|off}` (local inversion, does not paint a background); Lightbox `{isOpen, onOpenChange, media}`; Thumbnail. |
| Theme (`core/theme`) | `{theme REQ, mode 'light'\|'dark'\|'system' (default system), children}`. |

---

## 2 · Screen map (task B)

Scaffold pattern (all commands `verified` to run; paths are relative to the project root and must stay inside it): `npx astryx template <id> <dir> --type page` writes `<dir>/page.tsx`; blocks: `npx astryx template <BlockName> <file.tsx>`. Install `@heroicons/react@^2.2.0` first (templates import it). In our repo the renderer will live under `src/renderer/src/` (see Electron layout); substitute that path.

General rules for every screen: root is `AppShell` (viewport height; `contentPadding={0}` when children bring their own layout). Never put `<div>`/`<span>`/`style`/`className`. Size via props (`width`, `height`, `maxWidth` accept numbers or CSS strings on VStack/HStack/Grid/Card/Section/Center/LayoutPanel/Dialog/Drawer). Portraits are `Avatar` (circle; `shape="rounded"` for squarish).

### Screen 1 · App shell

- Start: `npx astryx template shell-side-nav src/renderer/src/app --type page` (0 findings, no StyleX) and keep its `AppShell sideNav={<SideNav collapsible resizable>}` frame. Add `topNav` (from block `AppShellTopNavWithSideNav`: `npx astryx template AppShellTopNavWithSideNav src/renderer/src/AppShellFrame.tsx`; note that block uses `style` and a heroicon tag, so rewrite those bits).
- Tree (proven in spike file `agent-shell-b.tsx`, screenshot looked native): `AppShell contentPadding={0} topNav={<TopNav label heading={<TopNavHeading heading="Agent Manager"/>} endContent={<Button variant="primary" label="Summon meeting" icon={...}/>}/>} sideNav={<SideNav resizable={{defaultWidth:300,minWidth:240,maxWidth:420}} collapsible><SideNavSection title="Team" isHeaderHidden><List density="spacious"><ListItem label description startContent={<Avatar size="lg" status={<AvatarStatusDot/>}/>} endContent={<Badge/>} isSelected onClick/></List></SideNavSection></SideNav>}>` then the conversation as children.
- Key props: SideNav `resizable` persists width with `autoSaveId`; ListItem `description` is the last-message preview (single line, truncates); `endContent` for unread `Badge variant="info"` (+ `Timestamp format="relative_short"`).
- Alternative frame (also proven, `agent-shell.tsx`): `Layout header/start/content/end` with `LayoutPanel width={300}`. Use this when you want a top bar spanning the sidebar.
- Gaps: SideNavItem has `icon` only (no avatar), so rows must be `ListItem`s inside the SideNav; there is no "typing" or "unread dot" primitive (use `StatusDot isPulsing` or Badge). SideNav's collapse chevron appears at the bottom-left.
- Electron: the title-bar drag region needs CSS (`-webkit-app-region: drag`), which doctor would flag if written in source. Inject it from the main process with `webContents.insertCSS` (`unverified`, not run).

### Screen 2 · Conversation with live-desktop side panel

- Start: `npx astryx template ai-chat src/renderer/src/pages/conversation --type page` (9 findings: inline `style`, `className`, a `<style>` block; no StyleX). Take its structure (ChatLayout + ChatComposer + resizable end panel via `useResizable`/`ResizeHandle`) but swap each flagged item for props. The spike's `agent-shell.tsx` is a doctor-clean version (below).
- Tree (spike, `verified` render + doctor clean): `Layout header start content end` → content `VStack height="100%"` → `HStack` header (Avatar, name/role `Text`s, `ToggleButton "Live desktop"`, `IconButton` call) → `Divider` → `ChatLayout composer={<ChatComposer onSubmit/>}` → `ChatMessageList` with `ChatSystemMessage variant="divider"` (date), `ChatMessage sender="user"` + `ChatMessageBubble metadata={<ChatMessageMetadata timestamp status="read"/>}`, `ChatSystemMessage icon` (quiet activity row "Opened Figma"), `ChatMessage sender="assistant" avatar` + `ChatToolCalls`, and a permission request as a bubble containing `VStack` of `Text` + `HStack` of `Button "Approve"` (primary) and `Button "Deny"` (secondary).
- End panel (toggle): `<ResizeHandle isReversed hasDivider resizable={panel.props}/> <LayoutPanel width={panel.size}>` containing `Card variant="muted" padding={0}` > `AspectRatio ratio={16/10} fit="cover"` > `<video muted autoPlay playsInline>` (or `<canvas>`), then `ProgressBar` + `CheckboxList` for the plan.
- Gaps and fixes: no permission-request component (compose as above; a `Banner status="warning"` with `endContent` buttons also works above the composer); empty `AspectRatio` is transparent, so wrap in a muted `Card` or it reads as a hole; `ChatToolCalls` with 2+ calls collapses to a summary row ("bash ... 2"), pass `defaultIsExpanded` if you want it open; `ChatDictationButton` is not needed (voice is on the call screen).
- Flag: `<video>`/`<canvas>` raw elements, doctor does NOT flag them (see section 3).

### Screen 3 · Hire flow

- Start: `npx astryx template form-wizard-dialog src/renderer/src/pages/hire --type page` (0 findings). It already has `Center` + `Dialog width={620}` + `Layout` + `DialogHeader` + `Stepper density="compact"` + `FormLayout` + `RadioList` + `Banner`.
- Tree: step 1 "Role": `SelectableCard` grid (`Grid columns={{minWidth:180}}`) for presets (web developer, marketing, researcher...) plus a `TextArea "Describe a role"` (or `SegmentedControl` Preset / Describe); step 2 "Preview": `Avatar size="xl"` (generated portrait, `src`), `Heading` name, `Text` role, `Token`s for personality traits, `Selector` for voice, `Skeleton` + `Spinner` while generating; actions in `LayoutFooter`: `Button variant="primary" label="Hire"`.
- Props: `Dialog purpose="form"` (blocks Escape for required flows use `purpose="required"`); `Stepper activeStep`; `Button isLoading` while the portrait generates.
- Gaps: none. Avatar `size="xl"` is 128 px; custom larger sizes up to 180 are allowed (`size={180}`).

### Screen 4 · Employee profile and settings

- Start: `npx astryx template settings src/renderer/src/pages/profile --type page` (0 findings; `settings-sidebar` has 17 findings, `settings-dialog` needs StyleX).
- Tree: `Layout` + `LayoutContent` + `VStack`: header `Avatar size="xl"` + `Heading` + `Text`; persona `FormLayout` (`TextInput` name, `TextArea` personality, `Selector` voice); permissions `SegmentedControl` or `RadioList` with 3 presets (e.g. Ask always / Balanced / Autonomous, each a `RadioListItem` with `description`) followed by `Switch label description` rows for fine-grained toggles; desktop section: `Button` "Restart", `Button` "Reset" opening an `AlertDialog actionVariant="destructive"`, and a `Switch` or `Button` for "Grant main screen access" (one-time or timed: a `Selector` with durations).
- Gaps: none; `MetadataList` fits read-only facts (uptime, Cua Space id).

### Screen 5 · Call screen (one-to-one and group)

- No template fits. Start from `blank` (`npx astryx template blank src/renderer/src/pages/call --type page`, 0 findings) and use the proven spike `call-stage.tsx`.
- Tree: `<Theme theme mode="dark"><AppShell contentPadding={0}><Layout header footer content end>`: header `HStack hAlign="between"` (title, `Timer`); content `VStack padding={4}` > `Grid columns={{minWidth:240,repeat:'fit'}} gap={3}` of tiles; each tile `Card variant="blue"` (active speaker) or `"muted"` `padding={0}` > `Overlay position="bottom" align="start" content={<Text size="sm">{name}</Text>}` > `AspectRatio ratio={16/10}` > `Center height="100%"` > `Avatar size={128}`; live-desktop tile = same Card > `AspectRatio ratio={16/10} fit="cover"` > `<canvas>`/`<video>`; control bar = `LayoutFooter hasDivider` > `HStack hAlign="center"` of `ToggleButton isIconOnly` (mute, captions), `IconButton` (switch layout), `Button variant="destructive" label="Leave"`; captions drawer = `end={<LayoutPanel width={320}>}` toggled by captions state (or `Drawer side="end" hasScrim={false}` to float).
- Verified behaviours: dark tokens apply; background is painted only because `AppShell` sits inside the dark `Theme`; avatars, cards, toggles and the red destructive button all render correctly in dark (screenshot).
- Gaps: (a) no video tile, so Card + AspectRatio + raw `<video>`; (b) no floating control bar: `Overlay` sizes to its own children, so it cannot pin to the window bottom (I tried, it landed at the end of the tile grid); use `LayoutFooter` (docked bar, looks right); (c) speaking highlight is a `Card variant` swap (blue vs muted), there is no ring or pulse; add `StatusDot isPulsing` in the tile name overlay if you want motion; (d) the call replaces the app root (conditional render), a nested `Theme` inside `Dialog variant="fullscreen"` is `unverified` (Dialog likely portals out of the nested Theme).
- Group variant: same Grid; 2 to 4 tiles all fit with `columns={{minWidth:240,repeat:'fit'}}`; for one large tile + filmstrip use `Layout` with `start` panel of small tiles.

### Screen 6 · Summon-meeting picker

- Start: block `npx astryx template DialogFormDialog src/renderer/src/SummonPicker.tsx`; keep `Dialog` + `DialogHeader`.
- Tree (spike, rendered): `Dialog width={420}` > `DialogHeader title="Summon meeting" onOpenChange` > `VStack padding={4}` > `CheckboxList label isLabelHidden value onChange` of `CheckboxListItem value label description endContent={<Avatar size="sm"/>}` + `Button variant="primary" label={\`Call ${n}\`} isDisabled={n===0}`.
- Gaps: CheckboxListItem puts end content on the right, so the portrait is trailing; for a leading portrait use `List` + `ListItem startContent={<Avatar/>} endContent={<CheckboxInput/>}` with `isSelected` (compose; `unverified`). `MultiSelector` is a compact dropdown alternative.

### Screen 7 · Team activity and insights

- Start: `npx astryx template table-page src/renderer/src/pages/insights --type page` (0 findings, no StyleX, no chart deps) for the table; borrow the tile row from `dashboard-composition` (0 findings but imports recharts).
- Tree: `Layout` > `LayoutContent` > `VStack gap={6}`: `Grid columns={{minWidth:200}}` of `Card padding={4}` stat tiles (`Text type="supporting" color="secondary"` label, `Heading level={3}` value) then `Table` (columns key/header/width/renderCell: employee `Avatar`+name, hours, tasks, cost; `ProgressBar` inside a cell for share of budget).
- Chart (gap): three options. (1) No chart: `ProgressBar` rows in a `List` (verified available, zero deps, passes doctor). (2) Official `@astryxdesign/charts` canary, all three packages pinned to the same canary: `npm i @astryxdesign/core@0.7.17-canary.g8d3e010 @astryxdesign/theme-neutral@0.7.17-canary.g8d3e010 @astryxdesign/charts@0.7.17-canary.g8d3e010` and `-D @astryxdesign/cli@0.7.17-canary.g8d3e010`; `import '@astryxdesign/charts/charts.css'; import {Chart, bar, line} from '@astryxdesign/charts'; <Chart data xKey series={[bar('hours'), line('cost')]}/>` rendered bars and a line, doctor purity clean (`verified` in a scratch copy; axes/grid via `ChartAxis`/`ChartGrid` not tried; canary tags are inconsistent: `@canary` for core is g8d3e010 but charts/theme-neutral `@canary` is g0135e03, which has no matching core, so pin exact versions). It changes core from 0.7.16 to a canary for the whole app, so only choose it if insights is a prize screen. (3) Recharts like the templates: extra non-Astryx dependency, needs the user's approval per AGENTS.md.

### Screen 8 · Global states

- Toasts: `useToast()` from `core/Toast`; `toast({body, type:'error'})`; self-mounted viewport (spike used it for Approve/Deny and Call; compiled and rendered without a provider, toast display itself not screenshotted: `unverified`).
- Errors/banners: `Banner status="error" title description endContent`; blocking errors `AlertDialog`.
- Empty: `EmptyState title description icon actions`; loading: `Skeleton` rows and `Spinner label`; both exist and rendered.
- Command or search: `CommandPalette` (`searchSource`) opened with `useHotkeys`; sidebar filter `TextInput startIcon={MagnifyingGlassIcon} hasClear`. Block: `npx astryx template CommandPalettePickerMode ...` (single select).
- Dark/light: `Theme mode` state at the root; `'system'` default follows macOS. See section 3.

---

## 3 · Rules and how to stay inside them (task C)

### 3.1 What `npx astryx doctor --built <path>` checks (`verified`: read `node_modules/@astryxdesign/cli/api/doctor/built-checks.mjs` and ran four cases)

`doctor` (no flag) runs ~30 project diagnostics: Node >= 22.13, core installed and version-aligned with the CLI, theme packages, generated `astryx-themes.js` marker, app imports the theme module, built-theme CSS pairing, theme fonts, peer deps, agent docs, docs readability. In the spike: 19-20 pass, 2 warn, 0 fail.

`--built <path>` (a project folder, a build folder or one HTML file) adds two checks:

1. `built-astryx-usage`: **FAIL** (exit 1) only if the output has no value import from an Astryx package, no Astryx component and no Astryx styles. Passing means Astryx is used at all. Ran on a raw-div app: `fail: 1`. Ran on a real build: ok.
2. `built-astryx-purity`: **WARN** (exit 0) with `file:line` findings. Only works on a **source folder**: `--built dist` reports "Not inspected: 0 source files" and gives a false sense of safety. Always run `npx astryx doctor --built .` (project root) as well as `--built dist`. Findings:
   - Raw elements that have a component: `div span p h1-h6 button a nav aside header main ul ol li input textarea select table tr td th hr dialog details summary` (hidden inputs exempt).
   - Raw `<svg>` (counts once per root) and JSX tags of icon-library components (`<PhoneIcon/>` from `@heroicons/react`, lucide-react, react-icons, tabler, phosphor, feather, MUI icons, fontawesome, radix icons).
   - Any `style={...}` and any `className=` (regex `\bstyle\s*=\s*\{` and `\bclassName\s*=`).
   - Any `stylex.create(` declaration.
   - Any import of a `.css/.scss/.sass/.less` file that is not an Astryx specifier (so `@astryxdesign/core/reset.css` is fine, `./app.css` is flagged).
   - NOT flagged: `<video> <audio> <canvas> <img> <iframe> <form> <label> <section> <article> <footer> <figure>`, `xstyle={...}` props, `Icon icon={HeroIcon}` (component passed as a value), data/aria attributes.
3. Because purity is only a warning, AGENTS.md ("fix everything it flags") is stricter than the tool. Treat any warning in `built-astryx-purity` as a failure; the two permanent theme-fonts / themes warnings are environmental (below).

### 3.2 Rules to follow (from `docs principles rules/anti-patterns` + doctor)

- Components for everything they cover; layout = frame first (`docs layout`); dense data as `Table`/`List` rows; Card only for widgets and settings groups.
- Semantic tokens, not hex or px; colours via `var(--color-*)` only if you must (we never write CSS). `Badge` is for counts and enumerated states; use `StatusDot` or `Token` for status.
- Anti-patterns list: inline styles on raw elements, hardcoded colours/spacing, raw `<a>` (use `Link`), Card around every row, Badge as decoration, inventing props.
- Props first: every layout component takes `gap`, `padding*`, `width`, `height`, `maxWidth`, `minHeight`, alignment. Use them for sizing.

### 3.3 Patterns that pass doctor (all `verified` in the spike unless marked)

| Need | Pattern |
| --- | --- |
| 16:10 media tile (video or canvas) | `<Card variant="muted" padding={0}><AspectRatio ratio={16/10} fit="cover"><video muted autoPlay playsInline aria-label="..."/></AspectRatio></Card>`. `fit` sizes the child (no `style`, no `object-fit`). Pass exactly one child. For a letterboxed screen use `fit="contain"`. `AspectRatio` needs an ancestor with definite width (a fixed `LayoutPanel width` or Grid column is fine). Set the stream with a `ref` and `video.srcObject = stream` (not a style). |
| Fixed-width sidebar | `LayoutPanel width={300} padding={2} hasDivider` or `SideNav resizable={{defaultWidth,minWidth,maxWidth}}`; user-resizable with `useResizable` + `ResizeHandle`. |
| Fixed-width dialog/drawer | `Dialog width={420}`, `Drawer width={400} side="end"`. |
| Full-window root | `AppShell` (`height` defaults to fill = viewport; `contentPadding={0}`). A bare `Layout height="fill"` at the root does not fill the window (root measured 845 px not 768 px until wrapped in AppShell). |
| Full-window dark stage | `<Theme theme mode="dark"><AppShell contentPadding={0}>...`. `Theme` alone gives dark tokens but no background. |
| Overlay on media (name chip, badge, hover actions) | `<Overlay position="bottom" align="start" scrim="dark" content={<Text size="sm">Maya</Text>}>` around the tile. Overlay is only as big as its child. `showOn="hover-or-focus"` for hover controls. |
| Floating bar pinned to the window | Not possible with Astryx primitives (Overlay can't fill the viewport); use a docked `LayoutFooter hasDivider` (spike) or `Drawer hasScrim={false}` for panels. A raw absolutely-positioned element needs `style` (flagged), so do not. |
| Centering | `Center height="100%"` (or `width`). |
| Fixed-height scrolling region | `ScrollableArea label height={400}`; `LayoutContent isScrollable`; `VStack isScrollable height`. |
| Responsive hide | `useMediaQuery('(max-width: 768px)')` and conditional render. |
| Custom CSS if ever unavoidable | `xstyle` with `stylex.create` needs the StyleX plugin (3.6) and is itself flagged by doctor; ask the user before doing it. |

### 3.4 Dark mode (`verified` + `docs use-a-theme`)

- Neutral theme ships light and dark tokens (tuples via `light-dark()`); `<Theme mode>` takes `'light' | 'dark' | 'system'` (default `system`, follows macOS).
- App-wide toggle: `const [mode,setMode]=useState<'light'|'dark'|'system'>('system'); <Theme theme={themes[defaultThemeSlug]} mode={mode}>`. The root sets `data-astryx-theme` on `<html>` (verified in DOM).
- Per region: nest `<Theme theme={...} mode="dark">` (docs show a dark sidebar next to light content). Remember a surface for the background (AppShell, Section, Card). `MediaTheme mode="dark"` flips tokens for content on a dark surface (control icons over video) but also paints nothing; do not use it for page-level dark.
- Verified colours: dark `--color-background-surface #1F1F22`, body `#111112`, text `#DFE2E5`; accent `#0171E3` dark / `#0064E0` light; status tokens `--color-success/warning/error/info`.

### 3.5 One accent colour via the theme editor (commands run in the spike, `verified`; repo theme untouched)

```bash
npx astryx experimental theme editor new brand --like neutral        # writes themes/brand/ and src/themes/brand/
npx astryx experimental theme editor set brand accent "#6D5EF5"      # generates light+dark shades, checked against Core
npx astryx experimental theme editor set brand corners medium        # dial values: square|small|medium|large|round|pill|more|less|<px> ("soft" is refused)
npx astryx experimental theme editor show brand --png                # writes themes/brand/preview.png + sheet.png; open and look (needs Playwright or Chrome; not run)
npx astryx experimental theme editor how "<what you want>"           # plain-words help; also: undo <theme> [thing]
npx astryx theme add brand && npx astryx theme use brand             # regenerates astryx-themes.js
```

Other dials listed by the tool: `spacing, font, headings, text-size, base, mode`; colours `accent, neutral, success, warning, danger, info, vibrancy`. Cost: after `theme add brand` doctor purity gives **2 warnings** on the generated `astryx-themes.js` (it imports `./src/themes/brand/brand.css` and `brand.fonts.css`, flagged as local stylesheets); exit stays 0. Package themes (`@astryxdesign/theme-neutral|butter|chocolate|gothic|matcha|stone|y2k`) produce no warning. Decision for the orchestrator: the neutral accent (blue `#0064E0`) is already restrained; a custom accent costs 2 explainable warnings; `theme use` / `theme remove` restored the original file byte-for-byte in my test.
- Fonts: neutral's `fonts.css` is a Google Fonts `@import` for Figtree, so doctor warns `theme-fonts: External font imports prevent proof`. In Electron this needs network and a CSP that allows `fonts.googleapis.com` and `fonts.gstatic.com`; offline it falls back to the system stack. Self-hosting is `unverified` (a local `.css` import would be flagged).

### 3.6 StyleX (task D question)

- Not needed for any component, theme, or our own layout when you stay on props (`verified`: spike has no compiler, builds and runs).
- Needed only for templates containing `stylex.create`: 15 of 58 page templates (table below). Without a compiler the page throws at module load and the whole renderer is blank: `Uncaught Error: Unexpected 'stylex.create' call at runtime. Styles must be compiled by '@stylexjs/babel-plugin'` (`verified`).
- Proven fix (`verified`: `table-inbox` rendered correctly afterwards). Install `-D @stylexjs/rollup-plugin@0.19.2` and use the config in 4.2 (`vite.config.stylex.ts` in the spike). Three traps hit: (1) the plugin runs on every module that mentions "stylex", including `index.html` (Vite hands it HTML containing `stylex.css`) and Babel then throws `SyntaxError ... index.html Unexpected token`; guard by extension; (2) it must not compile `node_modules` (docs: Astryx ships precompiled); (3) it only emits `dist/stylex.css`, it does not link it: add `<link rel="stylesheet" href="./stylex.css">` to `index.html` (and the plugin does not run its CSS in `vite dev`; `@stylexjs/unplugin@0.19.2` supports dev, `unverified`).
- Recommendation: avoid StyleX templates altogether (10 of 58 page templates have 0 findings and no StyleX: `blank, contact-form, dashboard-composition, form-wizard-dialog, settings, shell-nav, shell-side-nav, table, table-grouped, table-page`).

Per-template scan (generated by scaffolding all 58 and running doctor's own scanner):

| Template | Doctor findings | Needs StyleX | Extra deps (beyond heroicons) |
| --- | --- | --- | --- |
| blank | 0 | no | - |
| contact-form | 0 | no | - |
| dashboard-composition | 0 | no | recharts |
| form-wizard-dialog | 0 | no | - |
| settings | 0 | no | - |
| shell-nav | 0 | no | - |
| shell-side-nav | 0 | no | - |
| table | 0 | no | - |
| table-grouped | 0 | no | - |
| table-page | 0 | no | - |
| checkout-wizard | 1 | no | - |
| detail-page | 1 | no | - |
| documentation-technical | 1 | no | - |
| form-wizard-inline | 1 | no | - |
| login-sso | 1 | no | - |
| product-gallery | 1 | no | - |
| centered-hero | 2 | no | - |
| course-detail | 2 | no | - |
| documentation | 2 | no | - |
| documentation-design | 2 | no | - |
| file-explorer | 2 | no | - |
| form-two-column | 2 | no | - |
| form-wizard | 2 | no | - |
| form-wizard-vertical | 2 | no | - |
| gallery-hero | 2 | no | - |
| login | 2 | no | - |
| side-gallery | 2 | no | - |
| ai-chat-landing | 3 | no | - |
| dashboard | 3 | no | recharts |
| library | 3 | no | - |
| product-detail | 3 | no | - |
| login-card | 4 | no | - |
| classic-gallery | 5 | no | - |
| incident-console | 5 | no | - |
| theme-showcase | 6 | no | lucide-react |
| login-split | 7 | no | - |
| mixed-gallery | 7 | no | - |
| ai-chat | 9 | no | - |
| editor | 12 | no | - |
| payment-form | 12 | no | - |
| settings-sidebar | 17 | no | - |
| ide | 18 | no | - |
| messaging-shell | 24 | no | - |
| kanban-board | 1 | yes | - |
| shell-top-nav | 1 | yes | - |
| table-collapsible | 1 | yes | recharts |
| table-comparison | 1 | yes | recharts,lucide-react |
| table-tree | 1 | yes | lucide-react |
| work-item-detail | 1 | yes | - |
| dashboard-cohort-funnel | 2 | yes | recharts |
| dashboard-progress | 3 | yes | recharts |
| dashboard-scorecard | 3 | yes | recharts |
| table-inbox | 3 | yes | - |
| dashboard-comparison | 4 | yes | recharts |
| settings-dialog | 4 | yes | - |
| table-filter | 5 | yes | lucide-react |
| dashboard-alert-rail | 6 | yes | recharts |
| canvas-editor | 14 | yes | lucide-react |


---

## 4 · Proven toolchain (task D)

### 4.1 Result (`verified`)

- Project: `/private/tmp/.../scratchpad/astryx-spike`. Node v26.12.0, npm 11.20.0, Vite 8.3.8, `@vitejs/plugin-react` 6.3.0, React 19.3.1, TypeScript 5.9.3 (7.0.2 is latest, not used), Astryx core/theme-neutral/cli 0.7.16, `@stylexjs/stylex` 0.19.2, `@heroicons/react` 2.2.0.
- `npm install` (deps): about 3.5 s; devDeps 10.5 s. `npx tsc --noEmit`: clean. `npm run build`: **0.38 s Vite time, 0.69 s wall**, 3138 modules, dist 1.8 MB (main JS 1.28 MB / 408 kB gzip, CSS 311 kB / 48 kB gzip; Vite warns about the 500 kB chunk, harmless in Electron). `vite dev` serves in 97 ms.
- `npx astryx doctor --built .` → exit 0, pass 20, warn 2 (themes/theme-fonts, both environmental), fail 0; purity: "7 source files with JSX: no raw element, no library icon, no custom styling". `npx astryx doctor --built dist` → exit 0.
- Views rendered and screenshotted in the browser pane: Shell (Layout version), Shell B (AppShell version), Call (dark stage), plus scaffolded `shell-side-nav` and `form-wizard-dialog` templates compiled (not screenshotted).

### 4.2 Files (copy as is)

`package.json`:
```json
{
  "name": "astryx-spike",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "@astryxdesign/core": "^0.7.16",
    "@astryxdesign/theme-neutral": "^0.7.16",
    "@heroicons/react": "^2.2.0",
    "@stylexjs/stylex": "^0.19.2",
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@astryxdesign/cli": "^0.7.16",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.3.0",
    "typescript": "^5.9.3",
    "vite": "^8.3.8"
  }
}
```

`vite.config.ts` (plain path, no StyleX; `base: './'` is needed so the build loads from `file://` in Electron):
```ts
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // relative asset URLs so the build also loads from file:// in Electron
});
```

`vite.config.stylex.ts.txt` (fallback, only if a StyleX template is used; proven):
```ts
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/rollup-plugin';

const stylexPlugin = stylex({
  fileName: 'stylex.css',
  useCSSLayers: true,
  unstable_moduleResolution: {type: 'commonJS', rootDir: process.cwd()},
});

export default defineConfig({
  plugins: [
    // Only compile our own source; Astryx ships precompiled (astryx.css), never feed it node_modules.
    {
      ...stylexPlugin,
      enforce: 'pre',
      transform(code, id) {
        if (id.includes('/node_modules/') || !/\.[cm]?[jt]sx?$/.test(id.split('?')[0])) return null;
        return (stylexPlugin.transform as any).call(this, code, id);
      },
    },
    react(),
  ],
  base: './',
});
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowJs": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src", "astryx-themes.js", "vite.config.ts"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Astryx spike</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`astryx-themes.js`: byte-identical copy of the repo's `AgentManager/astryx-themes.js` (do not edit).

`src/main.tsx`:
```tsx
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import {Theme} from '@astryxdesign/core/theme';
import {themes, defaultThemeSlug} from '../astryx-themes.js';
import {App} from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={themes[defaultThemeSlug]}>
      <App />
    </Theme>
  </StrictMode>,
);
```

`src/App.tsx` (spike switcher):
```tsx
import {useState} from 'react';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Layout, LayoutHeader, LayoutContent} from '@astryxdesign/core/Layout';
import {AgentShell} from './pages/agent-shell';
import AgentShellB from './pages/agent-shell-b';
import {CallStage} from './pages/call-stage';
import ShellSideNavPage from './pages/shell-side-nav/page';
import HireWizardPage from './pages/hire-wizard/page';

export function App() {
  const [view, setView] = useState('shell');
  if (view === 'shellb') return <AgentShellB />;
  if (view === 'call') return <CallStage onLeave={() => setView('shell')} />;
  return (
    <AppShell contentPadding={0}>
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <SegmentedControl label="Spike view" value={view} onChange={setView} size="sm">
            <SegmentedControlItem value="shell" label="Shell" />
            <SegmentedControlItem value="call" label="Call" />
            <SegmentedControlItem value="shellb" label="Shell B" />
            <SegmentedControlItem value="tpl-shell" label="Template: shell-side-nav" />
            <SegmentedControlItem value="tpl-wizard" label="Template: wizard" />
          </SegmentedControl>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          {view === 'shell' && <AgentShell />}
          {view === 'tpl-shell' && <ShellSideNavPage />}
          {view === 'tpl-wizard' && <HireWizardPage />}
        </LayoutContent>
      }
    />
    </AppShell>
  );
}
```

`src/pages/agent-shell-b.tsx` (recommended shell: AppShell + TopNav + SideNav):
```tsx
import {AppShell} from '@astryxdesign/core/AppShell';
import {TopNav, TopNavHeading} from '@astryxdesign/core/TopNav';
import {SideNav, SideNavSection} from '@astryxdesign/core/SideNav';
import {List, ListItem} from '@astryxdesign/core/List';
import {Avatar, AvatarStatusDot} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {PhoneIcon} from '@heroicons/react/24/outline';

const TEAM = [
  {id: 'maya', name: 'Maya Chen', last: 'Pushed the landing page draft', unread: 2},
  {id: 'omar', name: 'Omar Haddad', last: 'Needs approval to post', unread: 1},
  {id: 'ines', name: 'Ines Duarte', last: 'Sources are ready', unread: 0},
];

export default function AgentShellB() {
  return (
    <AppShell
      contentPadding={0}
      topNav={
        <TopNav
          label="Main"
          heading={<TopNavHeading heading="Agent Manager" />}
          endContent={
            <Button label="Summon meeting" variant="primary" icon={<Icon icon={PhoneIcon} size="sm" color="inherit" />} />
          }
        />
      }
      sideNav={
        <SideNav resizable={{defaultWidth: 300, minWidth: 240, maxWidth: 420}} collapsible>
          <SideNavSection title="Team" isHeaderHidden>
            <List density="spacious">
              {TEAM.map((t, i) => (
                <ListItem
                  key={t.id}
                  label={t.name}
                  description={t.last}
                  isSelected={i === 0}
                  onClick={() => {}}
                  startContent={<Avatar name={t.name} size="lg" status={<AvatarStatusDot variant="success" label="Working" />} />}
                  endContent={t.unread ? <Badge label={String(t.unread)} variant="info" /> : undefined}
                />
              ))}
            </List>
          </SideNavSection>
        </SideNav>
      }>
      <Layout height="fill" content={<LayoutContent><EmptyState title="Select an employee" /></LayoutContent>} />
    </AppShell>
  );
}
```

`src/pages/agent-shell.tsx` (conversation + live-desktop panel + summon picker, Layout version):
```tsx
import {useState} from 'react';
import {Layout, LayoutContent, LayoutHeader, LayoutPanel} from '@astryxdesign/core/Layout';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {StackItem} from '@astryxdesign/core/Stack';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Icon} from '@astryxdesign/core/Icon';
import {Avatar, AvatarStatusDot} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {List, ListItem} from '@astryxdesign/core/List';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Divider} from '@astryxdesign/core/Divider';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {useToast} from '@astryxdesign/core/Toast';
import {useResizable, ResizeHandle} from '@astryxdesign/core/Resizable';
import {
  ChatComposer,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  ChatSystemMessage,
  ChatToolCalls,
} from '@astryxdesign/core/Chat';
import {
  ComputerDesktopIcon,
  PhoneIcon,
  CursorArrowRaysIcon,
} from '@heroicons/react/24/outline';

type Presence = 'success' | 'neutral' | 'error';
const TEAM: {id: string; name: string; role: string; last: string; unread: number; status: Presence; label: string; at: string}[] = [
  {id: 'maya', name: 'Maya Chen', role: 'Web developer', last: 'Pushed the landing page draft', unread: 2, status: 'success', label: 'Working', at: '2026-11-14T10:42:00Z'},
  {id: 'omar', name: 'Omar Haddad', role: 'Marketing', last: 'Needs approval to post', unread: 1, status: 'success', label: 'Waiting for you', at: '2026-11-14T10:10:00Z'},
  {id: 'ines', name: 'Ines Duarte', role: 'Researcher', last: 'Sources are ready', unread: 0, status: 'neutral', label: 'Idle', at: '2026-11-13T17:30:00Z'},
];

export function AgentShell() {
  const [selected, setSelected] = useState('maya');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(['maya']);
  const [plan, setPlan] = useState<string[]>(['scaffold']);
  const toast = useToast();
  const panel = useResizable({defaultSize: 380, minSize: 300, maxSize: 560});
  const current = TEAM.find(t => t.id === selected) ?? TEAM[0];

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <Heading level={5}>Agent Manager</Heading>
            </StackItem>
            <Button
              label="Summon meeting"
              variant="primary"
              icon={<Icon icon={PhoneIcon} size="sm" color="inherit" />}
              onClick={() => setIsPickerOpen(true)}
            />
          </HStack>
        </LayoutHeader>
      }
      start={
        <LayoutPanel width={300} padding={2} hasDivider>
          <List density="spacious">
            {TEAM.map(t => (
              <ListItem
                key={t.id}
                label={t.name}
                description={t.last}
                isSelected={t.id === selected}
                onClick={() => setSelected(t.id)}
                startContent={
                  <Avatar
                    name={t.name}
                    size="lg"
                    status={<AvatarStatusDot variant={t.status} label={t.label} />}
                  />
                }
                endContent={
                  <VStack gap={1} hAlign="end">
                    <Timestamp value={t.at} format="relative_short" />
                    {t.unread > 0 ? <Badge label={String(t.unread)} variant="info" /> : null}
                  </VStack>
                }
              />
            ))}
          </List>
        </LayoutPanel>
      }
      content={
        <LayoutContent padding={0}>
          <VStack height="100%">
            <HStack gap={2} vAlign="center" padding={3}>
              <Avatar name={current.name} size="md" />
              <StackItem size="fill">
                <VStack>
                  <Text weight="semibold">{current.name}</Text>
                  <Text type="supporting" color="secondary">{current.role}</Text>
                </VStack>
              </StackItem>
              <ToggleButton
                label="Live desktop"
                icon={<Icon icon={ComputerDesktopIcon} size="sm" color="inherit" />}
                isPressed={isPanelOpen}
                onPressedChange={setIsPanelOpen}
              />
              <IconButton
                label="Call"
                tooltip="Call"
                variant="ghost"
                icon={<Icon icon={PhoneIcon} size="sm" color="inherit" />}
                onClick={() => toast({body: `Calling ${current.name}`})}
              />
            </HStack>
            <Divider />
            <ChatLayout
                composer={<ChatComposer placeholder={`Message ${current.name}`} onSubmit={() => {}} />}
                emptyState={<EmptyState title="No messages yet" />}>
                <ChatMessageList density="balanced">
                  <ChatSystemMessage variant="divider">Today</ChatSystemMessage>
                  <ChatMessage sender="user">
                    <ChatMessageBubble metadata={<ChatMessageMetadata timestamp={<Timestamp value="2026-11-14T09:00:00Z" format="time" />} status="read" />}>
                      Build the landing page and push it when done.
                    </ChatMessageBubble>
                  </ChatMessage>
                  <ChatSystemMessage icon={<Icon icon={CursorArrowRaysIcon} size="sm" color="secondary" />}>
                    Opened Figma
                  </ChatSystemMessage>
                  <ChatMessage sender="assistant" avatar={<Avatar name={current.name} size="md" />}>
                    <ChatMessageBubble name={current.name}>
                      On it. I am working from the Figma file now.
                    </ChatMessageBubble>
                    <ChatToolCalls
                      calls={[
                        {name: 'edit', target: 'index.html', status: 'complete', duration: '1.2s', additions: 42, deletions: 3},
                        {name: 'bash', target: 'npm run build', status: 'running'},
                      ]}
                    />
                  </ChatMessage>
                  <ChatMessage sender="assistant" avatar={<Avatar name={current.name} size="md" />}>
                    <ChatMessageBubble name={current.name}>
                      <VStack gap={2}>
                        <Text>Allow me to push to the main branch?</Text>
                        <HStack gap={2}>
                          <Button label="Approve" variant="primary" size="sm" onClick={() => toast({body: 'Approved'})} />
                          <Button label="Deny" variant="secondary" size="sm" onClick={() => toast({body: 'Denied', type: 'error'})} />
                        </HStack>
                      </VStack>
                    </ChatMessageBubble>
                  </ChatMessage>
                </ChatMessageList>
              </ChatLayout>
          </VStack>
        </LayoutContent>
      }
      end={
        isPanelOpen ? (
          <>
          <ResizeHandle direction="horizontal" isReversed hasDivider resizable={panel.props} label="Resize panel" />
          <LayoutPanel width={panel.size} padding={3} hasDivider={false}>
            <VStack gap={4}>
              <AspectRatio ratio={16 / 10} fit="cover">
                <video muted autoPlay playsInline loop aria-label={`${current.name} desktop`} />
              </AspectRatio>
              <Skeleton height={8} />
              <ProgressBar label="Plan" value={plan.length * 33} hasValueLabel />
              <CheckboxList label="Plan" value={plan} onChange={setPlan} density="compact">
                <CheckboxListItem value="scaffold" label="Scaffold the page" />
                <CheckboxListItem value="build" label="Build sections" />
                <CheckboxListItem value="push" label="Push to main" />
              </CheckboxList>
            </VStack>
          </LayoutPanel>
          </>
        ) : undefined
      }>
      <Dialog isOpen={isPickerOpen} onOpenChange={setIsPickerOpen} width={420}>
        <DialogHeader title="Summon meeting" onOpenChange={setIsPickerOpen} />
        <VStack gap={4} padding={4}>
          <CheckboxList label="Who should join" isLabelHidden value={picked} onChange={setPicked}>
            {TEAM.map(t => (
              <CheckboxListItem
                key={t.id}
                value={t.id}
                label={t.name}
                description={t.role}
                endContent={<Avatar name={t.name} size="sm" />}
              />
            ))}
          </CheckboxList>
          <Button label={`Call ${picked.length}`} variant="primary" isDisabled={picked.length === 0} onClick={() => setIsPickerOpen(false)} />
        </VStack>
      </Dialog>
    </Layout>
  );
}
```

`src/pages/call-stage.tsx` (dark call stage):
```tsx
import {useState} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Layout, LayoutContent, LayoutFooter, LayoutPanel, LayoutHeader} from '@astryxdesign/core/Layout';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {Grid} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';
import {Center} from '@astryxdesign/core/Center';
import {Avatar} from '@astryxdesign/core/Avatar';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Overlay} from '@astryxdesign/core/Overlay';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Timer} from '@astryxdesign/core/Timer';
import {themes, defaultThemeSlug} from '../../astryx-themes.js';
import {
  MicrophoneIcon,
  ChatBubbleBottomCenterTextIcon,
  Squares2X2Icon,
  PhoneXMarkIcon,
} from '@heroicons/react/24/outline';

const PEOPLE = ['Maya Chen', 'Omar Haddad', 'Ines Duarte'];

export function CallStage({onLeave}: {onLeave: () => void}) {
  const [isMuted, setIsMuted] = useState(false);
  const [hasCaptions, setHasCaptions] = useState(true);
  const [speaker, setSpeaker] = useState(0);

  const controls = (
    <HStack gap={2} hAlign="center" padding={3}>
      <ToggleButton
        label="Mute"
        isIconOnly
        icon={<Icon icon={MicrophoneIcon} size="sm" color="inherit" />}
        isPressed={isMuted}
        onPressedChange={setIsMuted}
      />
      <ToggleButton
        label="Captions"
        isIconOnly
        icon={<Icon icon={ChatBubbleBottomCenterTextIcon} size="sm" color="inherit" />}
        isPressed={hasCaptions}
        onPressedChange={setHasCaptions}
      />
      <IconButton label="Switch layout" tooltip="Switch layout" icon={<Icon icon={Squares2X2Icon} size="sm" color="inherit" />} onClick={() => setSpeaker(s => (s + 1) % PEOPLE.length)} />
      <Button label="Leave" variant="destructive" onClick={onLeave} icon={<Icon icon={PhoneXMarkIcon} size="sm" color="inherit" />} />
    </HStack>
  );

  const stage = (
    <Grid columns={{minWidth: 240, repeat: 'fit'}} gap={3}>
      {PEOPLE.map((name, i) => (
        <Card key={name} variant={i === speaker ? 'blue' : 'muted'} padding={0}>
          <Overlay
            position="bottom"
            align="start"
            content={<Text size="sm">{name}</Text>}>
            <AspectRatio ratio={16 / 10}>
              <Center height="100%">
                <Avatar name={name} size={128} />
              </Center>
            </AspectRatio>
          </Overlay>
        </Card>
      ))}
      <Card variant="muted" padding={0}>
        <AspectRatio ratio={16 / 10} fit="cover">
          <canvas aria-label="Live desktop" />
        </AspectRatio>
      </Card>
    </Grid>
  );

  return (
    <Theme theme={themes[defaultThemeSlug]} mode="dark">
      <AppShell contentPadding={0}>
      <Layout
        height="fill"
        padding={0}
        header={
          <LayoutHeader>
            <HStack gap={2} hAlign="between">
              <Text weight="semibold">Meeting</Text>
              <Timer startTime={Date.now()} />
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <VStack padding={4}>{stage}</VStack>
          </LayoutContent>
        }
        footer={<LayoutFooter hasDivider>{controls}</LayoutFooter>}
        end={
          hasCaptions ? (
            <LayoutPanel width={320} padding={3} hasDivider>
              <VStack gap={2}>
                <Text type="supporting" color="secondary">Maya Chen</Text>
                <Text>I pushed the first draft. Want me to walk through it?</Text>
              </VStack>
            </LayoutPanel>
          ) : undefined
        }
      />
      </AppShell>
    </Theme>
  );
}
```

Commands, in order:
```bash
npm i react@^19 react-dom@^19 @astryxdesign/core@0.7.16 @astryxdesign/theme-neutral@0.7.16 @stylexjs/stylex@^0.19.2 @heroicons/react@^2.2.0
npm i -D vite@^8 @vitejs/plugin-react@^6 typescript@^5.9 @types/react @types/react-dom @astryxdesign/cli@0.7.16
npx astryx template shell-side-nav src/pages/shell-side-nav     # scaffolds page.tsx (0 findings)
npx astryx template form-wizard-dialog src/pages/hire-wizard    # scaffolds page.tsx (0 findings)
npx tsc --noEmit && npm run build
npx astryx doctor --built .        # source purity (the one that matters)
npx astryx doctor --built dist     # usage only
```

### 4.3 Every error hit and its fix (`verified`)

| # | Symptom | Fix |
| --- | --- | --- |
| 1 | Page height followed content (root 845 px, composer cut off) | Wrap the app in `AppShell contentPadding={0}`; `Layout height="fill"` needs a parent with a height. |
| 2 | Composer pushed 80 px below the window | `ChatLayout` is `flex:1;min-height:0` and needs a flex-column parent with definite height: place it directly inside `VStack height="100%"`, not inside `StackItem size="fill"`. |
| 3 | TS2353 `defaultWidth` not in `ResizableRegion \| ResizableProps` on `LayoutPanel resizable` | Use `const r = useResizable({defaultSize,minSize,maxSize})` + `<ResizeHandle resizable={r.props}/>` + `LayoutPanel width={r.size}`. |
| 4 | TS2322 `padding` not on `Grid` | Wrap in `VStack padding={4}` or use LayoutContent padding. |
| 5 | Dark `Theme` showed white page and invisible text | Put `AppShell` inside the dark `Theme` (it paints `--color-background-body`). |
| 6 | `Overlay position="bottom"` control bar sat at the end of the tile grid, clipped | Overlay is only as tall as its child; use `LayoutFooter` for the bar. |
| 7 | StyleX template: `Unexpected 'stylex.create' call at runtime` | StyleX plugin (3.6, 4.2). |
| 8 | With the plugin: Build failed `index.html: Unexpected token (1:0)` | Gate the plugin's `transform` to `/\.[cm]?[jt]sx?$/` and skip `node_modules`. |
| 9 | With the plugin: styles absent | Add `<link rel="stylesheet" href="./stylex.css">` (rollup plugin does not link its output). |
| 10 | Canary charts: ERESOLVE (peer on `core@0.7.17-canary.g0135e03` which is not published for core) | Pin all four packages to `0.7.17-canary.g8d3e010`. |
| 11 | Theme editor `corners soft` refused | Valid: `square\|small\|medium\|large\|round\|pill\|more\|less\|<px>`. |
| 12 | npm warns "install-scripts ... not yet covered by allowScripts" for `@astryxdesign/core` and `cli` postinstall | Harmless: the script only prints an `astryx init` nudge (read `node_modules/@astryxdesign/core/scripts/postinstall.mjs`). |
| 13 | After `theme add brand` doctor warns on generated `astryx-themes.js` | Known cost of a local theme (3.5). |

### 4.4 Electron hosting, on paper (not run)

- Recommendation: **electron-vite 6.0.0** (`npm view`: peer `vite ^6 || ^7 || ^8`, `@swc/core ^1`; engines Node `^20.19 || >=22.12`; ships `rolldown ~1.2.10` for main/preload; last published 2026-10-14) with Electron 45.3.2 (engines Node >= 22.12; published 2026-11-13). One config file with `main`, `preload`, `renderer`; defaults `out/main/index.js`, `out/preload`, `out/renderer`; `dev` / `build` / `preview`. Package with `electron-builder` 26.18.0 when needed. `reported` (electron-vite.org guide; its docs state it is where features are tried first and later ported to Forge).
- Alternative: **Electron Forge 8.0.1 + `@electron-forge/plugin-vite` 8.0.1** (engines Node >= 22.13; last published 2026-09-29). Forge docs still call Vite support "experimental since v7.5.0" (breaking changes possible in minors), use one Vite config per target (`vite.main.config`, `vite.renderer.config`), set renderer `base: './'`, inject `MAIN_WINDOW_VITE_DEV_SERVER_URL` / `MAIN_WINDOW_VITE_NAME`, output in `.vite/build` and `.vite/renderer/<name>`. Better if we need makers/notarisation out of the box. `reported` (electronforge.io).
- Why electron-vite for an overnight one-shot: single config, fewer generated globals, Vite 8 already named in its peer range, same Vite as the spike (so the proven `vite.config.ts` drops into `renderer`). Risk is lower for Forge only on packaging/signing, which is out of scope for the hackathon demo.
- React 19: no issue (renderer is a normal Vite build; spike uses React 19.3.1). Astryx/StyleX in the renderer: no compiler needed on the plain path, CSS is plain files, so no special handling (`verified` for the web build; Electron run `unverified`).
- Known renderer gotchas: `base: './'` (relative assets, spike already sets it; both tools do it by default); module scripts load from `file://` in Electron (standard, `unverified` here); CSP must allow Google Fonts or self-host; keep `contextIsolation: true` and expose a typed API from preload; `<video>` playback of a MediaStream is plain DOM.
- Recommended layout:
```
AgentManager/
  package.json            "main": "./out/main/index.js"
  electron.vite.config.ts
  astryx-themes.js        (generated; keep at root, import relatively from the renderer)
  tsconfig.json  tsconfig.node.json  tsconfig.web.json
  src/main/index.ts       BrowserWindow, IPC, Cua orchestration, tray/background mode
  src/preload/index.ts    contextBridge.exposeInMainWorld('agentApi', {...})
  src/renderer/index.html
  src/renderer/src/main.tsx   (reset.css, astryx.css, <Theme>)
  src/renderer/src/App.tsx, pages/*, components/*
```
- `electron.vite.config.ts` (shape from the electron-vite docs: empty `main`/`preload`/`renderer` blocks; the plugin line is my addition, `unverified`):
```ts
import {defineConfig} from 'electron-vite';
import react from '@vitejs/plugin-react';
export default defineConfig({main: {}, preload: {}, renderer: {plugins: [react()]}});
```
- Scripts: `"dev": "electron-vite dev"`, `"build": "electron-vite build"`, `"start": "electron-vite preview"`, `"typecheck": "tsc --noEmit -p tsconfig.web.json"`, `"doctor": "astryx doctor --built ."`. Deps to add: `electron@45`, `electron-vite@6`, `vite@8`, `@vitejs/plugin-react@6`; keep Astryx deps as in 4.2. Also run `npx astryx doctor --built .` (not only `--built out/renderer`).

---

## 5 · Figma (task E)

- **No official Astryx Figma kit, library or tokens file found** (`reported` negative result): `astryx.atmeta.com` (nav: Docs, Components, Templates, Themes, Playground; footer Storybook, Sandbox, Blog, Community, Changelog; no Figma or design-resource link), the GitHub repo `meta/astryx` (README has no Figma, tokens JSON or Code Connect; top dirs `.agents .claude .claude-plugin apps docs internal packages plugins/astryx`), and web search for the Figma Community (no Astryx file; only unrelated kits). The installed docs and changelogs contain no "figma" string (`verified`, grep).
- Tokens exist only as CSS custom properties and the docs tables (`npx astryx docs tokens`, e.g. 15 spacing steps, semantic colours with light/dark hex); no JSON/Style Dictionary export seen. `verified` (docs), `unverified` whether the monorepo has one.
- **Cheapest credible path to a Figma file matching our screens**:
  1. Make each screen a default-export page module (the spike's `agent-shell-b.tsx` is already one) with fixture data.
  2. `npx astryx experimental render src/pages/<screen>.tsx --out out/<screen>.html` → one self-contained static HTML (no scripts, no network, CSS inlined, 70 KB for the shell; ran in 1.2 s, `verified`). Caveats from the tool: it renders without browser APIs, so no `<video>`/state after click; output states "follows viewer's light/dark scheme". Whether the neutral theme's colours are applied (vs bare Core tokens) is `unverified`: open the HTML and compare.
  3. Open that HTML in a browser and import it with the Figma MCP tools that are present in this environment (`html_to_figma`, `send_code_to_figma`, `use_figma`, `create_new_file`, `get_screenshot`). The import creates frames of real layout (`unverified`; do not run until the user chooses the Figma file; needs file key and `create_session`). Do the dark call stage the same way with the Theme wrapper in the page.
  4. Optional polish: build Figma variables from the doc tables (spacing 4 px steps, radius, neutral accent `#0064E0`/`#0171E3`, status colours) with `use_figma`, and name frames after screens. A hand-built component library would take far longer than the hackathon allows.
- Narrative for the prize: Astryx is Meta's design system and the app is built only from its components, so Figma frames are generated from the exact components rather than redrawn (this is a framing, not a verified rule; Q-002 in decisions.md still needs the organisers' answer).

---

## 6 · Risks and unknowns

| # | Risk or unknown | Status | Mitigation |
| --- | --- | --- | --- |
| 1 | `doctor` passes with warnings; AGENTS.md says fix all. Scaffolded templates carry raw `<div>`, `style`, `className` (ai-chat 9, messaging-shell 24, settings-sidebar 17) | `verified` | Start from the 0-finding templates or rewrite flagged lines with props; run `--built .` after every screen. |
| 2 | No video component; `<video>`/`<canvas>` raw (allowed by doctor today) | `verified` | AspectRatio pattern; if a later doctor release flags them, isolate in one file. |
| 3 | No floating overlay control bar pinned to the viewport | `verified` | Docked `LayoutFooter` bar. |
| 4 | Charts: only canary, or Recharts (non-Astryx) | `verified` | Prefer ProgressBar rows; otherwise ask the user (AGENTS.md rule) before canary or Recharts. |
| 5 | Custom accent costs 2 doctor warnings and a generated local theme | `verified` | Keep neutral accent or accept warnings; decide once. |
| 6 | Google Fonts @import for Figtree: offline/CSP in Electron | `verified` import, behaviour `unverified` | Allow in CSP for the demo; or accept system fallback. |
| 7 | Astryx is a young beta (0.7.x, "public beta, released 2026-06-28" `reported`), props still moving (WIP labels on messaging-shell, table templates; experimental commands) | `reported` | Pin exact versions (`0.7.16`), commit the lockfile. |
| 8 | `Icon` has ~25 semantic names; everything else needs heroicons (not currently in repo `package.json`) | `verified` | Add `@heroicons/react@^2.2.0` as a dependency; pass components as values (`icon={PhoneIcon}`), never as JSX tags. |
| 9 | Nested Theme in a portal (Dialog fullscreen) may escape dark mode | `unverified` | Render the call as the app root (proven). |
| 10 | Toast visual and keyboard behaviour in Electron not screenshotted | `unverified` | Check in the first build. |
| 11 | electron-vite 6 + Vite 8 + our React plugin combination not run; Forge plugin-vite is the "official" but experimental alternative | `unverified` | First task of the build: scaffold and run `electron-vite dev` once, fall back to Forge if it fails. |
| 12 | Official Astryx docs site/CLI docs are huge (784 template entries); an agent may pick a StyleX template and see a blank app | `verified` | Whitelist the 10 clean templates (3.6) in the build brief. |
| 13 | `npx astryx` first run in a project prints an `init` nudge and writes cache under `~/Library/Caches/astryx` (8.8 MB); `astryx init` was not run (it would write agent docs) | `verified` | None needed; repo already has AGENTS.md. |
| 14 | The ai-chat bubbles for `sender="user"` looked left-aligned in a 235 px-wide pane in my screenshot; alignment at normal width not checked | `unverified` | Check in the first full-width render. |
| 15 | Figma import of rendered HTML | `unverified` | Test with one screen before promising it. |

### Open questions for the orchestrator

1. Chart: no chart, canary charts (switches core to a canary), or Recharts (needs user approval)?
2. Custom accent colour (2 doctor warnings) or neutral blue?
3. Is it acceptable that `<video>`/`<canvas>` are the only raw elements in the repo (needed for live desktop and avatar video)?
4. electron-vite vs Forge: confirm electron-vite so the build brief can name exact files.
5. Does the user want the Figma file generated by html-to-figma (needs Figma file/team and a session)?
