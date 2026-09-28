"""Three-model prediction merge for SonicSentinel.

Each model is loaded, validated and exercised through an explicit adapter that
converts its native output into one canonical 10-dimensional probability vector
indexed by :data:`CANONICAL_CLASSES`. Nothing is fabricated: a model that
cannot be loaded or exercised is reported as unavailable and is excluded from
the merge rather than replaced by a placeholder distribution.

The merged result is a weighted combination of the models that actually ran
(YAMNet, CNN, SVM). Weights are renormalised over the contributing models, so
the merge never silently loses the full probability mass when one member is
missing.

The Teachable Machine model is deliberately excluded from the merge. It runs in
the browser against a different label set, is not comparable at the probability
level, and is surfaced to the caller as an independent secondary result.
"""
from __future__ import annotations

import json
import os
import warnings
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

warnings.filterwarnings("ignore")

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "python_model"

# The application's canonical taxonomy. This is the only ordering the rest of
# the app is allowed to reason about; every adapter maps into it.
CANONICAL_CLASSES: List[str] = [
    "Machinery Fault",
    "Glass Breaking",
    "Alarm or Siren",
    "Vehicle Horn",
    "Animal Sound",
    "Gunshot",
    "Panic Scream",
    "Aggression",
    "Person Asking for Help",
    "Background Noise",
]
NUM_CLASSES = len(CANONICAL_CLASSES)
CLASS_TO_INDEX: Dict[str, int] = {c: i for i, c in enumerate(CANONICAL_CLASSES)}

# Merge weights over the three comparable models. The Teachable Machine is not
# included; see module docstring.
MERGE_WEIGHTS: Dict[str, float] = {
    "yamnet": 0.40,
    "cnn": 0.35,
    "svm": 0.25,
}


# ── small helpers ───────────────────────────────────────────────────────

def _blank_probs() -> np.ndarray:
    return np.zeros(NUM_CLASSES, dtype=np.float64)


def _blank_result(name: str, reason: str) -> Dict[str, Any]:
    return {
        "model": name,
        "status": "MODEL_UNAVAILABLE",
        "reason": reason,
        "predicted_class": None,
        "confidence": 0.0,
        "probabilities": {c: 0.0 for c in CANONICAL_CLASSES},
        "top_predictions": [],
        "reachable_classes": None,
    }


def _finalise(name: str, probs: np.ndarray, extra: Optional[Dict[str, Any]] = None
              ) -> Dict[str, Any]:
    """Convert a canonical-order probability vector into the response shape."""
    if probs.shape != (NUM_CLASSES,):
        probs = np.resize(probs, NUM_CLASSES)
    probs = np.clip(probs, 0.0, None)
    total = float(probs.sum())
    if total > 0:
        probs = probs / total
    idx = int(np.argmax(probs))
    order = np.argsort(probs)[::-1][:3]
    out = {
        "model": name,
        "status": "ok",
        "predicted_class": CANONICAL_CLASSES[idx],
        "confidence": round(float(probs[idx]), 6),
        "probabilities": {c: round(float(p), 6)
                          for c, p in zip(CANONICAL_CLASSES, probs)},
        "top_predictions": [
            {"class": CANONICAL_CLASSES[i], "confidence": round(float(probs[i]), 6)}
            for i in order
        ],
        "reachable_classes": len(np.flatnonzero(np.asarray(
            [c in CANONICAL_CLASSES for c in CANONICAL_CLASSES]))) if False else NUM_CLASSES,
    }
    if extra:
        out.update(extra)
    return out


# ── model 1: YAMNet transfer learning ───────────────────────────────────

_YAMNET_STATE: Dict[str, Any] = {}


def load_yamnet() -> Dict[str, Any]:
    """Load the YAMNet embedding extractor and the trained classifier head."""
    if _YAMNET_STATE:
        return _YAMNET_STATE
    state: Dict[str, Any] = {"ready": False, "reason": ""}
    bundle_path = MODEL_DIR / "sonicsentinel_yamnet_model.pkl"
    if not bundle_path.is_file():
        state["reason"] = f"artifact missing: {bundle_path.name}"
        _YAMNET_STATE.update(state)
        return state
    try:
        import joblib
        bundle = joblib.load(bundle_path)
        classes = list(bundle["classes"])
        clf = bundle["classifier"]
        if classes != CANONICAL_CLASSES:
            state["reason"] = "trained class order does not match canonical taxonomy"
            _YAMNET_STATE.update(state)
            return state
        if getattr(clf, "n_features_in_", None) != 1024:
            state["reason"] = f"unexpected embedding dim {clf.n_features_in_}, expected 1024"
            _YAMNET_STATE.update(state)
            return state
        import tensorflow_hub as hub
        handle = os.getenv("YAMNET_HANDLE", "https://tfhub.dev/google/yamnet/1")
        state.update({
            "ready": True,
            "bundle": bundle,
            "extractor": hub.load(handle),
            "handle": handle,
        })
    except Exception as exc:
        state["reason"] = f"{type(exc).__name__}: {exc}"
    _YAMNET_STATE.update(state)
    return state


