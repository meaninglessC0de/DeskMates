# Demo pipeline

Hires Maya, Priya, Jonas and Ines on a running office, seeds Maya's desktop, gives each a real task as Sam, and waits.

    npx tsx scripts/demo/run.ts

Office: `DEMO_OFFICE_URL` (default `http://127.0.0.1:4317`). It must be in real mode (model key, `cua` desktops). Memory check before each hire: `DEMO_MIN_FREE_GB` (default 4, `0` turns it off).

| Flag | Meaning |
| --- | --- |
| `--only maya,ines` | Work with a subset (desk order is kept) |
| `--skip-hire` | Use the employees already on the team (matched by first name) |
| `--skip-seed` | Do not seed Maya's desktop |
| `--reuse` | The team may already exist: keep the matching people, hire only the missing ones |
| `--timeout-min N` | Give up waiting after N minutes (default 20) |

Without `--reuse` or `--skip-hire` it stops if the office already has employees. It sets the manager's name to Sam, hires in order and waits for each hello, then sends the four tasks. A progress line is printed every 15 s. Exit code 0 when everyone finished, 2 on timeout, 1 on an error.

## What it leaves on each desktop

- Maya: `~/work/shop` (50 tests, 8 failing before the fix) with a local remote `~/work/remotes/shop.git`; a terminal window showing the passing run; branch `fix/checkout-discount` committed; the `git push` approval pending. The script never answers approvals.
- Priya: the launch post open on screen, after one teammate message to Jonas and his reply.
- Jonas: a one-page competitor pricing chart (a single HTML file) open in Firefox.
- Ines: one HTML page with two phone mockups, "Version A" and "Version B", open in Firefox.

Finished means: Maya has a pending push approval and the desktop is ready (branch committed, tests pass, a terminal is open); Priya has reported done and exchanged a teammate message each way with Jonas; Jonas and Ines have reported done.

## Output

A table at the end (person, state, minutes, cost, artifact, pending approval id), `shots/demo/last-run.json`, and one full-size frame of each desktop at `shots/demo/<name>.jpg`.

`scripts/demo/seed/shop/` holds the shop that is copied into Maya's desktop. To remove people afterwards use the app, or `DELETE /api/employees/:id` on the office.

## Live demo: "launch day" (`live.ts`)

The four work on one project together, autonomously, and talk to each other; the audience watches the narration and the desktops. Shared helpers live in `lib.ts`. Same office settings as `run.ts` (`DEMO_OFFICE_URL`, `DEMO_MIN_FREE_GB`; real mode, `cua` desktops).

Three ways to run it:

    npx tsx scripts/demo/live.ts --prepare --reset   # before the audience: hire the four, seed Maya's shop, then stop
    npx tsx scripts/demo/live.ts --go                # on stage: send the briefs and narrate (the default project)
    npx tsx scripts/demo/live.ts                     # everything in one go (add --reset if people already exist)
    npx tsx scripts/demo/live.ts --go --quick        # the scripted two-minute version (or --quick on its own)

- **Default project (the team brief).** One message per person: a shared opening ("the four of you own it together ... take the initiative"), what each one owns, a closing. No step-by-step instructions. Maya builds and ships, Priya owns the words, Jonas the facts, Ines the look; Maya may not ship until Ines, Priya and Jonas have signed off the page she built. In the middle Sam sends one change request to all four (15% off, code LAUNCH15, valid seven days, must be consistent everywhere). Duration: to be measured.
- **`--quick`.** The earlier scripted tasks (about 2 minutes of work): Jonas sends facts to Priya, Priya to Maya, Ines to Maya, Maya and Ines review once. No change request.

| Flag | Meaning |
| --- | --- |
| `--prepare` | Reset if `--reset` is given, hire the four, seed Maya's shop, set the manager's name, stop. No task is sent |
| `--go` | Needs the four to exist with no work yet (and Maya's shop seeded); sends the briefs and narrates |
| `--quick` | The scripted two-minute version instead of the team brief |
| `--no-change` | Default project only: skip the change request |
| `--change-at N` | Default project only: send the change request N seconds after the kickoff instead of the usual trigger |
| `--reset` | Remove everyone through the API, wait until they are gone, hire fresh |
| `--reuse` | Keep the four (matched by first name), hire the missing. Kept desktops are tidied (windows closed, `~/work` moved to `~/work-old-<n>`), Maya's shop is re-seeded. They still remember the last brief, so for a clean run prefer `--reset` |
| `--stagger-s N` | Seconds between sending the briefs, in the order Jonas, Ines, Priya, Maya (default 0) |
| `--timeout-min N` | Give up after N minutes (default 25, `--quick` 20) |
| `--auto-approve-others` | Approve approvals that are not Maya's push (otherwise they are printed loudly and left alone) |

Hidden test flags: `--people maya,ines` (a subset; the briefs adapt), `--print-tasks` (prints the team brief, the change request and the quick tasks, then exits). Never point the script at an office that is not yours: it hires and removes people.

### What the audience sees

1. (`--prepare`, earlier) Maya, Priya, Jonas and Ines come up in desk order; Maya's desktop gets the shop with failing tests.
2. The briefs go out. The narration shows state changes, plan progress, every new activity step, messages to Sam, and every teammate message as `[12:03:41 +1:24] Priya -> Jonas: text` (clock time and time since the kickoff).
3. The change request appears as `Sam -> team: ...` when the first round wraps up (every teammate has answered Maya after her first build went out), or 240 s after the kickoff, never before 120 s (`--change-at N` replaces that).
4. Questions and non-push approvals are printed with `!!!` and left alone (unless `--auto-approve-others`). The script never answers Maya's push.

Finished (default): Maya is waiting on a push approval raised after the change request, and inside her Space the branch has commits, the page is there and contains `LAUNCH15`, the tree is clean, the tests pass and a terminal is open. The others need not have reported done; after Maya's approval the script keeps narrating up to 60 s so they can wrap up. Finished (`--quick`): Jonas, Priya and Ines reported done, Maya as above (without LAUNCH15) and the five scripted messages happened. Exit 0 finished, 2 timeout, 1 error.

### Report

Table (person, state, minutes, cost, artifact), the message log with times, the pending approval id, total cost and minutes; default project adds minutes from kickoff to Maya's approval, number of teammate messages, messages each person sent Sam, who was still busy, and whether LAUNCH15 reached the page and the shop code (and which files mention it on each desktop). `shots/demo/live-last-run.json`; one frame per desktop at `shots/demo/live/<name>.jpg`.

### What the presenter does at the end

Open Maya's conversation in the app and approve the push (`Publish with git push`). The branch lands in her local remote `~/work/remotes/shop.git`.
