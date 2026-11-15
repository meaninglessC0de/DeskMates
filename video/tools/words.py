"""Word timestamps for every wav in a folder (mlx-whisper). Run: uvx --with mlx-whisper python tools/words.py media/vo"""
import json, sys, pathlib, mlx_whisper
d = pathlib.Path(sys.argv[1])
out = {}
for f in sorted(d.glob("*.wav")):
    r = mlx_whisper.transcribe(str(f), path_or_hf_repo="mlx-community/whisper-large-v3-turbo", word_timestamps=True, language="en")
    words = [{"w": w["word"].strip(), "s": round(w["start"], 3), "e": round(w["end"], 3)} for seg in r["segments"] for w in seg["words"]]
    out[f.stem] = {"text": r["text"].strip(), "words": words}
    print(f.stem, "|", r["text"].strip())
(d / "words.json").write_text(json.dumps(out, indent=1))
