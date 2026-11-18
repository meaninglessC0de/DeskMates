import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {
  FPS, W, H, S, WX, WY, WW, WH, WIN_BG, R, clamp, rng, lerp, lerpR, easeIO, easeOut, easeOut5, easeIn, NAMES, Name,
  COLORS, FULL, tileR, cardR, cardSrc, gridR, stripR, panelR, callFaceR, srcR, CROPS, cropLandR, tileCenter, TILE_SRC,
  TILE_W, TILE_H, PANEL_SRC, T, DESK_SEGS, CALL_SEGS, MEET_SEGS, APPROVE_SEGS, TEAM_SEGS, LINES, px, st,
} from './geo';
import {
  TakeVideo, VidBox, Pic, abs, Obj, MenuBar, TrayMenu, Cursor, CodeWin, ZshWin, ChatWin, LogWin, Note, Bubble, FONT,
} from './parts';
import {MARK} from './mark';

// ---------------- camera ----------------
type Key = {v: number; s: number; x: number; y: number; e?: (t: number) => number};
const KEYS: Key[] = [
  {v: 0, s: 1.07, x: 960, y: 540},
  {v: 6.5, s: 1.0, x: 960, y: 540, e: easeOut},
  {v: 13.2, s: 1.0, x: 960, y: 540},
  {v: 15.0, s: 1.3, x: 960, y: 550, e: easeIO},
  {v: 19.6, s: 1.3, x: 960, y: 550},
  {v: 23.4, s: 1.5, x: 1280, y: 360, e: easeIO},
  {v: 24.0, s: 1.5, x: 1280, y: 360},
  {v: 28.6, s: 1.0, x: 960, y: 540, e: easeIO},
  {v: 110.0, s: 1.0, x: 960, y: 540},
  {v: 112.9, s: 0.88, x: 960, y: 540, e: easeIO},
];
const TOUR_SCALE = 2.3;
const tourPos = (n: Name | 'ov') => {
  if (n === 'ov') return {s: 1, x: 960, y: 540};
  const c = tileCenter(n);
  return {s: TOUR_SCALE, x: c.x, y: c.y + 40};
};
const MOVES: {a: number; b: number; from: Name | 'ov'; to: Name | 'ov'}[] = [
  {a: 29.5, b: 30.5, from: 'ov', to: 'maya'},
  {a: 31.7, b: 32.45, from: 'maya', to: 'priya'},
  {a: 33.0, b: 33.75, from: 'priya', to: 'jonas'},
  {a: 34.9, b: 35.5, from: 'jonas', to: 'ines'},
  {a: 36.85, b: 38.4, from: 'ines', to: 'ov'},
];
const camera = (v: number) => {
  if (v >= 29.5 && v <= 38.4) {
    let cur = tourPos('ov');
    for (const m of MOVES) {
      if (v >= m.b) cur = tourPos(m.to);
      else if (v >= m.a) {
        const p = easeIO(rng(v, m.a, m.b));
        const A = tourPos(m.from), B = tourPos(m.to);
        const dip = m.from !== 'ov' && m.to !== 'ov' ? 0.55 * Math.sin(Math.PI * p) : 0;
        return {s: lerp(A.s, B.s, p) - dip, x: lerp(A.x, B.x, p), y: lerp(A.y, B.y, p)};
      }
    }
    return cur;
  }
  for (let i = 1; i < KEYS.length; i++) {
    if (v <= KEYS[i].v) {
      const a = KEYS[i - 1], b = KEYS[i];
      const p = (b.e ?? ((t: number) => t))(rng(v, a.v, b.v));
      return {s: lerp(a.s, b.s, p), x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p)};
    }
  }
  const l = KEYS[KEYS.length - 1];
  return {s: l.s, x: l.x, y: l.y};
};

