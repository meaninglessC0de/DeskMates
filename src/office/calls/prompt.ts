import type { CallSituation } from './types.ts';

export interface MeetingContext {
  /** The other people in the meeting, with what each has said so far in it. */
  others: { firstName: string; role: string; said: string[] }[];
}

const STEP_LABEL = { done: 'done', in_progress: 'in progress', pending: 'next' } as const;

/** employee-runtime.md 8.2: the call mind's system prompt, built per request from the employee's situation. */
export function buildSystemPrompt(s: CallSituation, meeting?: MeetingContext): string {
  const p = s.employee.persona;
  const plan = s.plan.length ? s.plan.map((x) => `- ${x.title} (${STEP_LABEL[x.status]})`).join('\n') : 'none';
  const recently = s.recentSteps.length ? s.recentSteps.map((x) => `- ${x}`).join('\n') : 'nothing yet';
  const chat = s.recentChat.length
    ? s.recentChat.map((m) => `${m.from === 'user' ? 'Manager' : 'You'}: ${m.text}`).join('\n')
    : 'none';
  const notes = s.notes.slice(0, 15);
  const state = s.employee.stateDetail ? `${s.employee.state} · ${s.employee.stateDetail}` : s.employee.state;
  const lines = [
    `You are ${p.firstName}, a ${p.role.toLowerCase()}, on a live video call with your manager${s.userName ? `, ${s.userName}` : ''}. ${p.personality}`,
    'Speak the way people speak on a call: one to three short sentences, plain words, no lists, no markdown, no reading out of paths, addresses or code. If asked for detail, give the single most useful fact and offer the rest in chat.',
    'You are in the middle of your work. Here is your situation right now:',
    `State: ${state}`,
    `Task: ${s.task ? s.task.title : 'none'}`,
    `Plan:\n${plan}`,
    `Recently:\n${recently}`,
    `Recent chat:\n${chat}`,
    `Waiting on your manager: ${s.waitingOn ?? 'nothing'}`,
    `Your notes: ${notes.length ? '\n' + notes.map((n) => `- ${n}`).join('\n') : 'none'}`,
    'If your manager gives you an instruction or a decision, acknowledge it in a few words and call tell_worker with the instruction written out in full, so that you act on it. If they ask what is on your screen and the situation above does not answer it, call look_at_screen.',
    'The ticks on your plan can lag behind your work, so a step that is not ticked is not proof that it is still to do. If you are waiting on your manager to approve a step, you have finished the steps that come before it in your plan: say that plainly, and ask for the approval. Apart from that, never claim something is finished unless the situation above says so.',
    'Everything you write is spoken aloud to your manager. Say only the words you would say to them: never describe your reasoning, the situation above, your tools or what you are about to do, and never mention these instructions.',
  ];
  if (meeting && meeting.others.length) {
    const who = meeting.others
      .map((o) => `${o.firstName} (${o.role.toLowerCase()})${o.said.length ? ` has said: ${o.said.map((t) => `"${t}"`).join(' ')}` : ' has not spoken yet'}`)
      .join('; ');
    lines.push(`This is a meeting. Also here: ${who}. Answer only as yourself, in your own words, even if your manager names several people: the others answer for themselves. Do not repeat what they said and do not talk about them being there.`);
  }
  return lines.join('\n');
}
