import React from 'react';
import {AbsoluteFill, Audio, Img, staticFile, useCurrentFrame} from 'remotion';
import {
  CALL_C, CALL_FACE_LOCAL, CALL_FRAME, CALL_TX, CALL_TY, CARD, COLORS, DESK_NO, FIT, FONT, FPS, FULL, GRID, H, NAMES, PILL,
  Rect, SHARE, STRIP, T, TILE, TILE_R, VH, VW, W, WHO, Who, callToWorld, camAt, clamp, eio, eout, lerp, seg, smoother, toScreen,
} from './lib';
import {At, Crop, CoverCrop, SRC, TCtx, useT} from './ui';
import {LogLayer, MacScene, MenuLayer, PilePart, landTime} from './mac';
import {EndCard} from './End';
import {Subtitles} from './Subs';

const BG = 'rgb(26,26,26)';
const rectStyle = (r: Rect): React.CSSProperties => ({position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h});
const lerpRect = (a: Rect, b: Rect, e: number): Rect => ({
  x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), w: lerp(a.w, b.w, e), h: lerp(a.h, b.h, e),
});
const DESK_END = 57.5;

// ---------------- desks ----------------
const DesksVideo: React.FC = () => (
  <div style={{...rectStyle({x: 0, y: 0, w: VW, h: VH}), overflow: 'hidden', borderRadius: 28, background: BG}}>
    <Crop src={SRC.desks} crop={{x: 0, y: 0, w: VW, h: VH}} s={1} t0={24} t1={DESK_END} take0={24 - T.deskOff} />
    <Crop src={SRC.desks} crop={{x: 0, y: 0, w: VW, h: VH}} s={1} t0={DESK_END} t1={130} take0={0} freeze={DESK_END - T.deskOff} />
  </div>
);

const Covers: React.FC = () => {
  const t = useT();
  if (t > 27.4) return null;
  return (
    <>
      {WHO.map((w) => {
        const land = landTime(w);
        const op = 1 - seg(t, land - 0.15, land + 0.3);
        if (op <= 0) return null;
        const r = TILE[w];
        const pill = PILL(w);
        return (
          <div key={w} style={{...rectStyle(r), borderRadius: TILE_R, background: 'rgb(22,34,52)', opacity: op, overflow: 'hidden'}}>
            <div style={{position: 'absolute', left: 0, top: 0, width: r.w, height: 21, background: '#26262c'}} />
            <div
              style={{
                position: 'absolute', left: pill.x - r.x, top: pill.y - r.y, width: pill.w, height: pill.h, borderRadius: 31,
                background: 'rgba(20,20,22,.72)', color: '#fff', fontFamily: FONT, fontSize: 34, lineHeight: '61px',
                textAlign: 'center', letterSpacing: 0.2,
              }}
            >
              Desk {DESK_NO[w]} · {NAMES[w]}
            </div>
          </div>
        );
      })}
    </>
  );
};

// ---------------- face that flies between places ----------------
type Src = {src: string; crop: Rect; t0: number; t1: number; take0: number; freeze?: number};
const FaceFly: React.FC<{rectA: Rect; rectB: Rect; e: number; a: Src; b: Src; color: string; arc?: number; z?: number}> = ({
  rectA, rectB, e, a, b, color, arc = 0, z = 50,
}) => {
  if (e <= 0 || e >= 1.0001 && false) return null;
  const r = lerpRect(rectA, rectB, e);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = rectB.x + rectB.w / 2 - (rectA.x + rectA.w / 2);
  const dy = rectB.y + rectB.h / 2 - (rectA.y + rectA.h / 2);
  const len = Math.hypot(dx, dy) || 1;
  const off = arc * Math.sin(Math.PI * e);
  const radius = lerp(22, 24, e);
  const bo = seg(e, 0.2, 0.55);
  return (
    <div
      style={{
        position: 'absolute', left: cx - r.w / 2 + (-dy / len) * off, top: cy - r.h / 2 + (dx / len) * off, width: r.w, height: r.h,
        borderRadius: radius, overflow: 'hidden', zIndex: z, boxShadow: `0 0 0 ${3 * (1 - bo)}px ${color}, 0 ${18 * Math.sin(Math.PI * e)}px ${40 * Math.sin(Math.PI * e)}px rgba(0,0,0,.35)`,
      }}
    >
      {bo < 1 && <CoverCrop {...a} box={r} radius={radius} />}
      {bo > 0 && (
        <div style={{position: 'absolute', inset: 0, opacity: bo}}>
          <CoverCrop {...b} box={r} radius={radius} />
        </div>
      )}
    </div>
  );
};

