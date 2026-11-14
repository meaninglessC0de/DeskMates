# Sub-tracks we are targeting

Main track: **Autonomous Agents**. We are also going for three sub-tracks. For each: the goal, what we know, what is open, and what the planning or design agent must research. Confidence tags: `verified` / `reported` / `unverified`. Facts below were checked on 2026-11-14 and can change; re-check before relying on a limit.

---

## 1. Best use of Figma

**Goal:** Be eligible for the Figma prize by having a design that is visibly professional, clean and distinctive.

**What we know**
- The user says the front end must follow best professional design practice and stand out. Design quality is the whole point of this sub-track.
- `reported` (user): "if you use Astryx, that counts for this track." The user said this by voice; it was transcribed as "asterisks" and read as **Astryx** (Meta's open-source design system, https://github.com/meta/astryx). **Not verified.** A web search on 2026-11-14 found no public listing of a Figma prize for this event, so we have no official rule text.
- Astryx is already installed and mandatory for all front end (see `AGENTS.md`).
- The Figma MCP server is configured in the Claude Code setup used here, so designs can be created or read in Figma if that turns out to matter.

**Open questions**
- What exactly does the Figma prize reward? Using Figma itself, using Astryx, or just design quality? Ask the organisers or the Figma sponsor at the event, and record the answer in `decisions.md`.
- Does it need a Figma file link in the submission?

**Research agenda for the design agent**
- Browse for the Figma prize rules (event page, Discord, Devpost, sponsor posts) and for what Figma judges tend to reward in hackathons.
- If a Figma file is rewarded, propose the cheapest way to produce one that matches the Astryx build (design the key screens in Figma, then implement from it) without slowing delivery.

**Design bar (applies regardless):** Astryx neutral theme, uncluttered, minimal copy, one primary action per view, designed empty/loading/error states, consistent spacing from tokens. Every screen should look finished enough to screenshot for the submission.

---

## 2. Databricks bounty (£960 + swag)

**Goal:** Qualify for and ideally win: "Build on the Databricks Data Intelligence Platform: a pipeline, agent or app. Scored on creativity, technical depth and real-world impact."

**Constraints from the user (hard)**
- It must fit **seamlessly** into the app, not be bolted on or forced.
- It must **not** raise cost much, and must **not** hurt operational ease compared with simply doing it another way.
- It must **not** pull the design away from the clean look.

**Facts (`verified` from docs.databricks.com on 2026-11-14 unless noted)**
- **Free Edition** is non-commercial, with no SLA. Limits that matter:
  - Up to **3 Databricks Apps** per account; an app runs up to **24 h** after start/update/redeploy, then stops (restartable).
  - **1 SQL warehouse**, size 2X-Small. Serverless compute only.
  - **Outbound internet limited to trusted domains.** This may block an app running on Databricks from calling Synthesia, LiveKit or other APIs. Must be tested early.
  - **1 Lakebase** (managed Postgres) project, scale-to-zero. **1 AI Search** (vector search) endpoint with 1 unit; no Direct Vector Access.
  - No GPU serving, no provisioned throughput. Foundation Model API pay-per-token availability on Free Edition is **not stated**; community posts report failures (`reported`).
  - Fair-use: exceeding quota can shut compute down for the rest of the day or month.
  - LinkedIn verification may raise some limits (details unclear).
- **Databricks Apps** run serverless and support Node.js (React, Angular, Svelte, Express) and Python (Streamlit, Dash, Gradio). Apps use OAuth. Billing on paid workspaces is per running hour.
- **Foundation Model APIs** are mostly OpenAI-compatible and callable with a Databricks token. Model list is in the workspace AI Gateway.
- **MLflow Tracing** stores agent traces (inputs, outputs, latency, token usage, cost) as Unity Catalog Delta tables, queryable with SQL, with autologging for 30+ frameworks. Whether a non-Databricks-hosted Node or Python app can send traces to a workspace is **not confirmed** (OpenTelemetry is mentioned).
- **SQL Statement Execution API**: `POST /api/2.0/sql/statements` with `warehouse_id` and `statement`; sync wait 5-50 s or async polling; JSON results up to 25 MiB inline. Credential types for this endpoint were not confirmed on the page we read.

**Candidate integration patterns (a starting hypothesis, not a decision)**

| # | Pattern | Why it could fit | Risks |
| --- | --- | --- | --- |
| A | **Databricks as the system of record for agent runs**: write each run, step, result and cost to Delta tables (SQL Statement API and/or MLflow Tracing); show run history and analytics in the UI | Natural for an agent-management app; near-zero cost; thin integration; adds real "technical depth" if combined with tracing and evaluation | Could read as "just logging" unless the data visibly drives a feature in the UI |
| B | **Host the app or agent runtime as a Databricks App** | Most literal reading of "build on the platform" | 3-app cap, 24 h auto-stop, restricted outbound domains, deploy friction |
| C | **Use Foundation Model APIs as one LLM backend** | One more model option, OpenAI-compatible | Free Edition availability unclear; may be worse than calling our usual model directly |
| D | **Lakebase as the app database / agent memory** | Managed Postgres with scale-to-zero | Only worthwhile if we need a database anyway |
| E | **Genie or AI/BI dashboard over run data** ("ask your agent fleet a question") | Strong demo moment, high real-world impact story | More setup; depends on A existing first |

Working hypothesis: **A first** (it composes with whatever the app does and costs almost nothing), with **B or E** added only if time allows and the Free Edition limits are workable. The design agent must confirm or replace this.

**Mandatory research before deciding (planning/design agent)**
1. Browse current Databricks docs and examples: Free Edition status, Apps template for React/Node, MLflow Tracing from external apps (OpenTelemetry), Statement Execution auth, Foundation Model API availability on Free Edition, hackathon-style example projects.
2. Check the outbound-domain allowlist before choosing B.
3. Produce a one-page proposal in `plan.md`: where it appears in the UX (one specific screen or feature), what data flows where, cost estimate, fallback if Databricks is down or rate-limited during the demo, and how it will be shown to judges.
4. Log the decision and the sources in `decisions.md` and `research-log.md`.

---

## 3. Best use of Synthesia (50,000 credits)

**Goal:** "The best product built with Synthesia's Interactive Avatar API."

**Status:** The user will brief us on how the avatar is used. **Do not design the avatar feature until that brief is in `decisions.md`.**

**Facts (`verified` from Synthesia docs and quickstart repo on 2026-11-14 unless noted)**
- Interactive Avatars are **real-time, lip-synced avatars** delivered over **LiveKit**. We bring our own LLM and speech-to-text; Synthesia renders the avatar and can optionally provide text-to-speech.
- Two paths: the Python **`livekit-plugins-synthesia`** plugin (a LiveKit Agents worker), or the direct API (`createinteractiveavatar`, `createinteractiveavatarsession`, then join a LiveKit room).
- Needs: a **Synthesia API key with Interactive Avatar access**, a **LiveKit Cloud** project (free tier works), and an LLM key. The launch post says Interactive Avatars are available to **Enterprise customers**, so confirm hackathon access with the Synthesia sponsor at the event (`reported`).
- Official quickstarts: https://github.com/synthesia-ai/interactive-avatar-quickstarts
  - `minimal/`: Python LiveKit voice agent (STT, LLM, TTS) with the avatar added in three lines. Frontend is a plain LiveKit client.
  - `rag/`: avatar grounded in a knowledge base.
  - `tools/`: the LLM calls tools to fill a form in the browser as you speak, and your edits flow back to the agent over LiveKit data channels. This is the closest pattern to "avatar operates the app".
- A Claude Code and Cursor skill for the integration is at https://github.com/synthesia-ai/skills.
- Docs: https://docs.synthesia.io/reference/interactive-avatars
- Architecture implication: the avatar needs a **Python agent worker** alongside the web front end. The front end (built with Astryx) embeds the LiveKit video and controls; no Synthesia-specific browser code is required.

**Open questions**
- How is the avatar used in the product? (User to brief.)
- Do we have an API key, and what are the session and concurrency limits for the demo?
- Demo environment: stable network and microphone; have a recorded fallback.

**Research agenda:** read the Interactive Avatars docs end to end (errors, limits, events), the `tools/` quickstart, and the skills repo; confirm credits and limits with the sponsor.

---

## Cross-cutting rules for all three

- The three sub-tracks should reinforce one coherent product, not three separate demos. Prefer one story where the avatar (Synthesia), the run data (Databricks) and the polished UI (Figma/Astryx) all serve the same autonomous-agent workflow.
- Ask before spending any money. Prefer free tiers and prize credits.
- Keep a fallback for every live dependency (avatar, Databricks, web search) so the demo cannot fail on stage.
