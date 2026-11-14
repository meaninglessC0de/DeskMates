# 08 · Cua live feasibility spike (executed on this Mac)

Author: verification sub-agent (Sonnet), 2026-11-14, 21:30 to 22:25 GMT. Writer of this file: only me.
Machine: Apple M2 Max, 12 cores, 32 GB, macOS 26.2 (Darwin 25.2.0), Node v26.12.0, no Docker, no sudo used.
Everything below was **executed**; `verified` here means "I ran it and saw the output". Scratch dir with all scripts: `/private/tmp/claude-502/-Users-suhaan-Desktop-imperial-ai-hack/e8cda6e2-1ab7-4114-b736-8a443be0d374/scratchpad/cua-spike` (key files: `cua-ref.mjs` + `cua-ref-smoke.mjs` = the copy-paste module and its passing smoke test; `mcp-tools.json` = full 71-tool schema dump; `cua-mcp-tools.json` = 179 tools of `cua mcp`).
Env used for every run: `CUA_TELEMETRY=0 DO_NOT_TRACK=1` (one early run forgot it and printed the telemetry notice "Nothing has been sent yet"; I then ran `cua telemetry off`).

## Verdict table

| Test | Result | One line |
|---|---|---|
| T1 Install | **PASS** | `npm i @trycua/cua` 4.5 s, 267 MB, no postinstall, no download, no prompt; Node 26.12 loads the native addon; `npx cua --version` = `cua 0.27.4`. |
| T2 First Space | **PASS** | Cold first create 707 s (all network: 478 MB runtime + 1.29 GB image at 1 to 7 MB/s); 4.5 s of that is create+boot. Warm second Space 6.0 s incl. Node start. No dialog. |
| T3 Lifecycle | **PASS** | list/bash/write/upload/download/screenshot/thumbnail/suspend/start/stop/delete all work from Node, 3 to 25 ms per call (see traps: `stop` wipes the filesystem). |
| T4 Daemon vs embedded | **PASS** | Embedded needs no daemon; daemon is optional and shares `~/.cua/spaces.json` both ways. Daemon is required for the MediaBridge ticket and, in practice, to shut the VM down when idle. |
| T5 MCP of a Space | **PASS** | `/mcp` of each Space answers MCP initialize, 71 tools. Full observe/act loop run: window state, screenshot, launch browser, open example.com, read title, click, type. Needs `delivery_mode:"foreground"` for keys and pixel clicks. |
| T6 Shell/file path | **PASS** | Cleanest: SDK `space.bash` / `write` / `download` (return objects). `cua mcp --sandbox NAME --permissions computer:all` is a ready 35-tool stdio MCP server with shell+files+screenshot. The `/mcp` driver server has NO shell (its `space_bash` runs in a child Space). |
| T7 Live view | **PASS** | (a) thumbnail JPEG 320x200, 22 ms; (b) ws ticket via daemon bridge AND via SDK `space.openStream` (no daemon), H.264 over WebSocket, data arrives; (c) HTML5 viewer URL returns HTML. |
| T8 Scale | **PARTIAL** | 1, 3, 5 browser desktops measured; RAM is the limit, not CPU. Safe number: **3 concurrently active, 4 absolute max**, with runtime VM capped at 12 GiB. |
| T9 Persistence/identity | **PASS (with 2 traps)** | Spaces + labels survive process and daemon restarts. Trap 1: `stop` loses the container filesystem. Trap 2: a runtime-VM crash leaves stale "running" entries that must be deleted and recreated. Resolution, CPU/RAM, network and labels are all settable at create. |
| T10 Permission mode in a Space | **PASS** | Yes: pass `CUA_DRIVER_PERMISSION_MODE` etc. in the Space `env` at create. `bounded` + capability manifest enforcement verified; `unrestricted` (+ bypass var) verified and it unlocks CDP browser tools. One start-order trap. |
| T11 Agent in a Space | **PASS** (inspect only) | `claude` is NOT in the image. node 24.21, npm 11, python 3.12, git, pnpm, firefox, chromium are. Cua installs the harness into `~/.cua/bin/` on first `agentStart`, needs internet + a key. |

## Corrections to the earlier reports

1. **(03) `/mcp` has 71 tools, not 66, and it DOES contain Space-management tools**: `create_space, fork_space, list_spaces, delete_space, stop_space, start_space, space_bash, share_tcp_port, list_tcp_shares, stop_tcp_share`. `space_bash` runs in a **child** Space, not in this one; the driver still has **no shell in its own Space**. `share_tcp_port` opens a **public relay address**. An agent given the bare server name in `allowedTools` can reach all of these: allow-list tool names explicitly and exclude those ten.
2. **(03) Auth header is `x-cua-env-authorization: Bearer <token>`**, not `Authorization`. `mcpConfig('env','/mcp')` returns `{url:'http://127.0.0.1:<port>/mcp', headers:[{name:'x-cua-env-authorization', value:'Bearer …'}]}`; `mcpHeaders(cfg)` flattens it. `Space` handles have no `mcpConfig`; it lives on the **Sandbox** handle: `embedded().sandboxes().connect('local:NAME')`.
3. **(03) On Linux, background keyboard/pointer is refused.** `hotkey`, `press_key`, pixel `click` return `isError` "Background delivery is not available… Retry with delivery_mode:\"foreground\"". Element-token clicks work in background (clicked the "Learn more" link, page title changed). `type_text` without a window id worked "via AT-SPI". Use `delivery_mode:"foreground"` (cheap: the Space has no other user) or `run_steps {foreground_fallback:true}`. `get_window_state` does **not** accept `screenshot_format` on Linux (accepted: `capture_mode, display_only, full_output, include_accessibility_tree, include_screenshot, max_depth, max_dimension, max_elements, max_image_dimension, pid, query, screenshot_out_file, since, timeout_ms, tree_format, verbose, window_id`). Images are always PNG.
4. **(03) `launch_app` with `urls` always goes through `xdg-open` = Firefox** (the default browser), even if you name chromium. Chromium launches with `launch_path:'/usr/bin/chromium'` and no `urls`. `launch_app` needs `launch_path`, `name` or `urls`; `bundle_id` alone is rejected ("Provide at least one of: launch_path, name, or urls").
5. **(03) Browser CDP tools (`browser_*`) are refused by default in a Space**: `browser_prepare` -> `browser_consent_required` ("requires --grant existing-profile or an embedding authorization host"), and `browser_navigate` then fails "requires an explicit session". They work only if the Space is created in `unrestricted` mode (T10). Default path for web work = AT-SPI tree + keyboard + element tokens.
6. **(01) Default runtime VM size**: the doc/`cua config` print `runtime.linux_memory_gib = 4` and `linux_cpus = 4` as defaults, but the VM that was actually created had **24 GiB and 4 CPUs** (`colima.yaml`: `memory: 24`, `cpu: 4`, `vmType: vz`, disk 60). Setting `cua config set runtime.linux_memory_gib 12` / `linux_cpus 6` took effect at the next VM start (verified in `colima.yaml`). The config is not honoured until the VM restarts.
7. **(01) `stop` does not keep the filesystem for container Spaces** although the message says "its disk is kept". Files in `/home/cua`, `/tmp`, `/opt` were gone after `stop` + `start` and `uptime` reset. Only `suspend` + `start` keeps files and running processes. Use suspend, not stop.
8. **(01) `labels` is a `Map` on input and `SpaceInfo.labels` is also a `Map`** (a `JSON.stringify` shows `{}`; use `Object.fromEntries(info.labels)`). `timeoutMs`, `memoryMb` and `bash`'s timeout are `bigint`: passing a plain number throws `TypeError: Cannot convert 1000 to a BigInt`.
9. **(01) Cold-start timing**: first create took **11.8 minutes on this link**, not "minutes"; the runtime download shows as phase `preparing` with a "Setting up the Linux runtime" detail (478 MB, 336 s), then `pulling` (1.29 GB, 367 s). A cold VM boot with the first Space after the runtime was cached: 35 s (first, 8 GiB VM) and 17 to 20 s (later). Warm create into a running VM: 3.4 to 6.6 s.
10. **(01/02) Checkpoint**: `Space.checkpoint(name)` exists in TS but takes about a minute, and the daemon log says "gVisor memory checkpoints are off on this engine (pointer authentication)", so it is filesystem-only here. Not needed.
11. **(01) The daemon keeps a warm pool and pulled an extra image** (`ghcr.io/trycua/linux@sha256:1eb4…`, `wanted=claude-code`) on its first start. Pool settings: `pool.auto on`, `pool.warm none`, `pool.memory_percent 15`. Consider `cua config set pool.auto off` to avoid hidden downloads/RAM (not tested).
12. **(02) `Space.openStream()` does not need the daemon.** In embedded mode it returns `ws://127.0.0.1:<spacesd port>/media?ticket=…` directly. The daemon `OpenMediaBridge` path (media-bridge.ts) also works and returns `ws://127.0.0.1:<daemon port>/v1/bridge/media?ticket=…`. Policy strings for the SDK are lowercase: `'view_only'`, `'background_only'`, `'allow_activation'` (the proto-style `SESSION_POLICY_VIEW_ONLY` gives an empty `InvalidArgument`).
13. **(03/01) `connectMcp` from `@trycua/cua`** needs the optional peer `@modelcontextprotocol/client`; I used `@modelcontextprotocol/sdk@1.32.2` (`Client` + `StreamableHTTPClientTransport`) instead, which works.
14. **Errors are nearly message-less** from the native layer (`InvalidArgument [Error]` with only `.tag`); the real reason often only shows in `cua` CLI output or the daemon log. Wrap calls and log `e.tag`.
15. `cua doctor` reports 3 `[fail]` lines for empty `runtime.*_path` keys; harmless (fresh install quirk).

