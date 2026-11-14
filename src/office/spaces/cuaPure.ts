/** Pure helpers for the Cua Spaces implementation (no SDK import, safe to unit test). */

export const DEFAULT_NAME_PREFIX = 'emp-';

/** Space name for an employee: `emp-<lowercase ulid>` (the `emp_` id prefix is dropped). */
export function spaceNameFor(employeeId: string, prefix: string = DEFAULT_NAME_PREFIX): string {
  return `${prefix}${employeeId.replace(/^emp_/, '').toLowerCase()}`;
}

/** The id stored on `Employee.spaceId` and used by the SDK. */
export function spaceIdFor(name: string): string {
  return `local:${name}`;
}

/** MCP headers come back as `[{ name, value }]` or already as a record; the office wants a record. */
export function flattenHeaders(headers: Array<{ name: string; value: string }> | Record<string, string> | undefined | null): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {};
    for (const h of headers) out[h.name] = h.value;
    return out;
  }
  return { ...headers };
}

export type PowerKind = 'running' | 'asleep' | 'unknown';

/** Maps the SDK's `powerState` to what ensure has to do. */
export function powerKind(powerState: string | undefined): PowerKind {
  const p = (powerState ?? '').toLowerCase();
  if (p === 'running') return 'running';
  if (p === 'suspended' || p === 'stopped') return 'asleep';
  return 'unknown';
}

export type EnsurePlan = 'create' | 'check' | 'wake';

/** First decision of `ensure`, from the registry entry alone. A `check` still has to prove it answers. */
export function planEnsure(entry: { powerState: string } | undefined): EnsurePlan {
  if (!entry) return 'create';
  return powerKind(entry.powerState) === 'asleep' ? 'wake' : 'check';
}

/** The native layer often has no message, only a `.tag`. */
export function errorText(e: unknown): string {
  if (e instanceof Error) {
    const tag = (e as { tag?: unknown }).tag;
    const base = e.message && e.message !== 'Error' ? e.message : '';
    if (base && typeof tag === 'string' && tag && !base.includes(tag)) return `${tag}: ${base}`;
    if (base) return base;
    if (typeof tag === 'string' && tag) return tag;
    return e.name || 'Error';
  }
  return String(e);
}

/** A Space still listed as running whose runtime VM is gone ("instance emp-... not found"). */
export function isStaleError(e: unknown): boolean {
  return /instance\b.*\bnot found/i.test(errorText(e));
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  return Promise.race([p, guard]).finally(() => clearTimeout(timer));
}

/** Plain-language progress for the phases the SDK reports while creating a Space. */
export function progressText(phase: string): string {
  switch (phase) {
    case 'preparing': return 'Setting up the desktop runtime';
    case 'pulling': return 'Downloading the desktop image';
    case 'creating': return 'Creating desktop';
    case 'booting': return 'Starting desktop';
    case 'waiting_for_services': return 'Waiting for it to start';
    case 'connecting': return 'Connecting to desktop';
    case 'ready': return 'Desktop is ready';
    default: return 'Creating desktop';
  }
}

/** Single-quote a path for `sh -c`. */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** `~`, `~/x` and relative paths are inside the desktop's home. */
export function resolveGuestPath(home: string, p: string): string {
  const t = p.trim();
  if (t === '~') return home;
  if (t.startsWith('~/')) return `${home.replace(/\/$/, '')}/${t.slice(2)}`;
  if (t.startsWith('/')) return t;
  return `${home.replace(/\/$/, '')}/${t}`;
}

export function guestDirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}
