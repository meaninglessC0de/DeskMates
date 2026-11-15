/**
 * Messages between desks, read from the steps the office already sends: a step with `peer.direction === 'to'` is one
 * message from the step's employee to `peer.employeeId` (the receiver gets a mirror step, direction 'from', which is
 * ignored here so nothing shows twice). Pure functions; the view calls them on every render with `Date.now()`.
 */
import type { ActivityStep, Message } from '../../../shared';

export interface DeskMessage {
  /** The step's id. */
  id: string;
  from: string;
  to: string;
  text: string;
  ms: number;
}

/** A bubble stays up this long; a longer text stays up to the longer figure. */
export const BUBBLE_MS = 8000;
export const BUBBLE_LONG_MS = 12000;
export const LONG_TEXT = 100;
/** The receiving tile's ring pulse. */
export const PULSE_MS = 1400;
/** The rail keeps the newest of these. */
export const RAIL_MAX = 80;

export function peerMessages(threads: Record<string, { steps: ActivityStep[] } | undefined>): DeskMessage[] {
  const out: DeskMessage[] = [];
  for (const [employeeId, t] of Object.entries(threads)) {
    for (const s of t?.steps ?? []) {
      if (s.peer?.direction !== 'to' || !s.peer.text.trim()) continue;
      out.push({ id: s.id, from: s.employeeId || employeeId, to: s.peer.employeeId, text: s.peer.text.trim(), ms: s.startedMs });
    }
  }
  out.sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id));
  return out.slice(-RAIL_MAX);
}

export const bubbleMs = (text: string): number => (text.length > LONG_TEXT ? BUBBLE_LONG_MS : BUBBLE_MS);

/** The newest message per sender that is still within its bubble time. */
export function liveBubbles(msgs: DeskMessage[], now: number): Record<string, DeskMessage> {
  const out: Record<string, DeskMessage> = {};
  for (const m of msgs) if (now - m.ms < bubbleMs(m.text)) out[m.from] = m;
  return out;
}

/** The newest message per receiver that is still within the pulse time. */
export function livePulses(msgs: DeskMessage[], now: number): Record<string, DeskMessage> {
  const out: Record<string, DeskMessage> = {};
  for (const m of msgs) if (now - m.ms < PULSE_MS) out[m.to] = m;
  return out;
}

/** The next moment a bubble or a pulse ends (ms since epoch), or null when none is live. */
export function nextExpiry(msgs: DeskMessage[], now: number): number | null {
  let next: number | null = null;
  for (const m of msgs) {
    for (const end of [m.ms + bubbleMs(m.text), m.ms + PULSE_MS]) {
      if (end > now && (next === null || end < next)) next = end;
    }
  }
  return next;
}

/** The rail shows the newest of these rows. */
export const FEED_MAX = 60;
/** The same text sent to several people within this long is one row, "to the team". */
export const TEAM_WINDOW_MS = 2000;

/**
 * One row of the rail. `fromId` / `toId` are employee ids; null means the manager (the user). `team` is the manager
 * writing to several people at once. `tag` is the only extra: a quiet "Done" or "Asks" beside the name.
 */
export interface FeedRow {
  id: string;
  fromId: string | null;
  toId: string | null;
  team: boolean;
  text: string;
  ms: number;
  tag: 'Done' | 'Asks' | null;
}

type MessageThreads = Record<string, { steps: ActivityStep[]; messages: Message[] } | undefined>;

/**
 * The whole team's feed: desk-to-desk messages (unchanged), what employees send the manager (employee messages, but
 * not system lines or call dividers), and what the manager sends employees. Oldest first, newest 60 kept.
 */
export function feedRows(threads: MessageThreads): FeedRow[] {
  const rows: FeedRow[] = peerMessages(threads).map((m) => ({ id: m.id, fromId: m.from, toId: m.to, team: false, text: m.text, ms: m.ms, tag: null }));
  const outgoing: { id: string; to: string; text: string; ms: number }[] = [];
  for (const [employeeId, t] of Object.entries(threads)) {
    for (const m of t?.messages ?? []) {
      const text = m.text.trim();
      if (!text || m.kind === 'system' || m.from === 'system') continue;
      if (m.from === 'employee') rows.push({ id: m.id, fromId: employeeId, toId: null, team: false, text, ms: m.createdMs, tag: m.kind === 'done' ? 'Done' : m.kind === 'question' ? 'Asks' : null });
      else if (m.from === 'user') outgoing.push({ id: m.id, to: employeeId, text, ms: m.createdMs });
    }
  }
  outgoing.sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id));
  const groups: { first: (typeof outgoing)[number]; to: Set<string> }[] = [];
  for (const m of outgoing) {
    const g = groups.find((x) => x.first.text === m.text && m.ms - x.first.ms <= TEAM_WINDOW_MS);
    if (g) g.to.add(m.to);
    else groups.push({ first: m, to: new Set([m.to]) });
  }
  for (const g of groups) {
    const team = g.to.size > 1;
    rows.push({ id: g.first.id, fromId: null, toId: team ? null : g.first.to, team, text: g.first.text, ms: g.first.ms, tag: null });
  }
  rows.sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id));
  return rows.slice(-FEED_MAX);
}
