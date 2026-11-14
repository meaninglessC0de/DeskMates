import { useEffect, useRef, useState } from 'react';

const RING_IN_MS = 150;
const RING_OUT_MS = 400;

/**
 * Debounced speaking ring (ux-spec 4.4): a new speaker needs 150 ms of sustained speech to take the
 * ring, and the old ring stays 400 ms after silence, so short sounds do not flicker it.
 * The first value is used as is, so a screenshot or a late mount shows the ring at once.
 */
export function useRing(target: string | null): string | null {
  const [ring, setRing] = useState<string | null>(target);
  useEffect(() => {
    if (target === ring) return;
    const t = setTimeout(() => setRing(target), target === null ? RING_OUT_MS : RING_IN_MS);
    return () => clearTimeout(t);
  }, [target, ring]);
  return ring;
}

export interface Thinking {
  employeeId: string | null;
  /** Milliseconds since she started thinking. 0 when nobody is. */
  ms: number;
}

/** How long the addressed person has been thinking (ux-spec 4.7). `initialMs` is for fixtures. */
export function useThinking(speaker: { employeeId: string | null; phase: 'thinking' | 'speaking' | 'idle' }, initialMs = 0): Thinking {
  const who = speaker.phase === 'thinking' ? speaker.employeeId : null;
  const since = useRef<number | null>(who ? Date.now() - initialMs : null);
  const [now, setNow] = useState(() => Date.now());
  const last = useRef(who);
  const seeded = useRef(who !== null);
  if (last.current !== who) {
    last.current = who;
    since.current = who ? Date.now() - (seeded.current ? 0 : initialMs) : null;
    if (who) seeded.current = true;
  }
  useEffect(() => {
    if (!who) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [who]);
  return { employeeId: who, ms: who && since.current !== null ? Math.max(0, now - since.current) : 0 };
}

/** The last person who spoke; the one live video track stays in their tile while nobody speaks. */
export function useLastSpeaker(current: string | null, fallback: string | null): string | null {
  const last = useRef<string | null>(current ?? fallback);
  if (current) last.current = current;
  return last.current;
}
