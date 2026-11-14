import type { Employee } from '../../../shared';
import { getShot } from '../fixtures/shot';

/** Screenshot mode only: lets a shot show states the fixtures do not contain (pending restart, desktop off). */
export function withShotState(e: Employee | undefined): Employee | undefined {
  const p = getShot()?.params;
  if (!e || !p) return e;
  return {
    ...e,
    ...(p.get('pending') === '1' ? { pendingRestart: true } : {}),
    ...(p.get('off') === '1' ? { state: 'offline' as const, desktopSinceMs: null } : {}),
    ...(p.get('screen') === '1' ? { permissions: { ...e.permissions, myScreen: true } } : {}),
  };
}