## T1 details

```
$ npm i @trycua/cua          # added 5 packages in 4s, 0 vulnerabilities, real 4.46 s
$ npm ls                     # @trycua/cua@0.27.4
node_modules: 267 MB  (@trycua/cua 7.4 MB, @trycua/cua-darwin-arm64 258 MB: cua, cua_node_runtime.node, libcua_sdk.dylib)
$ ls node_modules/.bin/cua   # -> ../@trycua/cua/bin/cua.js (Node shim that execs the 173 MB binary)
$ npx cua --version          # cua 0.27.4   (~0.26 s)
```
Binary path: `node_modules/@trycua/cua-darwin-arm64/cua`. No postinstall script, no network at install beyond npm. `~/.cua` did not exist until the first create. `import('@trycua/cua')` exposes ~330 exports (`embedded, connect, Image, SpaceCreateOptions, NetworkSettings, mcpHeaders, connectMcp, …`) on Node 26.12 with no errors. `cua --help` top-level commands include `sandbox (sb)`, `spaces`, `daemon`, `mcp`, `viewer`, `agent`, `network`, `runtime`, `cache`, `doctor`, `config`, `build`, `image`. `cua sb --help` subcommands: `create, ls, info, suspend, resume, restart, checkpoint, fork, rm, exec, shell, cp, logs, port-forward, url, screenshot, mcp, view, pool`.

## T2 details (first-run numbers)

Script `t2-create.mjs` (SDK `createWithProgress`). Phases and times, first run:

| Phase | At | Detail |
|---|---|---|
| preparing | 0.8 s to 336 s | "Setting up the Linux runtime", 477,884,184 bytes (Colima 0.10.3 + Lima 2.2.0 + 425 MB runtime disk), 1 to 7 MB/s |
| pulling | 336 s to 703 s | `ghcr.io/trycua/linux@sha256:3c896c9f…`, 1,289,496,962 bytes |
| creating, booting, waiting_for_services, connecting, ready | 703.0, 704.2, 704.7, 705.8, 707.2 s | **4.5 s from `creating` to `ready`** |

Total **707 s**. Warm `spike-b` (runtime VM already up): **6.0 s** wall incl. 0.8 s Node start (create phase 3.3 s to ready 6.0 s). Warm creates later in the session: 3.4, 3.7, 4.8, 4.8, 6.6 s. Cold VM + first Space after VM had been stopped: 17.2 s (reference smoke test), 20.2 s, 35.3 s. No macOS dialog appeared at any point (cannot rule out a dialog I could not see, but every command returned without a hang).

Data on disk (after first Space): `~/.cua` 5.8 GB. Layout: `~/.cua/runtimes/linux/colima-0.10.3-lima-2.2.0` (92 MB, Lima+Colima), `~/.cua/runtimes/linux/vm/_lima/colima-cua/disk` (VM boot disk, 20 GB virtual, 1.2 to 3.2 GB real), `~/.cua/runtimes/linux/vm/_lima/_disks/colima-cua/datadisk` (60 GB virtual; 5.7 to 8.9 GB real; holds the image layers and Space overlays), `~/.cua/spaces.json`, `space-meta.json`, `spaces-credentials.json` (0600), `sandboxes/`, `config.toml`, `logs/daemon.log`. The VM runs on Apple **Virtualization.framework (vz)** as `com.apple.Virtualization.VirtualMachine.xpc` driven by `limactl hostagent`; no Docker, no QEMU. After the run `cua cache du` showed images "docker-images 4.4 GiB (the pulled linux image, uncompressed)", data 11.8 GiB while running, 7.3 GiB when idle.

`SpaceInfo` of a fresh Space (keys): `id name displayName provider spacesdVersion features os osName osPrettyName image imageDigest kind arch services addedAt host hostName power powerState cloud cloudPlace cloudDelete durable stopReason labels expiresAtUnix onExpire createdAtUnix egress egressEnforced network networkNote networkNoticePending parent root depth children treeAddress clipboard volume volumes sharing`. Values seen: `id:'local:spike-a'`, `spacesdVersion:'0.16.1'`, `os:'linux'`, `osPrettyName:'Ubuntu 24.04.5 LTS'`, `kind:'container'`, `arch:'arm64'`, `network.preset:'internet'`. `powerState` is empty on the object returned by `create` but `'running'|'suspended'|'stopped'` from `list()`.

## T3 details (real return shapes)

Each call below was timed on the warm path.