// ---------------- pile ----------------
type PileDef = {
  id: string; kind: 'code' | 'zsh' | 'chat' | 'crop'; n?: Name; x: number; y: number; w: number; h: number; rot: number; t: number;
};
const crop = (n: Name, k: number) => ({w: CROPS[n].w * k, h: CROPS[n].h * k});
const PILE: PileDef[] = [
  {id: 'code', kind: 'code', x: 90, y: 92, w: 660, h: 410, rot: -2.2, t: 0.7},
  {id: 'jonas', kind: 'crop', n: 'jonas', x: 1040, y: 78, ...crop('jonas', 0.66), rot: 1.6, t: 1.5},
  {id: 'priya', kind: 'crop', n: 'priya', x: 560, y: 290, ...crop('priya', 0.66), rot: -1.2, t: 2.3},
  {id: 'maya', kind: 'crop', n: 'maya', x: 130, y: 560, ...crop('maya', 0.85), rot: 2.4, t: 3.0},
  {id: 'zsh', kind: 'zsh', x: 1290, y: 480, w: 540, h: 340, rot: -1.6, t: 3.7},
  {id: 'ines', kind: 'crop', n: 'ines', x: 830, y: 650, ...crop('ines', 0.66), rot: 1.1, t: 4.4},
  {id: 'chat', kind: 'chat', x: 1450, y: 790, w: 400, h: 240, rot: 2.0, t: 5.0},
];
const HERO_ORDER: Record<string, number> = {maya: 0, priya: 1, jonas: 2, ines: 3};

const CropWin: React.FC<{n: Name; w: number; h: number; radius?: number; shadow?: number}> = ({n, w, h, radius = 8, shadow = 1}) => {
  const c = CROPS[n];
  return (
    <div
      style={{
        position: 'relative', width: w, height: h, borderRadius: radius, overflow: 'hidden',
        boxShadow: `0 ${24 * shadow}px ${60 * shadow}px rgba(0,0,0,${0.5 * shadow}), 0 0 0 1px rgba(255,255,255,${0.1 * shadow})`,
      }}
    >
      <VidBox src={px('desks')} segs={DESK_SEGS} sx={c.x} sy={c.y} sw={c.w} sh={c.h} w={w} h={h} />
    </div>
  );
};

const shake = (v: number, i: number) => {
  const a = rng(v, 14.3, 15.4) * (v < 24 ? 1 : 0);
  const n1 = Math.sin(v * 41 + i * 7.3) + 0.6 * Math.sin(v * 67 + i * 3.1);
  const n2 = Math.sin(v * 37 + i * 5.7) + 0.6 * Math.sin(v * 59 + i * 1.9);
  const n3 = Math.sin(v * 45 + i * 2.3);
  return {dx: a * 0.75 * n1, dy: a * 0.75 * n2, dr: a * 0.07 * n3};
};

