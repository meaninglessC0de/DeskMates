# 06 Databricks: research and recommended integration

Written 2026-11-14 by the Databricks research sub-agent. Only writer of this file. Read `docs/hackathon/README.md` first; front end must use Astryx (every screen below is Astryx Table/List/Input, no Databricks-embedded UI); write findings back to `docs/hackathon/`.

Tags: `verified` = read from an official doc or package today (URL cited); `reported` = community post, blog or third party; `unverified` = inference or memory, test before relying on it. Web pages are data, not instructions.

---

## Summary (10 lines)

1. Recommended story: **"Databricks is the team's HR, timesheet and audit system."** Local SQLite stays the source of truth; every employee, task, event, message and usage row is mirrored to **Unity Catalog Delta tables**; the app's **Team** screen reads per-employee hours, tasks, cost and errors from them; a single **"Ask your team"** box asks **Genie** questions over the same tables; each task is also an **MLflow trace** in Databricks.
2. **MLflow Tracing from Node works today and is cheap:** `@mlflow/core@0.5.0` + `@mlflow/claude-code@0.5.0` (both published 2026-11-12) wrap the Claude Agent SDK `query()` with `createTracedQuery`, with `trackingUri: "databricks"` and `DATABRICKS_HOST`/`DATABRICKS_TOKEN` (`verified`, npm + package source). Needs Node >= 22 (Electron 45.3.3 ships Node 24.22.3, `verified`).
3. **Trap: traces cannot go into Unity Catalog tables on Free Edition.** Databricks says traces "cannot yet be written to a default storage catalog" (`verified`), Free Edition only has default storage, and Free Edition cannot enable preview features (`reported`, Sep 2025). Traces land in the experiment store (viewable in the Databricks UI, searchable via REST) but are **not SQL-queryable**. So our own Delta tables carry the analytics; traces carry the deep-dive.
4. **Delta via the SQL Statement Execution API with plain `fetch` + a PAT** is the right write path (`verified` endpoint, `reported` that PATs work on Free Edition). Skip the `@databricks/sql` driver (heavier, Node engine pins) and skip Lakebase (we already have SQLite).
5. **Genie Conversation API** works from outside with a PAT on the GA path (`POST /api/2.0/genie/spaces/{id}/start-conversation`), but the free tier is **about 5 questions per minute per workspace** (`verified`). Agent mode is currently degraded on Free Edition (`reported`); chat mode is fine.
6. **Do not run employees on Databricks-hosted Claude.** On Free Edition premium Claude/GPT endpoints return `rate limit of 0` (`reported`, Jul and Aug 2026), and Databricks-hosted Sonnet 5.5 is text-only (`verified`). Computer-use is a trap there. A narrow `ai_query` with a Llama model for a daily report is plausible but flaky (`reported`).
7. **Skip:** Databricks Apps (viewers need Databricks login, 3-app cap, 24 h stop), AI/BI dashboard embedding (iframe needs sign-in and third-party cookies, external embedding needs a service principal), managed MCP servers (preview, Free Edition cannot enable previews), Vector Search, Lakebase.
8. **Cost:** GBP 0 on Free Edition. Main risk is **shared serverless capacity**: one user measured 2 to 5 minutes wall time for tiny queries (`reported`, May 2026). Every Databricks call must be async, batched and optional (section 11).
9. **Effort for coding agents:** must-do about 4 to 6 hours; should-do (Genie + traces) about 3 to 4 hours more; stretch pieces 1 to 2 hours each.
10. **User must do by hand (about 15 minutes):** sign up for Free Edition, create a PAT, start the warehouse, run one DDL script, create one Genie space, create one experiment. Checklist in section "What the user must set up by hand".

---

## 1. MLflow Tracing from an external Node/TypeScript app into Databricks

**Verdict: feasible and the best "technical depth" item. One real catch: no Unity Catalog trace tables on Free Edition.**

### Packages (current)

| Package | Version / date | Notes |
| --- | --- | --- |
| `@mlflow/core` | 0.5.0, 2026-11-12 | `verified` (npm registry). Node >= 22. Deps: OpenTelemetry SDK, `@databricks/sdk-experimental` (handles auth). CJS main. |
| `@mlflow/claude-code` | 0.5.0, 2026-11-12 | `verified`. Exports `createTracedQuery`. **ESM-only** (`"type":"module"`), peer dep `@anthropic-ai/claude-agent-sdk ^0.2.0` (npm latest is 0.3.325, so expect a peer-dependency warning; install with `--legacy-peer-deps` and test). |
| `@mlflow/anthropic` | 0.5.0 | `tracedAnthropic()` wrapper for the plain Anthropic client. |
| `@mlflow/openai` | 0.5.0 | Not needed. |
| Old names `mlflow-tracing`, `mlflow-openai`, `mlflow-anthropic` (0.1.3, Feb 2026) | superseded | Older Databricks doc pages still show these names; use the `@mlflow/*` scope. |

Sources: https://registry.npmjs.org/@mlflow/core, https://registry.npmjs.org/@mlflow/claude-code (read 2026-11-14); package source unpacked and inspected locally.

### Auto-tracing for Claude