// ---------------- call ----------------
const callE = (t: number) => smoother(seg(t, 42.5, 43.9)) - smoother(seg(t, 49.7, 51.1));
const CallBackdrop: React.FC = () => {
  const t = useT();
  if (t < 42.4 || t > 51.6) return null;
  const o = seg(callE(t), 0.15, 0.85);
  if (o <= 0) return null;
  return <div style={{...rectStyle({x: -900, y: -700, w: VW + 1800, h: VH + 1400}), background: BG, opacity: o}} />;
};
const CallLayer: React.FC = () => {
  const t = useT();
  if (t < 42.45 || t > 51.5) return null;
  const e = callE(t);
  const op = seg(t, 42.5, 42.85) * (1 - seg(t, 51.05, 51.4));
  const L = lerp(SHARE.x, 0, e);
  const Tp = lerp(SHARE.y, 0, e);
  const R = lerp(VW - (SHARE.x + SHARE.w), 0, e);
  const B = lerp(VH - (SHARE.y + SHARE.h), 0, e);
  const rad = lerp(TILE_R / CALL_C, 30, e);
  const flying = e < 0.995;
  return (
    <div
      style={{
        position: 'absolute', left: CALL_TX, top: CALL_TY, width: VW, height: VH, transformOrigin: '0 0', transform: `scale(${CALL_C})`,
        clipPath: `inset(${Tp}px ${R}px ${B}px ${L}px round ${rad}px)`, opacity: op, background: BG,
      }}
    >
      <Crop src={SRC.call} crop={{x: 0, y: 0, w: VW, h: VH}} s={1} t0={42.5} t1={51.5} take0={42.5 - T.callOffset} />
      {/* cover the app's own caption so text never doubles */}
      <div style={{position: 'absolute', left: 380, top: 1376, width: 1800, height: 224, background: BG}} />
      {/* the face tile is supplied by the flying face until it lands */}
      {flying && (
        <div style={{position: 'absolute', left: CALL_FACE_LOCAL.x - 6, top: CALL_FACE_LOCAL.y - 6, width: CALL_FACE_LOCAL.w + 12, height: CALL_FACE_LOCAL.h + 12, background: BG}} />
      )}
    </div>
  );
};

const CallFace: React.FC = () => {
  const t = useT();
  if (t < 42.45 || t > 51.5) return null;
  const e = callE(t);
  if (e >= 0.995 || e <= 0.001) return null;
  const A: Src = {src: SRC.desks, crop: CARD('maya'), t0: 42.5, t1: 51.6, take0: 42.5 - T.deskOff};
  const B: Src = {src: SRC.call, crop: CALL_FACE_LOCAL, t0: 42.5, t1: 51.6, take0: 42.5 - T.callOffset};
  return (
    <FaceFly rectA={CARD('maya')} rectB={callToWorld(CALL_FACE_LOCAL)} e={e} a={A} b={B} color={COLORS.maya} arc={0} z={60} />
  );
};

