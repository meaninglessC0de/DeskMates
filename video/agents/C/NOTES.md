# Editor C: Deskmates demo, 2:00

Files: `out/deskmates-C.mp4` (final, 1920x1080, 30 fps, -16 LUFS), `out/deskmates-C-preview.mp4`. Source: `src/` (Remotion), `tools/render.mjs` (Node API render), `tools/audio.py` + `tools/finalize.sh` (audio). Nothing outside `video/agents/C/` and `video/public/agents/C/` was written (plus one dated entry in `docs/hackathon/decisions.md`).

## Idea
One camera over one app window. Every recording of the app (Desks, call, meeting, Team) is the same 2560x1600 Electron window, so the edit lives in that window's coordinates and moves only the camera and objects:
- **0:00-0:24 Sam's Mac.** Windows pop in one by one; they are live crops of the four real desk windows (from `desks.mp4`, played at 0.3x so they reach the same frame the live desks will be on at the drop). The terminal types, the chat fills, the cursor wanders. agents.log opens at 14.0 s with a subtle shake (starts 14.3 s, about 2 px, stops when the log closes) and a slow push-in; the log fades, the camera eases back, the cursor opens the tray menu and clicks "Show desks" at 24.0.
- **0:24 reveal.** The Mac recedes while the empty desks rise and the camera eases out from 1.3x; each real window flies (staggered 0.24 s, 1.9 s smootherstep, small arc and tilt, slight tilt only) onto the same window on its desk, tracking the moving camera. Landing swaps a cover tile for the live desk underneath: same pixels, no cross-dissolve.
- **0:28-0:37.** Camera pans desk to desk on the words (silence-detected sentence times of the narrator line), with a small zoom-out arc between desks.
- **0:40 faces** are the app's own pop-in (Desks take).
- **0:42 call.** Match move: the camera zooms into Maya's tile; her face card flies to her call face tile while the tile expands into the call layout (clip-path from her tile rectangle to the full call window; the call take's shared desktop is placed exactly on the tile). No dissolve between layouts; the only dissolve is 0.35 s between two near-identical desktops (tile vs call desktop).
- **0:52 meeting.** The four face cards fly to the four meeting tiles; the desks fade out behind them. The meeting layer fades in only behind landed faces. Share switches (Maya -> Jonas -> Ines) are the app's own spotlight animation; I jump inside a held spotlight with 0.4 s dissolves between near-identical frames to skip silence and reach each speaker's real line. Strip tiles of people who must be silent are frozen stills of a quiet moment while the take runs.
- **1:27 back to the desks.** Faces fly from the strip to their cards; Ines's shared desktop shrinks onto her tile and stays there with its real "Chosen: Version B" state (the desks recording predates it).
- **Teammates.** Priya's real question flies to Jonas, his real answer flies back.
- **Approval.** The real card and the real Approve click (take 3.10 s, aligned to Sam's "Approve."), in a notification that turns green. Nothing shows the push happening.
- **Team.** The real Team take slides up; the typed question and answer are real; the ~17 s Genie wait is 8x with a chip.
- **Priya's notification** slides in softly (1 s ease-out, no whoosh) with a lowpassed chime. Her real line: "The launch post is now a styled web page."
- **End.** The four desk tiles shrink into the four mark tiles (blue, orange, pink, green, in desk order), wordmark, tagline, four faces, small stack line, fade to black.

## Real vs motion graphics
Real: all desk, call, meeting, approval and Team footage; agents' voices and lip-sync (call and meeting audio, cut at the word timings; Jonas and Ines stop before "Firefox"); narrator and Sam VO wavs.
Drawn: Sam's Mac (wallpaper, menu bar, dock, tray menu, agent chat, zsh, agents.log lines are the real activity phrases with invented timestamps), the pill covers while desks rise, notification/bubble/approval wrappers, subtitles, end card, the "Sam" patch in the Team view sidebar.

## Audio
Mixkit "Motivating Mornings" re-cut on bars (123 BPM): 39.76 s of the track plays 0:00-0:24 (lowpassed and quiet first, then the track's own breakdown), its big section at 63.76 s lands exactly on the 0:24 click, loops one 20-bar block twice plus 5 bars, then the outro from 104.7 s at 1:52. A synthesized 7.5 s riser (filtered noise + rising tone, t^2.6 envelope, starts at 16.5 s) feeds the Mixkit whoosh-impact tail (from 1.35 s into the file, peak on the drop). Music ducks 10 dB under every spoken line (60 ms attack, 400 ms release). Air whooshes only on the big moves; soft lowpassed Mixkit chimes for messages, approval and Priya. Master: two-pass loudnorm to -16 LUFS, TP -1.5, 2 s fade out.

## Rules I bent or could not meet
- No raw recording of Sam's Mac or the tray menu exists, so those are drawn.
- Figtree was not available offline: drawn text uses the macOS system font.
- Ines's badge is visible before Sam says "Version B" (it is the take's true state). I did not fake the marking.
- Subtitles: the line on the end card is the tagline itself, so no separate subtitle is burned over it (it would double the text).
- The real app shows the manager's own name in the sidebar of the Team take; I patched it to "Sam" (and cropped it out of the approval card).
- The app's own captions and call controls are covered by flat patches in the call and meeting layers.
- Face crossfade during the card -> tile morph shows a brief double exposure of the two portraits (card label fades while the live face fades in).

## Wanted
A real recording of the tray menu and of Ines marking Version B; a longer meeting take with the silence between speakers so no jumps are needed.
