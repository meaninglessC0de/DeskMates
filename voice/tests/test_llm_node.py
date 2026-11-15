"""Exercises CallAgent.llm_node against a local fake of office, with no audio and no LiveKit room."""

from __future__ import annotations

import asyncio
import json

import pytest
from fake_office import FakeOffice

import agent as A
from livekit.agents import ModelSettings, llm


def person(i: str, name: str, role: str, avatar: str | None = None) -> A.Person:
    return A.Person(i, name, role, {"provider": "livekit", "voiceId": f"v-{i}", "model": "deepgram/aura-2"}, avatar)


def ctx(*msgs: tuple[str, str]) -> llm.ChatContext:
    c = llm.ChatContext.empty()
    for role, text in msgs:
        c.add_message(role=role, content=text)  # type: ignore[arg-type]
    return c


async def drain(it) -> str:
    out = ""
    async for t in it:
        out += t
    return out


class FakeHandle:
    def __init__(self, consume):
        self.task = asyncio.ensure_future(consume)

    async def wait_for_playout(self) -> None:
        await self.task


@pytest.fixture
async def office():
    o = FakeOffice()
    await o.start()
    yield o
    await o.stop()


async def test_one_to_one_turn_order(office: FakeOffice):
    office.replies = {"maya": ["I am ", "rebuilding the pricing page."]}
    client = A.OfficeClient(office.url, "call_1")
    switched: list[str] = []

    async def switch(p: A.Person) -> None:
        switched.append(p.employee_id)
        office.log.append(("switch", p.employee_id))

    agent = A.CallAgent(client, [person("maya", "Maya", "Web developer")], A.Hooks(switch=switch, say=lambda t: None))
    text = await drain(agent.llm_node(ctx(("system", A.BASE_INSTRUCTIONS), ("user", "what are you doing?")), [], ModelSettings()))
    assert text == "I am rebuilding the pricing page."
    agent.on_playout_finished()
    await agent._ended
    names = office.names()
    # one-to-one: no /route call; face and voice first, then the completions call, speech_started with the first words, then the end events
    assert names[0:3] == ["switch", "chat:maya", "event:speech_started:maya"]
    assert "route" not in names
    assert names[-2:] == ["event:agent_transcript:maya", "event:speech_ended:maya"]
    final = [d for k, d in office.log if k == "event" and d["type"] == "agent_transcript" and d["final"]]
    assert final[0]["text"] == "I am rebuilding the pricing page."
    body = next(d for k, d in office.log if k == "chat")["body"]
    assert body["model"] == "call_1"
    assert body["messages"] == [{"role": "user", "content": "what are you doing?"}]
    assert agent.previous_speaker == "maya"
    await client.aclose()


async def test_meeting_two_speakers_in_order(office: FakeOffice):
    office.route_speakers = ["jonas", "maya"]
    office.replies = {"jonas": ["Sources say no."], "maya": ["Shipping Friday."]}
    client = A.OfficeClient(office.url, "call_2")
    spoken: list[str] = []

    async def switch(p: A.Person) -> None:
        office.log.append(("switch", p.employee_id))

    def say(text_iter):
        async def consume():
            spoken.append(await drain(text_iter))

        return FakeHandle(consume())

    people = [person("maya", "Maya", "Web developer"), person("jonas", "Jonas", "Researcher")]
    agent = A.CallAgent(client, people, A.Hooks(switch=switch, say=say))
    first = await drain(agent.llm_node(ctx(("user", "Jonas and Maya, any news?")), [], ModelSettings()))
    assert first == "Sources say no."
    agent.on_playout_finished()
    await agent._ended
    await agent._followups
    assert spoken == ["Shipping Friday."]
    assert office.names() == [
        "route",
        "switch", "chat:jonas", "event:speech_started:jonas",
        "event:agent_transcript:jonas", "event:speech_ended:jonas",
        "switch", "chat:maya", "event:speech_started:maya",
        "event:agent_transcript:maya", "event:speech_ended:maya",
    ]
    names = office.names()
    assert names.index("event:speech_ended:jonas") < names.index("event:speech_started:maya")
    assert [d["utterance"] for k, d in office.log if k == "route"] == ["Jonas and Maya, any news?"]
    maya_body = [d for k, d in office.log if k == "chat" and d["speaker"] == "maya"][0]["body"]
    assert maya_body["messages"] == [{"role": "user", "content": "Jonas and Maya, any news?"}]   # Jonas's line is not in Maya's history
    assert agent.previous_speaker == "maya"
    await client.aclose()


