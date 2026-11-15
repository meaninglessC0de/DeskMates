/** Custom styling for everything outside the call stage. CSS text; Astryx tokens only; selectors on `data-am-*`. */

/**
 * The eight personal tints, in slot order (see ui/tint.ts). Slots 0-3 are the Deskmates logo's four hues
 * (blue, orange, pink, green); 4-7 sit between them (violet, teal, amber, coral). Red is left out: it means stuck and End.
 * Brand hues are the one place literal oklch() is allowed: same lightness and chroma for all eight, so they weigh the same.
 */
const TINT_HUES = [262, 62, 357, 160, 300, 200, 90, 25] as const;
/** Full-strength tile colour and handle per slot: 0-3 are the mark's exact tiles (brand README), 4-7 match their weight. */
const TINT_TILE: [number, number][] = [[0.72, 0.143], [0.78, 0.155], [0.729, 0.17], [0.749, 0.155], [0.74, 0.15], [0.75, 0.13], [0.79, 0.15], [0.74, 0.15]];
const TINT_HANDLE: [number, number][] = [[0.571, 0.12], [0.624, 0.132], [0.578, 0.145], [0.595, 0.131], [0.59, 0.13], [0.6, 0.11], [0.63, 0.13], [0.59, 0.13]];

const tintVars = TINT_HUES.map(
  (h, i) => `
  --am-tint-${i}: light-dark(oklch(0.9 0.05 ${h}), oklch(0.36 0.055 ${h}));
  --am-tint-ink-${i}: light-dark(oklch(0.42 0.1 ${h}), oklch(0.88 0.07 ${h}));
  --am-tint-line-${i}: oklch(${TINT_TILE[i]![0]} ${TINT_TILE[i]![1]} ${h});
  --am-tint-handle-${i}: oklch(${TINT_HANDLE[i]![0]} ${TINT_HANDLE[i]![1]} ${h});`,
).join('');

const tintSelectors = TINT_HUES.map(
  (_, i) => `[data-am-tint="${i}"] { --am-tint: var(--am-tint-${i}); --am-tint-ink: var(--am-tint-ink-${i}); --am-tint-line: var(--am-tint-line-${i}); --am-tint-handle: var(--am-tint-handle-${i}); }`,
).join('\n');

