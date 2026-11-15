/**
 * Custom styling for the dark call and meeting stage. CSS text; Astryx tokens only; selectors on `data-am-*`.
 * Everything is scoped under `[data-am="stage"]` (the stage's AppShell), which sits inside a nested dark Theme,
 * so every token resolves to its dark value here. Raw lengths are hairlines (1 px, 2 px) only.
 * Components that set these attributes: ui/StageTile.tsx, ui/StageChip.tsx, ui/ControlPill.tsx, stage/*.
 */
const S = '[data-am="stage"]';

/**
 * The Desks view (desks/DesksView.tsx): the pill, the face and the Hire label grow with the tile. \`zoom\` takes a
 * unitless factor, set from the tile width in steps (desks/layout.ts SCALE_STEPS), so nothing here is a raw length.
 */
const desksCss = /* css */ `
${S} [data-am-desks-view][data-am-scale="1"] { --am-desks-zoom: 1; }
${S} [data-am-desks-view][data-am-scale="1.25"] { --am-desks-zoom: 1.25; }
${S} [data-am-desks-view][data-am-scale="1.5"] { --am-desks-zoom: 1.5; }
${S} [data-am-desks-view][data-am-scale="1.75"] { --am-desks-zoom: 1.75; }
${S} [data-am-desks-view][data-am-scale="2"] { --am-desks-zoom: 2; }
${S} [data-am-desks-view][data-am-scale="2.25"] { --am-desks-zoom: 2.25; }
${S} [data-am-desks-view][data-am-scale="2.5"] { --am-desks-zoom: 2.5; }
${S} [data-am-desks-view][data-am-scale="2.75"] { --am-desks-zoom: 2.75; }
${S} [data-am-desks-view][data-am-scale="3"] { --am-desks-zoom: 3; }
${S} [data-am-desks-view] [data-am="tile-chip"] {
  padding: calc(var(--spacing-1) * var(--am-desks-zoom, 1));
}
${S} [data-am-desks-view] [data-am="chip"],
${S} [data-am-desks-view] [data-am="desk-hire"],
${S} [data-am-desks-view] [data-am="desk-face-window"] {
  zoom: var(--am-desks-zoom, 1);
}
${S} [data-am-desks-view] [data-am="desk-face"] {
  padding: calc(var(--spacing-3) * var(--am-desks-zoom, 1));
}
${S} [data-am="desk-face-window"] {
  border-radius: var(--radius-container);
  background: color-mix(in oklab, var(--am-tint-line) 28%, var(--color-background-surface));
  box-shadow: 0 0 0 2px var(--am-tint-line);
  transform-origin: top right;
  min-width: 0;
}
${S} [data-am="desk-hire"] {
  color: var(--am-tint-ink);
}
/* An empty desk is quiet: a faint wash of its desk's colour and a neutral hairline, not the full face wash. */
${S} [data-am-hire] [data-am="tile"][data-am-kind="face"] {
  background: color-mix(in oklab, var(--am-tint-line) 9%, var(--color-background-surface));
}
${S} [data-am-hire] [data-am="tile"][data-am-kind="face"]::before {
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-text-primary) 10%, transparent);
}
${S} [data-am-hire] [data-am="tile"]:hover {
  background: color-mix(in oklab, var(--am-tint-line) 16%, var(--color-background-surface));
}
${S} [data-am="desks-back"] {
  opacity: 0.7;
}
${S} [data-am="desks-back"]:hover,
${S} [data-am="desks-back"]:focus-visible {
  opacity: 1;
}
@media (prefers-reduced-motion: no-preference) {
  ${S} [data-am="desk-face-window"] {
    animation: am-face-pop 360ms var(--ease-entrance) both;
  }
  ${S} [data-am-desk-index="1"] [data-am="desk-face-window"] { animation-delay: 150ms; }
  ${S} [data-am-desk-index="2"] [data-am="desk-face-window"] { animation-delay: 300ms; }
  ${S} [data-am-desk-index="3"] [data-am="desk-face-window"] { animation-delay: 450ms; }
  ${S} [data-am="desk-wait"] {
    animation: am-stage-fade var(--duration-fast-max) var(--ease-entrance) both;
  }
}
@keyframes am-face-pop {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: none; }
}
`;

