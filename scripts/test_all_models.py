"""Run one audio file through every model and print the raw evidence.

    python scripts/test_all_models.py <audio> [audio ...]

Prints each model's full canonical probability vector, so a wrong class mapping
or a saturated confidence is visible rather than hidden behind a label.
"""
from __future__ import annotations

import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml-service"))

import numpy as np  # noqa: E402
import librosa  # noqa: E402

from app import model_ensemble as ens  # noqa: E402
from app import model_evaluator as me  # noqa: E402

BAR = "=" * 78
THIN = "-" * 78


def vector_line(result: dict) -> str:
    parts = []
    for c in ens.CANONICAL_CLASSES:
        p = result["probabilities"][c]
        flag = "*" if c == result["predicted_class"] else " "
        parts.append(f"{c.split()[0][:5]}:{p:.3f}{flag}")
    return "  ".join(parts)


def run(path: Path) -> None:
    print(BAR)
    print(f"FILE  {path.name}")
    try:
        info = __import__("soundfile").info(str(path))
        print(f"AUDIO {info.samplerate} Hz | {info.channels} ch | "
              f"{info.duration:.2f} s | {info.format}/{info.subtype}")
    except Exception as exc:
        print(f"AUDIO metadata unavailable: {exc}")

    y, sr = librosa.load(str(path), sr=22050, duration=5.0)
    target = sr * 5
    y = np.pad(y, (0, max(0, target - len(y))))[:target]
    print(f"PIPELINE librosa sr=22050 mono duration=5.0 | rms={float(np.sqrt(np.mean(y**2))):.5f}")

    me.load_models()
    results = []

    r = ens.predict_yamnet(y, sr)
    results.append(r)

    r = ens.predict_cnn(me.extract_mel_spectrogram(y, sr))
    results.append(r)

    print(THIN)
    for res in results:
        print(f"\n{res['model'].upper()}  status={res['status']}")
        if res["status"] != "ok":
            print(f"  reason: {res.get('reason')}")
            if res.get("unreachable_classes"):
                print(f"  unreachable: {res['unreachable_classes']}")
            continue
        print(f"  predicted   {res['predicted_class']}")
        print(f"  confidence  {res['confidence']:.4f}")
        print(f"  top-3       " + ", ".join(
            f"{t['class']} {t['confidence']:.3f}" for t in res["top_predictions"]))
        print(f"  vector      {vector_line(res)}")
        if res.get("unreachable_classes"):
            print(f"  NOTE unreachable: {res['unreachable_classes']}")
        if res.get("class_order_verified") is False:
            print(f"  NOTE {res.get('class_order_source')}")

    merged = ens.merge(results)
    print(f"\n{THIN}\nMERGED (YAMNet + CNN + PANNs)")
    if merged["status"] != "ok":
        print(f"  status: {merged['status']} - {merged['reason']}")
    else:
        print(f"  predicted   {merged['predicted_class']}")
        print(f"  confidence  {merged['confidence']:.4f}")
        print(f"  contributors " + ", ".join(
            f"{c['model']}={c['effective_weight']:.2f}" for c in merged["contributors"]))
    for ex in merged.get("excluded", []):
        print(f"  EXCLUDED {ex['model']}: {ex['reason']}")

    comp = ens.comparison(results)
    print(f"\nCOMPARISON  {comp['n_responding']}/{comp['n_total']} models responded "
          f"| {comp['agreement']}")
    for g in comp["groups"]:
        print(f"  {g['votes']} vote(s)  {g['class']:<24} <- {', '.join(g['models'])}")
    if comp["agreement"] == "disagree":
        print("  Model disagreement detected.")


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1
    for a in args:
        p = Path(a)
        if not p.is_file():
            print(f"NOT FOUND: {p}")
            continue
        run(p)
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
