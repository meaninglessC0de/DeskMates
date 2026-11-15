# Demo video script v2: "Deskmates", 2:00, one continuous shot (matched to the built app)

Owner: the video session (15 Nov). Source: the user's v1 script (pasted 15 Nov), corrected against the code. Structure, timings and choreography are the user's and stay; only what was placeholder or not true of the product changed. Edit in place.

## What changed from v1, and why

| v1 said | v2 says | Why |
| --- | --- | --- |
| Each agent gets a macOS virtual desktop (open-source multi-desktop tool) | Each agent gets its own **Linux desktop running on your Mac** (Cua), shown live | That is what the app does (plan.md section 2) |
| Human founder **Priya**; agents Ada (coder), Leo (research), Mira (design) | Human founder **Sam**. Agents are the real cast, seated by desk in the logo's colours: **Maya Chen** web developer (blue, desk 1), **Priya Raman** marketer (orange, desk 2), **Jonas Weber** researcher (pink, desk 3), **Ines Moreau** designer (green, desk 4) | Priya is an AI marketer in the app; the first four tint slots are the logo's hues in this hiring order (`ui/tint.ts`); a meeting of four is seated as the logo (D-041) |
| 2x2 world of four Mac desktops (animated mockup) | The **Desks view** in the app: four live desktops, recorded with Recordly | New screen the user asked for; nothing in the world is a mockup except the "before" pile |
| Illustrated faces, ElevenLabs voices for the agents | Synthesia avatars from the app with their own voices (Aura-2 through LiveKit), lip-synced. Narrator and Sam: ElevenLabs voices | Agents' voices must match their moving lips, so they come from the real call |
| Agents' lines as written | Agent lines below are **targets**. They answer from their real work through the call mind, so the subtitles use what they actually say | The work is real (E2E pipeline), not scripted |
| 1:21 to 1:44: double-booked calendar, Leo takes a customer call and takes notes | Same choreography with real features: a message flies desk to desk (teammates), a big step comes to Sam for approval, the Databricks Team view answers a question, a menu-bar notification | Attending outside calls is not a feature; Databricks was missing from v1 and is a sub-track |
| "Built on open-source virtual desktops for macOS · Synthesia AI avatars" | "Built with Cua · Claude Agent SDK · Synthesia · Databricks · Astryx" | The real stack |

## Look, voices, music

As v1, except: desktops are Linux desktops with a wallpaper in each person's tint; the app's own screens are Astryx (neutral theme, Figtree); overlays in the edit use the app's tokens. Narrator: warm, clear, confident American male. Sam: friendly, decisive American female. Music, ducking, whooshes and loudness exactly as v1 (112 BPM, C major, tension 0:13 to 0:24, riser and boom on the click, -10 dB under speech, -16 LUFS, 2 s fade).

## Shots

