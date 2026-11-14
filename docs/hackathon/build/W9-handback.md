# W9 hand-back: the Mac shell

Status: done. `npx tsx scripts/smoke/shell.ts` passes every check (exit 0). One gap on the renderer side, listed first.

## Read this first: what the renderer still has to call
The renderer currently calls only `window.shell?.notify(...)` (in `api/store.ts`). It does **not** call:
- `window.shell.setTray(rows, lent)`: needed so the menu bar menu shows the team. Call it whenever employees change: `rows = employees.map(e => ({ id: e.id, name: e.persona.name, state: e.state }))` (raw state ids such as `needs_you` are fine, main prints "Needs you"), and `lent` = the id of the employee whose `screenGrant` is set, else `null` (a name also works; main looks the id up in `rows` and otherwise prints the string as given).
- `window.shell.setBadge(count)`: count of employees in `needs_you` or `stuck`.
- `window.shell.onNotificationClick(id => selectEmployee(id))` and `window.shell.onTrayAction(a => ...)` (open -> `selectEmployee(a.employeeId)`, summon -> `summonOpen`, hire -> `hireOpen`, take_back -> `revokeScreen`, pause_all / resume_all -> pause or resume every employee). Registered callbacks accumulate (no de-duplication), register once at startup.
Until those exist the tray is the empty menu, there is no badge, and a notification click only shows the window. The smoke test proves each path by calling the bridge from the page.

## What was built (all under my paths)
- `src/main/index.ts` window, single instance, hide-on-close, IPC, test hook, quit sequence. `constants.ts` (`APP_NAME = 'Agent Manager'`), `office.ts` (child process), `tray.ts`, `notify.ts`. `src/preload/index.ts` exposes `window.shell` exactly as `ShellBridge`. `resources/trayTemplate.png` (18x18) and `trayTemplate@2x.png` (36x36): two outline circles, black on transparent, rendered from SVG with Playwright. No app icon.
- Window 1280x800, min 960x640, `hiddenInset`, `backgroundThrottling: false`, `contextIsolation: true`, `sandbox: false` (ES-module preload). Loads `ELECTRON_RENDERER_URL` (dev) or `<office>/`.
- Office: system node resolved through a login shell (`command -v node`, then /opt/homebrew/bin/node, /usr/local/bin/node), runs `node node_modules/tsx/dist/cli.mjs src/office/main.ts` in the repo root, own process group, output to `DATA_DIR/office.log`, polls `/api/health` every 300 ms for 30 s. Failure: native dialog with "Show log" / "Quit" (not seen by a person; with `AGENT_MANAGER_TEST=1` it exits 1 instead). Quit: SIGTERM to the group, SIGKILL after 3 s, waits until gone; a sync SIGKILL on process `exit` as a last resort. `AGENT_MANAGER_OFFICE_URL` skips starting office.
- Drag region (`insertCSS` after each load): sidebar header and `.astryx-layout-header` are `drag`; `button, a, input, textarea, select, [role=button|menuitem|tab|switch|checkbox|separator]` and anything in `dialog` headers are `no-drag`. The sidebar header also gets `padding-top: 28px` so its heading sits under the traffic lights (the UX spec calls this inset a shell concern). Selectors are the built DOM's `nav.astryx-side-nav > :first-child` and `.astryx-layout-header`; if Astryx renames those classes the drag region silently stops working (the smoke test would fail).
- Tray menu, notifications, badge, `askMicrophone`, test hook `globalThis.__shellTest` (`notifications()`, `trayLabels()`, `badge()`, `clickNotification(id)`, `trayAction(a)`, `clickTrayItem(label)`, `windowVisible()`, `closeWindow()`, `officePid()`, `officeUrl()`).
- Kept W0c's `AGENT_MANAGER_SHOT` hook (file:// fixture, no office) so `scripts/smoke/electron-window.ts` still works.
- Dropped: `AGENT_MANAGER_LOAD=office` (office is now always the default).

## Evidence
`npm run typecheck:area -- src/main` -> `no type errors under src/main (tsconfig.node.json)`; `-- src/preload` -> `no type errors under src/preload (tsconfig.node.json)`; `-- scripts` clean too.

