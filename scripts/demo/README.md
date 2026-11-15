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

One command starts a longer project the four do together, autonomously, handing work to each other as messages. Built for a live audience; runs several minutes.

    npx tsx scripts/demo/live.ts            # fresh office (stops if people exist)
    npx tsx scripts/demo/live.ts --reset    # remove everyone first, then hire fresh

Same office settings as `run.ts` (`DEMO_OFFICE_URL`, `DEMO_MIN_FREE_GB`; real mode, `cua` desktops). Shared helpers live in `lib.ts`.

| Flag | Meaning |
| --- | --- |
| `--reset` | Remove everyone through the API, wait until they are gone, hire fresh |
| `--reuse` | Keep the four (matched by first name), hire the missing. Each kept desktop is tidied first: windows closed, `~/work` moved to `~/work-old-<n>`; Maya's shop is re-seeded. Kept people must be idle (a leftover approval must be answered first). They still remember the last brief, so for a clean run prefer `--reset` |
| `--stagger-s N` | Seconds between sending the tasks, in the order Jonas, Ines, Priya, Maya (default 0) |
| `--timeout-min N` | Give up after N minutes (default 20) |
| `--auto-approve-others` | Approve approvals that are not Maya's push (otherwise they are printed loudly and left alone) |

Hidden test flags: `--people maya,ines` (run the project with a subset; task texts adapt), `--print-tasks` (print the task texts and exit). Never point it at an office that is not yours: it hires and removes people.

### What the audience sees, in order

1. Maya, Priya, Jonas and Ines come up one by one (desk order); Maya's desktop gets the shop with the failing tests.
2. Four messages from Sam go out. Narration lines: state changes, plan progress (done of total), every new activity step, and every teammate message as `[12:03:41] Priya -> Jonas: text`.
3. Jonas researches Shopify, Squarespace and BigCommerce and sends three facts to Priya; Priya writes the page copy and sends it to Maya; Ines designs the page and sends Maya a build spec; Maya fixes the checkout bug (terminal with passing tests), builds `~/work/shop/site/index.html` and sends the HTML to Ines; Ines replies with two fixes; Maya applies them and commits.
4. Jonas's comparison chart, Priya's copy and launch post, Ines's style guide and mockup (beside Maya's built page) and Maya's page and terminal stay open on screen.
5. Maya raises the `git push` approval. The script never answers it. A question or any other approval is printed with `!!!` and left alone (unless `--auto-approve-others`).

Finished means: Jonas, Priya and Ines reported done; Maya has the push approval pending with the fix committed, the page committed, tests passing and a terminal open (checked inside her Space); and these messages happened: Jonas to Priya, Priya to Maya, Ines to Maya, Maya to Ines, Ines to Maya again after that. Exit code 0 on finish, 2 on timeout, 1 on error.

### Output

A table (person, state, minutes, cost, artifact), the message log, the pending approval id, total cost and minutes; `shots/demo/live-last-run.json`; one frame per desktop at `shots/demo/live/<name>.jpg`.

### What the presenter does at the end

Open Maya's conversation in the app and approve the push (`Push fix/checkout-discount`). The branch lands in her local remote `~/work/remotes/shop.git`.
