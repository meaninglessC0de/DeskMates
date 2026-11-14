import { useEffect, useRef, useState } from 'react';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Card } from '@astryxdesign/core/Card';
import { routes } from '../../../shared';
import { isShot } from '../fixtures/shot';

export type SpaceState = 'connecting' | 'live' | 'offline' | 'error';

export interface SpaceViewProps {
  employeeId: string;
  mode: 'view' | 'control';
  onState?: (s: SpaceState) => void;
}

/**
 * First version: polls `frame.jpg` (about 2 per second) into an <img>. A later version replaces
 * the body with the Cua media socket; the props stay. `mode` is not used yet (no input is forwarded).
 */
export function SpaceView({ employeeId, mode, onState }: SpaceViewProps) {
  const [tick, setTick] = useState(0);
  const failures = useRef(0);
  const report = useRef(onState);
  report.current = onState;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    report.current?.('connecting');
    return () => clearTimeout(timer.current);
  }, [employeeId]);

  const next = (ms: number): void => {
    if (isShot()) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTick((t) => t + 1), ms);
  };

  return (
    <Card variant="muted" padding={0}>
      <AspectRatio ratio={16 / 10} fit="contain">
        <img
          src={`${routes.frame(employeeId)}?t=${tick}`}
          alt={mode === 'control' ? 'Desktop, in control' : 'Desktop'}
          onLoad={() => {
            failures.current = 0;
            report.current?.('live');
            next(500);
          }}
          onError={() => {
            failures.current += 1;
            report.current?.(failures.current >= 3 ? 'offline' : 'error');
            next(failures.current >= 3 ? 5000 : 1500);
          }}
        />
      </AspectRatio>
    </Card>
  );
}
