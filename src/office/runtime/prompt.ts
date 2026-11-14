import type { Persona } from '../../shared/index.ts';
import { SYSTEM_PROMPT_TEMPLATE } from './systemPromptTemplate.ts';
import type { InboxItem } from './types.ts';

/**
 * The system prompt of employee-runtime.md section 5 with the four persona fields filled in.
 * Stable for the life of the employee: no dates, no state, no teammate list.
 */
export function buildSystemPrompt(p: Pick<Persona, 'name' | 'role' | 'personality' | 'workingStyle'>): string {
  const fields: Record<string, string> = {
    '{name}': p.name,
    '{role}': p.role,
    '{personality}': p.personality.trim(),
    '{workingStyle}': p.workingStyle.trim(),
  };
  let out = SYSTEM_PROMPT_TEMPLATE;
  for (const [k, v] of Object.entries(fields)) out = out.split(k).join(v);
  return out;
}

/** Keeps text from closing or forging our wrapper tags. */
function defang(text: string): string {
  return text.replace(/<(\/?)(message|office)\b/gi, '&lt;$1$2');
}

function attr(v: string): string {
  return v.replace(/[<>"&\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** employee-runtime.md 4.1: everything arrives wrapped in one tag so the model knows who is speaking. */
export function formatItem(item: InboxItem): string {
  switch (item.kind) {
    case 'manager':
      return `<message from="manager"${item.via === 'call' ? ' via="call"' : ''}>${defang(item.text)}</message>`;
    case 'colleague':
      return `<message from="colleague" name="${attr(item.fromName)}" role="${attr(item.fromRole)}">${defang(item.text)}</message>`;
    case 'office': {
      const t = defang(item.text.trim());
      return t.includes('\n') ? `<office>\n${t}\n</office>` : `<office>${t}</office>`;
    }
  }
}

const HIRED = /^You have just been hired\./;

/** Office items that ask the model to do something. Everything else (briefing, notices) rides along with the next one. */
export function isActionable(item: InboxItem): boolean {
  if (item.kind !== 'office') return true;
  const t = item.text.trim();
  if (/^Briefing for this session/i.test(t)) return false;
  if (/^Your permission level is now/i.test(t)) return false;
  if (/^You have your manager's screen/i.test(t)) return false;
  if (/^Your manager's screen has been returned/i.test(t)) return false;
  return true;
}

/** True when the final text of a turn started by these items belongs in the chat as a bubble. */
export function allowsFinalText(item: InboxItem): boolean {
  if (item.kind === 'manager' || item.kind === 'colleague') return true;
  return HIRED.test(item.text.trim());
}

/** Chat, not a document: drop heading marks and table rows, keep everything else as written. */
export function stripMarkdown(text: string): string {
  const lines = text.split('\n').flatMap((line) => {
    if (/^\s*\|.*\|\s*$/.test(line)) return []; // table rows and separators
    return [line.replace(/^\s{0,3}#{1,6}\s+/, '')];
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
