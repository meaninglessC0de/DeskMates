import type { ActivityStep, Approval, Capabilities, Employee, Message, Task } from './types.ts';

export type ServerEvent =
  | { type: 'hello'; capabilities: Capabilities }
  | { type: 'employee'; employee: Employee }                 // created or changed (whole object)
  | { type: 'employee_removed'; id: string }
  | { type: 'message'; message: Message }
  | { type: 'message_seen'; id: string; employeeId: string; seenMs: number }
  | { type: 'typing'; employeeId: string; on: boolean }      // composing a chat reply
  | { type: 'step'; step: ActivityStep }                     // created or updated (same id)
  | { type: 'task'; task: Task }                             // created or changed (plan updates ride here)
  | { type: 'approval'; approval: Approval }                 // created or resolved
  | { type: 'call'; callId: string; event:
        | { kind: 'state'; state: 'connecting' | 'live' | 'ended' | 'failed'; mode: 'avatar' | 'audio' }
        | { kind: 'participant'; employeeId: string; state: 'joining' | 'present' | 'dropped' | 'failed' | 'left' }
        | { kind: 'speaker'; employeeId: string | null; phase: 'thinking' | 'speaking' | 'idle' }
        | { kind: 'caption'; from: 'user' | string; text: string; final: boolean }
        | { kind: 'hand'; employeeId: string; raised: boolean } }
  | { type: 'notify'; employeeId: string; title: string; body: string; kind: 'approval' | 'question' | 'done' | 'stuck' | 'screen' | 'message' }
  | { type: 'toast'; text: string; tone: 'info' | 'error' };

/** The one message a client may send over the WebSocket. */
export type ClientEvent = { type: 'ping' };

/** What the voice worker reports to `POST /voice/calls/:id/events`. */
export type VoiceWorkerEvent =
  | { type: 'joined' }
  | { type: 'avatar_ready' }
  | { type: 'avatar_failed'; reason: string }
  | { type: 'user_transcript'; text: string; final: boolean }
  | { type: 'speech_started'; employeeId: string }
  | { type: 'agent_transcript'; employeeId: string; text: string; final: boolean }
  | { type: 'speech_ended'; employeeId: string }
  | { type: 'participant'; employeeId: string; state: 'joining' | 'present' | 'dropped' | 'failed' | 'left' }
  | { type: 'ended' };
