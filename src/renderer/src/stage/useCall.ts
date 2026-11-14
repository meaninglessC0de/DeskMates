import { useEffect, useRef, useState } from 'react';
import { useStore } from '../api/store';
import type { Caption, ParticipantState } from '../api/store';
import { stageShot } from './fixtures';
import { useLiveKit } from './useLiveKit';

export interface CallSession {
  state: 'connecting' | 'live' | 'failed';
  mode: 'avatar' | 'audio';
  startedMs: number;
  micOn: boolean;
  /** The operating system or browser refuses microphone access. Mute is shown pressed and disabled. */
  micBlocked: boolean;
  setMic(on: boolean): void;
  participants: { employeeId: string; state: ParticipantState }[];
  speaker: { employeeId: string | null; phase: 'thinking' | 'speaking' | 'idle' };
  captions: Caption[];
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  end(): void;
}

function useMicBlocked(): boolean {
  const [blocked, setBlocked] = useState(stageShot()?.view.micBlocked ?? false);
  useEffect(() => {
    if (stageShot()) return;
    let status: PermissionStatus | null = null;
    const sync = (): void => setBlocked(status?.state === 'denied');
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s;
        s.onchange = sync;
        sync();
      })
      .catch(() => undefined);
    return () => {
      if (status) status.onchange = null;
    };
  }, []);
  return blocked;
}

/**
 * The call the Stage shows. State, participants, speaker and captions always come from the
 * store (WebSocket `call` events, scripted by office in mock mode). Tracks and the microphone
 * come from LiveKit only when `CallInfo.mock` is false; for a mock call they are null and the
 * mic is a local toggle. Only valid while `store.call` is not null (Stage is only rendered then).
 */
export function useCall(): CallSession {
  const call = useStore((s) => s.call);
  const [mockMic, setMockMic] = useState(!(stageShot()?.view.muted ?? false));
  const micBlocked = useMicBlocked();
  const mounted = useRef(Date.now());
  const live = useLiveKit(call?.info && !call.info.mock ? call.info : null);

  const end = (): void => {
    live?.disconnect();
    void useStore.getState().endCall();
  };

  return {
    state: call?.state ?? 'connecting',
    mode: call?.mode ?? 'audio',
    startedMs: call?.info?.startedMs ?? mounted.current,
    micOn: micBlocked ? false : live ? live.micOn : mockMic,
    micBlocked,
    setMic: live ? live.setMic : setMockMic,
    participants: (call?.employeeIds ?? []).map((employeeId) => ({ employeeId, state: call?.participants[employeeId] ?? 'joining' })),
    speaker: call?.speaker ?? { employeeId: null, phase: 'idle' },
    captions: call?.captions ?? [],
    videoTrack: live?.videoTrack ?? null,
    audioTrack: live?.audioTrack ?? null,
    end,
  };
}
