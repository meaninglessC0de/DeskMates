# Product brief (from the user, 2026-11-14)

Source: the user's voice brief, transcribed. Confidence `reported` (voice transcription; product names may be mis-transcribed). This is the answer to Q-001 and Q-003. Working name: **Agent Manager** (will be renamed later).

## One line

A Mac app where you hire and manage a team of AI employees. Each one has a name, a face, a role and **its own desktop**, works on long tasks by itself, messages you, and can be called on video.

## Must have

1. **One desktop per employee.** Each AI employee gets its own **Cua Space** (https://github.com/trycua/cua, local copy in `vendor/cua/`): a full desktop on the user's Mac, separate from the user's own, so they work in parallel without interrupting the user. Cua is non-negotiable. Desktop tools come from **Cua Driver**.
2. **Long-horizon workers.** Give an employee a task and it keeps looping until it is done, using computer use and tools. Do not build the harness from scratch: fork or reuse a popular open-source one (the user named "Meta Muse", "OpenAI Dots", "Claude Duet" as the kind of product; names are from voice and unverified).
3. **Personas.** Human name, face, personality and role. Create from **role presets** (web developer, marketing, and so on) or by **describing a role**. The portrait is generated at creation.
4. **Messaging, like iMessage.** A left panel lists every employee, stacked, each with its portrait. Click one to chat. Employees **message the user by themselves** while working; it arrives as a **notification** and the user replies in the app. Employees can also **message each other**.
5. **Live screen.** The user can watch any employee's desktop live from its chat.
6. **Video call.** Call one employee: its **face moves and speaks with its voice**, and the call shows a **live copy of its screen**. Faces only need to animate during a call.
7. **Summon meeting.** A button at the **top right** opens a picker of who to summon, then our own Zoom-style meeting screen. If multi-party turn-taking proves too hard, drop the group call and keep the one-to-one call.
8. **Per-employee permissions.** Each employee's desktop can have a different permission level (for example a marketing employee asks less, a web developer needs more). Feasibility to be confirmed and reported back.
9. **Main-screen access.** One employee can be given the user's real screen, or be given it temporarily and then switch back to its own desktop.
10. **Runs as an app and in the background**, without being heavy on resources.

## Design

- **Astryx only** (D-001), clean, professional, uncluttered, minimal text, intuitive. It must look good enough for the Figma prize.
- The meeting screen is the most ambitious design and gets its own design pass, still in Astryx so the app stays uniform.

## Sponsors

- **Avatar and voice:** choose between Synthesia, ElevenLabs, Anam and fal by fit with the tracks and the product.
- **Databricks:** use it where it fits naturally, never forced (D-005).

## Out of scope

- Prompt-injection defences and similar hardening. Build only what the vision needs; no extra features.

## How it gets built

- Plan first, in full detail, so the build can be **one-shotted overnight** while the user sleeps. No surprises mid-build: everything researched first.
- **Orchestration:** one orchestrator (Claude Fable) owns taste, design and the plan; all sub-agents are **Sonnet**. The orchestrator briefs them in detail, steers them, and keeps everything documented here.
- **Reuse over rewrite:** make local copies of useful GitHub repos and refactor their connectors. Each candidate repo is studied by a sub-agent before it is chosen.
- After the build: end-to-end test, then iterate until it works.
- The user will supply API keys on request.