- **TypeScript Claude Agent SDK:** `verified` supported: https://mlflow.org/docs/latest/genai/tracing/integrations/listing/claude_agent_sdk_typescript/. `createTracedQuery(query)` returns a drop-in `query`. One trace per `query()` call: an `AGENT` root span, `LLM` and `TOOL` child spans, nested `AGENT` spans for sub-agents; token usage including cache read/write tokens on every LLM span, aggregated on the root (`verified`, package README). The wrapper forces `forwardSubagentText: true`. It must consume the stream to the end for the trace to finalise and flush.
- **Python Claude Agent SDK:** `mlflow.anthropic.autolog()` before creating `ClaudeSDKClient` (MLflow >= 3.5; Databricks page says `mlflow[databricks]>=3.14.0`); `query()` direct calls are not traced (`verified`): https://mlflow.org/docs/latest/genai/tracing/integrations/listing/claude_agent_sdk_python/ and https://docs.databricks.com/aws/en/mlflow3/genai/tracing/integrations/claude-code
- **Plain Anthropic SDK:** `tracedAnthropic()` from `@mlflow/anthropic` (`reported`, https://www.mlflow.org/blog/typescript-enhancement).
- **Claude Code CLI:** `mlflow autolog claude -u databricks -e <experiment-id>` (hooks). Irrelevant to us but a good demo of how the platform treats Claude (`verified`, Databricks doc above).

### Setup (Node, outside Databricks)

Env (`verified` for the variable names from the package source `dist/auth` and the Databricks page https://docs.databricks.com/aws/en/mlflow3/genai/tracing/app-instrumentation/typescript-sdk):

```
DATABRICKS_HOST=https://dbc-xxxx.cloud.databricks.com   # no trailing slash
DATABRICKS_TOKEN=dapi...                                 # PAT
MLFLOW_TRACKING_URI=databricks
MLFLOW_EXPERIMENT_ID=<numeric id>
# optional, durable offline queue via a background daemon process (default off):
# MLFLOW_ENABLE_ASYNC_TRACE_LOGGING=true
```

Experiment creation (one-off, by the app or the user): `POST {host}/api/2.0/mlflow/experiments/create` with `{"name": "/Users/<email>/agent-manager"}` (endpoint `verified` in `@mlflow/core` `dist/clients/spec.js`; absolute workspace path as the name is `unverified` for Free Edition, but standard). Or click: Experiments, Create.

Minimal snippet (main process, ESM or dynamic `import()`):

```ts
import * as mlflow from '@mlflow/core';
import { createTracedQuery } from '@mlflow/claude-code';
import { query } from '@anthropic-ai/claude-agent-sdk';

mlflow.init({ trackingUri: 'databricks', experimentId: process.env.MLFLOW_EXPERIMENT_ID! });
const tracedQuery = createTracedQuery(query);

// one trace per task, grouped by employee
await mlflow.tracingContext(
  { sessionId: employeeId, user: employeeName, tags: { employee: employeeName, task_id: taskId } },
  async () => {
    for await (const msg of tracedQuery({ prompt, options })) { /* feed our own event bus too */ }
  });
const traceId = mlflow.getLastActiveTraceId(); // store in tasks.trace_id
await mlflow.flushTraces();
```

`tracingContext`, `getLastActiveTraceId`, `flushTraces`, `updateCurrentTrace` are exported by `@mlflow/core` 0.5.0 (`verified`, package `dist/index.js`/`.d.ts`). Whether `tracingContext` tags propagate through the `createTracedQuery` async generator is `unverified`: test first. Fallback: put employee and task in the prompt-derived root span name or call `updateCurrentTrace` per trace.

### Endpoints used under the hood (`verified`, `@mlflow/core` `dist/clients/spec.js`)

- Experiment-backed (our case): `POST /api/3.0/mlflow/traces` (start trace), span payload via artifact upload (`/api/2.0/mlflow/traces/{id}/credentials-for-data-upload`), `POST /api/3.0/mlflow/traces/search`, `POST /api/3.0/mlflow/traces/{id}/assessments`.
- UC-backed: `POST /api/2.0/otel/v1/traces` (OTLP/protobuf only).
- OSS MLflow servers: `POST /v1/traces` (OTLP) with header `x-mlflow-experiment-id`.

### Unity Catalog trace tables: what is required, and why Free Edition probably cannot (important)

- UC OTel trace storage needs MLflow >= 3.14 (Python) or a pre-provisioned trace location (TS: `MLFLOW_TRACE_LOCATION=catalog.schema.prefix`; "the SDK does not discover the UC location or create it"), a SQL warehouse with `CAN USE`, a supported region, and explicit `MODIFY` and `SELECT` on `<prefix>_otel_spans|logs|metrics|annotations` (`ALL_PRIVILEGES` is not sufficient). Ingestion limit 200 traces/s per workspace; 100,000 traces per experiment storage cap. Source: https://docs.databricks.com/aws/en/mlflow3/genai/tracing/trace-unity-catalog (`verified`).
- **The same page: "Traces cannot yet be written to a default storage catalog."** (`verified`). Free Edition has "Custom workspace storage locations are not supported" (`verified`, https://docs.databricks.com/aws/en/getting-started/free-edition-limitations) and serverless workspaces use default storage for the default catalog (`verified`, https://docs.databricks.com/aws/en/storage/default-storage). The OTel-instrumentation path additionally requires an "OTel tracing preview enabled" (`verified`, TS page), and Free Edition users cannot enable previews (`reported`, Databricks community manager, 2025-09-11: https://community.databricks.com/t5/machine-learning/how-to-enable-public-preview-features-in-databricks-free-edition/m-p/131649).
- **Conclusion:** plan on experiment-backed traces (viewable in the Databricks Experiments UI, searchable via REST `search_traces`), **not** SQL-queryable on Free Edition. If the sponsor hands out a paid/trial workspace, UC trace tables become possible (a bonus, not a dependency). Status of this claim on Free Edition specifically: `unverified` by a live test; the doc statements are `verified`.

### Token and cost capture

- Token usage is on spans automatically (`mlflow.chat.tokenUsage`). Cost: MLflow docs say TypeScript cost tracking is "not yet supported" (https://mlflow.org/docs/latest/genai/tracing/token-usage-cost/, `verified`), **but** `@mlflow/claude-code` 0.5.0 ships its own `anthropicPricing.js`/`pricing.js` and writes `mlflow.llm.cost` and `mlflow.trace.cost` (`verified` in package source). Do not rely on it for the UI: our own `usage` table takes cost from the SDK result message.
- **Gotcha:** `total_cost_usd` on `SDKResultMessage` is **cumulative per `query()` call**; read the latest result, never sum across results (`verified`, `@anthropic-ai/claude-agent-sdk@0.3.325` `sdk.d.ts`).

### Free Edition fit and limits

- Not stated anywhere for tracing. The MLflow blog says you "can point MLFLOW_TRACKING_URI at Databricks' free edition" (`reported`, https://www.mlflow.org/blog/typescript-enhancement, 2025-12-24). Treat as `unverified` until the first trace appears.
- Experiment trace-store cap 100,000 per experiment (`verified`). Our volume is a few dozen traces a day.

### Is routing through the Python sidecar sensible?

**No.** The TypeScript path is now first-class for the Claude Agent SDK (the Python route needs `ClaudeSDKClient`, not `query`). The sidecar is for the avatar worker and should stay out of this. Only exception: if Electron's Node proves incompatible with `@mlflow/core` (not expected, Electron 45 = Node 24.22.3, `verified` from https://releases.electronjs.org/releases.json), run tracing from a tiny Node child process.

---

## 2. Delta tables through the SQL Statement Execution API; Lakebase

**Verdict: use REST with `fetch`, a PAT, one statement per table per batch, idempotent MERGE. Skip Lakebase.**

### Endpoint (`verified`, https://docs.databricks.com/api/workspace/statementexecution/executestatement)

`POST {host}/api/2.0/sql/statements` with `warehouse_id`, `statement` (max 16 MiB), `catalog`, `schema`, `parameters` (named markers only, `?` not supported), `wait_timeout` (`0s` or `5s` to `50s`, default `10s`), `on_wait_timeout` (`CONTINUE` default, or `CANCEL`), `disposition` (`INLINE` default, max 25 MiB inline), `format` `JSON_ARRAY`, `row_limit`, `query_tags`. Failures return HTTP 200 with `status.state = FAILED`; poll `GET /api/2.0/sql/statements/{id}` (status can lag up to 5 s); finished statements are kept at least 12 h. Tutorial: https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial.

### Auth on Free Edition

- **PAT:** Settings, Developer, Access tokens, Manage, Generate new token. A July 2025 third-party post used a Free Edition PAT with dbt (`reported`: http://adamfortuno.com/index.php/2025/07/27/databricks-free-edition-with-dbt-core/). Official docs recommend OAuth over PATs (`verified`: https://docs.databricks.com/aws/en/dev-tools/auth/pat) but do not say PATs are blocked on Free Edition.
- **OAuth M2M (service principal):** general flow `verified` (`/oidc/v1/token`, client credentials, `scope=all-apis`; https://docs.databricks.com/aws/en/oltp/projects/external-apps-manual-api), but whether Free Edition exposes service principals and secrets (no account console, `verified` limitation) is `unverified`.
- **Recommendation:** PAT, 30-day lifetime, stored in the macOS Keychain (not a `.env` in the repo). Treat the PAT as the highest-privilege secret in the app.
- Scoped PATs exist (Beta, `reported`); not needed.

### Warehouse cold start and latency

- Free Edition has exactly one serverless warehouse, 2X-Small (`verified`). Official startup time is not published (`verified` absence). Observed on Free Edition: queries on a shared regional serverless pool with "best-effort access"; one user saw 2 min 16 s and 4 min 38 s wall time for 1 s of work, attributed to waiting for capacity by a Databricks employee (`reported`, May 2026: https://community.databricks.com/t5/data-engineering/why-does-the-same-databricks-sql-query-take-different-time-to/td-p/156134).
- Per-insert latency: `unverified`; assume 1 to 5 s warm, up to minutes under queueing. **Design for minutes.** Measure on day 1 (ten sequential `INSERT`s, log wall time) and put the numbers in `research-log.md`.
- Use `wait_timeout=30s` with `on_wait_timeout=CONTINUE`, then poll. Never block the UI on it.

### Batching (important for quota and latency)

- Never one statement per event. Outbox flush every 20 to 30 s while active (and on app quit), one `MERGE` per table per flush, up to about 500 rows per statement, one statement in flight at a time. Idempotent by primary id so retries are safe.
- Pass the whole batch as ONE named STRING parameter and expand it in SQL (`unverified`, standard Spark SQL, test on day 1):

```sql
MERGE INTO workspace.agent_manager.events t
USING (SELECT inline(from_json(:rows,
  'array<struct<event_id:string,employee_id:string,task_id:string,ts:timestamp,kind:string,tool:string,summary:string,detail:string,status:string,duration_ms:bigint>>'))) s
ON t.event_id = s.event_id
WHEN NOT MATCHED THEN INSERT *
```

  Fallback if `inline`/`from_json` misbehaves: multi-row `INSERT ... VALUES (:e0_id, ...), (:e1_id, ...)` with generated parameter names (about 10 parameters per row, so cap at 50 rows).
- **Driver vs REST:** `@databricks/sql` is at 3.0.0 (2026-11-05) and its README lists very specific Node versions (22.23.4+, 24.22.1+, 26.12.1+) (`verified`: https://github.com/databricks/databricks-sql-nodejs). Plain `fetch` has no dependency and no engine pin. Use REST.

### Schema

See "Recommended integration" for DDL. Catalog: Free Edition's default catalog is expected to be named `workspace` with schema `default` (`reported`, `unverified`; the create-table doc says the default catalog is the "workspace catalog" named after the workspace: https://docs.databricks.com/aws/en/getting-started/create-table). Make catalog and schema env vars and have the setup script create `agent_manager`.

### Lakebase (managed Postgres)

- Included in Free Edition: 1 project, scale to zero (`verified`, limitations page). External apps connect over Postgres port 5432 with a 60-minute OAuth database credential obtained via `POST /api/2.0/postgres/credentials` using a service principal client-credentials token; Node example uses `pg` (`verified`: https://docs.databricks.com/aws/en/oltp/projects/external-apps-manual-api). Resume-from-zero time is not published (`verified` absence); docs say implement retries.
- Reaching it from a laptop is therefore plausible, but it needs a service principal (`unverified` on Free Edition) and gives us nothing SQLite does not: the app is single-user and local. Syncing Postgres to Delta is itself a Public Preview feature (`verified` on https://docs.databricks.com/aws/en/oltp/), which Free Edition cannot enable. **Skip.**

---

## 3. "Ask your team": Genie, and Databricks MCP servers

### Genie Conversation API

- **Name change:** docs now call Genie spaces "Genie Agents" (`verified`: https://docs.databricks.com/aws/en/genie/set-up). Limits: up to 50 tables/views per agent, 200,000 conversations per agent, 10,000 messages per conversation.
- **Endpoints** (`verified`, https://docs.databricks.com/api/workspace/genie/startconversation and `.../getmessage`):
  - `POST /api/2.0/genie/spaces/{space_id}/start-conversation` body `{ "content": "<question>" }` returns `conversation_id` and `message_id`.
  - `GET /api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}` poll until `status` is `COMPLETED`, `FAILED` or `CANCELLED` (intermediate: `SUBMITTED`, `ASKING_AI`, `EXECUTING_QUERY`). `attachments[].text.content` is the prose answer, `attachments[].query.query` the generated SQL, `attachments[].query.description` its description.
  - `GET .../messages/{message_id}/attachments/{attachment_id}/query-result` returns a `statement_response` (manifest plus rows) only while the message is `EXECUTING_QUERY` or `COMPLETED`.
  - Follow-up in the same conversation: `POST .../conversations/{conversation_id}/messages`.
- **Auth:** OAuth recommended; scope `genie` (`verified`, https://docs.databricks.com/aws/en/genie/conversation-api). The doc page does not mention PATs; PATs work for the REST API generally (`reported`). Needs CAN VIEW on the space, `SELECT` on the tables, CAN USE on the warehouse.
- **Polling:** every 1 to 5 s, stop after 10 min, no automatic retries (`verified`, same page).
- **Rate limit:** "best effort five questions per minute per workspace" for the API free tier, across all Genie spaces; the UI allows about 20 per minute (`verified` doc quote relayed by search of https://docs.databricks.com/aws/en/genie/set-up; also `reported` by a Databricks employee: https://community.databricks.com/t5/generative-ai/are-there-limits-set-for-agent-mode-in-databricks-free-edition/m-p/155797). One mirror says only POSTs count (`reported`).
- **Free Edition:** Genie is listed under what Free Edition includes ("Genie-powered dashboards", https://docs.databricks.com/aws/en/getting-started/free-edition, `verified`). Agent mode is degraded on Free Edition with no ETA (`reported`, same community thread, 2026-04-29); the chat-mode API is a separate path. Account admins must enable "Partner-powered AI features" (`verified`, set-up page); on your own Free Edition workspace you are the admin, but confirm the toggle on day 1.
- **Speed:** not published. Plan for 5 to 30 s per answer (`unverified`); show a loading state and the generated SQL as the "how I got this" line.
- **Accuracy:** text-to-SQL degrades on fuzzy terms (`reported`, https://querio.ai/articles/databricks-genie-api-what-you-can-build-where-it-falls-short). Mitigate with column comments in the DDL, 5 to 8 sample questions and 3 example SQL queries in the space.

### Could an AI employee use Genie as a tool? Yes, cheaply, in-process

Define an in-process MCP tool with the Agent SDK (`verified` signatures, https://code.claude.com/docs/en/agent-sdk/typescript):

```ts
const askTeamData = tool('ask_team_data',
  'Ask a question about the team\'s tasks, costs and activity.',
  { question: z.string() },
  async ({ question }) => ({ content: [{ type: 'text', text: await genie.ask(question) }] }),
  { annotations: { readOnlyHint: true } });
const server = createSdkMcpServer({ name: 'company-data', tools: [askTeamData] });
// options.mcpServers = { 'company-data': server }
```

The Genie client is the same one the Team screen uses. App-level limiter: one Genie call per 12 s globally (5/min), queue the rest, timeout 60 s, return "data unavailable" text on failure so the agent carries on.

### Databricks managed MCP servers from an external Claude Agent SDK process

- **URLs** (`verified`, https://docs.databricks.com/aws/en/generative-ai/mcp/managed-mcp and https://docs.databricks.com/aws/en/agents/mcp-tools/built-in-mcp-services):
  - Genie Agent: `https://<host>/api/2.0/mcp/genie/{genie_space_id}` (scope `genie`)
  - Databricks SQL: `https://<host>/api/2.0/mcp/sql` (scope `sql`)
  - UC functions: `https://<host>/api/2.0/mcp/functions/{catalog}/{schema}/{function}` (scope `unity-catalog`)
  - AI Search: `https://<host>/api/2.0/mcp/ai-search/{catalog}/{schema}/{index}` (scope `ai-search`)
  - Governed Unity Gateway MCPs: `https://<host>/ai-gateway/mcp-services/<name>` e.g. `system.ai.genie_one_mcp` (GA), `system.ai.dbsql` (Beta).
- **Auth:** PAT is supported through Unity Gateway as "the token's owner"; OAuth M2M as a service principal (`verified`, https://docs.databricks.com/aws/en/agents/mcp-tools/authentication-networking). The Agent SDK accepts `{ type: 'http', url, headers: { Authorization: 'Bearer <PAT>' } }` (`verified`, `McpHttpServerConfig` in `sdk.d.ts`).
- **Blocker for us:** the workspace-endpoint MCPs are Public Preview and "a workspace admin must enable Managed MCP Servers on the Previews page"; Free Edition cannot enable previews (`reported`). Whether the Previews page exists on Free Edition is `unverified`. The Unity Gateway MCPs (`system.ai.*`) may be a separate path; availability on Free Edition `unverified`.
- **Verdict:** try `…/api/2.0/mcp/genie/{id}` with the PAT once on day 1 (5 minutes). If it works, hand employees the Genie MCP directly (zero code). If not, the in-process tool above gives the same capability. Do not plan around MCP.

---

## 4. Foundation Model APIs, AI Gateway, `ai_query`

### What exists

- Pay-per-token catalogue (`verified`, https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/supported-models): Claude Fable 5.2/5.1/5, Opus 5.5/5/4.x, Sonnet 5.5/5/4.x, Haiku 5.5/4.5; many OpenAI GPT, Gemini, Llama 4 Maverick / 3.3 70B / 3.1 8B, Gemma 3 12B, Qwen3, GLM, Kimi, DeepSeek. Service names like `system.ai.claude-sonnet-5-5`.
- Vision: Sonnet 5.5 and Fable 5 are **text only** on Databricks; Sonnet 5, Opus 5.5, Haiku 5.5 and others accept images (`verified`). Tool use is listed for Haiku 5.5, Sonnet 5.5, Fable 5.2, Opus 5.5 (`verified`).
- Published rate limits are for Enterprise-tier workspaces (e.g. Claude Sonnet 1,000,000 input tokens/min, 100,000 output tokens/min); "These limits vary based on the workspace platform tier"; Free Edition not mentioned (`verified`, https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/limits).

### Is it callable on Free Edition?

- Free Edition doc: "Limits on the number of active endpoints... No GPU serving, no provisioned throughput... Certain models are unavailable." (`verified`).
- **`reported` blocker:** Free Edition endpoints for premium Claude and GPT return `PERMISSION_DENIED: The endpoint is temporarily disabled due to a Databricks-set rate limit of 0` (posts 2026-07-14 and 2026-08-23: https://community.databricks.com/t5/generative-ai/request-to-enable-foundation-model-endpoint-rate-limits/td-p/162965, https://community.databricks.com/t5/generative-ai/databricks-hosted-foundation-model-apis-blocked-by-workspace/td-p/166270). The same posts say Llama 4 Maverick and some Llama/Qwen models generally work, but one user saw Llama stop on 2026-07-17. These are community replies, not Databricks staff statements.
- `ai_query` with Databricks-hosted foundation models is on by default on Free Edition; `ai_query` with custom/external endpoints is off because Free Edition cannot enable previews (`reported`, https://community.databricks.com/t5/machine-learning/how-to-enable-public-preview-features-in-databricks-free-edition/m-p/131649, 2025-09-11).

### Can the Claude Agent SDK be pointed at Databricks?

- Mechanically yes: Databricks documents `ANTHROPIC_BASE_URL=https://<host>/ai-gateway/anthropic`, `ANTHROPIC_AUTH_TOKEN=<Databricks PAT>` and `ANTHROPIC_MODEL=<full UC model name>` for Claude Code (`verified`: https://docs.databricks.com/aws/en/ai-gateway/coding-agent-claude). The page does not mention computer use, beta headers, or Free Edition.
- **Verdict: a trap for the employees' main loop.** Free Edition zero-rate on premium Claude (`reported`); computer-use needs image input and Anthropic beta features that the page never promises through the gateway (`unverified`); the Claude Agent SDK bundles the Claude Code runtime and Anthropic-specific features; the user's own Anthropic key is simpler and already budgeted. Do not do this.

### Narrow use that could work: "Daily report" via AI Functions

- `ai_query(endpoint, request)` and task functions `ai_summarize`, `ai_classify`, `ai_extract`, `ai_gen` exist, not on Classic SQL warehouses (`verified`: https://docs.databricks.com/aws/en/sql/language-manual/functions/ai_query, https://docs.databricks.com/aws/en/large-language-models/ai-functions). Billed on top of compute on paid workspaces (`verified`); free on Free Edition within fair use (inference).
- Use: stretch item "Daily report" summarises the day's tasks per employee in one `ai_query('databricks-llama-4-maverick', concat(...))` over a few hundred tokens, with a template-text fallback built from the SQL aggregates if it fails. The endpoint name on Free Edition is `unverified` (list it in the workspace under Serving / AI Gateway on day 1).

---

## 5. Evaluation and monitoring ("performance review")

- MLflow 3 GenAI scorers: built-in LLM judges (Correctness, Completeness, Fluency...), custom `@scorer` code scorers, `make_judge`; you can select traces in the Traces tab, Actions, Evaluate, pick scorers, Run (`verified`: https://docs.databricks.com/aws/en/mlflow3/genai/eval-monitor/). Programmatic: `mlflow.genai.evaluate()` (Python only; `verified` in the Claude Agent SDK Python page).
- Production monitoring (automatic scoring of a sample of traces): `Beta`; for UC-stored traces needs `mlflow.monitoring.sqlWarehouseId`; max 20 scorers per experiment; results take 15 to 20 minutes; custom scorers must be notebook-defined `@scorer` functions (`verified`: https://docs.databricks.com/aws/en/mlflow3/genai/eval-monitor/production-monitoring). Tied to Beta and UC traces, so **not available to us on Free Edition** (inference from the verified UC/default-storage limits).
- Judge model cost/availability on Free Edition: `unverified`, and judges use hosted LLMs that may hit the same zero-rate (`reported`).
- **Low-effort alternative that does work:** a **performance review computed from our own Delta tables** with SQL (tasks done, failure rate, retries, permission-request count, cost per task, median task time, and a "blocked-on-user" time), optionally narrated by `ai_query`. Demo-only extra: in the Databricks UI, select a few traces, Actions, Evaluate, built-in judge, to show the trace-level scoring (manual, only if it works on the day).
- Agent Bricks / Knowledge Assistant: Knowledge Assistant is unsupported on Free Edition (`verified`, limitations page). Not needed.

---

## 6. Vector Search / company memory

- Free Edition: 1 AI Search (vector search) endpoint, 1 unit, no Direct Vector Access (`verified`). That leaves Delta Sync indexes with Databricks-computed embeddings (`verified` index types: https://docs.databricks.com/aws/en/vector-search/vector-search). Query by REST or SDK with a PAT (`verified`); service principal is faster by up to 100 ms (`verified`).
- Feasible from outside the workspace, but it needs an embedding model endpoint (a hosted embedding model such as GTE Large exists in the catalogue, `verified`; Free Edition access `unverified`), a Delta table with change data feed, an index sync (not instant, up to minutes), and writes through Delta (so every "note" costs a warehouse statement). A shared notes memory is better served by a local SQLite FTS table with the same notes mirrored to Delta for Genie.
- **Verdict: skip.** Local FTS gives employees "company memory" at zero latency; Delta mirroring makes it queryable. Do not spend time on Vector Search.

---

## 7. Dashboards

- AI/BI dashboards: embed by iframe only when published; basic iframe needs viewers to be signed in with explicit access and third-party cookies on; "external embedding" needs a service principal and OAuth secret and does not support Genie (`verified`: https://docs.databricks.com/aws/en/dashboards/embed). Admin must define allowed embedding surfaces. Whether embedding works in an Electron webview and on Free Edition: not covered (`unverified`).
- **Verdict: draw our own charts/tables in Astryx from SQL results.** Cleaner (no login wall, no foreign visual style, matches the Figma bar, works offline from the local fallback) and the data still demonstrably comes from Delta. Add one "Open in Databricks" text link per section (to the table or experiment) for judges who want to see the platform; do not embed.
- Optional demo-only: build an AI/BI dashboard by hand in the workspace UI (Genie can author it from the tables) as a backup tab for the demo. Zero code.

---

## 8. Databricks Apps

- Supports Node.js (React, Express) and Python; OAuth; billed hourly on paid workspaces; Free Edition: 3 apps per account, each auto-stops 24 h after start/update/redeploy (`verified`). Databricks now has `@databricks/appkit` (TypeScript SDK with an analytics plugin for SQL files; Node 22+) (`reported`: https://github.com/databricks/appkit).
- Network egress: Apps run on serverless compute under serverless network policies; network policies are Enterprise-only; allowlist examples include `*.databricksapps.com`, `pypi.org`, `registry.npmjs.org`; Free Edition says outbound internet is limited to "a limited set of trusted domains" with no published list; users say pypi.org resolves, GitHub and Hugging Face unconfirmed and region-dependent (`verified` limitation; list `reported`: https://community.databricks.com/t5/databricks-free-edition-help/whitelist-for-outbound-network-access/m-p/146673).
- App viewers sign in through the workspace's OAuth proxy; judges have no account on our workspace (inference from "Apps use OAuth", `unverified`), so a public "team dashboard" link does not work for judges anyway.
- **Verdict: skip.** It adds a second front end to build and keep alive, solves no problem a local Mac app has, and the 24 h stop is a demo-day hazard. Revisit only if the sponsor hands out a paid workspace and there is spare time.

---

## 9. What winners built and what counts as "building on the platform"

- **Inaugural Databricks Free Edition Hackathon (2025-11-05 to 2025-11-14):** judged on technical complexity and execution, creativity and innovation, presentation and communication, impact and learning value; five-minute demo; judges included Reynold Xin (`verified`: https://www.databricks.com/blog/databricks-free-edition-hackathon-show-world-whats-possible-data-and-ai). Winners: VidMind (YouTube demos into a structured knowledge base), a space-weather grid-risk forecaster, a recipe recommender (`verified`: https://www.databricks.com/blog/announcing-winners-inaugural-databricks-free-edition-hackathon). No required feature list.
- **DAIS 2026 community contest (Free Edition):** winners include a Power BI to Unity Catalog lineage syncer, an AI sales intelligence case study, a "Governance RiskOps Agent" that turns Unity Catalog audit logs into security insights, SupplyAgent (point-in-time correctness for LLM agents). Tie-break quote: one project was "wildly creative", the other "solved a real business problem beautifully" (`verified`: https://community.databricks.com/t5/announcements/dais-2026-community-virtual-contest-winners-announced/m-p/160195).
- **Built-On Databricks Startup Challenge 2026** grand prize went to an agentic threat-intel platform (`reported`: https://www.databricks.com/blog/celebrating-winners-2026-built-databricks-startup-challenge).
- **What judges visibly like (inference from the above):** a real business problem, Unity Catalog and governance used for something real, an agent that acts on data, clear storytelling in a short demo.
- **Minimum that reads as "building on the platform" rather than "logging to it"** (our judgement, `unverified` against the Imperial judges): the platform must be on the **read path of a user-visible feature**, and at least three platform primitives must be used for distinct jobs. Our design: Unity Catalog Delta as the data model (system of record for team activity, not just a log), SQL warehouse for the Team report, Genie for natural-language questions, MLflow Tracing for agent observability. A pure insert-only logger would fail this test; that is why the Team screen and the Ask box read from Databricks.
- The Imperial bounty text is "pipeline, agent or app", scored on creativity, technical depth, real-world impact (`verified`, `docs/hackathon/tracks.md`). Our app is the "agent app"; Databricks supplies the data layer and analytics. Whether the judges require the app itself to run on Databricks is unknown: ask the sponsor (open question).

---

## 10. Free Edition practicalities

### Sign-up and workspace

- Sign up at https://login.databricks.com/?dbx_source=docs&intent=CE_SIGN_UP; options are email one-time passcode, Sign in with Google, Sign in with Microsoft; a new serverless workspace is created (`verified`: https://docs.databricks.com/aws/en/getting-started/free-edition and limitations page). Time: a few minutes (`unverified`). Use a personal email (`verified`: trial-vs-Free page). Non-commercial; "Databricks reserves the right to train on your data" (`verified`: https://docs.databricks.com/aws/en/getting-started/free-trial-vs-free-edition): **never put real customer data in it; use only the app's own synthetic or demo data.**
- One workspace per user. If the sponsor hands out workspaces, use that instead (and then UC trace tables may become possible).
- LinkedIn verification: raises some limits and gives limited access to AI Runtime; appears only for eligible users; does not remove other limits (`verified` from limitations page, details `reported`). Not needed for this design.

### Credentials and ids

- **PAT:** top-right user menu, Settings, Developer, Access tokens, Manage, Generate new token (`reported`, adamfortuno post). Copy once.
- **Host:** the workspace URL in the browser, `https://dbc-xxxxxxxx-xxxx.cloud.databricks.com`.
- **Warehouse id:** SQL Warehouses, open "Serverless Starter Warehouse", Start; the `http_path` ends in `/sql/warehouses/<id>`; the id is the last segment (`reported`).
- **Catalog and schema:** expect catalog `workspace`, schema `default` (`unverified`); we create `agent_manager`. Managed tables on default storage are fine for Delta/Genie (`verified`: default catalog uses default storage). External Iceberg/Delta clients cannot read default-storage files directly, but we only use SQL (`verified`).
- **Service principal:** skip; only needed for OAuth M2M, availability on Free Edition `unverified`.

### Quota behaviour

- Fair-use quotas; if exceeded, compute shuts down until the limit resets, "the rest of the day or, in extreme cases, the rest of the month"; data and settings are kept (`verified`, limitations page). Daily numbers are not published.
- Our consumption: warehouse seconds (one short MERGE per table per flush, plus Genie queries). Keep flush interval at 30 s only while employees are active; pause when idle; hard cap of 1,000 statements per day in the sink (`unverified` sizing; cap is ours). On quota shutdown the sink simply goes into backoff (section 11).
- Other limits that matter: 1 warehouse 2X-Small; Genie API about 5/min; 1 Lakebase, 1 AI Search endpoint (unused); jobs max 5 concurrent tasks (unused).

---

## 11. Failure isolation (Databricks must never hurt the app)

Principles: SQLite is the source of truth; Databricks is a mirror plus an optional read path; no agent code `await`s a Databricks call.

1. **Single write path to SQLite.** All events/tasks/messages/usage are written locally first (WAL mode). A trigger-free `outbox` table records pending rows: `outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT, pk TEXT, row_json TEXT, created_ms INTEGER, attempts INTEGER DEFAULT 0)`; delete rows after a confirmed `SUCCEEDED`.
2. **Sink worker** (`DatabricksSink`, separate timer, never on the agent's async path): drains up to 500 rows per table, one in-flight statement, `AbortSignal.timeout(45_000)`, `wait_timeout=30s`, then poll with a 120 s ceiling. Idempotent `MERGE` so retries and duplicates are harmless.
3. **Circuit breaker:** after 3 consecutive failures open the breaker; backoff 15 s, 30 s, 1 min, 2 min, ... cap 10 min; one probe on half-open. Treat HTTP 401/403 as "credential problem": stop and surface one quiet state in Settings, do not retry.
4. **Kill switch:** `DATABRICKS_SYNC=off` env var and a Settings toggle; with it off nothing network-related runs and the UI shows local data only.
5. **Reads fall back:** Team report tries the warehouse with an 8 s budget and shows the last cached result instantly (stale-while-revalidate); if Databricks is down it computes the same figures from SQLite using portable SQL (`SUM`, `COUNT`, `GROUP BY` over BIGINT epoch-ms and DOUBLE columns, identical in both engines). The UI shows a small text "Synced 3 min ago" or "Local only"; no modal, no error toast.
6. **Genie:** global limiter of 1 call per 12 s, 60 s timeout, always returns a typed result (`ok | unavailable | rate_limited`); the Ask box shows a one-line empty/error state; the employee tool returns plain text "data unavailable".
7. **Tracing:** wrap `mlflow.init` and `createTracedQuery` in try/catch; if init throws, use the raw `query`. Do not await `flushTraces()` on the task-completion path (fire and forget with a 10 s race). If synchronous export proves to block or leak errors, set `MLFLOW_ENABLE_ASYNC_TRACE_LOGGING=true` (on-disk write-ahead log drained by a daemon process; `verified` in package source `exporters/wal`) at the cost of an extra process.
8. **Secrets:** PAT only in the macOS Keychain (Electron `safeStorage`), never in SQLite, events or logs; redact `Authorization` in any logged request.
9. **Data hygiene before upload:** truncate `events.detail` to 4 KB, never upload screenshots or file contents, hash nothing, upload only what the Team screen and Genie need. (No prompt-injection hardening, per D-012; this is just minimal data hygiene and keeps statements small.)
10. **Demo safety:** a "Load demo data" action seeds SQLite and (optionally) Delta with a week of synthetic activity so the Team screen and Genie always have content, even if employees did not run before the demo.

---

## Recommended integration (one coherent design)

**Name:** "Team report and Ask". Databricks as the team's HR, timesheet and audit store.

### Placement in the product (one screen)

- **Team** screen (reached from a single "Team" item at the bottom of the employee list, not a new top-level nav): an Astryx **Table** with one row per employee: portrait and name, active time today, tasks done, tasks failed, cost today, last activity. Row click opens a drawer with that employee's task list (Table) with a quiet **"Trace"** link per task. Above the table: one Astryx text input, placeholder "Ask about your team". Answer appears below as short text plus the generated SQL in a collapsed "Show query". Right-aligned small text "Synced 2 min ago". No charts required; if one is added, a single sparkline per row from the same data. Empty, loading, and error states are single lines.
- This is the only Databricks-facing surface. No logos, no banners, no settings clutter: one "Databricks" section in Settings (host, token, test connection, on/off).

### Must-do (small, safe, clearly on-platform): M1 + M2

**M1. Delta system of record via outbox sync.**
- Data flow: app event bus, SQLite tables + `outbox`, `DatabricksSink`, `POST /api/2.0/sql/statements`, Delta tables in `workspace.agent_manager`.
- Packages/endpoints: no new packages (Node `fetch`); SQL Statement Execution API. Setup script `scripts/databricks-setup.ts` that runs the DDL below (idempotent) through the same API.
- Effort: 3 to 4 hours (outbox, sink, circuit breaker, DDL runner, a day-1 latency probe).
- Cost: GBP 0 (Free Edition); a few warehouse-seconds per flush.
- Fallback: sink off, app unchanged.

**M2. Team report read path.**
- Data flow: Team screen requests `report(day)`, tries warehouse (8 s budget), else cached, else SQLite computation with the same SQL.
- Query (portable):
  ```sql
  SELECT e.employee_id, e.name,
         SUM(t.active_ms) AS active_ms,
         SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS tasks_done,
         SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS tasks_failed,
         SUM(t.cost_usd) AS cost_usd
  FROM employees e LEFT JOIN tasks t ON t.employee_id = e.employee_id AND t.assigned_ms >= :day_start_ms
  GROUP BY e.employee_id, e.name ORDER BY cost_usd DESC
  ```
  (Delta variant uses the `assigned_ms` BIGINT column that both stores carry; see DDL.)
- Effort: 2 hours. Cost: GBP 0. Fallback: SQLite.

### Should-do (the feature judges notice): S1 Ask your team (Genie), S2 MLflow traces

**S1. "Ask about your team" with Genie.**
- UX: the input at the top of Team.
- Data flow: question, `GenieClient.ask()` (start-conversation, poll message, fetch query-result if attachment has SQL), render text answer and a mini result table (first 20 rows) in Astryx Table; collapsed SQL. Follow-ups reuse `conversation_id`.
- Endpoints: `POST /api/2.0/genie/spaces/{id}/start-conversation`, `GET .../messages/{mid}`, `GET .../attachments/{aid}/query-result`.
- Effort: 2 to 3 hours including the limiter. Cost: GBP 0 (counts against the 5/min tier).
- Fallback: input disabled with the line "Connect Databricks to ask questions"; canned answers are not shipped (do not fake it); for the demo, rehearse 3 questions in advance and record a 20 s clip.
- Seed questions to put in the Genie space ("Common questions"): "Who spent the most this week?", "Which tasks failed yesterday and why?", "How many hours did each employee work today?", "Which employee asked for the most permissions?", "What did Maya finish today?"

**S2. MLflow traces, one per task.**
- UX: the "Trace" link in a task row (opens `https://<host>/ml/experiments/<experiment_id>` in the browser, deep link format `unverified`, fall back to the experiment page). In the demo, show the trace tree in Databricks (AGENT, LLM, TOOL spans, tokens).
- Data flow: `createTracedQuery(query)` inside `tracingContext({ sessionId: employeeId, user: employeeName, tags })`; store `tasks.trace_id`.
- Packages: `@mlflow/core@0.5.0`, `@mlflow/claude-code@0.5.0`, `@anthropic-ai/claude-agent-sdk` (already used). Requires Node >= 22 (Electron 45 OK) and ESM import of `@mlflow/claude-code`.
- Effort: 1.5 to 2 hours plus test (tag propagation, flush, peer-dep warning). Cost: GBP 0. Fallback: raw `query`, link hidden when `trace_id` is null.

### Stretch (only if everything above works)

- **X1. Employees get a "company data" tool** (`ask_team_data`, in-process MCP tool wrapping the same Genie client). Story: employees can look up what colleagues did, a lightweight shared memory. 1 hour. Respect the Genie limiter.
- **X2. Daily report.** A nightly or on-demand SQL aggregate plus `ai_query` narrative (Llama on Free Edition; template text fallback); stored in `daily_reports` and shown as one paragraph above the Team table. 1.5 hours. Skip if `ai_query` endpoint is not callable.
- **X3. Performance review.** One computed "review" per employee per week from tasks and usage (failure rate, cost per task, blocked time), optionally narrated by X2. 1 hour on top of M2.
- **X4. Managed Genie MCP for employees** if the day-1 test of `/api/2.0/mcp/genie/{id}` with the PAT succeeds (then X1 becomes a config entry). 20 minutes.
- Not recommended: Lakebase, Vector Search, Apps, dashboard embedding, hosted Claude as the LLM, UC trace tables.

### Table schemas (Delta DDL; run by the setup script)

Catalog and schema from env; identifiers below assume `workspace.agent_manager`. All ids are text (UUIDv7 or ULID). Timestamps are carried twice: `*_ms BIGINT` (portable aggregation, identical in SQLite) and a `TIMESTAMP` for readable queries and Genie.

```sql
CREATE SCHEMA IF NOT EXISTS workspace.agent_manager COMMENT 'Agent Manager: AI employee activity';

CREATE TABLE IF NOT EXISTS workspace.agent_manager.employees (
  employee_id STRING COMMENT 'Primary key',
  name STRING COMMENT 'Human first name of the AI employee',
  role STRING COMMENT 'Job role, e.g. web developer, marketer',
  permission_level STRING COMMENT 'How much the employee must ask before acting: low, medium, high',
  created_ms BIGINT, created_at TIMESTAMP,
  updated_ms BIGINT
) USING DELTA;

CREATE TABLE IF NOT EXISTS workspace.agent_manager.tasks (
  task_id STRING COMMENT 'Primary key',
  employee_id STRING COMMENT 'Employee who owns the task',
  title STRING COMMENT 'Short task description',
  assigned_by STRING COMMENT 'user or another employee_id',
  status STRING COMMENT 'queued, running, blocked, done, failed, cancelled',
  assigned_ms BIGINT, assigned_at TIMESTAMP,
  finished_ms BIGINT, finished_at TIMESTAMP,
  active_ms BIGINT COMMENT 'Milliseconds the employee was actually working (not blocked or idle)',
  input_tokens BIGINT, output_tokens BIGINT,
  cost_usd DOUBLE COMMENT 'Estimated model cost in US dollars',
  num_turns INT,
  outcome STRING COMMENT 'One or two sentence result',
  trace_id STRING COMMENT 'MLflow trace id, if traced',
  updated_ms BIGINT
) USING DELTA;

CREATE TABLE IF NOT EXISTS workspace.agent_manager.events (
  event_id STRING COMMENT 'Primary key',
  employee_id STRING, task_id STRING,
  ts_ms BIGINT, ts TIMESTAMP,
  kind STRING COMMENT 'plan_step, tool_call, shell, file, gui_action, permission_request, permission_decision, error, status, complete',
  tool STRING COMMENT 'Tool or application name',
  summary STRING COMMENT 'One-line description',
  detail STRING COMMENT 'Truncated JSON (max 4 KB), never screenshots',
  status STRING COMMENT 'ok, error, denied, pending',
  duration_ms BIGINT
) USING DELTA;

CREATE TABLE IF NOT EXISTS workspace.agent_manager.messages (
  message_id STRING COMMENT 'Primary key',
  ts_ms BIGINT, ts TIMESTAMP,
  from_id STRING COMMENT 'employee_id or user',
  to_id STRING COMMENT 'employee_id or user',
  channel STRING COMMENT 'user_dm, employee_dm, meeting',
  task_id STRING,
  body STRING COMMENT 'Message text (truncated to 2 KB)'
) USING DELTA;

CREATE TABLE IF NOT EXISTS workspace.agent_manager.usage (
  usage_id STRING COMMENT 'Primary key',
  ts_ms BIGINT, ts TIMESTAMP,
  employee_id STRING, task_id STRING,
  model STRING,
  input_tokens BIGINT, output_tokens BIGINT,
  cache_read_tokens BIGINT, cache_write_tokens BIGINT,
  cost_usd DOUBLE COMMENT 'Cumulative-so-far at task level is stored on tasks; this row is the per-call delta'
) USING DELTA;

-- stretch
CREATE TABLE IF NOT EXISTS workspace.agent_manager.daily_reports (
  report_id STRING, day DATE, employee_id STRING, summary STRING, generated_by STRING, created_ms BIGINT
) USING DELTA;
```

Notes: `usage.cost_usd` as per-call delta is computed locally as `current_cumulative - previous_cumulative` (the SDK's `total_cost_usd` is cumulative per query). `tasks.cost_usd` is the latest cumulative. Add `ALTER TABLE ... SET TBLPROPERTIES (delta.autoOptimize.optimizeWrite = true)` is unnecessary at this size. No primary-key constraints (not enforced for our purpose, and MERGE keys do the work).

SQLite mirrors the same columns (without `TIMESTAMP` duplicates, derive `ts` at sync time with `from_unixtime(ts_ms/1000)` in the MERGE source or send ISO strings).

### Exact environment variables

```
DATABRICKS_SYNC=on                         # on | off (kill switch)
DATABRICKS_HOST=https://dbc-xxxx.cloud.databricks.com
DATABRICKS_TOKEN=dapi...                   # store via Keychain, env only for dev
DATABRICKS_WAREHOUSE_ID=xxxxxxxxxxxxxxxx
DATABRICKS_CATALOG=workspace
DATABRICKS_SCHEMA=agent_manager
DATABRICKS_GENIE_SPACE_ID=01f...           # from the Genie space settings tab
MLFLOW_TRACKING_URI=databricks
MLFLOW_EXPERIMENT_ID=1234567890123456
# optional:
MLFLOW_ENABLE_ASYNC_TRACE_LOGGING=false
```

---

## What the user must set up by hand (ordered, about 15 minutes)

1. Ask the Databricks sponsor at the event whether they provide workspaces or credits and whether the bounty requires the app itself to run on Databricks (Q below). If a workspace is provided, use it and skip step 2.
2. Sign up for Free Edition: https://login.databricks.com/?dbx_source=docs&intent=CE_SIGN_UP (email OTP, Google or Microsoft). Use a personal email. Do not upload real data.
3. Note the workspace host URL from the address bar.
4. SQL Warehouses, open "Serverless Starter Warehouse", click Start, copy the warehouse id from the URL (`/sql/warehouses/<id>`).
5. User menu, Settings, Developer, Access tokens, Manage, Generate new token (30 days). Copy it once into the macOS Keychain entry the app will read (or a gitignored `.env.local`).
6. Run the day-1 smoke test (a coding agent can do it): `curl -X POST $DATABRICKS_HOST/api/2.0/sql/statements -H "Authorization: Bearer $DATABRICKS_TOKEN" -d '{"warehouse_id":"...","statement":"SELECT current_catalog(), current_schema()","wait_timeout":"30s"}'`; record the catalog name, wall time, and whether cold start was fast. If it fails with 401/403, PATs are blocked: switch to OAuth U2M (`databricks auth login`) or service principal.
7. Run the app's `databricks-setup` script (creates schema and tables). Check in Catalog, Explorer that the tables exist.
8. Genie: sidebar, Genie, New; add the five tables; set the default warehouse; add 5 sample questions and 3 example SQL queries; copy the space id from Configure, Settings. (Also confirm "Partner-powered AI features" is on.)
9. Experiments: create an experiment (e.g. `/Users/<you>/agent-manager`), copy the experiment id from the info icon.
10. Day-1 optional probes (each 5 minutes, results into `research-log.md`): Genie MCP URL with the PAT; list Serving endpoints and try `SELECT ai_query('<llama endpoint>', 'hi')`; send one `@mlflow/core` trace and confirm it appears under the experiment's Traces tab.

LinkedIn verification: not needed.

---

## How to show it to judges in 30 seconds

1. (0 to 8 s) Team screen: three employees with hours, tasks, cost already populated from Databricks ("Synced just now"). Say: "Every action our AI employees take is mirrored to Unity Catalog Delta tables, so the manager sees timesheets and cost like for people."
2. (8 to 20 s) Type "Who spent the most this week and on what?" in the Ask box; Genie answers, expand "Show query" to show the generated SQL against our tables. Say: "Natural language on Databricks Genie."
3. (20 to 30 s) Click "Trace" on a task: Databricks MLflow trace tree with tool calls and tokens. Say: "Each task is an MLflow trace, so we can audit and evaluate agent behaviour." Close with: "If Databricks is down, the app keeps working from local storage."
- Rehearse with demo data loaded; keep a 30 s screen recording as a fallback; pre-warm the warehouse and ask the three Genie questions once five minutes before.

---

## Risks and unknowns

| # | Risk or unknown | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Free Edition serverless capacity queueing (minutes per query, `reported`) | Slow Team report and Genie on demo day | Cached last result, pre-warm, local fallback, recorded clip |
| R2 | Free Edition PAT or REST access blocked or changed (`unverified` after July 2025 report) | M1, S1 blocked | Day-1 smoke test; alternative OAuth U2M; ask sponsor for a workspace |
| R3 | UC trace tables impossible on default storage (`verified`), so traces are not SQL-queryable | Weaker "traces in SQL" story | Our own Delta tables carry analytics; link to traces in the UI |
| R4 | Experiment-backed traces may fail on Free Edition (artifact upload, `unverified`) | S2 blocked | Test on day 1; if blocked, drop S2, keep M and S1 (still strong) |
| R5 | `@mlflow/claude-code` peer range `^0.2.0` vs SDK 0.3.x, ESM-only, Node >= 22 | Install or runtime friction | `--legacy-peer-deps`, dynamic `import()`, pin versions, test early; fallback `@mlflow/core` manual spans around our own event bus |
| R6 | Genie API 5 questions/min, agent mode degraded, text-to-SQL accuracy | Ask box flaky | Limiter, column comments and example SQL, rehearsed questions |
| R7 | Free Edition cannot enable previews (`reported`, 2025): managed MCP, `ai_query` on custom endpoints | MCP stretch dead | In-process tool instead |
| R8 | Premium Claude on Databricks has rate limit 0 on Free Edition (`reported`) | Cannot run employees there | Not planned; user's own Anthropic key |
| R9 | `inline(from_json(...))` batching syntax and `MERGE ... INSERT *` unverified on this warehouse | M1 rework | Fallback multi-row INSERT with parameters; test first hour |
| R10 | Quota shutdown for the rest of the day (`verified` policy) | Databricks offline mid-demo | Circuit breaker, hard statement cap, local fallback, do not stress-test the day before |
| R11 | Non-commercial terms and "Databricks reserves the right to train on your data" | Data hygiene | Only synthetic/demo data, no screenshots or file contents uploaded |
| R12 | Judges may expect the app to run on Databricks (Apps) | Perceived "bolted on" | Ask sponsor; our read path (report, Genie) makes the platform user-visible; Apps is too costly (24 h stop, login wall) |
| R13 | Docs and product names are churning (Genie Agents, Unity Gateway, AI Search, Genie One) | Wrong endpoint or name | Use REST paths verified above; re-check on the day |
| R14 | Setup friction for a non-technical user | Time loss | One setup script, one checklist, Settings "Test connection" button that reports each of: host, token, warehouse, schema, Genie, experiment |

### Open questions (for the user / sponsor)

- Does the Databricks sponsor provide workspaces, credits or a paid workspace (unlocks UC trace tables, previews, Claude endpoints)?
- Must the submission run on Databricks (Apps) or is a local app writing to and reading from Databricks acceptable?
- Is a 5-minute demo video or a live demo expected (affects how much to pre-seed)?
- Can one project enter several bounties (Databricks plus Synthesia)? (Also open as Q-005.)
- Is the team happy to keep a PAT in the macOS Keychain on the demo laptop?

### Sources (all read 2026-11-14)

- Free Edition: https://docs.databricks.com/aws/en/getting-started/free-edition , .../free-edition-limitations , .../free-trial-vs-free-edition
- Tracing: https://docs.databricks.com/aws/en/mlflow3/genai/tracing/app-instrumentation/typescript-sdk , .../trace-unity-catalog , .../managed-warehouse , .../integrations/claude-code ; https://mlflow.org/docs/latest/genai/tracing/integrations/listing/claude_agent_sdk_typescript/ , .../claude_agent_sdk_python/ , https://mlflow.org/docs/latest/genai/tracing/token-usage-cost/ , https://www.mlflow.org/blog/typescript-enhancement ; npm `@mlflow/core`, `@mlflow/claude-code` 0.5.0 (source inspected)
- SQL: https://docs.databricks.com/api/workspace/statementexecution/executestatement , https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial , https://github.com/databricks/databricks-sql-nodejs
- Genie/MCP: https://docs.databricks.com/aws/en/genie/conversation-api , .../genie/set-up , https://docs.databricks.com/api/workspace/genie/startconversation , .../getmessage , https://docs.databricks.com/aws/en/generative-ai/mcp/managed-mcp , .../agents/mcp-tools/built-in-mcp-services , .../authentication-networking
- Models: https://docs.databricks.com/aws/en/machine-learning/foundation-model-apis/supported-models , .../limits , https://docs.databricks.com/aws/en/ai-gateway/coding-agent-claude , https://docs.databricks.com/aws/en/sql/language-manual/functions/ai_query , .../large-language-models/ai-functions
- Eval: https://docs.databricks.com/aws/en/mlflow3/genai/eval-monitor/ , .../production-monitoring
- Other: https://docs.databricks.com/aws/en/vector-search/vector-search , .../dashboards/embed , .../dev-tools/databricks-apps/ , .../databricks-apps/networking , .../oltp/ , .../oltp/projects/external-apps-manual-api , .../storage/default-storage
- Community (`reported`): threads on Free Edition capacity (156134), Genie limits (155797), FMAPI zero rate limit (162965, 166270), previews (131649), outbound domains (146673)
- Winners: https://www.databricks.com/blog/announcing-winners-inaugural-databricks-free-edition-hackathon , https://www.databricks.com/blog/databricks-free-edition-hackathon-show-world-whats-possible-data-and-ai , https://community.databricks.com/t5/announcements/dais-2026-community-virtual-contest-winners-announced/m-p/160195
- Agent SDK: https://code.claude.com/docs/en/agent-sdk/typescript ; `@anthropic-ai/claude-agent-sdk@0.3.325` `sdk.d.ts` (cost field, `McpHttpServerConfig`)
