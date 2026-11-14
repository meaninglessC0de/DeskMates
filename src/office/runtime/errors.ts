/**
 * The runtime cannot start for a reason the manager can read ("I can't start: no API key is set").
 * The supervisor shows the message as the employee being `stuck`, keeps the inbox, and does not crash office.
 */
export class RuntimeUnavailable extends Error {
  override readonly name = 'RuntimeUnavailable';
  constructor(message: string) {
    super(message);
  }
}

export function isRuntimeUnavailable(err: unknown): err is RuntimeUnavailable {
  return err instanceof Error && err.name === 'RuntimeUnavailable';
}
