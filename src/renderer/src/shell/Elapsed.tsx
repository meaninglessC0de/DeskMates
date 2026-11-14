import { useEffect, useState } from 'react';
import { isShot } from '../fixtures/shot';
import { formatElapsed, nextElapsedTick } from './elapsedFormat';

/** Live elapsed time as plain text, so it works inside any Astryx text slot. */
export function Elapsed({ startMs }: { startMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isShot()) return;
    const t = setTimeout(() => setNow(Date.now()), nextElapsedTick(Date.now() - startMs));
    return () => clearTimeout(t);
  }, [now, startMs]);
  return <>{formatElapsed(now - startMs)}</>;
}
