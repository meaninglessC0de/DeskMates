import type { VoiceChatRequest } from '../../shared/index.ts';
import { buildSystemPrompt, type MeetingContext } from './prompt.ts';
import type { CallsHost } from './types.ts';

/** Raw streaming events of the Messages API, narrowed to what the call mind reads. */
export type MindEvent =
  | { type: 'content_block_start'; index: number; content_block: { type: string; id?: string; name?: string } }
  | { type: 'content_block_delta'; index: number; delta: { type: string; text?: string; partial_json?: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason?: string | null } }
  | { type: 'message_start' | 'message_stop' };

export interface MindParams {
  model: string;
  max_tokens: number;
  stream: true;
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[];
  messages: { role: 'user' | 'assistant'; content: unknown }[];
  tools?: unknown[];
  output_config?: { effort: 'low' };
}

/** The slice of the Anthropic client the call mind uses. The real client satisfies it; tests pass a fake. */
export interface MindClient {
  messages: { create(params: MindParams, opts?: { signal?: AbortSignal }): PromiseLike<AsyncIterable<MindEvent>> };
}

export const FILLER = 'One second. ';
export const FILLER_AFTER_MS = 2500;
export const ACK = 'Got it, I will pass that on.';
const MAX_ROUNDS = 3;

export const TOOLS = [
  {
    name: 'tell_worker',
    description: 'Pass an instruction or decision from your manager to the part of you that does the work. Write it out in full.',
    input_schema: { type: 'object', properties: { instruction: { type: 'string' } }, required: ['instruction'] },
  },
  {
    name: 'look_at_screen',
    description: 'Look at what is on your own desktop screen right now.',
    input_schema: { type: 'object', properties: {} },
  },
];

type ToolUse = { id: string; name: string; json: string };
type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

