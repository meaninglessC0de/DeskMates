import type { Capabilities } from '../../../shared';
import { useStore } from '../api/store';
import { emptyThread, initialData, sortEmployees } from '../api/reducer';
import type { CallSlice, Data } from '../api/reducer';
import { EMP, callInfo, capabilities, employees, presets, settings, teamReport, threads } from './data';
import type { ShotRef } from './shot';

/**
 * Load the store from the fixtures for a `?shot=<area>/<name>` page, then apply the state the shot asks for.
 *
 * Every area has a default (hire/* opens the hire dialog, team/* shows the team view, ...).
 * A shot's `query` string can refine it; all parameters are optional:
 *   employees=none           first run (no employees)
 *   select=maya|priya|jonas|ines
 *   boot=loading|error       the app's loading or can't-reach state
 *   thread=loading|error|empty   the selected employee's thread
 *   open=hire,profile,settings,desktop,summon   open these (comma list)
 *   view=team|desks     (area desks opens the Desks view; employees=2 seats two, faces=0 hides the faces)
 *   range=today|week|month   team range
 *   team=loading|error
 *   call=one|meeting         a live call; callState=connecting|live|failed; callMode=audio|avatar
 *   caps=nollm,nohost,genie,databricks,calls_off,calls_avatar,cua   capability tweaks
 * Components can read any other parameter with `useShot()?.params`.
 */
const FIRST: Record<string, string> = { maya: EMP.maya, priya: EMP.priya, jonas: EMP.jonas, ines: EMP.ines };

const AREA_OPEN: Record<string, string[]> = {
  hire: ['hire'], profile: ['profile'], settings: ['settings'], desktop: ['desktop'], stage: [],
};

function buildCall(kind: 'one' | 'meeting', state: CallSlice['state'], mode: CallSlice['mode']): CallSlice {
  const ids = kind === 'one' ? [EMP.maya] : [EMP.maya, EMP.priya, EMP.jonas];
  const participants: CallSlice['participants'] = {};
  ids.forEach((id, i) => {
    participants[id] = state === 'connecting' ? 'joining' : state === 'failed' ? 'failed' : kind === 'meeting' && i === 2 ? 'joining' : 'present';
  });
  const speaking = state === 'live';
  return {
    id: callInfo(ids).id, info: { ...callInfo(ids), mode }, employeeIds: ids, state, mode, participants,
    speaker: { employeeId: speaking ? (kind === 'one' ? EMP.maya : EMP.priya) : null, phase: speaking ? 'speaking' : 'idle' },
    captions: speaking
      ? [
          { id: 'cap-0', from: 'user', text: 'Did the tests pass on the checkout fix?', final: true },
          { id: 'cap-1', from: kind === 'one' ? EMP.maya : EMP.priya, text: kind === 'one' ? 'Yes, all of them. I am waiting for your approval to deploy.' : 'I can write the announcement once Maya has deployed.', final: false },
        ]
      : [],
    captionSeq: 2,
    hands: [],
  };
}

export function loadShot(shot: ShotRef): void {
  const p = shot.params;
  const caps = new Set((p.get('caps') ?? '').split(',').filter(Boolean));
  const capabilitiesOut: Capabilities = {
    ...capabilities,
    llm: !caps.has('nollm'),
    hostScreen: !caps.has('nohost'),
    genie: caps.has('genie'),
    databricks: caps.has('databricks'),
    desktops: caps.has('cua') ? 'cua' : 'mock',
    calls: caps.has('calls_off') ? 'off' : caps.has('calls_avatar') ? 'avatar' : 'audio',
  };

  const none = p.get('employees') === 'none';
  const count = Number(p.get('employees'));
  const all = sortEmployees(employees);
  const list = none ? [] : Number.isInteger(count) && count > 0 ? all.slice(0, count) : all;
  const wanted = FIRST[p.get('select') ?? ''];
  const selectedId = none ? null : wanted ?? list[0]?.id ?? null;

  const threadState = p.get('thread');
  const threadsOut: Data['threads'] = {};
  if (!none) {
    for (const e of list) {
      const t = threads[e.id];
      threadsOut[e.id] = t
        ? { ...emptyThread(), ...t, loaded: true, hasMore: false }
        : { ...emptyThread(), loaded: true };
    }
    if (selectedId && threadState) {
      threadsOut[selectedId] =
        threadState === 'loading' ? { ...emptyThread(), loading: true }
        : threadState === 'error' ? { ...emptyThread(), error: "Couldn't load this conversation" }
        : { ...emptyThread(), loaded: true };
    }
  }

  const open = new Set([...(AREA_OPEN[shot.area] ?? []), ...(p.get('open') ?? '').split(',').filter(Boolean)]);
  const view = shot.area === 'desks' || p.get('view') === 'desks' ? 'desks' : shot.area === 'team' || p.get('view') === 'team' ? 'team' : 'thread';
  const boot = p.get('boot');
  const range = (p.get('range') as Data['teamRange'] | null) ?? 'today';
  const team = p.get('team');

  const callKind = p.get('call');
  const call = callKind === 'one' || callKind === 'meeting' || shot.area === 'stage'
    ? buildCall(
        callKind === 'meeting' ? 'meeting' : 'one',
        (p.get('callState') as CallSlice['state'] | null) ?? 'live',
        (p.get('callMode') as CallSlice['mode'] | null) ?? 'audio',
      )
    : null;

  const base = initialData();
  useStore.setState({
    ...base,
    bootState: boot === 'loading' ? 'loading' : boot === 'error' ? 'error' : 'ready',
    bootError: boot === 'error' ? "Can't reach your team" : null,
    connected: true,
    employees: list,
    threads: threadsOut,
    presets,
    settings,
    capabilities: capabilitiesOut,
    team: team === 'loading' || team === 'error' ? {} : { today: teamReport('today'), week: teamReport('week'), month: teamReport('month') },
    teamRange: range,
    teamLoading: team === 'loading',
    teamError: team === 'error' ? "Couldn't load the team report" : null,
    call,
    ui: {
      ...base.ui,
      view,
      desksFaces: p.get('faces') !== '0',
      selectedId,
      hireOpen: open.has('hire'),
      profileOpen: open.has('profile'),
      settingsOpen: open.has('settings'),
      summonOpen: open.has('summon'),
      desktopOpen: selectedId && open.has('desktop') ? { [selectedId]: true } : {},
    },
  });
}
