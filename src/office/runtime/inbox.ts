import { randomUUID } from 'node:crypto';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { formatItem, isActionable } from './prompt.ts';
import type { InboxItem } from './types.ts';

export interface InboxOptions {
  /** True while a turn is running: then everything is released at once so it reaches the model at the next tool boundary. */
  busy?: () => boolean;
  /** Items that arrive within this window of each other are sent as one turn, in order. */
  coalesceMs?: number;
  /** Called with the items that went into one user message, just before it is yielded. */
  onYield?: (items: InboxItem[], message: SDKUserMessage) => void;
}

/**
 * The ordered queue of everything said to the employee, exposed as the never-ending input stream of the SDK
 * (employee-runtime.md 4.1). While paused nothing is released. While idle, passive items (the briefing, notices)
 * wait for the next item that needs an answer so they never start a turn of their own.
 */
export class Inbox implements AsyncIterable<SDKUserMessage> {
  private queue: InboxItem[] = [];
  private paused = false;
  private closed = false;
  private wake: (() => void) | null = null;
  private readonly coalesceMs: number;

  constructor(private opts: InboxOptions = {}) {
    this.coalesceMs = opts.coalesceMs ?? 25;
  }

  get size(): number {
    return this.queue.length;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  push(item: InboxItem): void {
    if (this.closed) return;
    this.queue.push(item);
    this.poke();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.poke();
  }

  close(): void {
    this.closed = true;
    this.poke();
  }

  /** Takes everything still waiting (a new query continues where a dead one stopped). */
  drain(): InboxItem[] {
    return this.queue.splice(0);
  }

  /** Re-evaluates the release rule (call when the turn state changes). */
  poke(): void {
    const w = this.wake;
    this.wake = null;
    w?.();
  }

  private releasable(): boolean {
    if (this.queue.length === 0 || this.paused) return false;
    if (this.queue.some(isActionable)) return true;
    return this.opts.busy?.() === true;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage, void> {
    for (;;) {
      while (!this.closed && !this.releasable()) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
      }
      if (this.closed) return;
      if (this.coalesceMs > 0) await new Promise((r) => setTimeout(r, this.coalesceMs));
      if (this.closed) return;
      if (!this.releasable()) continue;
      const items = this.queue.splice(0);
      const message: SDKUserMessage = {
        type: 'user',
        message: { role: 'user', content: items.map(formatItem).join('\n') },
        parent_tool_use_id: null,
        uuid: randomUUID(),
        priority: 'next',
      };
      this.opts.onYield?.(items, message);
      yield message;
    }
  }
}