/** Turns the worker's transcript into alternating user and assistant turns that start with a user turn. */
export function toModelMessages(req: VoiceChatRequest): { messages: MindParams['messages']; extraSystem: string[] } {
  const extraSystem: string[] = [];
  const out: { role: 'user' | 'assistant'; text: string }[] = [];
  for (const m of req.messages) {
    const text = (m.content ?? '').toString().trim();
    if (!text) continue;
    if (m.role === 'system') {
      extraSystem.push(text);
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.text += ' ' + text;
    else out.push({ role: m.role, text });
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', text: '(the call has just connected)' });
  if (out[out.length - 1].role === 'assistant') out.push({ role: 'user', text: '(go on)' });
  return { messages: out.map((m) => ({ role: m.role, content: m.text })), extraSystem };
}

export interface MindOptions {
  client: MindClient;
  model: string;
  host: CallsHost;
  callId: string;
  employeeId: string;
  req: VoiceChatRequest;
  meeting?: MeetingContext;
  signal: AbortSignal;
  onToolInstruction?: (instruction: string) => void;
  /** Diagnostics: a tool the model called, and why a turn ended. */
  onTrace?: (line: string) => void;
}

/** One reply of the call mind: streams spoken text, runs tell_worker and look_at_screen, then continues. */
export async function* runCallMind(o: MindOptions): AsyncGenerator<string> {
  const situation = o.host.situation(o.employeeId);
  const { messages, extraSystem } = toModelMessages(o.req);
  const systemText = [buildSystemPrompt(situation, o.meeting), ...extraSystem.map((t) => `For this turn: ${t}`)].join('\n');
  const convo: MindParams['messages'] = [...messages];

  let spoke = false;
  let modelSpoke = false;      // the model said something (the filler does not count)
  let passedOn = false;
  let fillerSent = false;
  const startedAt = Date.now();
  let instructionN = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (o.signal.aborted) return;
    const stream = await o.client.messages.create(
      {
        model: o.model,
        max_tokens: 400,
        stream: true,
        system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
        messages: convo,
        tools: TOOLS,
        // spec 8.2. Measured on the live model: by default it sometimes thinks for 1 to 1.5 s first; with thinking switched off it narrated its reasoning aloud
        output_config: { effort: 'low' },
      },
      { signal: o.signal },
    );
    const it = stream[Symbol.asyncIterator]();
    const blocks: Block[] = [];
    const tools = new Map<number, ToolUse>();
    let textIdx = -1;
    let stop: string | null | undefined;

    for (;;) {
      let pull: Promise<IteratorResult<MindEvent>> = it.next();
      if (!spoke && !fillerSent) {
        const wait = Math.max(0, FILLER_AFTER_MS - (Date.now() - startedAt));
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = new Promise<'tick'>((res) => {
          timer = setTimeout(() => res('tick'), wait);
        });
        const winner = await Promise.race([pull, tick]);
        clearTimeout(timer);
        if (winner === 'tick') {
          fillerSent = true;
          spoke = true;
          yield FILLER;
        } else {
          pull = Promise.resolve(winner);
        }
      }
      const r = await pull;
      if (r.done) break;
      const ev = r.value;
      if (ev.type === 'content_block_start') {
        o.onTrace?.(`round ${round + 1}: first block ${ev.content_block.type} after ${Date.now() - startedAt} ms`);
        if (ev.content_block.type === 'tool_use') tools.set(ev.index, { id: ev.content_block.id ?? '', name: ev.content_block.name ?? '', json: '' });
        else if (ev.content_block.type === 'text') {
          blocks.push({ type: 'text', text: '' });
          textIdx = blocks.length - 1;
        }
      } else if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'text_delta' && ev.delta.text) {
          if (textIdx < 0) {
            blocks.push({ type: 'text', text: '' });
            textIdx = blocks.length - 1;
          }
          (blocks[textIdx] as { text: string }).text += ev.delta.text;
          spoke = true;
          modelSpoke = true;
          yield ev.delta.text;
        } else if (ev.delta.type === 'input_json_delta') {
          const t = tools.get(ev.index);
          if (t) t.json += ev.delta.partial_json ?? '';
        }
      } else if (ev.type === 'content_block_stop') {
        const t = tools.get(ev.index);
        if (t) {
          let input: unknown = {};
          try {
            input = t.json ? JSON.parse(t.json) : {};
          } catch {
            /* keep {} */
          }
          blocks.push({ type: 'tool_use', id: t.id, name: t.name, input });
          tools.delete(ev.index);
          textIdx = -1;
        }
      } else if (ev.type === 'message_delta') {
        stop = ev.delta.stop_reason;
      }
    }

    o.onTrace?.(`round ${round + 1}: stop=${stop ?? 'none'} text=${JSON.stringify(blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').slice(0, 80))} tools=${blocks.filter((b) => b.type === 'tool_use').map((b) => (b as { name: string }).name).join(',') || '-'}`);
    const used = blocks.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    if (stop !== 'tool_use' || !used.length) {
      if (passedOn && !modelSpoke) yield ACK;
      return;
    }

    const results: unknown[] = [];
    for (const u of used) {
      if (u.name === 'tell_worker') {
        const instruction = String((u.input as { instruction?: unknown }).instruction ?? '').trim();
        if (instruction) {
          o.host.deliverToWorker(o.employeeId, { kind: 'manager', text: instruction, messageId: `call:${o.callId}:${++instructionN}`, via: 'call' });
          o.onToolInstruction?.(instruction);
          passedOn = true;
        }
        results.push({
          type: 'tool_result',
          tool_use_id: u.id,
          content: instruction ? 'passed on' : 'nothing to pass on',
        });
      } else if (u.name === 'look_at_screen') {
        try {
          const jpg = await o.host.screenshot(o.employeeId);
          results.push({
            type: 'tool_result',
            tool_use_id: u.id,
            content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpg.toString('base64') } }],
          });
        } catch {
          results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'The screen is not available right now.' });
        }
      } else {
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Unknown tool.' });
      }
    }
    // already said something and only passed an instruction on: the turn is over, no second request
    if (modelSpoke && used.every((u) => u.name === 'tell_worker')) return;
    convo.push({ role: 'assistant', content: blocks.filter((b) => b.type !== 'text' || b.text) });
    // a model that went straight to the tool may then say nothing: ask for the spoken acknowledgement
    convo.push({ role: 'user', content: modelSpoke ? results : [...results, { type: 'text', text: '(Now say your short reply out loud.)' }] });
  }
  if (passedOn && !modelSpoke) yield ACK;
}
