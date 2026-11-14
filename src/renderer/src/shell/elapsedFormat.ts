/** "42 s" under a minute, "40 min", "1 h 12 min". Seconds are shown only under one minute. */
export function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** Milliseconds until the label can next change: every second under a minute, then at each minute. */
export function nextElapsedTick(ms: number): number {
  const m = Math.max(0, ms);
  return m < 60_000 ? 1000 - (m % 1000) + 20 : 60_000 - (m % 60_000) + 20;
}