| Time | Voice | On screen (real unless marked "edit") |
| --- | --- | --- |
| 0:00–0:06 | **Narrator:** "This is Sam's Mac. Sam runs a startup with four AI agents." | Fade in on Sam's real Mac, easing out. Real windows pop in one by one and overlap: code editor (the shop's checkout code), terminal, competitor pricing page, launch-post notes, a phone mockup, plus "agent chat" and "zsh (4)". |
| 0:06–0:13 | **Narrator:** "A coder, a marketer, a researcher and a designer. All working at once, in one pile of windows." | The pile keeps working: the terminal types, pages scroll, a cursor moves on the mockup. |
| 0:13–0:19 | **Narrator:** "Who's doing what? Like every founder, Sam scrolls through logs." | Windows jitter. Push in. A huge "agents.log" window scrolls fast with mixed [maya] [priya] [jonas] [ines] lines (the agents' real activity lines). |
| 0:20–0:23 | **Narrator:** "Now watch what happens when Sam opens Deskmates." | Log fades, camera eases back. The cursor glides to the Deskmates mark in the menu bar and clicks: the real menu opens. The cursor clicks "Show desks". |
| 0:24–0:28 | (music drop, no voice) | **Hero.** Junk windows shrink away. Each agent's windows fly, staggered and slightly tilted, onto that agent's desk (edit), landing on the real Desks view as the camera zooms out to the 2x2 grid with large labels "Desk 1 · Maya" and so on. |
| 0:28–0:37 | **Narrator:** "Every agent gets a desk of its own: a real computer. Maya's code goes to hers, Priya's launch post to hers, Jonas's research to his, Ines's designs to hers." | Camera flies to each desk exactly as it is named, each desk live and mid-task. Zoom back out to the grid. |
| 0:39–0:41 | **Narrator:** "And every agent gets a face." | A face pops onto the corner of each desk: Maya, Priya, Jonas, Ines. |
| 0:42–0:45 | **Maya:** "Morning, Sam! I fixed the checkout bug." (target) | Zoom into Maya's desk. Her live Synthesia face talks with the speaking ring beside her terminal showing the tests passing. |
| 0:46–0:50 | **Narrator:** "So Sam can talk to the team, face to face." | Zoom back out to the four desks. |
| 0:51–0:53 | **Sam:** "Okay team, standup!" | The meeting opens. **The four faces fly off their desks** into the 2x2 meeting grid, seated as the logo. Camera follows. |
| 0:56–0:58 | **Sam:** "Maya, show me the fix?" | Maya's tile rings. |
| 0:58–1:03 | **Maya:** "Sharing my desktop now. Tests are green, and it's ready to push." (target) | Spotlight: faces move to the strip, Maya's live desktop fills the main area. Tests green. |
| 1:04–1:10 | **Sam:** "Jonas?" **Jonas:** (what he found, in one line) | Spotlight switches to Jonas's desktop: his real competitor chart. |
| 1:12–1:15 | **Ines:** "And I made two onboarding designs. Which one should ship?" (target) | Spotlight switches to Ines's desktop: Version A and Version B side by side. |
| 1:15–1:17 | **Sam:** "Version B. Ship it." | Ines marks Version B on her own desktop (green outline, "Ship it"). |
| 1:17–1:21 | (music) | The meeting ends. The faces fly back to their desks as the camera zooms out to the grid. |
| 1:21–1:26 | **Narrator:** "Then they get back to work, and they help each other." | A message flies from Priya's desk to Jonas's desk, and his answer flies back (real teammate messages). |
| 1:26–1:30 | **Narrator:** "Big steps still come to Sam first." **Sam:** "Approve." | A notification drops in: "Maya · Publish with git push". On "Approve" it turns green. |
| 1:30–1:32 | (music, whoosh) | Camera pans to Maya's desk: the push goes through. |
| 1:32–1:38 | **Narrator:** "Every hour, task and dollar is on the record in Databricks, so Sam can just ask." | The Team view slides up: hours, tasks, cost per person in their colours; a question to Genie and its answer. |
| 1:39–1:44 | (music) | Back to the grid. A notification drops from the top right with Priya's face: "Priya · The launch post is ready. Take a look?" |
| 1:46–1:51 | **Narrator:** "Deskmates. Your AI team, with a desk, a face, and a seat at the table." | Pull out to the whole grid, everyone at their desk. Cross-fade to the dark end card: the Deskmates mark builds in (four tiles: blue, orange, pink, green) and the wordmark; tagline; the four faces in tint circles. |
| 1:51–2:00 | (music outro) | End card holds. Small grey line: "Built with Cua · Claude Agent SDK · Synthesia · Databricks · Astryx". Fade to black. |

## Rules (from v1, unchanged)

- Never cut. Every change of focus is a camera pan or zoom, or an object flying between desks.
- The same face is the same object throughout: it lives on its desk, flies into the meeting, and flies back.
- Each on-screen moment lands on the word that names it ("Maya's code", "Version B", "Approve").
- Subtitles on for the whole video (narrator plain; characters prefixed with their name in their colour).

## How it is made

- **App side (build session):** the Desks view, "Show desks" in the menu, and the E2E demo pipeline that hires the four and gives them real long tasks (`scripts/demo/`). See `video/brief-to-build.md`.
- **Video side (video session):** Recordly records the real app (Electron window) and the staged "before" pile on the real Mac; the edit composes one continuous camera over those recordings, adds the flying windows and faces, narration, Sam's lines, music and subtitles.