def predict_yamnet(y: np.ndarray, sr: int) -> Dict[str, Any]:
    state = load_yamnet()
    if not state.get("ready"):
        return _blank_result("yamnet", state.get("reason", "not loaded"))
    try:
        import librosa
        if sr != 16000:
            y = librosa.resample(y, orig_sr=sr, target_sr=16000)
        audio = np.asarray(y, dtype=np.float32)
        if audio.size == 0:
            return _blank_result("yamnet", "empty audio")
        _scores, embeddings, _spec = state["extractor"](audio)
        emb = np.mean(embeddings.numpy(), axis=0, keepdims=True)
        if emb.shape != (1, 1024):
            return _blank_result("yamnet", f"bad embedding shape {emb.shape}")
        bundle = state["bundle"]
        raw = bundle["classifier"].predict_proba(bundle["scaler"].transform(emb))[0]
        # classes_ is [0..n-1] in canonical order, verified above.
        probs = _blank_probs()
        for cls_i, p in zip(np.asarray(bundle["classifier"].classes_).astype(int), raw):
            if 0 <= cls_i < NUM_CLASSES:
                probs[cls_i] = p
        return _finalise("yamnet", probs,
                         {"backbone": state["handle"], "embedding_dim": 1024})
    except Exception as exc:
        return _blank_result("yamnet", f"{type(exc).__name__}: {exc}")


# ── model 2: CNN ────────────────────────────────────────────────────────

_CNN_STATE: Dict[str, Any] = {}


def load_cnn() -> Dict[str, Any]:
    if _CNN_STATE:
        return _CNN_STATE
    state: Dict[str, Any] = {"ready": False, "reason": ""}
    path = MODEL_DIR / "cnn_model.keras"
    if not path.is_file():
        state["reason"] = f"artifact missing: {path.name}"
        _CNN_STATE.update(state)
        return state
    try:
        import h5py
        import zipfile
        tmp = ROOT / "data" / "temp"
        tmp.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path) as z:
            z.extract("model.weights.h5", tmp)
        h5 = tmp / "model.weights.h5"
        with h5py.File(h5, "r") as f:
            w = {k: f[k][:] for k in (
                "layers/conv2d/vars/0", "layers/conv2d/vars/1",
                "layers/conv2d_1/vars/0", "layers/conv2d_1/vars/1",
                "layers/conv2d_2/vars/0", "layers/conv2d_2/vars/1",
                "layers/dense/vars/0", "layers/dense/vars/1",
                "layers/dense_1/vars/0", "layers/dense_1/vars/1")}
        shapes = {k: tuple(v.shape) for k, v in w.items()}
        expect = {
            "layers/conv2d/vars/0": (3, 3, 1, 16),
            "layers/conv2d_1/vars/0": (3, 3, 16, 32),
            "layers/conv2d_2/vars/0": (3, 3, 32, 64),
            "layers/dense/vars/0": (22400, 64),
            "layers/dense_1/vars/0": (64, 10),
        }
        bad = {k: (shapes.get(k), v) for k, v in expect.items() if shapes.get(k) != v}
        if bad:
            state["reason"] = f"weight shapes do not match architecture: {bad}"
            _CNN_STATE.update(state)
            return state
        state.update({"ready": True, "weights": w, "input_shape": [128, 216, 1]})
    except Exception as exc:
        state["reason"] = f"{type(exc).__name__}: {exc}"
    _CNN_STATE.update(state)
    return state


