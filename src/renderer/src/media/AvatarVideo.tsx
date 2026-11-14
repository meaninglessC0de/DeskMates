import { useCallback, useEffect, useRef } from 'react';
import type { Ref } from 'react';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';

export interface AvatarVideoProps {
  track: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  fallbackSrc: string;
  name: string;
  /** Receives the `<video>` element, for `captureStill`. */
  videoRef?: Ref<HTMLVideoElement>;
}

/** The avatar's live video (and its voice). With no video track the still `fallbackSrc` shows as the poster. */
export function AvatarVideo({ track, audio, fallbackSrc, name, videoRef }: AvatarVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const setRef = useCallback(
    (el: HTMLVideoElement | null) => {
      ref.current = el;
      if (typeof videoRef === 'function') videoRef(el);
      else if (videoRef) (videoRef as { current: HTMLVideoElement | null }).current = el;
    },
    [videoRef],
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tracks = [track, audio].filter((t): t is MediaStreamTrack => t !== null);
    el.srcObject = tracks.length ? new MediaStream(tracks) : null;
    if (tracks.length) void el.play().catch(() => undefined);
  }, [track, audio]);
  return (
    <AspectRatio ratio={4 / 5} fit="cover">
      <video ref={setRef} poster={fallbackSrc} autoPlay playsInline muted={audio === null} aria-label={name} />
    </AspectRatio>
  );
}

/**
 * The frame the video is showing now, as a JPEG. With no decoded frame yet (no track, or not started)
 * it returns the poster image instead, so there is always something to keep as the tile's still.
 */
export async function captureStill(video: HTMLVideoElement): Promise<Blob> {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.9));
      if (blob) return blob;
    }
  }
  if (!video.poster) throw new Error('no frame to capture');
  const res = await fetch(video.poster);
  if (!res.ok) throw new Error('no frame to capture');
  return res.blob();
}