export const stageCss = /* css */ `
/* ---------- Ground ---------- */
${S},
${S} .astryx-layout-content {
  background: var(--color-background-body);
}
${S} {
  --am-stack-cut: var(--color-background-body);
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
/* Keyboard focus on a tile: the system focus ring, drawn on the hairline layer (above the media) one step inside the
   edge (the hover wrapper clips anything outside), so it stays distinct from the speaking ring on the edge. */
${S} [data-am="tile"]:has(:focus-visible)::before {
  outline: var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color);
  outline-offset: calc(-1 * (var(--focus-outline-width) + var(--spacing-1)));
}

/* No photo yet: the person's tint as a dim wash; the monogram as a darker mark on a bright, soft disc of the same
   tint (the Deskmates logo's coloured squares with their darker dash). */
${S} [data-am="tile"][data-am-kind="face"][data-am-media="off"] {
  background: color-mix(in oklab, var(--am-tint-line) 22%, var(--color-background-surface));
}
${S} [data-am="tile"][data-am-kind="face"] [data-am-portrait] .astryx-avatar-fallback {
  background: color-mix(in oklab, var(--am-tint-ink) 62%, var(--am-tint-line));
  color: color-mix(in oklab, var(--am-tint-line) 58%, var(--color-background-body));
}

/* Photo or video: fills the tile (cover). The cast's framing is square, head and shoulders, hair top at about 8 %.
   A tall tile crops only the sides; a 4:3 tile shows 75 % of the height and a 16:10 tile 62 %, so the anchor sits as
   low as it can while keeping the whole head in (checked for all eight people). */
${S} [data-am-video] {
  object-position: center 40%;
}
${S} [data-am-crop="standard"] [data-am-video] {
  object-position: center 25%;
}
${S} [data-am-crop="wide"] [data-am-video] {
  object-position: center 18%;
}

/* The live video sits over the still and fades in once frames arrive; same crop, so nothing jumps. */
${S} [data-am="video-layer"] [data-am-video] {
  opacity: 0;
}
${S} [data-am="video-layer"] [data-am-video][data-am-playing="on"] {
  opacity: 1;
}

/* The calling moment: the brand loader and "Calling Maya" over the dimmed face, the words in primary text. */
${S} [data-am="tile"] [data-am-loader-wrap] .astryx-text {
  color: var(--color-text-primary);
  font-size: var(--text-label-size);
  font-weight: var(--text-label-weight);
}

/* In a strip row the live video plays inside the portrait circle. */
${S} [data-am="circle-video"] {
  border-radius: var(--radius-full);
  overflow: hidden;
}

/* A desktop letterboxes on black, not on a grey that a dark desktop would bleed into. */
${S} [data-am="tile"][data-am-kind="desktop"] {
  background: var(--color-background-body);
}
${S} [data-am="tile"] [data-am-space] {
  background: transparent;
  border-radius: 0;
}

/* The label reads on a photo, a video or a desktop through its own small capsule (below), not a scrim. */
${S} [data-am="tile-dim"] {
  position: absolute;
  inset: 0;
  width: auto;
  height: auto;
  background: color-mix(in oklab, var(--color-background-body) 70%, transparent);
  opacity: 0;
  pointer-events: none;
}
${S} [data-am="tile-dim"][data-am-on="on"] {
  opacity: 1;
}
${S} [data-am="tile-centre"] {
  position: relative;
  z-index: 3;
}
${S} [data-am="tile-chip"] {
  position: relative;
  z-index: 3;
  min-width: 0;
}

/* ---------- Chip ---------- */
${S} [data-am="chip"] {
  align-items: baseline;
  min-width: 0;
  max-width: 100%;
}
${S} [data-am="chip"] > :not(.astryx-text) {
  align-self: center;
}
${S} [data-am="chip"] .astryx-text[data-type="supporting"] {
  color: color-mix(in oklab, var(--color-text-primary) 86%, transparent);
}
${S} [data-am="chip"] .astryx-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* On a photo, a video or a desktop the label is one small blurred capsule (28 px), so it reads on light clothing and
   bright rooms alike and never darkens the dock under a full-width scrim. On a tint wash it is plain text. */
${S} [data-am="tile"][data-am-media="on"] [data-am="chip"] {
  align-items: center;
  min-height: var(--size-element-sm);
  padding-inline: var(--spacing-3);
  border-radius: var(--radius-full);
  background: color-mix(in oklab, var(--color-background-body) 72%, transparent);
  backdrop-filter: blur(8px);
}
${S} [data-am="tile"][data-am-media="on"] [data-am="chip"]:has(.astryx-button) {
  padding-inline-end: var(--spacing-1);
}
${S} [data-am="chip"] .astryx-text[data-type="supporting"] {
  font-size: var(--text-label-size);
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
${S} [data-am="caption"] .astryx-text[data-type="supporting"] {
  font-size: var(--text-label-size);
}
${S} [data-am="caption"] .astryx-text {
  white-space: nowrap;
}
${S} [data-am="caption-text"] {
  font-weight: var(--font-weight-medium);
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
  min-height: calc(var(--size-element-lg) + var(--spacing-2));
  min-width: calc(var(--size-element-lg) + var(--spacing-2));
}
${S} [data-am="pill"] [data-am="end"] {
  padding-inline: var(--spacing-4);
  background: color-mix(in oklab, var(--color-error) 64%, var(--color-background-body));
  color: var(--color-text-primary);
}
${S} [data-am="pill"] [data-am="end"]:hover {
  background: color-mix(in oklab, var(--color-error) 72%, var(--color-background-body));
}
/* Muted is the one state you must see at a glance: the mic becomes a filled light disc with the slashed glyph. */
${S} [data-am="pill"] [aria-label="Mute"][aria-pressed="true"] {
  background: var(--color-text-primary);
  color: var(--color-background-body);
}
/* Banners on the stage use the app's one banner look (data-am-banner, ui/styles/app.ts); on the dark stage the muted
   band would equal the ground, so it is raised one tone. */
${S} [data-am-banner],
${S} [data-am-banner] .astryx-banner {
  background: var(--color-background-surface);
} .astryx-banner {
  background: var(--color-background-surface);
  color: var(--color-text-primary);
  box-shadow: inset 0 -1px 0 color-mix(in oklab, var(--color-text-primary) 8%, transparent);
}
${S} [data-am="pill-gap"] {
  align-self: center;
}

/* ---------- Summon picker (a dialog over the app, so not under the stage scope) ---------- */
[data-am="people-stack"] > [data-am-portrait] {
  border-radius: var(--radius-full);
  box-shadow: 0 0 0 2px var(--am-stack-cut, var(--color-background-popover));
}
[data-am="people-stack"] > [data-am-portrait] + [data-am-portrait] {
  margin-inline-start: calc(-1 * var(--spacing-1-5));
}

/* ---------- Motion ---------- */
@keyframes am-stage-fade {
  from { opacity: 0; }
}
/* After End the app keeps the stage mounted and fades its root (App.tsx, ui/styles/app.ts); Stage shows its last
   frame meanwhile. Nothing to add here: fading the stage too would compound the two fades. */
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
  ${S} [data-am="tile-dim"] {
    transition: opacity var(--duration-fast-max) var(--ease-standard);
  }
  ${S} [data-am="tile-chip"],
  ${S} [data-am="tile-centre"] {
    animation: am-stage-fade var(--duration-fast-max) var(--ease-entrance) both;
  }
}
${desksCss}
`;
