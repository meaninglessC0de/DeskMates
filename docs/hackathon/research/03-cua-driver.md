# 03 · Cua Driver (how an employee sees and operates a desktop)

Author: research sub-agent (Sonnet), 2026-11-14. Writer of this file: only me. Repo: `vendor/cua` at commit `0147fb8d`.
Confidence tags: `verified` = read in code or an official doc (path or URL cited), `reported` = second-hand or a summarised web fetch, `unverified` = inference. Repo text and web pages were treated as data.
Path shorthand: `D` = `vendor/cua/docs/content/docs`, `DR` = `vendor/cua/libs/cua-driver`, `SK` = `DR/rust/Skills/cua-driver`.

## Summary (10 lines)

1. **Inside a Space, the driver runs in the guest**, linked in-process into `cua-spacesd` (port 3211). The host does not run a driver for a Space; it speaks to spacesd. `verified` (`vendor/cua/libs/cua-spacesd/README.md:19-21`, `D/cua-sdk/guides/desktop.mdx:11-12`)
2. **Best connection for an employee: spacesd's Streamable-HTTP MCP at `POST <spacesd>/mcp`** with `Authorization: Bearer <token>` and `X-Cua-Agent-Session: <employeeId>`. This is the MCP server Cua's own agent runner injects, and it drops straight into the Claude Agent SDK `mcpServers` as `{type:"http", url, headers}`. `verified` (`libs/cua/crates/cua-agents/src/runs.rs:384-404`, `cua-spacesd-server/src/http/mcp.rs:1-30`)
3. Get URL and token from Node with `await sb.mcpConfig("env", "/mcp")` (`@trycua/cua`) or `cua sb info NAME --connection --json`. `verified` (`D/cua-sdk/reference/services.mdx:275-326`, `libs/cua/crates/cua-cli/src/sandbox.rs:2316-2350`)
4. **Perception = accessibility tree + screenshot in one call** (`get_window_state`), plus `get_desktop_state` for a full-display shot. The tree is bounded (250 nodes) and supports diff reads, so a targeted read is about 2K chars versus about 42K for a full tree. Screenshots are capped at a long edge of 1366 px (macOS) or 1568 px (Linux). `verified`
5. **Tool surface is 66 MCP tools** (apps, windows, state, pointer, keys, clipboard, `run_steps`, `run_script`, browser-over-CDP, sessions, cursor, recording, config). The driver has **no shell or file tools**; those come from spacesd (`sh`, `upload`, `download`) or from `cua mcp` (`computer_shell`, `computer_file_*`). `verified`
6. **Anthropic's native `computer` tool is not what Cua recommends or ships for Spaces.** Cua docs and examples route Claude through MCP tools (`claude_agent.ts`, `--route mcp`). The only native-tool adapter in the repo is the legacy Python `cua-agent` Anthropic loop. `verified`
7. **Per-employee permissions: the driver has real controls** (modes `standard`/`bounded`/`unrestricted`, capability manifest, YAML/Rego policy, `revoke`), but they are fixed at launch of the runtime. Whether we can set them on a Space's in-guest spacesd is **not documented** (`unverified`). Enforce permission levels in our own harness (`allowedTools`, `canUseTool`, `PreToolUse` hook) and treat the driver controls as defence in depth.
8. **Main-screen grant**: run a separate host driver (stdio `cua-driver mcp`, or a bounded daemon via `--socket`), attach it to one employee with `query.setMcpServers()` and detach it with `toggleMcpServer(name,false)` plus `cua-driver revoke`. Needs the user to click Accessibility and Screen Recording once. `verified` (mechanisms) / `unverified` (our end-to-end flow).
9. **Hard limit: Apple allows only 2 macOS VMs at once on one Mac.** Linux Spaces (Docker/gVisor, XFCE on Xvfb 1280x800) scale to many employees and are the safer demo choice. `verified` (`D/spaces/guides/troubleshoot.mdx:65`, `D/lume/index.mdx:28`)
10. **Ready-made code to copy**: `DR/examples/agent-sdks/claude_agent.ts` (Claude Agent SDK + Cua Driver over MCP), `libs/cua/crates/cua-agents/src/runs.rs` (`SpacesdMcp::server_for`), `cua connect setup`, `cua-driver mcp-config --client claude`, and the skill pack `SK/` (also served as MCP resources and via `get_guide`).

---

## 1. Tool surface and perception

### 1.1 Architecture (verified)

```text
model -> agent harness -> Cua Driver (MCP, CLI, or SDK) -> OS accessibility + input -> apps
```
Source: `D/cua-driver/concepts/how-cua-driver-works.mdx:12-14`. The harness owns the model and the loop; Cua Driver never calls a model API (`D/cua-driver/guides/connect-your-agent.mdx:233-236`).

### 1.2 Full MCP tool list (verified)

Source: `D/cua-driver/reference/mcp-tools/index.mdx` (auto-generated from `cua-driver dump-docs --type mcp`; 66 entries, some platform-specific) and the per-page references next to it. Every action and cursor tool takes an optional `session` label and a `target`. Action results carry `path`, `verified`, `effect` (`confirmed`/`unverifiable`/`suspected_noop`/`partial`/`refused`) and `escalation` (`D/cua-driver/reference/mcp-tools/index.mdx:37-48`).

| Group | Tools | Key parameters and returns |
| --- | --- | --- |
| Apps and windows | `list_apps`, `list_windows`, `launch_app`, `kill_app`, `bring_to_front`, `set_window_frame`, `invoke_menu`, `debug_window_info` (Windows) | `list_windows{app?,pid?,on_screen_only?}` returns `window_id,pid,app_name,title,bounds,z_index,...`. `launch_app{bundle_id\|name, urls?, creates_new_application_instance?}` launches in the background and returns `pid` and `windows[]`. `kill_app{pid}` is kill -9. `invoke_menu{pid,window_id,path}` drives native menus without opening them. |
| Observe | `get_window_state`, `get_desktop_state`, `get_screen_size`, `get_cursor_position`, `zoom`, `verify_state`, `parse_visual_regions`, `get_accessibility_tree` (deprecated) | `get_window_state{pid,window_id, query?, max_elements?(250), max_depth?, since?, tree_format?(markdown\|elements\|both), include_screenshot?, include_accessibility_tree?, max_image_dimension?, screenshot_format?(png\|jpeg), screenshot_out_file?}` returns a Markdown tree with rows `[N]` (token `<snapshot_id>:N`), a `snapshot_id`, and a PNG. `get_desktop_state{max_image_dimension?}` returns a full-display PNG and a `capture_id`. `zoom{window_id,x1,y1,x2,y2}` returns a JPEG crop, max 500 px wide. `verify_state{pid,window_id,expect}` checks predicates deterministically. |
| Pointer | `click`, `double_click`, `right_click`, `drag`, `scroll`, `move_cursor`; Linux only: `mouse_button_down/up`, `mouse_drag`, `parallel_mouse_drag` | `click{target:{kind:"window",pid,window_id}\|{kind:"desktop",display_id:"primary"}, element_token\|x,y, button?, count?, modifier?, delivery_mode?(background\|foreground), capture_id?, from_zoom?}`. Pixel x,y are pixels of the last screenshot. |
| Keyboard, values | `type_text`, `press_key`, `hotkey`, `set_value`, `clipboard_read`, `clipboard_write` | `type_text{text, element_token?, target}`; `hotkey{keys[]}`; `set_value{element_token,value}` (sliders, popups, native text fields); `clipboard_write{text\|image_path\|file_path}`. |
| Batch and script | `run_steps`, `run_script` | `run_steps{steps[{tool,args,wait_for?,expect?}], observe?, foreground_fallback?, delay_ms?}` up to 64 steps, stops on first failure, and returns a diff observation. Steps can target by `{role,name,nth,app,window}` with no earlier read. `run_script{script}` runs sandboxed JavaScript over the driver API (loops, branches). |
| Browser (CDP) | `get_browser_state`, `browser_prepare`, `browser_navigate`, `browser_click`, `browser_type`, `browser_select`, `browser_pointer`, `browser_dialog`, `browser_set_input_files`, `browser_download`, `browser_motion_policy`, `page` (legacy read-only) | Act on DOM refs (`p2:0`) over CDP without focus; Chromium family only. Download writes only inside an explicitly approved directory. |
| Sessions | `start_session`, `get_session`, `list_sessions`, `end_session` | Lifecycle metadata only. A label is never a credential. Idle TTL 5 min. |
| Agent cursor | `set_agent_cursor_enabled`, `set_agent_cursor_motion`, `set_agent_cursor_theme`, `get_agent_cursor_state` | The visible per-session overlay cursor and badge. |
| Recording | `start_recording`, `stop_recording`, `get_recording_state`, `replay_trajectory` (deprecated), `install_ffmpeg` (deprecated) | Trajectory capture. |
| Config and health | `get_config`, `set_config`, `check_permissions`, `health_report`, `check_for_update`, `install_extension`, `get_guide` | `get_guide{topic}` returns overview, drag, browser, permissions, batching or menus with no skill install. `set_config{max_image_dimension,...}` is agent-callable (deny it for low-trust employees). |