// ---------------- meeting ----------------
const MSEGS: {t0: number; t1: number; take0: number; ramp: [number, number] | null; freeze?: number}[] = [
  {t0: 52.7, t1: 67.8, take0: 17.9, ramp: null},
  {t0: 67.4, t1: 70.8, take0: 41.9, ramp: [67.4, 67.8]},
  {t0: 70.4, t1: 77.2, take0: 46.4, ramp: [70.4, 70.8]},
  {t0: 76.8, t1: 79.0, take0: 54.2, ramp: [76.8, 77.2]},
  {t0: 78.6, t1: 84.7, take0: 71.3, ramp: [78.6, 79.0]},
  {t0: 84.3, t1: 86.2, take0: 79.5, ramp: [84.3, 84.7]},
  {t0: 86.2, t1: 91.0, take0: 0, freeze: 81.4, ramp: null},
];
const PATCH: {who: Who; t0: number; t1: number; at: number}[] = [
  {who: 'maya', t0: 67.4, t1: 70.4, at: 35.5},
  {who: 'jonas', t0: 76.3, t1: 78.6, at: 47.0},
];
const MeetingLayer: React.FC = () => {
  const t = useT();
  const op = seg(t, 54.2, 54.9) * (1 - seg(t, 87.6, 88.3));
  if (t < 54.1 || t > 88.4) return null;
  return (
    <div style={{...rectStyle({x: 0, y: 0, w: VW, h: VH}), opacity: op, borderRadius: 28, overflow: 'hidden', background: BG}}>
      {MSEGS.map((m, i) => {
        const o = m.ramp ? seg(t, m.ramp[0], m.ramp[1]) : 1;
        return (
          <div key={i} style={{position: 'absolute', inset: 0, opacity: o}}>
            <Crop
              src={SRC.meeting} crop={{x: 0, y: 0, w: VW, h: VH}} s={1} t0={m.t0} t1={m.t1} take0={m.take0}
              freeze={m.freeze}
            />
          </div>
        );
      })}
      {PATCH.map((p, i) => {
        const o = seg(t, p.t0, p.t0 + 0.15) * (1 - seg(t, p.t1 - 0.15, p.t1));
        if (o <= 0) return null;
        return (
          <div key={i} style={{...rectStyle(STRIP[p.who]), opacity: o, borderRadius: 20, overflow: 'hidden'}}>
            <Crop src={SRC.meeting} crop={STRIP[p.who]} s={1} t0={p.t0 - 0.2} t1={p.t1 + 0.1} take0={0} freeze={p.at} />
          </div>
        );
      })}
      {/* tiles stay empty until the flying faces have landed on them */}
      {WHO.map((w, i) => (t < 55.1 + 0.05 * i ? <div key={w} style={{...rectStyle(GRID[w]), background: BG}} /> : null))}
      {/* what has left the meeting is not drawn twice */}
      {t > 87.35 && <div style={{...rectStyle(SHARE), background: BG}} />}
      {WHO.map((w, i) => (t > 87.2 + 0.1 * i ? <div key={'s' + w} style={{...rectStyle(STRIP[w]), background: BG}} /> : null))}
      {/* cover the app's own captions and call controls */}
      <div style={{position: 'absolute', left: 380, top: 1376, width: 1800, height: 224, background: BG}} />
    </div>
  );
};

const MEET_E = (t: number, i: number) => smoother(seg(t, 52.85 + 0.1 * i, 55.1 + 0.05 * i));
const RET_E = (t: number, i: number) => smoother(seg(t, 87.2 + 0.1 * i, 89.15));
const MeetingFlights: React.FC = () => {
  const t = useT();
  const out: React.ReactNode[] = [];
  if (t > 52.8 && t < 55.4) {
    WHO.forEach((w, i) => {
      const e = MEET_E(t, i);
      if (e <= 0 || e >= 1) return;
      out.push(
        <FaceFly
          key={'o' + w}
          rectA={CARD(w)}
          rectB={GRID[w]}
          e={e}
          a={{src: SRC.desks, crop: CARD(w), t0: 52.7, t1: 55.5, take0: 52.7 - T.deskOff}}
          b={{src: SRC.meeting, crop: GRID[w], t0: 52.7, t1: 55.5, take0: 17.9}}
          color={COLORS[w]}
          arc={[-70, 70, -60, 60][i]}
          z={70}
        />,
      );
    });
  }
  if (t > 87.1 && t < 89.3) {
    WHO.forEach((w, i) => {
      const e = RET_E(t, i);
      if (e <= 0 || e >= 1) return;
      out.push(
        <FaceFly
          key={'r' + w}
          rectA={STRIP[w]}
          rectB={CARD(w)}
          e={e}
          a={{src: SRC.meeting, crop: STRIP[w], t0: 87.0, t1: 89.4, take0: 0, freeze: 81.4}}
          b={{src: SRC.desks, crop: CARD(w), t0: 87.0, t1: 89.4, take0: 0, freeze: DESK_END - T.deskOff}}
          color={COLORS[w]}
          arc={[60, -60, 50, -50][i]}
          z={70}
        />,
      );
    });
  }
  return <>{out}</>;
};

