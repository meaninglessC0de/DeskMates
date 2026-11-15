# Voice worker

LiveKit Agents worker for calls (Python 3.12, `uv`). One job per call. It only does speech and the avatar;
what is said comes from office (`/voice/v1/chat/completions`, `/voice/calls/:id/route`, `/voice/calls/:id/events`).

- Office starts it when `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set (`python agent.py start`), restarts it with backoff, logs to `DATA_DIR/voice.log`.
- Speech is LiveKit Inference by default; Deepgram or ElevenLabs when their keys exist. The avatar needs `SYNTHESIA_API_KEY` and an avatar id per person.
- `uv sync` creates `.venv` (ignored by git). `uv run pytest` runs the checks against a local fake of office, no keys needed.
- `agent.py`: `CallAgent.llm_node` is the language step (route, switch face and voice, stream the reply, report events).
- `capture.py`: portrait capture, run by `scripts/capture-portraits.ts`.
