"""A local fake of office's three voice endpoints. It records the order of everything it receives."""

from __future__ import annotations

import json
from typing import Any

from aiohttp import web


class FakeOffice:
    def __init__(self, route_speakers: list[str] | None = None, replies: dict[str, list[str]] | None = None):
        self.log: list[tuple[str, Any]] = []
        self.route_speakers = route_speakers
        self.replies = replies or {}
        self.runner: web.AppRunner | None = None
        self.url = ""

    def names(self) -> list[str]:
        out = []
        for kind, data in self.log:
            if kind == "event" and data["type"] == "agent_transcript" and not data.get("final"):
                continue                                  # partial captions are not part of the order under test
            if kind == "event":
                out.append(f"event:{data['type']}:{data.get('employeeId', '')}".rstrip(":"))
            elif kind == "chat":
                out.append(f"chat:{data['speaker']}")
            else:
                out.append(kind)
        return out

    async def start(self) -> None:
        app = web.Application()
        app.router.add_post("/voice/calls/{id}/route", self._route)
        app.router.add_post("/voice/v1/chat/completions", self._chat)
        app.router.add_post("/voice/calls/{id}/events", self._event)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        port = self.runner.addresses[0][1]
        self.url = f"http://127.0.0.1:{port}"

    async def stop(self) -> None:
        if self.runner:
            await self.runner.cleanup()

    async def _route(self, req: web.Request) -> web.Response:
        body = await req.json()
        self.log.append(("route", body))
        return web.json_response({"speakers": self.route_speakers or []})

    async def _event(self, req: web.Request) -> web.Response:
        body = await req.json()
        self.log.append(("event", body))
        return web.Response(status=204)

    async def _chat(self, req: web.Request) -> web.StreamResponse:
        body = await req.json()
        speaker = req.headers.get("X-Speaker", "")
        self.log.append(("chat", {"speaker": speaker, "body": body}))
        res = web.StreamResponse(headers={"content-type": "text/event-stream"})
        await res.prepare(req)

        def chunk(delta: dict, finish: str | None = None) -> bytes:
            c = {"id": "x", "object": "chat.completion.chunk", "model": body["model"], "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
            return f"data: {json.dumps(c)}\n\n".encode()

        await res.write(chunk({"role": "assistant"}))
        for t in self.replies.get(speaker, ["Okay."]):
            await res.write(chunk({"content": t}))
        await res.write(chunk({}, "stop"))
        await res.write(b"data: [DONE]\n\n")
        await res.write_eof()
        return res
