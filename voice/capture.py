"""Portrait capture: a short Synthesia avatar session, one video frame saved as <name>.jpg (4:5) and <name>-sq.jpg (square).

    uv run python capture.py <name> <avatar_id> <out_dir> [--full]

--full also saves the whole frame as <name>-full.jpg (to look at an avatar before choosing who it is).

Needs LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET and SYNTHESIA_API_KEY. Run by scripts/capture-portraits.ts.
A 15-second session costs about 2.5 Synthesia credits.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents import AgentSession
from livekit.agents.utils import http_context
from livekit.plugins import synthesia
from PIL import Image

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env.local")


def crop(img: Image.Image, ratio: float) -> Image.Image:
    w, h = img.size
    if w / h > ratio:
        nw = int(h * ratio)
        return img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    nh = int(w / ratio)
    top = int((h - nh) * 0.15)  # keep the head: crop more from the bottom than the top
    return img.crop((0, top, w, top + nh))


async def main(name: str, avatar_id: str, out_dir: Path, full: bool = False) -> None:
    t0 = time.monotonic()
    url, key, secret = (os.environ[k] for k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"))
    room_name = f"portrait-{name}-{uuid.uuid4().hex[:6]}"
    token = (
        api.AccessToken(key, secret)
        .with_identity("portrait-capture")
        .with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True))
        .to_jwt()
    )
    room = rtc.Room()
    frame: asyncio.Future[rtc.VideoFrame] = asyncio.get_event_loop().create_future()

    @room.on("track_subscribed")
    def _on_track(track: rtc.Track, *_: object) -> None:
        if track.kind != rtc.TrackKind.KIND_VIDEO:
            return

        async def grab() -> None:
            n = 0
            async for ev in rtc.VideoStream(track):
                n += 1
                if n >= int(os.environ.get("CAPTURE_FRAME", "100")) and not frame.done():  # about 3 s in: past the first soft frames and the opening blink
                    frame.set_result(ev.frame)
                    return

        asyncio.ensure_future(grab())

    await room.connect(url, token)
    http_cm = http_context.open()
    await http_cm.__aenter__()
    avatar = synthesia.AvatarSession(synthesia.AvatarConfig(avatar_ids=[avatar_id]), join_timeout=40.0)
    try:
        await avatar.start(AgentSession(), room=room)
        f = await asyncio.wait_for(frame, 30)
        rgba = f.convert(rtc.VideoBufferType.RGBA)
        img = Image.frombuffer("RGBA", (rgba.width, rgba.height), bytes(rgba.data)).convert("RGB")
        out_dir.mkdir(parents=True, exist_ok=True)
        if full:
            img.save(out_dir / f"{name}-full.jpg", quality=90)
        crop(img, 4 / 5).save(out_dir / f"{name}.jpg", quality=90)
        crop(img, 1.0).save(out_dir / f"{name}-sq.jpg", quality=90)
        print(f"saved {out_dir / (name + '.jpg')} ({img.size[0]}x{img.size[1]}, {time.monotonic() - t0:.1f} s)")
    finally:
        await avatar.aclose()
        await room.disconnect()
        await http_cm.__aexit__(None, None, None)


if __name__ == "__main__":
    try:
        asyncio.run(main(sys.argv[1], sys.argv[2], Path(sys.argv[3]), "--full" in sys.argv))
    except synthesia.SynthesiaError as e:
        print(f"SynthesiaError type={e.type.value if e.type else None} status={e.status} retryable={e.retryable}: {e}", file=sys.stderr)
        sys.exit(2)
