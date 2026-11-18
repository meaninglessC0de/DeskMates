import React from 'react';
import {Img, staticFile} from 'remotion';
import {COLORS, FIT, FONT, H, Rect, T, TILE, TILE_R, W, WHO, Who, clamp, eout, lerp, seg, smoother, toScreen} from './lib';
import {At, Crop, SRC, useT} from './ui';

const M0 = 110.8;
const M1 = 112.1;
const SIZE = 160;
const GAP = 20;
const X0 = (W - (2 * SIZE + GAP)) / 2;
const Y0 = 190;
const MARK: Record<Who, Rect> = {
  maya: {x: X0, y: Y0, w: SIZE, h: SIZE},
  priya: {x: X0 + SIZE + GAP, y: Y0, w: SIZE, h: SIZE},
  jonas: {x: X0, y: Y0 + SIZE + GAP, w: SIZE, h: SIZE},
  ines: {x: X0 + SIZE + GAP, y: Y0 + SIZE + GAP, w: SIZE, h: SIZE},
};
const BAR: Record<Who, string> = {maya: '#4f76be', priya: '#c97a2a', jonas: '#b83d77', ines: '#1f9a69'};

const Ghost: React.FC<{w: Who}> = ({w}) => {
  const t = useT();
  const a = toScreen(FIT, TILE[w]);
  const b = MARK[w];
  const e = smoother(seg(t, M0, M1));
  const r = {x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), w: lerp(a.w, b.w, e), h: lerp(a.h, b.h, e)};
  const rad = lerp(TILE_R * FIT.k, SIZE * 0.22, e);
  const content = 1 - seg(e, 0.12, 0.5);
  return (
    <div style={{position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: rad, overflow: 'hidden', background: COLORS[w]}}>
      <div style={{position: 'absolute', inset: 0, opacity: content}}>
        {w === 'ines' ? (
          <>
            <Img src={staticFile('agents/C/ines-clean.png')} style={{width: '100%', height: '100%', display: 'block'}} />
            <div style={{position: 'absolute', left: (826 / 1056) * 100 + '%', top: (28 / 660) * 100 + '%', width: (205 / 1056) * 100 + '%', height: (265 / 660) * 100 + '%', overflow: 'hidden', borderRadius: 8}}>
              <Crop src={SRC.desks} crop={{x: TILE.ines.x + 826, y: TILE.ines.y + 28, w: 205, h: 265}} s={r.w / TILE.ines.w} t0={M0 - 0.5} t1={M1 + 0.2} take0={0} freeze={57.5 - T.deskOff} />
            </div>
          </>
        ) : (
          <Crop
            src={SRC.desks} crop={TILE[w]} s={r.w / TILE[w].w} t0={M0 - 0.5} t1={M1 + 0.2} take0={0} freeze={57.5 - T.deskOff}
          />
        )}
      </div>
      <div style={{position: 'absolute', left: '29%', top: '42%', width: '42%', height: '9%', borderRadius: 999, background: BAR[w], opacity: seg(e, 0.5, 0.9)}} />
    </div>
  );
};

export const EndCard: React.FC = () => {
  const t = useT();
  if (t < M0 - 0.6) return null;
  const word = eout(seg(t, 112.2, 113.0));
  const tag = eout(seg(t, 112.9, 113.8));
  const line = seg(t, 115.6, 116.6);
  return (
    <div style={{position: 'absolute', inset: 0, fontFamily: FONT, color: '#fff', textAlign: 'center'}}>
      {WHO.map((w) => (
        <Ghost key={w} w={w} />
      ))}
      <div style={{position: 'absolute', left: 0, width: W, top: 560, fontSize: 88, fontWeight: 650, letterSpacing: -1.5, opacity: word, transform: `translateY(${(1 - word) * 18}px)`}}>
        Deskmates
      </div>
      <div style={{position: 'absolute', left: 0, width: W, top: 672, fontSize: 36, fontWeight: 450, color: '#c7c7cf', opacity: tag, transform: `translateY(${(1 - tag) * 14}px)`}}>
        Your AI team, with a desk, a face, and a seat at the table.
      </div>
      <div style={{position: 'absolute', left: 0, width: W, top: 780, display: 'flex', gap: 30, justifyContent: 'center'}}>
        {WHO.map((w, i) => {
          const p = eout(seg(t, 114.2 + 0.14 * i, 114.8 + 0.14 * i));
          return (
            <Img
              key={w}
              src={staticFile(`img/${w}-sq.jpg`)}
              style={{width: 104, height: 104, borderRadius: 52, objectFit: 'cover', boxShadow: `0 0 0 5px ${COLORS[w]}`, opacity: p, transform: `translateY(${(1 - p) * 20}px) scale(${0.85 + 0.15 * p})`}}
            />
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 0, width: W, top: 975, fontSize: 24, color: '#8b8b94', opacity: line}}>
        Built with Cua · Claude Agent SDK · Synthesia · Databricks · Astryx
      </div>
    </div>
  );
};
