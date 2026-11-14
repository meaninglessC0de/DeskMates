import { useEffect, useState } from 'react';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Spinner } from '@astryxdesign/core/Spinner';
import type { EmployeeState } from '../../../shared';
import { isShot } from '../fixtures/shot';
import { presenceOf } from './presence';

/** Two pulses, then rest: the pulse is on for a few seconds after the state is entered. */
function usePulseOnce(active: boolean): boolean {
  const [on, setOn] = useState(active && !isShot());
  useEffect(() => {
    if (!active || isShot()) {
      setOn(false);
      return;
    }
    setOn(true);
    const t = setTimeout(() => setOn(false), 3600);
    return () => clearTimeout(t);
  }, [active]);
  return on;
}

/** The node for `Avatar status`: StatusDot for every state, so the dots are one size. */
export function PresenceDot({ state }: { state: EmployeeState }) {
  const p = presenceOf(state);
  const pulsing = usePulseOnce(state === 'needs_you');
  if (p.kind === 'none') return null;
  if (p.kind === 'spinner') return <Spinner size="sm" aria-label="Starting desktop" />;
  return <StatusDot variant={p.variant} label={p.label} isPulsing={pulsing} />;
}