const Pile: React.FC<{v: number}> = ({v}) => {
  return (
    <>
      {PILE.map((d, i) => {
        const t = v - d.t;
        if (t < 0 || v > 27.2) return null;
        const pop = easeOut(rng(t, 0, 0.5));
        const sh = shake(v, i);
        let cx = d.x + d.w / 2 + sh.dx, cy = d.y + d.h / 2 + sh.dy;
        let w = d.w, h = d.h, rot = d.rot + sh.dr, o = pop, sc = 0.93 + 0.07 * pop, shadow = 1;
        const lt = Math.max(0, v - d.t);
        if (v >= 24.0) {
          if (d.kind === 'crop' && d.n) {
            const t0 = 24.15 + HERO_ORDER[d.n] * 0.16;
            const p = easeIO(rng(v, t0, t0 + 2.1));
            const dest = cropLandR(d.n);
            cx = lerp(d.x + d.w / 2, dest.x + dest.w / 2, p);
            cy = lerp(d.y + d.h / 2, dest.y + dest.h / 2, p) - 46 * Math.sin(Math.PI * p);
            w = lerp(d.w, dest.w, p); h = lerp(d.h, dest.h, p);
            rot = lerp(d.rot, 0, p); sc = 1; shadow = 1 - p * 0.9;
            o = 1 - rng(v, t0 + 2.1 + 0.1, t0 + 2.1 + 0.4);
          } else {
            const p = easeIn(rng(v, 24.0, 25.3));
            cx = lerp(cx, 960, p * 0.8); cy = lerp(cy, 560, p * 0.8);
            sc = 1 - 0.72 * p; o = 1 - p;
          }
        }
        if (o <= 0.001) return null;
        return (
          <div
            key={d.id}
            style={{
              position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, opacity: o,
              transform: `rotate(${rot}deg) scale(${sc})`, zIndex: 21 + i,
            }}
          >
            {d.kind === 'crop' && d.n && <CropWin n={d.n} w={w} h={h} shadow={shadow} />}
            {d.kind === 'code' && <CodeWin w={w} h={h} t={lt} />}
            {d.kind === 'zsh' && <ZshWin w={w} h={h} t={lt} />}
            {d.kind === 'chat' && <ChatWin w={w} h={h} t={lt} />}
          </div>
        );
      })}
    </>
  );
};

// ---------------- helper opacities ----------------
const cardRel = (n: Name): R => {
  const r = cardR(n);
  return {x: r.x - WX, y: r.y - WY, w: r.w, h: r.h};
};
const rel = (r: R): R => ({x: r.x - WX, y: r.y - WY, w: r.w, h: r.h});
const FULLR: R = {x: WX, y: WY, w: WW, h: WH};

const Face: React.FC<{r: R; a: string; b: React.ReactNode | string; q: number; bIsPic?: boolean; radius?: number}> = ({r, a, b, q, bIsPic = true, radius = 0}) => (
  <Obj
    r={r}
    q={q}
    radius={radius}
    a={() => <Pic src={a} />}
    b={() => (typeof b === 'string' ? <Pic src={b} /> : (b as React.ReactNode))}
  />
);

const TileObj: React.FC<{n: Name; r: R; q: number; bNode: (w: number, h: number) => React.ReactNode}> = ({n, r, q, bNode}) => {
  const [tx, ty] = TILE_SRC[n];
  const c = cardSrc(n);
  return (
    <Obj
      r={r}
      q={q}
      a={(w, h) => {
        const k = w / TILE_W;
        return (
          <>
            <VidBox src={px('desks')} segs={DESK_SEGS} sx={tx} sy={ty} sw={TILE_W} sh={TILE_H} w={w} h={h} />
            <div style={{position: 'absolute', left: (c.x - tx) * k, top: (c.y - ty) * k, width: c.w * k, height: c.h * k, overflow: 'hidden'}}>
              <Pic src={st(`nocard-${n}`)} />
            </div>
          </>
        );
      }}
      b={bNode}
    />
  );
};

