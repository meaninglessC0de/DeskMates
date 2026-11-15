"""Narrator and Sam lines through LiveKit Inference TTS (no ElevenLabs key; LiveKit retired its ElevenLabs route).
Run: uv run --project ../voice python tools/tts.py [ids...]"""
import asyncio, json, sys, pathlib
import aiohttp
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import inference

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT.parent / ".env.local")
LINES = json.loads((ROOT / "lines.json").read_text())
VOICES = {
    "narrator": dict(model="inworld/inworld-tts-2", voice="Dennis"),
    "sam": dict(model="inworld/inworld-tts-2", voice="Ashley"),
    "maya": dict(model="deepgram/aura-2", voice="harmonia"),
    "jonas": dict(model="deepgram/aura-2", voice="mars"),
    "ines": dict(model="deepgram/aura-2", voice="vesta"),
}

async def synth(session, line):
    v = VOICES[line["who"]]
    tts = inference.TTS(model=v["model"], voice=v["voice"], language="en", sample_rate=48000, http_session=session)
    frames = []
    async for ev in tts.synthesize(line["text"]):
        frames.append(ev.frame)
    out = ROOT / "media" / "vo" / f"{line['id']}.wav"
    out.write_bytes(rtc.combine_audio_frames(frames).to_wav_bytes())
    print(line["id"], out.name, f"{sum(f.duration for f in frames):.2f}s")

async def main():
    want = set(sys.argv[1:])
    async with aiohttp.ClientSession() as s:
        for line in LINES:
            if want and line["id"] not in want:
                continue
            await synth(s, line)

asyncio.run(main())
