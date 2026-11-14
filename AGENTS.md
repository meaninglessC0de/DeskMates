# AGENTS

Project-specific guidance for AI coding agents.

## MANDATORY: Read the shared hackathon context first

We are in the **Imperial AI Hack** (main track: Autonomous Agents; sub-tracks: Figma, Databricks, Synthesia). `docs/hackathon/` is the single shared memory for every agent and sub-agent.

- **Before planning or building, read `docs/hackathon/README.md`**, then `decisions.md`, `subtracks.md` and `plan.md`.
- **Write back, don't just reply:** record user requirements and decisions in `docs/hackathon/decisions.md` and web findings in `docs/hackathon/research-log.md`. Keep one plan in `docs/hackathon/plan.md` and edit it in place.
- **Planning and design agents must browse the web** (WebSearch, WebFetch or the browser) to check current sponsor docs, limits and prize rules before choosing an approach. The `design-planner` agent (`.claude/agents/design-planner.md`) does this by default.
- **Sub-agent briefs must say:** "Read docs/hackathon/README.md first; front end must use Astryx; write findings back to docs/hackathon/."
- Prize-driven scope: Databricks must fit the app seamlessly at near-zero cost, and Synthesia usage waits for the user's brief. Details in `docs/hackathon/subtracks.md`.

## MANDATORY: Astryx for ALL front-end work

This is a hard, non-negotiable requirement of this hackathon project. It applies to every agent, sub-agent, teammate and tool that touches this repository, with no exceptions and no "just this once".

- **Every UI, page, component, screen, form, chart wrapper or visual in this repo MUST be built with Astryx** (`@astryxdesign/core` + `@astryxdesign/theme-neutral`, docs at https://astryx.atmeta.com, source at https://github.com/meta/astryx). Never use another UI library (MUI, Chakra, shadcn, Radix, Ant, Bootstrap, etc.), and never hand-roll a component Astryx already provides.
- **Look it up, don't guess.** Before writing UI, run `npx astryx search "<what you need>"`, `npx astryx component <Name>` for props, and `npx astryx template --list` to start pages from a template. Run `npx astryx docs` for guides (layout, tokens, theme).
- **If Astryx lacks something**, compose it from Astryx components and tokens first. Only report the gap with `npx astryx gap-report` and ask the user before introducing anything outside Astryx.
- **Sub-agents:** any agent that spawns or briefs another agent must include this rule in the brief: "Front end must use Astryx; read AGENTS.md first."
- **Before delivering any front-end work**, run `npx astryx doctor --built <dir>` and fix everything it flags. Do not deliver if it fails.
- **App root wiring (already installed, wire it once when the app is created):** the neutral theme module is generated at `astryx-themes.js` (do not edit it by hand). Import `reset.css` and `astryx.css` from `@astryxdesign/core`, then render `<Theme theme={themes[defaultThemeSlug]}>` (`Theme` from `@astryxdesign/core/theme`, `themes` and `defaultThemeSlug` from `astryx-themes.js`) around the whole app. `astryx doctor` warns until an app imports it.

### Design standard: professional, calm, uncluttered

Astryx's components and the neutral theme already encode good design, so lean on them and stay out of their way.

- **Less is more.** Every element must earn its place. One clear primary action per view. If something does not help the user decide or act, delete it.
- **Minimal copy.** Short labels and sentence case. No filler headings, no explanatory paragraphs, no lorem ipsum, no marketing blurbs inside the app. Use a tooltip or a one-line hint only when truly needed.
- **Whitespace over decoration.** Use the layout, spacing and gap props that Astryx components provide. No gradients, drop-shadow stacking, emoji, borders-inside-borders or Card-inside-Card nesting. Do not wrap everything in a Card.
- **Clear hierarchy.** At most one prominent heading per section, a restrained type scale from the tokens, and consistent alignment. Group related things, separate unrelated things.
- **Dense data as rows.** Use Table or List/Item for lists of records, not a grid of cards.
- **Calm color.** Stay on the neutral theme with a single accent. Colors come from theme tokens (`var(--color-*)`), never raw hex. Status colors only for real status.
- **States are designed.** Every view has a one-line empty state, a loading state and an error state, all using Astryx components.
- **Accessible and responsive by default.** Keep Astryx's built-in accessibility (labels, focus, contrast) and check narrow widths.

<!-- ASTRYX:START -->
Astryx v0.7.16 · 174 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.
Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:
- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then tokens (var(--color-*|--spacing-*|--radius-*)). No raw hex/px. No StyleX/Tailwind compiler here — don't use xstyle/utility classes directly. Some templates use StyleX and need a compiler plugin; see `astryx docs styling-overview`.
- THEMES: palettes and custom colors go through the theme, never :root overrides. To make or change a theme (colors, fonts, corners, spacing, a look from a picture), prefer the experimental theme editor over hand-written theme files: `astryx experimental theme editor new <name> --like neutral`, then `editor set <name> <thing> <value>` or `editor how "<what you want>"`; wire it with `astryx theme add <name>`; after each change look at it with `astryx experimental theme editor show <name> --png` and open the PNGs it writes (changes nothing in the app); a theme change is not done until you have looked at the pictures. In code, extend an imported theme to customize it; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token.

`astryx help` lists every command. Key ones beyond the workflow:
  search "<query>"   find any component / hook / doc / template
  discover <words>   integrations you could add
  docs <topic>       getting-started, principles, tokens, theme … (`astryx docs` lists all)
  docs cli           commands and API reference
  docs authoring     build an integration package, and every field it holds
  upgrade --from <old version> --apply   run after a dependency bump
<!-- ASTRYX:END -->
