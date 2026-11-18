#!/usr/bin/env python3
"""Edit B soundtrack: voices, ducked music (re-edited on the beat), riser, whooshes, soft notifications."""
import subprocess, sys, json, os
import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.abspath(os.path.join(HERE, '../../..'))
PUB = os.path.join(VIDEO, 'public/media')
OUT = os.path.join(HERE, '../out')
DUR = 120.0
N = int(DUR * SR)

def dec(path, ss=None, t=None):
    cmd = ['ffmpeg', '-v', 'error']
    if ss is not None: cmd += ['-ss', str(ss)]
    if t is not None: cmd += ['-t', str(t)]
    cmd += ['-i', path, '-ar', str(SR), '-ac', '2', '-f', 'f32le', '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()

def db(x): return 10 ** (x / 20)

def lowpass(x, fc):
    # one-pole x2 lowpass
    a = np.exp(-2 * np.pi * fc / SR)
    for _ in range(2):
        y = np.zeros_like(x)
        s = np.zeros(x.shape[1], dtype=np.float64)
        for i in range(len(x)):
            s = (1 - a) * x[i] + a * s
            y[i] = s
        x = y.astype(np.float32)
    return x

def lowpass_fast(x, fc):
    # FFT-based brickwall-ish smooth lowpass
    n = len(x)
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = 1 / (1 + (f / fc) ** 4)
    return np.fft.irfft(X * g[:, None], n=n, axis=0).astype(np.float32)

def place(buf, clip, v, gain=1.0, fin=0.0, fout=0.0):
    i0 = int(round(v * SR))
    c = clip * gain
    n = len(c)
    if fin > 0:
        k = min(n, int(fin * SR)); c[:k] *= np.sin(np.linspace(0, np.pi / 2, k))[:, None]
    if fout > 0:
        k = min(n, int(fout * SR)); c[n - k:] *= np.cos(np.linspace(0, np.pi / 2, k))[:, None]
    a = max(0, i0); b = min(N, i0 + n)
    if b > a: buf[a:b] += c[a - i0:b - i0]

def rms_active(x):
    m = np.abs(x).max(axis=1)
    sel = x[m > 0.02]
    return np.sqrt((sel ** 2).mean()) if len(sel) else 1e-4

# ---------------- voices ----------------
LINES = json.load(open(os.path.join(HERE, 'lines.json')))
voice = np.zeros((N, 2), dtype=np.float32)
duck_iv = []
TARGET = db(-21)
for l in LINES:
    if l['kind'] == 'file':
        c = dec(os.path.join(PUB, l['file'] + '.wav'))
    else:
        c = dec(os.path.join(VIDEO, 'public/media/raw', l['src'] + '.mp4'), ss=l['t0'] - 0.03, t=l['d'] + 0.06)
        k = int(0.02 * SR); c[:k] *= np.linspace(0, 1, k)[:, None]; c[-k:] *= np.linspace(1, 0, k)[:, None]
    g = TARGET / rms_active(c)
    place(voice, c, l['v'], gain=min(g, 6.0))
    duck_iv.append((l['v'] - 0.1, l['v'] + len(c) / SR + 0.1))

# ---------------- music ----------------
B = 60.0 / 123.0
mm = dec(os.path.join(PUB, 'mixkit/music-motivating-mornings.mp3'))
def seg(t0, t1): return mm[int(t0 * SR):int(t1 * SR)].copy()
music = np.zeros((N, 2), dtype=np.float32)
# light (0 to 13.8): track 20..33.8, softened
light = lowpass_fast(seg(20.0, 20.0 + 13.8), 1800)
place(music, light, 0.0, gain=db(-8), fin=2.5, fout=1.2)
# tension: breakdown + rise, ends exactly at 63.76 -> v 24.0
tension = seg(63.76 - 11.2, 63.76)
place(music, tension, 24.0 - 11.2, gain=db(3), fin=1.2)
# drop and loops, cut on beat/bar boundaries
t0 = 63.76
def beats(a, b): return seg(t0 + a * B, t0 + b * B)
XF = 0.08
v = 24.0
parts = [(0, 80), (16, 80), (16, 40)]
for a, b in parts:
    c = beats(a, b)
    place(music, c, v, fin=XF if v > 24 else 0.0, fout=XF)
    v += (b - a) * B - XF * 0.0
outro = seg(t0 + 80 * B, 117.0)
place(music, outro, v, fin=XF)
print('outro starts at v', round(v, 2), 'ends', round(v + len(outro) / SR, 2))

# ---------------- sfx ----------------
sfx = np.zeros((N, 2), dtype=np.float32)
air = dec(os.path.join(PUB, 'mixkit/sfx-air-woosh.mp3'))
imp = dec(os.path.join(PUB, 'mixkit/sfx-whoosh-impact.mp3'))
pos = dec(os.path.join(PUB, 'mixkit/sfx-positive-notification.mp3'))
bub = dec(os.path.join(PUB, 'mixkit/sfx-bubble-notification.mp3'))
rs = np.random.RandomState(4)

def whoosh(peak, g=-11, lp=5200):
    c = lowpass_fast(air, lp)
    place(sfx, c, peak - 1.10, gain=db(g), fin=0.05, fout=0.15)

def click(v, g=-18, f=1700):
    n = int(0.05 * SR); t = np.arange(n) / SR
    c = (np.sin(2 * np.pi * f * t) * np.exp(-t * 130) + 0.5 * rs.randn(n) * np.exp(-t * 500)).astype(np.float32)
    place(sfx, np.stack([c, c], 1), v, gain=db(g))

def pop(v, g=-22, f=420):
    n = int(0.18 * SR); t = np.arange(n) / SR
    c = (np.sin(2 * np.pi * (f + 260 * np.exp(-t * 30)) * t) * np.exp(-t * 26)).astype(np.float32)
    place(sfx, np.stack([c, c], 1), v, gain=db(g))

def boom(v, g=-7):
    n = int(2.2 * SR); t = np.arange(n) / SR
    c = np.sin(2 * np.pi * (46 + 40 * np.exp(-t * 6)) * t) * np.exp(-t * 2.4)
    c += 0.25 * rs.randn(n) * np.exp(-t * 9)
    c = lowpass_fast(np.stack([c, c], 1).astype(np.float32), 400)
    place(sfx, c, v, gain=db(g), fin=0.004)

# riser: slow, exponential fade in from 16.2 to the drop at 24.0 (no sudden step)
R0, R1 = 16.2, 24.0
n = int((R1 - R0) * SR); t = np.arange(n) / SR; u = t / (R1 - R0)
noise = rs.randn(n)
sw = np.cumsum(180 + 5200 * u ** 2) / SR  # sweep phase
tone = np.sin(2 * np.pi * (110 * (1 + 4 * u ** 1.5)).cumsum() / SR) * 0.5
# filtered noise (rising band) via cumulative smoothing windows
nz = np.stack([noise, noise], 1).astype(np.float32)
nzh = nz - lowpass_fast(nz, 500)
nzs = lowpass_fast(nzh, 7000)
amp = (u ** 3.0) * 0.9
riser = (nzs * amp[:, None] * 0.55 + np.stack([tone, tone], 1) * amp[:, None] * 0.25).astype(np.float32)
place(sfx, riser, R0, gain=db(-7), fin=2.0, fout=0.0)
riser_end_fade = int(0.04 * SR)
# impact whoosh builds into the drop (peak 2.53 s into the file)
place(sfx, lowpass_fast(imp, 9000), 24.0 - 2.53, gain=db(-9), fin=0.8, fout=0.5)
boom(24.0)
click(22.62); click(24.0, g=-14)

# whooshes on big moves only
for pk, g in [(25.4, -9), (30.1, -16), (37.7, -16), (41.9, -12), (50.0, -13), (53.6, -11), (85.0, -12), (92.6, -16), (97.3, -13), (112.0, -13)]:
    whoosh(pk, g)

# soft notifications and small pops
pop(39.45, g=-20)
for i, vv in enumerate([39.5, 39.55, 39.6, 39.65]):
    pass
pop(86.45, g=-22, f=380); pop(88.65, g=-22, f=460)
place(sfx, lowpass_fast(pos, 3200), 91.0, gain=db(-17), fin=0.12, fout=0.35)   # Maya's approval card
click(93.5, g=-20, f=1300)
place(sfx, lowpass_fast(bub, 2800), 108.35, gain=db(-15), fin=0.15, fout=0.4)  # Priya, soft

# ---------------- ducking and mix ----------------
env = np.zeros(N, dtype=np.float32)
for a, b in duck_iv:
    env[int(max(0, a) * SR):int(min(DUR, b) * SR)] = 1.0
def smooth(x, att, rel):
    y = np.zeros_like(x); s = 0.0
    ka = np.exp(-1 / (att * SR)); kr = np.exp(-1 / (rel * SR))
    for i in range(0, len(x), 1):
        k = ka if x[i] > s else kr
        s = k * s + (1 - k) * x[i]
        y[i] = s
    return y
env = smooth(env, 0.12, 0.45)
duck = (1 - env * (1 - db(-10)))
music *= duck[:, None]
sfx_duck = (1 - env * (1 - db(-4)))
sfx *= sfx_duck[:, None]
mix = music * db(-1.5) + voice * 1.0 + sfx
# fade out the last 2 s
f = int(2.0 * SR)
mix[-f:] *= np.linspace(1, 0, f)[:, None] ** 1.5
peak = np.abs(mix).max()
print('peak', peak)
mix = np.clip(mix / max(1.0, peak / 0.95), -1, 1)
raw = os.path.join(OUT, 'mix_raw.wav')
import wave
with wave.open(raw, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', raw)
