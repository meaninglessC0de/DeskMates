import { ulid } from 'ulid';
import type { CallInfo, Env, ServerEvent, VoiceChatRequest, VoiceWorkerEvent } from '../../shared/index.ts';
import { scaled } from '../speed.ts';
import { CallError, type Calls, type CallsHost, type CallsMode } from './types.ts';

type CallEvent = Extract<ServerEvent, { type: 'call' }>['event'];

interface MockCall {
  info: CallInfo;
  timers: Set<NodeJS.Timeout>;
  participants: string[];
  nextIdx: number;
  ended: boolean;
}

const CYCLE_MS = 10_000;

/** Scripted calls: no LiveKit. Events follow contracts section 9. */
export function createMockCalls(env: Env, host: CallsHost, opts: { enabled: boolean }): Calls {
  const calls = new Map<string, MockCall>();

  const later = (c: MockCall, ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      c.timers.delete(t);
      if (!c.ended) fn();
    }, scaled(ms));
    c.timers.add(t);
  };

  const emit = (callId: string, event: CallEvent) => host.emit({ type: 'call', callId, event });

  function speak(c: MockCall, employeeId: string) {
    const id = c.info.id;
    const e = host.employee(employeeId);
    const line = e
      ? `Going well. I'm on it, and I'll tell you in chat when it's done.`
      : 'Going well.';
    emit(id, { kind: 'caption', from: 'user', text: 'How is it going?', final: true });
    later(c, 600, () => emit(id, { kind: 'speaker', employeeId, phase: 'thinking' }));
    later(c, 1600, () => {
      emit(id, { kind: 'speaker', employeeId, phase: 'speaking' });
      emit(id, { kind: 'caption', from: employeeId, text: "Going well. I'm on it,", final: false });
    });
    later(c, 2600, () => emit(id, { kind: 'caption', from: employeeId, text: line, final: true }));
    later(c, 5000, () => emit(id, { kind: 'speaker', employeeId, phase: 'idle' }));
  }

  function cycle(c: MockCall) {
    const who = c.participants[c.nextIdx % c.participants.length];
    c.nextIdx++;
    speak(c, who);
    later(c, CYCLE_MS, () => cycle(c));
  }

  function clearTimers(c: MockCall) {
    for (const t of c.timers) clearTimeout(t);
    c.timers.clear();
  }

  const impl: Calls = {
    mode(): CallsMode {
      return opts.enabled ? 'audio' : 'off';
    },

    async start(employeeIds) {
      if (!opts.enabled) throw new CallError(409, 'calls_off', 'Add LiveKit keys to make calls.');
      const ids = [...new Set(employeeIds)];
      if (ids.length < 1 || ids.length > 4) throw new CallError(400, 'bad_request', 'Pick between one and four people.');
      for (const id of ids) {
        const e = host.employee(id);
        if (!e) throw new CallError(404, 'not_found', 'That person is not on your team.');
        if (e.state === 'offline' || e.state === 'starting')
          throw new CallError(409, 'employee_unavailable', `${e.persona.firstName}'s desktop is not running.`);
        if (e.state === 'on_call') throw new CallError(409, 'employee_busy', `${e.persona.firstName} is already on a call.`);
      }
      const callId = `call_${ulid()}`;
      const info: CallInfo = {
        id: callId,
        employeeIds: ids,
        livekitUrl: '',
        token: '',
        room: `room-${callId.toLowerCase()}`,
        mode: 'audio',
        mock: true,
        startedMs: Date.now(),
      };
      const c: MockCall = { info, timers: new Set(), participants: ids, nextIdx: 0, ended: false };
      calls.set(callId, c);
      for (const id of ids) host.setOnCall(id, callId);

      emit(callId, { kind: 'state', state: 'connecting', mode: 'audio' });
      ids.forEach((id, i) => {
        emit(callId, { kind: 'participant', employeeId: id, state: 'joining' });
        later(c, 600 * (i + 1), () => emit(callId, { kind: 'participant', employeeId: id, state: 'present' }));
      });
      const liveAt = 600 * ids.length + 800;
      later(c, liveAt, () => {
        emit(callId, { kind: 'state', state: 'live', mode: 'audio' });
        cycle(c);
      });
      return info;
    },

    async end(callId) {
      const c = calls.get(callId);
      if (!c || c.ended) return;
      c.ended = true;
      clearTimers(c);
      calls.delete(callId);
      const id = c.info.id;
      const minutes = Math.max(1, Math.round((Date.now() - c.info.startedMs) / 60_000));
      const names = c.participants.map((p) => host.employee(p)?.persona.firstName ?? 'Someone');
      const line =
        c.participants.length === 1
          ? `Call with ${names[0]} · ${minutes} min`
          : `Meeting · ${minutes} min · ${names.join(', ')}`;
      for (const p of c.participants) {
        emit(id, { kind: 'participant', employeeId: p, state: 'left' });
        host.setOnCall(p, null);
        if (host.employee(p)) {
          host.postSystemMessage(p, line);
          host.deliverToWorker(p, { kind: 'office', text: 'Call summary: you spoke with your manager briefly and nothing new was asked of you.' });
        }
      }
      emit(id, { kind: 'state', state: 'ended', mode: 'audio' });
    },

    async address(callId, employeeId) {
      const c = calls.get(callId);
      if (!c) throw new CallError(404, 'not_found', 'That call is not running.');
      if (!c.participants.includes(employeeId)) throw new CallError(404, 'not_found', 'That person is not in this call.');
      // answer now, then carry on the rotation from the next person
      for (const t of c.timers) clearTimeout(t);
      c.timers.clear();
      c.nextIdx = c.participants.indexOf(employeeId) + 1;
      speak(c, employeeId);
      later(c, CYCLE_MS, () => cycle(c));
    },

    async route(callId, _utterance) {
      const c = calls.get(callId);
      return c ? [c.participants[0]] : [];
    },

    async *chat(_callId: string, _speaker: string | undefined, _req: VoiceChatRequest, _signal: AbortSignal) {
      yield 'This is a scripted call. ';
      yield 'Nothing you say is being heard.';
    },

    async event(_callId: string, _ev: VoiceWorkerEvent) {},

    async boot() {},

    async stop() {
      for (const c of calls.values()) {
        c.ended = true;
        clearTimers(c);
      }
      calls.clear();
    },
  };
  void env;
  return impl;
}
