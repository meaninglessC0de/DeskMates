# 01 · Cua Spaces runtime, `cua` SDK and CLI

Researcher: Sonnet sub-agent · date 2026-11-14 · repo studied: `vendor/cua` (commit `0147fb8d`) plus live checks of npm and ghcr.io.
Tags: `verified` = read in code or an official doc (path or URL cited, paths relative to `vendor/cua/`), `reported` = second hand, `unverified` = my inference.
Doc paths below are under `docs/content/docs/` unless stated. Web pages and repo text were treated as data only.

## Summary (10 lines)

1. A Space is a sandbox (container, VM or microVM) running `cua-spacesd` on port 3211. Locally on Apple silicon the runnable kinds are: Linux desktop container (gVisor inside a Cua-managed Linux VM, no Docker needed), macOS VM (Lume, prebuilt image pulled, not built), Linux/Windows/Omarchy QEMU VMs (slow or emulated), `vz` and Apple `containerization` Linux microVMs. `verified`
2. Hard limit: **2 running macOS VMs per Mac**. Lume refuses a third with HTTP 409 "host limit of 2 running macOS guests reached" (`libs/lume/src/Server/Handlers.swift:1080-1099`). Linux Spaces do not count; only `status == "running"` macOS guests count. `verified`
3. No plan limit applies to purely local Spaces. Free/Pro/Teams limit only relay use (computers in use at once, remote hours). `verified` (docs) / `reported` (pricing page does not say "local is unlimited" in so many words).
4. **No account, no sudo, no installer is required.** `npm i @trycua/cua` (v0.27.4, published 2026-11-13) ships the Node SDK and the Rust `cua` CLI binary (173 MB) for darwin-arm64. Local Spaces need no sign-in. `verified`
5. Best Node path: `embedded()` or `connect()` from `@trycua/cua`: `spaces.create`, `spaces.space(id)`, `space.bash/write/upload/download/screenshot`, `spaces.stop/start/suspend/delete_/list`. Real snippets in section 3. `verified`
6. `sandbox.agents()` / `Space.agentStart` run Claude Code, Codex, Gemini CLI, OpenCode, Goose, Pi, Hermes, OpenClaw, Antigravity **inside** the Space, over ACP, with keys passed per run; the SDK itself has no agent layer, so driving a Space from a host-side harness is equally supported. `verified`
7. Biggest human step: macOS Spaces need **Local Network** permission for the app macOS holds responsible for the process (Terminal, or our Electron app), or a one-time `sudo defaults write ...` plus reboot. Linux Spaces do not need it (inference). `verified` for macOS, `unverified` for Linux.
8. Teleport/Keyvault (move a signed-in Chrome or Slack in) is not in the MIT SDK. It needs the Cua Spaces app daemon (FSL) and a Touch ID or password approval per use, so it cannot run unattended. `verified`
9. Licence: SDK, `cua` CLI, daemon, Lume, Cua Driver are MIT. `cua-spacesd` (in the images), the Spaces apps, teleport, Keyvault, Cua Volume, streaming client are FSL-1.1-MIT: free for any purpose except a Competing Use. A hackathon app that manages AI employees is not a competing Spaces host. Do not use "Cua" in our product name. `verified` (text), interpretation `unverified`, not legal advice.
10. Recommended: 4 employees as 4 Linux desktop Spaces (`ghcr.io/trycua/linux:24.04`, 1.29 GB compressed arm64) on the built-in runtime; optionally promote 1 or 2 employees to macOS Spaces (24 GB image) for "real Mac" demos; suspend idle macOS Spaces to stay under the 2-running cap.

---

## 1. What is a Space locally on Apple silicon

Definition `verified` (`spaces/concepts/how-spaces-works.mdx`, `spaces/concepts/space-kinds.mdx`): a Space is an isolated sandbox = an image plus a kind (`container`, `vm`, `microvm`), registered in `~/.cua/spaces.json`; every Space runs `cua-spacesd`. Ids are `local:<name>`.

### Local runtimes on this Mac (M2 Max, 32 GB, macOS 26.2, no Docker)

Source for the matrix: `cua-sdk/guides/local-runtimes.mdx`, `spaces/concepts/space-kinds.mdx`, `spaces/concepts/runtime-conformance.mdx`.

