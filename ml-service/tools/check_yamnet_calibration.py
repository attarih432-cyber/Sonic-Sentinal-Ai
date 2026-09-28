"""Check whether a YAMNet head discriminates between inputs at all.

A head that returns the same class for every input cannot be used to support a
claim of per-event classification. This measures the real spread of the
predicted distribution over the distinct audio content available locally.
"""
from __future__ import annotations

import collections
import hashlib
import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml-service"))

import librosa  # noqa: E402
import numpy as np  # noqa: E402

from app import model_ensemble as ens  # noqa: E402

UPLOADS = ROOT / "ml-service" / "data" / "uploads"


def main() -> int:
    files = sorted(f for f in os.listdir(UPLOADS) if f.endswith(".wav"))
    groups: dict[str, list[str]] = collections.defaultdict(list)
    for fn in files:
        h = hashlib.sha256((UPLOADS / fn).read_bytes()).hexdigest()
        groups[h].append(fn)

    print(f"files: {len(files)} | distinct content: {len(groups)}\n")
    vecs, labels = [], []
    for h, fns in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        y, sr = librosa.load(str(UPLOADS / fns[0]), sr=22050, duration=5.0)
        y = np.pad(y, (0, max(0, sr * 5 - len(y))))[: sr * 5]
        r = ens.predict_yamnet(y, sr)
        if r["status"] != "ok":
            print(f"  {h[:8]}  UNAVAILABLE: {r.get('reason')}")
            continue
        vecs.append([r["probabilities"][c] for c in ens.CANONICAL_CLASSES])
        labels.append((h, len(fns), r["predicted_class"], r["confidence"]))

    if not vecs:
        print("YAMNet produced no predictions.")
        return 2
    V = np.array(vecs)
    argmaxes = np.argmax(V, axis=1)

    print("per-content prediction:")
    for h, n, lab, conf in labels:
        print(f"  n={n:<3} {h[:8]}  {lab:<24} {conf:.4f}")

    print()
    dist = collections.Counter(l for _, _, l, _ in labels)
    print("argmax distribution over distinct content:")
    for k, v in dist.most_common():
        print(f"  {k:<26} {v:>3}  ({v/len(labels)*100:.0f}%)")

    print()
    print("mean probability vector:")
    for c, v in zip(ens.CANONICAL_CLASSES, V.mean(axis=0)):
        print(f"  {c:<26} {v:.4f}")
    print()
    print("spread across distinct inputs (std):")
    for c, s in zip(ens.CANONICAL_CLASSES, V.std(axis=0)):
        print(f"  {c:<26} {s:.6f}")
    print()
    print(f"distinct argmax values : {len(set(argmaxes.tolist()))} of {len(labels)}")
    print(f"max deviation from mean: {np.abs(V - V.mean(axis=0)).max():.6f}")
    saturated = sum(1 for *_, c in labels if c >= 0.999)
    print(f"confidences >= 0.999   : {saturated} of {len(labels)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
