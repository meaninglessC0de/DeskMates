import { describe, expect, it } from 'vitest';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { Inbox } from './inbox.ts';
import type { InboxItem } from './types.ts';

const mgr = (text: string): InboxItem => ({ kind: 'manager', text, messageId: text, via: 'chat' });
const office = (text: string): InboxItem => ({ kind: 'office', text });
const BRIEFING = 'Briefing for this session.\nDate: today';
const textOf = (m: SDKUserMessage) => (typeof m.message.content === 'string' ? m.message.content : '');

function reader(inbox: Inbox) {
  const it = inbox[Symbol.asyncIterator]();
  const got: SDKUserMessage[] = [];
  let pending: Promise<unknown> | null = null;
  const pump = () => {
    pending = it.next().then((r) => {
      if (!r.done) {
        got.push(r.value);
        pump();
      }
    });
  };
  pump();
  return { got, it, settle: () => new Promise((r) => setTimeout(r, 40)), done: () => pending };
}

describe('Inbox', () => {
  it('sends items in order, in the exact input shape the SDK wants', async () => {
    const inbox = new Inbox({ coalesceMs: 1 });
    const r = reader(inbox);
    inbox.push(mgr('first'));
    await r.settle();
    inbox.push(mgr('second'));
    await r.settle();
    expect(r.got.map(textOf)).toEqual(['<message from="manager">first</message>', '<message from="manager">second</message>']);
    const m = r.got[0];
    expect(m.type).toBe('user');
    expect(m.parent_tool_use_id).toBeNull();
    expect(m.priority).toBe('next');
    expect(m.message.role).toBe('user');
    expect(m.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.got[1].uuid).not.toBe(m.uuid);
    inbox.close();
  });

  it('sends several waiting items as one turn, in order', async () => {
    const inbox = new Inbox({ coalesceMs: 20 });
    const r = reader(inbox);
    inbox.push(office(BRIEFING));
    inbox.push(office('You have just been hired. Introduce yourself.'));
    inbox.push(mgr('hello'));
    await r.settle();
    expect(r.got).toHaveLength(1);
    const t = textOf(r.got[0]);
    expect(t.indexOf('<office>\nBriefing')).toBe(0);
    expect(t.indexOf('just been hired')).toBeGreaterThan(t.indexOf('Briefing'));
    expect(t.indexOf('<message from="manager">hello')).toBeGreaterThan(t.indexOf('just been hired'));
    inbox.close();
  });

  it('holds everything while paused and releases it on resume', async () => {
    const inbox = new Inbox({ coalesceMs: 1 });
    inbox.setPaused(true);
    const r = reader(inbox);
    inbox.push(mgr('wait'));
    await r.settle();
    expect(r.got).toHaveLength(0);
    expect(inbox.size).toBe(1);
    inbox.setPaused(false);
    await r.settle();
    expect(r.got.map(textOf)).toEqual(['<message from="manager">wait</message>']);
    inbox.close();
  });

  it('keeps passive items (briefing, notices) back until something needs an answer', async () => {
    const inbox = new Inbox({ coalesceMs: 1 });
    const r = reader(inbox);
    inbox.push(office(BRIEFING));
    inbox.push(office('Your permission level is now "asks first". Internet: on.'));
    await r.settle();
    expect(r.got).toHaveLength(0);
    inbox.push(mgr('go'));
    await r.settle();
    expect(r.got).toHaveLength(1);
    expect(textOf(r.got[0])).toContain('Briefing');
    expect(textOf(r.got[0])).toContain('permission level');
    expect(textOf(r.got[0])).toContain('go');
    inbox.close();
  });

  it('sends passive items at once while a turn is running (they steer at the next tool boundary)', async () => {
    let busy = true;
    const inbox = new Inbox({ coalesceMs: 1, busy: () => busy });
    const r = reader(inbox);
    inbox.push(office("You have your manager's screen until 10:30. Use the host tools."));
    await r.settle();
    expect(r.got).toHaveLength(1);
    busy = false;
    inbox.close();
  });

  it('keeps a permission notice back even while a turn is running, and sends it with the next real message', async () => {
    let busy = true;
    const inbox = new Inbox({ coalesceMs: 1, busy: () => busy });
    const r = reader(inbox);
    inbox.push(office('Your permission level is now "independent". Internet: on.'));
    await r.settle();
    expect(r.got).toHaveLength(0);
    inbox.push(mgr('go on'));
    await r.settle();
    expect(r.got).toHaveLength(1);
    expect(textOf(r.got[0])).toBe('<office>Your permission level is now "independent". Internet: on.</office>\n<message from="manager">go on</message>');
    busy = false;
    inbox.close();
  });

  it('reports what went into each message and can be drained', async () => {
    const seen: InboxItem[][] = [];
    const inbox = new Inbox({ coalesceMs: 1, onYield: (items) => seen.push(items) });
    inbox.setPaused(true);
    inbox.push(mgr('a'));
    inbox.push(mgr('b'));
    expect(inbox.drain().map((i) => (i as { text: string }).text)).toEqual(['a', 'b']);
    inbox.setPaused(false);
    const r = reader(inbox);
    inbox.push(mgr('c'));
    await r.settle();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
    inbox.close();
  });

  it('ends the stream when closed', async () => {
    const inbox = new Inbox({ coalesceMs: 1 });
    const it = inbox[Symbol.asyncIterator]();
    const p = it.next();
    inbox.close();
    expect((await p).done).toBe(true);
    inbox.push(mgr('ignored'));
    expect(inbox.size).toBe(0);
  });
});
