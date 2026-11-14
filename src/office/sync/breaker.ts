export type BreakerState = 'closed' | 'open' | 'half-open';

/** Opens after `threshold` failures in a row, stays open for `openMs`, then lets exactly one probe through. */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  private probing = false;
  private isOpen = false;

  constructor(
    private opts: { threshold?: number; openMs?: number; now?: () => number; onChange?: (s: BreakerState) => void } = {},
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  state(): BreakerState {
    if (!this.isOpen) return 'closed';
    return this.now() < this.openUntil ? 'open' : 'half-open';
  }

  /** True when a call may go out. In the half-open state only the first caller gets true until it reports back. */
  allow(): boolean {
    const s = this.state();
    if (s === 'closed') return true;
    if (s === 'open') return false;
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  success(): void {
    const wasOpen = this.isOpen;
    this.failures = 0;
    this.isOpen = false;
    this.probing = false;
    if (wasOpen) this.opts.onChange?.('closed');
  }

  /** `trip` opens at once (a credential problem does not heal by retrying). */
  failure(trip = false): void {
    this.probing = false;
    this.failures++;
    if (trip || this.isOpen || this.failures >= (this.opts.threshold ?? 3)) {
      const wasClosed = !this.isOpen;
      this.isOpen = true;
      this.openUntil = this.now() + (this.opts.openMs ?? 300_000);
      if (wasClosed) this.opts.onChange?.('open');
    }
  }
}
