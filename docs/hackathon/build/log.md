# Build log (orchestrator's running record; append only)

Read this first after any context loss. The plan is `../plan.md`; briefs are `../spec/workstreams.md`.

## Standing facts

- Started: 2026-11-14 22:40, on the user's "Start the build".
- User decisions: Synthesia cast, all Linux desktops, Sonnet 5.5 default, lend-screen as a stretch (D-029).
- **Git: authorised (D-032).** Commit on branch `build/night-1` at every gate and push it to `origin` as progress is made. Only the orchestrator commits. Never commit `.env.local`, `data*/`, `vendor/cua`, `vendor/_research`. End commit messages with the Co-Authored-By line.
- **Spending cap: $50 on the Anthropic key for the night (D-032).** Tests use `claude-haiku-5-5`; quality runs and the demo scenario use Sonnet 5.5. Stop real-mode testing if the scripts' reported spend passes $40.
- **Deadline: submission 12:00 on 15 Nov; fully functional by 08:00; the demo is a video.** A feature has to work reliably enough to record once; phase 5 produces a shot list for the video.
- Keys at start: none (`.env.local` has every key empty; `config/cast-ids.txt` has no ids). The user said they will add keys while the build runs. Re-check with the names-only command below before any step that needs one. Never print key values.
  `awk -F= '/^[A-Z_]+=/{ if (length($2)>0) print $1": set"; else print $1": empty" }' .env.local`
- Cua: runtime and Linux image cached in `~/.cua`; embedded runtime, no daemon; VM capped at 12 GB / 6 CPUs. At most 3 real desktops at once across the whole machine.
- Mac kept awake by a `caffeinate` background process (12 h) and the app's keep-awake hold. A check-in fires at minutes 17 and 47 of each hour.
- Preflight B0 (tools): pass. B1 (Cua): pass. B2 to B7 need keys or the user and have not run.

## Phase status

| Phase | State | Notes |
| --- | --- | --- |
| 1a. W0a skeleton | running | started 22:40 |
| 1b. W0b office mock, W0c renderer skeleton | waiting on W0a | |
| Gate 1 | | |
| 2. W1 to W9 | | |
| 3. Integration | | |
| 4. End-to-end, fix loop, design review | | |
| 5. Wrap | | |

## Journal

- 22:40 Build started. Launched W0a.
- 22:46 User replied: commit and push as progress is made; $50 cap; functional by 08:00, submission 12:00, video demo. Recorded as D-032.
