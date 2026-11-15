import path from 'node:path';
import { RoomServiceClient } from 'livekit-server-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { ulid } from 'ulid';
import type { CallInfo, Env, ServerEvent, VoiceChatRequest, VoiceWorkerEvent } from '../../shared/index.ts';
import { runCallMind, type MindClient } from './mind.ts';
import { modelPicker, routeUtterance, type RouteParticipant } from './router.ts';
import { summarizeCall, type TranscriptLine } from './summary.ts';
import { mintUserToken, type DispatchMetadata } from './token.ts';
import { CallError, type Calls, type CallsHost, type CallsMode } from './types.ts';
import { chooseSpeech, loadAvatars, voiceFor } from './voices.ts';
import { createWorkerSupervisor, hasLiveKitKeys, type WorkerSupervisor } from './voiceWorker.ts';

type CallEvent = Extract<ServerEvent, { type: 'call' }>['event'];

const ROOT = path.resolve(import.meta.dirname, '../../..');
const JOIN_TIMEOUT_MS = 45_000;

interface Call {
  info: CallInfo;
  people: RouteParticipant[];
  pendingAddress: string | null;
  previousSpeaker: string | null;
  transcript: TranscriptLine[];
  said: Map<string, string[]>;       // meeting: what each person has said so far
  instructions: { employeeId: string; text: string }[];
  phase: { employeeId: string | null; phase: 'thinking' | 'speaking' | 'idle' };
  joined: boolean;
  ended: boolean;
  joinTimer: NodeJS.Timeout | null;
}

export interface RealCallsDeps {
  /** The model client for the call mind, the router and the call summary. Default: the Anthropic SDK with ANTHROPIC_API_KEY. */
  client?: MindClient | null;
  worker?: WorkerSupervisor;
  roomService?: { deleteRoom(room: string): Promise<unknown> };
  joinTimeoutMs?: number;
}

