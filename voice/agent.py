"""Voice worker for Agent Manager calls.

One job per call. Speech in and out runs here; what is said comes from office:
  POST /voice/calls/:id/route            meetings: who answers
  POST /voice/v1/chat/completions        the call mind (SSE), header X-Speaker
  POST /voice/calls/:id/events           joined, transcripts, speech_started, speech_ended, ended

Run by office (`python agent.py start`) when the LiveKit variables are set.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import AsyncIterable, AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    ModelSettings,
    WorkerOptions,
    cli,
    inference,
    llm,
    room_io,
)

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

log = logging.getLogger("employee-call")

AGENT_NAME = "employee-call"
AVATAR_TIMEOUT_S = 20.0
# The agent's own instructions are a marker: the real prompt is built by office per request.
BASE_INSTRUCTIONS = "Spoken replies come from the office call mind."
GREETING = "Greet your manager in one short sentence and say what you are on."


@dataclass
class Person:
    employee_id: str
    first_name: str
    role: str
    voice: dict[str, Any]
    avatar_id: str | None

    @staticmethod
    def from_meta(d: dict[str, Any]) -> "Person":
        return Person(
            employee_id=d["employeeId"],
            first_name=d.get("firstName", ""),
            role=d.get("role", ""),
            voice=d.get("voice") or {},
            avatar_id=d.get("avatarId"),
        )


@dataclass
class CallMeta:
    call_id: str
    office_url: str
    stt: str
    tts: str
    avatar: bool
    people: list[Person]

    @staticmethod
    def parse(raw: str) -> "CallMeta":
        d = json.loads(raw)
        speech = d.get("speech") or {}
        return CallMeta(
            call_id=d["callId"],
            office_url=d.get("officeUrl") or os.environ.get("OFFICE_URL", "http://127.0.0.1:4317"),
            stt=speech.get("stt", "livekit"),
            tts=speech.get("tts", "livekit"),
            avatar=bool(d.get("avatar")),
            people=[Person.from_meta(p) for p in d["participants"]],
        )


class OfficeClient:
    """The three voice endpoints of office. Event posts never raise: a missed caption must not end a call."""

    def __init__(self, base_url: str, call_id: str, client: httpx.AsyncClient | None = None):
        self.base = base_url.rstrip("/")
        self.call_id = call_id
        self.http = client or httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0))

    async def event(self, **ev: Any) -> None:
        try:
            await self.http.post(f"{self.base}/voice/calls/{self.call_id}/events", json=ev)
        except Exception as e:  # noqa: BLE001
            log.warning("event %s not delivered: %s", ev.get("type"), e)

    async def route(self, utterance: str, fallback: list[str]) -> list[str]:
        try:
            r = await self.http.post(f"{self.base}/voice/calls/{self.call_id}/route", json={"utterance": utterance})
            r.raise_for_status()
            speakers = r.json().get("speakers") or []
            return [s for s in speakers if isinstance(s, str)] or fallback
        except Exception as e:  # noqa: BLE001
            log.warning("route failed (%s); first participant answers", e)
            return fallback

    async def reply(self, speaker_id: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        body = {"model": self.call_id, "stream": True, "messages": messages}
        async with self.http.stream(
            "POST", f"{self.base}/voice/v1/chat/completions", json=body, headers={"X-Speaker": speaker_id}
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    return
                try:
                    delta = json.loads(data)["choices"][0]["delta"].get("content")
                except (ValueError, KeyError, IndexError):
                    continue
                if delta:
                    yield delta

    async def aclose(self) -> None:
        await self.http.aclose()


@dataclass
class Hooks:
    """What the agent needs from the session, so the logic can run without audio."""

    switch: Callable[[Person], Awaitable[None]]
    say: Callable[[AsyncIterable[str]], Any]  # returns a handle with `await handle.wait_for_playout()`


@dataclass
class Turn:
    role: str
    speaker: str | None
    text: str


class OfficeLLM(llm.LLM):
    """A placeholder model. AgentSession refuses to reply without one, but every reply comes from CallAgent.llm_node."""

    @property
    def model(self) -> str:
        return "office-call-mind"

    @property
    def provider(self) -> str:
        return "office"

    def chat(self, *args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("replies come from CallAgent.llm_node, not from this model")


class CallAgent(Agent):
    """The language step is `llm_node`: route, switch face and voice, stream the call mind's text."""

    def __init__(self, office: OfficeClient, people: list[Person], hooks: Hooks | None = None):
        super().__init__(instructions=BASE_INSTRUCTIONS)
        self.office = office
        self.people = people
        self.by_id = {p.employee_id: p for p in people}
        self.hooks = hooks
        self.history: list[Turn] = []
        self.previous_speaker: str | None = None
        self.current_speaker: str | None = None
        self._playout_done = asyncio.Event()
        self._interrupted = False
        self._ended: asyncio.Task[None] | None = None      # reports the first speaker's end of speech
        self._followups: asyncio.Task[None] | None = None  # the other speakers of a meeting turn
        self._turn_started = False

    # ---- session callbacks (wired in entrypoint; called directly by tests)

    def on_playout_finished(self) -> None:
        """The agent stopped speaking (finished or interrupted)."""
        self._playout_done.set()

    def on_user_started(self) -> None:
        self._interrupted = True
        self._playout_done.set()
        if self._followups and not self._followups.done():
            self._followups.cancel()

    # ---- the language step

    def llm_node(  # type: ignore[override]
        self, chat_ctx: llm.ChatContext, tools: list[llm.Tool], model_settings: ModelSettings
    ) -> AsyncIterator[str]:
        return self._turn(chat_ctx)

    async def _turn(self, chat_ctx: llm.ChatContext) -> AsyncIterator[str]:
        utterance, notes = self._read(chat_ctx)
        if utterance and (not self.history or self.history[-1].role != "user" or self.history[-1].text != utterance):
            self.history.append(Turn("user", None, utterance))
        self._interrupted = False
        self._turn_started = False
        self._playout_done = asyncio.Event()

        first = self.people[0].employee_id
        if len(self.people) > 1 and utterance:
            speakers = await self.office.route(utterance, [first])
        else:
            speakers = [first]
        speakers = [s for s in speakers if s in self.by_id] or [first]

        text = ""
        try:
            async for delta in self._speak(speakers[0], notes):
                text += delta
                yield delta
        finally:
            # also runs when the turn is cancelled by an interruption: speech_ended must still be reported
            if self._turn_started:
                self.history.append(Turn("assistant", speakers[0], text))
                self.previous_speaker = speakers[0]
                self._ended = asyncio.create_task(self._after_playout(speakers[0], text, speakers[1:], notes))

    async def _speak(self, speaker_id: str, notes: list[str]) -> AsyncIterator[str]:
        person = self.by_id[speaker_id]
        if self.hooks:
            try:
                await self.hooks.switch(person)
            except Exception as e:  # noqa: BLE001 - keep talking in the current face and voice
                log.warning("switch to %s failed: %s", person.first_name, e)
        self.current_speaker = speaker_id
        self._turn_started = True
        last_partial = 0.0
        text = ""
        started = False
        try:
            async for delta in self.office.reply(speaker_id, self._messages_for(speaker_id, notes)):
                if not started:
                    # first words are ready: office shows "speaking" only after it has shown "thinking"
                    started = True
                    await self.office.event(type="speech_started", employeeId=speaker_id)
                text += delta
                yield delta
                now = time.monotonic()
                if now - last_partial > 0.5:
                    last_partial = now
                    await self.office.event(type="agent_transcript", employeeId=speaker_id, text=text, final=False)
        except Exception as e:  # noqa: BLE001
            log.warning("call mind failed: %s", e)
            if not text:
                text = "Sorry, I lost my train of thought. Could you say that again?"
                if not started:
                    await self.office.event(type="speech_started", employeeId=speaker_id)
                yield text

    async def _after_playout(self, speaker_id: str, text: str, rest: list[str], notes: list[str]) -> None:
        await self._playout_done.wait()
        await self.office.event(type="agent_transcript", employeeId=speaker_id, text=text, final=True)
        await self.office.event(type="speech_ended", employeeId=speaker_id)
        if rest and self.hooks and not self._interrupted:
            self._followups = asyncio.create_task(self._run_rest(rest, notes))

    async def _run_rest(self, rest: list[str], notes: list[str]) -> None:
        try:
            for sp in rest:
                if self._interrupted:
                    return
                await self._say_one(sp, notes)
        except asyncio.CancelledError:
            return

    async def _say_one(self, speaker_id: str, notes: list[str]) -> None:
        assert self.hooks
        collected: list[str] = []

        async def stream() -> AsyncIterator[str]:
            async for d in self._speak(speaker_id, notes):
                collected.append(d)
                yield d

        handle = self.hooks.say(stream())
        await handle.wait_for_playout()
        text = "".join(collected)
        self.history.append(Turn("assistant", speaker_id, text))
        self.previous_speaker = speaker_id
        await self.office.event(type="agent_transcript", employeeId=speaker_id, text=text, final=True)
        await self.office.event(type="speech_ended", employeeId=speaker_id)

    # ---- chat history for the call mind

    def _read(self, chat_ctx: llm.ChatContext) -> tuple[str, list[str]]:
        """The newest user utterance and any per-turn instructions (from generate_reply)."""
        utterance = ""
        notes: list[str] = []
        for item in reversed(chat_ctx.items):
            if getattr(item, "type", None) != "message":
                continue
            text = (item.text_content or "").strip()  # type: ignore[union-attr]
            if not text:
                continue
            if item.role == "user":  # type: ignore[union-attr]
                if not utterance:
                    utterance = text
            elif item.role in ("system", "developer") and text != BASE_INSTRUCTIONS:  # type: ignore[union-attr]
                notes.insert(0, text)
        return utterance, notes

    def _messages_for(self, speaker_id: str, notes: list[str]) -> list[dict[str, str]]:
        msgs: list[dict[str, str]] = []
        for t in self.history:
            if t.role == "user":
                msgs.append({"role": "user", "content": t.text})
            elif t.speaker == speaker_id:
                msgs.append({"role": "assistant", "content": t.text})
        # an instruction only applies to the turn it was given for (the greeting), not to later turns
        if notes and not any(t.role == "user" for t in self.history):
            msgs = [{"role": "system", "content": n} for n in notes] + msgs
        return msgs


