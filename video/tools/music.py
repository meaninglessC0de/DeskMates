"""Original 112 BPM track in C major, 120 s. Airy intro, tension 13-24 s, riser + boom at 24 s, full beat after, fade last 2 s."""
import numpy as np, wave, sys
SR = 44100; BPM = 112; B = 60 / BPM; DUR = 120.0
N = int(SR * DUR); L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)
def note(m): return 440 * 2 ** ((m - 69) / 12)
def add(sig, t0, pan=0.0, gain=1.0):
    i = int(t0 * SR); j = min(N, i + len(sig))
    if i >= N or j <= i: return
    s = sig[: j - i] * gain
    L[i:j] += s * (1 - pan) * 0.5 ** 0.5 * 1.2; R[i:j] += s * (1 + pan) * 0.5 ** 0.5 * 1.2
def env(n, a=0.01, r=0.3):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r); return e
def pluck(f, d=0.6):
    n = int(SR * d); t = np.arange(n) / SR
    s = np.sin(2*np.pi*f*t) + 0.5*np.sin(4*np.pi*f*t)*np.exp(-t*8) + 0.25*np.sin(6*np.pi*f*t)*np.exp(-t*12)
    return s * env(n, 0.003, 0.22)
def pad(freqs, d):
    n = int(SR * d); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (det / 12); s += np.sin(2*np.pi*ff*t + rng.uniform(0, 6)) + 0.3*np.sin(4*np.pi*ff*t)
    a = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6)
    return s * a / (len(freqs) * 3)
def kick():
    n = int(SR * 0.45); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 30); ph = 2*np.pi*np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7) * 1.0
def snare():
    n = int(SR * 0.25); t = np.arange(n) / SR
    return (rng.normal(0, 1, n) * np.exp(-t * 18) * 0.5 + np.sin(2*np.pi*190*t) * np.exp(-t * 25) * 0.4)
def hat():
    n = int(SR * 0.06); t = np.arange(n) / SR; x = rng.normal(0, 1, n); x = np.diff(np.concatenate([[0], x]))
    return x * np.exp(-t * 60) * 0.18
def bass(f, d):
    n = int(SR * d); t = np.arange(n) / SR
    s = np.sin(2*np.pi*f*t) + 0.35*np.sign(np.sin(2*np.pi*f*t)) * 0.3
    return s * np.minimum(1, t / 0.01) * np.minimum(1, (d - t) / 0.05) * 0.5
# chords (root midi, triad)
C = [48, [60, 64, 67]]; G = [43, [59, 62, 67]]; Am = [45, [57, 60, 64]]; F = [41, [57, 60, 65]]
major = [C, G, Am, F]; tense = [Am, F, Am, F]
bar = 4 * B
t = 0.0; k = 0
while t < DUR - 0.01:
    section = 'intro' if t < 13 else ('tense' if t < 24.0 else ('full' if t < 114 else 'outro'))
    if 24.0 - bar < t < 24.0: section = 'tense'
    ch = (tense if section == 'tense' else major)[k % 4]
    root, triad = ch
    d = min(bar, 24.0 - t) if t < 24.0 and t + bar > 24.0 else bar
    add(pad([note(m) for m in triad] + [note(root + 12)], d + 0.3), t, 0, 0.22 if section != 'tense' else 0.26)
    # plucked arpeggio, eighths
    arp = [triad[0], triad[1], triad[2], triad[1] + 12, triad[2], triad[1], triad[0] + 12, triad[2]]
    for i in range(8):
        tt = t + i * B / 2
        if tt >= t + d: break
        if section == 'tense' and i % 2: continue
        add(pluck(note(arp[i] + 12)), tt, -0.3 + 0.6 * (i % 2), 0.16)
    if section == 'tense':
        for i in range(4):
            tt = t + i * B
            if tt < t + d: add(kick(), tt, 0, 0.45)
    if section in ('full', 'outro'):
        for i in range(4):
            add(kick(), t + i * B, 0, 0.8)
            if i in (1, 3): add(snare(), t + i * B, 0.1, 0.55)
            for h in range(2): add(hat(), t + i * B + h * B / 2 + (B / 2 if h else 0) * 0, 0.4, 1.0)
            add(hat(), t + i * B + B / 2, -0.4, 1.0)
        for i in range(8):
            add(bass(note(root), B / 2 * 0.9), t + i * B / 2, 0, 0.42)
    t += d; k += 1
# riser 21-24 s and boom at 24
n = int(SR * 3); tt = np.arange(n) / SR
noise = rng.normal(0, 1, n); riser = noise * (tt / 3) ** 2 * 0.25
sweep = np.sin(2*np.pi*np.cumsum(200 + 1800 * (tt / 3) ** 2) / SR) * (tt / 3) ** 2 * 0.12
add(riser + sweep, 21.0, 0, 1.0)
n = int(SR * 2.5); tt = np.arange(n) / SR
boom = np.sin(2*np.pi*np.cumsum(38 + 60*np.exp(-tt*6)) / SR) * np.exp(-tt * 1.6) * 1.1 + rng.normal(0, 1, n) * np.exp(-tt * 12) * 0.2
add(boom, 24.0, 0, 1.0)
# soft whooshes at big camera moves
for w in [float(x) for x in sys.argv[1:]]:
    n = int(SR * 0.9); tt = np.arange(n) / SR; x = rng.normal(0, 1, n)
    x = np.convolve(x, np.ones(30) / 30, mode='same'); e = np.sin(np.pi * tt / 0.9) ** 2
    add(x * e * 0.6, w - 0.45, 0, 1.0)
st = np.stack([L, R], 1)
fade = np.ones(N); fn = int(SR * 2); fade[-fn:] = np.linspace(1, 0, fn); st *= fade[:, None]
st /= np.max(np.abs(st)) * 1.05
with wave.open(sys.argv[0].replace('tools/music.py', 'media/music/track.wav'), 'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes())
print('ok')