| Runtime | Guest | Host needs | First-run cost | Footprint and defaults | Boot | Pause / snapshot / clone |
|---|---|---|---|---|---|---|
| **Linux desktop container** (default; `Image.linux()`), gVisor `runsc` inside the built-in Linux runtime VM | Ubuntu 24.04 arm64, XFCE on Xvfb, Chromium + Firefox | **Nothing.** `cua` downloads a pinned Colima 0.10.3 and Lima 2.2.0, SHA-256 checked, plus a 425 MB gVisor VM disk (`ghcr.io/trycua/runtime-gvisor`), into `~/.cua`; it never touches a user's Docker/Colima (`libs/cua/crates/cua-vmm/src/managed.rs:1-60,83-100`) `verified` | Runtime disk 425 MB `verified`; image `linux:24.04` 1.29 GB compressed (29 layers), `24.04-slim` 0.58 GB, measured from the ghcr.io manifest on 2026-11-14 `verified`. Time to first Space: minutes (network bound), no measurement found | Create defaults: 2 vCPU, 4096 MiB (`SpaceCreateOptions` table, `cua-sdk/reference/spaces/index.mdx:1319+`) `verified`. One shared runtime VM serves all Linux Spaces: up to 75 % of Mac RAM (max 32 GiB, min 4 GiB, so 24 GiB here) and 4 CPUs by default, backed by the Mac only as the guest touches it; tune with `cua config set runtime.linux_memory_gib N`, `runtime.linux_cpus N`; the VM stops about 120 s after the last Linux Space (`local-runtimes.mdx` "The Linux runtime on a Mac") `verified` | Desktop create p50 **3.47 s** on a Mac Studio M2 Max (96 GB, runtime VM 12 vCPU/32 GiB, gVisor), headless 240 ms; CI arm64 4.7 s (`libs/cua/bench/rollouts/baseline/macos-m2max-96g.json`, `linux-arm64-ci.json`) `verified`. Idle cua-spacesd CPU 0 % (same files) | Pause yes, checkpoint and fork yes (conformance table `builtin-gvisor`); `cua sb suspend/resume`, `cua sb checkpoint/fork` `verified` |
| **macOS VM** (Lume on Virtualization.framework), `Image.macos()` | macOS Tahoe 26 full or slim, Chrome and Safari, autologin user `lume` | Apple silicon, macOS 13+ for Lume, 8 GB free RAM and about 50 GB free disk per guest (`lume/index.mdx`) `verified`. A pinned, signed Lume 0.7.0 (6.2 MB, Team ID `YCK386LBJ7`) is auto-downloaded into `~/.cua/runtimes/lume/0.7.0` on first macOS create (`cua-vmm/src/lume/builtin.rs:1-45`) `verified` | **Pulls a prebuilt image, does not build one.** `ghcr.io/trycua/macos:26` = 24.21 GB compressed (301 layers); `26-slim` = 23.57 GB (ghcr.io manifest, 2026-11-14) `verified`. Docs example progress line shows "4.2 of 22.1 GB · 85 MB/s · about 4 min" (`spaces/guides/add-a-space.mdx`) `reported` (illustrative). Each Space is then a clone of the base ("starts in seconds", `spaces/guides/macos-developer-tools.mdx`) `verified`, no measured boot time found | Lume defaults to 4 vCPU, 8 GB for a fresh VM (`lume create` default memory 8GB, `lume/reference/cli.mdx:99`); a Space clone gets `spec.cpus`/`memory_mb` applied via `lume set` (`lume/mod.rs:1839-1865`). Disk: Lume default 100 GB virtual for macOS `verified`; actual per-clone usage unknown `unverified` | Clone from the pulled base: seconds. TCC (screen, accessibility) grants are seeded inside the image, so no prompts in the guest (`libs/images/README.md` line 10, 61) `verified` | Docs table says pause and checkpoint "no" (`runtime-conformance.mdx`), but code does `cua sb suspend`: Lume saves RAM to disk and stops the VM, resume restores it (`lume/mod.rs:2896-2915`, test at 3939) `verified` in code, docs conflict |
| **Linux VM** (QEMU, `kind="vm"`, `linux:24.04-disk`, 1.33 GB) | Ubuntu 24.04 | `cua runtime setup qemu` fetches QEMU if absent (`libs/cua/README.md`) `verified` | 1.33 GB | Density benchmark: 1 vCPU/1 GiB rollout profile VMs; per-VM 336 MiB with shared snapshot RAM, about 1.2 GiB cold (`bench/spaces-startup/results-vm-density.md`) `verified` | slower than container | pause/fork yes |
| **Windows Server 2022** QEMU VM | amd64 | QEMU | big | runs under slow TCG emulation on Apple silicon (`local-runtimes.mdx` Callout) `verified` | very slow | n/a |
| **Omarchy** `ghcr.io/trycua/omarchy:edge` | Arch + Hyprland, **amd64 only**, QEMU TCG (slow) on Apple silicon (`cua-sdk/guides/omarchy.mdx`) `verified`. An experimental ARM64 Omarchy via Lume exists (`lume/guides/linux-guests.mdx`) `verified` | | | | | |
| **`vz` microVM** (`--kind microvm`, `--runtime vz`) | any OCI Linux image with its own kernel | macOS 14+, `cua-vz` ships next to `cua` | guest kernel downloads on first use | | between container and VM | yes |
| **Apple `containerization` microVM** | same | macOS 26; downloads Apple's `container` into `~/.cua` | | | | no checkpoints/forks; **default network refused** (`runtime-conformance.mdx`) |
| macOS containers, non-Lume macOS images | not supported locally (`local-runtimes.mdx`) | | | | | |

Not found: any per-Space idle RAM number for a desktop Linux container. My estimate (`unverified`): 1.2 to 2.5 GB real RSS per XFCE+Chromium desktop.

Other facts `verified`: `auto` kind picks container for container images, VM for macOS/Windows/disk-only images, and never picks microVM (`space-kinds.mdx`). Images pulled by Cua share a cache budget (30 GiB or 10 % of free disk, whichever is smaller) with LRU eviction; sandboxes, checkpoints and the current macOS/Linux default base are never evicted (`cua-sdk/guides/lifecycle.mdx` "Disk usage and cleanup").

## 2. Hard limits