export const appCss = /* css */ `
/* Personal tints. Declared on every theme root so they resolve against that theme's tokens (light app, dark stage). */
:root, [data-astryx-theme], [data-theme] {${tintVars}
}
${tintSelectors}

/* ---------- Platform fit (macOS): chrome is not selectable, controls use the arrow, thin scrollbars, antialiased text ---------- */
html, body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
.astryx-side-nav, .astryx-layout-header, .astryx-layout-footer, .astryx-dialog-header, .astryx-drawer-header,
button, [role="button"], [role="tab"], [role="radio"], [role="switch"], .astryx-list-item, .astryx-badge, .astryx-table th,
.astryx-chat-system-message, .astryx-chat-message-metadata, [data-am-desks], [data-am-loader-wrap], label {
  -webkit-user-select: none;
  user-select: none;
}
button, [role="button"], [role="tab"], [role="radio"], [role="switch"], [data-astryx-pressable], .astryx-list-item, label { cursor: default; }
a[href] { cursor: pointer; }
* { scrollbar-width: thin; scrollbar-color: color-mix(in oklab, var(--color-text-primary) 22%, transparent) transparent; }

/* ---------- Desks and the loader: the mark's geometry (tile 100, gap 13, of 213; handle 42 x 9, 3.5 above centre) ---------- */
[data-am-desks] { gap: 6.1%; }
.astryx-empty-state [data-am-desks] { margin-block-end: var(--spacing-4); }
[data-am-desks] > [data-am-desk] {
  position: relative;
  width: 100%;
  height: auto;
  min-width: 0;
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  border-radius: 30%;
  background: var(--am-tint);
  box-shadow: none;
}
[data-am-desks] > [data-am-desk]::after {
  content: '';
  position: absolute;
  left: 29%;
  width: 42%;
  top: calc(50% - 4.5% - 3.5%);
  height: 9%;
  border-radius: var(--radius-full);
  background: color-mix(in oklab, var(--am-tint-line) 55%, var(--am-tint));
}
[data-am-desks] > [data-am-desk="filled"] { background: var(--am-tint-line); }
[data-am-desks] > [data-am-desk="filled"]::after { background: var(--am-tint-handle); }
[data-am-desks] > [data-am-desk="add"]::after { display: none; }
[data-am-desks] > [data-am-desk="add"] { color: var(--am-tint-ink); cursor: default; }
[data-am-desks] > [data-am-desk="add"]:hover { background: color-mix(in oklab, var(--am-tint-line) 30%, var(--am-tint)); }
[data-am-desks][data-am-desks-size="small"] > [data-am-desk]::after { min-height: 1px; }
[data-am-loader] > [data-am-desk-slot="0"] { background: var(--am-tint-line-0); }
[data-am-loader] > [data-am-desk-slot="1"] { background: var(--am-tint-line-1); }
[data-am-loader] > [data-am-desk-slot="2"] { background: var(--am-tint-line-2); }
[data-am-loader] > [data-am-desk-slot="3"] { background: var(--am-tint-line-3); }
[data-am-loader] > [data-am-desk-slot="0"]::after { background: var(--am-tint-handle-0); }
[data-am-loader] > [data-am-desk-slot="1"]::after { background: var(--am-tint-handle-1); }
[data-am-loader] > [data-am-desk-slot="2"]::after { background: var(--am-tint-handle-2); }
[data-am-loader] > [data-am-desk-slot="3"]::after { background: var(--am-tint-handle-3); }
@media (prefers-reduced-motion: no-preference) {
  /* Breathing clockwise: top-left, top-right, bottom-right, bottom-left. Opacity only. */
  [data-am-loader] > [data-am-desk] { animation: am-breathe 1.2s var(--ease-standard) infinite both; }
  [data-am-loader] > [data-am-desk-slot="1"] { animation-delay: 0.3s; }
  [data-am-loader] > [data-am-desk-slot="3"] { animation-delay: 0.6s; }
  [data-am-loader] > [data-am-desk-slot="2"] { animation-delay: 0.9s; }
}
@keyframes am-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

/* ---------- Stage leaving (App.tsx keeps the stage mounted 230 ms after the call ends) ---------- */
[data-am-stage-root][data-am-leaving] { position: fixed; inset: 0; z-index: 10; pointer-events: none; }
@media (prefers-reduced-motion: no-preference) {
  [data-am-stage-root][data-am-leaving] { animation: am-leave var(--duration-fast-max) var(--ease-exit) both; }
}
@keyframes am-leave { from { opacity: 1; } to { opacity: 0; } }

/* ---------- Portrait ---------- */
[data-am-portrait] .astryx-avatar-fallback {
  background: var(--am-tint);
  color: var(--am-tint-ink);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.02em;
}
[data-am-portrait][data-am-portrait-size="60"] .astryx-avatar-fallback,
[data-am-portrait][data-am-portrait-size="64"] .astryx-avatar-fallback,
[data-am-portrait][data-am-portrait-size="72"] .astryx-avatar-fallback,
[data-am-portrait][data-am-portrait-size="96"] .astryx-avatar-fallback,
[data-am-portrait][data-am-portrait-size="128"] .astryx-avatar-fallback,
[data-am-portrait][data-am-portrait-size="144"] .astryx-avatar-fallback { font-weight: var(--font-weight-medium); letter-spacing: 0.04em; }
[data-am-portrait] .astryx-avatar-fallback svg { color: var(--am-tint-ink); }

/* Photos: small circles crop a little tighter on the face; a hairline lets light rooms sit on the wash. */
[data-am-portrait] img { object-fit: cover; object-position: 50% 30%; }
[data-am-portrait]:is([data-am-portrait-size="24"], [data-am-portrait-size="32"], [data-am-portrait-size="36"], [data-am-portrait-size="40"]) img {
  transform: scale(1.18); transform-origin: 50% 32%;
}
[data-am-portrait]:has(img)::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 0 0 1px var(--color-border);
}

/* Presence: a 10 px dot at 40, cut out of the face by a ring of whatever sits behind it (--am-cut). */
[data-am-portrait] .astryx-status-dot {
  box-shadow: 0 0 0 2px var(--am-cut, var(--color-background-surface));
}
[data-am-portrait][data-am-portrait-size="40"] .astryx-status-dot,
[data-am-portrait][data-am-portrait-size="36"] .astryx-status-dot,
[data-am-portrait][data-am-portrait-size="48"] .astryx-status-dot { width: 10px; height: 10px; }
@media (prefers-reduced-motion: no-preference) {
  [data-am-portrait] .astryx-status-dot { transition: background-color var(--duration-fast) var(--ease-standard); }
}

/* Amber, not olive: the needs-you dot uses the strong warning fill. */
.astryx-status-dot[data-variant="warning"] {
  /* Needs you is the product's most important signal: a deeper amber that holds 3:1 on paper, the bright one on dark. */
  background-color: light-dark(oklch(from var(--color-warning) 0.64 c calc(h - 14)), var(--color-warning));
}

/* ---------- Sidebar ---------- */
.astryx-side-nav { --am-cut: var(--color-background-body); }
[data-am-people] { gap: 2px; }
[data-am-people] .astryx-list-item { border-radius: var(--radius-container); }
[data-am-people] .astryx-list-item:hover { background: var(--color-overlay-hover); }
/* Selected: the row lifts to paper with a hairline. Hover stays a wash. */
[data-am-people] .astryx-list-item[aria-current="true"],
[data-am-people] .astryx-list-item[aria-current="true"]:hover {
  --am-cut: var(--color-background-surface);
  background: var(--color-background-surface);
  box-shadow: inset 0 0 0 1px var(--color-border);
}
@media (prefers-reduced-motion: no-preference) {
  [data-am-people] .astryx-list-item .astryx-text { transition: color var(--duration-fast) var(--ease-standard); }
}
@media (prefers-reduced-motion: no-preference) {
  /* A new hire's row arrives: rise and fade, once (the attribute stays, the animation does not replay). */
  [data-am-people] .astryx-list-item[data-am-arrive] { animation: am-rise var(--duration-fast-max) var(--ease-entrance) both; }
}
[data-am-footer] { padding-inline: var(--spacing-2); }

/* State banners (desktop off, paused) are facts, not alarms: a quiet band. Stuck keeps its red. */
/* One banner pattern everywhere: a quiet muted band, primary text, the status shown only by the icon's colour,
   actions as secondary buttons. Red stays in the icon for stuck and real errors. */
[data-am-banner], [data-am-banner] .astryx-banner { background: var(--color-background-muted); color: var(--color-text-primary); border-color: var(--color-border); }
[data-am-banner] .astryx-text { color: var(--color-text-primary); }
[data-am-banner] .astryx-banner-description { color: var(--color-text-secondary); }
[data-am-banner] .astryx-banner-icon[data-status="error"] { color: var(--color-icon-error); }
[data-am-banner] .astryx-banner-icon[data-status="warning"] { color: oklch(from var(--color-warning) 0.64 c calc(h - 14)); }
[data-am-banner] .astryx-banner-icon[data-status="info"], [data-am-banner] .astryx-banner-icon[data-status="success"] { color: var(--color-icon-secondary); }
[data-am-thread] > [data-am-banner] {
  width: calc(100% - var(--spacing-8));
  max-width: calc(var(--spacing-12) * 16 - var(--spacing-8));
  margin: var(--spacing-3) auto 0;
  border-radius: var(--radius-container);
  overflow: hidden;
}

/* ---------- Desktop panel ---------- */
/* The screen sits in a frame, so a dark desktop never bleeds into a dark panel. */
[data-am-screen] {
  overflow: hidden;
  border: var(--border-width) solid var(--color-border-emphasized);
  border-radius: var(--radius-container);
  background: var(--color-background-muted);
}
[data-am-screen][data-am-screen-state="off"], [data-am-screen][data-am-screen-state="lent"] { background: var(--color-background-surface); border-style: dashed; }
[data-am-screen] .astryx-card { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
[data-am-screen][data-am-control="true"] { border-color: var(--color-accent); box-shadow: 0 0 0 1px var(--color-accent); }
[data-am-plan] .astryx-item, [data-am-activity] .astryx-item { min-height: 0; padding-block: var(--spacing-1); }
/* One icon column: check, spinner and hollow circle share a 16 px box, so the text never shifts. */
[data-am-plan] .astryx-item > :first-child, [data-am-activity] .astryx-collapsible-content .astryx-item > :first-child {
  width: var(--spacing-4); flex: none; display: inline-flex; justify-content: center;
}
@media (prefers-reduced-motion: no-preference) {
  [data-am-panel] { animation: am-slide var(--duration-fast-max) var(--ease-entrance) both; }
}
@keyframes am-slide {
  from { opacity: 0; transform: translateX(var(--spacing-6)); }
  to { opacity: 1; transform: none; }
}

/* ---------- Hire ---------- */
/* Shuffle: the leaving face and the arriving face share one grid cell and cross-fade. */
[data-am-identity-stack] { display: grid; justify-items: center; }
[data-am-identity-stack] > * { grid-area: 1 / 1; }
/* Only the faces overlap; ghosted text reads as a glitch, so the old words leave at once and the new ones follow. */
[data-am-identity="out"] > :not([data-am-portrait]) { visibility: hidden; }
/* Role icons sit in one size of quiet tile, one stroke. */
[data-am-tile] {
  flex: none;
  border-radius: var(--radius-element);
  background: var(--color-background-muted);
  color: var(--color-icon-primary);
}
[data-am-tile] svg { stroke-width: 1.75; }
@media (prefers-reduced-motion: no-preference) {
  /* Shuffle: the new face and name cross-fade in. */
  [data-am-identity="in"] { animation: am-fade var(--duration-fast-max) var(--ease-entrance) both; }
  [data-am-identity="in"] > :not([data-am-portrait]) { animation: am-fade var(--duration-fast) var(--ease-entrance) var(--duration-fast-min) both; }
  [data-am-identity="out"] { animation: am-leave var(--duration-fast-max) var(--ease-exit) both; }
}
[data-am-hire-footer] .astryx-button { min-width: calc(var(--spacing-12) * 4); }
@keyframes am-fade { from { opacity: 0; } to { opacity: 1; } }

/* ---------- Settings ---------- */
[data-am-connections] .astryx-item { padding-inline: 0; min-height: 0; padding-block: var(--spacing-1); }

/* ---------- Team ---------- */
/* The Team column shares the thread's 768 px reading column. */
[data-am-page] { width: 100%; max-width: calc(var(--spacing-12) * 16 + var(--spacing-12)); margin-inline: auto; }
[data-am-page-header] { padding-inline: var(--spacing-6); }
[data-am-share] { height: 4px; border-radius: var(--radius-full); background: var(--color-background-muted); overflow: hidden; flex: none; }
[data-am-share-fill] { border-radius: var(--radius-full); background: var(--am-tint-line); }
[data-am-figure] { letter-spacing: -0.01em; }
[data-am-synced] a { font-size: inherit; color: var(--color-text-primary); text-decoration: underline; text-decoration-color: var(--color-border-emphasized); text-underline-offset: 0.2em; }
[data-am-synced] a:hover { text-decoration-color: currentColor; }

/* ---------- Selection and caret ---------- */
[data-am-thread] ::selection { background: color-mix(in oklab, var(--am-tint-line-0) 32%, transparent); }
[data-am-thread] .astryx-chat-message-bubble[data-sender="user"] ::selection { background: color-mix(in oklab, var(--am-tint-line-0) 55%, transparent); }
[data-am-thread] .astryx-chat-composer-input, [data-am-thread] .astryx-chat-composer-input * { caret-color: var(--color-text-primary); }

/* ---------- Tabular figures wherever numbers change or line up ---------- */
.astryx-timestamp, [data-am-num], [data-am-num] * { font-variant-numeric: tabular-nums; }

/* ---------- Conversation ---------- */
/* A centred reading column: bubbles never sit a whole window apart. */
[data-am-thread] .astryx-chat-message-list > *,
[data-am-thread] .astryx-chat-composer {
  width: 100%;
  max-width: calc(var(--spacing-12) * 16);
  margin-inline: auto;
}
[data-am-thread] .astryx-chat-composer { max-width: calc(var(--spacing-12) * 16 - var(--spacing-8)); }
/* Composer: one line at rest, the send button on the same line; it grows upward with the text. */
/* Anchored on the classes Astryx documents (composer, composer input, send button) through :has(), so if the
   internal structure changes these rules simply stop matching and the stock two-row composer remains. */
[data-am-thread] .astryx-chat-composer > :has(.astryx-chat-composer-input):has(.astryx-chat-send-button) { flex-direction: row; align-items: flex-end; gap: var(--spacing-2); padding: var(--spacing-2) var(--spacing-2) var(--spacing-2) var(--spacing-4); }
[data-am-thread] .astryx-chat-composer > * > :has(> .astryx-chat-composer-input) { flex: 1; min-width: 0; padding-block: var(--spacing-1-5); }
[data-am-thread] .astryx-chat-composer > * > :has(.astryx-chat-send-button):not(:has(.astryx-chat-composer-input)) { min-height: 0; }
/* The employee's face sits beside the last bubble of the run (Messages.tsx splits the run after it). */
[data-am-thread] .astryx-chat-message[data-am-run] > :has(> [data-am-portrait], > [data-am-avatar-gap]) { align-self: flex-end; display: flex; }
[data-am-thread] .astryx-chat-message[data-am-run="text"] > :has(> [data-am-portrait]) {
  /* lift it off the time line under that bubble: one supporting line plus the metadata's top padding */
  margin-block-end: calc(var(--text-supporting-size) * var(--text-supporting-leading) + var(--spacing-0-5));
}
[data-am-thread] .astryx-chat-message[data-am-run="cont"] { margin-block-start: calc(var(--spacing-1) - var(--spacing-4)); }

/* Runs: bubbles from one sender sit tight; the run itself is separated by space. */
[data-am-thread] .astryx-chat-message > div:last-child > div { gap: 2px; }
[data-am-thread] .astryx-chat-message-bubble[data-variant="filled"] {
  max-width: min(80%, calc(60ch + var(--spacing-8)));
  border-radius: calc(var(--radius-container) + var(--radius-element));
}
[data-am-thread] .astryx-chat-message-bubble[data-variant="filled"][data-sender="assistant"] {
  background: color-mix(in oklab, var(--color-text-primary) 7%, var(--color-background-surface));
}
/* The manager speaks in ink. */
[data-am-thread] .astryx-chat-message-bubble[data-variant="filled"][data-sender="user"] {
  background: var(--color-accent);
  color: var(--color-on-accent);
}
[data-am-thread] .astryx-chat-message-bubble[data-variant="filled"][data-sender="user"] * { color: inherit; }
/* Grouped corners: the sender side tightens inside a run. */
[data-am-thread] [data-sender="assistant"] .astryx-chat-message-bubble[data-variant="filled"]:has(+ .astryx-chat-message-bubble[data-variant="filled"]) { border-end-start-radius: var(--radius-inner); }
[data-am-thread] [data-sender="assistant"] .astryx-chat-message-bubble[data-variant="filled"] + .astryx-chat-message-bubble[data-variant="filled"] { border-start-start-radius: var(--radius-inner); }
[data-am-thread] [data-sender="user"] .astryx-chat-message-bubble[data-variant="filled"]:has(+ .astryx-chat-message-bubble[data-variant="filled"]) { border-end-end-radius: var(--radius-inner); }
[data-am-thread] [data-sender="user"] .astryx-chat-message-bubble[data-variant="filled"] + .astryx-chat-message-bubble[data-variant="filled"] { border-start-end-radius: var(--radius-inner); }
[data-am-thread] .astryx-chat-message-metadata { padding-block-start: var(--spacing-0-5); }

/* Activity: one quiet line; expanded, a tight checklist with durations on one right edge. */
[data-am-activity] .astryx-collapsible-trigger { padding-block: var(--spacing-1); }
[data-am-activity] .astryx-item { min-height: 0; padding-block: var(--spacing-0-5); }
[data-am-activity] .astryx-collapsible-content { padding-inline-start: var(--spacing-1); }

/* Approval: a hairline card at the bubble column's width, not a grey slab. */
[data-am-approval] { width: min(80%, calc(60ch + var(--spacing-8))); }
/* One text edge: the approval's title sits on the bubble text edge. Its "needs you" colour moves from a dot that
   crowded the title to the card's own hairline (the same deep amber as the sidebar dot). */
[data-am-approval] .astryx-item > :first-child:has(.astryx-status-dot) { display: none; }
[data-am-approval] .astryx-item { column-gap: var(--spacing-3); padding-inline-start: 0; }
[data-am-approval] > .astryx-section { padding-inline-start: calc(var(--spacing-4) - var(--border-width)); }
[data-am-approval] > .astryx-section {
  border: var(--border-width) solid var(--color-border-emphasized);
  border-radius: var(--radius-container);
  background: var(--color-background-surface);
}
[data-am-approval] .astryx-item { padding: 0; }
[data-am-approval] > .astryx-section { border-color: color-mix(in oklab, oklch(from var(--color-warning) 0.64 c calc(h - 14)) 70%, var(--color-background-surface)); }


@media (prefers-reduced-motion: no-preference) {
  /* A new bubble rises 6 px and fades in. Only the newest one: history never moves. */
  [data-am-thread] .astryx-chat-message:last-of-type > div:last-child > div > :last-child { animation: am-rise var(--duration-fast) var(--ease-entrance) both; }
}
@keyframes am-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}


/* ---------- Round two: exactness ---------- */
/* Activity: the chevron hangs in the gutter so "Worked for 6 min" starts on the bubble text edge. */
[data-am-activity] > .astryx-collapsible-trigger { position: relative; inset-inline-start: calc(-1 * (var(--spacing-6) + 1px)); }
/* The composer is the only floating thing; a hairline, not a shadow. */
[data-am-thread] .astryx-chat-composer > :has(.astryx-chat-composer-input) { box-shadow: none; border: var(--border-width) solid var(--color-border-emphasized); }
/* Drawers over the thread get an edge. */
.astryx-drawer[data-am-drawer], [data-am-drawer] { border-inline-start: var(--border-width) solid var(--color-border-emphasized); }
[data-am-drawer] .astryx-layout-content { padding-block-end: var(--spacing-6); }
/* Sidebar: the time sits on the name's line, the count on the second line's. */
[data-am-people] .astryx-list-item > :last-child:has([data-am-num]) { align-self: stretch; }
[data-am-people] [data-am-num] { height: 100%; justify-content: space-between; }
/* The unread count must not make its row taller: every row is 56 px. */
[data-am-people] [data-am-num] .astryx-badge { margin-block: calc(-1 * var(--spacing-0-5)); }
/* Header band: the brand row is as tall as the top bar and centred on the same line. */
nav.astryx-side-nav > :first-child { min-height: calc(var(--spacing-12) + var(--spacing-4)); justify-content: center; box-sizing: border-box; }
/* In the Mac window the traffic lights occupy y 6-30 at the top left: both title bands grow by 8 px, so the
   brand and the top bar's name-and-role block share the centre line y 50, below the lights (replaces the shell's 28 px inset). */
html[data-am-electron] nav.astryx-side-nav > :first-child { padding-block: var(--spacing-2) 0; min-height: calc(var(--spacing-12) + var(--spacing-11)); }
html[data-am-electron] [data-am-topbar] { padding-top: calc(var(--spacing-2) - 1px); }
/* Typing: three dots in a bubble, fading in turn. */
[data-am-typing] { height: var(--spacing-5); }
[data-am-typing-dot] { border-radius: var(--radius-full); background: var(--color-text-secondary); opacity: 0.4; }
@media (prefers-reduced-motion: no-preference) {
  [data-am-typing-dot] { animation: am-typing 1.2s var(--ease-standard) infinite both; }
  [data-am-typing-dot="1"] { animation-delay: 0.2s; }
  [data-am-typing-dot="2"] { animation-delay: 0.4s; }
}
@keyframes am-typing { 0%, 100% { opacity: 0.4; } 40% { opacity: 1; } }
`;
