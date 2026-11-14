# 04 · Agent harness: what the user meant, candidates, recommendation

Author: research sub-agent (Sonnet), 2026-11-14. Research only: nothing was installed or run. Web pages and repo text were treated as data.
Tags: `verified` = read in code or an official doc (path or URL given), `reported` = second-hand (news, blogs), `unverified` = not checked or inferred.
Star counts, last pushes and licences were pulled from the GitHub API on 2026-11-14 (`gh api repos/...`). npm versions from `npm view` the same day.

## Summary (10 lines)

1. The three voice names are real 2026 products: **Meta Muse** (launched 2026-09-08), **OpenAI dots** (2026-09-29, DevDay), **Claude Duet** (2026-10-21, research preview). All three are proactive, always-on personal agents that run in a cloud VM with their own browser and message you first. None is open source; none publishes its harness code.
2. The product the user wants (a team of persona'd long-horizon workers that message you, each with its own desktop) is closest to dots ("specialist dots with own identities") plus Duet ("messages you first"). The open-source analogue is a harness plus our own app shell, not a clone of any one repo.
3. **Primary: Claude Agent SDK (TypeScript, `@anthropic-ai/claude-agent-sdk` 0.3.325) used as a library**, one `query()` with streaming input per employee. It is the only candidate that ticks every box in the brief out of the box: in-process custom tools, per-instance MCP (stdio, HTTP, in-process), `canUseTool` approval callback, `streamInput()` steering, `interrupt()`, compaction, `resume`, subagents, `TodoWrite`, `maxTurns`/`maxBudgetUsd`, prompt caching, native image tool results. Cua already ships a working Claude Agent SDK + `cua-driver mcp` example (`vendor/cua/libs/cua-driver/examples/agent-sdks/claude_agent.ts`).
4. **Fallback: pi** (`@earendil-works/pi-agent-core` + `pi-ai` + `pi-mcp`, MIT, 122k stars). Pure in-process TS library, any model provider, steering and follow-up queues, compaction, MCP client with image passthrough. Needs more glue (no permission system, no subagents, no todo by default) but has no subprocess per employee and no vendor lock.
5. Third option and reference code: **Cua's own `sandbox.agents()` / ACP runner**, which already runs `claude-code`, `opencode`, `goose`, `pi`, `hermes`, `openclaw`, `openai-codex` inside a Space with the Space's cua-driver MCP attached. Best used as a pattern and a swap-in transport, not as the main loop (it runs the harness inside the Space, and `agent_message` while a turn runs is documented as refused for persistent agents).
6. The two giants, **OpenClaw** (394k stars) and **Hermes Agent** (263k), are products with gateways, 20+ chat channels and sprawling repos. Useful to read (steering queue, SOUL.md personas, memory, multi-agent) but too heavy and fast-moving to fork overnight.
7. Biggest risks: Claude Agent SDK spawns one `claude` subprocess per employee (Anthropic suggests budgeting 1 GiB RAM each, so 6 employees is up to about 6 GiB, `unverified` on a real MacBook); the TS repo has **no source** (proprietary licence, Commercial Terms); API key required (claude.ai login for third-party products is not allowed); Electron packaging of the native binary is untested.
8. Messaging design: `message_user` is fire-and-forget; replies are injected into the employee's input stream as a new user message (no blocking tool, no timeouts). `ask_permission` rides `canUseTool`, which has no park deadline.
9. 14 long-horizon rules with source URLs are in the last-but-one section; the top ones are a progress file plus JSON feature list, one feature per session, separate evaluator, todo recitation and a durable event log.
10. Cloned for reading under `vendor/_research/`: claude-agent-sdk-typescript, claude-agent-sdk-python, pi, opencode, openclaw, hermes-agent, goose, OpenHands, deepagents.

## 1. What the user meant

All three names resolve to real products announced in the last ten weeks. Dates and facts below come from news coverage and the vendors' own pages; the architecture lines are company claims.

| Voice name | Real product | What it is (3 lines) | What is public about the architecture |
| --- | --- | --- | --- |
| "Meta Muse" | **Muse**, Meta, launched 2026-09-08 (US first) | A personal agent that sends email, books travel, fills forms, negotiates and checks out for you, and keeps working after you leave the app. Reachable in its own app, muse.ai and WhatsApp; checkout via Link by Stripe; paid tiers $20 and $100 `reported`. Powered by Meta's model Muse Spark `reported` (sources conflict). | Runs in a "dedicated, secure computer with its own browser" (Muse Secure VM) with a separate isolated "Sentinel" agent on the same VM; no visibility of passwords or card numbers (company claims). Source: TechCrunch 2026-09-08 `reported`, https://techcrunch.com/2026/09/08/meta-debuts-its-muse-ai-agent-will-consumers-trust-it/. No code, no harness published. Separately, **Muse Code** (a coding agent, https://research.meta.ai/blog/introducing-muse-code-and-muse-spark-1-2) loads MCP servers from `~/.config/muse/settings.json`; Cua Driver documents this (`vendor/cua/libs/cua-driver/README.md`, section "Muse Code") `verified`. The earlier Manus acquisition (announced late Dec 2025) is a separate line; I found no source tying Muse to Manus `unverified`. |
| "OpenAI Dots" | **dots**, OpenAI, announced 2026-09-29 at DevDay | "Always-on" agents that pursue user-defined goals in the background, remember preferences and are reached through ChatGPT, Slack, Teams (text messaging coming). "Specialist dots" can get their own identities, credentials and tools; enterprise integration with Microsoft Agent 365. Cartoon floating-dot avatar branding. Powered by GPT-6 Astra. | Model, identity/credential/tool provisioning and approval rules are described. One roundup says each dot has its own cloud computer and browser and reaches 4,000+ apps through plugins `reported` (the TechCrunch piece does not confirm the computer: https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/). The official page https://openai.com/dots/ returned HTTP 403 to my fetcher, so I could not read it. No developer API or open source mentioned. |
| "Claude Duet" | **Claude Duet**, Anthropic, research preview 2026-10-21 | A standalone proactive agent app: morning brief, monitors connected apps, messages you when something needs attention, completes assigned tasks, asks approval before sending messages, paying, signing or deleting. Built around Claude Opus 5.5; US Pro/Max/Ultra waitlist; iOS, Android, claude.ai. | Per the official page https://www.claude.com/resources/articles/claude-duet `verified`: "a virtual machine with its own browser"; runs when your devices are off; checks connected accounts every few hours; credential handling follows the Claude Managed Agents design (agent never sees passwords or tokens); an auto-mode classifier approves actions; 6,000+ connectors/plugins. The page does not mention SDK or harness. Closest public Anthropic architecture material: the Managed Agents post (session log, harness and sandbox decoupled) https://anthropic.com/engineering/managed-agents `verified`. |

Takeaways for us:
- The shared pattern is: persistent agent identity, own sandboxed computer, proactive messaging, approval gates for sensitive actions. That is exactly the brief. Our differentiator is the team and the visible desktop and video call.
- None can be forked. "Do not write the harness from scratch" therefore means: reuse an open harness or the Claude Agent SDK, and copy patterns.
- Naming: Anthropic's SDK branding rules forbid calling our product "Claude Code" or mimicking it; "Claude Agent" or "Powered by Claude" is fine `verified` (https://code.claude.com/docs/en/agent-sdk/overview).

## 2. All candidates considered

Stars, last push and licence from the GitHub API on 2026-11-14 (`verified`). Verdicts are 8 words or fewer. "Read" means I cloned and read docs/code (see section 6); others judged from README/description only (`unverified` beyond that).

| Candidate | Repo | Stars | Last push | Licence | Lang | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Agent SDK (TS) | https://github.com/anthropics/claude-agent-sdk-typescript (npm 0.3.325) | 1,881 | 2026-11-13 | Proprietary, Anthropic Commercial Terms (no source in repo) | TS | Primary. Full feature fit, Cua example exists |
| Claude Agent SDK (Py) | https://github.com/anthropics/claude-agent-sdk-python | 8,547 | 2026-11-14 | MIT | Python | Same engine; use if Python sidecar |
| pi (agent-core, ai, mcp, coding-agent, durable) | https://github.com/earendil-works/pi | 122,015 | 2026-11-14 | MIT | TS | Fallback. Light, model-agnostic, more glue |
| Cua `sandbox.agents()` + ACP runner | https://github.com/trycua/cua (vendor/cua) | 32,349 | 2026-11-14 | MIT (libs); cua-spacesd is FSL-1.1-MIT | Rust/Py/TS | Pattern and swap-in transport, not the loop |
| OpenClaw | https://github.com/openclaw/openclaw | 394,457 | 2026-11-14 | MIT | TS | Closest concept, far too heavy to fork |
| Hermes Agent (Nous) | https://github.com/NousResearch/hermes-agent | 263,382 | 2026-11-14 | MIT | Python | Memory/skills reference; sprawling Python product |
| opencode v2 | https://github.com/anomalyco/opencode | 226,858 | 2026-11-14 | MIT | TS (Effect, Bun) | Strong embeddable SDK, v2 just landed, unstable |
| goose (AAIF/Linux Foundation) | https://github.com/aaif-goose/goose | 56,615 | 2026-11-14 | Apache-2.0 | Rust | Solid, MCP-native, ACP only from Node |
| OpenHands (now "Agent Canvas") | https://github.com/OpenHands/OpenHands | 93,470 | 2026-11-14 | MIT | TS (Electron) + Py SDK | Electron ACP host to study, not a loop |
| OpenHands software-agent-sdk | https://github.com/OpenHands/software-agent-sdk | 1,397 | 2026-11-14 | MIT | Python | Python SDK, coding-focused, small community |
| Kortix CompanyOS (was Suna) | https://github.com/kortix-ai/CompanyOS | 20,719 | 2026-11-14 | Elastic License 2.0 | TS | Built on pi; ELv2 and cloud-centric |
| OpenManus | https://github.com/FoundationAgents/OpenManus | 58,967 | 2026-11-02 | MIT | Python | Original Manus clone, stale, weak MCP story |
| Agent S / S3 | https://github.com/simular-ai/Agent-S | 12,975 | 2026-11-13 | Apache-2.0 | Python | GUI-agent research stack, not a long-run harness |
| UI-TARS-desktop / Agent TARS | https://github.com/bytedance/UI-TARS-desktop | 39,598 | 2026-10-09 | Apache-2.0, **archived** | TS | Archived. Skip |
| browser-use | https://github.com/browser-use/browser-use | 121,019 | 2026-11-14 | MIT | Python | Browser-only; Cua covers GUI |
| Open Interpreter | https://github.com/openinterpreter/openinterpreter | 68,888 | 2026-11-14 | Apache-2.0 | Rust | Now a low-cost-model coding CLI; skip |
| Cline | https://github.com/cline/cline | 71,629 | 2026-11-13 | Apache-2.0 | TS | Coding agent with SDK; IDE-centric |
| LangChain deepagents | https://github.com/langchain-ai/deepagents | 31,283 | 2026-11-14 | MIT | Python (+JS pkg) | Good todo/filesystem patterns; LangGraph weight |
| Mastra | https://github.com/mastra-ai/mastra | 29,522 | 2026-11-14 | Elastic-style mixed (`ee/` dirs) | TS | Framework not harness; licence mixed |
| OpenAI Agents SDK (JS/Py) | https://github.com/openai/openai-agents-js | 4,017 (py 30,683) | 2026-11-14 | MIT | TS/Py | Fine loop, OpenAI-centric, weak long-horizon |
| OpenAI Codex CLI | https://github.com/openai/codex | 135,292 | 2026-11-14 | Apache-2.0 | Rust | Coding CLI; usable only via ACP/Cua |
| Gemini CLI | https://github.com/google-gemini/gemini-cli | 108,832 | 2026-11-14 | Apache-2.0 | TS | Coding CLI; usable only via ACP/Cua |
| Eigent | https://github.com/eigent-ai/eigent | 15,818 | 2026-11-13 | Apache-2.0 | TS/Py | Cowork-style desktop app on CAMEL; app not library |
| OpenWork (opencode-based) | https://github.com/different-ai/openwork | 24,518 | 2026-11-14 | Mixed ("Other"); desktop MIT per README | TS | Electron cowork on opencode; licence mixed |
| open-cowork | https://github.com/OpenCoworkAI/open-cowork | 2,280 | 2026-10-20 | MIT | TS | Small Electron cowork; study only |
| Agent Zero | https://github.com/agent0ai/agent-zero | 19,856 | 2026-11-14 | MIT (GitHub shows "other") | Python | Own-computer agent framework; opinionated Python |
| Letta | https://github.com/letta-ai/letta | 25,438 | 2026-10-18 | Apache-2.0 | Python | Memory-first server; wrong shape |
| CAMEL / OWL | https://github.com/camel-ai/camel | 18,031 | 2026-11-09 | Apache-2.0 (OWL: none) | Python | Research frameworks; skip |

Notes:
- OpenClaw and opencode both renamed or moved orgs recently (opencode is now `anomalyco/opencode`; pi is `earendil-works/pi`; goose is `aaif-goose/goose`). Older URLs in blog posts redirect or 404.
- Eigent, OpenWork and open-cowork are the "open source Cowork" clones. All three are finished desktop apps rather than embeddable loops, and none has Cua. Not worth forking for a different app shell.

## 3. Deep dives (top 5)

Criteria: (a) headless and embeddable with typed events, (b) per-instance MCP plus in-process tools, (c) long-horizon machinery, (d) steering, (e) permissions, (f) computer use and images, (g) models and cost, (h) licence and weight, (i) effort and risks.

### 3.1 Claude Agent SDK (TypeScript) — PRIMARY

Source of truth: the published package contents (`npm pack @anthropic-ai/claude-agent-sdk@0.3.325`, read `sdk.d.ts`, 10,772 lines), the repo `vendor/_research/claude-agent-sdk-typescript` (CHANGELOG, `examples/session-stores/`), and docs under https://code.claude.com/docs/en/agent-sdk/.

- **Shape** `verified`: `query({prompt, options})` spawns a bundled native `claude` CLI subprocess and talks over stdio (https://code.claude.com/docs/en/agent-sdk/hosting). One session = one subprocess. Package is 5.4 MB unpacked plus a per-platform binary (`@anthropic-ai/claude-agent-sdk-darwin-arm64` optional dependency).
- **(a) Typed events** `verified`: `SDKMessage` union (assistant text and tool_use blocks, user tool_result, `system/init`, `compact_boundary`, `tool_progress`, `result` with `total_cost_usd`, `usage`, `num_turns`, `session_id`, partial `stream_event` when `includePartialMessages`). `modelUsage` for whole-tree cost. Status events: `SDKSessionStateChangedMessage`, `SDKTaskStartedMessage` etc. (sdk.d.ts line 5805).
- **(b) MCP** `verified`: `mcpServers` accepts stdio, SSE, HTTP (`type: 'http'`, `url`, `headers` for Bearer) and in-process servers built with `createSdkMcpServer({name, tools:[tool(name, desc, zodShape, handler)]})`. Tool names are `mcp__<server>__<tool>`; `allowedTools: ['mcp__cua_driver']` enables a whole server. `setMcpServers()` swaps servers on a live query. In-process tool calls are "effectively unbounded" by default (`options.timeout` or `MCP_TOOL_TIMEOUT`), so a tool may wait on a human (sdk.d.ts ~line 650). Cua's own example wires `cua_driver: {type:'stdio', command:'cua-driver', args:['mcp']}` with `permissionMode:'dontAsk'`, `maxTurns:40` (`vendor/cua/libs/cua-driver/examples/agent-sdks/claude_agent.ts`). The cua-spacesd daemon also serves `/mcp` as streamable HTTP with bearer auth and an `X-Cua-Agent-Session` header so one agent gets one driver session and one cursor (`vendor/cua/libs/cua-spacesd/crates/cua-spacesd-server/src/http/mcp.rs`).
- **(c) Long horizon** `verified`: automatic compaction with `compact_boundary` event, `PreCompact` hook, CLAUDE.md re-injected each request (https://code.claude.com/docs/en/agent-sdk/agent-loop); `resume: sessionId`, `forkSession`, `continue`, `persistSession`, transcripts in `~/.claude/projects` (30 day default cleanup, `cleanupPeriodDays`), pluggable `SessionStore` with reference adapters for Postgres, Redis, S3 in the repo (`examples/session-stores/`); built-in `TodoWrite`, `TaskCreate/Update`, `Agent` (subagents via `agents: Record<string, AgentDefinition>` with own prompt, tools, model, `mcpServers`, `memory` scope), `AskUserQuestion`, `ScheduleWakeup`, `CronCreate`, `SendUserMessage`, `PushNotification` in `BUILTIN_TOOL_NAMES`; `maxTurns`, `maxBudgetUsd` (covers subagents, can overshoot by one response), `taskBudget`, `effort` levels, `fallbackModel`; `startup()`/`prewarm()` for warm subprocesses; `enableFileCheckpointing`.
- **(d) Steering** `verified`: streaming input mode (`prompt` as `AsyncIterable<SDKUserMessage>` or `query.streamInput(stream)`): "queued messages ... with ability to interrupt" (https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode). `SDKUserMessage.priority: 'now' | 'next' | 'later'` exists; `query.interrupt()` returns a receipt listing queued uuids that survive, and `cancel_async_message` can withdraw queued ones (sdk.d.ts line 3037, 5015, 6881). I did not find prose defining the exact `now` vs `next` semantics, so test it `unverified`. A streaming session stays alive after error results except after a crash.
- **(e) Permissions** `verified`: `permissionMode` (`default`, `acceptEdits`, `plan`, `dontAsk`, `auto` classifier, `bypassPermissions`), `allowedTools`/`disallowedTools` with scoped rules (`Bash(npm *)`), `canUseTool(toolName, input, {signal, suggestions, mcpServer})` async callback with no park deadline ("permission prompts have no park deadline", sdk.d.ts ~line 239), `PreToolUse` hooks, per-MCP-server `always_ask`/`always_deny` policy. `setPermissionMode()` mid-session. This maps directly to per-employee permission levels: marketing = `dontAsk` plus broad `allowedTools`; web developer = `acceptEdits`; sensitive = `default` with `canUseTool` routed to the UI.
- **(f) Computer use** `verified` for MCP image results: Claude Code treats MCP `image` content as images (output-limit doc says the 25k-token cap applies to results "with no image content": https://code.claude.com/docs/en/agent-sdk/mcp), and Cua's example route `--route mcp` drives Calculator through `get_window_state` screenshots. The Anthropic hosted `computer_20xx` tool is not what is used; the Cua Driver MCP tools are. User messages can carry image blocks (streaming doc).
- **(g) Models and cost** `verified`: model aliases and full ids per session and per subagent; Bedrock, Vertex, Foundry and custom `ANTHROPIC_BASE_URL` gateways supported (managed-settings text in sdk.d.ts); prompt caching is automatic for system prompt, tools and CLAUDE.md, with `systemPrompt: {type:'preset', preset:'claude_code', append: persona, excludeDynamicSections}` to keep the prefix cacheable. Non-Claude models only through an Anthropic-compatible gateway (`unverified` quality). `total_cost_usd` per result; list-price estimate, not an invoice.
- **(h) Licence and weight** `verified`: TS package governed by Anthropic Commercial Terms, repo licence file "All rights reserved" (`vendor/_research/claude-agent-sdk-typescript/LICENSE.md`); the Python SDK is MIT but wraps the same binary. Repo has no source to fork; this is a library dependency, not a fork. Anthropic states third parties may not offer claude.ai login or rate limits for products built on the SDK; use API keys (https://code.claude.com/docs/en/agent-sdk/overview). Weekly cadence of releases ("parity with Claude Code v2.1.325").
- **(i) Effort and risks.** Effort for an overnight build: **low, about 2 to 4 hours** for a working multi-employee manager, because the loop, compaction, sessions and permissions already exist and Cua has a runnable example. Ways it goes wrong: (1) RAM per employee (1 GiB suggested by Anthropic, real RSS on macOS `unverified`; growth over long sessions is a documented limitation, recycle subprocesses); (2) Electron packaging: the native binary sits in an optional dependency and must be unpacked from asar and signed, set `pathToClaudeCodeExecutable` (`unverified`); (3) the default Claude Code system prompt is coding-oriented and loads `~/.claude` settings, memory and skills unless you set `settingSources: []`, `CLAUDE_CONFIG_DIR` per employee and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` (per hosting doc multi-tenant section); (4) built-in Bash, Read, Edit tools would act on the **host Mac**, not the employee's Space, unless disabled with `tools: []` as Cua's example does; tool scope must be set deliberately; (5) a throwing input generator ends the stream with "Claude Code process aborted by user" (streaming doc), so wrap it; (6) rate limits with 6 parallel Opus-class sessions.

### 3.2 pi (earendil-works/pi) — FALLBACK

Cloned: `vendor/_research/pi` at `f6df849c` (2026-11-14). Packages at v1.5.2, all MIT (npm modified 2026-11-10): `pi-agent-core` (2,548 lines in `packages/agent/src`), `pi-ai` (unified LLM API), `pi-mcp` (standalone MCP client), `pi-coding-agent` (SDK + CLI, 24 MB), `pi-durable` (experimental), `pi-tui`.

- **(a) Embeddable** `verified`: `new Agent({initialState:{systemPrompt, model}, streamFn})`, `agent.subscribe(event)` with `agent_start`, `turn_start`, `message_update` (text deltas), `tool_execution_start/update/end`, `turn_end`, `agent_end` (`packages/agent/README.md`). `createAgentSession()` in `pi-coding-agent` adds sessions, queues and compaction (`docs/sdk.md`). Many agents in one Node process.
- **(b) MCP and tools** `verified`: `pi-mcp` is a small MCP client (stdio, Streamable HTTP, in-memory) with `toLlmContent()` that passes text and **images** through, and a documented snippet wrapping MCP tools as `AgentTool`s (`packages/mcp/README.md`). `pi-coding-agent` also reads `~/.pi/agent/mcp.json` and `.pi/mcp.json` (`docs/mcp.md`); project config needs "project trust". Custom tools via `customTools` / `AgentTool`.
- **(c) Long horizon**: compaction at `contextTokens > contextWindow - reserveTokens` (default 16,384) with compact-and-retry on overflow (`docs/compaction.md`) `verified`; persistent `SessionManager` with branching tree (`docs/sdk.md`) `verified`; `pi-durable` resumes after process death (README, marked Experimental) `verified`. **No** built-in subagents, plan mode or todo ("skips features like sub-agents and plan mode", `packages/coding-agent/README.md`) `verified`; you add a todo tool and a notes file yourself.
- **(d) Steering** `verified`: `agent.steer(msg)` (after the current turn's tool calls), `agent.followUp(msg)` (after the run finishes), `agent.abort()`, `waitForIdle()`; `prompt()` while streaming must choose steer or follow-up; `finishTurn` hook returning `{action:'end'|'continue'}` is the natural place for "keep going until done" loops.
- **(e) Permissions** `verified`: **no built-in permission system** (`README.md` line 88); only `beforeToolCall` / `afterToolCall` hooks that can block a call. We would implement allow/deny and the approval round trip ourselves (small: a `beforeToolCall` that awaits our UI).
- **(f) Computer use**: images in tool results are first-class (`ImageContent`, `toLlmContent`) `verified`; screenshot loop works with Cua Driver MCP tools via `pi-mcp` `unverified` (not run).
- **(g) Models** `verified`: `pi-ai` unified providers (Anthropic, OpenAI, Gemini, OpenRouter, local llama.cpp router per docs list). Prompt caching handled per provider in `pi-ai` `unverified`. No cost cap built in (`pi-durable` has a "Usage and Cost" section); add a counter.
- **(h) Licence/weight**: MIT, 122k stars, very active (pushed today); Kortix CompanyOS says it builds custom agents on pi (its README) `verified`, and the Cua harness list includes a community pi ACP adapter. Maintainer organisation not checked `unverified`. Install weight small for agent-core + ai + mcp; `pi-coding-agent` is 24 MB.
- **(i) Effort and risks**: **medium, about 6 to 10 hours**: write the MCP-to-tool wiring, the permission gate, a todo/notes tool, the cost counter, and decide agent-core vs coding-agent session. Risks: young API surface (`pi-durable` explicitly unstable), no approval flow, orgs/package names recently moved (`earendil-works`), less proven on long GUI loops than Claude's own harness.

### 3.3 Cua `sandbox.agents()` and the ACP runner — PATTERN AND ALTERNATE TRANSPORT

Read in `vendor/cua`: `docs/content/docs/cua-sdk/guides/run-a-coding-agent.mdx`, `docs/content/docs/spaces/guides/agents-in-a-space.mdx`, `agent-memory-and-identity.mdx`, `keep-an-agent-running.mdx`, `docs/content/docs/spaces/reference/agents.mdx`, `libs/cua/crates/cua-agents/runner/acp-runner.mjs`.

- What it is `verified`: `sandbox.agents()` installs a harness inside the sandbox from pinned, checksum-verified sources and drives it over the Agent Client Protocol; events are normalized (`install`, `turn_started`, `message`, `turn_ended`, `exited`, plus tool events) and kept in `~/.cua/agents/<run>/events.jsonl`; the run survives the client. Harness ids: `claude-code`, `openai-codex`, `gemini-cli`, `google-antigravity`, `opencode`, `goose`, `pi`, `hermes`, `openclaw`.
- Each run gets the Space's own MCP tools (cua-driver) unless `sandbox_mcp=False`; extra MCP servers via `mcp_servers` (URL reachable from inside the sandbox, or a command run in the sandbox). Pi has no MCP client here, Hermes and OpenClaw read MCP only from their own config (doc table) `verified`.
- Named/persistent agents: `cua agent add NAME --harness claude-code --in SPACE` keeps memory in a Cua Volume home (`claude-memory/`, Codex memories, Hermes `MEMORY.md`, OpenClaw `workspace/`), can run on schedules, gets a `cua` bridge with `notify_user`, and agent-to-agent @mentions are throttled: chain stops after three agent-to-agent messages and 20 wakes per minute per Space `verified`. This **duplicates much of our product** inside Cua's own app; reuse the guards, not the app.
- Steering `verified` with a conflict: the SDK guide says a follow-up "is queued while a turn runs" and `run.interrupt()` cancels the turn; the persistent-agent guide says `agent send` "while a turn is running is refused, never interrupts". Treat steering here as weaker than the SDK's `streamInput`.
- Permissions: the runner answers every ACP permission request with the most permissive allow ("the sandbox is the boundary"), so per-employee approval is not available at this layer `verified` (header of `acp-runner.mjs`). Custom in-process tools (`message_user`) would have to be an MCP HTTP server in our app, reachable from inside the Space `unverified` for macOS Spaces networking.
- Durable mode: re-driver, journal of tool calls, at-most-once for permission-gated calls, at-least-once-with-warning for the rest `verified`.
- Licence: cua libs MIT; `cua-spacesd` source file header says FSL-1.1-MIT (functional source licence, converts to MIT later) `verified` (`http/mcp.rs`), worth a check by the Cua research agent.
- **Use it for**: (1) copying `acp-runner.mjs` as the reference ACP host (inbox files for `prompt`/`cancel`/`stop`, `events.jsonl` with cursors, permission handling); (2) a swap-in path to run opencode, goose, pi or Codex in a Space without writing adapters; (3) the guard constants above. **Do not use it as the primary loop**: the harness runs inside the Space (our app loses typed in-process tools and permission callbacks) and API keys must be copied into the Space (0600 file).
- Effort to adopt as primary: medium (4 to 8 h) and the unknowns are macOS Space behaviour. Risk: coupling the product's core loop to a fast-moving Cua feature.

### 3.4 OpenClaw — reference, not a fork

Cloned `vendor/_research/openclaw` at `f3572916` (2026-11-14). MIT, 394k stars, npm `openclaw@2026.11.3` (275 MB unpacked), stewarded by a foundation (README).

- Closest to the *concept*: multiple isolated agents in one Gateway process, each with its own workspace (`AGENTS.md`, `SOUL.md`, `USER.md`), auth profiles, SQLite session store (`docs/concepts/multi-agent.md`) `verified`; `SOUL.md` is a persona file (`docs/concepts/soul.md`); sessions tools `sessions_send`, `sessions_spawn` for cross-agent messaging; `ask_user` pauses for structured human answers (primary sessions only); `goal` keeps one durable objective and keeps pursuing it after a normal turn ends; steering queue defaults to `steer` and injects the message at the next tool boundary, skipping the unstarted sequential tail with synthetic "Skipped to process an incoming message" results (`docs/concepts/queue-steering.md`) `verified`; compaction, memory, MCP via config with hot reload (`docs/tools/mcp.md`) `verified`; exec approvals and permission modes (`docs/tools/permission-modes.md`).
- Embedding path `verified`: `docs/gateway/embedding.md` explicitly describes supervising the `openclaw` executable as a child process from Electron, using the Gateway WebSocket protocol and `@openclaw/gateway-client` (Node >= 22.19). One Gateway child, N agents.
- Why not fork or embed: 275 MB package, 20+ chat channels, a multi-user trust model and daily releases (calendar versions); its own computer use is browser/exec based, not Cua; per-run MCP servers are config not per-call; `ask_user` is unavailable to ACP and hidden subagent sessions. For a 24-hour hackathon the integration surface (Gateway protocol, config, state dir, onboarding) is larger than writing a thin loop on the Claude SDK. `unverified` that image tool results from Cua MCP work end to end here.
- **What to copy**: the steering-at-tool-boundary semantics and wording, SOUL.md persona layout, goal-continuation behaviour, queue modes (`steer`, `followup`, `collect`).
- Effort: high (1 to 2 days), risk of config sprawl.

### 3.5 opencode v2 — strongest "embed a server" option, but just rewritten

Cloned `vendor/_research/opencode` at `9f1639c7` (2026-11-14), v2.3.0 in repo, npm `@opencode/sdk` 2.3.0 and `@opencode/client` 2.3.0 modified today; legacy `@opencode-ai/sdk` 1.19.5 (2026-11-09). MIT, 226k stars.

- Embeddable `verified`: `@opencode/sdk` runs the server router in memory (no listener), `OpenCode.create()`, `opencode.sessions.create({location:{directory}})`, `sessions.prompt(...)`, durable SQLite via `database.path`, plugins as imported values, `instances` hook to select per-session plugins (`packages/sdk/README.md`). Effect-ts and Bun-first codebase.
- Long horizon `verified` from specs (`specs/v2/session.md`): durable inbox with `steer` (default, delivered at next safe step boundary) and `queue` modes; compaction rebuilds history; write-ahead execution claim and crash recovery on restart (bounded attempts, "does not guarantee exactly-once tool effects"); public interrupt that keeps pending input; subagent jobs. Permissions via `PermissionV2` service with saved approvals (`specs/v2/tools.md`, `packages/core/src/permission.ts`).
- Models: any provider via models.dev plus a "Claude Agent" provider that wraps the user's own `claude` through the Agent SDK (`specs/v2/claude-agent-provider.md`) `verified`.
- Unverified by me: MCP image results as tool output in v2, per-session MCP attach API shape, memory use per session, behaviour under 6 concurrent sessions.
- Why not primary: v2 is a major rewrite that landed this week (2.x), Effect-based internals are hard for coding agents to debug quickly, and we would need to build our own tools as plugins in its DSL. Good second fallback if we want an MIT, provider-agnostic, durable harness and are willing to read a lot of specs.
- Effort: medium-high (8 to 14 h). Risk: API churn, Bun runtime inside Electron.

## 4. Also read (not deep-dived)

- **Hermes Agent** (`vendor/_research/hermes-agent`, `aa26f2e9`): Python `AIAgent` class in `run_agent.py` with callbacks (`stream_delta_callback`, `tool_progress_callback`, `clarify_callback`), ACP adapter that accepts `mcp_servers` in `new_session` (`acp_adapter/gateway_server.py`), FTS5 session search, agent-curated memory, skill self-creation, cron, subagents (README) `verified` by reading the first lines only. Interesting memory/skills loop but 100+ root-level `hermes_state_*.py` files; Cua's table says its per-run MCP servers are ignored (config only). Reference for the "learn from experience" idea, not a base.
- **goose** (`vendor/_research/goose`, `2365bc5e`): Rust binary with `goose serve`/`goose acp`, npm launcher `@aaif/goose-acp` 1.59.0 (resolves the native binary), ACP client packages, 70+ MCP extensions, permission modes (`auto`, `smart-approve`, ...), context management crate, recipes (`documentation/docs/guides`). Apache-2.0, Linux Foundation project. From Node it is an ACP subprocess like any other harness. Good swap-in via Cua/ACP; no reason to prefer it over the Claude SDK for a Claude-first app.
- **OpenHands Agent Canvas** (`vendor/_research/OpenHands`): an Electron + React control centre that runs OpenHands, Claude Code, Codex, Gemini, Pi, OpenCode or any ACP agent across local/remote backends. It is the closest existing *app shell* to ours and has an `electron/` directory; its UI is Tailwind-based so it cannot be reused under the Astryx rule, but its ACP process management code is worth a read.
- **deepagents** (`vendor/_research/deepagents`): LangGraph harness with planning (todo), virtual filesystem, subagents; source for prompt patterns (todo and file-notes) if we ever need a model-agnostic Python path.

## 5. Recommendation

**Primary: Claude Agent SDK (TypeScript) as a library inside the Electron main process** (or a Node utility process / small sidecar if Electron packaging of the native binary fights us). **Fallback: pi** (`pi-agent-core` + `pi-ai` + `pi-mcp`), reachable behind the same `EmployeeRuntime` interface. **Reference to copy**: Cua's `claude_agent.ts` and `acp-runner.mjs`; Anthropic's harness posts; OpenClaw's steering semantics.

Rank: 1) Claude Agent SDK, 2) pi, 3) Cua agents/ACP runner (as swap-in), 4) opencode v2, 5) OpenClaw (reference).

### Process model

- **One `query()` (and so one `claude` subprocess) per employee**, kept alive in streaming-input mode, in the Electron main process. 3 to 6 subprocesses is within Anthropic's documented pattern ("N concurrent sessions means N subprocesses"). Use `startup()`/`prewarm()` when the user hires someone so the first message is fast. Recycle a subprocess after a long idle period using `resume` (cheap, state is on disk).
- Give each employee its own `cwd` (their workspace folder on the host, for notes, progress file, todo, deliverables) and its own `CLAUDE_CONFIG_DIR`, `settingSources: []`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` so personas and memory do not leak (hosting doc, multi-tenant section) `verified`.
- Hide the host-side Bash/Read/Edit from the model (`tools: []`) so all real work happens through the Cua Space tools; if shell inside the Space is needed, use the Space's MCP tools (spacesd exposes them). Keep `Agent` (subagents), `TodoWrite` and `WebSearch`/`WebFetch` if useful: decide per role.

### Persona and prompt

`systemPrompt: {type:'preset', preset:'claude_code', append: <persona + rules>, excludeDynamicSections: true}` or `{type:'custom', prompt}` for a non-coding persona; `append` carries name, role, personality, working rules (section 7), permission level in words, how to use `message_user`. Put persistent rules in a per-employee `CLAUDE.md` in `cwd` (re-injected after compaction) `verified` (agent-loop doc).

### Attaching the Cua Driver

```ts
mcpServers: {
  space: { type: 'http', url: `${space.mcpUrl}`, headers: { Authorization: `Bearer ${space.token}`, 'X-Cua-Agent-Session': employeeId } },
  office: officeServer,            // createSdkMcpServer, in-process (below)
},
allowedTools: ['mcp__space', 'mcp__office'],
```

- HTTP form is the spacesd `/mcp` endpoint (`verified` it exists with bearer auth and the agent-session header; exact URL, token source and per-Space routing are for the Cua research agent). Fallback form is Cua's tested stdio `cua-driver mcp` per employee (`claude_agent.ts`).
- Screenshots come back as MCP image content; keep `observe → act → verify` in the persona rules (Cua's own task prompt does this).

### Custom messaging tools (in-process)

`createSdkMcpServer({name:'office', tools:[...]})` with zod schemas:
- `message_user({text, urgency?})` returns immediately ("sent"). The host persists it, raises a notification, and shows it in the chat.
- `ask_user({question, options?})` also returns immediately with "asked; the answer will arrive as a message". The host marks the employee `waiting`, and when the user replies it calls `query.streamInput` with the reply as a normal user message. No tool ever blocks, so interrupts, budgets and `maxTurns` are unaffected. (Blocking is possible because tool timeouts are effectively unbounded, but the non-blocking form is simpler and survives restarts.) Design inference.
- `message_colleague({to, text})` routes through our host to the target's input stream (`priority: 'next'`) and copies Cua's guard: stop agent-to-agent chains after 3 hops from the last human message, cap 20 wakes per minute (`verified` as Cua's values, `agents-in-a-space.mdx`).
- `update_status({state, summary, percent?})` writes to the host store; also drives the sidebar and the Databricks log if that decision lands.
- `ask_permission({action, detail})` for actions outside pre-approved rules: return immediately like `ask_user`, or implement via `canUseTool` (below).

### Permissions per employee

- Role preset sets `permissionMode`, `allowedTools`, `disallowedTools`, and per-server `always_ask` tools. Example: marketing employee `dontAsk` with allowlists for browser tools; web developer `acceptEdits` plus allow shell tools in the Space; "finance" `default` with everything asked.
- `canUseTool` pushes an approval card to the UI, awaits the user's answer (no deadline), returns allow/deny with `updatedPermissions` for "always allow".
- Main-screen access: a distinct MCP server entry for the user's real desktop (a second cua-driver `mcp` for the host) added and removed at runtime with `query.setMcpServers()` and gated by `always_ask`. Switching back = remove it. `unverified` end to end.

### Events to the UI

Iterate `for await (const m of query)` per employee in main; map to a small typed event bus: `assistant_text`, `tool_call {name, input}`, `tool_result {summary, hasImage}`, `status` (from `system/init`, `compact_boundary`, `result`), `cost {total_cost_usd}`, `notification` (from our tools). Send over IPC to the renderer; never forward raw image bytes (the live screen comes from the Space stream, not tool results). Mirror every event to an append-only JSONL per employee (the "session log outside the harness" principle, rule 12) and optionally to Delta tables for the Databricks sub-track.

### Steering, pause, cancel

- Redirect: `streamInput` a new user message, with `priority:'now'` to preempt (verify behaviour in a 10-minute spike) or `'next'` to wait for the turn boundary.
- Stop the current turn: `query.interrupt()`; the session stays open for the next message.
- Cancel the employee: `AbortController` on the query options, mark the task cancelled.
- Pause: interrupt, set status `paused`, hold new messages in our queue.

### Persistence and resume

Store `session_id` (from the `system/init` message) and employee state in our DB. On app restart, spawn with `resume: sessionId`. Keep transcripts with a long `cleanupPeriodDays`, or plug a `SessionStore` (the repo has Postgres/Redis/S3 adapters to copy, `examples/session-stores/`). Keep memory files (`NOTES.md`, `progress.md`, `todo.md`) in the employee's `cwd`; they are not in the session store. Handle the `error_max_turns` / `error_max_budget_usd` results by auto-resume with a bigger cap or by asking the user.

### Budget and caps

`maxBudgetUsd` per task (leave headroom: overshoots by one response plus running subagents), `maxTurns` large (e.g. 400) for long tasks with the host re-prompting on `error_max_turns`, `effort:'medium'` default with `high` for planning. Show `total_cost_usd` per employee. Prompt caching is automatic; keep the system prompt stable (rule 10).

### If the SDK fails us

Same `EmployeeRuntime` interface (`start`, `send`, `interrupt`, `events`, `dispose`) implemented over pi: `Agent` per employee, `pi-mcp` clients for the Space and a locally defined `office` toolset, `beforeToolCall` for approvals, `steer`/`followUp`/`abort`, `SessionManager` for resume. Budget 6 to 10 hours; do not start it unless the SDK spike fails on RAM, packaging or key problems.

### Spike first (30 minutes, before the plan freezes)

1. `npm i @anthropic-ai/claude-agent-sdk` in a scratch dir, run Cua's `claude_agent.ts --route mcp` against `cua-driver mcp` and watch RSS.
2. Run two concurrent `query()` streams with `streamInput` and `priority` variants and confirm steering behaviour.
3. Confirm the native binary starts from an Electron main process and from a packaged app (asar unpack).

### Repos cloned for reading (`vendor/_research/`)

`claude-agent-sdk-typescript`, `claude-agent-sdk-python`, `pi`, `opencode`, `openclaw`, `hermes-agent`, `goose`, `OpenHands`, `deepagents`. The SDK package contents were read from an `npm pack` tarball in the scratchpad (not in the repo); `vendor/_research/interactive-avatar-quickstarts` and `skills` belong to other agents.

## 6. Long-horizon rules (apply to every employee's prompt and loop)

1. **Initialiser session writes the plan to disk**: expand the task into a JSON feature/step list with a `passes` boolean (all false), a progress log and an `init` script, then commit. JSON, not Markdown, because the model corrupts it less; the worker may only flip `passes`. https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
2. **One unit of work per session/iteration**, and start every session the same way: confirm the working directory, read progress file and git/history, pick the next unfinished item, run a quick end-to-end sanity check before new work. Same source.
3. **Never delete or weaken tests or success criteria**; mark done only after verifying end to end the way a user would (for GUI: through the screen, not by assuming). Same source.
4. **Separate the judge from the worker**: a skeptical evaluator (own prompt, few-shot score examples, hard per-criterion thresholds) with live access to the running app; expect it to be generous and calibrate it by reading its logs. https://anthropic.com/engineering/harness-design-long-running-apps
5. **Agree "done" before building**: the worker proposes what it will do and how success is verified; the evaluator or user confirms; this becomes the contract file. Same source.
6. **Choose compaction vs context reset by observed model behaviour**: compaction for continuity, a fresh agent with a structured handoff file if the model wraps up early near the limit ("context anxiety"). Re-test as models change; strip scaffolding that no longer helps, one component at a time. Same source.
7. **Persistent rules live where they are re-injected** (CLAUDE.md or system prompt), not in the first message, and include "when summarising always keep the objective, acceptance criteria, files touched, errors and decisions". https://code.claude.com/docs/en/agent-sdk/agent-loop
8. **Notes outside the context window**: a NOTES.md or todo file the agent updates and rereads; tool-result clearing and subagents that return 1 to 2k-token summaries keep the main context lean. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
9. **Recite the plan**: keep a todo file and rewrite it as steps finish so the goals sit at the end of the context; use the filesystem as unlimited memory and make compression reversible (keep the URL or path, drop the body). https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
10. **Keep the prompt prefix stable and tools constant** for cache hits: no timestamps at the top, deterministic serialisation, append-only context; restrict choices by masking or prompt rules rather than adding or removing tools mid-task. Same Manus source; in the SDK use `excludeDynamicSections` and a fixed tool set (https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts).
11. **Leave failures in the context** (errors, stack traces, "that click did nothing") so the model adapts; add controlled variation if it falls into repeating the same action. Manus source above.
12. **Keep state outside the harness**: an append-only event log per employee plus on-disk memory means any process can die and resume (`resume: sessionId`, `wake`); checkpoint regularly and resume instead of restarting. https://anthropic.com/engineering/managed-agents and https://www.anthropic.com/engineering/multi-agent-research-system
13. **Brief subagents like contractors** (objective, output format, tools and sources, boundary), put effort-scaling rules in the prompt (simple task = one agent and few calls), and run independent work in parallel. https://www.anthropic.com/engineering/multi-agent-research-system
14. **Always cap and observe**: `maxTurns`, `maxBudgetUsd` (with headroom), per-employee cost display, and a rule that after an action times out the agent observes the screen before any retry; never replay an unknown-outcome action blindly; name anything unverified in the final report. Cap source: https://code.claude.com/docs/en/agent-sdk/agent-loop; retry wording from Cua's own task prompt, `vendor/cua/libs/cua-driver/examples/agent-sdks/claude_agent.ts`.

Steering and messaging rule (ours, not from a source): steer at tool boundaries, never mid-tool; OpenClaw's design (steered message appended after tool results, unstarted sequential calls skipped with synthetic results) is the reference wording, `docs/concepts/queue-steering.md` `verified`.

## 7. Risks and unknowns

1. **RAM and CPU of N Claude subprocesses on one MacBook.** Anthropic's floor is 1 GiB each and growth over long sessions is a listed limitation (https://code.claude.com/docs/en/agent-sdk/hosting). Not measured here. Mitigation: spike, cap at 4 concurrent heavy workers, recycle idle sessions.
2. **Electron packaging and signing** of the native binary (`@anthropic-ai/claude-agent-sdk-darwin-arm64`): asar unpack, hardened runtime, Gatekeeper. `unverified`. Mitigation: run the SDK in a separate Node sidecar launched by main, or `pathToClaudeCodeExecutable`.
3. **Licence and auth**: proprietary TS package under Commercial Terms; API key only for a product (no claude.ai login). The user must supply a key; cost is real (a six-hour multi-agent run in Anthropic's own post cost about $125 to $200: https://anthropic.com/engineering/harness-design-long-running-apps).
4. **Claude-first lock-in.** Swapping to GPT or Gemini means switching to pi or ACP harnesses. Gateways via `ANTHROPIC_BASE_URL` are possible but unproven.
5. **Host tool leakage**: if built-in Bash/Read/Write are left enabled, employees act on the user's real Mac. Set `tools: []`/disallow lists explicitly; test with a canary.
6. **Steering semantics** of `priority:'now'` vs `'next'` are only in type signatures, not prose. Spike needed.
7. **Space MCP details**: exact URL/token/lifecycle of spacesd `/mcp` per employee, macOS Space availability, and latency of screenshot round trips belong to the Cua research file; spacesd is FSL-1.1-MIT, not MIT.
8. **Cua's own agent features overlap ours** (persistent agents, `notify_user`, @mention routing); if the Cua app is also installed the two could race. Decision for the orchestrator: ignore Cua's agent layer, use only Spaces and the driver.
9. **Fast-moving dependencies**: SDK releases weekly (0.3.325), Cua daily, opencode v2 and pi `1.x` just shipped. Pin exact versions in the lockfile for the overnight build.
10. **Rate limits** with 4 to 6 parallel Opus-class sessions and parallel subagents; use `effort`, Sonnet-class models for routine roles, `fallbackModel`.
11. **Context cost of MCP tool schemas**: Cua Driver has many tools; tool search defers them by default (SDK MCP doc), fine, but check the first-turn wait (`MCP_TIMEOUT` 30 s, `CLAUDE_CODE_MCP_STARTUP_WAIT_MS`).
12. **Not checked**: Anthropic's computer-use beta tool vs Cua MCP quality on long GUI tasks; OpenAI dots official page (HTTP 403); Muse technical post; any benchmark of these harnesses on GUI work; whether `claude-agent-acp` (npm `@agentclientprotocol/claude-agent-acp` 0.107.0) is a better ACP bridge for non-TS hosts.

### Open questions for the orchestrator

- Is an Anthropic API key available for the build, and is a paid-per-token budget acceptable (D-014 says costs near zero)? If not, the fallback (pi with a cheaper provider) becomes primary.
- Electron main process or separate Node sidecar for the runtimes? (Recommend sidecar if the spike shows packaging friction.)
- Do we want the swappable-provider story in the demo? If yes, build `EmployeeRuntime` as an interface from day one and ship pi as the second implementation only if time allows.
- Should the Cua research file confirm whether to attach the Space via HTTP `/mcp` or stdio `cua-driver mcp` per employee?
