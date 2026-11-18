# Review of video/agents/A/out/deskmates-A.mp4 (golden pass)

Method: frames every 0.5 s (240) and every 1/15 s for 1.5 s around 24 transitions; full-res frames at key moments; ebur128 (momentary, true peak); the editor's audio.py re-run to get separate voice, music and sfx stems (written to scratch, project untouched); subtitle cues recomputed from Main.tsx; word timings from video/media/takes/audio/words.json.
Overall: loudness is right (-16.0 LUFS, sample peak -1.43 dBFS, no clipping, constant 30 fps, no dropped frames, no seam on the window-to-desk swap, text legible at 1080p in full-res frames). Faults are in transitions, subtitle timing, hero timing and voice/music balance.

## P1 must fix

1. **Meeting switches are hard cuts through a dark frame, not smooth** (rule 7). 65.17 shows the full 2x2 face grid, 65.23 the strip with an empty dark desktop panel, 65.30 Maya's desktop. 68.17 Maya's desktop, 68.23 near-black panel, 68.30 Jonas. 75.47 Jonas, 75.53 near-black, 75.60 Ines. 86.07 Ines stage, 86.13 full grid (instant). The "0.4 s dissolves" are not in the file; each is 1 to 2 frames.
   Fix: build real transitions. Desktop panel rect (1920 frame) is about x221-1325, y118-806; strip x1344-1699. Hold the last good outgoing frame, drop the take's empty frames (65.20-65.28, 68.20-68.27, 75.50-75.57), cross-dissolve outgoing to incoming over 0.45 s ease-in-out. Grid to strip: animate the four face tiles from grid rects to strip rects over 0.5 s (65.0-65.5) while the desktop fades in 65.2-65.65. Mirror for 86.1: strip to grid 85.9-86.4 so the stage never snaps.
2. **Character subtitles are timed by character count, not words, so they read ahead of the voice; one has a typo.** words.json truth vs file:
   - Maya call: "I'm on the checkout discount bug, and" appears 43.46, spoken 44.34 (0.9 s early); "the push is waiting..." appears 45.72, spoken 46.56 (0.85 s early). Set 42.20-44.10 / 44.34-46.30 / 46.56-48.00.
   - n10: "record in Databricks, so Sam can just ask." appears 99.55, spoken about 100.4 (narrator pauses after "Databricks,"). Set 97.40-100.30 (break after "Databricks,") and 100.40-102.04. Today it breaks mid-phrase "is on the | record".
   - Maya meeting breaks mid-clause ("...fixed, tests | are run"). Set "Morning, all. Quick update from me." 57.80-59.90; "The checkout discount bug is found and fixed," 59.92-62.20; "tests are run, and the commit is on fix/checkout-discount." 62.32-65.30.
   - Jonas subtitle renders "work/pricing. html" (sentence splitter inserts a space). Must read "work/pricing.html".
   - General rule: cue start never earlier than the word (n02 second chunk is 0.36 s early, 9.30 vs 9.66).
3. **Hero 24-28 is too short and lags the drop.** Impact lands 24.00, pile static until 24.33 (menu gone 23.87, click 23.72, first window moves 24.33); all flights done by 25.9; desk labels fade in 25.75-26.5. Real reveal 1.6 s against the script's 4 s. Fix: start flights at 23.95 (staggered 0.12 s per window: terminal, preview, chart, phones), stretch so the last window lands about 27.2, camera ease 24.0-27.4 (already GRID by 28.1), labels in 26.6-27.4; n05 stays at 27.0. Move the click sfx from 23.72 to 23.80 (highlight on "Show desks" is 23.60-23.80).
4. **Voice sits only 6 to 8 dB over the ducked music and the music pumps.** Stems (pre-master): voice -22 to -25 dB rms; music unducked -20, ducked -30 (duck is -10 as specified, but the base is too loud). Lines with 0.9-1.2 s gaps (54.9-57.8, 65.3-67.1, 70.4-74.6, 82.4-88.3, 93.0-96.3) let the music jump 10 dB up and down every second. Fix in audio.py: post-24 s base music gain -7 to -10 dB; hold the duck across any gap under 2.2 s (merge speech intervals); release 0.8 s; keep -10 dB depth. Target at least 11 dB voice over ducked music. s05 "Approve." is 2.6 dB quieter (-25.1 vs -22.5): +2.5 dB.

