import React from 'react';
import {COLORS, FONT, Who, W, clamp, seg} from './lib';
import {useT} from './ui';

type Line = {t0: number; t1: number; who: Who | 'sam' | null; text: string};
export const LINES: Line[] = [
  {t0: 0.8, t1: 4.95, who: null, text: "This is Sam's Mac. Sam runs a startup with four AI agents."},
  {t0: 6.0, t1: 9.4, who: null, text: 'A coder, a marketer, a researcher and a designer.'},
  {t0: 9.5, t1: 12.4, who: null, text: 'All working at once, in one pile of windows.'},
  {t0: 13.4, t1: 17.35, who: null, text: "Who's doing what? Like every founder, Sam scrolls through logs."},
  {t0: 20.2, t1: 22.95, who: null, text: 'Now watch what happens when Sam opens Deskmates.'},
  {t0: 28.3, t1: 29.95, who: null, text: 'Every agent gets its own computer.'},
  {t0: 30.1, t1: 33.2, who: null, text: "Maya's code goes to her desk. Priya's post to hers."},
  {t0: 33.3, t1: 36.9, who: null, text: "Jonas's research to his. Ines's designs to hers."},
  {t0: 39.0, t1: 40.75, who: null, text: 'And every agent gets a face.'},
  {t0: 43.6, t1: 45.5, who: 'maya', text: 'Hi Sam, Maya here.'},
  {t0: 45.7, t1: 49.45, who: 'maya', text: "I'm on the checkout discount bug, and the push is waiting on your go-ahead."},
  {t0: 49.8, t1: 52.7, who: null, text: 'So Sam can talk to the team, face to face.'},
  {t0: 52.9, t1: 54.9, who: 'sam', text: 'Okay team, standup!'},
  {t0: 56.0, t1: 57.95, who: 'sam', text: 'Maya, show me the fix?'},
  {t0: 59.0, t1: 61.5, who: 'maya', text: 'Morning, all. Quick update from me.'},
  {t0: 61.55, t1: 66.5, who: 'maya', text: 'The checkout discount bug is found and fixed, tests are run, and the commit is on fix/checkout-discount.'},
  {t0: 68.2, t1: 69.35, who: 'sam', text: 'Jonas?'},
  {t0: 72.3, t1: 76.35, who: 'jonas', text: 'The pricing chart is at work/pricing.html'},
  {t0: 77.0, t1: 79.3, who: 'sam', text: 'Ines, what about onboarding?'},
  {t0: 80.7, t1: 84.1, who: 'ines', text: 'Both versions now have two screens each.'},
  {t0: 85.0, t1: 87.0, who: 'sam', text: 'Version B. Ship it.'},
  {t0: 89.6, t1: 92.15, who: null, text: 'Then they get back to work, and they help each other.'},
  {t0: 95.6, t1: 97.85, who: null, text: 'Big steps still come to Sam first.'},
  {t0: 98.2, t1: 99.3, who: 'sam', text: 'Approve.'},
  {t0: 100.0, t1: 103.15, who: null, text: 'Every hour, task and dollar is on the record in Databricks,'},
  {t0: 103.2, t1: 104.65, who: null, text: 'so Sam can just ask.'},
];
const SAM = '#C9D2E3';
const NAMES: Record<string, string> = {maya: 'Maya', priya: 'Priya', jonas: 'Jonas', ines: 'Ines', sam: 'Sam'};

export const Subtitles: React.FC = () => {
  const t = useT();
  const L = LINES.find((l) => t >= l.t0 - 0.05 && t < l.t1 + 0.15);
  if (!L) return null;
  const a = seg(t, L.t0 - 0.05, L.t0 + 0.12) * (1 - seg(t, L.t1, L.t1 + 0.15));
  const col = L.who ? (L.who === 'sam' ? SAM : COLORS[L.who]) : '#fff';
  return (
    <div style={{position: 'absolute', left: 0, width: W, bottom: 22, display: 'flex', justifyContent: 'center', opacity: a, zIndex: 999, pointerEvents: 'none'}}>
      <div
        style={{
          maxWidth: 1640, padding: '10px 26px 12px', borderRadius: 16, background: 'rgba(12,12,14,.72)', color: '#fff',
          fontFamily: FONT, fontSize: 35, lineHeight: '46px', fontWeight: 500, textAlign: 'center',
        }}
      >
        {L.who && <b style={{color: col, fontWeight: 700, marginRight: 14}}>{NAMES[L.who]}</b>}
        {L.text}
      </div>
    </div>
  );
};
