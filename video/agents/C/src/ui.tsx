import React, {createContext, useContext} from 'react';
import {Freeze, OffthreadVideo, Sequence, staticFile} from 'remotion';
import {FPS, Rect, VH, VW} from './lib';

export const TCtx = createContext(0);
export const useT = () => useContext(TCtx);

export const SRC = {
  desks: 'media/raw/desks.mp4',
  call: 'media/raw/call.mp4',
  meeting: 'media/raw/meeting.mp4',
  approve: 'media/raw/approve.mp4',
  team: 'media/raw/team.mp4',
};

/** Mount children (and their videos) only during [t0, t1), starting a fresh local clock at t0. */
export const At: React.FC<{t0: number; t1: number; children: React.ReactNode}> = ({t0, t1, children}) => {
  const t = useT();
  if (t < t0 || t >= t1) return null;
  return (
    <Sequence
      from={Math.round(t0 * FPS)}
      durationInFrames={Math.max(1, Math.round((t1 - t0) * FPS))}
      layout="none"
    >
      {children}
    </Sequence>
  );
};

export type CropProps = {
  src: string;
  crop: Rect; // region of the 2560x1600 frame
  s: number; // output px per source px
  t0: number;
  t1: number;
  take0: number; // take time at t0
  rate?: number;
  freeze?: number; // show this take time still
  radius?: number | string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

const Inner: React.FC<CropProps> = ({src, crop, s, take0, rate = 1, freeze, radius, style, children}) => {
  const video = (
    <OffthreadVideo
      src={staticFile(src)}
      muted
      trimBefore={freeze !== undefined ? Math.round(freeze * FPS) : Math.round(take0 * FPS)}
      playbackRate={rate}
      style={{
        position: 'absolute',
        left: -crop.x * s,
        top: -crop.y * s,
        width: VW * s,
        height: VH * s,
        maxWidth: 'none',
      }}
    />
  );
  return (
    <div
      style={{
        position: 'relative',
        width: crop.w * s,
        height: crop.h * s,
        overflow: 'hidden',
        borderRadius: radius,
        ...style,
      }}
    >
      {freeze !== undefined ? <Freeze frame={0}>{video}</Freeze> : video}
      {children}
    </div>
  );
};

export const Crop: React.FC<CropProps> = (p) => (
  <At t0={p.t0} t1={p.t1}>
    <Inner {...p} />
  </At>
);

/** Cover-fit a source crop into a rect (centre-cropped). */
export const CoverCrop: React.FC<CropProps & {box: {w: number; h: number}}> = ({box, ...p}) => {
  const s = Math.max(box.w / p.crop.w, box.h / p.crop.h);
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: p.radius}}>
      <div
        style={{
          position: 'absolute',
          left: (box.w - p.crop.w * s) / 2,
          top: (box.h - p.crop.h * s) / 2,
        }}
      >
        <Crop {...p} s={s} radius={0} />
      </div>
    </div>
  );
};
