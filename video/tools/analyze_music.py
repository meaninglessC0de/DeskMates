import sys, numpy as np, librosa
for f in sys.argv[1:]:
    y, sr = librosa.load(f, sr=22050, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    bt = librosa.frames_to_time(beats, sr=sr)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=512)
    sec = [float(rms[(t >= s) & (t < s + 2)].mean()) for s in range(0, int(t[-1]) - 1, 2)]
    mx = max(sec)
    print(f.split('/')[-1], 'tempo', np.round(tempo, 1), 'dur', round(len(y) / sr, 1), 'first beats', np.round(bt[:6], 2))
    print('  energy/2s:', ' '.join(f"{int(v / mx * 9)}" for v in sec))
    d = np.diff(sec); top = np.argsort(d)[-4:][::-1]
    print('  biggest rises at (s):', [(int(i * 2 + 2), round(float(d[i] / mx), 2)) for i in top])