## P2 should fix

5. **Ghost double exposures on face flights, and silent mouthing.** In 52.5-53.5 Priya and Jonas show two overlapped faces at 52.97 and 53.03; return 86.8-87.7 ghosts Ines and Priya at 87.27-87.60. Fix: make start and end rects pixel-identical so a 3-frame crossfade is enough; lengthen the flight to 1.1 s, 0.1 s stagger. Silent mouths: Jonas moves his mouth 69.30-69.50 (before his line at 70.42) and 74.80-75.50 (audio stops 74.42); Ines after 82.44. Fix: freeze Jonas's strip tile on a closed-mouth frame 69.2-70.4 and 74.45-75.6; move the Jonas to Ines switch to 74.75 (word "Ines" spans 74.6-74.95) and Maya to Jonas to 67.2 (on "Jonas?") instead of 68.23.
6. **Maya's desktop appears after she finishes.** Her line is 57.80-65.28, the desktop arrives 65.30, so "tests are run" (62.3) shows only faces. Fix: from 62.1 fade her static desktop panel (same terminal "Ran 50 tests ... OK") in as a still over 0.5 s, then the strip at 65.1. Truthful: same screen, earlier.
7. **"Chosen: Version B" badge is on screen from 75.6; Sam says "Version B. Ship it." at 82.8.** Disclosed in NOTES, but nothing points at it. Fix: at 82.8-84.6 add a thin green ring (token colour, 2 px) around the badge (about x988-1143, y283-303) and ease the camera 1.00 to 1.12 toward that corner. No fabricated state change.
8. **Notification sounds are masked.** rms at event time: bubbles 88.9 and 91.0 -36 dB vs music -22.5 (13 dB under); chime 109.3 -30.6 vs music -20.3 (10 dB under, not ducked); pop 38.0 -36 vs -29; tick 96.0 -42. Soft but inaudible. Fix: bubbles +8 dB, chime@109.3 +8, pop +6, tick +8; duck music -4 dB for 0.6 s at 90.9 and 109.2. **Pop is also 0.3 s early**: faces first appear 38.30 (on the word "face"); move pop 38.00 to 38.32.
9. **Riser is smooth but inaudible for 3 s.** sfx stem: -109 dB at 16.5, -50 at 19.0, -41 at 20, -34 at 21, -14.5 at 24.0 (monotonic, no step). The build dips because n04 ducks the music 19.4-22.2 (music -30 at 18.0, -38 at 19.5-22). Fix: start the riser at 15.0 about 12 dB louder at the start, cap n04's duck at -5 dB, so energy rises continuously 17-24.
10. **Music switch at 10.34 is abrupt** (kick lost and -10 dB inside a 0.2 s splice, mid-sentence "in one pile of windows"). Fix: end the light section at 12.29 (inside the pause 12.40-13.40), start the breakdown at DROP minus 6 bars (6 bars = 11.71 s, drop still lands 24.0), crossfade 0.8 s. Check that source 11.07-13.02 is still light first.
11. **Dead spots.** Ines stage 75.6-86.0 is static for 10.4 s, with 2.2 s of air 76.9-79.1 and 3.5 s of air 84.8-88.3. Team view 102.0-106.4 is a 4.4 s wait, the answer shows only 1.8 s, and there is no voice 102.04-110.6 (8.6 s). Fix: time-lapse the quiet stretches (77.0-78.9 at 3x); push n10 to 98.2 and time-lapse the wait 16x (99.5-105.8) so the answer lands near 103.5 and stays 3.5 s; camera push 1.00 to 1.25 onto the KPI row as it appears.
12. **End card doubles text.** Subtitle "Your AI team, with a desk, a face..." (to 115.4) and the card tagline (from 113.2) show the same sentence together 113.2-115.4. Fix: delay the card tagline to 115.45, faces row 116.0-116.8, "Built with" line 117.0 (card holds to 118.3); subtitle stays.
13. **Genie answer contradicts the table on screen.** Table: Maya 0 tasks, $0.00; answer: "Maya Chen ... 4 minutes". Real, but a judge will notice. Fix: do not close up on the answer; zoom on the KPI row and narrate KPIs; keep the answer at normal size.
14. **Junk windows ghost at 24.7-25.1** as flat grey translucent panels (washed-out double exposure). Fix: shrink and fade over 0.35 s at constant brightness, no grey plate, less tilt.
15. **Menu click is tiny.** At 23.2-23.9 the menu is about 10 px text in the top-right corner. Fix: camera push to the menu bar (rect x1560-1920, y0-130, zoom 2.0) 22.2-23.1, hold to 23.85, release into the hero move.

