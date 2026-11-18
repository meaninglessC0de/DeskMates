"""Editor C audio: voices + Mixkit music edited on bars + synthesized riser/click + Mixkit sfx -> mix.wav"""
import subprocess, numpy as np, json, sys, os
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
V = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../..')) + '/'
PUB = V + 'public/'
OUT = PUB + 'agents/C/'
DUR = 120.0
N = int(DUR * SR)

def load(path, ss=None, to=None):
    cmd = ['ffmpeg', '-v', 'error']
    if ss is not None: cmd += ['-ss', str(ss)]
    if to is not None: cmd += ['-to', str(to)]
    cmd += ['-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)

def put(buf, x, t, gain=1.0):
    i = int(round(t * SR))
    if i < 0:
        x = x[-i:]; i = 0
    j = min(N, i + len(x))
    if j > i: buf[i:j] += x[:j - i] * gain

def fade(x, fi=0.0, fo=0.0):
    x = x.copy()
    a = int(fi * SR); b = int(fo * SR)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None] ** 1.0
    if b: x[-b:] *= np.linspace(1, 0, b)[:, None]
    return x

db = lambda d: 10 ** (d / 20)
rms = lambda x: np.sqrt((x ** 2).mean() + 1e-12)

# ---------------- voices ----------------
T = dict(n01=0.8, n02=6.0, n03=13.4, n04=20.2, n05=28.3, n06=39.0, n07=49.8, n08=89.6, n09=95.6, n10=100.0, n11=111.9,
         s01=52.9, s02=56.0, s03=68.2, s06=77.0, s04=85.0, s05=98.2)
voice = np.zeros((N, 2))
ref = None
for k, t in T.items():
    x = load(PUB + f'media/{k}.wav')
    if ref is None: ref = rms(x)
    g = ref / rms(x) if k.startswith('s') else 1.0
    put(voice, fade(x, 0.005, 0.02), t, g * (1.0 if k.startswith('n') else 1.0))
narr_rms = np.mean([rms(load(PUB + f'media/{k}.wav')) for k in ['n01', 'n05', 'n10']])

def agent(path, ss, to, t_at, name):
    x = load(path, ss, to)
    x = fade(x, 0.02, 0.05)
    g = narr_rms / rms(x) * 1.0
    put(voice, x, t_at, g)
    print(name, 'gain', round(g, 2))

R = PUB + 'media/raw/'
agent(R + 'call.mp4', 10.06, 16.02, 43.6 - 0.08, 'maya call')
agent(R + 'meeting.mp4', 24.12, 31.72, 24.12 + 34.8, 'maya meeting')
agent(R + 'meeting.mp4', 48.25, 52.31, 48.25 + 24.0, 'jonas')
agent(R + 'meeting.mp4', 73.30, 76.86, 73.30 + 7.3, 'ines')

# ---------------- music ----------------
M = load(PUB + 'media/mixkit/music-motivating-mornings.mp3')
BAR = 60 / 123 * 4
mus = np.zeros((N, 2))
def mseg(src_t, dur, dst_t, xf=0.008):
    a = int(src_t * SR); n = int(dur * SR)
    c = M[a:a + n].copy()
    k = int(xf * SR)
    if dst_t > 0.01: c[:k] *= np.linspace(0, 1, k)[:, None]
    c[-k:] *= np.linspace(1, 0, k)[:, None]
    put(mus, c, dst_t)
DROP = 63.76
pre = M[int(39.76 * SR):int(DROP * SR)].copy()
# light (lowpassed, quieter) until the track's own breakdown, no abrupt changes
sos = butter(2, 2800, btype='low', fs=SR, output='sos')
t_pre = np.arange(len(pre)) / SR
mix_lp = np.clip((t_pre - 5.0) / 5.0, 0, 1)[:, None]  # lowpass fades away after 5..10 s
lp = sosfilt(sos, pre, axis=0)
pre = lp * (1 - mix_lp) + pre * mix_lp
g_pre = db(-7) + (1 - db(-7)) * np.clip((t_pre - 6.0) / 4.0, 0, 1)
pre *= g_pre[:, None]
pre = fade(pre, 1.6, 0.0)
put(mus, pre, 0.0)
t = 24.0
mseg(DROP, 20 * BAR, t); t += 20 * BAR
mseg(DROP, 20 * BAR, t); t += 20 * BAR
mseg(DROP, 5 * BAR, t); t += 5 * BAR
print('outro at', t)
o = M[int((DROP + 21 * BAR) * SR):int(112.0 * SR)].copy()
o[:int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]
put(mus, o, t)
mus *= db(-4)  # base level under voice

