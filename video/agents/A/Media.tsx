import React from 'react';
import { Img, OffthreadVideo, Sequence, staticFile } from 'remotion';
import { FPS, FR, Rect, WIN_RADIUS } from './util';

export const abs = (r: Rect, extra: React.CSSProperties = {}): React.CSSProperties => ({
  position: 'absolute',
  left: r.x,
  top: r.y,
  width: r.w,
  height: r.h,
  ...extra,
});

// A recording placed in its parent at an edit time (take0 = take second shown at edit0).
export const Vid: React.FC<{
  src: string;
  edit0: number;
  edit1: number;
  take0: number;
  rate?: number;
  style?: React.CSSProperties;
}> = ({ src, edit0, edit1, take0, rate = 1, style }) => (
  <Sequence from={Math.round(edit0 * FPS)} durationInFrames={Math.max(1, Math.round((edit1 - edit0) * FPS))} layout="none">
    <OffthreadVideo
      src={staticFile(src)}
      muted
      trimBefore={Math.round(take0 * FPS)}
      playbackRate={rate}
      style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'fill', ...style }}
    />
  </Sequence>
);

export type CropSrc =
  | { kind: 'img'; url: string }
  | { kind: 'vid'; url: string; edit0: number; edit1: number; take0: number; rate?: number };

// Shows source rect `sr` (frame px of a 2560x1600 recording/still) in `rect` (cover-fit).
export const MediaCrop: React.FC<{
  rect: Rect;
  src: CropSrc;
  sr: Rect;
  radius?: number;
  opacity?: number;
  shadow?: string;
  border?: string;
}> = ({ rect, src, sr, radius = 0, opacity = 1, shadow, border }) => {
  const k = Math.max(rect.w / sr.w, rect.h / sr.h);
  const inner: React.CSSProperties = {
    position: 'absolute',
    left: (rect.w - sr.w * k) / 2 - sr.x * k,
    top: (rect.h - sr.h * k) / 2 - sr.y * k,
    width: FR.w * k,
    height: FR.h * k,
  };
  return (
    <div style={abs(rect, { overflow: 'hidden', borderRadius: radius, opacity, boxShadow: shadow, outline: border })}>
      <div style={inner}>
        {src.kind === 'img' ? (
          <Img src={staticFile(src.url)} style={{ width: '100%', height: '100%', display: 'block' }} />
        ) : (
          <Vid src={src.url} edit0={src.edit0} edit1={src.edit1} take0={src.take0} rate={src.rate} />
        )}
      </div>
    </div>
  );
};

// The app window: dark plate with rounded corners; children are laid out in plate-relative percentages.
export const Plate: React.FC<{ rect: Rect; opacity?: number; radiusScale?: number; children?: React.ReactNode; bg?: string }> = ({
  rect,
  opacity = 1,
  radiusScale = 1,
  children,
  bg = '#1a1a1a',
}) => (
  <div style={abs(rect, { opacity, background: bg, borderRadius: WIN_RADIUS * radiusScale, overflow: 'hidden' })}>{children}</div>
);
