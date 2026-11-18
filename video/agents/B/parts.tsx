import React from 'react';
import {Freeze, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {FPS, Seg, R, NAMES, Name, COLORS, FULL, clamp} from './geo';

export const FONT = `Figtree, -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;
export const MONO = `"SF Mono", Menlo, Monaco, Consolas, monospace`;
const FADE = 0.35;

const SegVid: React.FC<{src: string; seg: Seg; fadeIn: boolean}> = ({src, seg, fadeIn}) => {
  const f = useCurrentFrame();
  const o = fadeIn ? interpolate(f, [0, Math.round(FADE * FPS)], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  const vid = (
    <OffthreadVideo
      src={staticFile(src)}
      trimBefore={Math.round(seg.t0 * FPS)}
      playbackRate={seg.rate && seg.rate > 0 ? seg.rate : 1}
      muted
      style={{width: '100%', height: '100%', objectFit: 'fill', display: 'block'}}
    />
  );
  return (
    <div style={{position: 'absolute', inset: 0, opacity: o}}>
      {seg.rate === 0 ? <Freeze frame={0}>{vid}</Freeze> : vid}
    </div>
  );
};

// Plays a recording through a list of segments (retimes, slow-mo, near-identical dissolves).
export const TakeVideo: React.FC<{src: string; segs: Seg[]}> = ({src, segs}) => {
  const frame = useCurrentFrame();
  const v = frame / FPS;
  return (
    <>
      {segs.map((s, i) => {
        const next = segs[i + 1];
        const ext = next && next.jump ? FADE : 0;
        if (v < s.v0 - 0.25 || v > s.v1 + ext + 0.25) return null;
        const from = Math.round(s.v0 * FPS);
        const dur = Math.max(1, Math.round((s.v1 + ext - s.v0) * FPS));
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <SegVid src={src} seg={s} fadeIn={!!s.jump} />
          </Sequence>
        );
      })}
    </>
  );
};

// A window onto a recording: source rect (2560x1600 px) shown "cover" inside a w x h box.
export const VidBox: React.FC<{
  src: string;
  segs: Seg[];
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  w: number;
  h: number;
}> = ({src, segs, sx, sy, sw, sh, w, h}) => {
  const k = Math.max(w / sw, h / sh);
  const ox = (w - sw * k) / 2 - sx * k;
  const oy = (h - sh * k) / 2 - sy * k;
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: ox, top: oy, width: 2560 * k, height: 1600 * k}}>
        <TakeVideo src={src} segs={segs} />
      </div>
    </div>
  );
};

export const Pic: React.FC<{src: string; style?: React.CSSProperties}> = ({src, style}) => (
  <Img
    src={staticFile(src)}
    style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...style}}
  />
);

export const abs = (r: R, extra?: React.CSSProperties): React.CSSProperties => ({
  position: 'absolute',
  left: r.x,
  top: r.y,
  width: r.w,
  height: r.h,
  ...extra,
});

// Blend object: rect r, content a fading into b with q.
export const Obj: React.FC<{
  r: R;
  q: number;
  a: (w: number, h: number) => React.ReactNode;
  b: (w: number, h: number) => React.ReactNode;
  radius?: number;
  opacity?: number;
  shadow?: boolean;
}> = ({r, q, a, b, radius = 0, opacity = 1, shadow}) => (
  <div
    style={abs(r, {
      borderRadius: radius,
      overflow: 'hidden',
      opacity,
      boxShadow: shadow ? '0 18px 50px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.35)' : undefined,
    })}
  >
    <div style={{position: 'absolute', inset: 0}}>{a(r.w, r.h)}</div>
    <div style={{position: 'absolute', inset: 0, opacity: q}}>{b(r.w, r.h)}</div>
  </div>
);

// ---------- Mac furniture ----------
export const MenuBar: React.FC<{markPressed: number}> = ({markPressed}) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: 1920,
      height: 30,
      background: 'rgba(14,16,22,.82)',
      borderBottom: '1px solid rgba(255,255,255,.06)',
      fontFamily: FONT,
      fontSize: 14,
      color: 'rgba(255,255,255,.88)',
      zIndex: 900,
    }}
  >
    <div style={{position: 'absolute', left: 18, top: 7, width: 14, height: 16, borderRadius: 7, background: 'rgba(255,255,255,.85)'}} />
    <div style={{position: 'absolute', left: 52, top: 5, fontWeight: 700}}>Finder</div>
    {['File', 'Edit', 'View', 'Go', 'Window', 'Help'].map((t, i) => (
      <div key={t} style={{position: 'absolute', left: 118 + i * 58, top: 5, opacity: 0.85}}>
        {t}
      </div>
    ))}
    <div style={{position: 'absolute', right: 20, top: 5, opacity: 0.9, fontVariantNumeric: 'tabular-nums'}}>Sun 15 Nov  11:32</div>
    <div style={{position: 'absolute', right: 190, top: 8, width: 24, height: 14, border: '1.5px solid rgba(255,255,255,.8)', borderRadius: 4}}>
      <div style={{position: 'absolute', left: 2, top: 2, width: 15, height: 7, background: 'rgba(255,255,255,.8)', borderRadius: 2}} />
    </div>
    <div
      style={{
        position: 'absolute',
        left: 1700 - 15,
        top: 2,
        width: 30,
        height: 26,
        borderRadius: 6,
        background: `rgba(255,255,255,${0.22 * markPressed})`,
      }}
    >
      <Img src={staticFile('img/deskmates-mark.svg')} style={{position: 'absolute', left: 5, top: 2, width: 20, height: 20}} />
    </div>
  </div>
);

export const TrayMenu: React.FC<{o: number; hover: number; pressed: number}> = ({o, hover, pressed}) => (
  <div
    style={{
      position: 'absolute',
      left: 1566,
      top: 34,
      width: 290,
      padding: 6,
      borderRadius: 12,
      background: 'rgba(38,40,48,.94)',
      border: '1px solid rgba(255,255,255,.1)',
      boxShadow: '0 20px 50px rgba(0,0,0,.5)',
      opacity: o,
      transform: `translateY(${(1 - o) * -8}px) scale(${0.97 + 0.03 * o})`,
      transformOrigin: '80% 0',
      fontFamily: FONT,
      fontSize: 16,
      color: '#fff',
      zIndex: 950,
    }}
  >
    <div style={{padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.6, fontSize: 13}}>
      <Img src={staticFile('img/deskmates-mark.svg')} style={{width: 18, height: 18}} />
      Deskmates
    </div>
    <div
      style={{
        padding: '9px 12px',
        borderRadius: 7,
        background: hover > 0 ? (pressed > 0 ? '#4f76be' : '#5B8CFF') : 'transparent',
        fontWeight: 600,
      }}
    >
      Show desks
    </div>
    <div style={{padding: '9px 12px', opacity: 0.55}}>Open Deskmates</div>
    <div style={{height: 1, background: 'rgba(255,255,255,.1)', margin: '4px 6px'}} />
    <div style={{padding: '9px 12px', opacity: 0.55}}>Quit</div>
  </div>
);

export const Cursor: React.FC<{x: number; y: number; o: number; press: number}> = ({x, y, o, press}) => (
  <svg
    width="26"
    height="34"
    viewBox="0 0 26 34"
    style={{
      position: 'absolute',
      left: x - 2,
      top: y - 2,
      opacity: o,
      transform: `scale(${1 - 0.1 * press})`,
      transformOrigin: '2px 2px',
      zIndex: 990,
      filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))',
    }}
  >
    <path d="M2 2 L2 26 L8 20.5 L12 30 L16 28.3 L12 19 L20 19 Z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

// ---------- Pile windows ----------
export const Chrome: React.FC<{title: string; w: number; h: number; dark?: boolean; children: React.ReactNode}> = ({title, w, h, dark = true, children}) => (
  <div
    style={{
      width: w,
      height: h,
      borderRadius: 10,
      overflow: 'hidden',
      background: dark ? '#1c1e26' : '#fff',
      boxShadow: '0 24px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08)',
      fontFamily: FONT,
    }}
  >
    <div style={{height: 32, background: dark ? '#2a2d38' : '#e8e8ea', position: 'relative'}}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c, i) => (
        <div key={c} style={{position: 'absolute', left: 12 + i * 20, top: 10, width: 12, height: 12, borderRadius: 6, background: c}} />
      ))}
      <div style={{position: 'absolute', left: 0, right: 0, top: 7, textAlign: 'center', fontSize: 14, color: dark ? 'rgba(255,255,255,.7)' : '#444'}}>{title}</div>
    </div>
    <div style={{position: 'absolute', top: 32, left: 0, right: 0, bottom: 0}}>{children}</div>
  </div>
);

const CODE = [
  'def apply_discount(subtotal, code):',
  '    rate = DISCOUNTS.get(code)',
  '    if rate is None:',
  '        raise UnknownCode(code)',
  '    return round(subtotal * (1 - rate), 2)',
  '',
  'def checkout_total(cart, code=None):',
  '    subtotal = sum(i.price * i.qty for i in cart)',
  '    if code:',
  '        subtotal = apply_discount(subtotal, code)',
  '    tax = round(subtotal * TAX_RATE, 2)',
  '    return subtotal + tax',
  '',
  'def shipping(subtotal):',
  '    return 0 if subtotal >= 50 else 4.99',
];
const colorize = (l: string) => {
  const parts = l.split(/(\bdef\b|\breturn\b|\bif\b|\bis\b|\bNone\b|\braise\b|\bfor\b|\bin\b|\belse\b)/);
  return parts.map((p, i) =>
    /^(def|return|if|is|None|raise|for|in|else)$/.test(p) ? (
      <span key={i} style={{color: '#c792ea'}}>{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
};
export const CodeWin: React.FC<{w: number; h: number; t: number}> = ({w, h, t}) => (
  <Chrome title="checkout.py" w={w} h={h}>
    <div style={{height: 28, background: '#20222b', fontSize: 13, color: 'rgba(255,255,255,.6)', padding: '6px 14px'}}>checkout.py   pricing.py   server.py</div>
    <div style={{padding: '12px 16px', fontFamily: MONO, fontSize: 15, lineHeight: '23px', color: '#d6deeb'}}>
      {CODE.map((l, i) => (
        <div key={i} style={{display: 'flex', whiteSpace: 'pre'}}>
          <span style={{width: 34, color: 'rgba(255,255,255,.25)'}}>{i + 1}</span>
          {colorize(l)}
        </div>
      ))}
      <div style={{display: 'flex'}}>
        <span style={{width: 34, color: 'rgba(255,255,255,.25)'}}>16</span>
        <span style={{width: 9, height: 18, background: Math.floor(t * 2) % 2 ? 'transparent' : '#7fdbca'}} />
      </div>
    </div>
  </Chrome>
);

const ZSH = [
  '~/work/shop % python -m unittest',
  '..................................................',
  'Ran 50 tests in 0.002s',
  '',
  'OK',
  '~/work/shop % git status',
  'On branch fix/checkout-discount',
  'nothing to commit, working tree clean',
  '~/work/shop % git log --oneline -3',
  'a41c9e2 Apply discount before tax',
  '~/work/shop % ',
];
export const ZshWin: React.FC<{w: number; h: number; t: number}> = ({w, h, t}) => {
  let chars = Math.floor(t * 38);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < ZSH.length; i++) {
    const l = ZSH[i];
    const show = Math.min(l.length, Math.max(0, chars));
    chars -= l.length + 4;
    if (show <= 0 && i > 0) break;
    out.push(
      <div key={i} style={{whiteSpace: 'pre', color: l.startsWith('~') ? '#9ece6a' : '#cfd3e0'}}>
        {l.slice(0, show)}
      </div>,
    );
  }
  return (
    <Chrome title="zsh (4)" w={w} h={h}>
      <div style={{padding: '12px 14px', fontFamily: MONO, fontSize: 15, lineHeight: '22px', background: '#14161c', height: '100%'}}>
        {out}
        <span style={{display: 'inline-block', width: 8, height: 16, background: Math.floor(t * 2) % 2 ? 'transparent' : '#cfd3e0'}} />
      </div>
    </Chrome>
  );
};

const CHAT = [
  ['maya', 'Ran a command'],
  ['priya', 'Saved launch_post.md'],
  ['jonas', 'Read shopify.com'],
  ['ines', 'Opened file'],
] as const;
export const ChatWin: React.FC<{w: number; h: number; t: number}> = ({w, h, t}) => (
  <Chrome title="agent chat" w={w} h={h}>
    <div style={{padding: 14, display: 'flex', flexDirection: 'column', gap: 12}}>
      {CHAT.map(([n, m], i) => (
        <div key={n} style={{display: 'flex', alignItems: 'center', gap: 12, opacity: clamp(t * 1.5 - i * 0.5, 0, 1)}}>
          <div style={{width: 36, height: 36, borderRadius: 18, overflow: 'hidden', position: 'relative', outline: `2px solid ${COLORS[n]}`}}>
            <Img src={staticFile(`img/${n}-sq.jpg`)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
          </div>
          <div>
            <div style={{fontSize: 14, fontWeight: 700, color: '#fff'}}>{FULL[n]}</div>
            <div style={{fontSize: 14, color: 'rgba(255,255,255,.6)'}}>{m}</div>
          </div>
        </div>
      ))}
    </div>
  </Chrome>
);

const ACT: Record<Name, string[]> = {
  maya: ['Ran a command', 'Opened Xfce4 terminal', 'Ran a command', 'Ran a command'],
  priya: ['Saved launch_post.md', 'Priya asked something', 'Messaged Jonas', 'Saved launch_post.html'],
  jonas: ['Read shopify.com', 'Read wix.com', 'Read squarespace.com', 'Searched the web', 'Messaged Priya', 'Read bigcommerce.co.uk', 'Jonas replied'],
  ines: ['Opened file', 'Saved index.html', 'Opened file'],
};
export const LOG_LINES = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rows: {n: Name; text: string; ts: string}[] = [];
  let sec = 11 * 3600 + 24 * 60 + 8;
  for (let i = 0; i < 260; i++) {
    const n = NAMES[Math.floor(rnd() * 4)];
    const a = ACT[n];
    sec += 1 + Math.floor(rnd() * 3);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    rows.push({n, text: a[Math.floor(rnd() * a.length)], ts: `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`});
  }
  return rows;
})();
export const LogWin: React.FC<{w: number; h: number; t: number}> = ({w, h, t}) => (
  <Chrome title="agents.log" w={w} h={h}>
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: '#0f1115'}}>
      <div style={{position: 'absolute', left: 22, top: 14 - t * 520, fontFamily: MONO, fontSize: 21, lineHeight: '30px', whiteSpace: 'pre'}}>
        {LOG_LINES.map((r, i) => (
          <div key={i}>
            <span style={{color: 'rgba(255,255,255,.35)'}}>{r.ts}  </span>
            <span style={{color: COLORS[r.n]}}>[{r.n}]</span>
            <span style={{color: '#cfd3e0'}}> {r.text}</span>
          </div>
        ))}
      </div>
    </div>
  </Chrome>
);

// ---------- notification cards ----------
export const Note: React.FC<{
  r: R;
  name: Name;
  title: string;
  body: string;
  buttons?: boolean;
  approved?: number;
  o: number;
}> = ({r, name, title, body, buttons, approved = 0, o}) => (
  <div
    style={{
      ...abs(r),
      opacity: o,
      borderRadius: 20,
      background: 'rgba(250,250,251,.97)',
      boxShadow: '0 18px 50px rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.06)',
      fontFamily: FONT,
      color: '#16181d',
      overflow: 'hidden',
    }}
  >
    <div style={{position: 'absolute', left: 16, top: 16, width: 52, height: 52, borderRadius: 26, overflow: 'hidden', outline: `3px solid ${COLORS[name]}`}}>
      <Img src={staticFile(`img/${name}-sq.jpg`)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
    </div>
    <div style={{position: 'absolute', left: 84, top: 16, right: 16}}>
      <div style={{fontSize: 14, color: '#6b7280', fontWeight: 600}}>{title}</div>
      <div style={{fontSize: 19, fontWeight: 600, lineHeight: '25px', marginTop: 2}}>{body}</div>
    </div>
    {buttons && (
      <div style={{position: 'absolute', left: 84, bottom: 14, display: 'flex', gap: 10}}>
        <div style={{padding: '6px 18px', borderRadius: 9, background: '#eceef2', fontSize: 15, fontWeight: 600}}>Deny</div>
        <div
          style={{
            padding: '6px 18px',
            borderRadius: 9,
            background: approved > 0 ? '#2FCB8B' : '#16181d',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          Approve
        </div>
      </div>
    )}
  </div>
);

export const Bubble: React.FC<{x: number; y: number; name: Name; text: string; o: number; s: number}> = ({x, y, name, text, o, s}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: 380,
      transform: `translate(-50%,-50%) scale(${s})`,
      opacity: o,
      background: '#fff',
      borderRadius: 20,
      padding: '14px 18px 16px 70px',
      boxShadow: '0 16px 44px rgba(0,0,0,.4), 0 0 0 1px rgba(0,0,0,.05)',
      fontFamily: FONT,
      color: '#16181d',
    }}
  >
    <div style={{position: 'absolute', left: 14, top: 14, width: 44, height: 44, borderRadius: 22, overflow: 'hidden', outline: `3px solid ${COLORS[name]}`}}>
      <Img src={staticFile(`img/${name}-sq.jpg`)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
    </div>
    <div style={{fontSize: 14, fontWeight: 700, color: COLORS[name], filter: 'brightness(.85)'}}>{FULL[name]}</div>
    <div style={{fontSize: 18, lineHeight: '24px', marginTop: 2, fontWeight: 500}}>{text}</div>
  </div>
);
