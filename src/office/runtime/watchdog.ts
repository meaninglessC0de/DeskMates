export const REPEAT_WARN = 4;
export const REPEAT_STUCK = 8;

export const REPEAT_NOTICE = 'You repeated the same action 4 times with no effect. Observe the screen and try a different approach.';

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

export type RepeatVerdict = 'ok' | 'warn' | 'stuck';

/**
 * Counts the same tool with the same input in a row (employee-runtime.md 4.5). The 4-minute stall check and the
 * approval and desktop checks live in the supervisor's own 30-second tick; this is the part that needs the tool stream.
 */
export class RepeatDetector {
  private key = '';
  private count = 0;

  /** Record one call; 'warn' exactly at the 4th identical call, 'stuck' at the 8th. */
  note(tool: string, input: unknown): RepeatVerdict {
    const k = `${tool}\u0000${stableStringify(input)}`;
    if (k === this.key) this.count++;
    else {
      this.key = k;
      this.count = 1;
    }
    if (this.count >= REPEAT_STUCK) return 'stuck';
    if (this.count === REPEAT_WARN) return 'warn';
    return 'ok';
  }

  reset(): void {
    this.key = '';
    this.count = 0;
  }
}
