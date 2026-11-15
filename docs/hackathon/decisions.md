# Decisions and open questions (append only)

Format: `ID · date · source · decision · why`. Never delete entries; to change one, add a new entry that supersedes it.

## Decisions

- **D-001 · 2026-11-14 · user** · All front-end work must use **Astryx** (`@astryxdesign/core` + neutral theme), with no other UI library and no exceptions. · Hard requirement for the hackathon; also tied to the Figma sub-track. Installed and enforced in `AGENTS.md`.
- **D-002 · 2026-11-14 · user** · Design must be professional, clean, uncluttered, with minimal text, and stand out. · Needed to be eligible for the Figma prize and to impress judges.
- **D-003 · 2026-11-14 · user** · Entering the **Imperial AI Hack** under the main track **Autonomous Agents**. · See [tracks.md](tracks.md).
- **D-004 · 2026-11-14 · user** · Sub-tracks targeted: **Figma**, **Databricks bounty**, **Synthesia**. · Prize targets; see [subtracks.md](subtracks.md).
- **D-005 · 2026-11-14 · user** · The Databricks integration must fit seamlessly, add little cost, not hurt operational ease versus the alternative, and not disturb the design. The planning/design agent must **browse the web** to choose how. · User constraint on D-004.
- **D-006 · 2026-11-14 · user** · `docs/hackathon/` is the shared source of truth for all agents. Agents read it first and write requirements, plans and findings back into it. · Prevents lost context between agents.
- **D-007 · 2026-11-14 · assistant** · Working hypothesis for Databricks: log agent runs, steps and cost to Delta tables (SQL Statement API and/or MLflow Tracing) and surface them in the UI; consider hosting as a Databricks App or adding Genie only if Free Edition limits allow. · **Not final.** The design agent must validate or replace it after web research.

