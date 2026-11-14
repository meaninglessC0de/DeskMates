# W1 hand-back: real desktops (Cua Spaces)

Status: done. All four "done when" items pass. No edits to core office files, `types.ts` or the contract.

## Files
`src/office/spaces/`: `cuaSpaces.ts` (the `Spaces` implementation), `cuaBackend.ts` (the narrow SDK slice as an interface, plus `createSdkBackend()` which wraps `@trycua/cua` `embedded()`), `cuaPure.ts` (name mapping, header flattening, stale-error detection, ensure plan, path helpers), `stream.ts` (`openCuaStream`), `hostDriver.ts`, `cuaSpaces.test.ts` (14 tests, fake SDK). Plus `scripts/smoke/spaces.ts`. `createCuaSpaces` stays synchronous; the native addon is imported on first use only, so unit tests never load it.

## 1. Typecheck and unit tests
```
npm run typecheck:area -- src/office/spaces  -> no type errors under src/office/spaces (tsconfig.office.json)
npx vitest run src/office/spaces              -> Test Files 1 passed, Tests 14 passed
```
Covered: name mapping (`emp-<lowercase ulid>`), header flattening, stale-error detection and tag-only errors, ensure plan, guest paths, create once and idempotent, two concurrent `ensure` share one create and both hear progress, wake without create, stale entry (listed running, calls fail "instance ... not found") replaced by delete then create, sleeping Space that cannot be woken healthy replaced, sleep/wake/reset/remove, plain-sentence errors, `setInternet` rejecting when not applied now, stream ticket and `frames` fallback.

## 2. Smoke against a real Space (`npx tsx scripts/smoke/spaces.ts`, 13 s total, exit 0)
```
[+0.0s] PASS host driver status - {"installed":false,"permitted":false,"detail":"cua-driver is not installed on this Mac."}
[+5.7s] PASS ensure x2 concurrently - local:test-w1-smoke progress: Checking desktop > Creating desktop > Setting up the desktop runtime > Creating desktop > Starting desktop > Waiting for it to start > Connecting to desktop > Desktop is ready > Checking the desktop answers > Desktop is ready
[+6.2s] PASS one Space for two concurrent ensures - 1 listed
[+6.3s] PASS exec uname -a - Linux a97003a1c9e9 4.19.0-gvisor #1 SMP ... aarch64 GNU/Linux
[+6.3s] PASS exec exit code and stderr - exit 3
[+6.9s] PASS exec timeout reported - timedOut true
[+6.9s] PASS write then read a file (home-relative) - "hello from W1\n"
[+6.9s] PASS reading a missing file rejects - Could not read ~/nope.txt. Check the file exists.
[+6.9s] PASS screenshot is a JPEG - 30252 B in 20 ms -> shots/smoke/space.jpg
[+7.5s] PASS raw SDK PNG saved - 1280x800 -> shots/smoke/space.png
[+7.5s] PASS thumbnail is a JPEG - 6802 B
[+7.5s] PASS mcpEndpoint shape - http://127.0.0.1:60538/mcp headers x-cua-env-authorization
[+7.7s] PASS MCP tools/list through the returned endpoint - 71 tools
[+7.7s] PASS openStream returns a cua-media ticket - ws://127.0.0.1:60538/media?ticket=... expiresMs 599673
[+10.7s] PASS binary frames over the WebSocket in 3 s - 4 binary (13536 B), 2 text
[+10.9s] PASS internet off: curl fails - exit 6 curl: (6) Could not resolve host: example.com
[+11.4s] PASS internet on: curl succeeds - HTTP 200
[+11.4s] PASS sleep - 29 ms
[+11.4s] PASS exec on a sleeping desktop rejects - This desktop is off.
[+11.6s] PASS wake keeps the file - 110 ms
[+11.8s] PASS ensure wakes a sleeping Space and keeps files
[+12.7s] PASS delete leaves no test-w1- Space - 0 left
ALL PASSED
```
`space.png` (raw SDK PNG) opened: 1280 x 800 dark navy XFCE desktop, top panel ("Applications" menu, workspace switcher, volume, clock 2026-11-14 23:24), two icons ("File System", "Home"), dock at the bottom centre. Note `space.jpg`, taken a second after create, shows the icons only: the panel and dock draw a few seconds after the Space reports ready (the later `w1-frame.jpg` shows both).

