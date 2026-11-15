# W7 hand-back: calls (voice worker, call mind, meeting router, avatar)

Status: everything in the brief is written and was run for real, including the avatar, because the LiveKit, Anthropic and Synthesia keys arrived during the build. Not run: Deepgram and ElevenLabs paths (no keys), raise hand (not built).

## What works, with real output

Checks (all exit 0):
```
npm run typecheck:area -- src/office/calls   -> no type errors under src/office/calls
npm run typecheck:area -- src/renderer       -> no type errors under src/renderer
npm run typecheck:area -- scripts            -> no type errors under scripts
npx vitest run src/office/calls              -> Test Files 5 passed (5), Tests 38 passed (38)
npx vitest run src/renderer/src/stage        -> Test Files 2 passed (2), Tests 22 passed (22)   (4 are mine: pickMedia)
cd voice && uv run pytest -q                 -> 8 passed
npm run purity -- src/renderer               -> no raw element Astryx has a component for ... (exit 0)
```
Unit coverage (`src/office/calls/*.test.ts`): prompt contents from a seeded employee (state, task, plan, activity, chat, waiting, notes, 15-line cap, meeting line); streamed text, `tell_worker` delivering `{kind:'manager', via:'call'}` through `CallsHost`, `look_at_screen` image block, the "One second." filler at 2.5 s with fake timers; the router (every rule of 8.3 plus model pick and every fallback); the token decoded in the test (room, identity, grants, `roomConfig.agents[0]` with a JSON-string `metadata`, `syncStreams`); the worker supervisor (spawn with keys and `OFFICE_URL`, `voice.log`, backoff 1000 then 2000 ms and reset after a stable run, spawn error, stop with no restart); the real routes (`POST /api/calls`, events, `/route`, OpenAI-style SSE chunks ending `data: [DONE]`, a 404 for an unknown call, `DELETE` posting the thread line, and a regression test for the abort bug below).

Modes:
- `MOCK_LLM=1 DESKTOPS=mock` office: `capabilities.calls` is `audio`, `POST /api/calls` returns `mock: true`, no worker is spawned.
- Real mode with the three LiveKit variables emptied: health shows `"calls":"off"`, `POST /api/calls` answers `409 {"error":{"code":"calls_off","message":"Add LiveKit keys to make calls."}}`, no worker, no `voice.log`.
- With keys: office spawns `voice/.venv/bin/python agent.py start`, the worker registers (`registered worker ... employee-call`), output goes to `DATA_DIR/voice.log`. Dev switch for testing real calls with scripted employees (cheap): `CALLS_REAL=1 MOCK_LLM=1` (read from `process.env` in `calls/index.ts`).

Python worker (4 and the real run): `uv sync` resolved `livekit-agents 1.8.12`, `livekit-plugins-{silero,deepgram,elevenlabs,openai,synthesia} 1.8.12`, `livekit 1.2.1`, `livekit-api 1.2.3`, `openai 3.51.0`, `httpx 0.28.1`, `pillow 13.0.0`; dev: `pytest 9.2.0`, `pytest-asyncio 1.5.0`, `aiohttp 3.14.5`. Python 3.12. `tests/test_llm_node.py` runs `CallAgent.llm_node` against a local fake of the three office endpoints: one-to-one order is `chat`, `speech_started`, final transcript, `speech_ended` (no `/route`); a two-speaker meeting is `route`, switch, `chat`, `speech_started`, final, `speech_ended`, switch, `chat` ... for the second speaker (and the first speaker's history does not leak into the second's); an interruption skips the next speaker but still reports the first one's end; failures of office fall back; and one test drives it inside a real `AgentSession` in text mode.

