# Brief: three independent editors, one Deskmates demo video each (15 Nov)

Read `docs/hackathon/README.md` first; front end must use Astryx (the app's look: neutral theme, Figtree/system font, the four desk colours below; no other UI library in anything you build); write findings back to `docs/hackathon/` (your decisions as one dated entry in `decisions.md`).

You are one of three editors (A, B, C) making the same video independently. Do not look at the other editors' folders. The user will compare the three and be interviewed about what they like.

## The job

A 2:00, 16:9, 1920x1080, 30 fps product demo of **Deskmates**, built **from scratch** with your own edit, following the script in `docs/hackathon/demo-video-script.md` (v2: Sam the founder; Maya Chen web developer, Priya Raman marketer, Jonas Weber researcher, Ines Moreau designer, seated by desk as the logo; real features only). Professional director quality: smooth, deliberate, calm and confident. Motion design is welcome and should be excellent, but it must be **accurate**: whatever flies or morphs must start and land exactly on the real thing in the footage.

## Hard rules from the user (all of them apply)

1. **One continuous shot.** No cuts. Every change of focus is a camera move or an object moving between places. The same face is the same object throughout (desk → meeting → back).
2. **Do not re-edit the previous videos.** Do not open, copy or adapt `video/src/Main.tsx`, `MainV2.tsx`, `MainV3.tsx`, `MainV4.tsx`, `video/clips*.json`, `video/tools/soundtrack.py`, `video/tools/music.py`, anything in `video/out/`, or these derived files: `video/public/media/clips/desks.mp4`, `video/public/media/bed.wav`, `sfx.wav`, `track.wav`, `video/public/img/desks-land.png`. Raw recordings and assets (listed below) are allowed.
3. **Agents' faces must be the real Synthesia avatars moving in sync with what they actually say** (use the recorded call and meeting with their own audio). Narrator and Sam keep the existing voices (`video/public/media/n01..n11.wav`, `s01..s06.wav`; regenerate with `video/tools/tts.py` only if you change a line; same voices).
4. **Shaking windows** in the "before" pile start only when the agents.log appears (about 0:14), and are subtle.
5. **The riser into the 0:24 drop** is slow and smooth: fades in gradually over several seconds, no sudden step.
6. **No weird crossfades.** Zooming into Maya's call must be a match move (her face card becomes her call face), not a dissolve between two different layouts.
7. **Meeting share switches** (Maya → Jonas → Ines) must be smooth: use the app's own spotlight animation from the meeting take, and only dissolve between nearly identical frames.
8. **Never mention Firefox** (audio, subtitles, overlays). Trim the real lines before it (word timings below).
9. **The Deskmates reveal** (the pile of windows flying onto the four live desks at 0:24) must be smooth, not janky: one continuous, eased move.
10. **Notifications slide in softly** with a soft sound (no harsh noise whoosh), especially Priya's near 1:40.
11. **Subtitles burned in for the whole video.** Narrator plain; characters prefixed with their name in their colour. Cover the app's own captions in the footage so text never doubles.
12. **Audio:** music ducked about 10 dB under every spoken line, whooshes on big moves only, master to −16 LUFS (ffmpeg `loudnorm=I=-16:TP=-1.5:LRA=11` after rendering), fade the last 2 s. Structure per the script: light 0:00–0:13, tension 0:13–0:24, drop with the click at 0:24.
13. **Truthful.** Only show things that happened. The push after the approval did not go through on camera; Maya's second answer in the meeting (take 36.7–45.3 s) contradicts her first, never use it; the Team view numbers are real (team take).
14. Keep the end card: the Deskmates mark (four rounded tiles: blue #5B8CFF, orange #FF9F43, pink #EE5A9C, green #2FCB8B), tagline "Your AI team, with a desk, a face, and a seat at the table.", the four faces, and the line "Built with Cua · Claude Agent SDK · Synthesia · Databricks · Astryx".

## Raw materials you may use (all in `video/public/`, so `staticFile(...)` works)

Recordings of the live app (Recordly, 2560x1600, 60 fps, real Sonnet agents on real Cua desktops, demo team "Sam"):

| File | Length | What happens (take seconds) |
| --- | --- | --- |
| `media/raw/desks.mp4` | 42.6 s | The Desks view: four live desktops in a 2x2, faces hidden, faces pop in at about 24.0 s. Tiles (fractions of the frame): Maya x .0602 y .0438, Priya x .5273 y .0438, Jonas x .0602 y .5438, Ines x .5273 y .5438, each w .4125 h .4125 (16:10). Face card inside a tile: x .782 y .042 w .194 h .402 of the tile. The "Desk n · Name" pills are the app's own. |
| `media/raw/call.mp4` | 21.6 s | One-to-one call with Maya: her live desktop (50 tests OK) left, her Synthesia face right. Face tile: x .75 y .101 w .231 h .643 of the frame. She says "Hi Sam, Maya here. I'm on the checkout discount bug, and the push is waiting on your go-ahead." at 10.14–15.92 s. App caption and controls at the bottom (cover them). |
| `media/raw/meeting.mp4` | 89.3 s | The standup, mic muted, Sam's lines typed. Grid tiles (px in 2560x1600): (484,128), (1320,128), (484,776), (1320,776), each 756x568, order Maya, Priya, Jonas, Ines. App pins: Maya's desktop at about 31.8 s, Jonas's at 43.3 s, Ines's at 54.8 s (spotlight strip on the right: four 284x562 tiles at x 1920/2228, y 162/748). Audio (use these): Maya 24.20–31.68 "Morning, all. Quick update from me. The checkout discount bug is found and fixed, tests are run, and the commit is on fix/checkout-discount."; Jonas 48.32–52.32 "The pricing chart is at work/pricing.html" (stop before "and open in Firefox" at 52.32); Ines 73.40–76.74 "Both versions now have two screens each" (stop before "and a page is open in Firefox"). Quiet stretches: 17–24.1, 46.0–48.3, 71.3–73.4, 79.2–82.4. Ines's desktop shows a green "Chosen: Version B" badge. Full word timings: `video/media/takes/audio/words.json` (key `meeting`, `call`). Event logs: `video/media/takes/*.json` (caption times there run about 2 s ahead of the audio). |
| `media/raw/approve.mp4` | 10.4 s | Maya's thread with the real card "Push fix/checkout-discount" (Deny / Approve); the real Approve click at about 3.3 s. |
| `media/raw/team.mp4` | 25.8 s | The Team view (real Databricks numbers: 4 min, 8 tasks, $0.82), the question "Who did the most work today?" typed at about 3.4 s, the answer ("The person who did the most work today is Maya Chen…") appears at about 23.5 s. |

Other assets: `img/{maya,priya,jonas,ines}-sq.jpg` (portraits, the same people as the avatars), `img/deskmates-mark.svg`, real desktop frames in `../shots/demo/run/*.jpg` (copy into your own public subfolder if you use them), VO wavs `media/n*.wav`, `media/s*.wav` with texts in `video/lines.json`, Mixkit audio (licence cleared by the user) in `media/mixkit/`: `music-motivating-mornings.mp3` (123 BPM, quiet breakdown 48–62 s rising into a big section at 63.76 s, outro from about 104 s), `music-better-times.mp3` (129 BPM, constant energy), `sfx-air-woosh.mp3` (peak at 1.10 s), `sfx-whoosh-impact.mp3` (peak 2.53 s), `sfx-positive-notification.mp3`, `sfx-bubble-notification.mp3`. Do not download anything else; synthesize if you need more, or say what you'd want in your notes.

Real messages you may quote: Priya → Jonas "Could you send me one line on how competitors handle discount vs tax order?"; Jonas → Priya "Shopify's help docs say discounts come off the subtotal before tax, so we match them."; Priya done: "The launch post is now a styled web page." Real activity lines (for an agents.log): Ran a command · Read shopify.com · Read wix.com · Read squarespace.com · Messaged Jonas · Priya asked something · Saved index.html · Opened file · Opened Xfce4 terminal · Searched the web · Messaged Priya · Jonas replied · Read bigcommerce.co.uk · Saved launch_post.md · Saved launch_post.html.

## How to build

- Remotion 4.0.543 is installed in `video/node_modules` (React 19). Work only in `video/agents/<your letter>/`: your own `index.ts` (registerRoot), compositions, tools, notes. Put any new files you need under `video/public/agents/<your letter>/`. Never edit shared files, the app (`src/`, `scripts/`), or other folders. Do not start or stop the Deskmates app. No git commits or pushes.
- Render with the Node API (`@remotion/bundler` `bundle({ entryPoint })` + `@remotion/renderer` `renderMedia`, codec h264, crf 16), `concurrency: 4` (three editors share this Mac). The CLI render crashed earlier; use the Node API. If the headless browser fails with "icudtl.dat not found", pass `browserExecutable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`.
- `OffthreadVideo` (with `trimBefore`, `muted`) and `Audio` (with `trimBefore`, `volume` callbacks) both work on these mp4s. For a dissolve, put the next take's video in a `Sequence` slightly early with an opacity ramp; keep audio pieces separate so a dissolve never leaks speech.
- Check your work: render stills at every transition and look at them, then the final render, then frames from the final file. Measure loudness with `ffmpeg -af ebur128`.

## Deliver

- `video/agents/<letter>/out/deskmates-<letter>.mp4` (final, −16 LUFS) and `deskmates-<letter>-preview.mp4` (under 25 MB, e.g. 1500 kb/s).
- `video/agents/<letter>/NOTES.md`: your creative choices, what is real footage and what is motion graphics, anything you could not do, and any rule you had to bend (say so plainly).
- Final message: under 200 words, with the two file paths and the three choices you're proudest of.
