import { useState } from 'react';
import { useStore } from '../api/store';
import type { Caption, ParticipantState } from '../api/store';
import { useLiveKit } from './useLiveKit';

export interface CallSession {
  state: 'connecting' | 'live' | 'failed';
  mode: 'avatar' | 'audio';
  micOn: boolean;
  setMic(on: boolean): void;
  participants: { employeeId: string; state: ParticipantState }[];
  speaker: { employeeId: string | null; phase: 'thinking' | 'speaking' | 'idle' };
  captions: Caption[];
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  end(): void;
}

/**
 * The call the Stage shows. State, participants, speaker and captions always come from the
 * store (WebSocket `call` events, scripted by office in mock mode). Tracks and the microphone
 * come from LiveKit only when `CallInfo.mock` is false; for a mock call they are null and the
 * mic is a local toggle. Only valid while `store.call` is not null (Stage is only rendered then).
 */
export function useCall(): CallSession {
  const call = useStore((s) => s.call);
  const [mockMic, setMockMic] = useState(true);
  const live = useLiveKit(call?.info && !call.info.mock ? call.info : null);

  const end = (): void => {
    live?.disconnect();
    void useStore.getState().endCall();
  };

  return {
    state: call?.state ?? 'connecting',
    mode: call?.mode ?? 'audio',
    micOn: live ? live.micOn : mockMic,
    setMic: live ? live.setMic : setMockMic,
    participants: (call?.employeeIds ?? []).map((employeeId) => ({ employeeId, state: call?.participants[employeeId] ?? 'joining' })),
    speaker: call?.speaker ?? { employeeId: null, phase: 'idle' },
    captions: call?.captions ?? [],
    videoTrack: live?.videoTrack ?? null,
    audioTrack: live?.audioTrack ?? null,
    end,
  };
}