export function createRealCalls(env: Env, host: CallsHost, deps: RealCallsDeps = {}): Calls {
  const calls = new Map<string, Call>();
  const client: MindClient | null =
    deps.client !== undefined ? deps.client : env.ANTHROPIC_API_KEY ? (new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) as unknown as MindClient) : null;
  const worker =
    deps.worker ??
    createWorkerSupervisor({ env, voiceDir: path.join(ROOT, 'voice'), logFile: path.resolve(env.DATA_DIR, 'voice.log') });
  const roomService =
    deps.roomService ??
    new RoomServiceClient(env.LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const speech = chooseSpeech(env);
  const mode: CallsMode = env.SYNTHESIA_API_KEY ? 'avatar' : 'audio';

  const emit = (callId: string, event: CallEvent): void => host.emit({ type: 'call', callId, event });
  const first = (id: string): string => host.employee(id)?.persona.firstName ?? 'Someone';

  function setPhase(c: Call, employeeId: string | null, phase: 'thinking' | 'speaking' | 'idle'): void {
    if (c.phase.employeeId === employeeId && c.phase.phase === phase) return;
    c.phase = { employeeId, phase };
    emit(c.info.id, { kind: 'speaker', employeeId, phase });
  }

  function release(c: Call): void {
    if (c.joinTimer) clearTimeout(c.joinTimer);
    c.joinTimer = null;
    for (const p of c.people) host.setOnCall(p.employeeId, null);
  }

  async function finish(c: Call): Promise<void> {
    c.ended = true;
    calls.delete(c.info.id);
    release(c);
    const id = c.info.id;
    const minutes = Math.max(1, Math.round((Date.now() - c.info.startedMs) / 60_000));
    const names = c.people.map((p) => p.firstName);
    const line = c.people.length === 1 ? `Call with ${names[0]} · ${minutes} min` : `Meeting · ${minutes} min · ${names.join(', ')}`;
    for (const p of c.people) {
      emit(id, { kind: 'participant', employeeId: p.employeeId, state: 'left' });
      if (host.employee(p.employeeId)) host.postSystemMessage(p.employeeId, line);
    }
    emit(id, { kind: 'state', state: 'ended', mode: c.info.mode });
    void roomService.deleteRoom(c.info.room).catch(() => {});
    // the long session learns what was said (written in the background; the call is already closed)
    void (async () => {
      for (const p of c.people) {
        if (!host.employee(p.employeeId)) continue;
        const mine = c.instructions.filter((i) => i.employeeId === p.employeeId).map((i) => i.text);
        const text = await summarizeCall(client, env.VOICE_MODEL, p.firstName, c.transcript, mine);
        host.deliverToWorker(p.employeeId, { kind: 'office', text: `Call summary: ${text}` });
      }
    })();
  }

  async function failCall(c: Call, reason: string): Promise<void> {
    if (c.ended) return;
    c.ended = true;
    calls.delete(c.info.id);
    release(c);
    emit(c.info.id, { kind: 'state', state: 'failed', mode: c.info.mode });
    host.emit({ type: 'toast', text: reason, tone: 'error' });
    void roomService.deleteRoom(c.info.room).catch(() => {});
  }

  const impl: Calls = {
    mode: () => mode,

    async start(employeeIds) {
      const ids = [...new Set(employeeIds)];
      if (ids.length < 1 || ids.length > 4) throw new CallError(400, 'bad_request', 'Pick between one and four people.');
      if (!worker.alive()) throw new CallError(409, 'calls_off', 'The voice worker is not running yet. Try again in a few seconds.');
      for (const id of ids) {
        const e = host.employee(id);
        if (!e) throw new CallError(404, 'not_found', 'That person is not on your team.');
        if (e.state === 'offline' || e.state === 'starting')
          throw new CallError(409, 'employee_unavailable', `${e.persona.firstName}'s desktop is not running.`);
        if (e.state === 'on_call') throw new CallError(409, 'employee_busy', `${e.persona.firstName} is already on a call.`);
      }
      const callId = `call_${ulid()}`;
      const room = `room-${callId.toLowerCase()}`;
      const people: RouteParticipant[] = ids.map((id) => {
        const p = host.employee(id)!.persona;
        return { employeeId: id, firstName: p.firstName, role: p.role };
      });
      // the cast file's avatar id, else config/avatars.json (read per call, so a change needs no restart)
      const avatarFile = loadAvatars();
      const avatarOf = (id: string): string | null => {
        const p = host.employee(id)!.persona;
        return p.avatarId ?? avatarFile[p.firstName.toLowerCase()]?.avatarId ?? null;
      };
      const avatars = ids.every((id) => !!avatarOf(id)) && !!env.SYNTHESIA_API_KEY;
      const callMode: CallInfo['mode'] = avatars ? 'avatar' : 'audio';
      const metadata: DispatchMetadata = {
        callId,
        officeUrl: `http://127.0.0.1:${env.OFFICE_PORT}`,
        speech,
        avatar: avatars,
        participants: ids.map((id) => {
          const p = host.employee(id)!.persona;
          return { employeeId: id, firstName: p.firstName, role: p.role, voice: voiceFor(p.firstName, speech.tts), avatarId: avatarOf(id) };
        }),
      };
      const token = await mintUserToken(env, { room, identity: 'manager', name: env.USER_NAME || 'Manager', metadata });
      const info: CallInfo = {
        id: callId, employeeIds: ids, livekitUrl: env.LIVEKIT_URL, token, room, mode: callMode, mock: false, startedMs: Date.now(),
      };
      const c: Call = {
        info, people, pendingAddress: null, previousSpeaker: null, transcript: [], said: new Map(), instructions: [],
        phase: { employeeId: null, phase: 'idle' }, joined: false, ended: false, joinTimer: null,
      };
      calls.set(callId, c);
      for (const id of ids) host.setOnCall(id, callId);
      emit(callId, { kind: 'state', state: 'connecting', mode: callMode });
      for (const id of ids) emit(callId, { kind: 'participant', employeeId: id, state: 'joining' });
      c.joinTimer = setTimeout(() => void failCall(c, 'The call could not connect.'), deps.joinTimeoutMs ?? JOIN_TIMEOUT_MS);
      return info;
    },

    async end(callId) {
      const c = calls.get(callId);
      if (!c || c.ended) return;
      await finish(c);
    },

    async address(callId, employeeId) {
      const c = calls.get(callId);
      if (!c) throw new CallError(404, 'not_found', 'That call is not running.');
      if (!c.people.some((p) => p.employeeId === employeeId)) throw new CallError(404, 'not_found', 'That person is not in this call.');
      c.pendingAddress = employeeId;
    },

    async route(callId, utterance) {
      const c = calls.get(callId);
      if (!c) throw new CallError(404, 'not_found', 'That call is not running.');
      const speakers = await routeUtterance(
        { utterance, participants: c.people, pendingAddress: c.pendingAddress, previousSpeaker: c.previousSpeaker },
        client ? modelPicker(client, env.VOICE_MODEL) : undefined,
      );
      c.pendingAddress = null;
      if (speakers[0]) setPhase(c, speakers[0], 'thinking');
      return speakers;
    },

    async *chat(callId: string, speakerId: string | undefined, req: VoiceChatRequest, signal: AbortSignal) {
      const c = calls.get(callId);
      if (!c) throw new CallError(404, 'not_found', 'That call is not running.');
      const speaker = speakerId && c.people.some((p) => p.employeeId === speakerId) ? speakerId : c.people[0].employeeId;
      setPhase(c, speaker, 'thinking');
      if (!client) {
        yield "I can't think straight right now, my connection is down. Message me in chat and I'll pick it up.";
        return;
      }
      const meeting =
        c.people.length > 1
          ? { others: c.people.filter((p) => p.employeeId !== speaker).map((p) => ({ firstName: p.firstName, role: p.role, said: c.said.get(p.employeeId) ?? [] })) }
          : undefined;
      yield* runCallMind({
        client, model: env.VOICE_MODEL, host, callId, employeeId: speaker, req, meeting, signal,
        onTrace: (line) => console.log(`[calls] ${first(speaker)} ${line}`),
        onToolInstruction: (text) => {
          c.instructions.push({ employeeId: speaker, text });
          console.log(`[calls] ${first(speaker)} was told: ${text}`);
        },
      });
    },

    async event(callId, ev: VoiceWorkerEvent) {
      const c = calls.get(callId);
      if (!c) {
        if (ev.type === 'ended') return;
        throw new CallError(404, 'not_found', 'That call is not running.');
      }
      switch (ev.type) {
        case 'joined':
          if (c.joined) return;
          c.joined = true;
          if (c.joinTimer) clearTimeout(c.joinTimer);
          c.joinTimer = null;
          for (const p of c.people) emit(callId, { kind: 'participant', employeeId: p.employeeId, state: 'present' });
          emit(callId, { kind: 'state', state: 'live', mode: c.info.mode });
          return;
        case 'avatar_ready':
          c.info.mode = 'avatar';
          console.log(`[calls] avatar ready ${Date.now() - c.info.startedMs} ms after the call started`);
          if (c.joined) emit(callId, { kind: 'state', state: 'live', mode: 'avatar' });
          return;
        case 'avatar_failed':
          c.info.mode = 'audio';
          console.log(`[calls] avatar failed after ${Date.now() - c.info.startedMs} ms: ${ev.reason}`);
          if (c.joined) emit(callId, { kind: 'state', state: 'live', mode: 'audio' });
          return;
        case 'user_transcript':
          emit(callId, { kind: 'caption', from: 'user', text: ev.text, final: ev.final });
          if (ev.final && ev.text.trim()) c.transcript.push({ from: 'user', text: ev.text.trim() });
          return;
        case 'speech_started':
          setPhase(c, ev.employeeId, 'speaking');
          return;
        case 'agent_transcript':
          emit(callId, { kind: 'caption', from: ev.employeeId, text: ev.text, final: ev.final });
          if (ev.final && ev.text.trim()) {
            c.transcript.push({ from: first(ev.employeeId), text: ev.text.trim() });
            c.said.set(ev.employeeId, [...(c.said.get(ev.employeeId) ?? []), ev.text.trim()].slice(-3));
          }
          return;
        case 'speech_ended':
          c.previousSpeaker = ev.employeeId;
          setPhase(c, ev.employeeId, 'idle');
          return;
        case 'participant':
          emit(callId, { kind: 'participant', employeeId: ev.employeeId, state: ev.state });
          return;
        case 'ended':
          await finish(c);
          return;
      }
    },

    async boot() {
      if (hasLiveKitKeys(env)) worker.start();
    },

    async stop() {
      for (const c of [...calls.values()]) {
        c.ended = true;
        if (c.joinTimer) clearTimeout(c.joinTimer);
        release(c);
      }
      calls.clear();
      await worker.stop();
    },
  };
  return impl;
}