// Ines's shared desktop returns to her desk and keeps the "Chosen: Version B" state it really had
const InesDesktop: React.FC = () => {
  const t = useT();
  if (t < 87.1 || t > 111.0) return null;
  const e = smoother(seg(t, 87.35, 89.15));
  if (e <= 0) return null;
  const r = lerpRect(SHARE, TILE.ines, e);
  const pill = PILL('ines');
  const clean = seg(e, 0.05, 0.45);
  const pillO = seg(e, 0.85, 1.0);
  return (
    <div style={{...rectStyle(r), borderRadius: lerp(26, TILE_R, e), overflow: 'hidden', zIndex: 40}}>
      <Img src={staticFile('agents/C/ines-desktop.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block'}} />
      <Img src={staticFile('agents/C/ines-clean.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', opacity: clean}} />
      <div
        style={{
          position: 'absolute', left: ((pill.x - TILE.ines.x) / TILE.ines.w) * r.w, top: ((pill.y - TILE.ines.y) / TILE.ines.h) * r.h,
          width: (pill.w / TILE.ines.w) * r.w, height: (pill.h / TILE.ines.h) * r.h, borderRadius: 31, background: 'rgba(20,20,22,.72)', color: '#fff',
          fontFamily: FONT, fontSize: 34 * (r.w / TILE.ines.w), lineHeight: `${61 * (r.h / TILE.ines.h)}px`, textAlign: 'center', opacity: pillO,
        }}
      >
        Desk 4 · Ines
      </div>
      {e >= 0.995 && (
        <div style={{...rectStyle({x: CARD('ines').x - TILE.ines.x, y: CARD('ines').y - TILE.ines.y, w: CARD('ines').w, h: CARD('ines').h}), overflow: 'hidden', borderRadius: 22}}>
          <Crop src={SRC.desks} crop={CARD('ines')} s={1} t0={89.1} t1={111.2} take0={0} freeze={DESK_END - T.deskOff} />
        </div>
      )}
    </div>
  );
};

// ---------------- teammate messages ----------------
const Bubble: React.FC<{from: Who; to: Who; text: string; t0: number; t1: number; hold: number; out: number; p0: {x: number; y: number}; p1: {x: number; y: number}}> = ({
  from, to, text, t0, t1, hold, out, p0, p1,
}) => {
  const t = useT();
  if (t < t0 - 0.05 || t > out + 0.5) return null;
  const e = smoother(seg(t, t0 + 0.15, t1));
  const a = seg(t, t0, t0 + 0.35) * (1 - seg(t, out, out + 0.3));
  const x = lerp(p0.x, p1.x, e);
  const y = lerp(p0.y, p1.y, e) - 90 * Math.sin(Math.PI * e);
  const sc = lerp(0.92, 1, eout(seg(t, t0, t0 + 0.5))) * lerp(1, 0.96, e);
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: 760, transform: `translate(-50%,-50%) scale(${sc})`, opacity: a,
        background: '#fff', borderRadius: 30, padding: '26px 32px', fontFamily: FONT, color: '#16161a',
        boxShadow: '0 24px 60px rgba(0,0,0,.32), 0 0 0 1px rgba(0,0,0,.06)', zIndex: 80,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, fontSize: 30, fontWeight: 600}}>
        <Img src={staticFile(`img/${from}-sq.jpg`)} style={{width: 54, height: 54, borderRadius: 27, objectFit: 'cover', boxShadow: `0 0 0 4px ${COLORS[from]}`}} />
        <span>{NAMES[from]}</span>
        <span style={{color: '#8b8b95', fontWeight: 500}}>to</span>
        <span style={{color: COLORS[to]}}>{NAMES[to]}</span>
      </div>
      <div style={{fontSize: 38, lineHeight: '50px', fontWeight: 450}}>{text}</div>
    </div>
  );
};
const Messages: React.FC = () => {
  const P = {x: TILE.priya.x + 520, y: TILE.priya.y + 360};
  const J = {x: TILE.jonas.x + 520, y: TILE.jonas.y + 420};
  return (
    <>
      <Bubble from="priya" to="jonas" text="Could you send me one line on how competitors handle discount vs tax order?" t0={89.8} t1={91.6} hold={0} out={93.0} p0={P} p1={J} />
      <Bubble from="jonas" to="priya" text="Shopify's help docs say discounts come off the subtotal before tax, so we match them." t0={92.9} t1={94.6} hold={0} out={95.3} p0={J} p1={P} />
    </>
  );
};

