# V-pipeline hand-back (stopped early on the coordinator's instruction)

Status: development stopped before `scripts/demo/run.ts` was written. The pipeline does not exist.

## What exists

| Item | State |
| --- | --- |
| `scripts/demo/seed/shop/` (Python shop: `shop/{money,catalog,cart,discounts,pricing,server}.py`, `README.md`, `.gitignore`, empty `tests/__init__.py`) | Written, untested. The checkout bug is planted in `shop/pricing.py` (`checkout_total`): tax is taken on the full subtotal and the discount subtracted afterwards, so customers pay tax on the discount. Nothing was run, not even locally. |
| `scripts/demo/seed/shop/tests/test_*.py` (the 40 to 50 test suite) | Not started. Plan was about 46 tests, about 8 failing only because of the bug, runner `python3 -m unittest`. |
| `scripts/demo/run.ts`, `scripts/demo/README.md`, seeding into the Space, the four tasks, progress and report, `shots/demo/last-run.json` | Not started. |
| Typecheck of the scripts area | Not run (no TypeScript written). |

`shots/demo/` was created empty. Nothing was committed or pushed. Nothing outside `scripts/demo/`, `shots/demo/` and this file was written. The folder `data-demo-dev/` (my office's data) is left on disk and is safe to delete.

## Findings (usable if the work resumes)

- Space image (a Maya desktop on my test office): node v24.21.0, Python 3.12.3, git 2.43.0, firefox and xfce4-terminal present, tar and base64 present; user `cua`, home `/home/cua`, `~/Desktop` and `~/work` already exist; no global git identity (must be set).
- Own office env that worked: `OFFICE_PORT=4337 DATA_DIR=data-demo-dev EMPLOYEE_MODEL=claude-haiku-5-5 DATABRICKS_SYNC=off LIVEKIT_URL= LIVEKIT_API_KEY= LIVEKIT_API_SECRET= MOCK_LLM=0 DESKTOPS=cua MAX_TEAM=4 node --import tsx src/office/main.ts`. `/api/health` then read `llm:true, desktops:cua, calls:off, databricks:false`. Blank vars win over `.env.local` because dotenv does not override variables already set.
- `/api/candidates` picks the first unhired cast member whose `roleKey` equals the preset key. Each of web_developer, marketer, researcher, designer has exactly one cast member (Maya, Priya, Jonas, Ines), so hiring by roleKey gives the right person.
- Seeding in a Space works through `createCuaSpaces({ dataDir, env: readEnv({...process.env, DESKTOPS:'cua'}) })` then `spaces.exec(employeeId, cmd)` and `spaces.writeFile(employeeId, path, content)`; the id is the employee id, not the space id.
- Teammate messages show up as thread `steps` with `peer.direction` `to`/`from` (as in `scripts/e2e/real.ts`).
- Scripts must be `.mts` or inside the repo (which has the right module type) when using top-level await.

## Testing done and spend

- One hire only: Maya on my office (port 4337), model claude-haiku-5-5, hello message only. She reached idle after about 20 s. No task was given to anyone.
- Spend: $0.0052 (team report for today).
- Cleanup: Maya removed through the API (204, employee list empty); her Space is gone from the Cua list. The three Spaces still listed belong to the app on port 4317 and were not touched. My office on 4337 is stopped, nothing listens on it. Ports 4317 and 4318 and `data/` were never touched.