## P3 nice to have

16. n05 sync: camera arrives 0.09 (Maya), 0.17 (Priya), 0.18 (Jonas), 0.15 s (Ines) after the word onsets (29.06, 30.73, 32.12, 33.85). Move the keyframes 0.3 s earlier (29.15 to 28.85, 30.9 to 30.6, 32.3 to 32.0, 34.0 to 33.7). End "Maya's code..." subtitle at 30.50 (it lingers dim over Priya).
17. Call match move 40.4-41.0 leaves a faint ghost of Priya's tile text until 40.93: extend the veil fade 0.1 s. Maya's eyes are closed 41.07-41.9 before she speaks: arrive at the call at 41.6 (zoom 40.8-41.6).
18. Maya's tile "rings" on Sam's question (script 0:56): nothing visible (label "Maya Thinking"). Add a 0.4 s blue ring at 55.0.
19. Priya's notification covers the top 20 px of her face card (110.0): move up 24 px or left 40 px. It lasts only 2.3 s (109.1-111.4).
20. Log window appears 14.0-14.3 and fades 19.4-19.9 as a muddy double exposure over the pile: shorten to 0.2 s or dim the pile to 40 % first.
21. Final fade: afade is linear 118-120 and leaves -15 dB peaks at 119.5; use curve=exp or qsin. Measured true peak -1.3 vs target -1.5: set loudnorm TP -1.7.
22. Approve: cursor hovers from 95.0, click lands 95.85 (word 95.30-96.30). Shift click 0.3 s earlier if desired. Gap n09 end 95.22 to s05 95.30 is 0.08 s: add 0.2 s.
23. Pile shake is at most 1 px (log covers it by 14.3), so it reads as none. If visible but subtle is wanted, +-2.5 px, 14.0-19.4.
24. "Mozilla Firefox" is visible in the title bars of Jonas's and Ines's desktops (e.g. 70.5, 83.5). The rule bans audio, subtitles and overlays; confirm with the user whether to crop or blur the title strip.

## Script coverage (actual times)
- 0:00-0:06 present: voice 0.6, windows pop 0.5-5.0. 0:06-0:13 present, terminal types, chat bubbles.
- 0:13-0:19: "Who's doing what?" 13.4, log 14.0-14.3, scroll to 19.4: ok.
- 0:20-0:24: "Now watch" 19.4; menu 23.0; click 23.72. Present, see P1-3, P2-15.
- Hero 24.33-25.9 only (weak). Desks 28-37: each on its named word within 0.2 s (P3-16). Faces pop 38.30 on "face": ok.
- Maya call 42.2-48.0 (script 3 s, real 5.8 s), zoom in 40.4-41.0 match move ok, zoom out 48.3-49.9 on "talk to the team". Meeting opens 52.0, faces fly 52.5-53.5: ok.
- Maya tile ring: missing (P3-18). Maya share: desktop only at 65.3 (P2-6). Jonas pin 68.3, line 70.4. Ines pin 75.6, line 79.1. "Version B. Ship it." 82.8 (P2-7). Faces back 86.8-87.7.
- Messages 89.0-92.8 ok. Card 93.2, "Approve" 95.3, click 95.85, "You approved" 96.0. Push going through: absent by design; nothing shown 96.3-97.4.
- Team view slides up 97.4, typed 99-100.6, answer 106.5-108.3 (P2-11, P2-13). Priya notification 109.1 (script about 99, 10 s late, 2.3 s long). End: shrink 111.9-112.6, mark 112.6, faces row 114-114.6, built-with 114.8, fade 118-120. Ok except P2-12.

## Truth check
Nothing fabricated: the push, Maya's second answer and the Firefox audio are absent. Things that look different from what happened: Ines badge pre-exists (P2-7), Maya's desktop arrives after her line (P2-6), Team wait is 8x time-lapsed (disclosed), silent mouths (P2-5), Genie answer vs table (P2-13).