- **D-008 · 2026-11-14 · user** · Product brief received: a Mac app to hire and manage AI employees, each with its own Cua Space desktop, persona, chat, live screen and video call. Full text in [brief.md](brief.md). Answers Q-001 and Q-003. · The user's voice brief.
- **D-009 · 2026-11-14 · user** · **Cua** (https://github.com/trycua/cua) is non-negotiable: one Cua Space per employee, desktop tools through Cua Driver. Local copy at `vendor/cua/` (shallow clone, commit `0147fb8d`, 2026-11-14). · Core of the idea.
- **D-010 · 2026-11-14 · user** · Reuse, do not rewrite: fork or copy popular open-source repos for the long-horizon agent harness and refactor the connectors. Every candidate repo gets a local copy under `vendor/_research/` and a sub-agent study before it is chosen. · Speed and fewer surprises.
- **D-011 · 2026-11-14 · user** · Orchestration: the main agent (Claude Fable) plans, designs and steers; **all sub-agents are Sonnet**. The build must be one-shottable overnight, fully documented, then tested end to end and iterated. · The user sleeps during the build.
- **D-012 · 2026-11-14 · user** · Scope guard: no prompt-injection hardening or other extras. Build only what the vision needs. · Hackathon time.
- **D-013 · 2026-11-14 · user** · Group meeting is wanted, but if multi-party turn-taking is too complex, drop it and keep the one-to-one video call (moving face, voice, live screen). · User's stated fallback.
- **D-014 · 2026-11-14 · user** · Avatar and voice provider is the planner's choice between Synthesia, ElevenLabs, Anam and fal, by fit with the tracks. Supersedes the "wait for the user's brief" note on Synthesia. · User delegated the choice.
- **D-015 · 2026-11-14 · assistant** · Research sub-agents write one file each under `docs/hackathon/research/`; only the orchestrator edits `decisions.md`, `plan.md`, `research-log.md` and `brief.md`. · Avoids edit collisions between parallel agents.

- **D-016 · 2026-11-14 · assistant** · Agent harness: the **Claude Agent SDK** (TypeScript, 0.3.325) as a library, one long session per employee, running on the host with only Space-bound tools. Fallback: `pi` behind the same `EmployeeRuntime` interface. · It is the only candidate with approval callbacks, steering, compaction, resume and budgets out of the box, and Cua ships a working example on it. See `research/04-agent-harness.md`.
- **D-017 · 2026-11-14 · assistant** · "Meta Muse", "OpenAI dots" and "Claude Duet" are real closed products (Sept to Oct 2026). Nothing to fork; D-010 is met by reusing the SDK, Cua's driver, Cua's stream viewer and Synthesia's quickstart. · `research/04-agent-harness.md` section 1.
- **D-018 · 2026-11-14 · assistant** · Desktops are **Linux Cua Spaces** by default (one per employee, 2 CPUs and 3 GB each), consumed through the npm package `@trycua/cua@0.27.4`, with no installer and no Cua account. macOS Spaces are capped at two running by Apple and need a 24 GB pull, so they are a stretch. **Pending the user (plan section 10, item 2).** · `research/01-cua-spaces-runtime.md`.
- **D-019 · 2026-11-14 · assistant** · We build our own Astryx app and do not fork Cua's apps (they need a Rust build and carry another UI kit). We copy only Cua's browser stream viewer (FSL-1.1-MIT, kept in one folder with a notice). `vendor/cua` stays out of git. · `research/02-cua-streaming-and-apps.md`.
- **D-020 · 2026-11-14 · assistant** · Architecture: a local Node daemon ("office") holds all state and exposes HTTP and WebSocket on 127.0.0.1; the Astryx renderer talks only to it and also runs in a browser tab; Electron is a thin shell; a Python worker handles calls. Mock mode (scripted employees, fake desktops) is a full implementation behind the same interfaces. · Testable without the GUI, survives the window closing, lets agents build in parallel. `plan.md` section 3.
- **D-021 · 2026-11-14 · assistant** · Per-employee permissions are feasible and are enforced in our own harness: three levels (asks first, asks before big steps, works independently) and four switches (internet, commands, my screen, teammates). Answers brief item 8. · `research/03-cua-driver.md` section 10, `spec/employee-runtime.md` section 6.
- **D-022 · 2026-11-14 · assistant** · Lending the user's real screen is feasible (host Cua Driver attached to one employee at a time, time-boxed, revocable) but needs an installer and two macOS permission clicks, so it is a stretch item. **Pending the user (item 4).** Answers brief item 9. · `research/03-cua-driver.md` section 4.
- **D-023 · 2026-11-14 · assistant** · Avatar and voice: **Synthesia** Interactive Avatars for the face (the bounty in our track), a Python LiveKit Agents worker, our own "call mind" as the brain, speech from LiveKit's included speech, Deepgram or ElevenLabs. Audio-only is built first. Faces come from a cast of about 8 synthetic avatars because Synthesia cannot animate a generated face. **Pending the user (item 1).** Resolves D-014. · `research/05-avatar-voice.md`.
- **D-024 · 2026-11-14 · assistant** · Summon meeting is built in a staged form: one room, one avatar session that swaps faces, our router picks one speaker at a time (clicked tile, spoken name, or best fit by role). Raise hand is a stretch. One-to-one remains the fallback (D-013). · `research/05-avatar-voice.md` section 6.
- **D-025 · 2026-11-14 · assistant** · Databricks: local SQLite is the source of truth, mirrored to Delta tables through the SQL Statement API; the Team view reads the warehouse with a local fallback; "Ask about your team" uses Genie; one MLflow trace per task is a stretch. Hosting the employees' model on Databricks is ruled out. Replaces the hypothesis D-007 and answers Q-004. · `research/06-databricks.md`.
- **D-026 · 2026-11-14 · assistant** · Design rulings: ink accent (the neutral theme's own; verified in a render), the portraits are the only colour, `lucide-react` icons passed as values, docked call control bar, one `Stage` for calls and meetings, no charts, no StyleX, only the ten clean templates. Raw elements limited to `<video>`, `<canvas>`, `<img>` in one folder. · `design/rulings.md`.
- **D-027 · 2026-11-14 · assistant** · Employees default to `claude-sonnet-5-5`; the call mind, described-role hiring and tests use `claude-haiku-5-5`. An Anthropic API key is required (a Claude subscription login is not permitted for products built on the SDK). **Pending the user (item 3).** · `research/04-agent-harness.md`, `plan.md` section 11.
- **D-028 · 2026-11-14 · assistant** · The build runs in phases with ten Sonnet workstreams in one working tree with disjoint folder ownership; the orchestrator is the only committer and verifies every acceptance check itself. · `plan.md` section 7, `spec/workstreams.md`.

- **D-029 · 2026-11-14 · user** · Scope decisions: (1) faces are a cast of 8 Synthesia avatars; (2) all desktops are Linux, no macOS desktops; (3) employees default to Sonnet 5.5; (4) lending the real screen is a stretch, built after everything else. Closes Q-008 to Q-011 and confirms D-018, D-022, D-023, D-027. · Asked through the decision dialog after the plan was written.
- **D-030 · 2026-11-14 · assistant** · The plan was reviewed by an independent sub-agent against the real package types (`build/plan-review.md`). Consequences: the foundation phase is split in three (W0a, W0b, W0c); no file-watchers and one shared Cua daemon during the build; SDK turn and budget caps are backstops and the per-task budget lives in our supervisor; desktop tools are loaded up front (`alwaysLoad`, tool search off); the employee subprocess gets an allowlisted environment and absolute paths; a desktop restart restarts the runtime with `resume`; MLflow gives one trace per employee session, not per task (amends D-025); the team is capped at the cast size (8). · Found before any code was written.

- **D-031 · 2026-11-14 · assistant** · After the live Cua test (`research/08-cua-live-spike.md`): office uses Cua's embedded runtime with no daemon; "desktop off" is suspend because Cua's `stop` wipes files; employees get an explicit allow-list of 28 desktop tools (the driver also exposes Space-management and public-share tools, which are removed); browser automation uses Firefox through the accessibility tree and foreground keys (the CDP `browser_*` tools are left out); the team is capped at 4 on this Mac (about 2 GB of memory per desktop); a health check rebuilds a desktop lost to a runtime crash. Amends D-018 and D-030 (no shared daemon; team cap 4, not 8). · Measured on this machine.

- **D-032 · 2026-11-14 · user** · The orchestrator may commit locally and push as progress is made. Spending cap on the Anthropic key for the night: $50. Submission deadline: 12:00 on 2026-11-15; the app should be fully functional by 08:00; the demo is a video, not live. Closes Q-005 (deadline and format), Q-010 (cap) and Q-012. · User's reply after the build started.

- **D-033 · 2026-11-14 · user** · After seeing the build: the front end must be taken further, "all out" for the Figma prize, across the whole app. Keep Astryx. **Custom components are allowed where we need them.** The call layout is wrong: the type box must sit at the bottom, not mid-column. No change to functionality. An Opus sub-agent may be used for this design work (an exception to D-011, which keeps build agents on Sonnet). · User's feedback during the build. Direction in `design/polish-brief.md`; custom visuals are built from Astryx components plus token-only CSS attached through `data-am-*` attributes, so `astryx doctor` stays at zero findings.

- **D-034 · 2026-11-15 · user** · The app is named **Deskmates** (replaces the working name "Agent Manager"). The logo is a two-by-two grid of rounded squares in blue, orange, pink and green, each with a small darker dash, on a dark ground (the user's reference is `design/brand/reference-from-user.png`): made from scratch, professionally, "tweaked slightly" to look as good as possible, by a Sonnet sub-agent. · User's message during the build. The four logo colours also become the first four personal tints of employees, so the brand and the interface share one palette.

## Open questions

- **Q-001 · What does the app do?** ~~The user will brief us.~~ **Answered 2026-11-14 by D-008, see [brief.md](brief.md).**
- **Q-002 · Figma eligibility.** Does using Astryx count for the Figma prize, as the user understood it? No public rule text found. Ask the organisers or the Figma sponsor and record the answer. Owner: user.
- **Q-003 · How is the Synthesia avatar used?** **Answered 2026-11-14 by D-008/D-014:** the employee's face on a video call. Still open: API key, credits and limits from the sponsor. Owner: user.
- **Q-004 · Databricks integration point.** **Answered 2026-11-14 by D-025:** the Team view. The outbound allowlist does not matter because the app runs on the laptop, not on Databricks.
- **Q-005 · Submission details.** Deadline, format, demo length, repo or live URL requirements, whether one project may enter several bounties. Owner: user.
- **Q-006 · Other tracks.** Track 01 and any Figma prize listing have not been shared. Owner: user.
- **Q-007 · Linkup, Tavily, MongoDB.** Not targeted. Revisit only if one fits naturally at no extra cost (for example as the agent's web search). Owner: user.
- **Q-008 · Faces.** **Answered by D-029:** Synthesia cast.
- **Q-009 · Desktops.** **Answered by D-029:** all Linux.
- **Q-010 · Default employee model.** **Answered by D-029:** Sonnet 5.5. Still open: a spending cap for the night. Owner: user.
- **Q-011 · Lend my screen.** **Answered by D-029:** later, as a stretch.
- **Q-012 · Commit and push.** **Answered by D-032:** yes, commit and push as progress is made.
- **Q-013 · Does Synthesia give hackathon teams Interactive Avatar access, and more than one concurrent session?** Ask the sponsor. Owner: user.
- **Q-014 · Does the Databricks bounty require the app to run on Databricks, or is building on its data platform from a local app enough? Does the sponsor hand out workspaces?** Ask the sponsor. Owner: user.
- **Q-015 · May one project enter bounties from two tracks (ElevenLabs, Anam, fal are in the other track)?** Ask the organisers (aisociety@imperial.ac.uk). Owner: user.

## 2026-11-14 · W6 (build agent): live desktop view
- `media/cua-viewer/` holds the five Cua viewer files byte-identical (commit `0147fb8d`); `SpaceView` plays `cua-media` on a canvas and falls back to polled `frame.jpg` on unsupported H.264, two failed attaches, no decoded frame in 6 s, or a `frames` answer. Details and evidence: `build/W6-handback.md`.
- No `media/live` fixture shot: shot mode fakes the stream call and `App.tsx` has no `media` area. The real check is `src/renderer/src/media/live.html`.

## 2026-11-14 · W3 (build agent): UI core
- **Presence dots are `StatusDot` for every state** (8 px, one size). `AvatarStatusDot` is 20 px and has no amber, so mixing it with the amber needs-you `StatusDot` looked uneven. On a call is the ink `accent` dot, paused and idle are grey. No icons in the dots (unreadable at 8 px).
- **Activity group rule:** the steps since your last message, an approval, a system line, a new day or a 20 minute gap form one group, shown where its newest step is (just above the reply it led to; a running group is always last). Label "Worked for N min" is the sum of the steps' own durations. Fixture steps are now 60 s each so Maya's group reads "Worked for 6 min".
- **Selectors:** any store hook must return a stable reference (select the slice, derive with `useMemo`, module-level empty constants). `PlanSection` had `?? []` and crashed against a live office; fixed.
- `sendMessage` in the store no longer toasts on failure; the composer shows "Couldn't send. Check your connection." and keeps the text.
- Shot-only state lives in `shell/shotState.ts` (`as=stuck|offline|paused|on_call|starting|working|idle`, `control=1`, `lent=1|forever`, `myscreen=1`, `typing=1`, `approval=approved|denied`, `plan=none`; `expand=1`, `popover=lend`, `screen=connecting|error` are read in the thread and desktop areas).

- 2026-11-14 (W5, build agent) R10 resolved: `SelectableCard isSelected` is the speaking ring. On the dark stage it renders a 2 px near-white ring that reads clearly at 1280 x 800 and 1728 x 1117, so the `Card` variant swap and `StatusDot isPulsing` fallback was not needed. Stage chips: scrim only over real media (video, portrait, desktop); tiles showing initials have an unscrimmed name. Summon picker is a compact `Dialog` (a `Popover` needs the top-bar button as its trigger and that button is W3's).

## 2026-11-14 (night) · assistant: Synthesia key and cast ids
- **D-SYN-1 · user said** the team was not given a Synthesia API key and was told to "use the key from LiveKit". **Finding:** the LiveKit gateway on our project lists only LemonSlice, so no LiveKit key can drive Synthesia (see research-log, night entry). `SYNTHESIA_API_KEY` stays empty; calls stay audio-only with a still portrait until a real Synthesia key exists. Do not put the LiveKit key in `SYNTHESIA_API_KEY`.
- **D-SYN-2 · user said** to fill the 8 cast avatar ids with any good, slightly varied ones. **Done partly:** `config/cast-ids.txt` holds the 3 real, published ids (Jenny, Kenji, Mei), marked unverified. The other 5 are left unfilled on purpose: no public source lists more interactive ids and inventing UUIDs would only fail with `UNKNOWN_AVATAR`. Needed: 3 women and 2 men.
- **Q-SYN-1 · open, owner user:** ask the Synthesia sponsor for an API key with Interactive Avatar access (the Synthesia bounty needs Synthesia's own API) and the 5 missing interactive ids. Show them the gateway answer above. Also ask whether they meant a different LiveKit project or gateway URL.
- **Q-SYN-2 · open, owner user:** do we want LemonSlice through the LiveKit key as a working moving-face fallback for calls tonight? It works with credentials we already have and can animate a generated face, but it would not count toward the Synthesia bounty and needs a change in `voice/agent.py`.

## 2026-11-14 (late night) · assistant: correction and ElevenLabs
- **Supersedes D-SYN-1.** The user shared the sponsor card. It does not say to use the LiveKit key for Synthesia: it says (1) Synthesia adds participants to a trial workspace on Saturday morning, and (2) copy the LiveKit keys into `.env`. The `LIVEKIT_*` keys are already in `.env.local` and match the card. The Synthesia key must come from the trial workspace (Developers, API keys). `SYNTHESIA_API_KEY` stays empty until the user creates it. Do not put the LiveKit key there.
- **D-EL-1 · recommendation, awaiting user:** do NOT replace Synthesia with ElevenLabs. Synthesia is a targeted bounty inside our own main track (50,000 credits) and is the only source of a moving face; ElevenLabs gives voice only and its bounty sits in Track 03, which may not be open to us. Do USE the user's ElevenLabs key for the employees' voices alongside Synthesia: it is already wired and needs only `ELEVENLABS_API_KEY`. If Synthesia access never arrives, the fallback ladder is audio-only calls with the ElevenLabs voice and the still portrait.
- **Q-EL-1 · open, owner user:** ask the organisers whether a Track 02 team may also enter the ElevenLabs bounty (it rewards real-time voice agents with agentic depth and interaction design). If yes, deepen the ElevenLabs use; if no, keep it as the voice only.
- **Q-SYN-1 (updated):** instead of asking for a key, check the hackathon sign-up inbox (and spam) for a Synthesia workspace invite. The invite was due Saturday morning. If none arrived, ask Synthesia to add the sign-up email. Then create the key and copy 5 more interactive ids (3 women, 2 men).

## 2026-11-14 (late night) · assistant: Synthesia key saved and tested
- **D-SYN-3.** `SYNTHESIA_API_KEY` is saved in `.env.local` and passes the free check (see research-log). Moving-face calls are now possible once avatar ids are in `config/cast-ids.txt`; until all people on a call have an id, that call stays audio-only (`voice/agent.py` requires an id for every person).
- **Q-SYN-1 (now):** only the avatar ids remain: confirm Jenny/Kenji/Mei exist in the trial workspace (Avatars page) and copy 5 more synthetic interactive ids (3 women, 2 men). Key expiry defaults to 30 days; trial credit balance and limits are unknown, so check the Billing page.

## 2026-11-15 · assistant: cast ids
- **D-SYN-4.** `config/cast-ids.txt` now holds the user's five workspace ids (verified) plus the three Synthesia sample ids (untested), 8 lines in all. Genders of the five are `unknown` until someone looks. Meetings use at most 5 distinct faces per session anyway (plugin limit), so the five verified ids are enough for any one call.
- **Q-SYN-3 · open, owner user:** which of the five avatars are men and which are women (or approve capturing one frame each, about 2 credits per avatar, which also produces portraits).

## 2026-11-15 · assistant: genders and portraits
- **Q-SYN-3 answered** (user approved capturing frames): see research-log. `config/cast-ids.txt` now has the genders. 
- **D-SYN-5.** The five avatar portraits are saved but **not yet paired with cast members**: `config/cast.json` still has `avatarId: null` and its fallback portraits. Pairing is a product choice (the names in `cast.json` were written before any face existed, so check that each name suits its face, and rename a cast member if not). Not done by this agent because `cast.json` belongs to the cast workstream.
- **Q-SYN-4 · open, owner user:** pair the five faces with cast members and merge ids and portraits into `cast.json`? And replace the three untested sample ids with workspace ids (1 man, 2 women) when convenient.

## 2026-11-15 · D1 app design agent: polish pass decisions
- **D-D1-1.** Personal tints are owned by the face, not the employee id: each of the 8 cast members has a fixed tint slot (`ui/tint.ts`), so four colleagues never share a colour (a hash of random ids collides about 60 % of the time for 4 people in 8 slots). Non-cast names hash.
- **D-D1-2.** Employee portrait stays top-aligned with its run (Astryx default), not bottom-aligned: runs mix bubbles, activity lines and approval cards, and bottom alignment put the face beside a timestamp or a button row.
- **D-D1-3.** Desktop panel: the "Live" marker sits in the panel's header line (state lifted from `Screen` through a new optional `onState` prop); the panel's state line drops its own dot while a screen is shown so two green dots never compete. "Take control" is secondary; "Give back" is filled. "Start desktop" is secondary.
- **D-D1-4.** Info banners (desktop off, paused) are restyled to a quiet muted band; only stuck stays red.
- **D-D1-5.** Team view: "Synced with Databricks · <time> · Open traces" (link only when `TeamReport.experimentUrl` is set). The link uses `target="_blank"`; in Electron that needs a `setWindowOpenHandler` → `shell.openExternal` in main (not present today, not in D1's scope).

## 2026-11-15 (00:15) · assistant: pairing review
- **D-SYN-5 (replaces the earlier "not yet paired" note).** Pairing is done and lives in `config/avatars.json` (W7), not in `cast.json`; do not duplicate it into `cast.json`. All eight ids are verified; `cast-ids.txt` documents them.
- **Q-SYN-4 (updated), owner user:** (a) pick one more woman avatar in Synthesia (not red-haired; ideally one whose look suits "Amara Diallo" or "Maya Okafor") and give its Interactive ID so Amara and Hannah stop looking alike; (b) or tell us to rename the cast members whose names do not suit their faces. Until then the pairing works but Amara and Hannah are near twins.

## 2026-11-15 (00:18) · assistant
- **D-SYN-6.** Amara now uses workspace avatar 6 (`a861a646-...`); Hannah keeps sample Jenny; workspace avatar 4 (`01ee56f6-...`) is spare. Q-SYN-4 part (a) is resolved (no more twins).
- **Q-SYN-4 (remaining), owner user:** rename Maya Okafor and Amara Diallo so the names suit their faces? Renaming touches `cast.json`, `voices.json` (keyed by first name), `avatars.json`, portrait file names, fixtures and tests, so it should be done in one pass by the cast workstream, not piecemeal.

## 2026-11-15: Brand decision (brand designer agent, on the user brief)
- Logo = the user reference rebuilt from scratch: four superellipse tiles, a handle each, flat, colours blue 262 / orange 62 / pink 357 / green 160. Details and rejected variants in `design/brand/README.md`. Product name: Deskmates.

## 2026-11-15 (00:25) · user approved, assistant did it
- **D-SYN-7.** Cast surnames: Maya Okafor -> **Maya Chen**, Amara Diallo -> **Amara Lim** (first names and ids unchanged). Use the new names everywhere; do not reintroduce the old ones. Stale copies of the old surnames remain only in history files and gitignored runtime data.
- **D-SYN-8.** `config/cast.json` is the source of truth for avatar ids (it wins over `config/avatars.json`); Amara's id is `a861a646-ad59-4960-adab-5aa2eac9c2b5`. Keep the two files in step.
- **Q-CAST-1 · open, owner user or orchestrator:** bring Hannah back into the cast (she no longer shares a face with anyone)?
- **Q-CAST-1 answered · 2026-11-15 · orchestrator:** Hannah Brooks is back in `config/cast.json` (sample avatar Jenny, voice callista). All eight faces are now different people, so the cast is eight again. Checked on the portrait sheet `design/cast-portraits.png`.


## 2026-11-15 · D2 stage design agent: polish pass decisions
- **D-D2-1.** One-to-one A: right column exactly as tall as the desktop; face fills it, type box docked at its bottom (level with the desktop's bottom edge). Spotlight uses the same column and desktop size.
- **D-D2-2.** One-to-one B departs from the polish brief: a centred 4:3 face over the docked type box, desktop as an inset in the face's corner. A narrow column with only a small desktop and the type box always left an empty band; a full-width face tile cropped and upscaled the 512 px square avatar video.
- **D-D2-3.** Face tiles use the square still (`<name>-sq.jpg`) so still and live video share one crop (`cover`, anchor 40 %) and the video cross-fades in without a jump.
- **D-D2-4.** Short spotlight strip tiles (and the 160 px bottom strip) are rows / stacks with the portrait circle, not cropped photo bands.
- **D-D2-5.** Bottom reserve 104 -> 112 for the control pill; max stage width 1600 -> 1680. Changed cells listed in `build/D2-handback.md`.
- **D-035 · 2026-11-15 · user** · After round one of the design pass ("really, really professional... we've reached 99%"): do a second round for "that final 1%": Opus agents again, "critique every tiny layer", fix, and reach a design that "oozes character and follows great UI practices". · Direction in `design/polish-brief-2.md`: exactness layer by layer with measurement, and character through "four desks, four mates" (the logo is four desks; the team is at most four). An independent Opus juror writes `design/critique-round-2.md`; the two round-one agents are resumed to build.


## 2026-11-15 (01:30) · orchestrator, from the first real end-to-end runs (`build/issues.md`)
- **D-036.** An employee writes a visible plan for any task where it makes or changes something (three to six steps), not only for long tasks; a quick question needs none. Reason: the plan ticking over is what the manager watches, and short build tasks showed none (I-4).
- **D-037.** Every role preset defaults to "Asks before big steps", the web developer included (it was "Works independently"). Reason: the UX spec already says so, and the publish-needs-approval moment (S5) should happen without setup (I-5). The manager can still raise it per person.
- **D-038.** Stuck versus question: "stuck" means no way forward was found after two honest attempts (a site that does not exist, a missing login, a failing tool); a missing decision or preference is a question. Colleagues answer each other with a best first draft and do not send each other to the manager (I-1, I-7).
- **D-039.** The employee uses Firefox only; desktops are prepared so Firefox opens with no first-run pages or banners (I-8).
- **D-040.** Databricks schema is now `workspace.deskmates` (new, empty; created 01:35). The old `workspace.agent_manager` holds only test rows from the build and is left in place; it can be dropped by the user at any time. The Genie space, when the user creates it, should point at `workspace.deskmates`.

## 2026-11-15 · D2 stage design agent: round two decisions
- **D-D2-6.** Meeting tiles are ordered by desk (tint slot), so a team of four is the Deskmates mark; number keys follow the order on screen. The two-by-two uses the mark's gap (40 px).
- **D-D2-7.** One row of two or three people gets square tiles (the video's shape); no face tile exceeds 768 px (1.5 x the 512 px source). Side by side: desktop 16:10 and a square face at one height.
- **D-D2-8.** A call shows its calling moment (dimmed portrait, DeskLoader, "Calling Maya") for at least 600 ms. Status lines ("Maya didn't answer" with Ask again, "You're muted", "Priya left") live in the caption line; the chip carries Thinking.
- **D-D2-9.** Not changed, with reasons in `build/D2-round2-handback.md`: top strip stays centred (Electron traffic lights), 1728 one-to-one margin (width-bound), no count in "Start meeting" (ux-spec).

## 2026-11-15 (02:20) · orchestrator
- **D-041.** Meeting tiles are seated by desk (each person's colour, in hire order), not in the order they were summoned, so four people form the mark. Raised by the stage designer as a question for the user; kept unless the user objects.
- **D-042.** The Figma file has three pages (Cover, Screens, Brand and foundations) because the Starter plan allows three. Screens are imported from the running app's own markup (`scripts/figma-export.ts`), not redrawn: the file can never drift from the product. When Figma's automated-call limit was reached, the remaining screens went in as one board; the limit was not worked around.
- **D-043.** An approval raised by the gate for a risky command is titled by the step ("Publish with git push", "Delete files"), never "Run a command", and shows the part of the command that matters.
- **D-044.** Time worked under an hour is shown in minutes. Take control reads "You have control". A new hire's first message is a hello, not a question, so they start idle.
- **D-045.** Genie space "Deskmates team" is created by script (`scripts/genie-setup.ts`), with table descriptions, six sample questions and four instructions; answers are shown as plain text.
- **D-046.** (User, 15 Nov) `main` holds the whole build: it was fast-forwarded to `build/night-1` on the user's say, and the two are kept at the same commit. The repository stays private until the user says otherwise.

## 2026-11-15 (10:55) · video session: demo video from the user's one-shot script
- **D-V1 · user said** make the 2-minute demo video from their one-continuous-shot script, corrected against the built app; record the live app with **Recordly**; have the build session build (a) a screen showing a grid of the live desktops working together and (b) a simple end-to-end pipeline of agents doing real long-horizon tasks; the two sessions coordinate by messaging.
- **D-V2 · video session decided** (script v2, `demo-video-script.md`): the human founder is **Sam** (Priya is an AI marketer in the app); the team is **Maya, Priya, Jonas, Ines**, seated by desk in the logo's four hues; the 2x2 world is the new in-app Desks view; agents' lines are targets and the subtitles follow what they really say; v1's double-booked customer call (not a feature) becomes teammates, an approval, the Databricks Team view and a notification in the same choreography; the end line names the real stack.
- **D-V3.** Brief to the build session: `video/brief-to-build.md`. The video session does not edit `src/` or `scripts/`.
