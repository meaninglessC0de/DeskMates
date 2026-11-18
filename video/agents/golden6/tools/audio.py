#!/usr/bin/env python3
"""Builds the full soundtrack for Editor A's cut: voices, music (re-edited on bars), risers, sfx, ducking.
Writes out/mix.wav (48 kHz stereo float). Loudness mastering happens in mux.sh (ffmpeg loudnorm)."""
import json, subprocess, sys, os
import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.dirname(HERE)
V = os.path.abspath(os.path.join(A, '..', '..'))
MEDIA = os.path.join(V, 'public', 'media')
MIX = os.path.join(MEDIA, 'mixkit')
OUT = os.path.join(A, 'out')
TOTAL = 135.2
N = int(TOTAL * SR)
cues = json.load(open(os.path.join(A, 'cues.json')))


def load(path, ss=None, dur=None):
    cmd = ['ffmpeg', '-v', 'error']
    if ss is not None:
        cmd += ['-ss', str(ss)]
    if dur is not None:
        cmd += ['-t', str(dur)]
    cmd += ['-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def db(x):
    return 10 ** (x / 20)


def rms_db(x):
    m = np.abs(x).max(axis=1) > 0.01 * np.abs(x).max()
    r = np.sqrt((x[m] ** 2).mean()) if m.any() else 1e-6
    return 20 * np.log10(r + 1e-9)


def put(buf, x, t, gain=1.0):
    s = int(round(t * SR))
    if s < 0:
        x = x[-s:]
        s = 0
    e = min(N, s + len(x))
    if e > s:
        buf[s:e] += x[: e - s] * gain


def fade(x, fi=0.01, fo=0.02):
    x = x.copy()
    a = int(fi * SR)
    b = int(fo * SR)
    if a > 0:
        x[:a] *= np.linspace(0, 1, a)[:, None]
    if b > 0:
        x[-b:] *= np.linspace(1, 0, b)[:, None]
    return x


# ---------------------------------------------------------------- voices
voice = np.zeros((N, 2), dtype=np.float32)
speech = []  # (t0, t1) for ducking
TARGET = -21.0  # rms dB for every voice
for v in cues['vo']:
    x = load(os.path.join(MEDIA, v['id'] + '.wav'))
    x = fade(x, 0.01, 0.04)
    g = db(TARGET - rms_db(x)) * (db(2.5) if v['id'] == 's05' else 1.0)
    put(voice, x, v['t'], g)
    speech.append((v['t'], v['t'] + len(x) / SR, v['id']))
    print('vo', v['id'], round(rms_db(x), 1))
for c in cues['chars']:
    src = os.path.join(MEDIA, 'raw6', 'call.mp4' if c['src'] == 'call' else 'meeting.mp4')
    x = load(src, c['from'], c['to'] - c['from'])
    x = fade(x, 0.02, 0.06)
    g = db(TARGET - rms_db(x))
    put(voice, x, c['t'], g)
    speech.append((c['t'], c['t'] + len(x) / SR, c['who']))
    print('char', c['who'], round(rms_db(x), 1))

# ---------------------------------------------------------------- music
BAR = 60.0 / 123.0 * 4
m1 = load(os.path.join(MIX, 'music-motivating-mornings.mp3'))


def seg(t0, t1):
    return m1[int(t0 * SR): int(t1 * SR)]


DROP = 63.76
plan = [
    (0.73, 0.73 + 12.29),                 # light, ends inside the narrator's pause (12.4-13.4)
    (DROP - 6 * BAR, DROP + 20 * BAR),    # breakdown -> drop exactly at 24.0
    (DROP + 4 * BAR, DROP + 20 * BAR),
    (DROP + 4 * BAR, DROP + 20 * BAR),
    (104.73, 116.5),                      # the track's own outro under the end card
]
XFS = [0.8, 0.2, 0.2, 0.2]               # crossfade per join
pieces = []
for i, (a_, b_) in enumerate(plan):
    hl = XFS[i - 1] / 2 if i > 0 else 0
    hr = XFS[i] / 2 if i < len(plan) - 1 else 0
    pieces.append(seg(a_ - hl, b_ + hr))
music = pieces[0].copy()
for i, s_ in enumerate(pieces[1:], 1):
    xf = int(XFS[i - 1] * SR)
    ramp = np.linspace(0, 1, xf)[:, None]
    tail = music[-xf:] * np.cos(ramp * np.pi / 2)
    head = s_[:xf] * np.sin(ramp * np.pi / 2)
    music = np.concatenate([music[:-xf], tail + head, s_[xf:]], axis=0)
join = 0.0
for i, (a_, b_) in enumerate(plan):
    join += (b_ - a_)
    print('join', i, round(join, 2))
print('drop lands at', round((plan[0][1] - plan[0][0]) + 6 * BAR, 3), '(want 24.0)')
if len(music) < N:
    music = np.concatenate([music, np.zeros((N - len(music), 2), np.float32)])
music = music[:N]
# "light" first stretch is a touch quieter, then the breakdown stays quiet by itself; the drop is full level
t = np.arange(N) / SR
mg = np.where(t < 24.0, db(-12.0), db(-11.0))
mg = np.convolve(mg, np.ones(int(0.05 * SR)) / int(0.05 * SR), mode='same')
# gentle fade-in at the very start
mg *= np.clip(t / 1.2, 0, 1)

# ducking: -10 dB under every spoken line (attack 0.12 s, release 0.45 s)
duck = np.ones(N)
iv = sorted(speech)
merged = []
for a, b, who in iv:
    depth = db(-5) if who == 'n04' else db(-10)
    if merged and a - merged[-1][1] < 2.2 and merged[-1][2] == depth:
        merged[-1][1] = max(merged[-1][1], b)
    else:
        merged.append([a, b, depth])
for a, b, depth in merged:
    seg_ = duck[int((a - 0.12) * SR): int((b + 0.1) * SR)]
    np.minimum(seg_, depth, out=seg_)
# brief extra dip so the notification sounds read clearly
for tt in [106.2, 122.15]:
    seg_ = duck[int((tt - 0.05) * SR): int((tt + 0.6) * SR)]
    np.minimum(seg_, db(-4), out=seg_)
# smooth with asymmetric one-pole
sm = np.empty(N)
y = 1.0
ka = 1 - np.exp(-1 / (0.12 * SR))
kr = 1 - np.exp(-1 / (0.8 * SR))
for i in range(N):
    d = duck[i]
    y += (ka if d < y else kr) * (d - y)
    sm[i] = y
music = music * (mg * sm)[:, None].astype(np.float32)

# ---------------------------------------------------------------- synthesized bits
rng = np.random.default_rng(7)


def riser(t0, t1):
    n = int((t1 - t0) * SR)
    x = rng.standard_normal(n)
    pr = np.linspace(0, 1, n)
    a = 0.004 + 0.5 * pr ** 2.2  # one-pole lowpass opening up
    y = np.empty(n)
    s = 0.0
    for i in range(n):
        s += a[i] * (x[i] - s)
        y[i] = s
    y *= 1.0 / (np.abs(y).max() + 1e-9)
    # slow, smooth rise: starts from silence, no step
    env = (np.sin(np.clip(pr, 0, 1) * np.pi / 2) ** 1.8) * (0.45 + 0.55 * pr) * np.clip(pr / 0.06, 0, 1)
    # tonal bed rising a fifth
    f = 110 * (1.5 ** pr)
    ph = np.cumsum(2 * np.pi * f / SR)
    tone = 0.5 * np.sin(ph) + 0.25 * np.sin(2 * ph + 0.3)
    z = (0.8 * y + 0.35 * tone) * env
    z[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
    return np.stack([z, z], axis=1).astype(np.float32)


def boom(dur=1.8):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = 48 + 40 * np.exp(-tt * 9)
    z = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 2.2)
    return np.stack([z, z], axis=1).astype(np.float32)


def click(dur=0.05, freq=2400):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    z = (rng.standard_normal(n) * 0.5 + np.sin(2 * np.pi * freq * tt)) * np.exp(-tt * 140)
    return np.stack([z, z], axis=1).astype(np.float32)


def pop(dur=0.16):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = 620 * np.exp(-tt * 7) + 260
    z = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 22)
    return np.stack([z, z], axis=1).astype(np.float32)