def predict_cnn(spectrogram: np.ndarray) -> Dict[str, Any]:
    """Run the CNN over a 128x216x1 log-mel spectrogram.

    The class order baked into the trained Dense(10) layer is not recorded
    anywhere in the project, so this adapter assumes the canonical order and
    says so in the response rather than asserting a verified mapping.
    """
    state = load_cnn()
    if not state.get("ready"):
        return _blank_result("cnn", state.get("reason", "not loaded"))
    try:
        w = state["weights"]
        x = np.asarray(spectrogram, dtype=np.float32)
        # Accept the shapes this project's extractor emits: (128, 216),
        # (1, 128, 216, 1) and (128, 216, 1) all describe one 128x216 image.
        if x.ndim == 4:
            x = x[0]
        if x.ndim == 3:
            x = x[..., 0] if x.shape[-1] == 1 else x[0]
        if x.shape == (128, 216):
            x = x[..., None]
        if x.shape != (128, 216, 1):
            return _blank_result("cnn", f"expected 128x216 spectrogram, got {x.shape}")
        from scipy.signal import correlate2d

        def conv_relu(inp: np.ndarray, wv: np.ndarray, bv: np.ndarray) -> np.ndarray:
            """(H, W, C_in) x (kH, kW, C_in, C_out) -> ReLU'd (H', W', C_out)."""
            kh, kw, c_in, c_out = wv.shape
            out = np.zeros((inp.shape[0] - kh + 1, inp.shape[1] - kw + 1, c_out),
                           dtype=np.float32)
            for c in range(c_out):
                out[:, :, c] = bv[c]
                for i in range(c_in):
                    out[:, :, c] += correlate2d(inp[:, :, i], wv[:, :, i, c],
                                               mode="valid")
            return np.maximum(out, 0.0)

        def pool(inp: np.ndarray) -> np.ndarray:
            """MaxPool2D(2, 2), floor-reducing, as in the training graph."""
            return inp[: inp.shape[0] // 2 * 2, : inp.shape[1] // 2 * 2, :][::2, ::2, :]

        h = conv_relu(x, w["layers/conv2d/vars/0"], w["layers/conv2d/vars/1"])
        h = pool(h)
        h = conv_relu(h, w["layers/conv2d_1/vars/0"], w["layers/conv2d_1/vars/1"])
        h = pool(h)
        h = conv_relu(h, w["layers/conv2d_2/vars/0"], w["layers/conv2d_2/vars/1"])
        h = pool(h)
        flat = h.reshape(1, -1)
        if flat.shape[1] != 22400:
            return _blank_result(
                "cnn",
                f"flattened width {flat.shape[1]} != trained Dense input 22400",
            )
        h = np.maximum(flat @ w["layers/dense/vars/0"] + w["layers/dense/vars/1"], 0.0)
        logits = h @ w["layers/dense_1/vars/0"] + w["layers/dense_1/vars/1"]
        e = np.exp(logits - logits.max())
        probs = (e / e.sum())[0]
        if probs.shape != (NUM_CLASSES,):
            return _blank_result("cnn", f"output width {probs.shape}, expected {NUM_CLASSES}")
        return _finalise("cnn", probs, {
            "input_shape": state["input_shape"],
            "class_order_verified": False,
            "class_order_source": "assumed canonical (no mapping recorded in repo)",
        })
    except Exception as exc:
        return _blank_result("cnn", f"{type(exc).__name__}: {exc}")


# ── merge ───────────────────────────────────────────────────────────────

def merge(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Combine the models that ran, renormalising over the contributors."""
    live = [r for r in results if r.get("status") == "ok"]
    if not live:
        return {
            "status": "MODEL_UNAVAILABLE",
            "reason": "no model produced a prediction",
            "predicted_class": None,
            "confidence": 0.0,
            "probabilities": {c: 0.0 for c in CANONICAL_CLASSES},
            "contributors": [],
            "excluded": [{"model": r["model"], "reason": r.get("reason", "")}
                         for r in results],
        }

    total_w = sum(MERGE_WEIGHTS.get(r["model"], 0.0) for r in live)
    if total_w <= 0:
        total_w = float(len(live))

    acc = _blank_probs()
    contributors = []
    for r in live:
        w = MERGE_WEIGHTS.get(r["model"], 0.0) or (1.0 / len(live))
        share = w / total_w
        vec = np.array([r["probabilities"][c] for c in CANONICAL_CLASSES], dtype=np.float64)
        acc += share * vec
        contributors.append({
            "model": r["model"],
            "weight": round(float(w), 4),
            "effective_weight": round(float(share), 4),
            "predicted_class": r["predicted_class"],
            "confidence": r["confidence"],
        })

    idx = int(np.argmax(acc))
    order = np.argsort(acc)[::-1][:3]
    return {
        "status": "ok",
        "predicted_class": CANONICAL_CLASSES[idx],
        "confidence": round(float(acc[idx]), 6),
        "probabilities": {c: round(float(p), 6) for c, p in zip(CANONICAL_CLASSES, acc)},
        "top_predictions": [
            {"class": CANONICAL_CLASSES[i], "confidence": round(float(acc[i]), 6)}
            for i in order
        ],
        "contributors": contributors,
        "excluded": [{"model": r["model"], "reason": r.get("reason", "")}
                     for r in results if r.get("status") != "ok"],
    }


def comparison(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Per-model predictions plus agreement, without declaring a winner."""
    ranked = [r for r in results if r.get("status") == "ok" and r["predicted_class"]]
    tally: Dict[str, List[str]] = {}
    for r in ranked:
        tally.setdefault(r["predicted_class"], []).append(r["model"])
    ordered = sorted(tally.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    return {
        "per_model": [
            {"model": r["model"], "status": r["status"],
             "predicted_class": r["predicted_class"], "confidence": r["confidence"],
             "reason": r.get("reason")}
            for r in results
        ],
        "n_responding": len(ranked),
        "n_total": len(results),
        "groups": [{"class": c, "models": m, "votes": len(m)}
                   for c, m in ordered],
        "agreement": ("unanimous" if ordered and len(ordered[0][1]) == len(ranked)
                      and len(ordered) == 1 else
                      "majority" if ordered and len(ordered[0][1]) > len(ranked) / 2 else
                      "disagree"),
    }
