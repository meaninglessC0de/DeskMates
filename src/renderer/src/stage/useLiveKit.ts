import type { CallInfo } from '../../../shared';

/** What the real LiveKit connection adds to a call: media tracks and the microphone. */
export interface LiveKitMedia {
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  micOn: boolean;
  setMic(on: boolean): void;
  disconnect(): void;
}

/**
 * Stub with the real hook's signature. `info` is the call to join, or null while there is
 * nothing to join (always null for mock calls). Throws until the real one is built.
 */
export function useLiveKit(info: CallInfo | null): LiveKitMedia | null {
  if (info) throw new Error('useLiveKit: not built yet');
  return null;
}