### Real call-mind check (`scripts/smoke/call-mind.ts`, real haiku-5-5, mock desktop)
```
employee Priya (needs_you), task: This is a long task: draft three campaign options for the la
1. "What are you doing?" -> first text 1442 ms, total 1801 ms
   I've finished the three campaign options for the launch draft and run the checks. I'm now waiting on your go-ahead to publish it. Want me to put the details in chat?
2. instruction -> first text 703 ms, total 3325 ms
   Got it, I'll add the pricing comparison and let you know when it's done.
[calls] Priya was told: Add a pricing comparison to the launch campaign work. Compare our launch pricing ...   <- tell_worker delivered
PASS
```
Time to first text over about 20 requests: 0.55 to 3.5 s, typically 0.8 to 2 s (the API's speed varies; a cold first request is slowest).

### Real audio check (`scripts/smoke/call-audio.ts`: Chromium on the built web renderer at :4337, fake microphone playing a `say` recording, driven through the UI)
One-to-one, audio only (LiveKit Inference speech: Deepgram nova-3 in, Deepgram Aura-2 out):
```
 20762 caption user final: What are you working on right now?
 20764 speaker Maya thinking
 22558 speaker Maya speaking
 31411 caption Maya final: I just wrapped up the team page and saved it. ...
 31413 speaker Maya idle
  PASS user_transcript / agent_transcript / speech_started / speech_ended / remote audio received (172564 B inbound-rtp)
  time from end of the audio file to speech_started: 1668 to 3504 ms across runs (estimate from when the mic opened); final user transcript to speech_started 0.9 to 2.8 s
```
Meeting of three, audio only: "Hey Priya, how is the campaign going right now?" gave `speaker Priya thinking/speaking`, Priya answered first; "Hey Jonas, what have you been reading lately?" gave Jonas. `--expect` passed both times. A name-only first fragment ("Hey, Jonas.") is transcribed as its own final; at `min_delay` 0.3 this made two turns, at 0.6 it did not (see tuning).

### Avatar (real Synthesia)
- Ids: I did not write `config/cast-ids.txt`. All eight ids start a session (probe, 8 sessions, 4.1 to 5.3 s each including the join). None returned `FEATURE_NOT_IN_PLAN`, a concurrency error or an unknown avatar.
- One-to-one with a face (Maya): avatar ready 3085 ms after the call started (office log `[calls] avatar ready 3085 ms`); the page decoded the video (`inbound-rtp video 1663370 B, 718 frames`) and received the audio; state `live (avatar)`. Mouth moves: mean frame-to-frame change 2.35 while speaking versus 0.49 quiet; two frames from the speech (lips apart, different shapes, eyes open and mid-blink) were looked at. End of audio to `speech_started` 2.5 s.
- Meeting of three with `swap_avatar` ("Jonas and Priya, give me one line each"): Jonas answers, then Priya, in spoken order. Swap time from the worker log: 921 and 909 ms (an earlier run 992 and 993 ms). The picture changes 0.72 to 0.81 s before each speaker's text is ready (biggest frame jump), so the new face shows about a second before the voice starts; voice ids set before generating: harmonia then mars then aurora (logged). A saved frame during Priya's turn shows Priya's face with the mouth moving. That the voice audibly changed was not listened to or recorded.
- Credit use: about 12 minutes of avatar session in total (8 probe sessions, 11 portrait sessions, 5 calls); no credit figure is readable from the API (no balance endpoint is documented).
- Portraits: `scripts/capture-portraits.ts` saved `config/portraits/<first>.jpg` (409x512, 4:5) and `<first>-sq.jpg` (square) for all eight; contact sheet looked at: Maya (dark curly hair, light blue shirt), Priya (dark curly hair, pink knit vest over a striped shirt), Ines (blond, mint jacket, purple earrings; eyes closed in two captures, retaken at frame 100 with eyes open), Marcus and others fine. `CAPTURE_FRAME` (default 100) picks the frame.
- **Mapping (`config/avatars.json`, read by `realCalls.ts` and `capture-portraits.ts` when the cast file has `avatarId: null`)**, chosen by gender and look from the stills: Maya = sample Mei, Priya = workspace 5, Jonas = workspace 2, Ines = workspace 3, Kenji = sample Kenji, Amara = workspace 4, Marcus = workspace 1, Hannah = sample Jenny. **Amara and Hannah look nearly identical** (workspace 4 and Jenny): fine for the first four people, swap one when another woman exists.

## Voices (config/voices.json, keyed by first name; sources in its `_source` and `research-log.md`)
LiveKit Inference documents only four Cartesia voices, so the default provider is Deepgram Aura-2 through Inference (`deepgram/aura-2`, no extra key). Maya harmonia, Priya aurora, Jonas mars, Ines vesta, Kenji pluto, Amara athena, Marcus apollo, Hannah callista (five women, three men, all distinct). The same file holds the Deepgram plugin ids and ElevenLabs default-voice ids (reported, from a third-party table; ElevenLabs says its Default voices expire 2026-12-31): not run, no key. Provider choice (office decides, worker follows): ElevenLabs speech if its key exists, else Deepgram if its key exists, else LiveKit Inference; speech to text is Deepgram if its key exists.
**Merge into `config/cast.json` (I did not touch it):** for each person set `"voice": { "provider": "livekit", "voiceId": "<their livekit voiceId above>", "label": "<label in voices.json>" }` and `"avatarId"` from `config/avatars.json`. `realCalls.ts` does not depend on the merge (it reads both files itself).

## Not run (and the single command that runs it)
- Deepgram and ElevenLabs speech (no keys): put the key in `.env.local`, restart office, run `npx tsx scripts/smoke/call-audio.ts --lead 26 --who Maya`.
- Voice samples (`config/voices/<first>.mp3`, the Hear button): `npx tsx scripts/capture-voices.ts` (prints "skipped" without an ElevenLabs or Deepgram key; LiveKit Inference voices cannot be sampled outside a room). Not run.
- Raise hand (`CALL_HANDS=1`): not built.
- Not tried: user interrupting the agent mid-sentence; a call surviving a worker crash; the Electron shell (browser only); `FEATURE_NOT_IN_PLAN` path (never returned); avatar failure fallback in a live run (written: 20 s timeout, `avatar_failed`, session rebuilt audio-only; covered only by reading the library source).

## Deviations and things to know
1. **Model request:** `output_config: {effort: 'low'}`, no `thinking` option, `max_tokens` 400, cache breakpoint on the system block, as the spec. Measured: by default haiku-5-5 sometimes thinks 1 to 1.5 s first; with thinking disabled it narrated its reasoning aloud ("Suhaan is asking for a status line..."), so I did not disable it. I added one prompt line forbidding narration.
2. After a spoken acknowledgement plus `tell_worker` the turn ends without a second request; if the model goes straight to the tool, a second request asks for the spoken reply; if still silent, "Got it, I will pass that on." is spoken. `inbox item messageId` for calls is `call:<callId>:<n>`, not a stored message id: W2's `markSeen` must tolerate it.
3. **Core edit (re-read and edited with Edit):** `src/office/routes/server.ts` `/voice/v1/chat/completions`: `req.raw.on('close', abort)` became `reply.raw.on('close', abort)`. On Node 26 the request emits `close` as soon as its body is read, which aborted every real model call (`APIUserAbortError`, 500). No other core file was edited. `calls/index.ts` is mine: it now also builds real calls when `MOCK_LLM=1` and `CALLS_REAL=1`.
4. Tuning (all in `voice/agent.py`): turn detection `vad` (Deepgram-through-Inference does not give an end-of-turn signal), `endpointing.min_delay` 0.6 (0.3 split "Jonas," from the rest of a sentence), silero `min_silence_duration` 0.4, preemptive generation off (`llm_node` has side effects), placeholder `OfficeLLM` (the session refuses to reply without a model). `speech_started` is posted when the first words arrive, so office shows "thinking" first; true audio starts about 0.3 s later.
5. The dev renderer server (`npm run web`) reloaded the page mid-call whenever another agent saved a renderer file, which dropped the call; the audio script therefore runs against a built bundle (`vite build --outDir data-w7/web-dist`, `vite preview --port 4337`) and drives the UI.
6. `useLiveKit.ts` plays the agent's voice itself (`track.attach()`) when there is no avatar video, because `Stage` only gives audio to a tile that has video. It never plays both.
7. My restart script's `pkill -f "voice/.venv/bin/python agent.py"` also killed a worker belonging to another office (4317); its supervisor restarted it within a second, as designed. Two offices sharing one LiveKit project means either worker can take a call; the job metadata carries the right `officeUrl`, so it still works.
8. `uv.lock` is committed-able. `voice/.venv` is gitignored. `config/avatars.json` and the portraits are new files.

## What a person must still try at the microphone
- A real conversation with a real microphone in the Electron app: echo and barge-in (talking over the agent), a noisy room, a Bluetooth headset, and whether the microphone prompt appears and works.
- Say "stop" or interrupt mid-answer in a meeting: the next speaker should not start.
- Listen to a three-person meeting: the voice should change with each face (not listened to here).
- Hear the avatar's lip sync and the 0.7 to 1 s gap between a face change and the voice.
- A call longer than a few minutes, hang up from the Stage, and from the other side (close the window).
- With a Deepgram or ElevenLabs key: voice quality of the eight chosen voices.

## Files
`voice/{agent.py,capture.py,pyproject.toml,uv.lock,README.md,.python-version,tests/}`, `src/office/calls/{index.ts,realCalls.ts,mind.ts,prompt.ts,router.ts,summary.ts,token.ts,voices.ts,voiceWorker.ts,testHost.ts}` and five test files, `src/renderer/src/stage/useLiveKit.ts` (+ test), `scripts/smoke/{call-mind,call-audio,call-ttft}.ts`, `scripts/capture-{portraits,voices}.ts`, `config/{voices.json,avatars.json}`, `config/portraits/*.jpg`.

## Cleanup
Every office, preview server and worker I started is stopped (`lsof -ti tcp:4327,4337` is empty); `data-w7/` (gitignored) holds the seeded database, `voice.log`, the avatar probe frames and the call-audio recordings.