# ---- session assembly -------------------------------------------------------------------------


def make_stt(meta: CallMeta) -> Any:
    if meta.stt == "deepgram" and os.environ.get("DEEPGRAM_API_KEY"):
        from livekit.plugins import deepgram

        return deepgram.STT(model="nova-3", language="en")
    return inference.STT(model="deepgram/nova-3", language="en")


def make_tts(meta: CallMeta, first: Person) -> Any:
    v = first.voice or {}
    if meta.tts == "elevenlabs" and os.environ.get("ELEVENLABS_API_KEY"):
        from livekit.plugins import elevenlabs

        kw = {"voice_id": v["voiceId"]} if v.get("voiceId") else {}
        return elevenlabs.TTS(model="eleven_flash_v2_5", **kw)
    if meta.tts == "deepgram" and os.environ.get("DEEPGRAM_API_KEY"):
        from livekit.plugins import deepgram

        return deepgram.TTS(model=v.get("voiceId") or "aura-2-thalia-en")
    return inference.TTS(model=v.get("model") or "deepgram/aura-2", voice=v.get("voiceId") or "thalia", language="en")


def set_voice(tts: Any, meta: CallMeta, person: Person) -> None:
    v = person.voice or {}
    vid = v.get("voiceId")
    if not vid:
        return
    if meta.tts == "elevenlabs" and os.environ.get("ELEVENLABS_API_KEY"):
        tts.update_options(voice_id=vid)
    elif meta.tts == "deepgram" and os.environ.get("DEEPGRAM_API_KEY"):
        tts.update_options(model=vid)
    else:
        tts.update_options(voice=vid)