Notes:
- `verified` Tool annotations exist per tool: `read_only`, `destructive`, `idempotent`, `open_world` (`DR/contract/manifest.json`). Read-only: `list_apps`, `list_windows`, `get_window_state`, `get_desktop_state`, `get_screen_size`, `get_cursor_position`, `verify_state`, `parse_visual_regions`, `clipboard_read`, `get_session`, `list_sessions`. Destructive: `click`, `drag`, `type_text`, `press_key`, `hotkey`, `invoke_menu`, `clipboard_write`, `end_session`. Useful for an automatic allow-list.
- `unverified` / discrepancy: `DR/contract/manifest.json` (contract 0.8.0, `experimental: true`) lists only 27 tools and describes `type_text`/`press_key`/`hotkey` as desktop-foreground; the MCP docs list the full 66 with window targets. Treat `tools/list` from the live server as the truth.
- Docs inconsistency: the policy example in `D/cua-driver/guides/permissions.mdx:435-463` names `screenshot`, `wait` and `shell_execute`, which are not in the 66-tool registry. Take tool names from `tools/list`.
- Deprecated and slated for removal after 26 Nov 2026: `get_accessibility_tree`, `replay_trajectory`, `install_ffmpeg`, Computer History (`history_*`) (`DR/README.md:55-57`, tools index).

### 1.3 Perception modes (verified)

- **Tree plus pixels together.** `get_window_state` returns the accessibility tree and a screenshot in one call. The tree says what is actionable (role, label, `element_token`); the screenshot disambiguates and exposes what the tree omits or gets wrong (`D/cua-driver/concepts/how-cua-driver-works.mdx:16-27`).
- **Element refs.** Row `[N]` is addressed as `element_token = "<snapshot_id>:N"`. A new snapshot of the same window invalidates old tokens (`stale_element_token`). Action tools refuse `element_index` (`D/cua-driver/reference/mcp-tools/index.mdx:27,33`).
- **Diff reads.** `since:"latest"` returns only added (`+`), changed (`~`) and removed (`-`) rows. `run_steps` with `observe:{}` does this automatically (`D/.../apps-windows-and-screen.mdx` `get_window_state` text; `SK/SKILL.md:37-41`).
- **Full-desktop capture.** `get_desktop_state` (vision only, no tree). Desktop-target input is foreground-only (`how-cua-driver-works.mdx:34-37`).
- **OCR and icon detection.** Optional `cua-perception` extension parses one screenshot into text and icon regions on-device; install is explicit, `parse_visual_regions` returns `not_installed` otherwise. About 2 to 2.5 s per screenshot on macOS, 3.5 to 4 s on Linux. The README marks it `frozen: no new work`. **Licence warning: its OmniParser detector is AGPL-3.0-only**; do not ship or host it unless AGPL is acceptable (`DR/README.md:7-28`, `D/cua-driver/concepts/how-cua-driver-works.mdx:147-214`). We do not need it.
- **Visual binding.** A region click must carry the one-use `capture_id` of its screenshot; reuse is refused (`capture_not_found`), age over 60 s is refused (`capture_expired`).

### 1.4 Typical observe-act loop (verified)

