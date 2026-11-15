/**
 * Custom styling for the dark call and meeting stage. CSS text; Astryx tokens only; selectors on `data-am-*`.
 * Everything is scoped under `[data-am="stage"]` (the stage's AppShell), which sits inside a nested dark Theme,
 * so every token resolves to its dark value here. Raw lengths are hairlines (1 px, 2 px) only.
 * Components that set these attributes: ui/StageTile.tsx, ui/StageChip.tsx, ui/ControlPill.tsx, stage/*.
 */
const S = '[data-am="stage"]';

export const stageCss = /* css */ `
/* ---------- Ground ---------- */
${S},
${S} .astryx-layout-content {
  background: var(--color-background-body);
}
${S} [data-am="stage-top"] {
  font-variant-numeric: tabular-nums;
}
${S} [data-am="stage-top"] .astryx-text {
  white-space: nowrap;
}

/* ---------- Tiles: one frame for faces and desktops ---------- */
${S} [data-am="tile"] {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  border-radius: var(--radius-container);
  background: var(--color-background-surface);
  box-shadow: none;
}
/* SelectableCard draws its selection ring as an inset shadow; the stage draws its own ring above the media. */
${S} [data-am="tile"][data-selected] {
  box-shadow: none;
}
/* Hairline (::before) and speaking ring (::after) sit above video, photo and canvas. */
${S} [data-am="tile"]::before,
${S} [data-am="tile"]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 2;
}
${S} [data-am="tile"]::before {
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-text-primary) 10%, transparent);
}
${S} [data-am="tile"][data-am-kind="face"]::before {
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--am-tint-line) 70%, transparent);
}
${S} [data-am="tile"]::after {
  box-shadow: inset 0 0 0 2px var(--color-accent);
  opacity: 0;
}
${S} [data-am="tile"][data-am-ring="on"]::after {
  opacity: 1;
}

/* No photo yet: the person's tint as a dim wash; the monogram as a darker mark on a bright, soft disc of the same
   tint (the Deskmates logo's coloured squares with their darker dash). */
${S} [data-am="tile"][data-am-kind="face"][data-am-media="off"] {
  background: color-mix(in oklab, var(--am-tint-line) 34%, var(--color-background-body));
}
${S} [data-am="tile"][data-am-kind="face"] [data-am-portrait] .astryx-avatar-fallback {
  background: color-mix(in oklab, var(--am-tint-ink) 62%, var(--am-tint-line));
  color: color-mix(in oklab, var(--am-tint-line) 58%, var(--color-background-body));
}

/* Photo or video: fills the tile (cover). With the cast's square framing, 40 % keeps the whole head in a 4:3 tile
   and puts the eyes just above the middle; a tall column tile crops only the sides. */
${S} [data-am-video] {
  object-position: center 40%;
}

/* The live video sits over the still and fades in once frames arrive; same crop, so nothing jumps. */
${S} [data-am="video-layer"] [data-am-video] {
  opacity: 0;
}
${S} [data-am="video-layer"] [data-am-video][data-am-playing="on"] {
  opacity: 1;
}

/* A desktop letterboxes on black, not on a grey that a dark desktop would bleed into. */
${S} [data-am="tile"][data-am-kind="desktop"] {
  background: var(--color-background-body);
}
${S} [data-am="tile"] [data-am-space] {
  background: transparent;
  border-radius: 0;
}

/* The label's scrim: a short gradient under the name on a photo or video; nothing on a tint wash. */
${S} [data-am="tile"][data-am-kind="face"][data-am-media="on"] > .astryx-overlay > .astryx-overlay-scrim[data-position="bottom"] {
  padding-top: var(--spacing-10);
  background: linear-gradient(
    to top,
    color-mix(in oklab, var(--color-background-body) 66%, transparent) 0%,
    color-mix(in oklab, var(--color-background-body) 40%, transparent) 38%,
    color-mix(in oklab, var(--color-background-body) 14%, transparent) 72%,
    transparent 100%
  );
}
${S} [data-am="tile-chip"] {
  position: relative;
  z-index: 3;
  min-width: 0;
}

/* ---------- Chip ---------- */
${S} [data-am="chip"] {
  min-width: 0;
  max-width: 100%;
  min-height: var(--size-element-md);
}
${S} [data-am="chip"] .astryx-text[data-type="supporting"] {
  color: color-mix(in oklab, var(--color-text-primary) 66%, transparent);
}
${S} [data-am="chip"] .astryx-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* On a desktop the label is a small blurred capsule, so it does not darken the dock under a full-width scrim. */
${S} [data-am="tile"][data-am-kind="desktop"] [data-am="chip"] {
  padding-inline: var(--spacing-3) var(--spacing-2);
  border-radius: var(--radius-full);
  background: color-mix(in oklab, var(--color-background-body) 78%, transparent);
  backdrop-filter: blur(8px);
}
${S} [data-am="tile"][data-am-kind="desktop"] [data-am="chip"]:not(:has(.astryx-button)) {
  padding-inline: var(--spacing-3);
}

/* A small tile laid over a large one (narrow windows) lifts off it. */
${S} [data-am="inset"] [data-am="tile"] {
  box-shadow: var(--shadow-high);
}

/* ---------- Type box, docked at the bottom of the right column ---------- */
${S} [data-am="composer"] > .astryx-chat-composer {
  height: 100%;
}
${S} [data-am="composer"] > .astryx-chat-composer > div {
  height: 100%;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-2);
  padding-block: 0;
  padding-inline: var(--spacing-4) var(--spacing-2);
  border-radius: var(--radius-container);
  background: var(--color-background-surface);
  border-color: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-text-primary) 10%, transparent);
}
${S} [data-am="composer"] > .astryx-chat-composer > div > div:first-child {
  flex: 1;
  min-width: 0;
}
${S} [data-am="composer"] [contenteditable] {
  max-height: 1lh;
  overflow-y: auto;
}
${S} [data-am="composer"] .astryx-button {
  border-radius: var(--radius-full);
}

/* ---------- Caption line ---------- */
${S} [data-am="caption"] {
  opacity: 1;
}
${S} [data-am="caption"][data-am-shown="off"] {
  opacity: 0;
}
${S} [data-am="caption"] > .astryx-stack {
  align-items: baseline;
}
${S} [data-am="caption"] .astryx-text {
  white-space: nowrap;
}
${S} [data-am="caption-text"] {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* ---------- Control pill ---------- */
${S} [data-am="pill"] {
  border-radius: var(--radius-full);
  background: var(--color-background-surface);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-text-primary) 8%, transparent);
}
${S} [data-am="pill"] .astryx-button,
${S} [data-am="pill"] .astryx-toggle-button,
${S} [data-am="pill"] button {
  border-radius: var(--radius-full);
  min-height: calc(var(--size-element-lg) + var(--spacing-1));
  min-width: calc(var(--size-element-lg) + var(--spacing-1));
}
${S} [data-am="pill"] [data-am="end"] {
  padding-inline: var(--spacing-4);
  background: color-mix(in oklab, var(--color-error) 78%, var(--color-background-body));
  color: var(--color-text-primary);
}
${S} [data-am="pill"] [data-am="end"]:hover {
  background: color-mix(in oklab, var(--color-error) 90%, var(--color-background-body));
}
${S} [data-am="pill-gap"] {
  align-self: center;
}

/* ---------- Summon picker (a dialog over the app, so not under the stage scope) ---------- */
[data-am-picker] [data-am="people-stack"] > [data-am-portrait] {
  border-radius: var(--radius-full);
  box-shadow: 0 0 0 2px var(--color-background-popover);
}
[data-am-picker] [data-am="people-stack"] > [data-am-portrait] + [data-am-portrait] {
  margin-inline-start: calc(-1 * var(--spacing-1-5));
}

/* ---------- Motion (the brief's five; only two live here) ---------- */
@keyframes am-stage-fade {
  from { opacity: 0; }
}
@media (prefers-reduced-motion: no-preference) {
  ${S} {
    animation: am-stage-fade var(--duration-fast-max) var(--ease-entrance) both;
  }
  ${S} [data-am="stage-body"] {
    animation: am-stage-fade var(--duration-fast-max) var(--ease-entrance) both;
  }
  ${S} [data-am="tile"]::after {
    transition: opacity var(--duration-fast) var(--ease-standard);
  }
  ${S} [data-am="caption"] {
    transition: opacity var(--duration-fast) var(--ease-exit);
  }
  ${S} [data-am="video-layer"] [data-am-video] {
    transition: opacity var(--duration-medium-min) var(--ease-standard);
  }
}
`;
