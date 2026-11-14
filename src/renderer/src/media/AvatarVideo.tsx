import { useEffect, useRef } from 'react';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';

export interface AvatarVideoProps {
  track: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  fallbackSrc: string;
  name: string;
}

/** The avatar's live video (and its voice). With no video track the still `fallbackSrc` shows as the poster. */
export function AvatarVideo({ track, audio, fallbackSrc, name }: AvatarVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tracks = [track, audio].filter((t): t is MediaStreamTrack => t !== null);
    el.srcObject = tracks.length ? new MediaStream(tracks) : null;
  }, [track, audio]);
  return (
    <AspectRatio ratio={4 / 5} fit="cover">
      <video ref={ref} poster={fallbackSrc} autoPlay playsInline muted={audio === null} aria-label={name} />
    </AspectRatio>
  );
}