# ducking: voice presence envelope -> -10 dB, 60 ms attack / 400 ms release
vm = np.abs(voice).max(1)
win = int(0.05 * SR)
env = np.sqrt(np.convolve(vm ** 2, np.ones(win) / win, mode='same'))
pres = (env > 0.004).astype(float)
# widen a little before speech, hold after
from scipy.ndimage import maximum_filter1d, uniform_filter1d
pres = maximum_filter1d(pres, int(0.30 * SR))
a_att = np.exp(-1 / (0.06 * SR)); a_rel = np.exp(-1 / (0.40 * SR))
duck = np.zeros(N); cur = 0.0
for i in range(0, N, 1):
    pass
# vectorised smoothing via block loop at 1 kHz
step = SR // 1000
blk = pres[::step]
sm = np.zeros_like(blk); c = 0.0
for i, v in enumerate(blk):
    k = np.exp(-1 / (0.06 * 1000)) if v > c else np.exp(-1 / (0.40 * 1000))
    c = v + (c - v) * k
    sm[i] = c
duck = np.interp(np.arange(N) / SR, np.arange(len(sm)) / 1000, sm)
mus *= (1 - duck * (1 - db(-10)))[:, None]

# ---------------- synthesized: riser + clicks ----------------
rng = np.random.default_rng(7)
sfx = np.zeros((N, 2))
def riser(t0, t1, peak=0.30):
    n = int((t1 - t0) * SR)
    tt = np.arange(n) / SR
    p = tt / (t1 - t0)
    noise = rng.standard_normal(n)
    # block-FFT highpass sweep (cutoff 250 Hz -> 7 kHz)
    B = 4096
    out = np.zeros(n + B)
    win_ = np.hanning(B)
    for s in range(0, n, B // 2):
        seg_ = noise[s:s + B]
        if len(seg_) < B: seg_ = np.pad(seg_, (0, B - len(seg_)))
        fc = 250 * (28 ** (p[min(s, n - 1)]))
        F = np.fft.rfft(seg_ * win_)
        fr = np.fft.rfftfreq(B, 1 / SR)
        m = 1 / (1 + (fc / np.maximum(fr, 1)) ** 4)
        out[s:s + B] += np.fft.irfft(F * m, B) * win_
    nz = out[:n]
    nz /= np.abs(nz).max()
    # tonal sweep: rising chirp with fifth, so it reads as tension not just wind
    f = 180 * (6.5 ** p)
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = 0.5 * np.sin(ph) + 0.28 * np.sin(1.5 * ph) + 0.18 * np.sin(2 * ph)
    env = p ** 2.6                      # gradual, no step
    y = (0.75 * nz + 0.35 * tone) * env
    y *= peak / np.abs(y).max()
    y *= np.minimum(1, (n - np.arange(n)) / (0.04 * SR))  # tiny fade at the end only
    y2 = np.stack([y, np.roll(y, int(0.0004 * SR))], 1)
    put(sfx, y2, t0)
riser(16.5, 24.0, 0.34)

def click(t0, g=0.35):
    n = int(0.05 * SR); tt = np.arange(n) / SR
    y = (np.sin(2 * np.pi * 1900 * tt) * np.exp(-tt * 260) + 0.4 * np.sin(2 * np.pi * 950 * tt) * np.exp(-tt * 200)) * g
    put(sfx, np.stack([y, y], 1), t0)
click(22.62, 0.22)   # tray icon
click(23.99, 0.34)   # Show desks (the click that triggers the drop)

# ---------------- Mixkit sfx ----------------
K = PUB + 'media/mixkit/'
impact = load(K + 'sfx-whoosh-impact.mp3')
im_ = impact[int(1.35 * SR):int(6.0 * SR)].copy()
im_ = fade(im_, 1.1, 1.2)
put(sfx, im_, 24.0 - (2.53 - 1.35), 0.8)
woosh = load(K + 'sfx-air-woosh.mp3')
def wsh(peak_t, g):
    put(sfx, fade(woosh, 0.02, 0.15), peak_t - 1.10, g)
for pt, g in [(25.4, 0.30), (42.9, 0.45), (50.6, 0.38), (53.7, 0.5), (88.2, 0.5), (100.45, 0.45), (111.4, 0.4)]:
    wsh(pt, g)
bub = load(K + 'sfx-bubble-notification.mp3')
pos = load(K + 'sfx-positive-notification.mp3')
sosn = butter(2, 3200, btype='low', fs=SR, output='sos')
def soft(x): return sosfilt(sosn, x, axis=0)
put(sfx, soft(bub), 89.85, 0.32)
put(sfx, soft(bub), 92.95, 0.32)
put(sfx, soft(pos), 96.85, 0.28)
put(sfx, soft(pos), 98.55, 0.30)
put(sfx, soft(bub), 108.85, 0.26)

mix = voice * 1.0 + mus + sfx
mix = np.tanh(mix * 0.9) / 0.9 if np.abs(mix).max() > 1 else mix
pk = np.abs(mix).max()
print('peak', pk)
out = (mix / max(1.0, pk * 1.05) * 32767).astype(np.int16)
import wave
w = wave.open(OUT + 'mix_raw.wav', 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes()); w.close()
print('written')
