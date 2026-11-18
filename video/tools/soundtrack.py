"""v4 soundtrack: music bed from Mixkit "Motivating Mornings" (Mixkit licence) re-edited to the cut, a slow riser into the
0:24 drop, and the SFX layer. Writes public/media/bed.wav (ducked in the edit) and public/media/sfx.wav (not ducked).
Run: uvx --python 3.12 --with librosa --with numpy --with scipy --with soundfile python tools/soundtrack.py"""
import numpy as np, librosa, soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
DUR = 120.0
N = int(SR * DUR)
DL = 'media/dl/'

def load(name):
    y, _ = librosa.load(DL + name, sr=SR, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    return y

def ramp(n, kind='eq'):
    x = np.linspace(0, 1, n)
    return np.sin(x * np.pi / 2) if kind == 'eq' else x

# ---------- music bed ----------
music = load('music-motivating-mornings.mp3')
_, beats = librosa.beat.beat_track(y=librosa.to_mono(music), sr=SR)
bt = librosa.frames_to_time(beats, sr=SR)
snap = lambda x: float(bt[np.argmin(np.abs(bt - x))])

DROP_TRACK = snap(63.76)          # the track's big rise lands on the 0:24 click
OFF = DROP_TRACK - 24.0           # final t -> track t = t + OFF for the first section
# (final start, track start, track end) with splices snapped to beats
s1_end_track = snap(103.8)
s1_end_final = s1_end_track - OFF
s2_src = snap(16.16); s2_end_track = snap(45.9)
s2_end_final = s1_end_final + (s2_end_track - s2_src)
s3_src = DROP_TRACK; s3_end_track = snap(77.2)
s3_end_final = s2_end_final + (s3_end_track - s3_src)
s4_src = snap(104.0)
plan = [(0.0, OFF, s1_end_track), (s1_end_final, s2_src, s2_end_track), (s2_end_final, s3_src, s3_end_track), (s3_end_final, s4_src, music.shape[1] / SR)]
print('music plan (final, track from, track to):', [tuple(round(v, 2) for v in p) for p in plan])

bed = np.zeros((2, N))
XF = int(0.06 * SR)
for i, (f0, a, b) in enumerate(plan):
    seg = music[:, int(a * SR) - (XF if i else 0): int(b * SR) + XF]
    start = int(f0 * SR) - (XF if i else 0)
    seg = seg[:, : max(0, min(seg.shape[1], N - start))].copy()
    if i:
        seg[:, :XF] *= ramp(XF)
    if i < len(plan) - 1:
        seg[:, -XF:] *= ramp(XF)[::-1]
    bed[:, start:start + seg.shape[1]] += seg

# intro: airy (muffled, quieter) to 13 s, tense (darker) to 24 s, opening up into the drop
lp_air = sosfilt(butter(4, 1100, 'low', fs=SR, output='sos'), bed, axis=1)
lp_tense = sosfilt(butter(4, 650, 'low', fs=SR, output='sos'), bed, axis=1)
t = np.arange(N) / SR
w_full = np.clip((t - 23.2) / 0.8, 0, 1) ** 2            # filter opens over the last 0.8 s
w_tense = np.clip((t - 12.0) / 2.0, 0, 1) * (1 - w_full)
w_air = (1 - np.clip((t - 12.0) / 2.0, 0, 1)) * (1 - w_full)
gain = np.where(t < 13, 0.55, np.where(t < 24, 0.62, 1.0))
gain = np.convolve(gain, np.ones(4800) / 4800, mode='same')
bed = (lp_air * w_air + lp_tense * w_tense + bed * w_full) * gain
fade = np.ones(N); fn = int(2.0 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 1.5
fade[:int(0.8 * SR)] = np.linspace(0, 1, int(0.8 * SR))
bed *= fade

# ---------- SFX layer ----------
sfx = np.zeros((2, N))
def place(y, at, gain=1.0):
    i = int(at * SR)
    j = min(N, i + y.shape[1])
    if j > i:
        sfx[:, i:j] += y[:, : j - i] * gain

rng = np.random.default_rng(3)
# slow riser 16.5 -> 24.0: band-passed noise sweeping up + a reversed reverb swell, exponential fade-in
T = 7.5
n = int(T * SR)
noise = rng.normal(0, 1, n)
hop = 1024; win = np.hanning(2 * hop)
out = np.zeros(n + 2 * hop)
for k in range(0, n - 2 * hop, hop):
    tt = k / n
    fc = 250 * (24.0 ** tt)                                   # 250 Hz -> ~6 kHz
    sos = butter(2, [fc * 0.7, min(fc * 1.4, SR / 2 - 100)], 'band', fs=SR, output='sos')
    out[k:k + 2 * hop] += sosfilt(sos, noise[k:k + 2 * hop]) * win
riser = out[:n]
env = (np.linspace(0, 1, n) ** 3.2)
riser = riser / (np.abs(riser).max() + 1e-9) * env
hit = librosa.to_mono(load('sfx-whoosh-impact.mp3'))
ir = rng.normal(0, 1, int(3.0 * SR)) * np.exp(-np.linspace(0, 6, int(3.0 * SR)))
swell = fftconvolve(hit[: int(2.6 * SR)], ir)[::-1]
swell = swell[-n:] if len(swell) >= n else np.pad(swell, (n - len(swell), 0))
swell = swell / (np.abs(swell).max() + 1e-9) * (np.linspace(0, 1, n) ** 2.4)
r = 0.22 * riser + 0.30 * swell
r[-int(0.04 * SR):] *= np.linspace(1, 0, int(0.04 * SR))
place(np.stack([r, r]), 24.0 - T)
# the hit: Mixkit "whoosh impact", its peak (2.53 s in) on the click, plus a soft sub boom
imp = load('sfx-whoosh-impact.mp3')
place(imp, 24.0 - 2.53, 0.55)
nb = int(2.2 * SR); tb = np.arange(nb) / SR
boom = np.sin(2 * np.pi * np.cumsum(42 + 38 * np.exp(-tb * 7)) / SR) * np.exp(-tb * 2.2) * np.minimum(1, tb / 0.01)
place(np.stack([boom, boom]), 24.0, 0.42)
# soft whooshes on the big moves (Mixkit "air woosh", peak 1.10 s in)
woosh = load('sfx-air-woosh.mp3')
for at, g in [(42.35, 0.22), (48.3, 0.18), (51.95, 0.32), (80.15, 0.30), (88.2, 0.16), (93.2, 0.2)]:
    place(woosh, at - 1.10, g)
# Priya's notification chime (Mixkit "positive notification"), on the moment it lands
place(load('sfx-positive-notification.mp3'), 101.0, 0.32)
# the end card's mark builds with a gentle bubble pop
place(load('sfx-bubble-notification.mp3'), 109.0, 0.14)

def write(name, x):
    peak = np.abs(x).max()
    if peak > 0.98:
        x = x / peak * 0.98
    sf.write(f'public/media/{name}', x.T.astype(np.float32), SR, subtype='PCM_16')
    print(name, 'peak', round(float(np.abs(x).max()), 3))
write('bed.wav', bed / (np.abs(bed).max() + 1e-9) * 0.9)
write('sfx.wav', sfx)
