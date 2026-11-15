import type { MindClient } from './mind.ts';

export interface TranscriptLine {
  from: 'user' | string;      // 'user' or an employee's first name
  text: string;
}

export const QUIET_SUMMARY = 'you spoke with your manager briefly and nothing new was asked of you.';

/** What the worker is told when a call ends: two or three sentences written by the model, or a plain fallback. */
export async function summarizeCall(
  client: MindClient | null,
  model: string,
  who: string,
  transcript: TranscriptLine[],
  instructions: string[],
  signal?: AbortSignal,
): Promise<string> {
  const fallback = instructions.length
    ? `you spoke with your manager and agreed: ${instructions.join(' ')}`
    : QUIET_SUMMARY;
  if (!client || !transcript.length) return fallback;
  try {
    const stream = await client.messages.create(
      {
        model,
        max_tokens: 200,
        stream: true,
        system: [
          {
            type: 'text',
            text: `You are ${who}. Write two or three plain sentences, in the second person ("you"), telling yourself what was said and decided on a call with your manager, so that you can carry on with your work. Name any decision or instruction. No lists.`,
          },
        ],
        messages: [{ role: 'user', content: transcript.map((l) => `${l.from === 'user' ? 'Manager' : l.from}: ${l.text}`).join('\n') }],
      },
      { signal },
    );
    let text = '';
    for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') text += ev.delta.text ?? '';
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}
