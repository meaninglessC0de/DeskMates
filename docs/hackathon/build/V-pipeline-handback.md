# V-pipeline hand-back (second pass; paused on the coordinator's instruction, 15 Nov ~11:15)

## State at a glance

| Piece | State |
| --- | --- |
| Seed shop `scripts/demo/seed/shop/` (50 tests) | Works. Verified on this Mac: unfixed seed gives 8 failures, a temporary copy with a correct fix gives all 50 passing. Also verified inside a real Space (50 tests, 8 failing, git clean on main, origin in sync). |
| `scripts/demo/run.ts` (all flags) | Written. Typecheck passes (`npm run typecheck:area -- scripts`). Preflight errors and flag errors checked. Real-desktop path exercised for Maya only. |
| `scripts/demo/README.md` | Written. |
| Maya path on a real desktop | Works (run twice, see below). |
| Ines alone | Not run. |
| Priya and Jonas together (teammate exchange) | Not run. The detection code (thread steps with `peer.direction`) is untested. |
| Four-person run | Not run, by design (the coordinator runs it). |

## The seed

Python shop (`shop/` package plus `tests/`, run with `python3 -m unittest`). The bug is in `shop/pricing.py` `checkout_total`: VAT is taken on the full subtotal and the discount is subtracted afterwards, so customers pay VAT on the discount. 8 of 50 tests fail only because of it (7 in test_pricing, 1 in test_server); the fix is to tax `subtotal - discount`. Seeding is a tar.gz written with `spaces.writeFile` plus one bash script: git identity set globally (Maya Chen), `main` branch, initial commit, bare remote `~/work/remotes/shop.git` as `origin`, `main` pushed. The script verifies all of this and stops with a clear error if it is not so.

## Space image

node v24.21.0, Python 3.12.3, git 2.43.0, firefox, xfce4-terminal, tar, base64. User `cua`, home `/home/cua`. No git identity by default.

## What I saw (own office on port 4337, claude-haiku-5-5, Databricks and calls off)

- Run 1 (first task wording): Haiku went to the push in 18 s. The pending approval was for a chained command (checkout, add, commit, push), so the commit had not happened yet, nothing was committed, and no terminal was on screen (the employee prompt tells people not to use a terminal through the screen and to use the shell tool). My first "finished" test was therefore wrong.
- Fixes: (a) Maya's task now asks for "a terminal window on your desktop ... showing the passing run", the commit "as its own step" and the push "last of all"; (b) Maya counts as finished only when the push approval is pending AND branch `fix/checkout-discount` has a commit, the tree is clean, the tests pass in the Space and a terminal process exists.
- Run 2 (new wording): hello at 16 s, seed verified in 1 s, task sent. About 28 s later (0.5 min of work): a pending approval "Push fix/checkout-discount" naming the commit "Charge VAT on the discounted subtotal". Frame fetched from `GET /api/employees/:id/frame.jpg` and looked at: a terminal window titled "shop tests" fills the desktop showing 50 tests `ok`, "OK", "TESTS FINISHED" and the prompt in `~/work/shop`. Saved at `shots/demo/maya.jpg`. Haiku is very fast; Sonnet will take longer, so timings below are Haiku's only.
- The pipeline never answered the approval. I removed Maya through the API afterwards.

Timings (Haiku): Maya 0.5 min from task to pending push. Others: not measured.

## Cost

Two Maya runs on Haiku plus the earlier hello-only test: well under $0.05 by the team report (it showed about $0.001 for the last run; the report lags). Budget of $1 untouched.

## Known gaps and risks for the full run

- If an employee raises an approval that is not Maya's push (a "big step"), the script does not answer it and that person will stall until timeout. The detail column says so for Maya ("pending approval that is not a push"); for the others it shows state `needs_you`. The progress line shows what they ask Sam.
- Priya's pass condition needs a `to` step and a `from` step with Jonas's id in her thread after the task was sent. If the model answers through chat instead of `message_colleague`, she will not count as finished; read the thread.
- Artifact paths for Priya, Jonas and Ines are found by listing html/md/txt/svg/png files newer than a marker created when the task was sent; they may be empty if the work lives only in the browser.
- Task wording for Priya, Jonas and Ines was not tested on a real desktop, and "keep it open in Firefox" has not been checked on a frame.
- `DEMO_MIN_FREE_GB` (default 4) aborts a hire when free plus inactive memory is under 4 GB; set 0 to skip.
- The test run left `shots/demo/last-run.json` and `shots/demo/maya.jpg` (from the Maya-only run); a full run overwrites them.

## Remaining real-desktop steps (not done)

1. Ines alone (`--only ines`), check the frame shows both versions side by side in Firefox.
2. Priya and Jonas together (`--only priya,jonas`), check a teammate message each way and the frames.
3. Optionally the full four-person run (`npx tsx scripts/demo/run.ts`) on Sonnet, with memory in mind (4 desktops about 8 GB).

## Cleanup

Maya removed (204), her Space is gone; my office on 4337 is stopped, nothing of mine is listening. Ports 4317 and 4318, `data/` and the other app's three Spaces were never touched. `data-demo-dev/` remains on disk and can be deleted.
