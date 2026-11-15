import { describe, expect, it } from 'vitest';
import { fakeClient } from './testHost.ts';
import { modelPicker, routeByRules, routeUtterance, type RouteInput } from './router.ts';

const people = [
  { employeeId: 'm', firstName: 'Maya', role: 'Web developer' },
  { employeeId: 'p', firstName: 'Priya', role: 'Marketer' },
  { employeeId: 'j', firstName: 'Jonas', role: 'Researcher' },
];
const input = (utterance: string, over: Partial<RouteInput> = {}): RouteInput => ({ utterance, participants: people, pendingAddress: null, previousSpeaker: null, ...over });

describe('routeByRules', () => {
  it('rule 1: a pending address wins over names', () => {
    expect(routeByRules(input('Maya, how is it going?', { pendingAddress: 'j' }))).toEqual(['j']);
  });
  it('ignores a pending address for someone who is not in the meeting', () => {
    expect(routeByRules(input('Maya, status?', { pendingAddress: 'zzz' }))).toEqual(['m']);
  });
  it('rule 2: one name, case-insensitive, whole word only', () => {
    expect(routeByRules(input('so priya, what do you think'))).toEqual(['p']);
    expect(routeByRules(input('Mayan history is interesting to the whole group today'))).toBeNull();
  });
  it('rule 2: two names answer in the order spoken', () => {
    expect(routeByRules(input('Jonas and then Maya, please give me an update'))).toEqual(['j', 'm']);
    expect(routeByRules(input('Maya and then Jonas, please give me an update'))).toEqual(['m', 'j']);
  });
  it('rule 2: everyone, all of you, each of you reach all participants', () => {
    for (const u of ['Everyone, status please', 'what are all of you working on', 'Each of you give me one line'])
      expect(routeByRules(input(u))).toEqual(['m', 'p', 'j']);
  });
  it('rule 3: short follow-up and follow-up starters go to the previous speaker', () => {
    expect(routeByRules(input('why is that?', { previousSpeaker: 'p' }))).toEqual(['p']);
    expect(routeByRules(input('and what about the budget for the whole quarter please', { previousSpeaker: 'j' }))).toEqual(['j']);
    expect(routeByRules(input('how long will the whole thing take you to finish up', { previousSpeaker: 'm' }))).toEqual(['m']);
  });
  it('rule 3 needs a previous speaker and a short or starter sentence', () => {
    expect(routeByRules(input('why is that?'))).toBeNull();
    expect(routeByRules(input('please walk me through the entire plan for the week', { previousSpeaker: 'p' }))).toBeNull();
  });
  it('a name beats a short follow-up', () => {
    expect(routeByRules(input('Jonas?', { previousSpeaker: 'p' }))).toEqual(['j']);
  });
});

describe('routeUtterance', () => {
  it('rule 4: the model picks one participant', async () => {
    const client = fakeClient([{ text: ['{"employeeId": "p"}'] }]);
    const r = await routeUtterance(input('who should write the launch announcement for the product?'), modelPicker(client, 'claude-haiku-5-5'));
    expect(r).toEqual(['p']);
    expect(client.requests[0].model).toBe('claude-haiku-5-5');
    expect(client.requests[0].system[0].text).toContain('p: Priya, Marketer');
  });
  it('falls back to the first participant on a model failure, an unknown id or no picker', async () => {
    const u = 'who should write the launch announcement for the product?';
    expect(await routeUtterance(input(u), async () => { throw new Error('down'); })).toEqual(['m']);
    expect(await routeUtterance(input(u), async () => 'ghost')).toEqual(['m']);
    expect(await routeUtterance(input(u), async () => null)).toEqual(['m']);
    expect(await routeUtterance(input(u))).toEqual(['m']);
  });
  it('does not call the model when a rule decides', async () => {
    let called = false;
    await routeUtterance(input('Priya, hello'), async () => { called = true; return 'm'; });
    expect(called).toBe(false);
  });
});