| Call | Time | Returns |
|---|---|---|
| `spaces.list()` | 5 ms | `SpaceInfo[]` |
| `spaces.space(id)` | 14 ms | `Space` handle. Methods: `agentEvents agentInterrupt agentList agentMessage agentStart agentStatus agentStop appIcon appIcons attachStream bash callTool capabilitiesJson checkpoint closeStream deleteService displays download fork forward home hotspotStatus id info joinPresence joinPresenceFor keptServices listTools openStream putService requestSiteLogin restartService route screenshot sendFile serviceLogs services setPresenceSettings share shares spacesd startHotspot startService stopHotspot stopService streamSession supports teleport teleportManifest thumbnail transport unshare upload usage websocketHeaders windowThumbnail windows write` |
| `space.bash(cmd, timeoutMs?:bigint)` | 5 to 13 ms | `{stdout, stderr, exitCode, signal?, timedOut, error?, rendered}`. Timeout does NOT throw: `{stdout:'',stderr:'',signal:'TERM',timedOut:true}` |
| `space.write(path, ArrayBuffer)` | 3 ms | `{path, bytes:16n, sha256}` |
| `space.upload(localPath, guestPath)` | 3 ms | `{source, dest, kind:'file', files:1n, directories:0n, bytes:17n, sha256, verified:true}` (files or folders) |
| `space.download(guestPath, localDir)` | 10 ms | `{source, dest:'down/note.txt', kind, files, directories, bytes, sha256, verified:true}` |
| `space.screenshot(undefined)` | 14 ms | `{image:ArrayBuffer(PNG), format:0, width:1280, height:800, scale, screenshotId}` (40 KB for the empty desktop) |
| `space.thumbnail(undefined)` | 22 ms | `{image:ArrayBuffer(JPEG), format:1, width:320, height:200, capturedAtMs:bigint}` (3.6 KB) |
| `space.displays()` | 1 ms | `[{id:'0',name:'screen',primary:true,widthPx:1280,heightPx:800,scaleFactor:1}]` |
| `space.windows()` | 24 ms | `[]` on an empty desktop |
| `space.listTools()` | 27 ms | the driver tool list (same registry as `/mcp`) |
| `space.usage()` | 6 ms | `{cpuCount:2, cpuPercent, loadAverage1m, memoryUsed:bigint, memoryTotal:bigint, memoryLimited:true, diskUsed, diskTotal, diskLimited}` |
| `space.route()` / `transport()` | 1 ms | `'local 127.0.0.1:50936'` / `{transport:'local',fallbackReason:''}` |
| `spaces.suspend(id)` | 289 ms | `{space, state:'suspended', power:'suspend', message:'Suspended … (its memory is kept, and still in use).'}` |
| `spaces.start(id)` after suspend | 63 ms | `{state:'running', message:'Started …'}` |
| `spaces.stop(id)` | 1.8 s | `{state:'stopped', message:'Stopped … (its disk is kept; its memory is free).'}` |
| `spaces.start(id)` after stop | 1.0 s | `{state:'running'}` |
| `spaces.delete_(id)` | 0.45 s | string `'Deleted local:spike-b (local sandbox spike-b).'` |

Guest facts: `uname -a` -> `Linux bb93288e56c1 4.19.0-gvisor #1 SMP Sun Jan 10 15:06:54 PST 2016 aarch64 aarch64 aarch64 GNU/Linux` (gVisor); `whoami` -> `cua` (uid 1000, groups sudo, audio, video, passwordless sudo); cwd `/home/cua`; `which`: `/usr/bin/chromium /usr/bin/firefox /usr/bin/python3 /usr/local/bin/node /usr/local/bin/npm /usr/bin/git /usr/bin/curl`, **`claude` absent**. `DISPLAY=:1` is already set in `bash` env (do not override with `:0`).

Screenshot, opened: 1280x800 PNG, dark navy XFCE desktop, top panel with "Applications" menu left, workspace switcher, volume, clock "2026-11-14 21:44" and user "cua" right, two desktop icons ("File System", "Home") top-left, a dock at the bottom centre (workspace, terminal, file manager, web browser, search, folder). Internet works (example.com loads).