// ---------------- approval (the real card, the real click) ----------------
const ApproveCard: React.FC = () => {
  const t = useT();
  const t0 = 96.8;
  const t1 = 100.4;
  if (t < t0 || t > t1 + 0.2) return null;
  const inn = eout(seg(t, t0, t0 + 0.7));
  const outp = eio(seg(t, t1 - 0.5, t1));
  const click = 98.5; // real click at take 3.10
  const done = smoother(seg(t, click, click + 0.35));
  const y = lerp(-220, 54, inn) + outp * -260;
  const crop = {x: 815, y: 885, w: 1250, h: 185};
  const s = 0.62;
  const ring = done > 0 ? COLORS.ines : 'rgba(0,0,0,.08)';
  return (
    <div
      style={{
        position: 'absolute', left: 960 - 410, top: y, width: 820, borderRadius: 26, background: '#fff', padding: '18px 22px 20px',
        boxShadow: `0 24px 60px rgba(0,0,0,.35), 0 0 0 ${2 + 2 * done}px ${ring}`, fontFamily: FONT, opacity: inn,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, fontSize: 24, fontWeight: 600, color: '#16161a'}}>
        <Img src={staticFile('img/maya-sq.jpg')} style={{width: 40, height: 40, borderRadius: 20, objectFit: 'cover', boxShadow: `0 0 0 3px ${COLORS.maya}`}} />
        <span>Maya Chen</span>
        <span style={{flex: 1}} />
        <span style={{fontSize: 20, color: done > 0.5 ? '#1f9d6e' : '#8b8b95', fontWeight: 500}}>{done > 0.5 ? 'Approved' : 'Needs your approval'}</span>
      </div>
      <Crop src={SRC.approve} crop={crop} s={s} t0={t0 - 0.1} t1={t1 + 0.3} take0={t0 - 0.1 - 95.4} radius={10} />
    </div>
  );
};

// ---------------- Team view (real Databricks numbers) ----------------
const TEAM_SEGS = [
  {t0: 100.0, t1: 104.1, take0: 2.2, rate: 1},
  {t0: 104.1, t1: 106.15, take0: 6.3, rate: 8},
  {t0: 106.15, t1: 109.2, take0: 22.7, rate: 1},
];
const TeamLayer: React.FC = () => {
  const t = useT();
  if (t < 100.0 || t > 109.2) return null;
  const inn = eout(seg(t, 100.0, 100.95));
  const outp = eio(seg(t, 108.3, 109.1));
  const y = (1 - inn) * 1700 + outp * 1700;
  return (
    <div style={{...rectStyle({x: 0, y: 0, w: VW, h: VH}), transform: `translateY(${y}px)`, borderRadius: 28, overflow: 'hidden', background: '#f1f1f1', zIndex: 90}}>
      {TEAM_SEGS.map((s, i) => (
        <Crop key={i} src={SRC.team} crop={{x: 0, y: 0, w: VW, h: VH}} s={1} t0={s.t0} t1={s.t1} take0={s.take0} rate={s.rate} />
      ))}
      {/* the demo manager is Sam */}
      <div style={{position: 'absolute', left: 92, top: 1531, width: 120, height: 40, background: 'rgb(241,241,241)'}} />
      <div style={{position: 'absolute', left: 97, top: 1531, fontFamily: FONT, fontSize: 28, lineHeight: '40px', color: '#111'}}>Sam</div>
    </div>
  );
};
const SpeedChip: React.FC = () => {
  const t = useT();
  const a = seg(t, 104.1, 104.3) * (1 - seg(t, 105.95, 106.15));
  if (a <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute', left: 960, top: 70, transform: 'translateX(-50%)', opacity: a, background: 'rgba(20,20,22,.88)', color: '#fff',
        borderRadius: 999, padding: '10px 22px', fontFamily: FONT, fontSize: 24, fontWeight: 500, zIndex: 5,
      }}
    >
      8x speed
    </div>
  );
};