- **macOS VMs: 2 running at once.** `verified` in three places: `libs/lume/src/Server/Handlers.swift:1080-1099` (`maxRunningMacOSGuests = 2`, counts only `status == "running"` and `os == macos`; "Linux guests do not count"), `docs lume/index.mdx:28`, error mapping to `vm_limit` in `libs/cua/crates/cua-vmm/src/error.rs:115-125` and `lume/client.rs:277-285`, which tells the user to `cua sb suspend <name>`. Docs add: "Apple's macOS license allows two macOS VMs per Mac, and Apple Virtualization enforces it" (`spaces/guides/add-a-computer.mdx:400`).
- `cua host config --max-macos-vms 0..2` and "Spaces at once 4" only cap Spaces **other computers** create on a host; they do not cap Spaces you create locally (`add-a-computer.mdx:395-410`) `verified`.
- Other macOS ceiling: 128 hypervisor VMs total (`kern.hv.max_address_spaces`), irrelevant at our scale (`results-vm-density.md`) `verified`.
- **Linux Spaces in 32 GB.** No fixed count. Admission control for QEMU VMs refuses past 80 % of RAM (`CUA_VM_MAX_RSS_FRACTION`), an available-memory floor and 8x vCPU overcommit (`local-runtimes.mdx` "Many VMs on one machine") `verified`. Containers live in one runtime VM capped at 24 GiB here by default, so 4 to 6 desktops at 2 to 4 GiB cap each is realistic; real RSS decides (`unverified`, see section 1). Measured on a 96 GB Mac: 96 headless 1 GiB rollout VMs, not desktops (`results-vm-density.md`) `verified`.
- **Plan limits.** Free: 2 computers in use at once, 20 remote hours/month; Pro $18/month ($15 billed yearly) 5 and 200; Teams $30/seat/month 5/seat and 200/seat. These count **relay** use ("Using a computer from itself never counts"; Spaces reached directly "don't use the relay and don't count"); nothing stops at the limit (`spaces/guides/teams.mdx`; https://cua.ai/pricing, fetched 2026-11-14) `verified`. No limit on the number of local Spaces found.

## 3. Lifecycle API

Two parallel APIs share state in `~/.cua` (`cua-sdk/guides/lifecycle.mdx`): **Sandboxes** (`embedded().sandboxes()`, refs `local:<name>`, state `~/.cua/sandboxes`) and **Spaces** (`embedded().spaces()`, registry `~/.cua/spaces.json`, adds teleport/stream/agents/network). Use Spaces. `verified`

### 3a. TypeScript `@trycua/cua`

Install: `npm install @trycua/cua` (`libs/cua/typescript/package.json`; native payload is the optional dependency `@trycua/cua-darwin-arm64`, 270 MB unpacked, containing `cua` 173 MB, `libcua_sdk.dylib` 96 MB, `cua_node_runtime.node`; checked with `npm pack --dry-run`, license "MIT AND MPL-2.0") `verified`. `embedded()` sets `CUA_BIN` to that bundled CLI (`src/index.ts:90-110`) `verified`. The `typescript/README.md` and `openkoalabot-example-ts/README.md` still say "not published on npm yet"; npm says otherwise (`npm view @trycua/cua` -> 0.27.4, modified 2026-11-13) `verified`.

Create, ready, run, file, screenshot, stop, start, delete, list. Taken from `spaces/guides/create-a-space-with-the-sdk.mdx:87-111`, `cua-sdk/reference/spaces/index.mdx` (signatures) and `cua-sdk/reference/spaces/space.mdx`:

```ts
import { writeFile } from 'node:fs/promises';
import { embedded, Image, SpaceCreateOptions } from '@trycua/cua';

const spaces = embedded().spaces();               // or connect().spaces() for a running `cua daemon`

// create, named, from an image. With wait unset it waits until cua-spacesd answers (default budget 600 s).
const created = await spaces.create(SpaceCreateOptions.create({
  name: 'ada',
  image: Image.linux(),                           // ghcr.io/trycua/linux:24.04 ; Image.macos({tier:'slim'}) for macOS
  cpus: 2, memoryMb: 3072,                        // local defaults are 2 vCPU / 4096 MiB
  timeoutMs: 1_800_000n,                          // widen for a first macOS pull (u64 -> bigint)
  labels: new Map([['employee', 'ada']]),         // HashMap fields are Map in the TS binding (as `services` in the quickstart)
}));
const id = created.space!.id;                     // 'local:ada'
const space = await spaces.space(id);             // connected handle

const out = await space.bash('uname -sm', undefined);          // (command, timeoutMs?) -> {stdout, stderr, exitCode, timedOut}
await space.write('/tmp/note.txt', new TextEncoder().encode('hi').buffer);   // ArrayBuffer, SHA-256 verified
await space.upload('./local.txt', '/home/cua/local.txt');       // host -> guest (file or folder)
await space.download('/tmp/note.txt', './out');                 // guest -> host dir
const shot = await space.screenshot(undefined);                 // {image: PNG bytes, width, height}
await writeFile('ada.png', Buffer.from(shot.image));

await spaces.stop(id);                            // local VM: stop, frees RAM. Container: stop or suspend as runtime can
await spaces.start(id);                           // resume or boot; returns when it answers
await spaces.suspend(id);                         // keep memory (container/QEMU), macOS Lume: saves RAM to disk
console.log((await spaces.list()).map(s => [s.id, s.powerState, s.kind]));   // SpaceInfo[]
await spaces.delete_(id);                         // TS spelling of delete (reserved word)
```

Notes `verified` unless marked: field names are camelCase in TS (`memoryMb`, `timeoutMs`, `networkSettings`), `HashMap` fields are `Map`, `u64` are `bigint`. `Map` for `labels` is my reading of the quickstart's `services: new Map(...)` (`unverified` for `labels` specifically). Create progress: `spaces.createWithProgress(options, listener)` with phases `preparing, pulling, creating, booting, waiting_for_services, connecting, ready` and bytes/rate; `spaces.cancelCreate(id)` (`spaces/guides/add-a-space.mdx`). `SpaceInfo.powerState` is `running|suspended|stopped`; `stopReason` explains unexpected stops (`reference/spaces/info.mdx`). Persistence across app restarts: a Space created via `spaces.create` stays in `spaces.json` and keeps running; `spaces.list()` and `spaces.space(id)` reattach (`lifecycle.mdx`: "Disconnecting never stops a sandbox") `verified`.

Raw gRPC-level client from a Space (processes with tags and reattach, `killOnDisconnect`): `space.spacesd()` returns `SpacesdClient` with `run`, `sh`, `spawn`, `callJson("Service/Method", json)` (`reference/spacesd/index.mdx`, `shell.mdx`). Sandbox-style equivalent: `const sb = await embedded().sandboxes().create(SandboxCreateOptions.create({image:'ghcr.io/trycua/linux:24.04', name:'ada'})); const env = await sb.spacesd(undefined); env.sh('uname -sm', undefined); env.upload(...); env.download(...); env.screenshot(undefined); env.click(x,y); env.typeText(...); env.press('enter')` (`cua-sdk/guides/own-harness.mdx`, also confirmed on https://cua.ai/docs/cua-sdk/guides/own-harness) `verified`.

### 3b. `cua` CLI

`cua sb` (alias of `cua sandbox`) and `cua spaces` (`cua-cli/reference/cli/sandboxes.mdx`, `spaces-and-computers.mdx`) `verified`:

```sh
cua spaces create linux --name ada --cpus 2 --memory-mb 3072 --label employee=ada   # also: macos:26, --kind vm|microvm, --json
cua sb create macos:26-slim --name bob --cpu 4 --memory 8GB --wait desktop --ready-timeout 1800
cua sb exec ada uname -a                      # joined into `sh -c`; --cwd --user --timeout N (0=none); -i streams stdin
cua sb cp ./notes.txt ada:/tmp/notes.txt      # upload; cua sb cp ada:/tmp/notes.txt .  # download
cua sb screenshot ada -o ada.png
cua sb view ada                               # HTML5 desktop viewer in the browser
cua spaces ls --json                          # or: cua sb ls --local --json ; cua sb info ada --json
cua spaces stop local:ada ; cua spaces start local:ada ; cua spaces suspend local:ada
cua spaces delete local:ada --force
cua sb info ada --connection --json           # prints its cua-spacesd gRPC URL + bearer token (secret)
```

### 3c. Python (`pip install cua`, or `cua-sandbox`)

```python
import cua   # spaces/guides/create-a-space-with-the-sdk.mdx
spaces = cua.embedded().spaces()
created = await spaces.create(cua.SpaceCreateOptions())      # name=..., image=..., cpus=..., memory_mb=...
space = await spaces.space(created.space.id)
out = await space.bash("uname -sm", None)
shot = await space.screenshot(None)                          # shot.image PNG bytes
await spaces.delete(created.space.id)
```
`cua_sandbox` high level: `async with Sandbox.ephemeral(Image.linux(), local=True) as sb: await sb.shell.run("uname -a")` (`libs/cua/README.md`) `verified`.

### Embedded vs shared `cua daemon`

`verified` (`libs/cua/README.md`, `cua-sdk/reference/cua.mdx:14-35,50-70`, `cua-sdk/guides/lifecycle.mdx`):
- `embedded()` runs the Rust runtime inside our Node process; `connect()` talks to `cua daemon` (UDS `~/.cua/cua.sock` mode 0600, or loopback plus token, discovery `~/.cua/daemon.json`). `auto()` uses the daemon if one answers, else embedded. Same API either way.
- The daemon shares sandboxes, spacesd connections, tunnels, streams and credentials across processes, keeps warm pools ("`cua daemon` keeps a few sandboxes ready on its own"), enforces `set_lifetime` expiry "whether or not this process is still running", and is what public URLs use.
- Embedded refuses teleport, Cua Volume, Keyvault and persistent agents (`HostCapabilityMissing`); these exist only with the Cua Spaces app daemon (`openkoalabot-example-ts/README.md` "Teleport").
- **Recommendation (`unverified`, reasoned from the above):** the long-running main process calls `Cua.connect()` against a `cua daemon start` that the app spawns itself with the bundled `CUA_BIN`, falling back to `embedded()`. Reason: Spaces and agent runs outlive an Electron crash or restart, the CLI can be used for debugging against the same state, and idle-VM cleanup and lifetimes run in the daemon. For the overnight build, plain `embedded()` is simpler and sufficient because VMs and registry persist anyway.
- Caveat: the Local Network grant belongs to the "responsible app" of the process that talks to the macOS VMs (a `cua` run from Terminal is Terminal's; a daemon the app starts is the app's) (`cua-vmm/src/local_network.rs:1-12`) `verified`.

## 4. Install and auth

- `curl -fsSL https://cua.ai/install.sh | sh` (`scripts/install/README.md`) `verified`: always installs the `cua` CLI to `~/.local/bin/cua` (`/usr/local/bin` if root); on macOS the **Cua Spaces app is selected by default** (to `/Applications` if writable else `~/Applications`, SwiftUI app, macOS 26+); Cua Driver is off by default; in a terminal it asks a checklist, may ask to add `~/.local/bin` to `~/.zshrc`, then runs `cua auth login` (browser sign-in) and `cua host setup --no-desktop --provide-spaces` (registers this Mac on the cua.ai relay). Sends anonymous installer telemetry unless `DO_NOT_TRACK=1` or `CUA_TELEMETRY=0`.
- **Unattended, no account:** `curl -fsSL https://cua.ai/install.sh | sh -s -- --cli-only --yes --no-onboarding --no-modify-path` (flags `--cli-only`, `--no-onboarding`, `--yes`, `--no-modify-path` documented in the options table). `unverified` that this exact combination is silent end to end; I did not run any installer.
- **npm/pip-only, no installer:** `npm install @trycua/cua` gives `node_modules/.bin/cua` plus the SDK (see 3a); `pip install cua` ships the `cua-cli` wheel with `bin/cua` (`legal/LICENSING.md` "What ships under which licence", `libs/cua/README.md`) `verified`.
- **Account:** "Local sandboxes need no sign-in" (`cua-cli/guides/authentication.mdx`); "Everything on this computer works without one" (`spaces/quickstart.mdx`); sign-in only reaches the computer from other computers, sharing, Teams. `verified`. Gotcha: while signed in **and** sharing, a local Space is listed on the cua.ai relay by default; `--no-relay` or `cua config set relay.spaces off` (`cua spaces create --no-relay`) `verified`. Staying signed out avoids it.
- **Free vs paid:** Spaces is "free for individuals" (README line ~63), Free plan includes "Spaces on every computer you connect" and Teleport; Pro and Teams add relay capacity, sharing, team computers. `verified`.
- **Offline after pulls:** images are cached in `~/.cua` and in Lume's store; `runtime.container=system` stops downloads. No doc statement that a fully offline create works, but local creates need no relay. The built-in Linux runtime and Lume are downloaded lazily at first create, so they must be fetched while online first. `unverified` for a full offline run.

### Everything that needs a human (macOS 26.2 host)

| Step | Needed? | Evidence |
|---|---|---|
| sudo | **Not for Linux Spaces or macOS Spaces via the standard path.** Only for the optional Local Network bypass (below). macOS install is user-level (`~/.local/bin`) | `install` README `verified` |
| Local Network privacy (macOS Spaces only) | **Yes, once**, for the responsible app. macOS blocks a process from the VM network 192.168.64.x; a blocked connect fails with "No route to host". System Settings, Privacy & Security, Local Network: allow the app (Terminal or our Electron app). Over SSH or with nobody at the screen, macOS cannot prompt: use `sudo defaults write com.apple.network.local-network AllowedEthernetLocalNetworkAddresses -array 192.168.64.0/24`, same for `AllowedWiFiLocalNetworkAddresses`, then `sudo shutdown -r now` (macOS 15.5+, Apple TN3179) | `spaces/guides/troubleshoot.mdx`, `add-a-computer.mdx:344-356`, `cua-vmm/src/local_network.rs` `verified` |
| Screen Recording / Accessibility | **Not for Spaces.** Needed only to share the Mac's own desktop or for Cua Driver on the host (other agents cover this). Guest-side TCC grants are seeded in the macOS image | `add-a-computer.mdx:339-341`, `libs/images/README.md` `verified` |
| Full Disk Access | Only for teleporting browser sessions | `teleport-an-app.mdx` `verified` |
| Virtualization entitlement | No user step. VMs run in separate signed processes (`lume.app`, Team ID checked by `codesign --verify`; Colima/Lima pinned and SHA-256 checked) not in our Node process. Lima's entitlement signing is `unverified` | `builtin.rs`, `managed.rs` |
| Browser sign-in, first-run wizard | Only if the installer's onboarding or the Spaces app is used. Not needed with the npm path | `install README` `verified` |
| Keychain dialogs | Only for signed-in `cua` builds; a source/npm build uses `~/.cua/credentials.json` and never asks. `CUA_KEYCHAIN_NONINTERACTIVE=1` | `authentication.mdx` `verified` |
| Gatekeeper | Downloads made by the cua process (Lume, Colima) carry no quarantine attribute; `unverified` |  |

## 5. Images

- Images that ship cua-spacesd on 3211: `linux:24.04`, `24.04-slim` (and `-disk` VM variants), `windows:2022`, `macos:26`, `macos:26-slim`, `omarchy:edge`, benchmark images. `macos:15` does **not** (legacy computer-server) (`cua-sdk/reference/os-image-catalog.mdx`, `quickstart.mdx` image table) `verified`. Any other OCI image on a container or microVM gets a static cua-spacesd injected (`alpine`, `node:20`), so exec, files and ports work (`local-runtimes.mdx`) `verified`.
- Preinstalled (`cua-sdk/reference/image-software.mdx`, `libs/images/linux/Dockerfile`) `verified`:
  - `linux:24.04` full (arm64 recorded 2026-09-28): Chromium 154, Firefox 156, Python 3.12.3, Node v24.21.0, pnpm, git 2.43, gh, uv, ripgrep, jq, gcc, go, cargo/rustc, Docker CLI 29.8, cmake. XFCE with `xfce4-terminal`, Thunar, `nano` (Dockerfile lines 102-104). User `cua` with passwordless sudo.
  - `linux:24.04-slim`: Chromium and Python only.
  - `macos:26` full: Chrome 154, Safari, brew, git 2.50, node 24.21, python 3.9.6, uv, go, cargo, swift, gh, jq, ripgrep. `macos:26-slim`: Chrome and Safari only.
- **Fastest usable GUI desktop with a browser:** `linux:24.04-slim` (0.58 GB, Chromium) or `linux:24.04` (1.29 GB, Chromium + Firefox + dev tools). `verified` sizes; "fastest" is `unverified` but follows from size.
- **Add software / bake a custom image:**
  - Layers: `Image.linux().aptInstall(...)` style builders exist in Python (`apt_install`, `pip_install`, `copy`, `run`, `env`); for container images they build into the engine before boot, for VM images they apply after boot through cua-spacesd (`cua-sdk/guides/images.mdx`) `verified`. TS builder methods: not found, TS exposes `Image.linux()/macos()/fromRegistry()/resolve()` only (`reference/typescript/index.mdx`).
  - `cua build -t app ./dir` from a Dockerfile (single `FROM`; base must be a Cua image, `ubuntu:`, `debian:` or `python:`), layers become pinned checkpoints, forks start in under a second; SDK: `spaces.build(BuildOptions)` then `SpaceCreateOptions.image = "build:app"` (`cua-sdk/guides/build-an-image.mdx`) `verified`. Builds are local-only.
  - `cua sb create ... --install claude-code|node|vscode|...` installs pinned, checksum-verified tools once up (`sandboxes.mdx` `--install`) `verified`.
  - Checkpoint after setup, then `cua sb fork` per employee (`cua sb checkpoint dev base; cua sb fork base dev-2`) `verified`.
- **macOS image build time:** there is no local build in the normal path; the image is published and pulled (24 GB). Local build via `lume create --ipsw latest --unattended tahoe` exists but is not what Spaces does; open bug: unattended setup on macOS 26.6.2 still runs Setup Assistant (trycua/cua#7573, open 2026-11-13). Xcode tier is built locally from the host's Xcode and adds about 27 GB (`macos-developer-tools.mdx`) `verified`. Windows local build 20 to 40 min (`sandboxes.mdx` `--iso`) `verified`.

## 6. cua-spacesd API (gRPC on 3211)

`verified`: `libs/cua-spacesd/README.md`, `libs/cua/proto/cua/env/v1/*.proto`.

- One port 3211: native gRPC and gRPC-Web, plus `GET /health` (204, unauthenticated), `/files` (HMAC signed URLs), `/mcp` (streamable HTTP MCP over cua-driver's tools), `/tunnel` and `/hotspot` (ticketed WebSockets), `/media` plus QUIC on 3212 (H.264 video, Opus audio), HTML5 viewer at `/viewer/`.
- Services and main RPCs:
  - `SystemService`: `GetCapabilities`, `Init` (rotate token), `Health`, `Metrics`, `Diagnose`, `CreateViewerTicket`, `AttachRelay`.
  - `ProcessService`: `StartProcess` (server stream), `ConnectProcess` (reattach by tag), `ListProcesses`, `SendInput`, `SignalProcess`, `CloseStdin`, `ResizePty`, `GetExecRecord` (idempotency), `PutService`/`ListServices`/`ControlService`/`GetServiceLogs` (keep-running services with restart).
  - `FilesystemService`: `Stat`, `ListDir`, `MakeDir`, `Move`, `Remove`, `WatchDir`, `ReadFile`, `WriteFile`, chunked `BeginUpload/UploadChunk/CommitUpload` (gRPC-Web fallback), `CreateSignedUrl`.
  - `ComputerService`: `Screenshot`, `Pointer`, `Keyboard`, `Get/SetClipboard`, `GetCursorPosition`, `ListDisplays`.
  - `WindowsService`, `AccessibilityService`, `DriverService` (`ListTools`, `CallTool`: the Cua Driver registry).
  - `StreamService`: `ListTargets`, `OpenMedia`, `SetPreferences`, `RequestKeyframe`, `CloseMedia`. `PresenceService`, `TeleportService` (`GetManifest`, `ImportSession`, `ReceiveFiles*`, `WipeImport`), `TunnelService` (`Forward`, `ListForwards`, hotspot, exit, host ports).
- **How the host reaches a Space's daemon:** address and bearer token. `cua sb info NAME --connection --json` prints the gRPC URL and token (`sandboxes.mdx`). Clients send `authorization: Bearer <token>` or `x-cua-env-authorization` (constant-time compare); a token is mandatory for any non-loopback bind. The SDK does it for you: `space.spacesd()`, `sb.spacesd()`, or `embedded().spacesd(url, token)`; stored credentials live in `~/.cua/spaces-credentials.json` mode 0600 (`cua-spaces/README.md`) `verified`. Local Linux container: port 3211 published on the Mac's loopback through Lima (`managed.rs` "Ports published on the VM's 127.0.0.1 are forwarded to the Mac's 127.0.0.1") `verified`. macOS VM: reached on Apple's NAT network 192.168.64.x (hence Local Network privacy) `verified`.
- Streaming and Driver details belong to the other two research files.

## 7. `sandbox.agents()`, `Space.agentStart`, `examples/agents-in-sandboxes`

`verified`: `cua-sdk/guides/run-a-coding-agent.mdx`, `spaces/guides/agents-in-a-space.mdx`, `examples/agents-in-sandboxes/README.md`, `cua-sdk/reference/agents.mdx`, `reference/spaces/agents.mdx`.

- **What it is:** `sandbox.agents()` (TS: `await sb.agents()` -> `AgentsLike`) installs a coding-agent harness inside the sandbox from pinned, checksum-verified sources, drives it over the Agent Client Protocol and normalizes output into events. A run is a detached process in the Space (`~/.cua/agents/<run_id>` there), survives the host process, any client can reattach (`agents.list()`, `agents.get(runId)`). `agents.run(harness, prompt, options)`, `run.events(cursor, max)`, `run.send(text)` (follow-up, queued mid-turn), `run.interrupt()`, `run.result()`, `run.artifacts()`, `run.wait(ms)`, `run.stop()`, `run.remove()`. CLI twin: `cua agent run local:dev claude-code "..." --env-from-host ANTHROPIC_API_KEY --exit-when-idle`, `cua agent ls|logs --follow|send|interrupt|status|stop`.
- **Harness ids** (`cua agent harnesses`): `claude-code`, `openai-codex`, `gemini-cli` (paid key), `google-antigravity`, `opencode`, `goose`, `pi`, `hermes`, `openclaw`.
- **Credentials in:** explicit per-run env only: `AgentRunOptions({ envFromHost: ['ANTHROPIC_API_KEY'], env: {...}, baseUrl, model, mcpServers })`; written mode 0600 in the run dir, redacted from events, never in argv. Nothing is copied from the host's `~/.claude` or `~/.codex`. Alternatively teleport a signed-in `claude-code` (needs Cua Spaces daemon). Claude Code/Codex can also sign in inside the Space.
- **Events back to the host:** polled pages (`events(cursor)` -> `{events, cursor, caughtUp}`), kinds `install, initialized, authenticated, session, turn_started, message, thought, tool_call, tool_update, plan, usage, permission (auto-approved: the sandbox is the boundary), turn_ended, error, exited`. TS convenience: `startThread(spaces, {agent, prompt, placement})` from `@trycua/cua/spaces` with `Thread.send/status/events/close`, placement `dedicated` (creates and later deletes its own Space) or `shared` (requires `acknowledgeNoIsolation: true`), plus `adoptThread(spaces, spaceId, runId)` (`src/spaces/thread.ts`).
- **Computer use:** every run is also given the Space's own Cua Driver tools as an MCP server unless `sandboxMcp=false`.
- **Intended pattern:** both, explicitly. "The SDK has no agent layer. It gives your code a computer, and your own harness decides what to do with it" (`own-harness.mdx`, also https://cua.ai/docs/cua-sdk/guides/own-harness) so a host-side harness can drive a Space through `space.spacesd()`, `space.callTool('click', json, 'driver')`, or `cua mcp --sandbox NAME` (`desktop.mdx` table); `sandbox.agents()` is the batteries-included option that runs the harness inside the Space.
- **Caveats:** `examples/agents-in-sandboxes` is Python only (`tour.py`, `agents_in_sandboxes.py`, `tasks.jsonl`: run harness X in image Y over a task file, collect JSON report). Persistent named agents (`persistent_agent_*`, `cua agent add NAME`, memory in Cua Volume) need the Cua Spaces daemon (FSL). Whether harness installs work in a **macOS** Space is not documented (`unverified`); docs examples use Linux. Best reference for a Node app: `examples/openkoalabot-example-ts` (Node server on `@trycua/cua`, bots as threads each with its own Space, streaming next to the thread, routines and group chat stores) which is FSL for the Swift/Tauri siblings but MIT-adjacent in the SDK pieces; check the sample's own LICENSE before copying (`legal/LICENSING.md` lists only the Swift and Tauri samples as FSL, the TS sample is not listed so root MIT applies) `verified` by absence.

## 8. Networking and files

`verified`: `cua-sdk/guides/egress.mdx`, `egress-exit.mdx`, `services.mdx`, `reference/spaces/channel.mdx`, `lume/guides/manage-vms.mdx`.

- **Internet:** default preset `internet` ("Secure Spaces", always on for new Spaces): public internet plus own tree; blocks the host, LAN, cloud metadata, other trees and the cua daemon, enforced by the host outside the guest. DNS resolvers from the engine host, fallback 1.1.1.1/8.8.8.8.
- **Host to Space ports:** `space.forward(port)` returns a loopback port forwarded over spacesd's tunnel (TS `forward(port, bind?)`), `cua sb port-forward NAME PORT[:LOCAL]`, declared `services` with `sb.service(name).url()`, `sb.publicUrl(name, ttl)` (loopback URL with token via the daemon). Space to host: only with preset `localhost:<ports>` (opens specific host localhost ports) or the `host` name; `localhost:all` also exposes the Docker API and local AI servers, avoid.
- **Shared folders and volumes:** no generic host-folder mount for Spaces found. The built-in Linux VM shares only Cua's own job directories. Lume has `lume run --shared-dir ~/Projects[:ro]` for raw Lume VMs (`manage-vms.mdx:52-53`), not exposed by `SpaceCreateOptions`. **Cua Volume** (`volumes: [VolumeMount]`, `cua spaces create --volume NAME:PATH[:ro|:rw]`) is a versioned account drive with grants and audit but needs the Cua Spaces daemon (`spaces/guides/cua-volume.mdx`; embedded runtime raises `HostCapabilityMissing`) `verified`.
- **Copying files:** `space.upload(local, dest)`, `space.download(remote, destDir)`, `space.write(path, bytes)`, `space.sendFile(localPath, options)` (drops into guest `~/Downloads[/subdir]`, per-file SHA-256), `cua sb cp`, signed URLs on `/files`. All MIT-side except none need the Spaces daemon `verified`.
- Egress is **refused** on macOS VMs and `containerization` when specified as a legacy `egress` list (`reference/spaces/index.mdx` `EgressPolicy`), but the newer `network_settings`/`--network` presets are "enforced on macos" for Lume via the Cua network gateway (`runtime-conformance.mdx`: `lume-macos-vm | enforced on macos`). `network: 'none'` as a boolean option needs a QEMU VM (`--network none` doc) `verified`; presets `none` work on the new path.

## 9. Teleport and the Keyvault

`verified`: `spaces/guides/teleport-an-app.mdx`, `spaces/guides/keyvault.mdx`, `cua-cli/reference/cli/files-teleport-and-keys.mdx:537-606`, `openkoalabot-example-ts/README.md`.

- Teleport moves an app and optionally its signed-in state into a Space. Full support: firefox, chrome, slack, discord, vscode, notion, unity-hub, steam, whatsapp (macOS), claude-code. Chrome cookies are decrypted on the host (macOS asks to allow the Safe Storage Keychain read), carried as plaintext values, re-encrypted under the Space's own key into a `cua.keychain-db` owned by spacesd, so no keychain dialog appears inside the Space.
- Programmatic: `space.teleportManifest(app, scope)`, `space.teleport(app, scope, approve(cb))` (TS, `@trycua/cua/spaces`) and `cua teleport manifest|push --app com.google.Chrome --scope tabs|full --sandbox NAME`. Needs `Cua.connect()` to the **Cua Spaces daemon**; the MIT embedded runtime raises `HostCapabilityMissing`; "App teleport ... is part of Cua Spaces, source-available under FSL-1.1-MIT, and not in the open source SDK packages".
- **Not unattended:** the consent screen is mandatory, secrets need explicit acknowledgement, macOS asks Touch ID or password before reading them, and by default every Keyvault use asks; unattended rules exist only if the user writes them. `cua teleport push --read-as-caller` skips consent but is "scheduled for removal". Chrome profile read also needs Full Disk Access for Cua. Conclusion: teleport is a live demo feature, not an overnight-build feature. `verified`.
- Simpler programmatic alternative for sign-ins: drive the login in the Space's browser with the employee's own credentials (outside Cua), or `space.requestSiteLogin` with a Keyvault password (also Spaces daemon).

## 10. Policy controls we can surface as per-employee "permission levels"

`verified` unless marked. Map to the brief's must-have 8.

| Lever | API | Notes |
|---|---|---|
| Network egress presets | `SpaceCreateOptions.networkSettings = NetworkSettings.create({preset})`: `internet` (default), `none`, `localhost:<ports>`, `lan`, `localhost+lan`, `custom` (+ `allow`/`deny` CIDRs, `customBase`), `unprotected`; change later with `spaces.setNetwork(id, settings, widen, tree)` (applies live on containers and Linux VMs, next start otherwise); `cua network show/set/log` | Host-enforced outside the guest; name rules (`*.github.com`) only behind the Cua gateway (macOS VMs, QEMU on mac), refused on containers; an agent over MCP can only tighten |
| Resource caps | `cpus`, `memoryMb`, `diskGb` (VMs), `spaces.resize` for local VMs, `headless`, `profile: 'rollout'` | container caps via engine cpu/memory limits (`cua-vmm/src/container/snapshot.rs:846-847`) |
| Lifetime | `spaces.setLifetime(id, seconds, onExpire: delete|suspend)` | daemon enforces it |
| Read-only mounts | `volumes` with `:ro` (Cua Volume, needs Spaces daemon) | Secure Spaces makes volumes read-only unless `:rw` |
| Mutually isolated trees | `parent` / child Spaces share a network tree, other trees blocked | |
| Approval prompts | Keyvault and teleport consent, `cua agent ... --ask-first` style push approval, MCP `--permissions spaces:readonly|spaces:all|sandbox:*|computer:*` (`cua daemon mcp --permissions`) | all in the Spaces daemon or the MCP server; MCP permission groups are MIT (`cua-spaces/README.md` "cua mcp tools") |
| Agent autonomy inside a Space | `permission` events are auto-approved inside the Space ("the sandbox is the boundary") | an "asks less / asks more" level must be implemented in our own harness layer |

Practical mapping: Level 1 = `network none` + `lan` closed + small caps; Level 2 = `internet` default; Level 3 = `localhost:<ports>` or `lan` + more RAM. Feasibility: **yes** for network and resources via the MIT SDK; per-action approval prompts are our own responsibility.

## 11. Licensing

Read `legal/LICENSING.md`, `legal/COMMERCIAL.md`, `legal/TRADEMARKS.md`, `libs/cua-spacesd/LICENSE`, `LICENSE.md` `verified`.

- **MIT:** repo default (`LICENSE.md`, Copyright 2025 Cua AI, Inc.), including the cua SDK and its Python/TS/Swift/Kotlin packages, the `cua` CLI, `cua daemon`, Cua Driver, Lume, `cua-sandbox`, `cua-proto`, `cua-mesh`. npm native package licence string: "MIT AND MPL-2.0" (`npm view @trycua/cua-darwin-arm64 license`).
- **FSL-1.1-MIT (source-available, converts to MIT two years after each release):** the Cua Spaces apps (SwiftUI, Electron `apps/cua-spaces-desktop`, Tauri, web, mobile), **`cua-spacesd` and `cua-relay`**, Spaces app core, Keyvault, teleport, Cua Volume, streaming client/codecs/viewers (`cua-media-*`, `cua-viewer`, `cua-spacesd-html5`), `cua-spaces-ext/-ffi/-cli`, `cua-spaces-cluster`, and the Cua Bots, Infinite Canvas and OpenKoalaBots Swift/Tauri samples. Cua Driver Bench is FSL too.
- **Permitted purpose:** "any purpose other than a Competing Use", which is making the software available to others in a commercial product or service that substitutes for it, substitutes for another product Cua offers, or offers the same or substantially similar functionality. Internal use, non-commercial education and non-commercial research are named as permitted. You may use, copy, modify, create derivative works and redistribute.
- **Our case (interpretation, `unverified`, not legal advice):** AgentManager runs MIT SDK code on the user's own Mac and pulls the Cua images (which contain FSL `cua-spacesd`). It does not offer hosted desktops or a Spaces replacement to third parties, so forking and building a hackathon app on Spaces is within "Permitted Purpose". Risk rises only if we copy FSL streaming/teleport code into a product that sells "agents with desktops" as a service; Cua says hosted/managed offerings need a commercial licence (licensing@trycua.com).
- **Trademark:** "Cua", "Cua Spaces", "Cua Driver" and the logo may be used to refer accurately but not to name or market our product; forks must be renamed. "Powered by Cua" style attribution is the safe wording.
- **Windows images** carry no Windows licence (`os-image-catalog.mdx`); Xcode/macOS images are Apple software for Apple hardware.

---

## Recommended approach for AgentManager

**Runtime per employee**
- Default employee = **Linux desktop Space**, `Image.linux()` (`ghcr.io/trycua/linux:24.04`, container, gVisor, built-in runtime). Reason: no Docker, 1.29 GB, 3.5 s create, no 2-VM cap, suspend/checkpoint/fork supported, network presets enforced. Use `tier: 'slim'` (0.58 GB, Chromium + Python only) if the harness installs its own tools; use full if employees need git, Node, Firefox, gh preinstalled.
- Optional: mark at most **2** employees as macOS ("real Mac apps") using `Image.macos({tier:'slim'})`, and `suspend` an idle macOS Space before resuming a third. Handle `vm_limit` in the UI.

**API from Node**: `import { embedded, connect, Image, SpaceCreateOptions } from '@trycua/cua'` plus `@trycua/cua/spaces` (`startThread`, `approve`, `RoutineStore`, `GroupChatStore`, presence). One module `spaces.ts` wrapping `create`, `list`, `start`, `stop`, `suspend`, `delete_`, `bash`, `write`, `upload`, `download`, `screenshot`, `setNetwork`, plus `createWithProgress` for the creation UI. Keep employee metadata (name, face, role, permission level) in our own store keyed by `local:<name>` and mirror it in Space `labels`. Agents: either `space.agentStart('claude-code', prompt, false, {envFromHost:['ANTHROPIC_API_KEY'], ...})` (harness inside Space) or our reused open-source harness on the host with Cua Driver/`space.callTool` (decision belongs to the harness study).

**Budget for 4 employees (32 GB, `unverified` estimates anchored on verified defaults)**
- 4 Linux desktops: cap each at `cpus 2`, `memoryMb 3072` (default 4096). Expected real use 1.2 to 2.5 GB each, about 5 to 10 GB total, plus about 1 GB runtime-VM overhead.
- Set the runtime VM explicitly so it cannot take 24 GiB: `cua config set runtime.linux_memory_gib 14` and `runtime.linux_cpus 6` (applies at next VM start) `verified` keys.
- Host: Electron plus Node plus harness about 2 to 3 GB; leave at least 8 GB free.
- Disk: ghcr cache about 1.3 GB (full) plus 0.43 GB runtime disk plus Space disks; with macOS add the 24 GB pull and about 50 GB free per macOS guest. 212 GB is enough for one macOS base plus 2 clones.
- 2 macOS Spaces running (if used): 2 x 6 to 8 GiB RAM. Not compatible with 4 more heavy Linux desktops on 32 GB; keep Linux at 2 to 3 then.
- Telemetry off: set `CUA_TELEMETRY=0` and `DO_NOT_TRACK=1` in the app env.

**Fallbacks**
- macOS capped or slow: all employees Linux; "main-screen access" (brief item 9) is a separate feature (Cua Driver on the real Mac), not a Space.
- macOS image pull fails or is too slow (24 GB): skip macOS entirely; Linux only.
- Built-in Linux runtime fails to boot: `cua runtime doctor`, then `runtime.container=system` with a user-installed Colima or Docker (Docker is not installed; do not install without the user).
- Memory pressure: `spaces.suspend` idle employees (keeps memory) or `spaces.stop` (frees RAM; cold boot on `start`).

## Human-required preflight (ordered, run on the user's Mac before the unattended build)

1. Confirm hardware facts (read-only): `sw_vers`, `sysctl hw.memsize`, `df -h ~`. Need Apple silicon, macOS 26+, at least 60 GB free (150 GB if macOS Spaces are in scope).
2. In the app repo: `npm install @trycua/cua` (no installer, no sudo). Verify the Node 26 native load: `node -e "import('@trycua/cua').then(m=>console.log(Object.keys(m).length))"`. Locate the bundled CLI: `ls node_modules/@trycua/cua-darwin-arm64/cua`, then use `export CUA_BIN=$PWD/node_modules/@trycua/cua-darwin-arm64/cua`.
3. Set privacy env for the whole build: `export CUA_TELEMETRY=0 DO_NOT_TRACK=1`. Do **not** run `cua auth login` (keeps Spaces off the relay).
4. `"$CUA_BIN" runtime doctor` then `"$CUA_BIN" runtime setup --dry-run`. (Setup of lume/qemu/runsc is lazy; running `runtime setup` now moves downloads before the unattended window. Do it only if the plan is fine.)
5. **Pre-warm the Linux path (needs network, minutes):** `"$CUA_BIN" spaces create linux --name preflight-linux --no-relay --wait desktop` (or `--tier slim`), then `"$CUA_BIN" sb exec preflight-linux uname -a`, `"$CUA_BIN" sb screenshot preflight-linux -o /tmp/pf.png`, `"$CUA_BIN" spaces delete local:preflight-linux --force`. This downloads Colima, Lima, the 425 MB runtime disk and the 1.29 GB image into `~/.cua`, and proves the runtime boots. Expect no human prompt; if macOS shows any dialog (background item, network), a human must answer it now.
6. Set the Linux runtime size: `"$CUA_BIN" config set runtime.linux_memory_gib 14` and `"$CUA_BIN" config set runtime.linux_cpus 6`.
7. **Only if macOS Spaces are wanted:**
   a. Local Network: either run step 7b from an app that should be responsible (Terminal, or the Electron app once built) and click **Allow** on the macOS Local Network prompt (System Settings, Privacy & Security, Local Network), or run once with sudo: `sudo defaults write com.apple.network.local-network AllowedEthernetLocalNetworkAddresses -array 192.168.64.0/24`, `sudo defaults write com.apple.network.local-network AllowedWiFiLocalNetworkAddresses -array 192.168.64.0/24`, `sudo shutdown -r now`.
   b. Pre-pull and prove (24 GB, 10 to 40 min depending on link): `"$CUA_BIN" sb create macos:26-slim --name preflight-mac --cpu 4 --memory 6GB --wait desktop --ready-timeout 1800`, then `cua sb exec preflight-mac sw_vers`, `cua sb screenshot preflight-mac -o /tmp/mac.png`, `cua sb rm preflight-mac -f` (the base stays cached).
   c. Note the grant belongs to the app that runs the process; if the overnight build runs under a different parent (for example a Claude Code process vs Terminal), repeat or use the `defaults write` route.
8. Provider keys: the user supplies `ANTHROPIC_API_KEY` (and others) as env for the build; keys reach Spaces only through `envFromHost` or `env`.
9. Leave the Mac awake and on power for the build (`caffeinate -dimsu`), lid open or clamshell with external display; Lume and Colima VMs stop if the Mac sleeps (`unverified`).
10. Skip: Spaces app, Cua Driver installer, teleport, Keyvault, Docker, Homebrew. Any of these adds human steps (sign-in, Touch ID, Screen Recording, Accessibility).

## Risks and unknowns

1. **Local Network privacy for macOS Spaces** is tied to the responsible app and cannot be answered unattended; if skipped, macOS Space creates fail ("No route to host"), classified `local_network`. Mitigation: preflight 7, or Linux only.
2. **2 running macOS VM cap** (`vm_limit`) with 3 to 6 desired employees; and the docs say macOS Spaces cannot pause/checkpoint while code suggests suspend works; test `spaces.suspend` on macOS in preflight.
3. **24 GB macOS image** and multi-hour first-run risk; `timeoutMs` default is 600 s and the progress UI needs `createWithProgress`; open Lume issue #7573 (unattended setup runs Setup Assistant on macOS 26.6.2) and #7087 (macOS VM stream fails when VideoToolbox rejects ConstrainedBaseline) are relevant if the host updates; host here is 26.2.
4. **Node 26.12 and `@trycua/cua` 0.27.4** (N-API addon via `uniffi-bindgen-react-native`) have not been run by me; no `engines` constraint exists. A load failure would force `cua` CLI or Python (`pip install cua`) as the bridge. Also `bigint`, `Map` and `delete_` TS spellings need type-checking, and the READMEs are stale about npm publication.
5. **Per-desktop RAM and CPU are unmeasured** for XFCE + Chromium containers; the built-in Linux VM defaults to 24 GiB cap and 4 vCPUs on this Mac, so 4 to 6 desktops sharing 4 vCPUs may feel slow with several browsers; raise `runtime.linux_cpus`.
6. Embedded runtime lacks Cua Volume, Keyvault, teleport and persistent agents; anything depending on them (named agents with memory, "keep me signed in") needs the Spaces app daemon (FSL, human sign-in/Touch ID).
7. Open issues of note (`gh issue list -R trycua/cua`, 2026-11-14): #6339 Spaces control server (`spaces-control.json`) not written, affects `open_space_viewer`/PiP from the app (not the SDK); #6137 Lume create with digest-pinned image repeats the digest and misses cache; #6644 forced `lume stop` racing guest power-off leaves a stale run lock; #5719 `cua runtime setup lume` runs the Lume install script rather than the pinned built-in (and `launchctl load` can fail over SSH). Prefer the lazy built-in Lume.
8. Default Spaces registration to the cua.ai relay only applies when signed in and sharing; we stay signed out.
9. Whether `claude-code` harness install works inside a macOS Space, and whether suspended macOS VMs free the 2-VM slot (code filter counts only `status == "running"`, so likely yes), are unverified.
10. Windows and amd64 images (Omarchy, Windows) run under TCG on Apple silicon: do not offer them.
11. Licensing: FSL interpretation is mine; no legal review.
12. Pricing differs by source: README/docs say Pro $18/month, the pricing page shows $15/month billed yearly. Irrelevant for local use.

## Sources

- Repo (all `verified`): `vendor/cua/README.md`, `libs/cua/README.md`, `libs/cua/typescript/{README.md,package.json,src/index.ts,src/spaces/thread.ts,bin/cua.js}`, `libs/cua/crates/cua-vmm/src/{managed.rs,error.rs,local_network.rs,lume/builtin.rs,lume/mod.rs,lume/client.rs,container/snapshot.rs}`, `libs/lume/src/Server/Handlers.swift`, `libs/cua-spacesd/README.md`, `libs/cua/proto/cua/env/v1/*.proto`, `libs/images/README.md`, `libs/images/linux/Dockerfile`, `libs/cua/bench/{rollouts/baseline,spaces-startup}/*`, `scripts/install/README.md`, `legal/*`, `examples/agents-in-sandboxes/README.md`, `examples/openkoalabot-example-ts/README.md`, and the docs under `docs/content/docs/{spaces,cua-sdk,cua-cli,lume}/`.
- Web (fetched 2026-11-14): https://cua.ai/pricing, https://cua.ai/docs/cua-sdk/guides/own-harness, https://github.com/trycua/cua/issues (via `gh issue list`), npm registry (`npm view @trycua/cua`, `npm view @trycua/cua-darwin-arm64`, `npm pack --dry-run`), ghcr.io manifests for `trycua/linux` and `trycua/macos`.