## 3. Office with `DESKTOPS=cua MOCK_LLM=1 OFFICE_PORT=4321 DATA_DIR=data-w1 npm run office:once`
- Starts: `[office] listening on http://127.0.0.1:4321 (... desktops cua, mock llm true)`; `/api/health` -> `"desktops":"cua"`.
- `POST /api/candidates {"roleKey":"web_developer"}` then `POST /api/employees {token}`: returns immediately with `state: starting`, `spaceId: null`; about 5 s later `idle`, `spaceId: local:emp-01m7e610y5dvgr7kbg5b01dx21`.
- `GET .../frame.jpg` -> `200 image/jpeg 37906 B in 0.034 s`, `JPEG ... baseline, 1280x800` (`shots/smoke/w1-frame.jpg`, opened: the XFCE desktop with panel, icons and dock). `thumbnail.jpg` -> `200 image/jpeg 6831 B`, `480x300`.
- `POST .../stream` (view and control) -> `{"kind":"cua-media","wsUrl":"ws://127.0.0.1:60813/media?ticket=...","ticket":"...","mediaSessionId":"media-1-...","expiresMs":599621}`.
- Desktop actions through the API: `stop` -> SDK list says `suspended`, frame answers 404 `desktop_off`; `start` -> frame 200 again; `restart` -> `running`, state `idle`.
- Two-Space check at the end: second Space `test-w1-two` created in 7.1 s next to the employee's, both listed `running`, second deleted. 
- `DELETE /api/employees/:id` -> 204; SDK `list()` -> `[]`; `GET` of it -> 404.

## 4. Cleanup
No Space left (`list()` = `[]`). My office was stopped by its own PID (`lsof -ti:4321` empty). Other agents' office processes are running and were not touched. `data-w1/` (gitignored) holds the office db. No Cua daemon was started; the runtime VM is left as the SDK keeps it (idle VM keeps its RAM until it is stopped; not touched).

## Decisions and deviations
- **`frameJpeg` / PNG:** none needed. `ScreenshotOptions` accepts `format: ImageFormat.Jpeg` and `quality`, so `screenshot()` returns a real JPEG from the SDK (20 ms). `thumbnail()` is the same call with `maxDimension: 480` (so it is 480 wide as the interface says; the SDK's 320 px thumbnail is only the fallback). The route needs no change and there is no `frameJpeg` export (office calls `spaces.screenshot`). The smoke script also saves the raw PNG as `shots/smoke/space.png`.
- **Name prefix:** `createCuaSpaces({ dataDir, env, namePrefix?, backend? })`. Default `emp-`; the smoke test uses `test-w1-`. `index.ts` passes neither, so the product is unchanged.
- **Stale and sleeping handling:** `ensure` checks the registry entry, then proves it answers (`bash('true')`, 5 s). Not answering, or a wake that fails, times out (30 s) or is unhealthy, means delete (30 s cap) then create. A failed create deletes any half-made Space. Creates, wakes, resets and removes are serialised per employee; concurrent `ensure` share one run. The stale case was tested with a fake SDK only (I did not crash the runtime VM).
- **`setInternet`** calls `setNetwork` and rejects unless the SDK reports `applied: 'now'` (it did, both ways, live). `ensure` also re-applies the switch to an existing Space (best effort).
- **`expiresMs`** in the ticket is milliseconds from now until it expires (about 600 000: ticket TTL is 10 minutes). The contract does not say whether it is relative or absolute; the renderer should treat it as relative.
- **`mcpEndpoint`** returns the SDK's headers as is (`x-cua-env-authorization`). I do not add `X-Cua-Agent-Session` (the spike module did); W2 may add it. The port changes every time the Space starts, so call it fresh.
- **Errors:** native errors usually have only a `.tag`; `console.warn` logs `[spaces] <name>: <tag/message>` and callers get one plain sentence ("This desktop is off.", "This desktop does not exist.", "This desktop stopped responding. Restart it.").
- **`hostDriver.ts`:** `status()` looks for `cua-driver` on PATH and in `/Applications/CuaDriver.app`, `/usr/local/bin`, `/opt/homebrew/bin`, `~/.local/bin`, with no spawn when absent (here: `installed:false` instantly). If present it runs `cua-driver permissions status --json` (4 s cap) and looks for accessibility and screen-recording flags. **Unverified**: the binary is absent, so the JSON shape and the app path are guesses from research 03. `mcpConfig()` returns `{ command, args: ['mcp'], env: { CUA_TELEMETRY: '0', DO_NOT_TRACK: '1' } }`.
- Frame rate: no throttling beyond office's 250 ms cache; each call is one list, one handle and one screenshot (about 35 ms total).

## For the next agent
- `types.ts` needs no change.
- `data.buffer.slice` is used for `write` (the SDK wants an `ArrayBuffer`); Node 26's global `WebSocket` is used by the smoke script (no `ws` import).
- Typecheck of the `scripts` project reports 24 errors in `scripts/smoke/shell.ts` (`window` not defined); not mine, my files are clean.
