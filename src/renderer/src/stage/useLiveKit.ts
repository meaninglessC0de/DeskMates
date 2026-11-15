import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionState, Room, RoomEvent, Track } from 'livekit-client';
import type { RemoteTrack } from 'livekit-client';
import type { CallInfo } from '../../../shared';

/** What the real LiveKit connection adds to a call: media tracks and the microphone. */
export interface LiveKitMedia {
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  micOn: boolean;
  setMic(on: boolean): void;
  disconnect(): void;
}

export interface RemoteEntry<T> {
  identity: string;
  kind: 'audio' | 'video';
  track: T;
}

/**
 * Which remote tracks the stage shows. With an avatar there is one video track and its own audio (same participant);
 * without one, the agent's audio is the only remote media. Pure.
 */
export function pickMedia<T>(entries: RemoteEntry<T>[]): { video: RemoteEntry<T> | null; audio: RemoteEntry<T> | null } {
  const video = entries.find((e) => e.kind === 'video') ?? null;
  const audio = (video && entries.find((e) => e.kind === 'audio' && e.identity === video.identity)) ?? entries.find((e) => e.kind === 'audio') ?? null;
  return { video, audio };
}

interface Media {
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
}

const NO_MEDIA: Media = { videoTrack: null, audioTrack: null };

/** The room of the call that is connected now, set on connect and cleared on disconnect (for the demo hook's `say`). */
let currentRoom: Room | null = null;
export function getConnectedRoom(): Room | null {
  return currentRoom && currentRoom.state === ConnectionState.Connected ? currentRoom : null;
}

/**
 * Joins the call's LiveKit room with the microphone on. `info` is the call to join, or null while there is nothing to
 * join (always null for mock calls). State, participants, speaker and captions are not here: they come from the
 * store's `call` slice, which the WebSocket events fill. With no avatar video, the agent's voice is played here.
 */
export function useLiveKit(info: CallInfo | null): LiveKitMedia | null {
  const roomRef = useRef<Room | null>(null);
  const [media, setMedia] = useState<Media>(NO_MEDIA);
  const [micOn, setMicOn] = useState(true);
  const callId = info?.id ?? null;
  const url = info?.livekitUrl ?? '';
  const token = info?.token ?? '';

  useEffect(() => {
    if (!callId) return;
    const room = new Room({ adaptiveStream: false, dynacast: false });
    roomRef.current = room;
    const remote = new Map<string, RemoteEntry<RemoteTrack>>();
    const playing = new Set<RemoteTrack>();
    let closed = false;

    const refresh = (): void => {
      const { video, audio } = pickMedia([...remote.values()]);
      // the avatar's own element plays its voice; with no video, play the agent's voice here
      for (const t of [...playing]) {
        if (video || t !== audio?.track) {
          t.detach();
          playing.delete(t);
        }
      }
      if (!video && audio && !playing.has(audio.track)) {
        audio.track.attach();
        playing.add(audio.track);
      }
      setMedia({ videoTrack: video?.track.mediaStreamTrack ?? null, audioTrack: audio?.track.mediaStreamTrack ?? null });
    };

    room
      .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind !== Track.Kind.Audio && track.kind !== Track.Kind.Video) return;
        remote.set(track.sid ?? `${participant.identity}-${track.kind}`, { identity: participant.identity, kind: track.kind === Track.Kind.Audio ? 'audio' : 'video', track });
        refresh();
      })
      .on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        remote.delete(track.sid ?? `${participant.identity}-${track.kind}`);
        track.detach();
        playing.delete(track);
        refresh();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!room.canPlaybackAudio) void room.startAudio().catch(() => undefined);
      })
      .on(RoomEvent.Disconnected, () => {
        if (currentRoom === room) currentRoom = null;
        remote.clear();
        refresh();
      });

    void (async () => {
      try {
        await room.connect(url, token);
        if (closed) return;
        currentRoom = room;
        await room.startAudio().catch(() => undefined);
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          if (!closed) setMicOn(true);
        } catch {
          if (!closed) setMicOn(false);
        }
      } catch (e) {
        // office reports the call as failed when nobody joins; nothing else to do here
        console.error('livekit connect failed', e);
      }
    })();

    return () => {
      closed = true;
      for (const t of playing) t.detach();
      playing.clear();
      if (room.state !== ConnectionState.Disconnected) void room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
      if (currentRoom === room) currentRoom = null;
      setMedia(NO_MEDIA);
    };
  }, [callId, url, token]);

  const setMic = useCallback((on: boolean): void => {
    setMicOn(on);
    void roomRef.current?.localParticipant.setMicrophoneEnabled(on).catch(() => setMicOn(false));
  }, []);

  const disconnect = useCallback((): void => {
    void roomRef.current?.disconnect();
  }, []);

  if (!callId) return null;
  return { ...media, micOn, setMic, disconnect };
}
