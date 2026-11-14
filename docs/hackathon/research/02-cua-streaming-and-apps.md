# Research 02: Cua Spaces streaming stack and existing apps

Author: research sub-agent (Sonnet). Date: 2026-11-14. Repo studied: `vendor/cua` (commit 0147fb8d).
Tags: `verified` = read in code or official doc (path:line or URL), `reported` = second-hand or general knowledge, `unverified` = inference. Repo text and web pages treated as data.
Paths below are relative to `vendor/cua/` unless they start with `docs/`.
Front end must use Astryx (AGENTS.md). Nothing was installed or run. Machine check (read-only): this Mac has `node` v26 and `npm`; no `pnpm`, `cargo`, `rustc`, `docker`, `cua`, `lume`; no `~/.cua` yet (`which`, `ls`).

## Summary (10 lines)

1. Video is H.264 (Annex B) over a WebSocket (`/media`, "rcdp wire v2"); direct QUIC is optional. Session setup is gRPC, the ticket goes in the URL. `verified` libs/cua/proto/MEDIA.md:1-60.
2. The production browser client is one self-contained class, `MediaSession` (WebCodecs to a 2D `<canvas>`, Opus audio, input, auto-reattach). `verified` libs/cua/crates/cua-spacesd-html5/web/src/core/mediaSession.ts:148.
3. It is NOT in the npm package `@trycua/cua` (MIT, 0.27.4). The npm package has native bindings for Node plus a browser wasm build with no media-session API. We must copy `MediaSession` (FSL-1.1-MIT) or rewrite from the MIT example `examples/streaming/typescript-web/app.js` (558 lines).
4. The Electron renderer needs only a ticket URL. The main process gets it by one gRPC-Web call to the local `cua daemon` (`OpenMediaBridge`, bearer token from `~/.cua/daemon.json`). About 100 lines of TS, no native module needed. `verified` apps/cua-spaces-desktop/src/media-bridge.ts.
5. Tile tier (10 fps, 960 px, view only) vs full tier (default fps, input) is already defined by Cua. A cheap JPEG snapshot RPC exists for lists: `SpaceService.GetSpaceThumbnail` (480 px, cached by the daemon, the app asks every 3 s).
6. Control = reopen the session with `SESSION_POLICY_ALLOW_ACTIVATION`; view-only = `SESSION_POLICY_VIEW_ONLY`. Policy is fixed per ticket, so switching means a new session (about 100 ms to first frame on loopback, reported by bench).
7. Audio exists (Opus, same socket, A/V sync within ±40 ms) but is off unless the OpenMedia request asks for it. The Cua Electron app never asks (`audio: false`).
8. `canvas.captureStream()` on the MediaSession canvas is feasible and already used in the repo (the viewer's recorder). Publishing to LiveKit as a screen-share is possible, but rendering locally next to the call video is simpler and cheaper.
9. Recommendation: (B) fresh Electron + Vite + React (Astryx). Do not fork cua-spaces-web/desktop: they need a Rust toolchain to build (`pnpm native`), use Tailwind + Base UI + shadcn-style components (violates Astryx rule), are FSL-licensed and tied to Cua account/relay flows.
10. Top risks: no prebuilt `cua` yet on this Mac, hidden-window throttling, FSL licence on the viewer code, local Space address/lifecycle owned by another research track, and unmeasured CPU for 4-6 tiles.

---

## 1. Streaming stack end to end

**Capture (inside the Space, cua-spacesd).**
- Linux Space: XShm + XDamage, damage-driven. A frame is produced only when something changes, never faster than `max_fps`. Idle desktop sends almost nothing (conformance budget 50 KB/s; measured about 0.4 KB/s). `verified` libs/cua-spacesd/docs/streaming-design-notes.md:7-18; MEDIA.md:120-121; libs/cua/bench/streaming/results/baseline-macos-arm64.md (`desktop-static` rows).
- Per-window capture without occlusion is supported (window targets). `verified` streaming-design-notes.md.
- macOS guest: ScreenCaptureKit. Windows: WASAPI for audio. `verified` MEDIA.md:430-434.
- The pointer is never in the frames; cursors travel separately (section 3). `verified` streaming-design-notes.md:16-18.

**Codec.**
- H.264 constrained baseline, no B-frames, SPS/PPS on every IDR, IDR only on demand (attach, loss recovery, resize). `verified` streaming-design-notes.md:21-28.
- Encoder in a Linux Space (what a Mac user gets from the default image `ghcr.io/trycua/linux:24.04`): OpenH264 software. VideoToolbox hardware encode only applies to macOS guests. NVENC/VA-API/QSV/AMF are detected but unused. `verified` docs/content/docs/spaces/guides/stream-a-desktop.mdx (Transport and codecs table); bench "Not run" list.
- Fallback codecs: raw BGRA (loopback only) and PNG. `verified` stream.proto:37-45.
- Decode: browser WebCodecs `VideoDecoder`, `prefer-hardware`, `optimizeForLatency: true`, falls back to software if the hardware decoder rejects before its first frame. `verified` mediaSession.ts (`configureDecoder`), webcodecs-slots.ts:82.

**Transport.**
- Default: WebSocket `ws://.../media?ticket=...` on spacesd port 3211; works through gateways and the relay. Optional direct QUIC on UDP 3212 (ALPN `rcdp/2`, certificate pinned). Browsers use WebSocket only. `verified` MEDIA.md:1-10, 55-72.
- Session setup is gRPC (`cua.env.v1.StreamService`: ListTargets, OpenMedia, SetPreferences, RequestKeyframe, CloseMedia). Video is NOT gRPC. `verified` MEDIA.md:3-4; stream.proto:24-34.
- Ticket: at least 128 random bits, base64url, TTL default 60 s, max 10 min, bound to one media session (target, codec, policy, principal). Safe in a URL. An attached socket stays open after expiry; the same ticket may re-attach until it expires. Max 8 sockets per session, 64 sessions per driver. `verified` MEDIA.md:45-80, 193-205.
- Wire format: JSON control messages `{"type","payload"}` plus length-prefixed binary video packets (`header_len u32`, `payload_len u32`, big-endian, JSON `VideoFrameDescriptor`); audio packets are 24-byte-header binary (`RAU2`). Server speaks first (`hello`, `session_opened`). First video packet on every attach is a keyframe. `verified` MEDIA.md:11-20, 83-100, 123-131, 250-275.
- Client parser lives in `libs/cua/crates/cua-spacesd-html5/web/src/core/mediaWire.ts` (459 lines, dependency free).

**Defaults, adaptive behaviour, latency.**
- `max_fps` 0 means 30; `max_dimension` 0 means native; `bitrate_kbps` 0 means encoder default (value not stated: `not found`). `verified` stream.proto:243-250.
- Measured by Cua's own bench: about 28 fps for changing content, glass-to-glass p50 10-25 ms, p95 about 20-32 ms, input-to-photon p50 about 34-36 ms, time to first frame 20-170 ms, client decode 0.3-1 ms per frame, loopback to a local container. `verified` as written in libs/cua/bench/streaming/results/baseline-macos-arm64.md; `unverified` on our hardware (their host reported 18 CPUs; ours is an M2 Max).
- Bandwidth: idle about 0.4 KB/s; text scroll about 20 KB/s; fullscreen video-like motion about 450 KB/s (about 3.6 Mbit/s). Same file.
- Adaptive: server rate control every 500 ms looks at the worst viewer (queue delay, ack RTT, drops). Congestion for 3 windows cuts bitrate 20 percent; fps only cut once bitrate is at its floor; at 1 s excess delay it halves both. Per-socket latest-frame queue, skip to keyframe on overflow, `frame_ack` window of about 2 s. `verified` streaming-design-notes.md:50-95.
- Cost on the host/Space (bench, percent of one core): server (spacesd in guest) about 2 percent static, 7-8 percent small damage, 15 percent scroll, 28-30 percent video motion (runc); under gVisor (runsc) roughly double (30-50 percent; container total up to 92 percent in video). Client decode 2-6 percent of a core (Rust client). Browser client in that bench: 15 percent of a core. `verified` as written in baseline file; `unverified` for M2 Max.
- Known gaps: no content-adaptive encoding, no FEC on WebSocket. `verified` streaming-design-notes.md:100-106.

**The "viewers".**
- Browser: `MediaSession` (this file's section 2). Node/Rust/Swift/Python get frames through the SDK (`Space.attachStream` delivers encoded frames; decoding is yours; `Space.streamSession` with decoding ships only with Cua Spaces and raises `HostCapabilityMissing` elsewhere). `verified` cua_sdk.ts:39484-39490, 39680-39687; stream-a-desktop.mdx.
- Also served by every cua-spacesd: a full HTML5 viewer at `http://<spacesd>:3211/viewer/` (ticket in the URL fragment `#ticket=`, from `SystemService.CreateViewerTicket`; open loopback needs none). Gives video, audio, input, clipboard, file drop. `verified` libs/cua/crates/cua-spacesd-html5/src/lib.rs:1-25; web/src/api.ts:16-106.

## 2. Minimal code: one Space's live stream in a React component

**What exists as a "ready" component:** there is NO published React component, web component or `<video>`-style element. `@trycua/cua/spaces/pip` gives a Document-PiP wrapper, `@trycua/cua/teleport` a drop-zone custom element; neither renders the stream. `verified` libs/cua/typescript/README.md; package.json exports map (`.`, `./spaces`, `./spaces/transport`, `./spaces/host`, `./spaces/pip`, `./spaces/presence`, `./spaces/routines`, `./spaces/groups`, `./teleport`, `./browser`). The stream renderer is source in the repo only:
- `libs/cua/crates/cua-spacesd-html5/web/src/core/{mediaSession.ts (810 lines), mediaWire.ts, h264.ts, audio.ts, audioWorklet.js, presenceLayer.ts}` (FSL-1.1-MIT).
- Cua's React glue to copy the idea from: `apps/cua-spaces-web/src/components/video/webcodecs-slots.ts` (552 lines, plain TS class creating a canvas per slot) and `use-video-slot.ts` (hook).

**Real import paths (npm side, MIT).**
- `@trycua/cua` 0.27.4, published 2026-11-13, MIT, optional native packages `@trycua/cua-darwin-arm64` etc. (270 MB unpacked, MIT AND MPL-2.0; contains the SDK dylib and the `cua` CLI per build-npm-packages.mjs:53). `verified` registry.npmjs.org JSON; libs/cua/scripts/build-npm-packages.mjs.
- `import { embedded, connect } from "@trycua/cua"`; `import { startThread, approve } from "@trycua/cua/spaces"`; `import { McpSession, McpHttpTransport } from "@trycua/cua/spaces/transport"` (dependency free, browser safe, talks to the daemon's loopback `/mcp` with bearer = daemon token); `import { PresenceView } from "@trycua/cua/spaces/presence"` (pure TS). `verified` typescript/README.md; src/spaces/transport/http.ts:1-60.
- The Node binding is not safe to load in Electron's main as published: UniFFI's N-API runtime uses external ArrayBuffers, which Electron 20+ rejects; Cua ships a patched `cua_node_runtime.node` for its own Electron app. `verified` libs/cua/scripts/build-node-runtime.mjs:1-12. Consequence: from Electron, use daemon HTTP/gRPC-Web surfaces or a plain Node child process, not `@trycua/cua` in main.

**How address and token are obtained (the path Cua's own Electron app uses).**
1. A `cua daemon` runs on the Mac and writes `$CUA_HOME/daemon.json` (default `~/.cua/daemon.json`): `loopback_url` (`http://127.0.0.1:<random port>`) and a random `token`. `verified` media-bridge.ts:26-40; libs/cua/crates/cua-daemon/src/server.rs:59-60 (defaults: `127.0.0.1:0`, random token, `~/.cua/daemon.json`).
2. Electron main POSTs gRPC-Web to `<loopback>/cua.daemon.v1.DaemonService/OpenMediaBridge` with `authorization: Bearer <token>`, body = frame of `{name: "<space id e.g. local:name>", open_media_json: <OpenMediaRequest JSON>}`. Response: `ws_url` (e.g. `ws://127.0.0.1:52011/v1/bridge/media?ticket=...`), `ticket`, `expires_at`, `open_media_response_json`. The spacesd token never reaches the renderer. `verified` media-bridge.ts:221-260; libs/cua/proto/cua/daemon/v1/daemon.proto:8-20, 141-160.
3. Request JSON per tier (proto3 JSON): tile = `{target:{displayId:"primary"}, geometryControl:"GEOMETRY_CONTROL_OBSERVE_ONLY", ticketTtl:"120s", maxFps:10, maxDimension:960, policy:"SESSION_POLICY_VIEW_ONLY"}`; full = same minus fps/dimension with `policy:"SESSION_POLICY_ALLOW_ACTIVATION"`. Add `audio:{enabled:true}` for sound (not in Cua's own request). `verified` media-bridge.ts:50-56; stream.proto:178-220 (AudioOptions).
4. Renderer: `new MediaSession({canvas, ticket:{wsUrl, ticketExpiresAt}, reopen: () => mintTicketViaIpc(), interactive, audio, hardwareAcceleration:"prefer-hardware", onFrame, onStatus, onGone})`; `session.start()`; teardown `session.stop()` (closes socket with 1000, closes decoder and audio). `verified` mediaSession.ts:195-281; webcodecs-slots.ts:391-445.
- Ticket TTL is only 60 s on the bridge (`bridge_ticket_ttl`); `reopen` is how the session re-mints after expiry or close code 4401. `verified` server.rs:42-60; mediaSession.ts:300-340 (scheduleRetry/reopen), MEDIA.md:180-191.

**Alternative ticket sources.** MCP tool `stream_endpoint` (via `McpSession` over `McpHttpTransport`, so the renderer needs only daemon URL + token handed over by main) returns `ws_url` with ticket. Its schema has `max_fps` but no `policy` or `max_dimension`, so it gives view-only full size. `verified` libs/cua/spaces-contract/manifest.json (`stream_endpoint`). For control or tiles, use `OpenMediaBridge`.

**Electron main must do:** (a) ensure a daemon is running (Cua's app runs `cua daemon start`), (b) read `daemon.json`, (c) expose one IPC method `openStream({spaceId, tier|mode, windowId?})` returning `{wsUrl, expiresAt}`. Nothing else for video. `verified` apps/cua-spaces-desktop/src/media-bridge.ts (`createStreamOpener`), docs/video.md:1-30.

**CSP, secure context, isolation.**
- WebCodecs needs a secure context. Cua's Electron app serves the UI from a privileged `cua-spaces://app/` scheme with `secure: true`. A Vite dev server at `http://localhost` is also a secure context. `verified` protocol.ts:21-33.
- CSP used: `connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https: wss:`, `worker-src 'self' blob:`, `script-src ... 'wasm-unsafe-eval'` (for their wasm core only), `media-src ... blob:`. We need `ws://127.0.0.1:*` in `connect-src`. `verified` protocol.ts:37-58.
- No cross-origin isolation or SharedArrayBuffer is required: MediaSession uses `VideoDecoder`, `AudioDecoder`, an AudioWorklet and plain `WebSocket`. `verified` by reading mediaSession.ts / audio.ts (no `SharedArrayBuffer`); `unverified` that no hidden use exists elsewhere (not grepped repo-wide).
- GPU decode: macOS Chromium decodes H.264 via VideoToolbox by default; no flags needed on Mac. `verified` apps/cua-spaces-desktop/src/gpu.ts:1-12.
- Set `webPreferences.backgroundThrottling: false` only if the stream must run in a hidden/occluded window (Cua instead stops sessions when `document.visibilityState === "hidden"` and reopens). `verified` webcodecs-slots.ts:469-480; window.ts:207.

## 3. Input and multiplayer

- Viewer to Space: `MediaSession` wires `pointermove` (throttled 16 ms), `pointerdown/up`, `wheel`, `keydown/up` on the canvas and sends `interactive_input` batches `{session_id, first_sequence, events[]}` on the same socket. Coordinates are normalised to the video content rect (handles letterboxing). Contiguous sequences, resync on `input_sequence_gap`. Acks via `onInputAck`. `verified` mediaSession.ts:300-330, 545-640; MEDIA.md:133-150.
- Keyboard capture: click focuses the canvas; ⌘ chords go to the Space (⌘ sent as Control to Linux/Windows Spaces via `metaAsControl`; whole-chord press+release on Mac); release chord Ctrl+Option alone on Mac (Ctrl+Shift+F12 elsewhere). Electron main must disable menu shortcuts while a canvas flagged `data-space-keyboard` has focus (`setIgnoreMenuShortcuts`). `verified` webcodecs-slots.ts:482-533; apps/cua-spaces-desktop/src/keyboard.ts.
- View-only vs control: policy is bound to the ticket. `VIEW_ONLY` refuses `interactive_input`; `BACKGROUND_ONLY` delivers input without activating or moving the real pointer; `ALLOW_ACTIVATION` may activate. `SetPreferences` has no policy field, so toggling means closing the slot and opening a new session with the other policy (Cua does this for tiles vs viewer and for `would_require_activation`). `verified` stream.proto:48-60, 380-395; webcodecs-slots.ts:426-433. Cheap variant: `interactive:false` on the client also blocks sending, but the server policy is the real gate.
- Separate cursors for human and agent: cursors are out of band in `PresenceService` (gRPC). Your own cursor is drawn locally; remote cursors (including agents, `agent: true`) arrive at 20 Hz (30 Hz datagram channel), are interpolated 100 ms behind. The agent's cursor appears when its driver session acts; it disappears when the run ends or after 15 s idle. Drawing layer: `presenceLayer.ts` (290 lines, same folder as MediaSession); joining needs `Space.joinPresence` (native SDK) or gRPC-Web `PresenceService.Join` (the HTML5 viewer does this in `web/src/presence.ts`). `verified` libs/cua/proto/PRESENCE.md:1-80; apps/cua-spaces-web/src/components/video/presence.ts:1-60.
- Arbitration between a human and an agent on the same window: per-window input leases; a window held by another principal refuses input until idle 5 s. Agent input goes through cua-driver background delivery (XSendEvent on Linux) that does not move the real pointer. For the whole-desktop target the lease behaviour is `unverified` (only per-window leases are documented). `verified` streaming-design-notes.md:80-92 and docs/architecture.md:99-104.
- Nice-to-have for our UI: "agent is working" = no human input sent; "take over" = open a `full`/ALLOW_ACTIVATION session; "hand back" = close it and return to tile/view-only. A pause signal to the agent is Cua-harness specific (`agent_interrupt` MCP tool exists: `verified` manifest tool list).

## 4. Many Spaces at once

- Cua's own grid streams tiles live only for tiles near the viewport, one `MediaSession` (socket, decoder, canvas) per tile at 10 fps / 960 px / view-only; the comment says a grid of 200 would decode 200 desktops. The macOS notch tiles use JPEG thumbnails, not video. `verified` apps/cua-spaces-web/src/components/video/tile-video.ts; media-bridge.ts:50-53; apps/cua-spaces-macos/README.md (notch "live thumbnails").
- Per-tile cost: idle desktop is a few hundred bytes/s and server CPU about 2 percent (runc) to 20 percent (runsc) of a core per bench; a changing tile at 10 fps is a fraction of the 28 fps numbers. 4-6 tiles plus one focused stream is therefore plausible, but total CPU on an M2 Max is `unverified` (no multi-session bench found). Note the Space's capture/encode runs inside the guest VM on our Mac, so it counts against the host CPU.
- Cheap snapshot API: YES.
  - `cua.daemon.v1.SpaceService/GetSpaceThumbnail {space, max_age}` returns JPEG bytes + width/height + `captured_at`; the daemon keeps a shared cache and refreshes running Spaces about every 90 s once asked. The app's policy: open tiles every 3 s, 480 px long edge, background 90 s. `verified` libs/cua/proto/cua/daemon/v1/spaces.proto:165, 883-904; cua-spaces-app-core/src/spaces/mod.rs:28-32; spaces/cover.rs:203-217. Same gRPC-Web call pattern as `OpenMediaBridge` (reuse the helper in media-bridge.ts; only `name` changes to `space`, plus a Duration for `max_age`).
  - SDK form: `Space.thumbnail(maxAgeMs)` (native binding), `Space.windowThumbnail(windowId, epoch, maxDimension)` (a few seconds cache). `verified` cua_sdk.ts:39711-39752.
  - Lower level: `cua.env.v1.ComputerService/Screenshot` on the Space itself (display or window, `format` png/jpeg/webp, `quality`, `max_dimension`, `include_cursor`). `verified` computer.proto:22, 50-71. Reachable through the daemon env passthrough (`ConnectSpace`: `/v1/spaces/<base64url id>/env`, daemon bearer only). `verified` libs/cua/crates/cua-spaces/README.md:127-131. Exact request routing: `unverified` (not exercised).
- Recommended: list view = `GetSpaceThumbnail` every 3-5 s for visible rows (no sockets); chat side panel = one `tile`-tier or `full`-tier stream for the selected employee only.

## 5. Audio from a Space

- Yes, streamed on the same socket as video: Opus 48 kHz stereo, 20 ms frames, FEC and DTX on by default, shared microsecond clock, A/V skew budget ±40 ms (bench measured -9 to -67 ms). Off unless requested (`AudioOptions.enabled`). Playback: `AudioDecoder` + AudioWorklet inside MediaSession (`audio: true` option, `setAudioMuted()`). `verified` MEDIA.md:207-440; stream.proto:178-235; mediaSession.ts:59-60, 281-283; bench baseline `avsync` rows.
- Sources: Linux Spaces use a PipeWire null-sink monitor (needs the Linux Spaces image; per-app capture also PipeWire); macOS guests ScreenCaptureKit audio. `verified` MEDIA.md:428-440; stream-a-desktop.mdx callout.
- Uplink (our microphone into the Space) exists but needs policy other than view-only and the `audio.uplink` feature. `verified` stream.proto:221-240. Not needed for the brief.
- The Cua Electron app passes `audio: false`; we would pass `audio:{enabled:true}` in the OpenMedia JSON and `audio: true` to MediaSession. `verified` webcodecs-slots.ts:416-417.
- Whether the default Linux image really has working PipeWire audio on a Mac host: `unverified`.

## 6. Getting the stream as a MediaStream (LiveKit "screen share")

- MediaSession draws every frame (`ctx.drawImage(frame, 0, 0)`) into a 2D canvas it was given. So `canvas.captureStream(fps)` yields a `MediaStreamTrack`. `verified` mediaSession.ts (`configureDecoder` output callback); the HTML5 viewer's skill recorder already does `canvas.captureStream(30)` + `MediaRecorder` at 4 Mbit/s on that same canvas (web/src/recorder.ts:133-135).
- LiveKit: `room.localParticipant.publishTrack(mediaStreamTrack, { source: Track.Source.<...> })` publishes a track from any source. `verified` https://raw.githubusercontent.com/livekit/client-sdk-js/main/README.md ("Publish tracks from any source"). The README example uses `Track.Source.Camera`; using `Track.Source.ScreenShare` (and wrapping in `LocalVideoTrack`) is `reported`/`unverified` here (docs page for screen share did not cover custom tracks).
- Caveats: canvas capture only emits frames when the canvas changes (static desktop is fine, the encoder just idles); a hidden or occluded Electron window throttles the canvas and can stop frames (use `backgroundThrottling:false` or keep the call window visible); re-encoding H.264 to VP8/H.264 for WebRTC costs CPU on top of decode (not free). `unverified` on cost.
- Simpler and cheaper: the call screen is our own Electron renderer. Render the Space view locally (`<SpaceView>` canvas) beside the avatar's video element (a LiveKit remote track or Synthesia/Anam stream). No re-encode, no extra sockets. Publish the canvas into the room only if another party (a recorder, a server-side agent) needs to see it. Recommend local render.

## 7. The user's own main screen

- Cua path exists: a computer can "share its own desktop as a Space" (`relay:<machine-id>` or `direct:<host:port>`); same streaming and input stack, ScreenCaptureKit capture on macOS, needs Screen Recording + Accessibility permission, and `cua host setup` (installs cua-spacesd as a service; it joins the Cua relay when signed in; a `--direct` mode with a token exists). Cua's own app deliberately does NOT stream "This Mac" inside the app ("the screen in front of you would only mirror itself"). `verified` docs/content/docs/spaces/concepts/machines-and-spaces.mdx; apps/cua-spaces-web/src/components/space-detail/this-mac-desktop.tsx:1-60; apps/cua-spaces/README.md ("This computer"). Whether it works end to end with no Cua account: `unverified`.
- For a live copy of our own screen in the call UI, the cheaper path is the OS capture API: Electron `desktopCapturer` / `getDisplayMedia` returns a `MediaStream` directly (needs macOS Screen Recording permission for our app). `reported` (Electron docs, not fetched in this task).
- Giving an employee control of the real screen is a Cua Driver topic (other agent).

## 8. The existing apps

All four apps are FSL-1.1-MIT (Functional Source License, MIT future licence). Permitted purpose = anything except a "Competing Use": making the Software available in a commercial product or service that substitutes for it or offers the same or substantially similar functionality. Internal use, education and non-commercial research are permitted. Each version converts to MIT on the second anniversary of its release. `verified` apps/cua-spaces-web/LICENSE:87-90 (the other apps carry the same FSL header; not each read in full), legal/LICENSING.md. By contrast `libs/cua` (SDK, `cua` CLI, `cua daemon`), `@trycua/cua` and `examples/streaming/*` are MIT. A hackathon agent-manager app is not an obvious competing use, but forking the app shell wholesale moves us closest to "same functionality"; copying small pieces is lower risk. Not legal advice.

### cua-spaces-web (React web UI shared by all shells)
- What: Computers, Agents, Keyvault, Settings, onboarding, Space page with live desktop + thread (chat) with `CallSplit` (desktop above or beside the thread), mini player, members, composer. `verified` apps/cua-spaces-web/README.md; src/components/space-thread/call-split.tsx.
- Stack: React 19, TanStack Router, Zustand, Tailwind v4, `@base-ui/react`, class-variance-authority, lucide-react, i18next, Vite 8, TypeScript 7, pnpm 11, React Compiler. `verified` package.json. This conflicts with Astryx-only.
- Talks to the daemon only through `src/bridge` (one operation table, adapters: demo, electron, webkit (SwiftUI), tauri). It also loads the Rust app core as wasm (`pnpm core`, needs `wasm32-unknown-unknown` and `wasm-bindgen-cli 0.2.126`; `dev` and `test` skip it with TS fallbacks, `build` requires it). `verified` src/bridge/README.md; README.md.
- Renders streams with `webcodecs-slots.ts` + MediaSession imported by a relative path out of the repo (`../../../../../libs/cua/crates/cua-spacesd-html5/web/src/core/mediaSession`). `verified` webcodecs-slots.ts:54.
- Run: `pnpm install --ignore-workspace && pnpm dev` (port 5174; demo mode with in-memory data, `?bridge=demo`). Without an Electron/Swift host it cannot stream (the demo adapter has no video). `verified` README.md; bridge/ops/stream.ts.

### cua-spaces-desktop (Electron shell)
- What: Electron 44.9.1 shell that loads cua-spaces-web from `cua-spaces://app/`; the main process is a native host answering the same bridge methods as the SwiftUI app using a Rust library (`cua-spaces-ffi`) loaded in Node; tray, notch helper, PiP windows, updater (electron-updater), Sentry, signing/notarization config. `verified` apps/cua-spaces-desktop/README.md, package.json.
- Talks to the daemon: Rust FFI library for most operations; plain gRPC-Web fetch to the daemon loopback for the media ticket (`media-bridge.ts`); `daemon.json` for discovery. Starts/supervises `cua daemon`.
- Build/run: `pnpm install`, `pnpm native` (builds `libcua_spaces_ffi.dylib`, patched `cua_node_runtime.node`, and the Spaces `cua` CLI via cargo for the host target, Rust 1.97 pinned), build cua-spaces-web, `pnpm build && pnpm start`. "Without it a normal launch says so and quits: there is no sample data." `verified` README.md (Native layer section). Needs cargo, which is not installed here.
- Reusable verbatim idea/files: `src/media-bridge.ts` (310 lines, pure TS, no Electron import, unit tested with fake fetch), `src/keyboard.ts` (menu-shortcut suppression), `src/gpu.ts` (decode switches), `src/protocol.ts` (CSP), `src/pip.ts`.
- Size: arm64 app 242 MB (Electron 238 MB); cold start median 336 ms (placeholder page). `verified` README.md Measurements.

### cua-spaces (Tauri 2 core)
- What: Tauri app: main window, menu bar item, notch panel, separate Space viewer windows (`src/viewer/SpaceViewer.tsx`, `WindowStream.tsx`), PiP, teleport picker. Rust `cua-spaces` is linked in-process and also hosts the wasm core used by cua-spaces-web. React 19 + Vite, i18next, no component library listed. Needs Rust 1.97 and Tauri prerequisites. Releases ship it for Linux and Windows only; macOS ships the SwiftUI app. `verified` apps/cua-spaces/README.md, package.json.
- Streams: asks for a media ticket (`open_space_stream`), webview attaches, WebCodecs H.264 with BGRA/PNG fallback, Opus via AudioDecoder + AudioWorklet. `verified` README.md "Streams".
- Not a fit: Rust build, Linux/Windows release focus.

### cua-spaces-macos (Swift)
- What: macOS 26 SwiftUI shell that hosts the same cua-spaces-web in a `WKWebView` and draws video natively (VideoToolbox surfaces over the page); menu bar extra, notch panel, Keychain/Touch ID, Sparkle updater. Links the UniFFI Swift binding `CuaSDK` (built with cargo). Build: `cargo build -p cua-sdk-native` + `swift build` / `scripts/build-app.sh`; also needs Xcode and xcodegen for UI tests. `verified` apps/cua-spaces-macos/README.md.
- Not a fit: React/Astryx cannot reskin native Swift views; web UI inside it is still Tailwind/Base UI.

### "Agent threads" in the Spaces app
- Meaning: a Space has one append-only conversation (the thread) shared by people and agent members; an `@name` wakes an agent. An agent is a coding-agent CLI harness started as a detached, tagged process inside the Space through cua-spacesd's process API (no tmux). Harness ids: claude-code, gemini-cli, google-antigravity, goose, hermes, openai-codex, openclaw, opencode, pi. `verified` libs/cua/typescript/src/spaces/thread.ts:1-60; docs/content/docs/spaces/guides/agents-in-a-space.mdx; libs/cua/crates/cua-spaces/README.md ("Agents run as detached, tagged spacesd processes").
- Placement is an explicit choice: `{type:"dedicated"}` (its own Space; matches one Space per employee) or `{type:"shared", acknowledgeNoIsolation:true}`. `verified` thread.ts:75-110.
- Chat wiring: daemon tools over MCP: `thread_read`, `thread_post`, `agent_members`, `agent_add`, `agent_start`, `agent_message`, `agent_events`, `agent_status`, `agent_interrupt`, `agent_send`, `persistent_agent_*`; the web app maps them in `apps/cua-spaces-web/src/bridge/ops/thread.ts` and `agent-threads.ts`; the thread author is stamped by the owner daemon (relay account id, or `owner` when not signed in). Agents do not talk to each other unless `@`-mentioned (max 3 hops, 20 wakes/min per Space). `verified` ops/thread.ts:1-50; agents-in-a-space.mdx; manifest tool names.
- Named agents have memory in "Cua Volume" and can run on schedules; notifications arrive when a turn ends. `verified` agents-in-a-space.mdx.
- Reusable for our loop? The mechanism (harness CLI inside the Space, `agent_send`/`agent_events`, thread log) could be our employee runtime and gives "message the user by itself" via notifications, but it is tied to Cua's harness list, Volume and (partly) account-stamped identity. Whether the MIT npm daemon exposes all `agent_*`/`thread_*` tools without the Spaces build: `unverified` (the npm daemon is built from MIT `cua-daemon` with the `spaces` feature; the FSL `cua-spaces-ext` provides persistent agents). This overlaps the runtime-research agent; do not decide here.

## 9. Recommendation: (B) fresh Electron + Vite + React (Astryx)

Why not (A):
1. Build risk overnight: Electron shell needs a Rust 1.97 build (`pnpm native`), a patched N-API runtime, wasm-bindgen 0.2.126 for the web UI build, pnpm 11 and TypeScript 7. None of cargo/pnpm exists on this Mac. Large, bleeding-edge dependency graph.
2. UI-library conflict: Tailwind v4 + Base UI + cva + lucide throughout cua-spaces-web violates the Astryx-only rule; reskinning means rewriting every screen.
3. Coupling: bridge protocol, onboarding, relay sign-in, Keyvault, teleport, updater, Sentry telemetry, Cua account flows. We use maybe 5 percent.
4. Licence: forking the FSL apps wholesale is closer to a "Competing Use" than copying a viewer class.

(B) concrete plan:
- Dependencies: `electron`, `vite`, `react`, `@astryxdesign/core`, `@astryxdesign/theme-neutral`; optional `@trycua/cua` (MIT) used ONLY via `@trycua/cua/spaces/transport` (dependency free) or its `cua` CLI binary (`@trycua/cua-darwin-arm64`, 270 MB) to start the daemon. No native Node module in Electron main.
- Copy into our repo (keep FSL header; credit):
  - `libs/cua/crates/cua-spacesd-html5/web/src/core/mediaSession.ts`, `mediaWire.ts`, `h264.ts`, `audio.ts`, `audioWorklet.js` (about 1,900 lines, no runtime deps). Add `presenceLayer.ts` only if we draw the agent cursor.
  - `apps/cua-spaces-desktop/src/media-bridge.ts` (310 lines; or rewrite the 100 essential lines).
  - Ideas only: `webcodecs-slots.ts` (slot lifecycle, visibility pause, parking), `key-capture.ts`, `keyboard.ts`.
  - Licence-clean alternative: rewrite a smaller MediaSession from MEDIA.md and the MIT `examples/streaming/typescript-web/app.js` (558 lines: subprotocol `rcdp.v2, cua.ticket.<ticket>`, WebCodecs, canvas). Costs about half a day; avoids FSL entirely. Decide with the user; default is copy with header for the hackathon (internal/non-commercial).
- Astryx gap: Astryx has no video/canvas surface component (`npx astryx search "video canvas stream"` found only Lightbox and hooks). Compose an Astryx layout container and attach the raw `<canvas>` imperatively via ref; run `npx astryx gap-report` and tell the user, per AGENTS.md. Use `useResizable` (exists) for the chat/desktop split.

## Recommended approach for AgentManager

```
Renderer (React + Astryx)                Electron main                    Mac
<SpaceView spaceId mode>  --ipc-->  stream:open({spaceId,mode})  --gRPC-Web--> cua daemon (127.0.0.1:<port>)
   |  canvas + MediaSession                                         OpenMediaBridge (bearer from ~/.cua/daemon.json)
   +--------- ws://127.0.0.1:<port>/v1/bridge/media?ticket=... ----------------> relay --> cua-spacesd in the Space (:3211 /media)
```

Component sketch (TypeScript, Astryx wrapper, raw canvas inside):

```tsx
// SpaceView.tsx
type Props = {
  spaceId: string;                 // "local:<name>" from the registry
  mode: "view" | "control";        // view = tile or full + VIEW_ONLY, control = ALLOW_ACTIVATION
  tier?: "tile" | "full";          // tile: 10 fps / 960 px (thumbnail strip), full: native size
  audio?: boolean;                 // default false
  onStatus?: (s: "connecting" | "live" | "failed" | "ended") => void;
  onCanvas?: (c: HTMLCanvasElement) => void; // e.g. captureStream for the call
};
```

- Lifecycle (`useEffect` keyed on `spaceId, mode, tier, audio`): create `<canvas>`, append into an Astryx container via ref; `ipc.openStream({spaceId, mode, tier, audio})` -> `{wsUrl, expiresAt}`; `new MediaSession({canvas, ticket, reopen: () => ipc.openStream(...), interactive: mode==="control", audio, hardwareAcceleration:"prefer-hardware", metaAsControl: macHostToLinuxSpace, wholeCommandChords: mac, scrollNeedsFocus: true, onFrame -> set live, onStatus/onGone -> failed, onInputAck})`; `session.start()`. Cleanup: `session.stop()`, remove canvas. Changing `mode` tears down and reopens (policy is per ticket).
- Visibility: stop the session on `visibilitychange` hidden, reopen on show (copy the logic from webcodecs-slots.ts:469-480); tiles only when on screen; max about 4-6 live tiles.
- Main process: `ipc.openStream` maps `{mode, tier, audio}` to the OpenMedia JSON (section 2 step 3) and calls `OpenMediaBridge` (code from media-bridge.ts). Also `ipc.thumbnail(spaceId)` calling `SpaceService/GetSpaceThumbnail` (JPEG as `Uint8Array`), cached in the renderer as `Blob` URLs. Menu-shortcut suppression: renderer tells main when a canvas with `data-space-keyboard` has focus; main calls `webContents.setIgnoreMenuShortcuts(true)`.
- Chat side panel: `<SpaceView mode="view" tier="full">` next to the Astryx chat, switchable to `mode="control"` with a button ("Take over"); a "release" key chord (Ctrl+Option on Mac) blurs the canvas.
- Call screen: render `<SpaceView mode="view">` locally next to the avatar video; use `onCanvas` + `canvas.captureStream(15)` only if the screen must be published into a LiveKit room (then `publishTrack(track, {source: Track.Source.ScreenShare})`, `unverified` enum use).
- List view: Astryx List rows with `GetSpaceThumbnail` JPEG every 3-5 s for visible rows; optional 1 live tile on hover.
- Agent cursor: optional, via `PresenceView` (`@trycua/cua/spaces/presence`) + `presenceLayer.ts` + gRPC-Web `PresenceService.Join`; skip for the overnight build unless time allows.

**Fallback path (stream viewer not embeddable):**
1. Embed the Space's own HTML5 viewer (full video, audio, input): `http://<spacesd>/viewer/#ticket=<CreateViewerTicket>` in an Electron `WebContentsView` (not an iframe: Cua's CSP uses `frame-src 'none'`; ours can differ). Needs the local Space's spacesd address (via daemon `ConnectSpace` passthrough or a forwarded port): `unverified` how to obtain it from the daemon without the SDK. `verified` that the viewer is embedded in every spacesd (lib.rs). The Cua mobile app does this ("the daemon's HTML5 viewer in a web view"). `verified` apps/cua-spaces-mobile/README.md.
2. Polling snapshots: `GetSpaceThumbnail` (max_age 0 forces capture; JPEG, default 480 px) at 1 fps is sane; or `ComputerService.Screenshot` with `format: JPEG, quality 70, max_dimension 960`. Per-call cost: `not found` (no benchmark). The daemon cache means many readers share one capture. No input path except MCP/driver tools.
3. VNC/noVNC: the default Cua Linux Space does not expose VNC. Only the test image `plain/ubuntu-xfce-vnc` (Xvnc :5901) and macOS Lume VMs ("view over SSH and VNC") do. `verified` libs/images/README.md:8, sandbox-images.json:344. Not a general fallback.

## 10. Risks and unknowns

1. No `cua` on this Mac. Streaming needs a running `cua daemon` and a Space (local runtime: Linux container needs a container runtime/VM, not installed: no docker). Runtime owner (other agent) must confirm what `npm i @trycua/cua` alone provides (`cua daemon start`, `cua sb create`). `unverified`.
2. Published daemon feature set: the npm `cua` is the MIT `cua-cli`, not the Spaces build. `OpenMediaBridge`, `GetSpaceThumbnail` and `SpaceService` are in the MIT `cua-daemon` (feature `spaces`, default on), so streaming should work; `agent_*`/`thread_*`/persistent-agent tools may need the FSL extension. Quick check: start the daemon, read `daemon.json`, POST `GetInfo`/`OpenMediaBridge`. `unverified` on a live daemon.
3. Licence: `MediaSession`, `media-bridge.ts` and the apps are FSL-1.1-MIT; copying is fine for a hackathon/internal use but flag it to the user. MIT alternative exists (rewrite from the MIT example).
4. CPU/thermals: software OpenH264 encode inside the guest VM on the Mac host, per Space. Bench shows 2-30 percent of one core per active Space on their host. 4-6 live tiles of busy Spaces could cost multiple cores. Mitigation: tiles use JPEG snapshots; only the focused Space streams; stop sessions when hidden. `unverified` on M2 Max.
5. Window throttling and hidden windows: canvas and decoders stall in hidden/occluded Electron windows; the call screen and chat stream need a visible window or `backgroundThrottling:false`.
6. Ticket lifetimes: bridge ticket 60 s; `reopen` must be wired or long sessions end after a drop. Policy switch = new session.
7. Input conflicts between user and agent on the whole-desktop target are not documented (only per-window leases). Agent cursor visibility needs presence wiring.
8. Audio on the default Linux image (PipeWire) on a Mac host not verified; call-screen audio may be silent.
9. Astryx has no canvas/video component: raw `<canvas>` inside an Astryx container is a rule gap to report (`npx astryx gap-report`).
10. How a local Space's cua-spacesd address/token is obtained without the native SDK (for the HTML5-viewer fallback) is not resolved here.

## Open questions for the orchestrator

- Which licence posture: copy FSL `MediaSession` with attribution (default), or rewrite from the MIT example?
- Who owns the daemon/Space lifecycle code (runtime agent) so `stream:open` can rely on `listSpaces`/`create`?
- Do we need the agent's cursor on the live view, or is the guest's own cursor overlay enough? (Cursors are out of band: frames never contain them.)
- Should the call screen publish the Space into LiveKit, or render locally? (Recommended: local.)
