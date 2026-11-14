import type { PlanStep } from '../../shared/index.ts';
import { scaled } from '../speed.ts';
import type { EmployeeRuntime, InboxItem, RuntimeDeps, TurnResult } from './types.ts';

class Interrupted extends Error {
  constructor() {
    super('interrupted');
  }
}

const PLAN = ['Sketch the structure', 'Write the first draft', 'Run the checks', 'Publish and confirm'];

function plan(done: number, inProgress: number | null): PlanStep[] {
  return PLAN.map((title, i) => ({
    title,
    status: i < done ? 'done' : i === inProgress ? 'in_progress' : 'pending',
  }));
}

type Variant = 'default' | 'stuck' | 'ask' | 'screen' | 'long';

function variantOf(text: string): Variant {
  const t = text.toLowerCase();
  if (/\bstuck\b/.test(t)) return 'stuck';
  if (/\bscreen\b/.test(t)) return 'screen';
  if (/\bask\b/.test(t)) return 'ask';
  if (/\blong\b/.test(t)) return 'long';
  return 'default';
}

/**
 * A scripted employee. Timings are in milliseconds at MOCK_SPEED=1 and shrink with MOCK_SPEED.
 * Variants by keyword in the manager's message: "stuck", "ask", "screen", "long"; anything else runs the default
 * 20-second script: reply, three steps, a four-step plan, an approval, two more steps, a done bubble.
 */
class MockRuntime implements EmployeeRuntime {
  private started = false;
  private disposed = false;
  private paused = false;
  private busy = false;
  private steerable = false;
  private awaitingAnswer = false;
  private queue: InboxItem[] = [];
  private resumeWaiters: Array<() => void> = [];
  private sleepers = new Set<{ timer: NodeJS.Timeout; reject: (e: Error) => void }>();
  private interruptRequested = false;

  constructor(private deps: RuntimeDeps) {
    deps.signal.addEventListener('abort', () => void this.dispose());
  }

  private get host() {
    return this.deps.host;
  }

  async start(): Promise<void> {
    this.host.sessionStarted(`mock-session-${this.host.employee().id}`);
    this.started = true;
    void this.pump();
  }

  deliver(item: InboxItem): void {
    if (this.disposed) return;
    if (this.busy && this.steerable && item.kind === 'manager' && !this.paused && this.host.employee().state !== 'idle') {
      void this.steer();
      return;
    }
    this.queue.push(item);
    void this.pump();
  }

  async interrupt(): Promise<void> {
    this.interruptRequested = true;
    for (const s of this.sleepers) {
      clearTimeout(s.timer);
      s.reject(new Interrupted());
    }
    this.sleepers.clear();
  }

  async setPaused(paused: boolean): Promise<void> {
    this.paused = paused;
    if (!paused) {
      const w = this.resumeWaiters;
      this.resumeWaiters = [];
      w.forEach((r) => r());
      void this.pump();
    }
  }

