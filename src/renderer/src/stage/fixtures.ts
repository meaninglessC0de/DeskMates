import type { CallSlice, Caption, ParticipantState } from '../api/store';
import { EMP, callInfo } from '../fixtures/data';
import { getShot } from '../fixtures/shot';

/**
 * Stage states for `?shot=stage/<name>&s=<scenario>`. A scenario is a whole `call` slice plus a few
 * view settings (layout, pinned desktop, how long she has been thinking, microphone state).
 * Stage applies it once on mount in shot mode; nothing here runs in the real app.
 */
export interface StageShotView {
  layout?: 'desktop' | 'face' | 'side';
  pinned?: string;
  thinkingMs?: number;
  micBlocked?: boolean;
  muted?: boolean;
  noCall?: boolean;
}

interface Scenario {
  ids: string[];
  state?: CallSlice['state'];
  participants?: Partial<Record<string, ParticipantState>>;
  speaker?: { who: number | null; phase: 'thinking' | 'speaking' | 'idle' };
  captions?: { from: number | 'user'; text: string; final?: boolean }[];
  view?: StageShotView;
}

const [MAYA, PRIYA, JONAS, INES] = [EMP.maya, EMP.priya, EMP.jonas, EMP.ines];
const ONE = [MAYA];
const THREE = [MAYA, INES, PRIYA];
const FOUR = [MAYA, INES, PRIYA, JONAS];

const MAYA_SAYS = { from: 0, text: "I'd fix the cart total first, then run the tests again." };
const ASK = { from: 'user' as const, text: 'Can you take a look at the checkout page?', final: true };
const MEETING_SAYS = { from: 0, text: "I'd start with the pricing page." };

const scenarios: Record<string, Scenario> = {
  // one-to-one
  connecting: { ids: ONE, state: 'connecting' },
  quiet: { ids: ONE },
  speaking: { ids: ONE, speaker: { who: 0, phase: 'speaking' }, captions: [ASK, MAYA_SAYS] },
  'you-speaking': { ids: ONE, captions: [{ from: 'user', text: 'Can you take a look at the checkout', final: false }] },
  'you-muted': { ids: ONE, captions: [{ from: 'user', text: 'Can you take a look at the checkout', final: false }], view: { muted: true } },
  thinking: { ids: ONE, speaker: { who: 0, phase: 'thinking' }, captions: [ASK] },
  'thinking-long': { ids: ONE, speaker: { who: 0, phase: 'thinking' }, captions: [ASK], view: { thinkingMs: 9000 } },
  'no-answer': { ids: ONE, speaker: { who: 0, phase: 'thinking' }, captions: [ASK], view: { thinkingMs: 21000 } },
  failed: { ids: ONE, state: 'failed' },
  dropped: { ids: ONE, participants: { [MAYA]: 'dropped' } },
  'mic-blocked': { ids: ONE, view: { micBlocked: true } },
  'face-focus': { ids: ONE, speaker: { who: 0, phase: 'speaking' }, captions: [ASK, MAYA_SAYS], view: { layout: 'face' } },
  'side-by-side': { ids: ONE, speaker: { who: 0, phase: 'speaking' }, captions: [ASK, MAYA_SAYS], view: { layout: 'side' } },
  // meetings
  'm2': { ids: [MAYA, INES], speaker: { who: 0, phase: 'speaking' }, captions: [MEETING_SAYS] },
  'm3': { ids: THREE, speaker: { who: 0, phase: 'speaking' }, captions: [MEETING_SAYS] },
  'm3-quiet': { ids: THREE },
  'm3-thinking': { ids: THREE, speaker: { who: 2, phase: 'thinking' }, captions: [{ from: 'user', text: 'Priya, what do you think?', final: true }] },
  'm4': { ids: FOUR, speaker: { who: 2, phase: 'speaking' }, captions: [{ from: 2, text: 'I can write the announcement once Maya has deployed.' }] },
  'm4-you-speaking': { ids: FOUR, captions: [{ from: 'user', text: 'Priya, what do you think about the launch email', final: false }] },
  'm3-spotlight': { ids: THREE, speaker: { who: 0, phase: 'speaking' }, captions: [{ from: 0, text: 'Here is the checkout bug.' }], view: { pinned: MAYA } },
  'm4-spotlight': { ids: FOUR, speaker: { who: 0, phase: 'speaking' }, captions: [{ from: 0, text: 'Here is the checkout bug.' }], view: { pinned: MAYA } },
  'm3-connecting': { ids: THREE, state: 'connecting' },
  'm3-joining': { ids: THREE, participants: { [PRIYA]: 'joining' }, speaker: { who: 0, phase: 'speaking' }, captions: [MEETING_SAYS] },
  'm3-dropped': { ids: THREE, participants: { [PRIYA]: 'dropped' }, speaker: { who: 0, phase: 'speaking' }, captions: [MEETING_SAYS] },
  'm3-failed': { ids: THREE, participants: { [PRIYA]: 'failed' }, speaker: { who: 0, phase: 'speaking' }, captions: [MEETING_SAYS] },
  'm3-no-answer': { ids: THREE, speaker: { who: 2, phase: 'thinking' }, captions: [{ from: 'user', text: 'Priya, what do you think?', final: true }], view: { thinkingMs: 21000 } },
  'm3-left': { ids: THREE, participants: { [PRIYA]: 'left' }, speaker: { who: 0, phase: 'speaking' }, captions: [MEETING_SAYS] },
  // the summon picker over the app (no call)
  picker: { ids: ONE, view: { noCall: true } },
};

export function scenarioView(name: string | null): StageShotView {
  return (name && scenarios[name]?.view) || {};
}

export function buildScenario(name: string): CallSlice | null {
  const sc = scenarios[name];
  if (!sc || sc.view?.noCall) return null;
  const state = sc.state ?? 'live';
  const participants: CallSlice['participants'] = {};
  for (const id of sc.ids) {
    participants[id] = sc.participants?.[id] ?? (state === 'connecting' ? 'joining' : state === 'failed' ? 'failed' : 'present');
  }
  const captions: Caption[] = (sc.captions ?? []).map((c, i) => ({
    id: `cap-${i}`,
    from: c.from === 'user' ? 'user' : sc.ids[c.from]!,
    text: c.text,
    final: c.final ?? false,
  }));
  const speaker = sc.speaker ? { employeeId: sc.speaker.who === null ? null : sc.ids[sc.speaker.who]!, phase: sc.speaker.phase } : { employeeId: null, phase: 'idle' as const };
  const info = { ...callInfo(sc.ids), startedMs: Date.now() - (4 * 60 + 12) * 1000 };
  return { id: info.id, info, employeeIds: sc.ids, state, mode: 'audio', participants, speaker, captions, captionSeq: captions.length, hands: [] };
}

/** `s=<scenario>` and `portraits=none` from the shot URL, or null outside shot mode. */
export function stageShot(): { scenario: string | null; view: StageShotView; noPortraits: boolean } | null {
  const shot = getShot();
  if (!shot || shot.area !== 'stage') return null;
  const scenario = shot.params.get('s');
  return { scenario, view: scenarioView(scenario), noPortraits: shot.params.get('portraits') !== 'yes' };
}