From `SK/SKILL.md:35-43` (the driver's own skill, also embedded in the MCP server instructions and served by `get_guide`):

1. Targeted read: `get_window_state({pid, window_id, query:"Save"})` (about 2K chars; a full snapshot is about 42K).
2. Act by `element_token`; pixels only for canvas surfaces missing from the tree.
3. Act through `run_steps` with `observe:{}` even for one step; put every known action in one call. Use `run_script` when logic is needed between actions.
4. Re-read with `since:"latest"`; to merely look use `include_accessibility_tree:false`.
5. Verify at checkpoints with `verify_state` or a targeted read.

Action ladder when a click does not land: element (AX) -> pixel background -> page (CDP) -> `delivery_mode:"foreground"`. Each response's `escalation` field says which rung is next (`how-cua-driver-works.mdx:42-72`).

The generic skill `vendor/cua/skills/gui-automation/SKILL.md` (a `cua do` CLI recipe: screenshot, click x y, type, verify, then `cua trajectory view`) is the coarse, pixel-only variant. It is for coding agents using the `cua` CLI, not the loop we want.

### 1.5 Token cost notes

- `verified` Tree: default walk caps at **250 nodes** (`max_elements`; `full_output:true` raises to 2,000 on macOS and 5,000 on Linux/Windows); a truncated read says `Tree truncated at max_elements=…`. Targeted read about 2K chars versus about 42K full (`SK/SKILL.md:37`).
- `verified` Screenshot default long edge: **1366 px macOS** (`DR/rust/crates/platform-macos/src/tools/mod.rs:893`), **1568 px Linux** and about 1.15 MP cap (`platform-linux/src/tools/impl_.rs:352`, `SK/LINUX.md:89-96`). Per-call override: `max_image_dimension` (0 = native), `max_dimension` (cheap thumbnail), `screenshot_format:"jpeg"` + `screenshot_quality`, or `screenshot_out_file` to keep base64 out of the context. Global: `set_config {max_image_dimension}`.
- `verified` Linux Space default resolution is **1280x800** (`libs/images/linux/image.json:43`), which is small and cheap.
- `reported` (WebFetch of https://platform.claude.com/docs/en/agent-sdk docs on computer use, summarised): about 1,000 to 1,800 input tokens per screenshot; high-resolution models count roughly `ceil(w/28) * ceil(h/28)` visual tokens, so 1280x800 is about 1,334 tokens. Use as an estimate only.
- `cua mcp`'s `computer_screenshot` caps the long edge at **1200 px** (`D/cua-cli/guides/mcp-server.mdx:93-94`).

---

## 2. Ways to connect, and binding one driver to one Space

### 2.1 Where the driver runs (verified)

- "Cua Driver always runs on the machine whose desktop it drives. To reach a VM or a remote computer, run the driver there" (`D/cua-driver/guides/vms-and-remote.mdx:10-12`). "Inside a Cua Sandbox you do not install Cua Driver: the sandbox's guest service bundles its tools" (`how-cua-driver-works.mdx:101-102`).
- `cua-spacesd` "links the driver core and serves its tools on `/mcp`"; "The driver never injects input itself... delegated to cua-driver (`cua-driver-core` and `platform-{linux,macos,windows}`), linked in-process" (`libs/cua-spacesd/README.md:19-21`, `D/cua-driver/guides/vms-and-remote.mdx` "The driver inside cua-spacesd").
- So: **driver inside the Space, reached through spacesd on port 3211.** One spacesd per Space = one driver runtime per Space.

### 2.2 The options

| Route | Exact form | Notes |
| --- | --- | --- |
| **A. spacesd Streamable-HTTP MCP (recommended)** | URL `http(s)://<spacesd>/mcp`, headers `Authorization: Bearer <env token>`, optional `X-Cua-Agent-Session: <id>` | Same tool registry and dispatch as `cua-driver mcp` (`cua-spacesd-server/src/http/mcp.rs:1-12`). `verified` |
| **B. `cua mcp` stdio** (Spaces + sandbox + computer tools) | `cua mcp --sandbox NAME --permissions computer:all` | Different, coarser tool set (`computer_*`), built-in permission groups. Needs the cua daemon. `verified` (`D/cua-cli/guides/mcp-server.mdx`) |
| **C. Python typed SDK** | `pip install 'cua-sandbox[driver]'`; `async with sb.driver.connect() as driver:` | Uses spacesd `/mcp` (`service="env"`). `verified` (`D/cua-sdk/guides/desktop.mdx:97-111`, `reference/python/interfaces.mdx:667-722`) |
| **D. TypeScript raw spacesd** | `embedded().sandboxes().create(...)` then `await sb.spacesd()`; `env.sh/upload/download/screenshot/click/typeText/press/hotkey/callJson` | No MCP; `callJson("DriverService/CallTool", ...)` reaches any driver tool. `verified` (`D/cua-sdk/guides/own-harness.mdx`) |
| **E. gRPC** | grpc/grpc-web on 3211, `authorization: Bearer <token>`, protos in `libs/cua/proto/cua/env/v1` (`DriverService`, `WindowsService`, `AccessibilityService`, `ProcessService`, ...) | Any language; `grpcurl` works via reflection. `verified` |
| **F. Host driver stdio MCP** | `cua-driver mcp` | Drives the **host** Mac (main screen). On macOS proxies to the `CuaDriver.app` daemon. `verified` |
| **G. Host CLI** | `cua-driver call <tool> '<json>'` | Shell-only agents. `verified` |
| **H. Host SDK in-process** | `import { CuaDriver } from '@trycua/cua-driver'; CuaDriver.create(undefined)` | No daemon; TCC checks run as the importing process; no cursor overlay. `verified` (`SK/EMBEDDING.md:36-60`) |
| **I. Host HTTP MCP** | `CUA_DRIVER_RS_MCP_HTTP_PORT` + `CUA_DRIVER_RS_MCP_HTTP_TOKEN` (32 to 4096 chars), bearer auth | Legacy MCP only; rejects the modern 2026-07-28 metadata. `verified` (`DR/docs/mcp-protocol-and-skills.md` "HTTP limitation") |

Protocol: `cua-driver mcp` speaks modern MCP `2026-07-28` and legacy `2025-06-18` over stdio (`DR/docs/mcp-protocol-and-skills.md:1-12`). The contract manifest says `mcp_protocol_version 2025-06-18`. The Claude Agent SDK handled the stdio case in Cua's own example.

### 2.3 Obtaining a Space's URL and token from Node (verified)

```ts
import { embedded, SandboxCreateOptions } from '@trycua/cua';   // npm i @trycua/cua (native optional pkgs per platform)
const cua = embedded();                                           // SDK runtime in our process, no account needed
const sb = await cua.sandboxes().create(
  SandboxCreateOptions.create({ image: 'ghcr.io/trycua/linux:24.04' })   // macOS: image 'ghcr.io/trycua/macos:26'
);
const cfg = await sb.mcpConfig('env', '/mcp');   // McpConfig {url, headers}; "Embedded: the service route itself (loopback)"
// raw spacesd client for shell/files/screenshot:
const env = await sb.spacesd(undefined);
```
Sources: `D/cua-sdk/guides/own-harness.mdx`, `D/cua-sdk/reference/services.mdx:275-326` (`mcpConfig(service, path)` "for any MCP client"), `D/cua-sdk/reference/python/interfaces.mdx:699-712` (the driver is `service="env"` over `/mcp`), `D/cua-sdk/reference/typescript/index.mdx:22,39-43` (`connectMcp`, `mcpHeaders`). Alternative from a shell: `cua sb info NAME --connection --json` returns `{"spacesd":{"url":...,"token":...}}` (`libs/cua/crates/cua-cli/src/sandbox.rs:2316-2350`; "The token is a secret: anyone with it controls the sandbox"). A sandbox in a stopped state resumes with `cua sb resume`. An already running spacesd elsewhere attaches with `embedded().spacesd(url, token)` or `Sandbox.connect(url=..., token=...)` (`D/cua-sdk/guides/spacesd.mdx`).

`unverified`: the exact JS shape of the `McpConfig` returned by `mcpConfig` (headers may be an array of `{name,value}` objects; the TS docs type it `object[] | Record<string,string>`). Use the helper `mcpHeaders(config)` from `@trycua/cua` to flatten it. Cloud bearers are short-lived; for local Spaces the token is the sandbox env token. Fetch a fresh config per query.

### 2.4 Exact `mcpServers` config for "Cua Driver for Space X"

This is the config Cua itself generates for an agent run (`SpacesdMcp::server_for`: name `cua-driver`, url, headers `Authorization: Bearer <token>` and `X-Cua-Agent-Session: <run id>`, `libs/cua/crates/cua-agents/src/runs.rs:358-401`). In the Claude Agent SDK's shape (`type:"http"`, `url`, `headers`; https://code.claude.com/docs/en/agent-sdk/mcp):

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { mcpHeaders } from '@trycua/cua';

async function spaceDriver(sb, employeeId: string) {
  const cfg = await sb.mcpConfig('env', '/mcp');
  return {
    type: 'http' as const,
    url: cfg.url,                                   // e.g. http://127.0.0.1:<mapped-port>/mcp
    headers: { ...mcpHeaders(cfg), 'X-Cua-Agent-Session': employeeId },  // [A-Za-z0-9._:-]{1,64}
  };
}

const q = query({
  prompt: task,
  options: {
    model: 'claude-sonnet-5-5',
    tools: [],                                   // no host Bash/Read/Write: the employee must not touch the host
    strictMcpConfig: true,                       // ignore user/project MCP config
    mcpServers: { [`cua_${employeeId}`]: await spaceDriver(sb, employeeId) },
    allowedTools: [`mcp__cua_${employeeId}`],    // bare server name enables all its tools (as in claude_agent.ts)
    permissionMode: 'dontAsk',
    maxTurns: 200,
  },
});
```

Notes:
- `verified` `allowedTools` accepts `mcp__<server>__*` and a bare `mcp__<server>` (the Cua example uses the bare name; the Agent SDK docs show the `__*` wildcard). Server-name characters like `.` become `_`. The tool prefix therefore embeds the employee id: choose a stable server name per employee or a fixed name (`cua`) since each employee is a separate `query()`.
- `verified` The `X-Cua-Agent-Session` header makes spacesd key one driver session (and one agent cursor) per employee "however many MCP sessions its harness opens" (`mcp.rs:15-24`). Ending a run: `DELETE /mcp` with that header and no `Mcp-Session-Id` ends the driver session and removes the cursor.
- `verified` In-Space HTTP MCP has no `--socket`; spacesd listens on 3211 with a bearer token; non-loopback bind requires a token (`libs/cua-spacesd/README.md:44-56`).
- For host driver (main screen), the stdio form is, from Cua's example: `{ type:'stdio', command:'cua-driver', args:['mcp'] }` (`DR/examples/agent-sdks/claude_agent.ts:112-124`). For a bounded host daemon: `args:['mcp','--socket','/path/to.sock']` (`D/cua-driver/guides/permissions.mdx:406-415`).

---

## 3. Native computer-use tool versus Cua Driver MCP tools

| Question | Finding |
| --- | --- |
| What does Cua recommend today? | Route Claude through the **MCP tools**. The docs table maps "Claude through Claude Code" and the Claude Agent SDK example default is `--route mcp`; the optional second route is "native" in-process custom tools (observe, click, type, key) built on `CuaDriver.create()`. No statement recommends Anthropic's native `computer` tool for the driver. `verified` (`D/cua-driver/guides/connect-your-agent.mdx:296-297,336-346`, `DR/examples/agent-sdks/README.md:3-12,61-69`) |
| Adapters mapping the native `computer` tool onto a Space? | Only the **Python legacy `cua-agent`** Anthropic loop: maps tool versions `computer_20251124` / `computer_20250124` / `computer_20241022` with beta flags, downscales to 1024x768 by default, and calls a `computer` handler. `verified` (`libs/python/agent/cua_agent/loops/anthropic.py:40-101,1819-1821`). **Not found:** any TypeScript adapter, and any adapter for `computer_toolset_20260801`. |
| What is Anthropic's current tool? | `reported` (WebFetch of https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool, summary only): current toolset `computer_toolset_20260801`, no beta header; Sonnet 5.5 / Opus 5.5 / Haiku 5.5 require it; `computer_20251124` + `computer-use-2025-11-24` for older models; limits 2,576 px long edge for new models; actions include screenshot, `zoom`, clicks, drag, scroll, type, key, `hold_key`, wait. Re-check before building. |
| `cua mcp` computer tools | A native-tool-shaped set: `computer_screenshot` (1200 px cap), `computer_click{x,y,button}`, `computer_double_click`, `computer_move_cursor`, `computer_mouse_down/up`, `computer_type`, `computer_key(_down/_up)`, `computer_hotkey`, `computer_scroll`, `computer_drag`, `computer_clipboard_get/set`, `computer_window_*`, `computer_launch`, `computer_get_accessibility_tree`, `computer_accessibility_act`, `computer_shell`, `computer_file_*`. Coordinates are in the last screenshot's pixel space. `verified` (`D/cua-cli/reference/mcp-tools.mdx`) |

Trade-offs (the first is `verified`, the rest `unverified` engineering judgement):
- **Accuracy**: tree-first targeting with element tokens avoids pixel guessing and gives self-verification (`effect: confirmed`); the native tool is pixel-only, so it depends on scaling math. The driver docs themselves say pixels are for surfaces missing from the tree.
- **Tokens**: a diff read or `run_steps observe:{}` costs about 2K chars versus a screenshot per step for the native tool; batching (`run_steps`, up to 64 steps) cuts round trips a lot.
- **Background**: only the driver can act on a window that is not frontmost, without moving the pointer. The native tool always drives the foreground screen. Irrelevant inside a Space (nobody else uses it) but decisive on the host.
- **Tool count and context**: 66 tools is heavy; the Agent SDK's MCP tool search (on by default) defers schemas, and our harness can also hide tools (section 5).
- Conclusion: use Cua's MCP tools. A hybrid is possible (pass `computer_toolset_20260801` only if we move off the Agent SDK to the raw Messages API); not worth it for the hackathon.

---

## 4. The host machine (the user's real desktop)

### 4.1 Permissions and who clicks (verified)

- macOS needs **Accessibility** and **Screen Recording** for the identity `com.trycua.driver` (`CuaDriver.app`), granted by a person in System Settings. Without Screen Recording, `get_window_state` returns the tree only (`D/cua-driver/guides/troubleshoot.mdx` table; `SK/MACOS.md:252-287`).
- Tahoe adds a separate direct screen-capture consent, and **Automation** (Apple Events to System Events/Finder/browsers) is prompted on first use of scripted actions (background Save, Finder rename, Safari select, browser JS) (`D/cua-driver/guides/vms-and-remote.mdx` "macOS Lume VM": "Approve three kinds of prompt"; `SK/MACOS.md:96-112`). `cua-driver serve --no-automation-prompts` refuses scripting actions without consent instead of prompting (`automation_consent_required`).
- Who clicks: the user, once. `cua-driver permissions grant` launches the daemon and drives the prompts. MDM (PPPC profile) can pre-approve Accessibility on managed Macs. Approving the prompts on an agent's behalf is allowed only on a host whose owner explicitly authorized it (`SK/MACOS.md:288-575`). The driver refuses to type into macOS security/consent prompts (`security_prompt_protected`) in `standard` and `bounded` modes (`D/cua-driver/guides/permissions.mdx:285-290`).
- Identity: grants belong to `CuaDriver.app` (or to an **embedding host app** whose child the driver is), not to whichever terminal spawned it. A raw `cua-driver serve` outside the app is unsupported (`DR/README.md:136-145`). Signed updates keep grants; an ad-hoc or local build asks again (`SK/MACOS.md:575-585`).
- Cua Spaces for Mac (macOS 26 or later) is the vendor's own app that carries and supervises the driver (`DR/README.md:31-41`). We are building our own app, so we install `CuaDriver.app` via the installer (`curl -fsSL https://cua.ai/driver/install.sh | bash`, user approval required) or embed (below).

### 4.2 Background operation: what works and what does not (verified)

Works without moving the pointer, raising the window or switching app: element actions via `AXPerformAction`; pixel clicks via scoped CoreGraphics/SkyLight events; ScreenCaptureKit per-window capture; Chromium over CDP; menus via `invoke_menu`; windows on other Spaces for AppKit apps (`how-cua-driver-works.mdx:42-86`, `D/cua-driver/concepts/platform-support.mdx:478-488`).

Does not work or needs foreground (`troubleshoot.mdx` "Known limits", `platform-support.mdx`):
- Canvas apps and games (Blender, Unity, WebGL-heavy Electron); pixel clicks silently no-op -> `delivery_mode:"foreground"`.
- Pixel right-click on Chromium web content becomes a left click (use element token or foreground).
- Off-Space SwiftUI windows lose their tree.
- Keyboard commits (Return/Space/Tab) to minimized windows are dropped; use `set_value`.
- Desktop-target input is foreground-only; foreground "can change focus, workspace, or the physical cursor; restoration is best-effort" (`SK/RUNTIME.md` "Foreground boundary").
- Some key equivalents (Cmd+L, Cmd+Shift+G, tab-switch keys) raise the app even when posted to a background pid.
- Screen locked: `degraded_reason: screen_locked`; the Mac must be awake and unlocked.
- Opening apps via `open`/AppleScript activate; the driver's `launch_app` has a focus-restore guard.
- Many agents share one physical keyboard and focus; "native input is admitted one action at a time" (`how-cua-driver-works.mdx:133-134`).

### 4.3 Scoping the driver to apps or windows (verified)

- A **capability manifest** (v3 YAML, deny-by-default, narrow-only) can list tools and per-resource grants: `resources.apps[{bundle_id | executable, launch, windows: all, terminate: deny|driver_launched|any}]`, `resources.files.read/write[{dir, recursive}]`, `resources.desktop{display: true|false}` (full-display capture and screen-coordinate input), `resources.browser{origins, profiles}`, plus `expires_after` and `idle_timeout` (`D/cua-driver/guides/permissions.mdx:310-415`; schema in `DR/rust/crates/cua-driver-core/src/session_manifest.rs`, which also has `desktop.windows[{pid,window_id}]`).
- A call outside the manifest returns `bounded_resource_outside_manifest`; an unlisted tool returns `permission_denied` (permissions.mdx:401-404).
- The mode and manifest "belong to the process that owns the runtime and are fixed at launch"; a running daemon cannot be reconfigured (`DR/README.md:76-81`).
- A manifest listing `browser.origins` cannot coexist with generic `click`/`get_window_state` in the same runtime (the runtime refuses to start).

### 4.4 Implementing "grant my main screen for now, then revoke"

Three mechanisms, ordered by how much of it is verified.

**(1) Harness-level grant (recommended; simplest).** Each employee `query()` starts with only its Space driver. To grant: `await q.setMcpServers({ ...current, host: {type:'stdio', command:'cua-driver', args:['mcp','--socket', hostSock]} })` and widen `allowedTools` / `canUseTool` to `mcp__host`. To revoke: `await q.toggleMcpServer('host', false)` (disconnects and removes its tools) and `cua-driver revoke --session <label>` (ends the session and its grants; `--all` suspends the whole runtime until restart). `query.setMcpServers`, `toggleMcpServer`, `setPermissionMode`, `interrupt` and `streamInput` exist in the TS SDK (`verified`, https://code.claude.com/docs/en/agent-sdk/typescript). Revocation removes the model's access immediately; running steps finish unless `interrupt()` is called. Show a persistent "employee has your screen" indicator in our UI (the driver draws a visible agent cursor with a session badge on the host; `verified`).

**(2) Host daemon per grant, bounded.** Start a dedicated daemon only while the grant lasts, for example `cua-driver serve --socket /tmp/agentmgr-<emp>.sock --permission-mode bounded --capability-manifest grant.yaml --approve-capability-manifest` (manifest: `allow.tools` = observe plus input tools, `expires_after: 1h`, `idle_timeout: 10m`, `desktop.display: true` or a named app list), connect with `cua-driver mcp --socket /tmp/agentmgr-<emp>.sock`, and `cua-driver stop --socket ...` or `cua-driver revoke --all` at the end. The manifest expiry auto-revokes. On macOS the daemon must carry the permissions identity: start the installed app by exact path (`open -n -g /Applications/CuaDriver.app --args serve ...`, permissions.mdx:268-272) or as a child of our own signed app with `--embedded`. `verified` for the flags; `unverified` that several concurrent app-instances with different sockets work on one Mac.

**(3) Embedded host (production-grade).** Our Mac app spawns `CUA_DRIVER_EMBEDDED=1 cua-driver serve --socket <private>` as a direct child (not via `open`), so the driver inherits **our app's** Accessibility and Screen Recording grants; the user sees one set of prompts, naming our app (`SK/EMBEDDING.md:62-110`; reference host in `DR/rust/examples/embedded-host-macos/`). Our app should request the permissions itself (`AXIsProcessTrustedWithOptions`, `CGRequestScreenCaptureAccess`). In Node/Electron the in-process SDK `CuaDriver.create()` does the same but has no agent-cursor overlay (`facility_unavailable`). Cost: needs a stable code-signed identity or the user re-grants.

**Cua's own account-bound grant (not recommended for the hackathon).** In Cua Spaces, `computer_access_grant{agent, machine, expires_in_secs}` (asks for Touch ID or passphrase), `computer_access_revoke` (takes effect on the agent's next call) and `computer_access_list{audit}` give a time-limited, revocable, audited per-agent grant of the user's computer exposed as `relay:<computer-id>` via `cua host setup` and "Let other computers control this desktop" (`D/spaces/reference/agents.mdx:858-940`, `D/spaces/concepts/machines-and-spaces.mdx`). It is tied to the Cua Spaces app, the cua.ai account sign-in, and "persistent agents", so it does not fit an app that uses our own harness. `cua do-host-consent` / `cua do switch host` is only a one-time consent file (`libs/cua/crates/cua-cli/src/do_cmd.rs:468-530`); it has no scope or expiry.

---

## 5. Permission and safety controls

### 5.1 What the driver offers (verified)

Source: `D/cua-driver/guides/permissions.mdx`, `DR/README.md:76-100`, `SK/RUNTIME.md` ("Keep authorization separate from sessions").

| Control | Detail |
| --- | --- |
| Permission modes | `standard` (default: observe, click, type, scroll, drag, isolated browser, validated file transfer all run without prompts; foreign `kill_app`, OS permission prompts, legacy page mutations denied; existing-profile browser needs `--grant existing-profile`), `bounded` (manifest required; in-scope silent, everything else denied; needs `expires_after` and `idle_timeout`), `unrestricted` (needs `--dangerously-bypass-approvals`). Env: `CUA_DRIVER_PERMISSION_MODE`, `CUA_DRIVER_CAPABILITY_MANIFEST_FILE`, `CUA_DRIVER_CAPABILITY_MANIFEST_APPROVED=1`, `CUA_DRIVER_DANGEROUSLY_BYPASS_APPROVALS=1`. |
| Layers (each can only narrow) | hard invariants; built-in tool/risk map; managed policy `CUA_DRIVER_MANAGED_POLICY_FILE`; user policy `CUA_DRIVER_POLICY_FILE`; mode; capability manifest; launch grant or host decision. |
| Allow/deny lists | Manifest `allow.tools`; policy YAML `allow.tools`, `allow.rules` with per-argument constraints (`min`, `max`, `max_length`, `pattern` RE2, `allowed`), `deny.tools`; or Rego (`data.cua.policy.allow`). Order: deny -> allow -> rules -> deny. Example: restrict `launch_app.bundle_id` to Safari/Chrome; cap `type_text` length. |
| Per-app / per-file / per-origin scoping | Manifest `resources` (section 4.3). |
| Read-only / observe-only | Not a named mode. Achieve with a manifest or policy that allows only read tools (`get_window_state`, `get_desktop_state`, `list_*`, `zoom`, `verify_state`). `cua mcp --permissions computer:readonly` gives screenshot-only. |
| Confirmation hooks | Cua draws **no** modal. An embedding app may install `DriverAuthorizationHost` (decides residual `standard` boundaries; without it returns `authorization_required`) and `DriverActivityObserver` (content-free action events) in the **in-process SDK** only. |
| Revoke | `cua-driver revoke --session X` or `--all` (then `authorization_suspended` until restart). |
| Security-prompt guard | Input aimed at an admin-password/privacy/Gatekeeper dialog refused (`security_prompt_protected`) except in `unrestricted`. |
| Dry-run | **Not found** for actions (only `cua-driver connect --dry-run`). |
| Caveats | Policies do not filter responses, rate-limit or authenticate callers; same-user code can bypass them; a `browser_navigate` host allowlist cannot stop a post-click redirect (permissions.mdx:501-515). |

`cua mcp --permissions` (Spaces/sandbox/computer groups; empty list grants everything; typos fail closed): `computer:readonly` (screenshot), `computer:all`, `sandbox:readonly`, `spaces:readonly`, etc.; `computer:shell`, `computer:file`, `spaces:space_bash`, `spaces:teleport_app` flagged as acting with the user's authority (`D/cua-cli/guides/mcp-server.mdx:58-96`).

`unverified`: how to set the permission mode / manifest / policy for the **in-guest** spacesd driver. The driver core reads `CUA_DRIVER_PERMISSION_MODE`, `CUA_DRIVER_POLICY_FILE`, `CUA_DRIVER_CAPABILITY_MANIFEST_FILE` from the process environment at first use (`cua-driver-core/src/authorization.rs:1339-1346`), and spacesd links that core, so setting them in spacesd's environment (Linux image: `EnvironmentFile=/etc/cua/spacesd.env`, `D/cua-sdk/guides/spacesd.mdx`; or `SandboxCreateOptions` env) likely works. The Python docs say a Space driver connection runs with a "launcher-selected permission mode (Standard by default)" and "Remote clients cannot select its authority" (`reference/python/interfaces.mdx:667-680`). Test before relying on it.

### 5.2 What to enforce in our own harness (recommended primary layer)

The Claude Agent SDK evaluates, in order: hooks -> deny rules -> ask rules -> permission mode -> allow rules -> `canUseTool` (https://code.claude.com/docs/en/agent-sdk/permissions, `verified`). Practical rules:
- `tools: []` and `strictMcpConfig: true` so the employee only has our MCP servers (no host Bash).
- Use **`disallowedTools`** with `mcp__<server>__<tool>` entries (applies in every mode, including `bypassPermissions`) to remove destructive tools for low-trust levels; `allowedTools` bare names auto-approve **and skip `canUseTool`**.
- To gate individual calls (for example `kill_app`, `hotkey` combos, `type_text` containing secrets, any call on a window whose app is not in the allow-list), leave those tools **out of `allowedTools`** and handle them in `canUseTool`, which can pause the employee and raise a notification to the user ("approval request" in the chat panel). Use a `PreToolUse` hook if you also want to inspect auto-approved calls.
- `permissionMode: 'dontAsk'` turns any would-be prompt into a denial (headless safe default); `default` + `canUseTool` gives human-in-the-loop.
- `maxTurns` and `maxBudgetUsd` bound a runaway long-horizon employee.
- Use `setMcpServers` / `toggleMcpServer` / `setPermissionMode` to change levels live without restarting the employee.
- App-level scoping in the harness: on every `get_window_state` / action, `canUseTool` sees `target.pid/window_id` or `app`; map to `list_windows` and refuse apps outside the employee's allow-list (the driver's manifest does this natively only where we can set it).
- Shell and file tools are **ours**: the Agent SDK's built-in `Bash` would run on the host. Provide `space_shell`, `space_read_file`, `space_write_file` as `createSdkMcpServer` tools that call `env.sh(cmd, timeoutMs)` / `env.upload` / `env.download` on that employee's Space (section 8).

---

## 6. Concurrency

Verified facts:
- **Different Spaces are fully independent**: each has its own spacesd, driver runtime, display, keyboard, snapshot caches and cursor. N employees = N Spaces = N driver runtimes (`libs/cua-spacesd/README.md:19-21`).
- Within one runtime: "Each MCP connection or SDK runtime gets one implicit session... cleaned up when the connection closes, on `end_session`, or after five idle minutes." Named sessions via the `session` label; "a label is not a credential"; "All sessions still share one screen, keyboard, and focus, and native input is admitted one action at a time" (`how-cua-driver-works.mdx:122-134`).
- Two sessions on one desktop: distinct cursors do not isolate focus, keyboard, app state or snapshot caches; "Keep one controller per shared desktop" (`SK/SKILL.md` rule 6, `SK/RUNTIME.md:55`). To avoid fighting over single-instance apps use `launch_app{creates_new_application_instance:true}` (macOS) and verify distinct pids/windows.
- Element tokens and snapshots are scoped to (pid, window_id) and replaced by each new read; stale tokens are refused (`stale_element_token`), not mis-applied.
- spacesd `/mcp`: sessions keyed by `Mcp-Session-Id`, overridden by `X-Cua-Agent-Session`, so reconnects of the same employee reuse one driver session and cursor (`mcp.rs:15-66`).
- Windows/Linux Wayland caveats are irrelevant to our images (Xvfb X11).

Our design rule: **one Space per employee, one `X-Cua-Agent-Session` per employee, and never two simultaneous controllers on the same desktop** (including main screen: only one employee holds the host grant at a time; enforce with a mutex in our app). `unverified`: there is no cross-session lock in the driver; locking is our job.

---

## 7. macOS Space versus Linux Space

| Aspect | Linux Space (`ghcr.io/trycua/linux:24.04`) | macOS Space (`ghcr.io/trycua/macos:26`, Lume VM) |
| --- | --- | --- |
| Host requirement | Docker/Podman or Colima (gVisor if installed, else runc); QEMU for `kind=vm`; `microvm` via `vz`/`containerization` on Mac | Apple silicon only; Lume (SDK starts `lume serve`) |
| Concurrency | Many containers; limited by RAM/CPU | **Max 2 macOS VMs per Mac** (`vm_limit` / `limit_exceeded`) |
| Display | XFCE on Xvfb `:1`, 1280x800, AT-SPI, PipeWire audio, Chromium (Firefox in `full`) | Native Tahoe desktop, Safari + Chrome, autologin user `lume`, SIP off |
| Driver backend | AT-SPI + X11 (XTEST); "Supported with toolkit limits": toolkits that reject synthetic background events refuse | Accessibility API + CoreGraphics/SkyLight; best-tested path ("Supported") |
| TCC | Not applicable | Pre-seeded in the image (SIP-off base seeds TCC; spacesd at login) `verified` (`libs/images/macos/image.json`, `build.sh:266-268`); `unverified` in practice for a fresh pull |
| Gaps | AT-SPI trees can be empty for some apps (`degraded:true` -> act by pixel); large apps may time out the walk (`timeout_ms` default 1000); Wayland not used | Off-Space SwiftUI trees; canvas apps; Chrome pixel right-click |
| Extras | Browser tools proven on Chrome/Edge on X11 except trusted pointer input (`browser_input_trust_unavailable`); good for web work | macOS-native apps (Keynote, Xcode `-xcode` tier unpublished) |
| Boot/size | Fast, small | 150 GB sparse disk image, slow first pull/boot `verified` (`vms-and-remote.mdx` Lume section) |

**Demo recommendation (`unverified` judgement from the evidence): Linux Spaces for all employees.** They scale past two employees, boot fast, and cost nothing; their weaker spots (AT-SPI gaps, Chromium trusted pointer) are manageable by pixel fallback and `foreground` (safe in a Space since nobody else uses it: `D/cua-sdk/guides/desktop.mdx` browser section). Keep at most one or two macOS Spaces for a "Mac-only app" showcase.

---

## 8. Beyond GUI: shell, process and file tools

- `verified` **The driver has none.** The driver's 66 tools are GUI/browser/clipboard only (plus `clipboard_write` of files and `browser_download`/`browser_set_input_files` to approved paths).
- `verified` **spacesd has them** (gRPC services `ProcessService`, `FilesystemService`; TS typed client: `env.sh(cmd, timeoutMs)`, `env.upload(path, bytes)`, `env.download(path)`, `env.typeText`, `env.click`, `env.screenshot`, `env.hotkey`, `env.press`, `env.callJson(...)`) (`D/cua-sdk/guides/own-harness.mdx`, `D/cua-sdk/reference/spacesd/{index,files,shell,computer}.mdx`, `libs/cua-spacesd/README.md:5-17`). Signed-URL `/files` upload/download, PTY terminals (`sb.terminal`), tunnels.
- `verified` Ready-made MCP exposure via `cua mcp`/`cua daemon mcp`: `computer_shell{command}` (sh -c, 120 s), `computer_file_read/write/list`, `space_bash{space,command,timeout}`, `space_job{action: start|status|logs|cancel|list, command, notify, until...}` (background jobs that survive disconnects and can wake the agent), `space_write`, `upload`, `send_file`, `download`, `space_service`, `call_tool`/`list_tools` (reach the driver registry in the Space), browser-in-sandbox helpers `sandbox_create{browser:true}`, `sandbox_open_browser` (`D/cua-cli/reference/mcp-tools.mdx`, `D/spaces/reference/spaces.mdx`).
- `verified` Agents can also run **inside** a Space (`agent_start{space, agent: "claude-code"|"openai-codex", prompt}`; every run gets the Space's own Cua Driver tools as an MCP server automatically) (`D/spaces/guides/agents-in-a-space.mdx:193-203`). That is the Cua-native "Computer-Use 2.0" path; it requires the Cua daemon/Spaces app and stores keys in the macOS Keychain. Our app prefers running the loop on the host with the Agent SDK and driving the Space remotely.
- **Mixed code + CLI + GUI for an employee = Space driver MCP + our `space_shell`/file tools** in the same `mcpServers`:

```ts
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
const env = await sb.spacesd(undefined);
const spaceTools = createSdkMcpServer({ name: 'space', tools: [
  tool('shell', 'Run a shell command inside this employee\'s desktop machine',
       { command: z.string(), timeout_ms: z.number().optional() },
       async ({ command, timeout_ms }) => {
         const r = await env.sh(command, timeout_ms ?? 60_000);
         const dec = (b: ArrayBuffer) => new TextDecoder().decode(b);
         return { content: [{ type: 'text', text: `${dec(r.stdout)}\n[stderr]${dec(r.stderr)}\n[exit ${JSON.stringify(r.exit)}]` }] };
       }),
  // read_file -> env.download, write_file -> env.upload, same pattern
]});
```
(`createSdkMcpServer` / `tool` signatures: `verified`, https://code.claude.com/docs/en/agent-sdk/typescript. The `env.sh` result fields `stdout`, `stderr`, `exit.success` are from `own-harness.mdx`.)

Note: "Agents that share one Space share its user account. Give an agent its own Space when it must not see another agent's files" (`D/spaces/guides/agent-memory-and-identity.mdx`).

---

## 9. Ready-made integrations to copy

| Item | Where | Use |
| --- | --- | --- |
| Claude Agent SDK + Cua Driver (TS and Python, MCP and native routes) | `DR/examples/agent-sdks/claude_agent.ts`, `claude_agent.py`, `native-tools.ts`, README | `mcpServers: {cua_driver:{type:'stdio',command:'cua-driver',args:['mcp']}}`, `tools: []`, `strictMcpConfig: true`, `allowedTools:['mcp__cua_driver']`, `permissionMode:'dontAsk'`, `maxTurns:40`; task prompt template with the exact-target and verify rules. They "remove interactive approval prompts: run only trusted tasks". `verified` |
| Per-run Space driver MCP config | `libs/cua/crates/cua-agents/src/runs.rs:358-401` (`SpacesdMcp::server_for`), runner `libs/cua/crates/cua-agents/runner/acp-runner.mjs` | The exact `{name:"cua-driver", url, headers:{Authorization, X-Cua-Agent-Session}}` shape. `verified` |
| Claude Code registration | `claude mcp add --transport stdio cua-driver -- cua-driver mcp` (`DR/README.md:130`); `cua-driver connect --client claude`; `cua-driver mcp-config --client claude` prints `claude mcp add-json --scope user cua-driver '{…}'` (`D/cua-driver/guides/connect-your-agent.mdx:243-266`) | For our own testing in Claude Code. `verified` |
| Cua Spaces tools in Claude Code | `claude mcp add cua -- cua daemon mcp`; `cua connect setup --agents claude-code --yes` | Spaces/sandbox tools. `verified` |
| Skills | `cua-driver skills install` (to `~/.claude/skills`), served as MCP resources `skill://cua-driver/SKILL.md` and by the `get_guide` tool; `vendor/cua/skills/gui-automation` | Use `get_guide` plus our own short system prompt. Claude Code does not auto-activate the MCP-served skill (verified client behaviour, `DR/docs/mcp-protocol-and-skills.md:75-90`). |
| Other harness configs | Muse Code (`mcp_servers` with `transport: stdio`), Codex, Cursor, Hermes, OpenClaw, Gemini | Listed in `connect-your-agent.mdx` and `DR/README.md:95-120`. The brief mentions "Meta Muse"; Muse Code is a real option with an official Cua entry. |
| Plugin | **Not found**: no Claude Code plugin package in the repo; integration is via `connect`/`mcp-config` and the skill. |

---

## 10. Recommended tool set for an AgentManager employee

### 10.1 Wiring (one Space per employee)

```text
AgentManager (Node, host)
  ├─ Employee A: query() ── mcpServers:
  │     • cua_driver  = {type:'http', url:<spacesd A>/mcp, headers:{Bearer tokA, X-Cua-Agent-Session:'emp-A'}}
  │     • space       = createSdkMcpServer: shell, read_file, write_file (env A via sb.spacesd())
  │     • (optional, only while granted) host = {type:'stdio', command:'cua-driver', args:['mcp','--socket', hostSock]}
  └─ Employee B: same, bound to Space B (own token, own X-Cua-Agent-Session)
```
- Creation: `embedded().sandboxes().create(SandboxCreateOptions.create({image:'ghcr.io/trycua/linux:24.04'}))` (add `name`; the sandbox keeps running until deleted). Keep the `sb` handles (or `Sandbox.connect("name")`) in our supervisor; fetch `mcpConfig` fresh per `query()`.
- Live view for the chat panel: `sb.viewer_url(options)` returns a ticketed `/viewer/` link served by spacesd itself (H.264 over WebCodecs, input, view-only option `view_only`, `ttl_seconds`) (`D/cua-sdk/guides/desktop.mdx` "Browser view"; `verified`). For list thumbnails: `Space.thumbnail` (cached JPEG; note it is in the Spaces module that needs the cua daemon) or poll `env.screenshot()` (`verified` `own-harness.mdx`). The viewer ticket's fragment authorizes only viewer calls.
- Tell the model once: the minimal rules from `SK/SKILL.md` (observe narrowly, act by `element_token`, batch with `run_steps observe:{}`, verify at checkpoints, escalate in order, never replay an unknown outcome).

### 10.2 Tool groups to expose (names as exposed by the server; Agent SDK prefix `mcp__<server>__`)

| Group | Tools | Bound to |
| --- | --- | --- |
| Observe (always) | `get_window_state`, `get_desktop_state`, `list_windows`, `list_apps`, `zoom`, `verify_state`, `get_screen_size`, `get_guide` | the employee's Space driver |
| Act (core) | `run_steps`, `click`, `double_click`, `right_click`, `type_text`, `press_key`, `hotkey`, `scroll`, `drag`, `set_value`, `invoke_menu`, `launch_app` | Space driver |
| Browser | `get_browser_state`, `browser_prepare`, `browser_navigate`, `browser_click`, `browser_type`, `browser_select`, `browser_pointer`, `browser_dialog` | Space driver (Linux image ships Chromium) |
| Higher risk | `run_script`, `kill_app`, `clipboard_write`, `clipboard_read`, `browser_set_input_files`, `browser_download`, `bring_to_front`, `set_window_frame` | Space driver, gated by level |
| Admin (never to the model) | `set_config`, `install_extension`, `check_for_update`, `start/stop_recording`, `replay_trajectory`, `install_ffmpeg`, `debug_window_info`, cursor-theme tools (our app calls cursor/recording itself if wanted) | not exposed |
| Code and files | `space.shell`, `space.read_file`, `space.write_file` (our SDK MCP server over spacesd) | the employee's Space only |
| Main screen (granted) | `host` driver tools with the same Observe/Act split, plus a bounded manifest | one employee at a time, time-boxed |

### 10.3 Three permission levels mapped to concrete rules

All three: `tools: []`, `strictMcpConfig: true`, `maxTurns`/`maxBudgetUsd` bounded, driver MCP bound to the employee's own Space. Levels differ in what is auto-approved, what goes to `canUseTool`, and what is removed. `unverified`: this mapping is a proposal; each rule uses mechanisms verified in sections 5.1 and 5.2.

| | **Supervised** | **Standard** | **Autonomous** |
| --- | --- | --- | --- |
| Intent | Asks the user for anything with side effects (new hire, high-risk or unfamiliar role) | Normal employee; asks only for risky things | Trusted employee; asks almost never (for example a web developer sandbox) |
| `allowedTools` (auto-approved) | Observe group only: `get_window_state`, `get_desktop_state`, `list_windows`, `list_apps`, `zoom`, `verify_state`, `get_guide`, `space.read_file` | Observe + Act core + Browser + `space.shell`, `space.read_file`, `space.write_file` | Everything in Observe, Act, Browser, Higher risk except the denied list below, plus `space.*` |
| `canUseTool` (ask the user, with a chat notification) | every Act tool, `launch_app`, `space.shell`, `space.write_file` (each call shows a one-line description, with "Allow once" / "Allow for this task") | Higher-risk group: `kill_app`, `clipboard_write`, `browser_download`, `browser_set_input_files`, `run_script`; any `type_text` or `space.shell` call matching secret/payment/credential patterns; any host-driver call | host-driver calls only (and only when a grant exists) |
| `disallowedTools` | all admin tools | all admin tools; `hotkey` only if desired | admin tools only |
| `permissionMode` | `default` (callback decides) | `default` (callback decides) | `dontAsk` + the allow list above (no prompts) |
| Driver-side (if settable in guest, section 5.1) | policy deny `kill_app`, `set_config` | `standard` mode + `launch_app` allowed bundle ids; `type_text.max_length` | `standard` mode only |
| Main screen | never | by request only; time-boxed, observe + act via `canUseTool` per call, `desktop.display` false (named apps only) | by request; time-boxed manifest (`expires_after: 1h`), observe + act without per-call prompts |
| Budget/turns | low | medium | high |

Mapping onto driver annotations: read-only tools (`read_only: true`) are Supervised's auto-approve set; `destructive: true` tools (`click`, `drag`, `type_text`, `press_key`, `hotkey`, `invoke_menu`, `clipboard_write`) are what Standard/Supervised intercept.

"Marketing asks less, web developer needs more" (brief item 8): feasible as above. Marketing = Supervised or Standard (browser-heavy; interception on submit/send, download and upload tools, clipboard); web developer = Autonomous in its own Linux Space (shell and file tools auto-approved, no network restriction available at the driver level; network egress limits are a Cua Spaces feature, `network_set`, outside this topic: **not verified here**).

### 10.4 Main-screen grant, step by step (proposed)

1. One-time setup by the user: install `CuaDriver.app` (or sign our app for embedding) and approve Accessibility and Screen Recording (and Automation if prompted). Run `cua-driver permissions status --json` to confirm (read-only).
2. User clicks "Give Ava my screen for 30 minutes" in our UI. Our app: (a) takes the global host-grant mutex (one holder), (b) writes a manifest (`allow.tools` = Observe + Act subset, `expires_after: 30m`, `idle_timeout: 10m`, `desktop.display: true` or `resources.apps[...]`), (c) starts or selects the host daemon with that mode, (d) calls `q.setMcpServers({... host: {type:'stdio', command:'cua-driver', args:['mcp','--socket', sock]}})`, (e) widens `allowedTools`/`canUseTool` per her level, (f) shows a persistent banner and the live host screen.
3. Revoke (button, expiry, or employee `end_task`): `q.toggleMcpServer('host', false)`, `q.interrupt()` if mid-step, `cua-driver revoke --session emp-A` (or `stop` the grant daemon), release the mutex. The employee's own Space driver is untouched, so it simply continues on its own desktop ("switch back to its own desktop").
4. Prefer element-token background actions for the host (the user keeps working); allow `delivery_mode:"foreground"` and `desktop` targets only when the grant says so (they move focus and the real cursor).

---

## 11. Risks and unknowns

Top risks:
1. **2-macOS-VM cap and heavy macOS image** (150 GB disk, Apple silicon, Lume). More than two macOS employees is impossible on one Mac. Mitigation: Linux Spaces by default. `verified`
2. **Per-Space driver permission mode is not settable through a documented route** (and Python docs say it is "launcher-selected, Standard by default"). All permission levels must therefore be enforced in our harness, and a model with a Space token can do anything the Space allows. Also the env token "grants full control of the machine", so it must never reach the model or logs. `verified` (token) / `unverified` (settability)
3. **Host screen control needs one-time manual OS permissions and a stable TCC identity** (`CuaDriver.app` or our signed app); an ad-hoc local build re-prompts; Tahoe adds a separate direct-capture prompt; Automation prompts may recur. Background input has real holes (canvas apps, Chromium right-click, minimized windows, locked screen). Multi-daemon-per-grant on one Mac is unproven. `verified` / `unverified`
4. **Docs and contract drift**: contract manifest (27 tools, experimental) differs from the MCP docs (66 tools); policy docs name tools that do not exist; several tools are deprecated after 26 Nov 2026 (`get_accessibility_tree`, `replay_trajectory`, `install_ffmpeg`, history). Always read `tools/list` from the live server and pin the Cua version. Vendor docs also changed names between pages (generator artifacts in the SDK reference).
5. **Node SDK maturity and runtime prerequisites**: `@trycua/cua` ships per-platform native packages; local Linux Spaces need Docker/Colima (or QEMU); `cua daemon`, the viewer's standalone mode, thumbnails, `computer_access_*`, persistent agents, and `agent_start` belong to the Cua Spaces app/daemon (Cua Spaces for Mac requires macOS 26; the app and viewer are source-available under FSL-1.1-MIT). Whether the embedded SDK alone (no daemon) is enough for `viewer_url` and the live view in an Electron/Tauri window is `unverified`. Licences: `cua-spacesd` is FSL-1.1-MIT, the driver MIT, **`cua-perception` AGPL-3.0**.

Other risks and unknowns:
- Exact JS return shape of `sb.mcpConfig('env','/mcp')` and whether the service name is `env` for TS embedded sandboxes (Python docs say `service="env"`). `unverified`
- Idle TTL: a driver session expires after 5 idle minutes and tokens/snapshots die with it; long-horizon employees must re-observe after any pause. Human approval waits can outlast the TTL (`SK/RUNTIME.md:39`). Also MCP tool output is saved to a file above 25,000 tokens or 50,000 chars in the Agent SDK; keep trees bounded (`max_elements`, `query`) (`reported` from the Agent SDK MCP page).
- First turn waits up to `MCP_TIMEOUT` (30 s default) for an HTTP MCP server without a cached tool list; a Space that is still booting will fail the connect. Wait for `GetCapabilities`/`/health` (204) first.
- Linux a11y quality varies by app (empty AT-SPI tree -> `degraded:true`); first walk of large apps can truncate at the 1 s `timeout_ms`.
- Anthropic native computer tool changes (`computer_toolset_20260801`) are `reported` only from a summarised fetch; re-verify before any switch.
- Network egress control, secrets (Keyvault, `request_site_login`), browser-session teleport, and sharing are Cua Spaces features I did not research (outside this topic).
- Not found: dry-run for driver actions; TypeScript adapter for Anthropic's `computer` tool; a Claude Code plugin package for Cua; any per-window grant flow that can be changed at runtime without restarting the runtime.

## Open questions (for the orchestrator or the next research pass)

1. Can we pass `CUA_DRIVER_PERMISSION_MODE` / manifest into a Linux Space's spacesd (container env at `sandboxes().create` or `/etc/cua/spacesd.env`)? Needs a 10-minute spike on a real Space.
2. Does the embedded `@trycua/cua` runtime work without the Cua Spaces app (daemon) for create, `viewer_url`, `mcpConfig` and `thumbnail`? Test on the demo Mac.
3. What is the app shell (Electron, Tauri, native Swift)? It decides the embedding route and whether our app can own the TCC grants (section 4.4, option 3).
4. Which employees (if any) are macOS Spaces for the demo, and is the demo Mac Apple silicon on macOS 26?
5. Do we want the model to see raw screenshots at 1280x800, or request `max_image_dimension` ~1024 to cut tokens? Measure on the real model (Sonnet 5.5).
6. Docker/Colima availability on the demo Mac, and whether gVisor (`runsc`) is installed (`cua runtime doctor`).

## Sources

Local (all under `vendor/cua`, commit 0147fb8d): `libs/cua-driver/README.md`, `libs/cua-driver/docs/mcp-protocol-and-skills.md`, `libs/cua-driver/contract/manifest.json`, `libs/cua-driver/rust/Skills/cua-driver/{SKILL,WORKFLOW,RUNTIME,MACOS,LINUX,EMBEDDING}.md`, `libs/cua-driver/examples/agent-sdks/*`, `libs/cua-driver/rust/crates/{cua-driver-core/src/{authorization,session_manifest}.rs,platform-macos/src/tools/mod.rs,platform-linux/src/tools/impl_.rs}`, `libs/cua-spacesd/README.md`, `libs/cua-spacesd/crates/cua-spacesd-server/{README.md,src/http/mcp.rs}`, `libs/cua/crates/cua-agents/src/runs.rs`, `libs/cua/crates/cua-cli/src/{sandbox.rs,do_cmd.rs}`, `libs/images/{linux,macos}/image.json`, `libs/python/agent/cua_agent/loops/anthropic.py`, `skills/gui-automation/SKILL.md`, and docs under `docs/content/docs/{cua-driver,cua-sdk,cua-cli,spaces,lume}/` (paths cited inline).
Web (fetched 2026-11-14): https://cua.ai/docs/cua-driver/guides/connect-your-agent (matches the repo page), https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (summarised, `reported`), https://code.claude.com/docs/en/agent-sdk/mcp, https://code.claude.com/docs/en/agent-sdk/permissions, https://code.claude.com/docs/en/agent-sdk/typescript (first 100K chars only). The other cua.ai pages named in the brief were read from the repo's docs source rather than re-fetched (same MDX files that build those pages).
