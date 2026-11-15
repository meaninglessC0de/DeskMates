/**
 * Messages between desks, read from the steps the office already sends: a step with `peer.direction === 'to'` is one
 * message from the step's employee to `peer.employeeId` (the receiver gets a mirror step, direction 'from', which is
 * ignored here so nothing shows twice). Pure functions; the view calls them on every render with `Date.now()`.
 */
import type { ActivityStep } from '../../../shared';

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