// ---------------- Priya's notification ----------------
const Notification: React.FC = () => {
  const t = useT();
  const t0 = 108.75;
  const t1 = 110.4;
  if (t < t0 || t > t1 + 0.5) return null;
  const inn = eout(seg(t, t0, t0 + 1.0));
  const o = seg(t, t0, t0 + 0.7) * (1 - seg(t, t1, t1 + 0.45));
  return (
    <div
      style={{
        position: 'absolute', right: 46, top: 46, width: 640, borderRadius: 28, background: 'rgba(255,255,255,.97)', padding: '22px 26px',
        display: 'flex', gap: 20, alignItems: 'center', fontFamily: FONT, opacity: o, transform: `translateY(${(1 - inn) * -34}px)`,
        boxShadow: '0 22px 56px rgba(0,0,0,.34), 0 0 0 1px rgba(0,0,0,.06)',
      }}
    >
      <Img src={staticFile('img/priya-sq.jpg')} style={{width: 84, height: 84, borderRadius: 42, objectFit: 'cover', boxShadow: `0 0 0 5px ${COLORS.priya}`}} />
      <div>
        <div style={{fontSize: 27, fontWeight: 650, color: '#16161a'}}>Priya Raman</div>
        <div style={{fontSize: 29, lineHeight: '38px', color: '#2a2a31', marginTop: 4}}>The launch post is now a styled web page.</div>
      </div>
    </div>
  );
};

// ---------------- root composition ----------------
export const Main: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = camAt(t);
  const worldOp = seg(t, 24.05, 25.0);
  const bgCover = seg(t, 52.7, 53.3) - seg(t, 88.45, 89.2);
  const endCover = seg(t, 110.45, 110.75);
  const show = t >= 24.0;
  return (
    <TCtx.Provider value={t}>
      <AbsoluteFill style={{background: BG, overflow: 'hidden'}}>
        <Audio src={staticFile('agents/C/mix.wav')} />
        {/* world: the app window, one continuous camera */}
        {show && (
          <div
            style={{
              position: 'absolute', left: 0, top: 0, width: VW, height: VH, transformOrigin: '0 0',
              transform: `translate(${W / 2 - cam.x * cam.k}px, ${H / 2 - cam.y * cam.k}px) scale(${cam.k})`,
            }}
          >
            <div style={{position: 'absolute', inset: 0, opacity: worldOp}}>
              <DesksVideo />
              <Covers />
            </div>
            {bgCover > 0 && <div style={{...rectStyle({x: 0, y: 0, w: VW, h: VH}), background: BG, borderRadius: 28, opacity: bgCover}} />}
            <InesDesktop />
            <CallBackdrop />
            <CallLayer />
            <MeetingLayer />
            <Messages />
            <TeamLayer />
            <CallFace />
            <MeetingFlights />
            {endCover > 0 && <div style={{...rectStyle({x: -400, y: -400, w: VW + 800, h: VH + 800}), background: BG, opacity: endCover, zIndex: 100}} />}
          </div>
        )}
        <MacScene />
        <PilePart />
        <LogLayer />
        <MenuLayer />
        <ApproveCard />
        <SpeedChip />
        <EndCard />
        <Notification />
        <Subtitles />
        <AbsoluteFill style={{background: '#000', opacity: (1 - seg(t, 0, 1.2)) * 1 + seg(t, 118.0, 120.0)}} />
      </AbsoluteFill>
    </TCtx.Provider>
  );
};
