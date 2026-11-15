import type { MindClient } from './mind.ts';

export interface RouteParticipant {
  employeeId: string;
  firstName: string;
  role: string;
}

export interface RouteInput {
  utterance: string;
  participants: RouteParticipant[];
  /** Set by POST /api/calls/:id/address. The caller clears it after use. */
  pendingAddress: string | null;
  previousSpeaker: string | null;
}

export type Picker = (utterance: string, participants: RouteParticipant[]) => Promise<string | null>;

const EVERYONE = /\b(everyone|everybody|all of you|each of you|you all|you guys)\b/i;
const FOLLOW_UP_START = /^\s*(and|also|so|why|how)\b/i;

/** Rules 1 to 3 of employee-runtime.md 8.3. Returns null when only the model can choose. Pure. */
export function routeByRules(i: RouteInput): string[] | null {
  const ids = i.participants.map((p) => p.employeeId);
  if (i.pendingAddress && ids.includes(i.pendingAddress)) return [i.pendingAddress];

  if (EVERYONE.test(i.utterance)) return ids;

  const named: { id: string; at: number }[] = [];
  for (const p of i.participants) {
    const m = new RegExp(`\\b${p.firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').exec(i.utterance);
    if (m) named.push({ id: p.employeeId, at: m.index });
  }
  if (named.length) return named.sort((a, b) => a.at - b.at).map((n) => n.id);

  const words = i.utterance.trim().split(/\s+/).filter(Boolean).length;
  if (i.previousSpeaker && ids.includes(i.previousSpeaker) && (words < 8 || FOLLOW_UP_START.test(i.utterance))) return [i.previousSpeaker];

  return null;
}

/** All four rules. A picker failure or an unknown answer falls back to the first participant. */
export async function routeUtterance(i: RouteInput, pick?: Picker): Promise<string[]> {
  if (!i.participants.length) return [];
  const byRules = routeByRules(i);
  if (byRules) return byRules;
  const first = i.participants[0].employeeId;
  if (!pick) return [first];
  try {
    const id = await pick(i.utterance, i.participants);
    return id && i.participants.some((p) => p.employeeId === id) ? [id] : [first];
  } catch {
    return [first];
  }
}

/** Rule 4: one small model call choosing the participant whose role fits best. */
export function modelPicker(client: MindClient, model: string, signal?: AbortSignal): Picker {
  return async (utterance, participants) => {
    const list = participants.map((p) => `${p.employeeId}: ${p.firstName}, ${p.role}`).join('\n');
    const stream = await client.messages.create(
      {
        model,
        max_tokens: 60,
        stream: true,
        system: [
          {
            type: 'text',
            text: `A manager is speaking to a small team in a meeting. Choose the one person whose role fits best what the manager said. Answer with JSON only: {"employeeId": "<id>"}.\n${list}`,
          },
        ],
        messages: [{ role: 'user', content: utterance }],
      },
      { signal },
    );
    let text = '';
    for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') text += ev.delta.text ?? '';
    const m = /"employeeId"\s*:\s*"([^"]+)"/.exec(text);
    return m ? m[1] : null;
  };
}
