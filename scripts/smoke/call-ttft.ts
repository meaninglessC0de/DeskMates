// Time to first text and a look at the opening words of the call mind for a few request variants (a few cents).
// Needs ANTHROPIC_API_KEY. Variants: the default (the model may think first), effort low, thinking disabled.
export {};
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { TOOLS } from '../../src/office/calls/mind.ts';
import { buildSystemPrompt } from '../../src/office/calls/prompt.ts';
import { employee, mayaSituation } from '../../src/office/calls/testHost.ts';
dotenv.config({ path: '.env.local', quiet: true });
const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sys = buildSystemPrompt(mayaSituation(employee('e', 'Priya', 'Marketer')), { others: [{ firstName: 'Jonas', role: 'Researcher', said: [] }] });
const questions = ['Jonas and Priya, give me one line each on how it is going.', 'What are you working on right now?'];
for (const variant of ['default', 'effort-low', 'thinking-off']) {
  for (const q of questions) {
    for (let i = 0; i < 2; i++) {
      const t0 = Date.now();
      const params: any = { model: 'claude-haiku-5-5', max_tokens: 400, stream: true, tools: TOOLS, system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: q }] };
      if (variant === 'effort-low') params.output_config = { effort: 'low' };
      if (variant === 'thinking-off') params.thinking = { type: 'disabled' };
      try {
        const s: any = await c.messages.create(params);
        let first = -1, text = '', thinking = false;
        for await (const ev of s) {
          if (ev.type === 'content_block_start' && ev.content_block.type === 'thinking') thinking = true;
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { if (first < 0) first = Date.now() - t0; text += ev.delta.text; }
        }
        console.log(`${variant.padEnd(12)} ${String(first).padStart(5)} ms ${thinking ? 'thinking ' : '         '}${JSON.stringify(text.slice(0, 90))}`);
      } catch (e: any) { console.log(variant, 'ERR', e.message.slice(0, 160)); }
    }
  }
}
