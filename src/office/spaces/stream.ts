import type { StreamResponse } from '../../shared/index.ts';
import type { BackendHandle } from './cuaBackend.ts';

const TICKET_TTL_MS = 10 * 60_000;

/** A `cua-media` ticket for the desktop, or the `frames` fallback when the SDK cannot open a stream. */
export async function openCuaStream(handle: BackendHandle, employeeId: string, mode: 'view' | 'control'): Promise<StreamResponse> {
  try {
    const t = await handle.openStream({
      maxFps: 15,
      maxDimension: 1280,
      policy: mode === 'control' ? 'allow_activation' : 'view_only',
      ticketTtlMs: TICKET_TTL_MS,
    });
    // The contract's `expiresMs` is an absolute time (epoch milliseconds), like every other `*Ms` field.
    const at = t.ticketExpiresAt ? Date.parse(t.ticketExpiresAt) : Number.NaN;
    return {
      kind: 'cua-media',
      wsUrl: t.wsUrl,
      ticket: t.ticket,
      mediaSessionId: t.mediaSessionId,
      expiresMs: Number.isFinite(at) && at > Date.now() ? at : Date.now() + TICKET_TTL_MS,
    };
  } catch (e) {
    console.warn('[spaces] openStream failed, using frames:', (e as { tag?: string }).tag ?? (e as Error).message);
    return { kind: 'frames', url: `/api/employees/${employeeId}/frame.jpg` };
  }
}
