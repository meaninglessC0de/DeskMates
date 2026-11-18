# Deskmates v2: shot list (recordings that replace v1 stills)

Timings and choreography are v1's (`src/Main.tsx`, same times in `src/MainV2.tsx`). Script: `docs/hackathon/demo-video-script.md`. Hooks: `docs/hackathon/video/brief-to-build.md` section 4 (`window.__deskmatesDemo`, CDP port 9333; names may change, check `docs/hackathon/build/V-handback.md`).

## Recording rules

- Recordly records through `node tools/recordly.mjs` (`select Deskmates` for the app window, `select screen` for Sam's Mac; `start` has system audio on; `stop` prints the mp4 path). Needs macOS Screen Recording permission for Recordly.
- App window 2560 x 1600 (16:10). Real cursor events for visible clicks (tray, "Show desks", Approve).
- One take per row below unless noted. Record 3 s of lead-in before the cue so the cut point can be trimmed (`from` in the manifest).
- Copy each finished mp4 to `video/public/media/clips/` and add its entry to `video/clips.json` (see "Manifest"). No entry means the v1 still is used.
- The app, pipeline and desks are driven by the build session; only one app instance at a time.

## Rows

| Slot (clips.json key) | Time in cut | Record | Trigger | Length | Replaces in v1 |
| --- | --- | --- | --- | --- | --- |
| `intro` | 0:00 to 0:24 | Sam's real Mac, whole screen (`select screen`): pile of windows (code editor on `~/work/shop`, terminal, Firefox pricing page, launch notes, phone mockup, "agent chat", "zsh (4)"), then a huge `agents.log`, then cursor to the Deskmates menu-bar mark, menu opens, click "Show desks". Windows stay laid out as `INTRO` rects (Main.tsx) so the flying windows start near them | Stage by hand; agents already working. Click is a real cursor event | 24 s, ends on the click | Intro scene (wallpaper, mock windows, mock menu bar, menu, cursor). Edit still flies the owner windows to the desks from 0:24 |
| `desk.maya` `desk.priya` `desk.jonas` `desk.ines` | 0:24 to 1:21 (desks live, camera moves) | ONE recording of the Desks view (app window), no sidebar. Four desks mid-task; faces hidden for the first part, `F` at about 0:39 pops faces (about 150 ms stagger). Use the same file in all four entries with `crop` = that desk's tile as fractions of the frame. With `appFaces` and `appLabels` true the edit draws no faces or "Desk n" pills | `openDesks()`; `setFaces(false)`, then `setFaces(true)` at the cue; aligns with `at` = composition time of the take's first frame (24.0 default) | 60 s, continuous | `DeskBody` mock desktops, edit faces (`FACE_POP`) and labels |
| `call.maya` | 0:42 to 0:46 (Maya's desk, zoom) | App window, call with Maya open: her Synthesia face talking beside the desktop panel (terminal with tests passing). Crop to a 16:10 area. `audio: true`, `replacesLines: ["m01"]` to use her real voice | `startCall(maya)` (Maya greets with her finished work) | 6 s | Maya's still face enlarging at 41.9 to 45.6 |
| `meeting` | 0:51 to 1:19.9 | App window for the whole standup: 2x2 faces seated as the logo; Sam's typed lines "Okay team, standup!", "Maya, show me the fix?", "Jonas?", "Version B. Ship it."; spotlight Maya (tests green), Jonas (competitor chart), Ines (Version A and B, Version B outlined "Ship it"); end call. Edit faces still fly in (51.25) and out (78.3) over it, then hand over to the recorded tiles | `summon([all four])`, `say(...)` at the cues, `pin(maya)` at 0:58.7, `pin(jonas)` at 1:04.6, `pin(ines)` at 1:11, `endCall()` at 1:18 | 29 s | `Meeting` mock (bg, shared desktop, pill) |
| `desk.*` again | 1:21 to 1:30 | Same Desks view recording continues: Priya to Jonas message and answer (teammate messages); Maya's terminal runs `git push` after approval. Not a separate clip: it is the tail of the desks take (set its length to about 6 s extra) | Pipeline gate holds the push; `approve(id)` is clicked on the real Approve in the cut at 1:28 | tail of the desks take | Mock terminal push lines |
| `team` | 1:32 to 1:38 | Team view (Databricks): hours, tasks and cost per person; ask Genie a question, answer appears | `openTeam()`, `askTeam(q)` | 8 s | `img/team.png` still |
| (edit only) | 0:24 to 0:28, 0:39 to 0:41, 1:26 to 1:30, 1:39 to 1:44, end card | Flying windows, face pop, notification cards (Approval, Priya's note) and the end card stay edit overlays on the app's tokens | n/a | n/a | unchanged |

## Manifest

`video/clips.json`: `{ "clips": { "<key>": { "src": "media/clips/<file>.mp4", "from": 3, "at": 24, "crop": {"x":0,"y":0,"w":0.5,"h":0.5}, "rate": 1, "audio": false, "replacesLines": [], "appFaces": false, "appLabels": false } } }`.
`from` = seconds into the file where the slot starts (trim lead-in). `at` = composition time that `from` lines up with (defaults to the slot start). `crop` = fractions of the frame.

## Check

`npx remotion still src/index.ts DeskmatesV2 out/v2-test.png --frame=1200` (add `--browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` if Remotion's headless shell fails with "icudtl.dat not found"). Render: `node tools/render.mjs DeskmatesV2 out/deskmates-v2-raw.mp4`.