`npx tsx scripts/smoke/shell.ts` (build lines and the seed output trimmed):
```
== Run 1: shell against a seeded mock office (AGENT_MANAGER_OFFICE_URL) ==
PASS seeded office has four people - Maya:needs_you Priya:working Jonas:idle Ines:idle
PASS window appears and loads office / - http://127.0.0.1:4329/ 1280x800 min 960x640 "Agent Manager"
PASS size 1280x800, minimum 960x640
PASS renderer shows the four people - 14 name matches
PASS drag region: sidebar header is drag, its buttons are no-drag - {"sidebarHeader":"drag","topBar":"drag","sidebarButton":"no-drag","topBarButton":"no-drag","headerHeight":68,"hasTopBar":true}
PASS drag region: top bar is drag, its buttons are no-drag
PASS traffic-light inset: sidebar header content starts below the window buttons - header text "Agent ManagerHire (⌘N)" starts at y=32
screenshot /Users/suhaan/Desktop/imperial-ai-hack/AgentManager/shots/smoke/shell-window.png
renderer called setTray by itself: no (calling window.shell.setTray from the page to prove the bridge and the menu)
tray labels: ["Maya Okafor    Needs you","Priya Raman    Working","Jonas Weber    Idle","Ines Moreau    Idle","---","Summon meeting…","Hire…","---","Pause everyone","Open Agent Manager","Quit"]
PASS tray lists the four people with their states - Maya Okafor    Needs you | Priya Raman    Working | Jonas Weber    Idle | Ines Moreau    Idle
PASS tray has the actions
PASS tray while screen lent - ["Maya Okafor is using your screen","Take it back","---"]
PASS tray shows "Resume everyone" when all are paused
PASS tray menu clicks arrive through onTrayAction - [{"type":"open","employeeId":"emp_01M7E66G8JFBYPT4TH8K0HNS7B"},{"type":"hire"},{"type":"pause_all"}]
renderer produced a notification by itself: yes
PASS a notification is recorded, not shown - {"employeeId":"emp_01M7E66G8PEJF8XBHNP2VNY391","title":"Jonas","body":"On it. I'll start with the layout and check back with you.","portraitUrl":"","iconLoaded":false}
PASS notification click calls onNotificationClick with that employee and shows the window - ["emp_01M7E66G8PEJF8XBHNP2VNY391"]
INFO renderer selects the thread on notification click: not observed (renderer does not register onNotificationClick yet)
PASS badge text is "2" then empty - "2" then ""
PASS askMicrophone resolves a boolean without a prompt in test mode - true
PASS bridge exposes platform darwin
PASS closing the window hides it and the app keeps running
PASS "Open Agent Manager" shows the window again
PASS second launch exits and focuses the first window - second exit code 0
PASS no page errors
PASS run 1: external office is untouched by the shell quitting
== Run 2: main starts office itself ==
PASS port 4329 is free before run 2
PASS main started office and /api/health answers - child pid 30080, window http://127.0.0.1:4329/
PASS office log written to data-w9/office.log
PASS child is a system node, not Electron - /opt/homebrew/bin/node node_modules/tsx/dist/cli.mjs src/office/main.ts
PASS after quit, lsof -ti:4329 is empty
PASS after quit, the office child pid is gone - 30080
all checks passed
```
After the run: `lsof -ti:4329` is empty (exit 1, no output). The smoke script's own port check uses `lsof -ti:4329 -sTCP:LISTEN`, because the script's own keep-alive HTTP client to the office would otherwise show up as a user of the port in run 1.

## What the pictures show
- `shots/smoke/shell-window.png` (page capture, 2560x1600): the real app against the seeded office: sidebar "Agent Manager" with Maya, Priya (badge 3), Jonas, Ines; Maya's thread with the top bar and the near-black "Summon meeting" button. Page captures never contain the traffic lights.
- `shots/smoke/shell-traffic-lights.png`: a real macOS screen capture of the top-left corner of the running window. The red, yellow and green buttons sit on their own row above the "Agent Manager" heading and the "+" button; nothing overlaps them.

## Deviations and things to know
1. The tray template icon has no variants (attention dot, call, lent ring, paused): the brief asked for one base glyph.
2. The tray menu has no portraits and no "Show all…" (brief did not ask). Accelerators on Summon, Hire and Quit are display only.
3. "Open Agent Manager" only shows the window (the contract has no action for it). "Pause everyone" turns into "Resume everyone" when every row's state is `paused`.
4. Tray rows are shown as `Name`, four spaces, `Capitalised state`.
5. In `AGENT_MANAGER_TEST=1` mode `askMicrophone` returns whether access is already granted (no prompt); this Mac returned `true`.
6. The smoke script builds when `out/` is older than `src/main`, `src/preload` or `src/renderer`. `npx electron-vite build` rewrites `out/renderer`, which office serves; other agents' builds do the same.
7. The notification test used the renderer's own path: a message to Jonas produced a recorded notification from the renderer's store (`portraitUrl` was `''`, no portrait files exist yet, so `iconLoaded: false`; the portrait fetch is only exercised for the empty case). The click assertion is that `onNotificationClick` fired with that employee and the window was shown; the thread is not selected because the renderer does not register the callback yet.
8. Single instance was tested by launching a second Electron on the same user-data dir: it exited 0 and the first window stayed visible.

## Not seen by a person
Real notification display (Notification Centre banner, portrait icon, replacement of an earlier one), the Dock badge's look, the microphone permission prompt, the "office did not start" dialog, and the menu bar icon and native menu drawn on screen were not seen. Everything about them above is read through the test hook or the Electron API. A packaged build needs `NSMicrophoneUsageDescription` for the prompt; the dev Electron uses its own plist.
