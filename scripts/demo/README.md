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
