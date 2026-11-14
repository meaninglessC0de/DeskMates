import { useEffect, useState } from 'react';
import { isShot } from '../fixtures/shot';

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** m:ss until `untilMs`, ticking once a second. Plain text, so it works inside any Astryx text slot. */
export function Countdown({ untilMs }: { untilMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isShot()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{formatClock(untilMs - now)}</>;
}