// ---------------- main ----------------
export const Main: React.FC = () => {
  const frame = useCurrentFrame();
  const v = frame / FPS;
  const cam = camera(v);

  // scene progress
  const callL = v < T.callOut[0] ? rng(v, T.callIn[0], T.callIn[1]) : 1 - rng(v, T.callOut[0], T.callOut[1]);
  const callActive = v >= T.callIn[0] - 0.01 && v <= T.callOut[1] + 0.01;
  const meetEntry = rng(v, T.meetIn[0], T.meetIn[1]);
  const meetExit = rng(v, T.meetOut[0], T.meetOut[1]);
  const inMeetExit = v >= T.meetOut[0];
  const meetP = v < 70 ? meetEntry : 1 - meetExit;
  const meetActive = v >= T.meetIn[0] - 0.01 && v <= T.meetOut[1] + 0.01;

  const appVis = v >= 23.9;
  const appO = easeOut(rng(v, 24.0, 25.4));
  const appScale = lerp(0.965, 1, easeOut(rng(v, 24.0, 25.8)));

  const coverO = Math.max(callActive ? rng(callL, 0.05, 0.55) : 0, meetActive ? rng(meetP, 0, 0.5) : 0);
  const callO = callActive ? rng(callL, 0.7, 1) : 0;
  const meetO = meetActive ? rng(meetP, 0.5, 1) : 0;
  const patchO = (callActive && callL > 0.001) || (meetActive && meetP > 0.001 && meetP < 0.999999) || (meetActive && meetP >= 0.999999 && false) ? 1 : 0;
  const patchMaya = (callActive && callL > 0.001) || (meetActive && meetP > 0.001 && meetP < 1) ? 1 : 0;

  // objects
  const callE = easeIO(callL);
  const showCallObj = callActive && callL > 0.001 && callL < 0.9999;
  const meetEntryActive = v >= T.meetIn[0] && v < T.meetIn[1];
  const meetExitActive = v >= T.meetOut[0] && v < T.meetOut[1];

  // cursor / tray
  const cursorPath = (() => {
    const pts: [number, number, number][] = [[19.0, 780, 700], [22.2, 1700, 40], [22.9, 1700, 40], [23.6, 1652, 70], [24.3, 1652, 70]];
    for (let i = 1; i < pts.length; i++) {
      if (v <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i];
        const p = easeIO(rng(v, a[0], b[0]));
        return {x: lerp(a[1], b[1], p), y: lerp(a[2], b[2], p)};
      }
    }
    return {x: 1652, y: 70};
  })();
  const markPressed = v >= 22.5 && v < 24.2 ? 1 : 0;
  const trayO = easeOut(rng(v, 22.7, 23.05)) * (1 - rng(v, 24.1, 24.45));
  const cursorO = rng(v, 18.8, 19.4) * (1 - rng(v, 24.3, 24.8));

  // log window
  const logO = easeOut(rng(v, T.logIn, T.logIn + 0.6)) * (1 - easeIO(rng(v, T.logOut, T.logOut + 1.2)));
  const logS = lerp(0.9, 1, easeOut(rng(v, T.logIn, T.logIn + 0.7))) + 0.05 * easeIO(rng(v, T.logOut, T.logOut + 1.2));
  const dim = 0.5 * easeIO(rng(v, T.logIn, T.logIn + 0.8)) * (1 - easeIO(rng(v, T.logOut, T.logOut + 1.2)));

  // approve / team windows
  const noteR: R = {x: 1440, y: 46, w: 440, h: 120};
  const noteIn = easeOut5(rng(v, T.approveNote, T.approveNote + 1.0));
  const aOpen = easeIO(rng(v, T.approveOpen[0], T.approveOpen[1]));
  const aClose = easeIO(rng(v, T.approveClose[0], T.approveClose[1]));
  const smallR: R = {x: 1880 - 440, y: 50, w: 440, h: 275};
  let approveR = lerpR(smallR, FULLR, aOpen);
  approveR = lerpR(approveR, tileR('maya'), aClose);
  const approveO = (v >= T.approveOpen[0] ? rng(aOpen, 0, 0.25) : 0) * (1 - rng(aClose, 0.6, 1));
  const approveVis = v >= T.approveOpen[0] - 0.01 && v <= T.approveClose[1] + 0.01;
  const noteO = noteIn * (1 - rng(aOpen, 0, 0.35)) * (v < T.approveOpen[1] ? 1 : 0);
  const noteY = lerp(-150, 0, noteIn);
  const approved = v >= 93.5 ? 1 : 0;

  const teamUp = easeOut(rng(v, T.teamUp[0], T.teamUp[1]));
  const teamDown = easeIn(rng(v, T.teamDown[0], T.teamDown[1]));
  const teamVis = v >= T.teamUp[0] - 0.01 && v <= T.teamDown[1] + 0.01;
  const teamY = (1 - teamUp) * 1100 + teamDown * 1100;

  // priya note
  const pIn = easeOut5(rng(v, T.priyaNote[0], T.priyaNote[0] + 1.2));
  const pOut = easeIO(rng(v, T.priyaNote[1], T.priyaNote[1] + 0.7));
  const priyaVis = v >= T.priyaNote[0] - 0.01 && v <= T.priyaNote[1] + 0.8;
  const priyaY = lerp(-130, 0, pIn) + lerp(0, -130, pOut);

  // bubbles
  const bubble = (t0: number, t1: number, from: Name, to: Name, text: string) => {
    if (v < t0 - 0.3 || v > t1 + 0.5) return null;
    const p = easeIO(rng(v, t0, t1));
    const A = cardR(from), B = cardR(to);
    const ax = A.x + A.w / 2, ay = A.y + A.h / 2, bx = B.x + B.w / 2, by = B.y + B.h / 2;
    const nx = -(by - ay), ny = bx - ax, len = Math.hypot(nx, ny);
    const bow = Math.sin(Math.PI * p) * 70;
    const x = lerp(ax, bx, p) + (nx / len) * bow;
    const y = lerp(ay, by, p) + (ny / len) * bow;
    const o = easeOut(rng(v, t0 - 0.3, t0 + 0.3)) * (1 - easeIO(rng(v, t1 - 0.1, t1 + 0.45)));
    const s = lerp(0.8, 1, easeOut(rng(v, t0 - 0.3, t0 + 0.4))) * lerp(1, 0.9, rng(v, t1 - 0.2, t1 + 0.4));
    return <Bubble x={x} y={y} name={from} text={text} o={o} s={s} />;
  };

  // end card
  const endO = easeIO(rng(v, T.endCard[0], T.endCard[1]));
  const blackO = (1 - easeOut(rng(v, 0, 1.4))) + rng(v, 118.4, 120);

  // subtitles
  const sub = LINES.find((l) => v >= l.v - 0.05 && v <= l.v + l.d + 0.25 && l.id !== 'n11');

  const caption = (
    <div style={{position: 'absolute', left: 4, top: 822, width: WW - 8, height: 52, background: WIN_BG}} />
  );

  return (
    <AbsoluteFill style={{background: '#07080b', fontFamily: FONT, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0',
          transform: `translate(${960 - cam.s * cam.x}px, ${540 - cam.s * cam.y}px) scale(${cam.s})`,
        }}
      >
        {/* wallpaper */}
        <div
          style={{
            position: 'absolute', left: -700, top: -500, width: W + 1400, height: H + 1000,
            background: 'radial-gradient(1400px 900px at 30% 30%, #232a3d 0%, #151925 55%, #0d0f16 100%)',
          }}
        />
        <MenuBar markPressed={markPressed} />

        {/* pile */}
        <Pile v={v} />
        {dim > 0.001 && <div style={{position: 'absolute', left: -700, top: -500, width: W + 1400, height: H + 1000, background: `rgba(6,7,10,${dim})`, zIndex: 60}} />}
        {logO > 0.001 && (
          <div style={{position: 'absolute', left: 380, top: 190, width: 1160, height: 700, opacity: logO, transform: `scale(${logS})`, zIndex: 70}}>
            <LogWin w={1160} h={700} t={Math.max(0, v - T.logIn)} />
          </div>
        )}

        {/* Deskmates window */}
        {appVis && (
          <div
            style={{
              position: 'absolute', left: WX, top: WY, width: WW, height: WH, borderRadius: 14, overflow: 'hidden',
              background: WIN_BG, opacity: appO, transform: `scale(${appScale})`, transformOrigin: '50% 50%',
              boxShadow: '0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)', zIndex: 20,
            }}
          >
            <TakeVideo src={px('desks')} segs={DESK_SEGS} />
            {patchMaya > 0 &&
              NAMES.map((n) => {
                if (!(meetActive && meetP > 0.001 && meetP < 1) && n !== 'maya') return null;
                const r = cardRel(n);
                return (
                  <div key={n} style={abs(r, {overflow: 'hidden'})}>
                    <Pic src={st(`nocard-${n}`)} />
                  </div>
                );
              })}
            {coverO > 0.001 && <div style={{position: 'absolute', inset: 0, background: WIN_BG, opacity: coverO}} />}
            {callO > 0.001 && (
              <div style={{position: 'absolute', inset: 0, opacity: callO}}>
                <TakeVideo src={px('call')} segs={CALL_SEGS} />
                {caption}
              </div>
            )}
            {meetO > 0.001 && (
              <div style={{position: 'absolute', inset: 0, opacity: meetO}}>
                <TakeVideo src={px('meeting')} segs={MEET_SEGS} />
                {caption}
                {meetEntryActive && NAMES.map((n) => <div key={n} style={abs(rel(gridR(n)), {background: WIN_BG})} />)}
                {inMeetExit && meetExit > 0.001 && (
                  <>
                    {NAMES.map((n) => (
                      <div key={n} style={abs(rel(stripR(n)), {background: WIN_BG})} />
                    ))}
                    <div style={abs(rel(panelR()), {background: WIN_BG})} />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* call morph objects */}
        {showCallObj && (
          <div style={{position: 'absolute', left: 0, top: 0, zIndex: 30}}>
            <TileObj
              n="maya"
              r={lerpR(tileR('maya'), panelR(), callE)}
              q={rng(callE, 0.45, 0.9)}
              bNode={(w, h) => <VidBox src={px('call')} segs={CALL_SEGS} sx={PANEL_SRC.x} sy={PANEL_SRC.y} sw={PANEL_SRC.w} sh={PANEL_SRC.h} w={w} h={h} />}
            />
            {(() => {
              const fr = callFaceR();
              const q = rng(callE, 0.4, 0.6);
              const rr = lerpR(cardR('maya'), fr, callE);
              return (
                <Obj
                  r={rr}
                  q={q}
                  radius={lerp(0, 14, q)}
                  a={() => <Pic src={st('card-maya')} />}
                  b={(w, h) => <VidBox src={px('call')} segs={CALL_SEGS} sx={1920} sy={164} sw={590} sh={1026} w={w} h={h} />}
                />
              );
            })()}
          </div>
        )}

        {/* meeting entry: faces fly to the grid */}
        {meetEntryActive && (
          <div style={{position: 'absolute', left: 0, top: 0, zIndex: 30}}>
            {NAMES.map((n, i) => {
              const u = easeIO(rng(meetEntry, i * 0.07, i * 0.07 + 0.74));
              const rr = lerpR(cardR(n), gridR(n), u);
              rr.y -= 38 * Math.sin(Math.PI * u);
              const q = rng(u, 0.4, 0.6);
              return <Face key={n} r={rr} a={st(`card-${n}`)} b={st(`meet-${n}`)} q={q} radius={10 * q} />;
            })}
          </div>
        )}

        {/* meeting exit: faces and Ines's desktop fly back */}
        {meetExitActive && (
          <div style={{position: 'absolute', left: 0, top: 0, zIndex: 30}}>
            {(() => {
              const uu = easeIO(rng(meetExit, 0, 0.85));
              const [tx, ty] = TILE_SRC.ines;
              const c = cardSrc('ines');
              return (
                <Obj
                  r={lerpR(panelR(), tileR('ines'), uu)}
                  q={rng(uu, 0.35, 0.85)}
                  a={(w, h) => <VidBox src={px('meeting')} segs={MEET_SEGS} sx={PANEL_SRC.x} sy={PANEL_SRC.y} sw={PANEL_SRC.w} sh={PANEL_SRC.h} w={w} h={h} />}
                  b={(w, h) => {
                    const k = w / TILE_W;
                    return (
                      <>
                        <VidBox src={px('desks')} segs={DESK_SEGS} sx={tx} sy={ty} sw={TILE_W} sh={TILE_H} w={w} h={h} />
                        <div style={{position: 'absolute', left: (c.x - tx) * k, top: (c.y - ty) * k, width: c.w * k, height: c.h * k, overflow: 'hidden'}}>
                          <Pic src={st('nocard-ines')} />
                        </div>
                      </>
                    );
                  }}
                />
              );
            })()}
          </div>
        )}

        {meetExitActive && (
          <div style={{position: 'absolute', left: 0, top: 0, zIndex: 31}}>
            {NAMES.map((n, i) => {
              const u = easeIO(rng(meetExit, i * 0.07, i * 0.07 + 0.74));
              const rr = lerpR(stripR(n), cardR(n), u);
              rr.y -= 38 * Math.sin(Math.PI * u);
              const q = rng(u, 0.4, 0.6);
              return <Face key={n} r={rr} a={st(`strip-${n}`)} b={st(`card-${n}`)} q={q} radius={10 * (1 - q)} />;
            })}
          </div>
        )}

        {/* teammate messages */}
        <div style={{position: 'absolute', left: 0, top: 0, zIndex: 40}}>
          {bubble(86.3, 88.0, 'priya', 'jonas', 'Could you send me one line on how competitors handle discount vs tax order?')}
          {bubble(88.5, 90.2, 'jonas', 'priya', "Shopify's help docs say discounts come off the subtotal before tax, so we match them.")}
        </div>

        {/* approve window (real card, real click) */}
        {approveVis && (
          <div
            style={abs(approveR, {
              borderRadius: lerp(20, 14, aOpen), overflow: 'hidden', opacity: approveO, zIndex: 45,
              boxShadow: '0 30px 80px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.08)', background: '#fff',
            })}
          >
            <TakeVideo src={px('approve')} segs={APPROVE_SEGS} />
          </div>
        )}

        {/* team view slides up */}
        {teamVis && (
          <div
            style={abs(FULLR, {
              borderRadius: 14, overflow: 'hidden', zIndex: 46, transform: `translateY(${teamY}px)`, background: '#fff',
              boxShadow: '0 -20px 80px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.08)',
            })}
          >
            <TakeVideo src={px('team')} segs={TEAM_SEGS} />
          </div>
        )}

        {/* cursor and tray menu */}
        {trayO > 0.001 && <TrayMenu o={trayO} hover={v >= 23.4 ? 1 : 0} pressed={v >= 23.95 ? 1 : 0} />}
        {cursorO > 0.001 && <Cursor x={cursorPath.x} y={cursorPath.y} o={cursorO} press={v > 22.55 && v < 22.75 || v > 23.95 && v < 24.15 ? 1 : 0} />}
      </div>

      {/* screen-space notifications */}
      {v >= T.approveNote && v < T.approveOpen[1] && noteO > 0.001 && (
        <div style={{position: 'absolute', left: 0, top: 0, transform: `translateY(${noteY}px)`, zIndex: 60}}>
          <Note r={noteR} name="maya" title="Maya Chen" body="Push fix/checkout-discount" buttons approved={approved} o={noteO} />
        </div>
      )}
      {priyaVis && (
        <div style={{position: 'absolute', left: 0, top: 0, transform: `translateY(${priyaY}px)`, zIndex: 60}}>
          <Note r={{x: 1440, y: 46, w: 440, h: 100}} name="priya" title="Priya Raman" body="The launch post is now a styled web page." o={Math.min(1, pIn * 1.4) * (1 - pOut)} />
        </div>
      )}

      {/* end card */}
      {endO > 0.001 && <EndCard v={v} o={endO} />}

      {/* subtitles */}
      {sub && (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 16, display: 'flex', justifyContent: 'center', zIndex: 80}}>
          <div
            style={{
              maxWidth: 1760, padding: '8px 24px 10px', borderRadius: 14, background: 'rgba(8,9,12,.8)', color: '#fff', fontSize: 31,
              fontWeight: 500, lineHeight: '40px', textAlign: 'center', letterSpacing: 0.1,
              opacity: easeOut(rng(v, sub.v - 0.05, sub.v + 0.12)) * (1 - rng(v, sub.v + sub.d + 0.05, sub.v + sub.d + 0.25)),
            }}
          >
            {sub.who !== 'narrator' && (
              <span style={{color: COLORS[sub.who], fontWeight: 700, marginRight: 12}}>{sub.who === 'sam' ? 'Sam' : sub.who[0].toUpperCase() + sub.who.slice(1)}</span>
            )}
            {sub.text}
          </div>
        </div>
      )}

      {blackO > 0.001 && <div style={{position: 'absolute', inset: 0, background: '#000', opacity: clamp(blackO), zIndex: 100}} />}
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{v: number; o: number}> = ({v, o}) => {
  const tiles = ['blue', 'orange', 'pink', 'green'];
  const tint = [COLORS.maya, COLORS.priya, COLORS.jonas, COLORS.ines];
  return (
    <div style={{position: 'absolute', inset: 0, background: '#0b0c10', opacity: o, zIndex: 70, color: '#fff', fontFamily: FONT}}>
      <svg viewBox="0 0 213 213" style={{position: 'absolute', left: 960 - 95, top: 150, width: 190, height: 190}}>
        {tiles.map((t, i) => {
          const p = easeOut5(rng(v, 112.5 + i * 0.14, 113.3 + i * 0.14));
          const cx = i % 2 ? 163 : 50, cy = i > 1 ? 163 : 50;
          return (
            <g key={t} style={{opacity: p, transform: `translate(${(1 - p) * (i % 2 ? 30 : -30)}px, ${(1 - p) * (i > 1 ? 30 : -30)}px) scale(${0.7 + 0.3 * p})`, transformOrigin: `${cx}px ${cy}px`}}
               dangerouslySetInnerHTML={{__html: MARK[t]}} />
          );
        })}
      </svg>
      <div style={{position: 'absolute', left: 0, right: 0, top: 372, textAlign: 'center', fontSize: 76, fontWeight: 700, letterSpacing: -1, opacity: easeOut(rng(v, 113.1, 113.9)), transform: `translateY(${(1 - easeOut(rng(v, 113.1, 113.9))) * 14}px)`}}>
        Deskmates
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 480, textAlign: 'center', fontSize: 34, color: '#c9ccd6', fontWeight: 500, opacity: easeOut(rng(v, 113.6, 114.5)), transform: `translateY(${(1 - easeOut(rng(v, 113.6, 114.5))) * 12}px)`}}>
        Your AI team, with a desk, a face, and a seat at the table.
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 600, display: 'flex', justifyContent: 'center', gap: 36}}>
        {NAMES.map((n, i) => {
          const p = easeOut(rng(v, 114.4 + i * 0.15, 115.2 + i * 0.15));
          return (
            <div key={n} style={{opacity: p, transform: `translateY(${(1 - p) * 16}px)`, textAlign: 'center'}}>
              <div style={{width: 116, height: 116, borderRadius: 58, overflow: 'hidden', position: 'relative', outline: `5px solid ${tint[i]}`, outlineOffset: 3}}>
                <Img src={staticFile(`img/${n}-sq.jpg`)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
              </div>
              <div style={{marginTop: 14, fontSize: 19, color: '#aeb2bf', fontWeight: 600}}>{FULL[n].split(' ')[0]}</div>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 900, textAlign: 'center', fontSize: 20, color: '#7b7f8c', opacity: easeOut(rng(v, 116.0, 117.0)), letterSpacing: 0.3}}>
        Built with Cua · Claude Agent SDK · Synthesia · Databricks · Astryx
      </div>
    </div>
  );
};