async def test_interruption_skips_the_next_speaker_and_still_ends_the_first(office: FakeOffice):
    office.route_speakers = ["jonas", "maya"]
    client = A.OfficeClient(office.url, "call_3")
    said: list[str] = []
    people = [person("maya", "Maya", "Web developer"), person("jonas", "Jonas", "Researcher")]

    async def switch(p: A.Person) -> None:
        pass

    agent = A.CallAgent(client, people, A.Hooks(switch=switch, say=lambda t: said.append("x")))
    await drain(agent.llm_node(ctx(("user", "Everyone?")), [], ModelSettings()))
    agent.on_user_started()
    await agent._ended
    await asyncio.sleep(0.05)
    assert said == []                                   # Maya is not asked to speak after the interruption
    assert agent._followups is None
    names = office.names()
    assert names[-2:] == ["event:agent_transcript:jonas", "event:speech_ended:jonas"]   # the first speaker's end is still reported
    assert "chat:maya" not in names
    await client.aclose()


async def test_greeting_carries_the_turn_instruction_and_not_the_base_prompt(office: FakeOffice):
    client = A.OfficeClient(office.url, "call_4")
    agent = A.CallAgent(client, [person("maya", "Maya", "Web developer")])
    await drain(agent.llm_node(ctx(("system", A.BASE_INSTRUCTIONS), ("system", A.GREETING)), [], ModelSettings()))
    body = next(d for k, d in office.log if k == "chat")["body"]
    assert body["messages"] == [{"role": "system", "content": A.GREETING}]
    # a later turn does not repeat the greeting instruction
    agent.on_playout_finished()
    await agent._ended
    await drain(agent.llm_node(ctx(("system", A.BASE_INSTRUCTIONS), ("user", "hi")), [], ModelSettings()))
    body2 = [d for k, d in office.log if k == "chat"][1]["body"]
    assert body2["messages"] == [{"role": "assistant", "content": "Okay."}, {"role": "user", "content": "hi"}]
    await client.aclose()


async def test_router_and_office_failures_fall_back(office: FakeOffice):
    client = A.OfficeClient("http://127.0.0.1:1", "call_5")     # nothing listens here
    assert await client.route("hello", ["maya"]) == ["maya"]
    await client.event(type="joined")                            # must not raise
    await client.aclose()


async def test_call_mind_failure_speaks_an_apology(office: FakeOffice):
    client = A.OfficeClient("http://127.0.0.1:1", "call_6")
    agent = A.CallAgent(client, [person("maya", "Maya", "Web developer")])
    text = await drain(agent.llm_node(ctx(("user", "hello")), [], ModelSettings()))
    assert "lost my train of thought" in text
    await client.aclose()


def test_metadata_parses_what_office_sends():
    raw = json.dumps({
        "callId": "call_9", "officeUrl": "http://127.0.0.1:4327", "speech": {"stt": "deepgram", "tts": "elevenlabs"}, "avatar": True,
        "participants": [{"employeeId": "e1", "firstName": "Maya", "role": "Web developer", "voice": {"provider": "elevenlabs", "voiceId": "x"}, "avatarId": "av"}],
    })
    m = A.CallMeta.parse(raw)
    assert (m.call_id, m.stt, m.tts, m.avatar) == ("call_9", "deepgram", "elevenlabs", True)
    assert m.people[0].avatar_id == "av" and m.people[0].voice["voiceId"] == "x"


async def test_inside_a_real_agent_session_in_text_mode(office: FakeOffice):
    """LiveKit Agents' text mode: a typed user turn through AgentSession, no audio, no room."""
    from livekit.agents import AgentSession

    office.replies = {"maya": ["I am rebuilding ", "the pricing page."]}
    client = A.OfficeClient(office.url, "call_7")
    agent = A.CallAgent(client, [person("maya", "Maya", "Web developer")])
    async with AgentSession(llm=A.OfficeLLM()) as session:
        await session.start(agent)
        result = await session.run(user_input="what are you doing?")
        await asyncio.wait_for(result, 10)
        msg = result.expect.next_event().is_message(role="assistant")
        assert msg.event().item.text_content == "I am rebuilding the pricing page."
    assert [d for k, d in office.log if k == "chat"][0]["body"]["messages"] == [{"role": "user", "content": "what are you doing?"}]
    assert "event:speech_started:maya" in office.names()      # speech_ended needs real audio playout (agent state), see the live call check
    await client.aclose()