  onPermissionsChanged(): void {}
  async attachHost(): Promise<void> {}
  async detachHost(): Promise<void> {}

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.interrupt();
    const w = this.resumeWaiters;
    this.resumeWaiters = [];
    w.forEach((r) => r());
  }

  // ---- machinery

  private async gate(): Promise<void> {
    while (this.paused && !this.disposed) await new Promise<void>((r) => this.resumeWaiters.push(r));
    if (this.disposed || this.interruptRequested) throw new Interrupted();
  }

  private async wait(ms: number): Promise<void> {
    await this.gate();
    await new Promise<void>((resolve, reject) => {
      const entry = {
        timer: setTimeout(() => {
          this.sleepers.delete(entry);
          resolve();
        }, scaled(ms)),
        reject,
      };
      this.sleepers.add(entry);
    });
    await this.gate();
  }

  private async steer(): Promise<void> {
    try {
      await this.wait(800);
      this.host.turnStarted();
      await this.wait(700);
      this.host.messageUser("Got it, I'll fold that in.");
      const id = this.host.step('Adjusted the plan');
      await this.wait(500);
      this.host.endStep(id, 'ok');
    } catch {
      /* interrupted */
    }
  }

  private async pump(): Promise<void> {
    if (!this.started || this.busy || this.paused || this.disposed || this.queue.length === 0) return;
    this.busy = true;
    try {
      while (this.queue.length > 0 && !this.paused && !this.disposed) {
        const items = this.queue.splice(0);
        const lead = items.find((i) => i.kind === 'manager') ?? items.find((i) => i.kind === 'colleague') ?? items[0];
        this.interruptRequested = false;
        await this.turn(lead);
      }
    } finally {
      this.busy = false;
    }
    if (this.queue.length > 0 && !this.paused && !this.disposed) void this.pump();
  }

  private async turn(item: InboxItem): Promise<void> {
    const script = this.scriptFor(item);
    if (!script) return;
    this.host.turnStarted();
    this.steerable = !(item.kind === 'office' && /just been hired/i.test(item.text)) && item.kind !== 'colleague';
    const result: TurnResult = { costUsd: 0.04, inputTokens: 1800, outputTokens: 420, numTurns: 5 };
    try {
      await script();
    } catch (e) {
      if (e instanceof Interrupted) result.interrupted = true;
      else throw e;
    }
    this.steerable = false;
    if (!this.disposed) this.host.turnEnded(result);
  }

  private scriptFor(item: InboxItem): (() => Promise<void>) | null {
    if (item.kind === 'colleague') return () => this.colleagueReply(item);
    if (item.kind === 'office') {
      const t = item.text;
      if (/just been hired/i.test(t)) return () => this.greet();
      if (/try again|restarted|^<?continue|carry on/i.test(t) && !/^Briefing/i.test(t)) return () => this.wrapUp();
      return null;
    }
    if (this.awaitingAnswer) {
      this.awaitingAnswer = false;
      return () => this.afterAnswer();
    }
    switch (variantOf(item.text)) {
      case 'stuck':
        return () => this.stuck();
      case 'ask':
        return () => this.ask();
      case 'screen':
        return () => this.screen();
      case 'long':
        return () => this.long();
      default:
        return () => this.standard();
    }
  }

  // ---- scripts

  private async greet(): Promise<void> {
    const p = this.host.employee().persona;
    await this.wait(1000);
    this.host.messageUser(`Hi, I'm ${p.firstName}, your ${p.role.toLowerCase()}. What should I start on?`);
  }

  private async colleagueReply(item: Extract<InboxItem, { kind: 'colleague' }>): Promise<void> {
    if (/^thanks/i.test(item.text)) return;
    await this.wait(1500);
    this.host.messageColleague(item.fromName.split(' ')[0] ?? item.fromName, 'Thanks, noted. I will pick it up.');
  }

  private async standard(): Promise<void> {
    const h = this.host;
    const level = h.employee().permissions.level;
    await this.wait(1500);
    h.messageUser("On it. I'll start with the layout and check back with you.");
    await this.wait(500);
    h.toolUsed('space');
    h.setPlan(plan(0, 0));
    let id = h.step('Opened the project folder');
    await this.wait(2500);
    h.endStep(id, 'ok');
    h.setPlan(plan(1, 1));
    id = h.step('Wrote the first draft');
    await this.wait(3500);
    h.endStep(id, 'ok');
    h.setPlan(plan(2, 2));
    id = h.step('Ran the checks');
    await this.wait(3000);
    h.endStep(id, 'ok');
    h.setPlan(plan(3, 3));
    await this.wait(500);
    const outcome =
      level === 'asks_first'
        ? await h.requestApproval({ title: 'Save a file', detail: 'Saves index.html in the project folder', kind: 'tool' })
        : await h.requestApproval({ title: 'Publish the draft', detail: 'Pushes the page to the staging site', kind: 'big_step' });
    await this.gate();
    if (!outcome.approved) {
      h.messageUser("Understood, I won't go ahead with that. The draft is saved and ready when you are.");
      await this.wait(500);
      h.finishTask('Stopped before the last step. The draft is saved in the project folder.');
      return;
    }
    id = h.step(level === 'asks_first' ? 'Saved the file' : 'Published the draft');
    await this.wait(2500);
    h.endStep(id, 'ok');
    id = h.step('Checked the live page');
    await this.wait(3000);
    h.endStep(id, 'ok');
    h.setPlan(plan(4, null));
    await this.wait(500);
    h.finishTask('Done. The page is up on staging and every check passes.');
  }

  private async stuck(): Promise<void> {
    const h = this.host;
    await this.wait(1000);
    h.messageUser('Let me look into that.');
    await this.wait(1000);
    h.toolUsed('desktop');
    let id = h.step('Opened the site');
    await this.wait(2000);
    h.endStep(id, 'ok');
    id = h.step('Tried to sign in');
    await this.wait(2000);
    h.endStep(id, 'error', "Couldn't sign in");
    await this.wait(500);
    h.reportStuck("I couldn't get the site to load or let me sign in.", 'Opened it twice and tried the login page.');
  }

  private async ask(): Promise<void> {
    const h = this.host;
    await this.wait(1500);
    this.awaitingAnswer = true;
    h.askUser('Which colour should the main heading be?');
  }

  private async afterAnswer(): Promise<void> {
    const h = this.host;
    await this.wait(1000);
    h.messageUser("Thanks, I'll use that.");
    await this.wait(500);
    h.toolUsed('space');
    const id = h.step('Applied your choice');
    await this.wait(2000);
    h.endStep(id, 'ok');
    h.finishTask('Done. I used your answer and the result is saved in the project folder.');
  }

  private async screen(): Promise<void> {
    const h = this.host;
    await this.wait(1000);
    h.messageUser('I need to look at something on your screen.');
    await this.wait(500);
    let requested = false;
    if (!h.employee().screenGrant) {
      const res = await h.requestScreen('I need to read a window on your screen', 5);
      requested = true;
      await this.gate();
      if (!res.startsWith('approved')) {
        h.messageUser("No problem, I'll work from my own desktop.");
        await this.wait(500);
        h.finishTask('Finished without using your screen.');
        return;
      }
    }
    h.toolUsed('desktop');
    const id = h.step('Read a window on your screen');
    const text = (await this.deps.hostDriver.mockCall?.('read_window')) ?? 'Nothing to read.';
    await this.wait(2000);
    h.endStep(id, 'ok');
    h.messageUser(`On your screen I can see this: ${text}`);
    if (requested) h.releaseScreen();
    await this.wait(500);
    h.finishTask('Done. I read the window you pointed me to and gave your screen back.');
  }

  private async long(): Promise<void> {
    const h = this.host;
    const titles = ['Read the brief', 'Research the audience', 'Draft three options', 'Compare the options', 'Write the summary'];
    const sentences = ['Reading the brief', 'Looking at competitors', 'Drafting option one', 'Drafting option two', 'Drafting option three', 'Comparing the options'];
    const planOf = (done: number): PlanStep[] =>
      titles.map((title, i) => ({ title, status: i < done ? 'done' : i === done ? 'in_progress' : 'pending' }));
    await this.wait(1500);
    h.messageUser("On it. This one will take a while, I'll check in when it's done.");
    h.toolUsed('web');
    for (let i = 0; i < 12; i++) {
      h.setPlan(planOf(Math.min(4, Math.floor(i / 2.4))));
      h.setActivity(sentences[i % sentences.length]);
      await this.wait(20000);
    }
    h.setPlan(planOf(5));
    h.finishTask('Done. Three options are drafted and compared in the project folder.');
  }

  private async wrapUp(): Promise<void> {
    const h = this.host;
    await this.wait(1000);
    h.messageUser('Picking this back up.');
    h.toolUsed('space');
    const id = h.step('Finished the remaining work');
    await this.wait(2000);
    h.endStep(id, 'ok');
    h.finishTask('Done. Everything is finished and saved.');
  }
}

export function createMockRuntime(deps: RuntimeDeps): EmployeeRuntime {
  return new MockRuntime(deps);
}