def make_session(meta: CallMeta, vad: Any) -> AgentSession:
    return AgentSession(
        stt=make_stt(meta),
        tts=make_tts(meta, meta.people[0]),
        vad=vad,
        llm=OfficeLLM(),
        # The language step is CallAgent.llm_node. Preemptive generation off: llm_node has side effects
        # (routing, avatar swaps, events) that must not run for a draft that is then thrown away.
        turn_handling={
            "turn_detection": "vad",
            "preemptive_generation": {"enabled": False},
            "endpointing": {"min_delay": 0.6, "max_delay": 3.0},
            "interruption": {"min_duration": 0.6, "min_words": 1},
        },
    )


def prewarm(proc: Any) -> None:
    from livekit.plugins import silero

    proc.userdata["vad"] = silero.VAD.load(min_silence_duration=0.4)


async def entrypoint(ctx: JobContext) -> None:
    meta = CallMeta.parse(ctx.job.metadata)
    office = OfficeClient(meta.office_url, meta.call_id)
    await ctx.connect()

    session = make_session(meta, ctx.proc.userdata["vad"])
    avatar = None
    if meta.avatar and os.environ.get("SYNTHESIA_API_KEY") and all(p.avatar_id for p in meta.people):
        from livekit.plugins import synthesia

        ids = list(dict.fromkeys(p.avatar_id for p in meta.people))[:5]
        candidate = synthesia.AvatarSession(
            synthesia.AvatarConfig(avatar_ids=ids), join_timeout=AVATAR_TIMEOUT_S - 2
        )
        try:
            # Attached before session.start(); on any failure the session is rebuilt, because a failed
            # avatar leaves the audio output routed to it and the library cannot unhook it.
            await asyncio.wait_for(candidate.start(session, room=ctx.room), AVATAR_TIMEOUT_S)
            avatar = candidate
            await office.event(type="avatar_ready")
        except Exception as e:  # noqa: BLE001
            log.warning("avatar failed, carrying on audio-only: %s", e)
            await office.event(type="avatar_failed", reason=str(e)[:200])
            session = make_session(meta, ctx.proc.userdata["vad"])

    current_avatar: dict[str, str | None] = {"id": meta.people[0].avatar_id if avatar else None}

    async def switch(person: Person) -> None:
        if person.employee_id == agent.current_speaker:
            return
        t0 = time.monotonic()
        swapped = False
        if avatar and person.avatar_id and person.avatar_id != current_avatar["id"]:
            try:
                await avatar.swap_avatar(person.avatar_id)
                current_avatar["id"] = person.avatar_id
                swapped = True
            except Exception as e:  # noqa: BLE001 - keep the face on screen, the ring marks the speaker
                log.warning("avatar swap failed: %s", e)
        if session.tts is not None:
            set_voice(session.tts, meta, person)
        log.warning("switched to %s: avatar swap %s in %.0f ms, voice %s", person.first_name, "done" if swapped else "not needed", (time.monotonic() - t0) * 1000, (person.voice or {}).get("voiceId"))

    agent = CallAgent(office, meta.people, Hooks(switch=switch, say=lambda text: session.say(text)))

    @session.on("user_input_transcribed")
    def _on_user(ev: Any) -> None:
        asyncio.create_task(office.event(type="user_transcript", text=ev.transcript, final=bool(ev.is_final)))

    @session.on("agent_state_changed")
    def _on_agent_state(ev: Any) -> None:
        if ev.old_state == "speaking" and ev.new_state != "speaking":
            agent.on_playout_finished()

    @session.on("user_state_changed")
    def _on_user_state(ev: Any) -> None:
        if ev.new_state == "speaking":
            agent.on_user_started()

    async def _ended() -> None:
        await office.event(type="ended")
        await office.aclose()

    ctx.add_shutdown_callback(_ended)

    await session.start(
        agent=agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(participant_identity="manager"),
    )
    await office.event(type="joined")
    session.generate_reply(instructions=GREETING, allow_interruptions=False)


if __name__ == "__main__":
    # port=0: the worker's own status server takes any free port. The default (8081) fails with "address already in use"
    # when anything else on the machine holds it, including a second copy of the app; host keeps it off the network.
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm, agent_name=AGENT_NAME, num_idle_processes=1, host="127.0.0.1", port=0))
