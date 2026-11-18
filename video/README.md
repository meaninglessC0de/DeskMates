# Demo video

Script: `docs/hackathon/demo-video-script.md`. Composition: Remotion (`src/Main.tsx`), 1920 x 1080, 30 fps, 120 s.

```bash
uv run --project ../voice python tools/tts.py      # voice-over (LiveKit Inference: Inworld for narrator and Sam, Aura-2 app voices for the agents)
uvx --python 3.12 --with numpy python tools/music.py 24.0 28.4 37.8 51.5 77.5 89.5 100.5   # original 112 BPM track, whoosh times as args
node tools/render.mjs Deskmates out/deskmates-raw.mp4
ffmpeg -i out/deskmates-raw.mp4 -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 256k out/deskmates-demo.mp4
```

Copy `media/vo/*.wav`, `media/music/track.wav` into `public/media/` and the portraits, brand mark and Team view screenshot into `public/img/` before rendering (generated media is gitignored).

v1 is built from the app's real screenshots and Synthesia portraits with code-drawn desks. v2 (real Recordly recordings of the Desks view, the agent pipeline, the call and the meeting) is `src/MainV2.tsx` when it lands.
