/** Custom styling for everything outside the call stage. CSS text; Astryx tokens only; selectors on `data-am-*`. */

/**
 * The eight personal tints, in slot order (see ui/tint.ts). Slots 0-3 are the Deskmates logo's four hues
 * (blue, orange, pink, green); 4-7 sit between them (violet, teal, amber, coral). Red is left out: it means stuck and End.
 * Brand hues are the one place literal oklch() is allowed: same lightness and chroma for all eight, so they weigh the same.
 */
const TINT_HUES = [262, 62, 357, 160, 300, 200, 90, 25] as const;

const tintVars = TINT_HUES.map(
  (h, i) => `
  --am-tint-${i}: light-dark(oklch(0.9 0.05 ${h}), oklch(0.36 0.055 ${h}));
  --am-tint-ink-${i}: light-dark(oklch(0.42 0.1 ${h}), oklch(0.88 0.07 ${h}));
  --am-tint-line-${i}: oklch(0.75 0.15 ${h});`,
).join('');

const tintSelectors = TINT_HUES.map(
  (_, i) => `[data-am-tint="${i}"] { --am-tint: var(--am-tint-${i}); --am-tint-ink: var(--am-tint-ink-${i}); --am-tint-line: var(--am-tint-line-${i}); }`,
).join('\n');

export const appCss = /* css */ `
/* Personal tints. Declared on every theme root so they resolve against that theme's tokens (light app, dark stage). */
:root, [data-astryx-theme], [data-theme] {${tintVars}
}
${tintSelectors}

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
.astryx-status-dot[data-variant="warning"] { background-color: var(--color-warning); }

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
[data-am-footer] { padding-inline: var(--spacing-2); }

/* State banners (desktop off, paused) are facts, not alarms: a quiet band. Stuck keeps its red. */
[data-am-quiet], [data-am-quiet] .astryx-banner { background: var(--color-background-muted); color: var(--color-text-primary); border-color: var(--color-border); }
[data-am-quiet] svg { color: var(--color-icon-secondary); }
[data-am-quiet] .astryx-text { color: var(--color-text-primary); }

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
  [data-am-identity] { animation: am-fade var(--duration-fast-max) var(--ease-entrance) both; }
}
[data-am-hire-footer] .astryx-button { min-width: calc(var(--spacing-12) * 4); }
@keyframes am-fade { from { opacity: 0; } to { opacity: 1; } }

/* ---------- Settings ---------- */
[data-am-connections] .astryx-item { padding-inline: 0; min-height: 0; padding-block: var(--spacing-1); }

/* ---------- Team ---------- */
[data-am-figure] { letter-spacing: -0.01em; }
[data-am-synced] a { font-size: inherit; color: var(--color-text-primary); text-decoration: underline; text-decoration-color: var(--color-border-emphasized); text-underline-offset: 0.2em; }
[data-am-synced] a:hover { text-decoration-color: currentColor; }

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
[data-am-thread] .astryx-chat-composer > div:first-child { flex-direction: row; align-items: flex-end; gap: var(--spacing-2); padding: var(--spacing-2) var(--spacing-2) var(--spacing-2) var(--spacing-4); }
[data-am-thread] .astryx-chat-composer > div:first-child > div:first-child { flex: 1; min-width: 0; padding-block: var(--spacing-1-5); }
[data-am-thread] .astryx-chat-composer > div:first-child > div:last-child { min-height: 0; }
/* Runs: bubbles from one sender sit tight; the run itself is separated by space. */
[data-am-thread] .astryx-chat-message > div:last-child > div { gap: 2px; }
[data-am-thread] .astryx-chat-message-bubble[data-variant="filled"] {
  max-width: min(max(80%, 280px), 62ch);
  border-radius: var(--radius-page);
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
[data-am-approval] { width: min(100%, 62ch); }
[data-am-approval] > .astryx-section {
  border: var(--border-width) solid var(--color-border-emphasized);
  border-radius: var(--radius-container);
  background: var(--color-background-surface);
}
[data-am-approval] .astryx-item { padding: 0; }

@media (prefers-reduced-motion: no-preference) {
  /* A new bubble rises 6 px and fades in. Only the newest one: history never moves. */
  [data-am-thread] .astryx-chat-message:last-of-type > div:last-child > div > :last-child { animation: am-rise var(--duration-fast) var(--ease-entrance) both; }
}
@keyframes am-rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
`;
