# W8 hand-back: Databricks mirror, team report, Ask, traces

Status: done and run for real (the credentials arrived while I worked). Everything below is real output, trimmed. The only thing not run is Genie over our own tables (no space id yet).

## Files (all mine)
`src/office/sync/`: `databricks.ts` (the sync: outbox, sink, breaker, report path, Genie, backfill), `outbox.ts`, `breaker.ts`, `sql.ts` (DDL, escaping, MERGE builder), `mapping.ts`, `http.ts`, `warehouse.ts`, `genie.ts`, `tracing.ts`, `index.ts`, `types.ts` (added optional `db` to `SyncDeps`), `fakeDatabricks.ts` (the fake: tests and offline runs only), tests `sql|outbox|breaker|databricks|genie|tracing.test.ts`. `team.ts`, `localSync.ts` untouched. Scripts: `scripts/databricks-setup.ts`, `scripts/smoke/databricks.ts`.

## Edits to core files: none
The store already had the `outbox` table (id = sequence number, table_name, row_id, payload, created_ms, sent_ms), so no migration. The sync reads the store's SQLite handle from `deps.data.db` (the Store passes itself as `data`). A supersede scans the small unsent set; no index was needed.

## Evidence
1. `npm run typecheck:area -- src/office/sync` -> `no type errors under src/office/sync`; same for `scripts`.
2. `npx vitest run src/office/sync` -> `Test Files 7 passed (7) / Tests 70 passed (70)`; run 4x in a row and 4x in parallel, stable. `team.test.ts` and the store tests still pass. One transient failure appeared once while I edited the fake mid-run, not reproduced since.
3. No credentials (the Databricks variables blanked on the command line; dotenv never overrides an existing variable): office log has only the two npm lines and the "listening" line, nothing about Databricks; `/api/health` -> `"databricks":false,"genie":false`; `/api/team?range=week` -> `local None {'activeMs': 27600490, 'tasksDone': 24, ...}`; outbox empty (nothing is recorded when off).
4. Fake Databricks (in-process HTTP, dummy token, vars on the command line only): `/api/health` -> `databricks:true,genie:true`; `/api/team?range=week` -> `databricks 1794699721711 {'activeMs': 27600489, 'tasksDone': 24, 'costUsd': 5.88}` (cost differs from the local 5.879999999999999 only by float summation order); rows and totals matched the local computation on the same database in an earlier run. `/api/team/ask` -> fixed fake Genie answer. Statements the fake received (5 tables, trimmed):
```
MERGE INTO `workspace`.`agent_manager`.`tasks` AS t
USING (SELECT * FROM VALUES
  ('tsk_seed..0001', 'emp_..', 'Fix the cart total on checkout', 'user', 'done', CAST(1794646800000 AS BIGINT), timestamp_millis(1794646800000), ... CAST(0.12 AS DOUBLE), CAST(6 AS INT), 'Done. ...', CAST(NULL AS STRING), CAST(1794699049677 AS BIGINT))
  AS v(`task_id`, `employee_id`, ... `updated_ms`)) AS s
ON t.`task_id` = s.`task_id`
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
```
Same shape for employees, events (steps), messages and usage (the last two without the MATCHED clause). The backfill sent the whole seed history at boot: delta tables `{employees 4, tasks 58, events 75, messages 69, usage 5}`.
5. REAL workspace (`workspace.agent_manager`, warm warehouse):
   - `databricks-setup.ts` run 4 times: `schema 1.0 s, employees 0.4, tasks 0.6, events 0.5, messages 0.5, usage 0.5, daily_reports 0.6 - All 7 statements succeeded.` every time (idempotent). It then finds or creates the experiment and prints `MLFLOW_EXPERIMENT_ID=168570061655641`, `Experiment page: https://dbc-a9f3f8e3-dd55.cloud.databricks.com/ml/experiments/168570061655641`. I did not touch `.env.local`.
   - `smoke/databricks.ts` twice, identical shape (run 1 / run 2): select 1.3 / 1.1 s; create tables 3.9 / 3.5 s; flush of 2 employees + 6 tasks + 6 messages + 6 steps + 6 usage (5 MERGEs) 10.3 / 10.2 s; team report read from the warehouse `source databricks`, matches local, 1.1 / 0.8 s; same query another range 0.8 / 0.9 s; second sync of the same rows leaves counts `{"employees":2,"tasks":6,"events":6,"messages":6}` 14.0 / 13.7 s; MLflow trace listed in the experiment 3.2 s; synthetic rows deleted 7.0 / 6.2 s. Cold start was not seen (warehouse already running, so I cannot give cold numbers).
   - Seeded mock office on the real workspace: `/api/team` first call 0.86 s `databricks`, repeat 0.00 s (60 s cache). `smoke/databricks.ts --counts data-w8/office.db` -> `MATCH employees 4/4, tasks 58/58, events 76/76, messages 71/71, usage 6/6`, outbox 0. Then I cleared the backfill flag, restarted and re-sent all 215 rows (18 s): counts identical (MERGE idempotent). `--counts` counts only keys that exist in the local database, because the workspace also holds other offices' rows (below).
   - Genie: `GET /api/2.0/genie/spaces` -> 200, one sample space ("Bakehouse Sales Starter Space"). Our client against it: first question 14.0 s (answer text, SQL, 2 columns, 3 rows), follow-up in the same conversation 12.6 s. Not run over our tables: needs a space made in the UI.
   - MLflow: `tracedQuery` over a stand-in query, then `MlflowClient.searchTraces`: the trace was listed 0.3 s after the flush. Free Edition experiment tracing works.

