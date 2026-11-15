import { z } from 'zod';
import { makeSdkServer, textResult, type ToolSpec } from './sdkServers.ts';
import type { RuntimeHost } from './types.ts';

export interface OfficeToolHooks {
  /** finish_task and report_stuck close the task: forget what "for this task" approvals allowed. */
  taskClosed(): void;
}

/** The eleven office tools of contracts section 5. Each returns the text the model sees. */
export function officeToolSpecs(host: RuntimeHost, hooks: OfficeToolHooks): ToolSpec[] {
  return [
    {
      name: 'message_user',
      description: 'Post a short chat message to your manager. Use it for anything they should read while you work.',
      shape: { text: z.string().describe('One to three plain sentences, no markdown.') },
      handler: async (a) => textResult(host.messageUser(String(a.text))),
    },
    {
      name: 'ask_user',
      description: 'Ask your manager one clear question when a decision or preference is missing and you cannot reasonably choose yourself. Posts the question to them: do not also message_user it. The answer arrives later as a new message. Not for a resource you cannot reach: that is report_stuck.',
      shape: { question: z.string() },
      handler: async (a) => textResult(host.askUser(String(a.question))),
    },
    {
      name: 'request_approval',
      description: 'Ask your manager to approve a big step before you take it, and wait for the answer.',
      shape: { title: z.string().describe('A short noun phrase.'), detail: z.string().describe('The exact action.') },
      handler: async (a) => {
        const o = await host.requestApproval({ title: String(a.title), detail: String(a.detail), kind: 'big_step' });
        return textResult(o.approved ? 'approved' : `denied${o.note ? `: ${o.note}` : ''}`);
      },
    },
    {
      name: 'finish_task',
      description: 'Mark the current task done, only when the work is actually done, and tell your manager what you did, where the result is and anything they must know. Posts the message for you: do not also message_user it.',
      shape: { summary: z.string().describe('Two or three sentences.') },
      handler: async (a) => {
        const t = host.finishTask(String(a.summary));
        hooks.taskClosed();
        return textResult(t);
      },
    },
    {
      name: 'report_stuck',
      description: 'Tell your manager you are blocked: a site or service that does not exist or cannot be reached, a login you do not have, a tool that keeps failing, after two honest attempts at different approaches. Say what you tried. Posts the message for you: do not also message_user it. Use this, not ask_user and not finish_task, when you could not do what was asked because something is unreachable or missing on your side, even if your manager could fix it (a correct address, a login).',
      shape: { reason: z.string(), tried: z.string().describe('What you tried.') },
      handler: async (a) => {
        const t = host.reportStuck(String(a.reason), String(a.tried));
        hooks.taskClosed();
        return textResult(t);
      },
    },
    {
      name: 'set_activity',
      description: 'A few words in the present tense about what you are doing now. Your manager sees it next to your name.',
      shape: { sentence: z.string().max(60) },
      handler: async (a) => textResult(host.setActivity(String(a.sentence))),
    },
    {
      name: 'message_colleague',
      description: 'Send a message to a teammate. `to` is their first name. Be specific about what you need. Also use it to answer a teammate who asked you something.',
      shape: { to: z.string(), text: z.string() },
      handler: async (a) => {
        const r = host.messageColleague(String(a.to), String(a.text));
        return textResult(r, /^(No teammate|Messaging|Limit|Too many)/.test(r));
      },
    },
    {
      name: 'list_colleagues',
      description: 'List your teammates with their role and state.',
      shape: {},
      handler: async () => textResult(host.listColleagues()),
    },
    {
      name: 'save_note',
      description: 'Save one fact to your long-term notes. You will see your notes at the start of every session.',
      shape: { text: z.string() },
      handler: async (a) => textResult(host.saveNote(String(a.text))),
    },
    {
      name: 'request_screen',
      description: "Ask to use your manager's own screen, only if the task truly needs it. Waits for the answer.",
      shape: { reason: z.string(), minutes: z.number().positive().describe('How long you need it.') },
      handler: async (a) => textResult(await host.requestScreen(String(a.reason), Number(a.minutes))),
    },
    {
      name: 'release_screen',
      description: "Give your manager's screen back as soon as you are done with it.",
      shape: {},
      handler: async () => textResult(host.releaseScreen()),
    },
  ];
}

export function createOfficeServer(host: RuntimeHost, hooks: OfficeToolHooks) {
  return makeSdkServer('office', officeToolSpecs(host, hooks));
}
