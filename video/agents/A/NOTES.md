# Editor A: Deskmates demo, v5

Files: `out/deskmates-A.mp4` (final, 1920x1080, 30 fps, 2:00, -16 LUFS), `out/deskmates-A-preview.mp4` (1280x720, about 1.5 Mb/s).
Source: `Main.tsx` (composition), `Mac.tsx` (Sam's Mac pile), `Media.tsx`, `util.ts` (geometry, camera), `cues.json` (every voice/sfx time), `tools/audio.py` (soundtrack), `tools/mux.sh` (loudness, mux, preview), `tools/render.mjs` (Node API render).

## The idea
One world, one camera. The app's window (2560x1600 recordings) is placed at scale 0.6 in the frame; the Desks view, the call, the standup and the Team view are all that same window, so the camera is only a keyframed pose over one canvas and nothing is ever cut. Overlays are placed in world coordinates, so they stay locked to the footage while the camera moves.

## Real footage vs motion graphics
- Real: the Desks take (live desktops, the app's own face pop at 38.0 s), the call with Maya (her own audio and lips), the standup (all four faces, the app's own spotlight switches, Maya/Jonas/Ines's real lines), the approval card with the real click, the Team view with Databricks numbers and the Genie answer. Narrator and Sam use the existing wavs.
- Motion graphics: Sam's Mac (wallpaper, menu bar, cursor, menu), the pile (four of the windows are crops of the agents' real desktops, the editor, zsh, agent chat and agents.log are drawn; agents.log uses the real activity lines), the flights onto the desks, the faces' flights, the two teammate bubbles (real messages), Priya's notification (real message), the end card, subtitles.

## Match moves (how accuracy is kept)
- **Windows onto desks**: each real window's flight ends on the exact pixel rect where that window sits in the Desks take (measured), the placeholder tile under it fades out when it lands, so the swap to the real footage is invisible. Junk windows shrink away.
- **Maya's call**: the camera pose is computed so her desk tile lands exactly on the call's desktop panel (same scale and position); a veil with a hole over the tile hides the other desks; her face card then travels to the call's face tile as a moving crop (card pixels to live call pixels). Zoom out is the same in reverse. No dissolve between layouts.
- **Faces into the meeting and back**: each face leaves its measured card, lands on its measured meeting tile (cards are patched with a still of the desk from before the faces existed while they are away).
- **End**: the four desk tiles (Maya blue, Priya orange, Jonas pink, Ines green) shrink and become the four tiles of the Deskmates mark.

## Rules check
1. No cuts: yes (camera, flights, slides). 2. Earlier compositions untouched. 3. Real avatars with their own audio. 4. Shake only from 14.0 s (agents.log), +-1.4 px. 5. Riser: synthesized, 16.5 to 24.0 s, starts from silence and swells (plus the Mixkit whoosh-impact fading in over 0.9 s), breakdown of the music before the drop. 6. Call zoom is a match move. 7. Meeting switches use the app's own pin changes; dissolves (0.4 s) only join near-identical frames in the quiet stretches. 8. Firefox never mentioned (Jonas stops at 52.32, Ines at 76.74; subtitles match). 9. The reveal is one eased move per window. 10. Notifications slide in with a soft eased drop and a low-passed Mixkit chime/bubble. 11. Subtitles burned in all the way; the app's captions and controls are covered by a plate. 12. Music ducked 10 dB under every line, whooshes on big moves only, -16 LUFS, last 2 s faded. 13. Truthful (see below). 14. End card kept.

## Honest notes and bent rules
- The push did not go through, so there is no "push goes through" beat. The approval is shown as the real card and the real click.
- The app's pin change Maya to Jonas to Ines is near-instant in the recording (a switch, not a slide), so that is what is shown.
- Small leftovers: when the app's own faces mouth a few words that I cut (Maya about 1.5 s after her pin, Jonas "and open in Firefox", Ines's last words), the mouths move in tiny strip tiles with no audio.
- The Team view's 16 s wait is time-lapsed 8x; typing and the answer are at real speed.
- Ines's "Chosen: Version B" badge is already on screen when she is pinned (it is in the take), so Sam's "Version B. Ship it." confirms rather than precedes it.
- Maya's call line is the real 5.8 s one, not the shorter target in the script, so the script's beats after it start a few seconds later and the end card starts around 1:51.
- Overlays use the Astryx neutral theme tokens and Figtree through `Theme`; the overlay graphics themselves are plain positioned elements (no Astryx component exists for video overlays). No other UI library.
- Not done: no extra downloads; sounds not in Mixkit (click, riser, boom, pop) are synthesized in `tools/audio.py`.

## Final render (measured)
`out/deskmates-A.mp4`: 1920x1080, 30 fps, 120.0 s, integrated -16.0 LUFS, true peak -1.3 dBFS (target was -1.5; 0.2 dB over). Frames from the final file were checked at 24.3, 29.6, 40.6, 45, 53.2, 62, 72, 88.2, 97.8 and 112.2 s. Not frame-checked in the final: the dissolve joins at about 67 s and 74.6 s, and playback of audio sync by ear (cue times were computed from the takes' word timings, not listened to).