## What it does (behaviour worth knowing)
- Outbox row = table, key, JSON payload, sequence; a newer write for the same key replaces an unsent one. Flush every 30 s, at 200 queued rows, once at boot (a `SELECT 1` if nothing is queued; it also warms the warehouse) and on stop (5 s cap). One MERGE per table per round, at most 500 rows, rounds repeat until drained; cap 1000 statements a day. Breaker: 3 failures in a row opens it 5 minutes, then one probe; a 401 or 403 opens it at once. Request timeout 8 s, statement ceiling 120 s. If a MERGE fails with "not found" the DDL is run once and the MERGE retried.
- First run against a workspace and schema queues the history that already exists (flag in the store's `kv`, keyed on host, catalog, schema).
- Team report: waits only until the `tasks` outbox rows are sent (other tables are not needed), runs the aggregate, maps it to local employees (removed employees are left out, as locally), caches 60 s per range, returns the local computation on any failure, timeout (8 s total), open breaker or unsent tasks. Usage row ids are derived from the row, so a re-send never duplicates.
- Genie: 5 questions a minute (plain-sentence 429 `rate_limited`), poll 2 s up to 45 s (`genie_timeout`, `genie_failed` as one sentence), first 20 rows. No space id: 409 `genie_off`, or the fixed mock answer with `MOCK_GENIE=1`.
- Tracing: `tracedQuery(q)` is `q` itself unless `MLFLOW_EXPERIMENT_ID`, `DATABRICKS_HOST` and `DATABRICKS_TOKEN` are set; then a function that uses the traced query once MLflow has loaded (`createSync` awaits the load at start-up, so the first session is traced) and the plain one otherwise. `experimentUrl()` is exported from `sync/index.ts`. `Task.traceId` stays null.

## For the orchestrator
1. **Real workspace is polluted by other agents.** Every office that loads `.env.local` with `DATABRICKS_SYNC=on` now mirrors its mock data (47 employees, 476 tasks, 627 events, 653 messages, 65 usage rows when I looked). Clean before the demo: `TRUNCATE TABLE workspace.agent_manager.<table>` for employees, tasks, events, messages, usage (run through the statement API), and set `DATABRICKS_SYNC=off` for test offices (or blank the variables). I did not delete other agents' rows.
2. `.env.local` needs `MLFLOW_EXPERIMENT_ID=168570061655641` (the setup script prints it; I did not edit the file). I deleted a duplicate `/Shared/agent-manager` experiment I had created; two smoke traces remain in the kept experiment.
3. **Type change for the Team link:** `SyncStatus` has no room for the experiment link and `Capabilities` (shared, frozen) is built from only `databricks` and `genie`. Suggest an optional `experimentUrl?: string | null` on `TeamReport` (set by `office.team()` from `experimentUrl()` exported by `sync/index.ts`) or on `Capabilities`. Until then the renderer can derive it from nothing; no link is exposed.
4. `runtime` (W2) should call `tracedQuery(query)` from `sync/index.ts` when it builds the SDK call; it is a plain function wrapper and safe to call per session.
5. Genie needs a space created in the UI (add the five tables, a few example questions); set `DATABRICKS_GENIE_SPACE_ID`. Then `npx tsx scripts/smoke/databricks.ts` also asks one question.

## Commands for what is left
- Genie over our tables: after the space exists, `npx tsx scripts/smoke/databricks.ts`.
- Dry run of everything without credentials: `npx tsx scripts/smoke/databricks.ts --fake`.

## Research 06 corrections
- `createTracedQuery` does not initialise MLflow; `init` from `@mlflow/core` must run first (done in `tracing.ts`).
- `inline(from_json(...))` batching was not needed; inlined VALUES with escaping works and `UPDATE SET *` is accepted.
- Free Edition experiment tracing works (R4 resolved). Home folder `/Users/<email>` may not exist for experiments; the setup falls back to `/Shared`.
- Genie API works with a PAT (R6 partly resolved: 12 to 14 s per answer).
- The report must not wait for a full flush: at about 2 to 4 s per MERGE a five-table flush takes 10 s, longer than the 8 s budget; hence the tasks-only wait.