Trap: **suspend keeps memory (still counts against the VM's RAM)**; **stop frees RAM but the container filesystem is lost**.

## T4 details (daemon vs embedded)

- No daemon is needed: every script above ran `embedded()` in a short-lived Node process; Spaces (and Colima VM) kept running between processes and appeared again via `list()`.
- `connect()` with no daemon throws `DaemonNotRunning: CuaError.DaemonNotRunning: The Cua daemon isn't running. Start Cua, or run \`cua daemon start\`.`
- Start from Node: `execFileSync(CUA_BIN, ['daemon','start'])` -> `cua daemon started (pid 48445) socket=/Users/suhaan/.cua/cua.sock loopback=http://127.0.0.1:53198` in ~1.0 s; it daemonises (survives the parent). Stop: `daemon stop` -> `stopped` (~0.2 s, up to ~2.4 s when it winds the VM down).
- Files: `~/.cua/cua.sock` (UDS 0600), `~/.cua/daemon.json` (0600, keys `pid, socket_path, loopback_url, token, version`; random loopback port each start), `~/.cua/daemon.lock`, `~/.cua/logs/daemon.log`. Both vanish on stop. Daemon process RSS ~56 to 80 MB.
- `connect()` (no args) reads those and works: `connect().spaces().list()` 16 ms; `create` through the daemon 5.5 s. A Space created via the daemon showed in `embedded().spaces().list()` and vice versa (shared `~/.cua/spaces.json`). `cua spaces ls` sees both.
- Stopping the daemon does **not** touch Spaces (`daemon.log`: `stop=KeptForSpaces(3)`).
- **When the daemon is the only thing that stops the VM**: with only embedded Node processes, after I deleted every Space the runtime VM (6.5 GiB RSS) kept running for 5+ minutes. Running `cua daemon start; cua daemon stop` made it stop (`the Linux runtime at daemon shutdown stop=Stopped`). So: the app should start the daemon and call `daemonStop()` on quit (or when it has no Spaces), otherwise an idle VM holds up to the configured RAM.
- Needed for: `OpenMediaBridge` ticket (T7b). Not needed for: create/exec/files/screenshot/thumbnail/`openStream`/`viewerUrl`/`mcpConfig`.
- Recommendation for the build: `embedded()` everywhere for simplicity, plus the app starts the daemon at launch and stops it at quit (cheap, and fixes the idle-VM issue).

## T5 details (MCP endpoint of a Space)

Client: `@modelcontextprotocol/sdk@1.32.2` (`Client` + `StreamableHTTPClientTransport`), see `mcplib.mjs`.

```
sb  = await embedded().sandboxes().connect('local:spike-a')
cfg = await sb.mcpConfig('env', '/mcp')   // {url:'http://127.0.0.1:50936/mcp', headers:[{name:'x-cua-env-authorization', value:'Bearer <token>'}]}
CLI twin: cua sb info NAME --connection --json  -> {"spacesd":{"token":"…","url":"http://127.0.0.1:50936/"}, "endpoints":{"env":"http://127.0.0.1:50936"}, …}
```
Port changes per Space and per (re)start; fetch a fresh config per connection.

- connect + initialize: **0.86 s** (first), serverInfo `{"name":"cua-driver","version":"0.49.1"}`, capabilities `{experimental:{'ai.cua.driver.envelopes':{version:1}}, resources, tools, extensions:{'io.modelcontextprotocol/skills':{}}}`, `instructions` 1,453 chars (a five-step observe-act recipe). `tools/list` **81 ms, 71 tools**:

`list_apps list_windows get_window_state verify_state launch_app kill_app bring_to_front set_window_frame invoke_menu click double_click right_click drag mouse_button_down mouse_drag mouse_button_up parallel_mouse_drag type_text press_key hotkey set_value scroll clipboard_read clipboard_write get_screen_size get_desktop_state get_cursor_position move_cursor set_agent_cursor_enabled set_agent_cursor_motion get_agent_cursor_state set_agent_cursor_theme check_permissions health_report get_config set_config get_accessibility_tree zoom page get_browser_state browser_prepare browser_navigate browser_click browser_type browser_select browser_dialog browser_set_input_files browser_download browser_pointer start_recording stop_recording get_recording_state replay_trajectory install_ffmpeg start_session get_session list_sessions end_session get_guide run_steps run_script create_space fork_space list_spaces delete_space stop_space start_space space_bash share_tcp_port list_tcp_shares stop_tcp_share`

**Schemas of the 12 observe-act tools** (compact: `name: type`; required fields listed; all also take optional `session:string`). Full JSON in `mcp-tools.json` (scratch dir). All tools carry `annotations` (`readOnlyHint, destructiveHint, idempotentHint, openWorldHint`): the observe tools are `readOnlyHint:true`; `click, type_text, press_key, hotkey, run_steps, set_value, scroll` are `destructiveHint:true` (scroll false).

- `list_apps` required none. props: session.
- `list_windows` required none: `app:string, on_screen_only:boolean, pid:integer`.
- `launch_app` required none (need one of launch_path/name/urls): `additional_arguments:string[], bundle_id:string, launch_path:string, name:string, urls:string[]`.
- `get_window_state` required `pid`: `window_id:integer, query:string, since:string, max_elements:int>=1, max_depth:int>=1, timeout_ms:int>=100 (default 1000), include_accessibility_tree:boolean, include_screenshot:boolean, max_image_dimension:int>=0, max_dimension:int>=1, tree_format:markdown|elements|both, capture_mode:ax|vision, display_only:boolean, full_output:boolean, screenshot_out_file:string, verbose:boolean`.
- `get_desktop_state` required none: `max_image_dimension:int>=0, screenshot_out_file:string`.
- `click` required none: `pid, window_id, element_token:string, x:number, y:number, button:left|right|middle, count:int>=1, modifier:string[], scope:window|desktop (default window), coordinate_frame:window|desktop, delivery_mode:background|foreground (default background), capture_id, cursor_id, from_zoom:boolean, target:object`.
- `type_text` required `text`: `pid, window_id, element_token, x, y, delay_ms:int>=0, scope, coordinate_frame, delivery_mode, target`.
- `press_key` required `key`: `pid, window_id, element_token, modifiers:string[], x, y, scope, coordinate_frame, delivery_mode, target`.
- `hotkey` required `keys` (string[]): `pid, window_id, element_token, x, y, scope, delivery_mode, target`.
- `scroll` required `direction` (up|down|left|right): `amount:int>=1, by:line|page, pid, window_id, element_token, x, y, scope, coordinate_frame, delivery_mode, cursor_id, target`.
- `run_steps` required `steps` (array of `{tool, args, wait_for?, expect?}`): `observe:object ({} = diff observation), foreground_fallback:boolean, delivery_mode, delay_ms, app, window, pid, window_id`.
- `set_value` required `value`: `element_token, pid, window_id, delivery_mode`.

Observed calls (Space with Firefox + xfce4-terminal; latency is the MCP round trip from Node):

| Call | ms | Result size and shape |
|---|---|---|
| `get_screen_size` | 10 | text 36 chars `Main display: 1280x800 points @ 1x`; structuredContent `{height,scale_factor,width}` |
| `list_apps` | 19 to 22 | text 693 to 1,001 chars (57 apps: 28 running, 29 installed) + structuredContent `{apps[{active,bundle_id,kind,last_used,launch_path,name,pid,running,windows}],processes}` |
| `list_windows` | 9 to 98 | text 302 to 390 chars + structuredContent `{windows[{app_name,bounds,height,is_on_screen,pid,title,width,window_id,x,y,z_index}]}` |
| `get_desktop_state` | 80 (1280 px), 193 (640 px, desktop busy) | **image/png**, 22,377 B (empty desktop) to 96,635 B (640x400 with windows); text 542 to 845 chars listing windows; structuredContent has `capture_id, screenshot_width/height, frame_scale, windows`. Image is an MCP `image` content block (base64 `data` + `mimeType:'image/png'`) |
| `launch_app {launch_path:'xfce4-terminal'}` | 263 | text 50 chars `Launched xfce4-terminal (pid 699) in background.` + `{active,bundle_id,launcher_pid,name,pid,running,windows}` |
| `launch_app {name:'chromium', urls:[…]}` | 122 | `Opened 1 URL(s) via xdg-open.` (=> **Firefox** opened, title `Example Domain — Mozilla Firefox`, window 1280x749) |
| `get_window_state` Firefox full tree | 881 to 1,106 | text **26,819 chars** (250 rows, "PARTIAL TREE" warning) + PNG **147,611 B** (196,816 b64 chars, 1280x749); `walk_ms` ~950 (browser AT-SPI trees are slow; 1 s budget truncates) |
| `get_window_state {include_screenshot:false}` | 881 | 26,826 chars |
| `get_window_state {query:'Learn more', include_screenshot:false}` | 1,091 | **910 chars** (one link row `[44] link "Learn more"`, token `s00000004:44`) |
| `get_window_state {include_accessibility_tree:false, max_image_dimension:800}` | 72 | 100 chars + PNG 130,897 B (800x468) |
| `get_window_state {…, max_dimension:320}` | 38 | PNG 28,622 B |
| `get_window_state` terminal | 117 (76 ms walk) | 1,618 chars (20 rows) + PNG 54,809 B; **terminal text content is not in the tree** (only the screenshot shows it) |
| `click {element_token}` | 1,048 | `Clicked element [44] (pid 312).` page navigated (title -> `Example Domains`) **PASS** |
| `click {x,y}` background | 2,499 | **isError** "Background delivery is not available… retry with delivery_mode:'foreground'" |
| `click {x,y,delivery_mode:'foreground'}` | 1,425 | `Clicked at (400,300) … path=x11_xtest_fg; not verified` |
| `hotkey ctrl+l`, `type_text`, `press_key Return` (foreground) | 865 / 856 / 858 | each ~130-char text `…as a real key event … not verified`; title went back to `Example Domain` **PASS** (URL bar navigation works) |
| `type_text` / `press_key` into terminal (foreground) | 32 / 31 | `Typed 46 character(s) (terminal emulator: pty/XTest key events).` The typed `echo typed-by-agent > /tmp/typed.txt; hostname` ran: file contains `typed-by-agent` **PASS** |
| `run_steps {steps:[type_text,press_key], observe:{}, foreground_fallback:true}` | 125 | content: 320-char summary + **1,731-char diff/full observation** + 64-char note; "2/2 steps ok" |
| `run_steps` with a pixel click and no prior screenshot | 1,091 | **isError** "No screenshot frame for window…"; it appends a recovery read (3.0 K text + 199,606 B PNG) |

Response envelope: every result has `content[]` plus `structuredContent`; action results carry `{delivery, effect, hint, route, summary}`; refusals carry `{code, detail, escalation, hint, suggestion}`. Images: always `image/png` as an MCP image content block; sizes above. `get_window_state` returns text block(s) first then the image; `get_desktop_state` returns the image first.
Browser check: opening `https://example.com` via `launch_app urls` and via ctrl+L typing both gave window title `Example Domain — Mozilla Firefox` (read with `list_windows`, 11 to 21 ms). Chromium (launched with `launch_path:'/usr/bin/chromium'`) started in 1.5 s with a window `DuckDuckGo Private Search Engine - Chromium`.

## T6 details (which path for shell and files)

Tested all three:
1. **SDK (best)**: `space.bash(cmd, timeoutMs?:bigint)` -> `{stdout, stderr, exitCode, signal, timedOut, error, rendered}`; 5 to 13 ms. Files: `space.write(path, ArrayBuffer)`, `space.upload(local, dest)`, `space.download(remote, localDir)`. There is **no read-to-memory method**; `download` to a temp dir then read (see `readGuestFile`), or `space.bash('cat …')`.
2. **spacesd raw client** `space.spacesd()`: methods `agents attach callJson callJsonStream capabilities click cursorPosition diagnose displays doubleClick download downloadFile drag endpoint forwardTcp getClipboard hasFeature health hotkey http jsonMethods keyboardJson listDir listProcesses makeDir movePath moveTo openDownload openMedia openMediaWithAudio pointerJson press remove rightClick route run screenshot scroll setClipboard sh spawn stat typeText upload uploadFile`. `env.sh('…; exit 4')` returned `{exit:{code:4,timedOut:false,success:false}, stdout:{}, stderr:{}, pty:{}}` (output comes back as streams/buffers, awkward); `env.stat` worked (`{name,path,kind:'file',size:16n,mode:420,…}`); `env.run([...])` threw `TypeError … reading 'length'` and `env.listDir('/tmp')` threw `expect Number, got: Undefined` (wrong arg shapes, not pursued). Not recommended.
3. **`cua mcp` stdio server** (`node_modules/.bin/cua mcp --sandbox NAME --permissions GROUPS`): connect 0.95 s. Full server = **179 tools** (spaces, agents, volumes, teleport, cloud…). `--permissions computer:all` = **35 tools**: `computer_screenshot computer_click computer_double_click computer_move_cursor computer_mouse_down computer_mouse_up computer_type computer_key computer_key_down computer_key_up computer_hotkey computer_scroll computer_drag computer_clipboard_get computer_clipboard_set computer_file_read computer_file_write computer_file_list computer_shell computer_window_list computer_window_open computer_window_focus computer_window_unfocus computer_window_minimize computer_window_maximize computer_window_close computer_window_resize computer_window_move computer_window_get_info computer_launch computer_get_screen_size computer_get_cursor_position computer_get_current_window computer_get_accessibility_tree computer_accessibility_act`. `computer:readonly` = 5 tools (screenshot, screen size, cursor, current window, a11y tree). `sandbox:all` = 14, `spaces:readonly` = 38.
   - `computer_shell {command, sandbox?}` 111 ms -> text `from-computer_shell\naarch64\n[exit 2]` (stdout then `[exit N]`, stderr marked `[stderr]`).
   - `computer_file_read {path}` 83 ms -> text JSON `{"content":"hello from host\n","success":true}`.
   - `computer_file_write {path, content}` 121 ms -> `wrote /tmp/mcpw.txt (8 bytes, sha256 … verified in Space)`.
   This is the ready MCP server to attach directly to an agent: `{type:'stdio', command:<CUA_BIN>, args:['mcp','--sandbox','<space name>','--permissions','computer:all']}` (embedded runtime, no daemon needed; pass `CUA_TELEMETRY=0`). Its click/type use screenshot-pixel coordinates (1200 px cap), a coarser alternative to the `/mcp` driver.
4. CLI: `cua sb exec NAME 'cmd'` (exit code = command's), `cua sb cp`, `cua sb screenshot NAME -o x.png` work too.

Recommended agent wiring (spike-proven pieces): **driver MCP `/mcp` for GUI (allow-list its tools, exclude the 10 space/share tools) + our own `shell` and `file` tools implemented host-side with `space.bash` / `write` / `download`**, or the stdio `cua mcp … computer:all` for shell+files. Both avoid host exposure because shell runs inside the Space.

## T7 details (live view)

(a) **Thumbnail** `space.thumbnail(undefined)`: 22 ms, JPEG 320x200, 3.6 KB (2.4 KB empty desktop); file check `JPEG image data, baseline, 320x200`. Optional `maxAgeMs` (bigint). Also `space.windowThumbnail(...)` exists (untested).

(b) **Stream ticket**:
- Daemon route (reproduces media-bridge.ts in plain JS, `t7b-bridge.mjs`): POST gRPC-Web to `<loopback_url>/cua.daemon.v1.DaemonService/OpenMediaBridge` with `authorization: Bearer <token from daemon.json>`, body = frame of `{name:'local:spike-a', open_media_json:'{"target":{"displayId":"primary"},"geometryControl":"GEOMETRY_CONTROL_OBSERVE_ONLY","ticketTtl":"120s","maxFps":10,"maxDimension":960,"policy":"SESSION_POLICY_VIEW_ONLY"}'}`. Result: HTTP 200, 588 bytes, **75 ms**, trailer `grpc-status:0`, `ws_url = ws://127.0.0.1:51447/v1/bridge/media?ticket=…`, response JSON `{"mediaSessionId":"media-1-…","codec":"MEDIA_CODEC_H264","maxFps":10,"maxDimension":960,"bitrateKbps":4000,"policy":"SESSION_POLICY_VIEW_ONLY","geometry":{"frameSize":{"width":960,"height":600},"scale":0.75,…},"wireVersion":2}`. A plain Node `ws` client connected in **7 ms** and in 5 s received **51 messages, 82,109 bytes (avg 1,610, max 29,560)**. First messages are text JSON: `{"type":"hello","payload":{"protocol":"rcdp","versions":[2],"selected_version":2,"capabilities":["input.interactive.v2","desktop.v1","keyframe_on_attach.v1","frame_ack.v1","stats.v2","audio.v1"],…}}` (222 B), then `{"type":"session_opened","payload":{"session_id":…,"target":{"kind":"display","display_id":"0"},"geometry":{"width_px":960,…}}}` (472 B), then **binary frames** starting `000000f5 0000727b 7b22646972656374…` (a header with length + JSON `{"direct…`, then H.264). First binary frame 29,560 B (keyframe), then 938, 2,768, 6,923 B. Static desktop = low bitrate (~16 KB/s).
- SDK route (no daemon): `space.openStream({codecs:[], maxFps:10, maxDimension:960, audio:false, policy:'view_only'})` 32 ms -> `{space, mediaSessionId, wsUrl:'ws://127.0.0.1:50936/media?ticket=v1.eyJ…', ticket, ticketExpiresAt (+~60 s), codec:'h264', wireVersion:2, width:960, height:600, needsHeaders:false}`. `ws` client got frames (4 messages/68 KB in 4 s, 13 messages in 2.5 s in the smoke test). The ticket must be used before expiry (default 60 s; `ticketTtlMs` bigint to extend).

(c) **HTML5 viewer**: `sb.viewerUrl(undefined)` -> `{url:'http://127.0.0.1:50936/viewer/#ticket=…&files=%2Fhome%2Fcua', expiresAtUnix}`; `GET` of the URL (fragment stripped) returned **HTTP 200 `text/html; charset=utf-8`, 613 chars** (`<!doctype html>…`, the viewer shell). So embedding the viewer in an Electron `WebContentsView`/`<webview>` is viable without any daemon. `cua viewer --no-open` serves a viewer for all Spaces on one loopback port (not run).

## T8 details (scale)

Host: 32 GiB, 12 cores. **Baseline before the runtime VM started: PhysMem 19 GB used, 3.0 GB wired, 4.6 GB compressor, ~12 GB unused** (the Mac already carries ~19 GB of other apps and this session). Runtime VM configured `cpu: 6, memory: 12, disk: 60` (after `cua config set runtime.linux_cpus 6`, `runtime.linux_memory_gib 12`; the earlier default VM was 4 CPU / 24 GiB). Each Space default: 2 vCPU, 4096 MiB cap. Each Space ran Firefox on example.com (default browser), ~25 s settle, then measured. "VM RSS" = host RSS of `com.apple.Virtualization.VirtualMachine`.

| Spaces running (Firefox open each) | Create time of the latest | Per-Space guest RAM (Space `usage()`) | VM RSS on host | Host PhysMem used / unused | VM CPU (top, instant) | Host CPU idle |
|---|---|---|---|---|---|---|
| 0 (VM down) | n/a | n/a | n/a | 19 GB / 12 GB | n/a | 71% |
| 1 | **35.3 s** (includes VM cold boot) | 1,444 MB (1,431 MB settled), 0.5 to 20% CPU while loading | 4.89 GiB | 21 GB / 10 GB | 7 to 41% | 84% |
| 3 | 4.8 s, 3.4 s | 1,303 to 1,437 MB each | 7.7 GiB (settled), 7.06 GiB while loading at 163% VM CPU | 25 GB / 6.6 GB | 10% idle | 85% |
| 5 | 4.8 s, 3.7 s | 1,302 to 1,440 MB each | **10.6 GiB** | **27 GB / 4.2 GB**, free pages 2.2 GB, compressor 4.6 GB, swap used 0.6 MB | 21% | 78 to 84% |

Findings:
- **RAM is the constraint.** ~1.4 GB guest RAM per Space (Firefox + XFCE), and the VM's host RSS grows to ~2 GiB per added Space and **never shrinks** (guest page cache / no balloon): 10.6 GiB of the 12 GiB cap at 5 Spaces. The VM cap is therefore also the host cost ceiling. After a VM restart RSS resets (3.1 GiB right after boot with 1 empty Space).
- CPU is not the constraint: settled idle Spaces use 0.4 to 0.7% CPU each; loading a page spikes to 20 to 35% of one Space; host stayed ~80% idle.
- Per-Space `cpus:1` is accepted but `nproc` still printed 2 in gVisor; `memoryMb:2048n` **is enforced** (`free -m` total 2048). A 2 GB cap is too tight for Firefox (465 MB at idle, ~1.4 GB with a page); use 3072 to 4096 for browser employees.
- `cua spaces ls` per-Space disk: ~222 MB per Space with a browser session.
- **VM size**: set once, takes effect when the VM next boots: `cua config set runtime.linux_memory_gib N` and `runtime.linux_cpus N` (writes `~/.cua/config.toml`; leave it unset = 24 GiB / 4 CPU in practice).
- A running VM with no Spaces **keeps its RAM** until the daemon winds it down (see T4).

**Safe concurrency for this 32 GB Mac while Electron + a browser + a video call run**: the Mac was already at 19 GB used before any Space. With the VM capped at 12 GiB, 5 browser desktops left only ~4 GB unused and 2.2 GB free pages (close to compressing/swapping once Electron (~1 to 2 GB), a browser and a call (~2 to 3 GB) are added). **Recommendation: 3 concurrently active Linux desktop Spaces (4 absolute max), `runtime.linux_memory_gib 10`, `linux_cpus 6`, per-Space `memoryMb` 3072; keep others `suspend`ed only if the VM has headroom** (suspend keeps memory) or fully `stop`ped only if their state is not needed (stop wipes the filesystem). For a 4-employee demo: all 4 can exist, but run at most 3 browsers at once, or use headless Spaces (`headless:true`, no desktop) for employees not on screen.

## T9 details (persistence, identity, create options)

- **Process restart**: every Space survived every Node process exit and `cua daemon stop/start`. Registry: `~/.cua/spaces.json`.
- **Find "the Space for employee X"**: `id` is `local:<name>`, so use `name = employee-<id>`; also store `labels` (Map, up to 64 keys, key <= 63 B, value <= 256 B) which round-trip through `list()` (`labels` printed in `cua spaces ls` as `[employee=ada]`). Keep our own store keyed by the same name.
- **Stop vs suspend**: after `stop`+`start` the guest `uptime` reset to 0 and `/home/cua/p.txt`, `/tmp/p.txt`, `/opt/p.txt`, `/home/cua/work/` were all gone (`ls: cannot access`). After `suspend`+`start` files and background processes (`sleep 1000`) survived. => **Use `suspend`/`start` for pause; treat `stop` as "reset to image".** Everything an employee must keep should also be mirrored host-side.
- **Runtime-VM crash** (simulated: `pkill -9 -f "limactl hostagent"`, a plausible effect of a host sleep/crash): `spaces.list()` still said `running`; `spaces.start()` hung 90 s+ until I killed the stale `limactl usernet` + ssh mux; after that every call failed `CuaError.Runtime: local runtime: instance emp-1 not found` and the container filesystem (marker file) was lost. Recovery that worked: `spaces.delete_(id)` (or `cua spaces delete local:NAME --force`) for each stale entry, then `create` again (VM reboots in 17 to 20 s). The app needs a health check (`space.bash('true')` with a timeout) and a "recreate on `instance not found`" path.
- **Create options verified in one create** (`SpaceCreateOptions.create({ name:'emp-t', cpus:1, memoryMb:2048n, env:new Map([['CUA_RESOLUTION','1600x900']]), labels:new Map([['employee','tess'],['role','marketing']]), networkSettings: NetworkSettings.create({preset:'none'}) })`; 6.6 s):
  - **Resolution**: configurable through the guest env var `CUA_RESOLUTION` (read by `/opt/cua/desktop/start-desktop.sh`; default `1280x800`). `displays()` -> 1600x900; screenshot 1600x900. Xvfb cannot be resized at runtime (`xrandr` max = initial size).
  - **Memory cap** enforced (`free -m` 2048 MB); `cpus` accepted (`info` shows `1 core`; `nproc` still 2 under gVisor).
  - **Network none**: `curl https://example.com` -> `curl: (6) Could not resolve host`, `getent hosts` exit 2. **Live switch** `spaces.setNetwork('local:emp-t', NetworkSettings.create({preset:'internet'}), false, false)` -> `{applied:'now', network:{summary:'Internet only', enforcement:'enforced', point:'nftables in the container engine's own network namespace…', alwaysBlocked:[cloud metadata, other trees, the Cua daemon, this computer's own addresses]}}`; `curl` returned HTTP 200 afterwards. Presets: `internet` (default), `none`, `localhost:<ports>`, `lan`, `localhost+lan`, `custom`, `unprotected`.
  - Other options that exist (not all run): `profile:'rollout'`, `headless:true`, `kind`, `runtime`, `services`, `parent` (child Space), `egress`, `diskGb` (VMs only), `reuse`, `build`.
- `spaces.json` after deleting everything is `[]`; `cua spaces ls` prints `No Spaces.`.

## T10 details (permission mode inside a Space): YES, it works

The in-Space driver reads the standard driver env vars from the **Space's `env` at create time** (`SpaceCreateOptions.env` Map). Results on a Linux Space:
- default (no vars): `standard`; `launch_app xfce4-terminal` allowed.
- `CUA_DRIVER_PERMISSION_MODE=bounded` alone: every call fails `Policy loading error: bounded compatibility mode requires a capability manifest`.
- `CUA_DRIVER_PERMISSION_MODE=unrestricted` alone: `Policy loading error: permission mode unrestricted requires --dangerously-bypass-approvals at trusted daemon startup`.
- **bounded + manifest** (env: `CUA_DRIVER_PERMISSION_MODE=bounded`, `CUA_DRIVER_CAPABILITY_MANIFEST_FILE=/home/cua/manifest.yaml`, `CUA_DRIVER_CAPABILITY_MANIFEST_APPROVED=1`; manifest `version: 3`, `expires_after: 8h`, `idle_timeout: 30m`, `allow.tools: [start_session,end_session,list_windows,list_apps,launch_app,get_window_state,click]`, `resources.apps:[{executable:/usr/bin/firefox,launch:true,windows:all,terminate:driver_launched}]`, `resources.desktop.display:false`). Once the manifest was loaded, enforcement was exact: `type_text` -> `Permission denied: tool 'type_text' is outside the capability manifest`; `get_desktop_state` -> same; `launch_app xfce4-terminal` -> `Permission denied: launch_app launch_path 'xfce4-terminal' is outside the capability manifest`; `list_windows`/`list_apps` -> `protected resource is outside the capability manifest: desktop display observation is outside the capability manifest` (needs `desktop.display: true`). `launch_app /usr/bin/firefox` was also denied (the real executable is `/usr/lib/firefox/firefox`; not iterated).
- **Start-order trap**: the manifest file does not exist when the Space boots, so the driver cached `failed to read capability manifest /home/cua/manifest.yaml: No such file or directory` even after I wrote the file via `space.write`. It started working only after `sudo kill <spacesd pid>` inside the Space (supervisord restarted spacesd). So: either restart spacesd after writing the manifest (`exec(space,'sudo supervisorctl restart cua-spacesd')`, untested; `kill` worked) or bake the manifest into an image with `cua build`. Both proven pieces: env at create + manifest write + spacesd restart.
- **unrestricted + `CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS=1`**: works, and **it unlocks CDP**: `browser_prepare {strategy:{kind:'existing_profile'}}` -> `Attached to the approved existing Chromium profile`, `get_browser_state` -> `bound target … with 1 tab(s)`. (In standard mode the same call is refused.)
- Mapping for per-employee permissions (brief item 8): `bounded` + manifest (strict tool+app allow list), `standard` (default), `unrestricted`+bypass (full, CDP). Network preset and CPU/RAM add independent levers (T9). This is enforced inside the Space by the driver, not just by our harness.

## T11 details (agent inside a Space; no LLM run)

- Preinstalled: `node v24.21.0`, `npm 11.19.0`, `pnpm 12.6.0`, `python3 3.12.3`, `git 2.43.0`, `curl`, firefox, chromium, `/usr/local/bin/{cargo,rustc,go,gh,uv,cua,…}` (the `cua` CLI is inside the image so an agent can make child Spaces). **`claude`, `codex`, `gemini`, `opencode`, `goose`, `pi` are not installed** (`which` empty).
- `cua agent harnesses` lists `claude-code openai-codex gemini-cli google-antigravity opencode goose pi hermes openclaw`, each "auth: missing keys" locally (e.g. claude-code needs `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_AUTH_TOKEN`). The harness is downloaded into the Space (`~/.cua/bin/claude` inside) on first run, so the Space needs internet at that moment.
- `Space.agentStart(agent, prompt, show?:boolean, options?)`; `SpaceAgentOptions`: `{envFromHost:string[], env:Map, repo?, branch?, cwd?, model?, baseUrl?, exitWhenIdle?:boolean, home?}`. Other `Space` methods: `agentEvents, agentInterrupt, agentList, agentMessage, agentStatus, agentStop`. CLI: `cua agent run <SANDBOX> <HARNESS> <PROMPT> [--env-from-host ANTHROPIC_API_KEY] [--repo URL --branch B --cwd DIR] [--model M --base-url U --wire anthropic|openai-responses|openai-chat|gemini] [--mcp NAME=URL | NAME=cmd:CMD] [--file PATH] [--no-sandbox-mcp] [--no-skills] [--exit-when-idle] [--label L] [-f/--follow] [--durable …]`. `--durable` needs the Spaces app/relay, skip.
- Note: the Cua-managed env var forwarding means `ANTHROPIC_API_KEY` must exist in the environment of the process running the SDK (embedded) or of the daemon (restart it after exporting).

## Copy-paste reference (all of this is in `cua-ref.mjs` and passed `cua-ref-smoke.mjs` end to end, 25 s)

`cua-ref.mjs` (executed):

```js
import { embedded, mcpHeaders, SpaceCreateOptions, NetworkSettings, Image } from '@trycua/cua';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.CUA_TELEMETRY ??= '0';
process.env.DO_NOT_TRACK ??= '1';

const cua = embedded();
export const spaces = cua.spaces();
export const CUA_BIN = new URL('./node_modules/@trycua/cua-darwin-arm64/cua', import.meta.url).pathname;

/** Create the Space named `name`, or return the existing one (resumes it if suspended/stopped). */
export async function ensureSpace(name, { labels = {}, cpus, memoryMb, resolution, network, env = {} } = {}) {
  const id = `local:${name}`;
  const existing = (await spaces.list()).find((s) => s.id === id);
  if (existing) {
    if (existing.powerState === 'suspended' || existing.powerState === 'stopped') await spaces.start(id);
    return spaces.space(id);
  }
  const e = new Map(Object.entries(env));
  if (resolution) e.set('CUA_RESOLUTION', resolution);          // '1600x900'; default 1280x800
  await spaces.create(SpaceCreateOptions.create({
    name,
    image: Image.linux(),                                        // ghcr.io/trycua/linux:24.04
    cpus,
    memoryMb: memoryMb ? BigInt(memoryMb) : undefined,
    labels: new Map(Object.entries(labels)),
    env: e,
    networkSettings: network ? NetworkSettings.create({ preset: network }) : undefined, // 'internet'|'none'|'lan'
  }));
  return spaces.space(id);
}

export const exec = (space, cmd, timeoutMs) => space.bash(cmd, timeoutMs === undefined ? undefined : BigInt(timeoutMs));
// -> { stdout, stderr, exitCode, signal, timedOut, error, rendered }

export const writeGuestFile = (space, guestPath, data) => space.write(guestPath, new TextEncoder().encode(data).buffer);

export async function readGuestFile(space, guestPath) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cua-dl-'));
  const r = await space.download(guestPath, dir);
  return readFile(r.dest);
}

export async function screenshotPng(space, outFile) {            // { image, format:0, width, height, scale, screenshotId }
  const s = await space.screenshot(undefined);
  if (outFile) await writeFile(outFile, Buffer.from(s.image));
  return s;
}
export async function thumbnailJpeg(space, outFile, maxAgeMs) {  // { image, format:1, width:320, height:200, capturedAtMs }
  const t = await space.thumbnail(maxAgeMs === undefined ? undefined : BigInt(maxAgeMs));
  if (outFile) await writeFile(outFile, Buffer.from(t.image));
  return t;
}

export async function mcpConfig(name, employeeId) {              // drops into Claude Agent SDK mcpServers
  const sb = await cua.sandboxes().connect(`local:${name}`);
  const cfg = await sb.mcpConfig('env', '/mcp');
  return { type: 'http', url: cfg.url, headers: { ...mcpHeaders(cfg), 'X-Cua-Agent-Session': employeeId } };
}

export const openStream = (space, { maxFps = 10, maxDimension = 960, audio = false, policy = 'view_only' } = {}) =>
  space.openStream({ codecs: [], maxFps, maxDimension, audio, policy });   // { wsUrl, ticket, codec:'h264', width, height, … }

export async function viewerUrl(name) {
  const sb = await cua.sandboxes().connect(`local:${name}`);
  return (await sb.viewerUrl(undefined)).url;                    // http://127.0.0.1:<port>/viewer/#ticket=…
}

export const suspendSpace = (name) => spaces.suspend(`local:${name}`);   // keeps memory + files
export const resumeSpace  = (name) => spaces.start(`local:${name}`);
export const stopSpace    = (name) => spaces.stop(`local:${name}`);      // WIPES the container filesystem
export const deleteSpace  = (name) => spaces.delete_(`local:${name}`);
export const listSpaces   = async () => (await spaces.list()).map((s) => ({ id: s.id, name: s.name, state: s.powerState, labels: Object.fromEntries(s.labels), image: s.image }));

export const daemonStart = () => execFileSync(CUA_BIN, ['daemon', 'start'], { env: process.env }).toString().trim();
export const daemonStop  = () => execFileSync(CUA_BIN, ['daemon', 'stop'],  { env: process.env }).toString().trim();
```

MCP client against a Space (executed in `mcplib.mjs`/`t5*.mjs`; no `@trycua/cua` MCP helper needed):

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const mcp = await mcpConfig('ref-ada', 'ada');                    // from cua-ref.mjs
const client = new Client({ name: 'agentmanager', version: '0.1' });
await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }));
const { tools } = await client.listTools();                       // 71
const r = await client.callTool({ name: 'get_desktop_state', arguments: {} });  // r.content: [{type:'image',mimeType:'image/png',data:b64},{type:'text',text}], r.structuredContent
// keys/pixel clicks on Linux need delivery_mode:'foreground'
await client.callTool({ name: 'run_steps', arguments: { steps: [{tool:'type_text',args:{pid,window_id,text:'hi'}},{tool:'press_key',args:{pid,window_id,key:'Return'}}], observe: {}, foreground_fallback: true } });
```

Daemon media-bridge ticket (executed, `t7b-bridge.mjs`; needs `daemonStart()` first): read `~/.cua/daemon.json` (`loopback_url`, `token`), POST gRPC-Web `OpenMediaBridge` as described in T7b, parse field 1 (`ws_url`). The SDK `openStream` above is simpler and needs no daemon.

Stdio MCP for shell+files (executed): `{ type:'stdio', command: CUA_BIN, args:['mcp','--sandbox','ref-ada','--permissions','computer:all'], env:{ CUA_TELEMETRY:'0' } }`.

Bounded-mode Space (executed in pieces): `ensureSpace('emp', { env: { CUA_DRIVER_PERMISSION_MODE:'bounded', CUA_DRIVER_CAPABILITY_MANIFEST_FILE:'/home/cua/manifest.yaml', CUA_DRIVER_CAPABILITY_MANIFEST_APPROVED:'1' } })`, then `writeGuestFile(space,'/home/cua/manifest.yaml', yaml)`, then restart spacesd (`sudo kill` its pid; supervisord respawns it) before the first MCP call.

## Resource numbers (T8 summary)

- Runtime VM: Apple Virtualization.framework, `limactl hostagent` + `limactl usernet` (~67 + ~100 MB) + the VM XPC process (RSS = guest RAM touched, up to the cap, not returned). Default actual: 4 CPU / 24 GiB; we set 6 CPU / 12 GiB.
- Per Space with Firefox open: ~1.4 GB guest RAM, ~220 MB disk, 0.5% CPU settled, 20 to 35% for ~20 s while a page loads. Empty desktop: ~550 to 580 MB.
- Create: cold VM + first Space 17 to 35 s; warm 3.4 to 6.6 s; first-ever install 707 s (download bound).
- Call latency: SDK calls 1 to 30 ms; MCP `list_*` 10 to 20 ms; `get_desktop_state` 80 to 190 ms; `get_window_state` 40 to 120 ms for light apps, ~1 s for Firefox (AT-SPI walk); foreground key/click 0.9 to 1.4 s on Firefox, 30 ms on the terminal; element click ~1 s.
- Safe number: **3 active desktop Spaces** (4 max) at `linux_memory_gib 10 to 12`; 5 reached 27 GB used / 4.2 GB unused on a Mac that already had 19 GB in use.

## What is left on disk and how to remove it

Left on purpose (the build reuses it): runtime, image, config. Nothing else is running (no Spaces, no daemon, runtime VM stopped; verified `pgrep` = 0, `cua spaces ls` = No Spaces, `cua daemon status` = not running).

| Path | Size | What |
|---|---|---|
| `~/.cua` (total) | **7.3 GB** at rest (11.8 GB while the VM runs) | everything below |
| `~/.cua/runtimes/linux/colima-0.10.3-lima-2.2.0` | 92 MB | Colima+Lima, SHA-checked |
| `~/.cua/runtimes/linux/vm/_lima/_disks/colima-cua/datadisk` | 5.7 GB real (60 GB sparse) | pulled `ghcr.io/trycua/linux:24.04` layers (4.4 GiB uncompressed) and Space overlays |
| `~/.cua/runtimes/linux/vm/_lima/colima-cua/disk` | 1.6 GB real (20 GB sparse) | runtime VM boot disk |
| `~/.cua/config.toml` | 4 KB | **I changed it**: `telemetry.enabled=off`, `runtime.linux_memory_gib=12`, `runtime.linux_cpus=6` (edit or `cua config unset …` as you like) |
| `~/.cua/{spaces.json,space-meta.json,spaces-credentials.json,logs,share,spawn,...}` | tiny | state |
| `/private/tmp/claude-502/-Users-suhaan-Desktop-imperial-ai-hack/e8cda6e2-1ab7-4114-b736-8a443be0d374/scratchpad/cua-spike` | 294 MB | `node_modules` + all spike scripts, screenshots, tool dumps |

Host free disk: 207 GiB before, 198 GiB now. No LaunchAgents, no login items, no `~/.local/bin` entries, no sudo, no Homebrew, no account/sign-in were touched.

Remove everything: `cd` into the scratch dir (or the app) and run `npx cua daemon stop; npx cua spaces ls` (should be empty), then `rm -rf ~/.cua` (removes the runtime, image and config; the next first-run costs ~12 min of download again) and delete the scratch dir. Not done by me: `cua cache prune` (denied by the permission system; not needed, the stale-sandbox dirs it would clear were already gone).

## Blockers and risks (ranked)

1. **First-run download is 1.8 GB / 12 min on this link and must happen before the overnight build or demo.** It is already done on this Mac (image + runtime cached). If `~/.cua` is deleted, or the build runs on a different machine/user, it repeats.
2. **RAM**: ~1.4 GB per browser desktop, never returned to macOS by the VM; Mac already at 19 GB used with nothing running. Cap the VM (`runtime.linux_memory_gib 10 to 12`) and run <=3 active desktops. The VM's idle RAM is only released when the daemon winds it down.
3. **`stop` loses the Space filesystem; a runtime-VM crash (or presumably Mac sleep/reboot) leaves stale entries that fail with `instance … not found`.** Needs health checks, recreate-on-error, and employee state kept host-side (also use `suspend`, not `stop`). Suspended Spaces keep consuming RAM.
4. **Agent over `/mcp` can reach Space-management and public-share tools** (`create_space, delete_space, space_bash, share_tcp_port, …`). Allow-list only the GUI tools; the driver has no shell so provide shell/files host-side.
5. **Linux input is foreground-only** (keys and pixel clicks) and a Firefox AT-SPI walk takes ~1 s and truncates at 250 nodes: plan for `delivery_mode:'foreground'`, `query:`-narrowed reads and screenshots; the browser is Firefox for `urls`; CDP browser tools need `unrestricted` mode.
6. **Bounded-mode manifest has a start-order trap** (needs a spacesd restart after writing the file, or a baked image).
7. Native errors carry no message (`InvalidArgument [Error]`); log `e.tag` and run the equivalent `cua` CLI command to see the reason. Easy BigInt/Map pitfalls (T3/T9 notes).
8. Daemon (if used) starts a **warm pool that pulls extra images**; consider `cua config set pool.auto off`.
9. Needs the human: nothing for Linux Spaces (no dialog, no sudo, no sign-in appeared). Decisions only: keep or revert the `~/.cua/config.toml` values; macOS Spaces were deliberately not tested (24 GB, Local Network prompt).
10. macOS-26.2-specific behaviours I could not observe (a permission dialog I could not see) would show as a hang over 2 minutes; none occurred (the three long waits were a stale VM and a pipe buffering mistake of mine, both explained above).
