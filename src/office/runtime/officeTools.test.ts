import { describe, expect, it } from 'vitest';
import { MAX_COLLEAGUE_TEXT, officeToolSpecs } from './officeTools.ts';
import { FakeHost } from './testHost.ts';

function tool(host: FakeHost, name: string) {
  const spec = officeToolSpecs(host, { taskClosed() {} }).find((s) => s.name === name);
  if (!spec) throw new Error(`no tool ${name}`);
  return async (args: Record<string, unknown>) => {
    const r = await spec.handler(args);
    return { text: (r.content[0] as { text: string }).text, isError: !!r.isError };
  };
}

describe('wait_for_colleague', () => {
  it('is an office tool that passes the name and the reason to the host', async () => {
    const host = new FakeHost();
    const specs = officeToolSpecs(host, { taskClosed() {} });
    expect(specs.map((s) => s.name)).toContain('wait_for_colleague');
    expect(specs.find((s) => s.name === 'wait_for_colleague')!.description).toBe(
      'Call this when you cannot continue until a teammate replies or sends you something. Then stop: the office wakes you when their message arrives.',
    );
    const r = await tool(host, 'wait_for_colleague')({ name: 'Priya', reason: 'the copy' });
    expect(r.isError).toBe(false);
    expect(host.waiting).toEqual([{ name: 'Priya', reason: 'the copy' }]);
  });
});

describe('message_colleague length', () => {
  it('passes a whole small page (8,000 characters) and refuses more than 12,000 with a clear error', async () => {
    const host = new FakeHost();
    const send = tool(host, 'message_colleague');
    expect((await send({ to: 'Priya', text: 'x'.repeat(8000) })).isError).toBe(false);
    expect(host.colleagueCalls[0].text).toHaveLength(8000);
    expect((await send({ to: 'Priya', text: 'x'.repeat(MAX_COLLEAGUE_TEXT) })).isError).toBe(false);
    const big = await send({ to: 'Priya', text: 'x'.repeat(MAX_COLLEAGUE_TEXT + 1) });
    expect(big.isError).toBe(true);
    expect(big.text).toMatch(/^Too long: 12001 characters, the limit is 12000\./);
    expect(host.colleagueCalls).toHaveLength(2);
  });
});