def lowpass(x, fc):
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    s = np.zeros(x.shape[1])
    for i in range(len(x)):
        s += a * (x[i] - s)
        y[i] = s
    return y


sfx = np.zeros((N, 2), dtype=np.float32)
put(sfx, riser(15.0, 24.0), 15.0, db(-11))
put(sfx, boom(), 24.0, db(-9))
SW = os.path.join(MEDIA, 'swoosh')
PEAK = {'air-woosh': 0.72, 'cinematic-swoosh': 0.77, 'cinematic-wind': 0.39, 'fast-air-sweep': 0.31, 'fast-small-sweep': 0.31,
        'futuristic-pass': 0.78, 'long-sweeping-air': 0.81, 'quick-accent': 0.08, 'short-wind': 0.15, 'tech-slide': 0.14,
        'transition-windy': 1.03, 'whoosh-impact-presentation': 0.91}
swc = {}
def sw(name):
    if name not in swc:
        swc[name] = fade(load(os.path.join(SW, name + '.mp3')), 0.01, 0.12)
    return swc[name]
imp = sw('whoosh-impact-presentation').copy()
imp[: int(0.5 * SR)] *= (np.linspace(0, 1, int(0.5 * SR)) ** 2)[:, None]
put(sfx, imp, 24.0 - PEAK['whoosh-impact-presentation'], db(-7))
air = load(os.path.join(MIX, 'sfx-air-woosh.mp3'))
bub = load(os.path.join(MIX, 'sfx-bubble-notification.mp3'))
pos = load(os.path.join(MIX, 'sfx-positive-notification.mp3'))
bubL = lowpass(bub, 5000)
posL = lowpass(pos, 4500)
for c in cues['sfx']:
    k, tt = c['kind'], c['t']
    g = db(c.get('gain', 0))
    if k == 'click':
        put(sfx, click(), tt, db(-13))
    elif k == 'tick':
        put(sfx, click(0.04, 1800), tt, db(-9))
    elif k == 'pop':
        put(sfx, pop(), tt, db(-11))
    elif k.startswith('sw:'):
        name = k[3:]
        put(sfx, sw(name), tt - PEAK[name], g)
    elif k == 'bubble':
        x = fade(bubL, 0.03, 0.1)
        put(sfx, x, tt, db(-7))
    elif k == 'chime':
        x = fade(posL, 0.04, 0.12)
        put(sfx, x, tt, g)
    # impact handled above

mix = voice + music + sfx
peak = np.abs(mix).max()
print('peak', peak)
mix = mix / max(1.0, peak * 1.02)
os.makedirs(OUT, exist_ok=True)
import wave
with wave.open(os.path.join(OUT, 'mix.wav'), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes())
print('wrote', os.path.join(OUT, 'mix.wav'))
