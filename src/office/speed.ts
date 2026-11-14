/** Mock timing multiplier: MOCK_SPEED=20 makes the scripted 20-second sequence take one second. */
export function mockSpeed(): number {
  const n = Number(process.env.MOCK_SPEED);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** A delay in real milliseconds for a scripted duration given in milliseconds at speed 1. */
export function scaled(ms: number): number {
  return Math.max(1, Math.round(ms / mockSpeed()));
}
