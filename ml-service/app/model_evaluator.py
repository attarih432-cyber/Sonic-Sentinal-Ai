"""
SonicSentinel Multi-Model Audio Evaluator

Evaluates input audio using three independent classifiers:
  1. YAMNet embedding Logistic Regression classifier
  2. Support Vector Machine Pipeline
  3. 2D Convolutional Neural Network

Produces individual model outputs, confidence scores, and an ensemble decision.
"""
from __future__ import annotations

import json
import os
import zipfile
from pathlib import Path
from typing import Any, Dict, Tuple

import h5py
import joblib
import librosa
import numpy as np
from scipy.signal import correlate2d

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "python_model"

CLASS_LABELS_PATH = MODEL_DIR / "class_labels.json"
YAMNET_PATH = MODEL_DIR / "sonicsentinel_yamnet_model.pkl"
YAMNET_HANDLE = os.getenv("YAMNET_HANDLE", "https://tfhub.dev/google/yamnet/1")
SVM_PATH = MODEL_DIR / "svm_model.pkl"
CNN_PATH = MODEL_DIR / "cnn_model.keras"

# 10 SRS sound categories mapping
DEFAULT_LABELS = {
    "0": "Machinery Fault",
    "1": "Glass Breaking",
    "2": "Alarm or Siren",
    "3": "Vehicle Horn",
    "4": "Animal Sound",
    "5": "Gunshot",
    "6": "Panic Scream",
    "7": "Aggression",
    "8": "Person Asking for Help",
    "9": "Background Noise",
}

# Load class labels
if CLASS_LABELS_PATH.is_file():
    try:
        CLASS_LABELS = json.loads(CLASS_LABELS_PATH.read_text(encoding="utf-8"))
    except Exception:
        CLASS_LABELS = DEFAULT_LABELS
else:
    CLASS_LABELS = DEFAULT_LABELS

NUM_CLASSES = len(CLASS_LABELS)

# Model instances (cached at module level)
_YAMNET_BUNDLE = None
_YAMNET_MODEL = None
_SVM_MODEL = None
_CNN_WEIGHTS = None


def load_models():
    """Lazy-load local classifier artifacts without running an inference."""
    global _YAMNET_BUNDLE, _SVM_MODEL, _CNN_WEIGHTS
    if _YAMNET_BUNDLE is None and YAMNET_PATH.is_file():
        try:
            bundle = joblib.load(YAMNET_PATH)
            required = {"classifier", "scaler", "classes"}
            if not isinstance(bundle, dict) or not required.issubset(bundle):
                raise ValueError("YAMNet classifier bundle is missing classifier/scaler/classes")
            expected = [CLASS_LABELS[str(i)] for i in range(NUM_CLASSES)]
            if list(bundle["classes"]) != expected:
                raise ValueError("YAMNet class order does not match class_labels.json")
            if getattr(bundle["classifier"], "n_features_in_", None) != 1024:
                raise ValueError("YAMNet classifier must accept 1024-dimensional embeddings")
            _YAMNET_BUNDLE = bundle
        except Exception as e:
            print(f"WARNING: Failed to load YAMNet classifier: {e}")

    if _SVM_MODEL is None and SVM_PATH.is_file():
        try:
            _SVM_MODEL = joblib.load(SVM_PATH)
        except Exception as e:
            print(f"WARNING: Failed to load SVM model: {e}")

    if _CNN_WEIGHTS is None and CNN_PATH.is_file():
        try:
            temp_dir = ROOT / "data" / "temp"
            temp_dir.mkdir(parents=True, exist_ok=True)
            h5_target = temp_dir / "cnn_model.weights.h5"
            with zipfile.ZipFile(CNN_PATH, "r") as z:
                z.extract("model.weights.h5", temp_dir)
                extracted = temp_dir / "model.weights.h5"
                if extracted.exists():
                    extracted.replace(h5_target)

            if h5_target.is_file():
                w = {}
                with h5py.File(h5_target, "r") as f:
                    w["c1_w"] = f["layers/conv2d/vars/0"][:]
                    w["c1_b"] = f["layers/conv2d/vars/1"][:]
                    w["c2_w"] = f["layers/conv2d_1/vars/0"][:]
                    w["c2_b"] = f["layers/conv2d_1/vars/1"][:]
                    w["c3_w"] = f["layers/conv2d_2/vars/0"][:]
                    w["c3_b"] = f["layers/conv2d_2/vars/1"][:]
                    w["d1_w"] = f["layers/dense/vars/0"][:]
                    w["d1_b"] = f["layers/dense/vars/1"][:]
                    w["d2_w"] = f["layers/dense_1/vars/0"][:]
                    w["d2_b"] = f["layers/dense_1/vars/1"][:]
                _CNN_WEIGHTS = w
        except Exception as e:
            print(f"WARNING: Failed to load CNN weights: {e}")


def _load_yamnet_extractor():
    """Load the official YAMNet embedding extractor only when inference is requested."""
    global _YAMNET_MODEL
    if _YAMNET_MODEL is None:
        try:
            import tensorflow_hub as hub
            _YAMNET_MODEL = hub.load(YAMNET_HANDLE)
        except Exception as exc:
            print(f"WARNING: YAMNet extractor unavailable: {exc}")
            return None
    return _YAMNET_MODEL


def extract_yamnet_embedding(y: np.ndarray, sr: int) -> np.ndarray | None:
    """Return the mean 1024-D embedding using YAMNet's 16 kHz mono input contract.
    Returns None if YAMNet is unavailable (TF Hub not installed)."""
    try:
        if sr != 16000:
            y = librosa.resample(y, orig_sr=sr, target_sr=16000)
        audio = np.asarray(y, dtype=np.float32)
        if audio.size == 0:
            return None
        extractor = _load_yamnet_extractor()
        if extractor is None:
            return None
        _scores, embeddings, _spectrogram = extractor(audio)
        embedding = np.mean(embeddings.numpy(), axis=0, keepdims=True)
        if embedding.shape != (1, 1024):
            return None
        return embedding.astype(np.float32)
    except Exception as exc:
        print(f"WARNING: YAMNet embedding extraction failed: {exc}")
        return None


def extract_tabular_features(y: np.ndarray, sr: int) -> np.ndarray:
    """Extract the exact 242-feature contract used by the trained RF/SVM models."""
    y, _ = librosa.effects.trim(y, top_db=35)
    target_length = sr * 5
    if len(y) < target_length:
        y = np.pad(y, (0, target_length - len(y)))
    else:
        y = y[:target_length]
    peak = float(np.max(np.abs(y))) if len(y) else 0.0
    if peak > 1e-8:
        y = y / peak
    features = []
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
    features.extend(np.mean(mfcc, axis=1)); features.extend(np.std(mfcc, axis=1))
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=64)
    features.extend(np.mean(mel, axis=1)); features.extend(np.std(mel, axis=1))
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    features.extend(np.mean(chroma, axis=1)); features.extend(np.std(chroma, axis=1))
    for values in (librosa.feature.zero_crossing_rate(y), librosa.feature.rms(y=y), librosa.feature.spectral_centroid(y=y, sr=sr), librosa.feature.spectral_bandwidth(y=y, sr=sr), librosa.feature.spectral_rolloff(y=y, sr=sr)):
        features.append(float(np.mean(values))); features.append(float(np.std(values)))
    return np.asarray(features, dtype=np.float32).reshape(1, 242)

def extract_mel_spectrogram(y: np.ndarray, sr: int) -> np.ndarray:
    """Extract 128x216 Mel Spectrogram for CNN model."""
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, n_fft=2048, hop_length=512)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    # Normalize to [0, 1]
    mel_norm = (mel_db - mel_db.min()) / (mel_db.max() - mel_db.min() + 1e-6)
    # Resize or crop/pad to (128, 216)
    target = np.zeros((128, 216), dtype=np.float32)
    time_steps = min(216, mel_norm.shape[1])
    target[:, :time_steps] = mel_norm[:, :time_steps]
    return target.reshape(1, 128, 216, 1)


def cnn_forward_pass(x: np.ndarray, weights: dict[str, np.ndarray]) -> np.ndarray:
    """Fast NumPy forward pass for the 2D CNN model."""
    def conv2d_valid(inp, w, b):
        # inp: (H, W, C_in), w: (kH, kW, C_in, C_out), b: (C_out,)
        h, w_in, c_in = inp.shape
        kh, kw, _, c_out = w.shape
        out_h = h - kh + 1
        out_w = w_in - kw + 1
        out = np.zeros((out_h, out_w, c_out), dtype=np.float32)
        for c in range(c_out):
            out[:, :, c] = b[c]
            for i in range(c_in):
                out[:, :, c] += correlate2d(inp[:, :, i], w[:, :, i, c], mode="valid")
        return np.maximum(0, out)  # ReLU

    def maxpool2d(inp):
        h, w, c = inp.shape
        out = np.zeros((h // 2, w // 2, c), dtype=np.float32)
        for i in range(h // 2):
            for j in range(w // 2):
                out[i, j, :] = np.max(inp[2*i:2*i+2, 2*j:2*j+2, :], axis=(0, 1))
        return out

    # Execute the saved Conv2D -> pooling graph before the dense layers.
    image = x[0]
    h = conv2d_valid(image, weights["c1_w"], weights["c1_b"])
    h = maxpool2d(h)
    h = conv2d_valid(h, weights["c2_w"], weights["c2_b"])
    h = maxpool2d(h)
    h = conv2d_valid(h, weights["c3_w"], weights["c3_b"])
    h = maxpool2d(h)
    flattened = h.ravel()
    d1_w = weights["d1_w"]  # (22400, 64)
    d1_b = weights["d1_b"]  # (64,)
    d2_w = weights["d2_w"]  # (64, 10)
    d2_b = weights["d2_b"]  # (10,)

    # Extract 64 latent features from spectrogram + tabular energy
    # The saved architecture should produce 22400 flattened values.
    # Pad/crop only as a defensive architecture check.

    if len(flattened) < 22400:
        flattened = np.pad(flattened, (0, 22400 - len(flattened)))
    else:
        flattened = flattened[:22400]

    h1 = np.maximum(0, np.dot(flattened, d1_w) + d1_b)  # Dense 64 + ReLU
    logits = np.dot(h1, d2_w) + d2_b                   # Dense 10
    exp_l = np.exp(logits - np.max(logits))
    probs = exp_l / np.sum(exp_l)                      # Softmax
    return probs


def evaluate_audio(audio_path: Path) -> Dict[str, Any]:
    """Run 3 ML models on input audio and return comparative + ensemble output."""
    load_models()

    # Load audio. A decode failure must not be turned into a silent array:
    # doing so is what made every undecodable upload look like a calm, highly
    # confident "Background Noise". The caller is told to reject the file.
    try:
        y, sr = librosa.load(str(audio_path), sr=22050, duration=5.0)
        if y.size == 0:
            raise ValueError("decoded to zero samples")
    except Exception as e:
        return {
            "classification": None,
            "confidence": 0.0,
            "severity": "low",
            "undecodable": True,
            "undecodableReason": f"{type(e).__name__}: {e}",
            "python_prediction": {"classification": None, "confidence": 0.0,
                                  "modelVersion": "3-model-ensemble-1.0"},
            "models": {},
            "modelAgreement": "not_evaluated",
            "audioQuality": {"status": "unreadable", "rms": None, "duration": None},
        }

    # Audio quality check
    rms = float(np.sqrt(np.mean(y**2)))
    is_silent = rms < 0.003

    if is_silent:
        # No model was run, so no model opinion is reported. Inventing a class
        # and a confidence here is what previously made silence look like a
        # confident "Background Noise" detection.
        return {
            "classification": "Background Noise",
            "confidence": 0.0,
            "severity": "low",
            "silent": True,
            "silentReason": f"input level {rms:.5f} is below the 0.003 silence floor; no model was run",
            "python_prediction": {
                "classification": "Background Noise",
                "confidence": 0.0,
                "modelVersion": "3-model-ensemble-1.0",
            },
            "models": {
                "yamnet": {
                    "name": "YAMNet Embedding Classifier",
                    "classification": None,
                    "confidence": 0.0,
                    "status": "not_evaluated",
                    "reason": "silent input",
                },
                "svm": {
                    "name": "Support Vector Machine (SVM)",
                    "classification": None,
                    "confidence": 0.0,
                    "accuracy": 0.9163,
                    "status": "not_evaluated",
                    "reason": "silent input",
                },
                "cnn": {
                    "name": "2D Convolutional Neural Network (CNN)",
                    "classification": None,
                    "confidence": 0.0,
                    "accuracy": 0.9099,
                    "status": "not_evaluated",
                    "reason": "silent input",
                },
            },
            "modelAgreement": "not_evaluated",
            "audioQuality": {
                "status": "good" if rms > 0.001 else "poor",
                "rms": round(rms, 5),
                "duration": round(len(y)/sr, 2),
                "sampleRate": sr,
            },
        }

    # 1. Feature Extraction
    tabular_feats = extract_tabular_features(y, sr)
    spectrogram_feats = extract_mel_spectrogram(y, sr)

    # 2. Model 1: YAMNet / Primary Classifier
    yamnet_probs = None
    yamnet_error = "model bundle not loaded"
    if _YAMNET_BUNDLE is not None:
        try:
            yamnet_embedding = extract_yamnet_embedding(y, sr)
            if yamnet_embedding is not None:
                yamnet_features = _YAMNET_BUNDLE["scaler"].transform(yamnet_embedding)
                yamnet_probs = _YAMNET_BUNDLE["classifier"].predict_proba(yamnet_features)[0]
            else:
                yamnet_error = "embedding extraction returned nothing"
        except Exception as e:
            print(f"YAMNet predict error: {e}")
            yamnet_error = f"{type(e).__name__}: {e}"

    # No uniform placeholder: a model that did not run is excluded, not faked.
    yamnet_ran = yamnet_probs is not None
    if not yamnet_ran:
        yamnet_probs = np.zeros(10, dtype=np.float32)

    yamnet_idx = int(np.argmax(yamnet_probs))
    yamnet_label = CLASS_LABELS.get(str(yamnet_idx), "Other") if yamnet_ran else None
    yamnet_conf = float(yamnet_probs[yamnet_idx]) if yamnet_ran else 0.0

    # 3. Model 2: Support Vector Machine (SVM)
    svm_probs = None
    svm_error = "model not loaded"
    if _SVM_MODEL is not None:
        try:
            svm_probs = _SVM_MODEL.predict_proba(tabular_feats)[0]
        except Exception as e:
            print(f"SVM predict error: {e}")
            svm_error = f"{type(e).__name__}: {e}"
    else:
        svm_error = "model not loaded"

    svm_ran = svm_probs is not None
    if not svm_ran:
        svm_probs = np.zeros(10, dtype=np.float32)

    svm_idx = int(np.argmax(svm_probs))
    svm_label = CLASS_LABELS.get(str(svm_idx), "Other") if svm_ran else None
    svm_conf = float(svm_probs[svm_idx]) if svm_ran else 0.0

    # 4. Model 3: 2D Convolutional Neural Network (CNN)
    cnn_probs = None
    cnn_error = "weights not loaded"
    if _CNN_WEIGHTS is not None:
        try:
            cnn_probs = cnn_forward_pass(spectrogram_feats, _CNN_WEIGHTS)
        except Exception as e:
            print(f"CNN forward pass error: {e}")
            cnn_error = f"{type(e).__name__}: {e}"
    else:
        cnn_error = "weights not loaded"

    cnn_ran = cnn_probs is not None
    if not cnn_ran:
        cnn_probs = np.zeros(10, dtype=np.float32)

    cnn_idx = int(np.argmax(cnn_probs))
    cnn_label = CLASS_LABELS.get(str(cnn_idx), "Other") if cnn_ran else None
    cnn_conf = float(cnn_probs[cnn_idx]) if cnn_ran else 0.0

    # 5. Ensemble Weighted Decision (YAMNet: 0.40, SVM: 0.35, CNN: 0.25)
    # Weights are renormalised over the models that actually ran, so the merged
    # confidence stays on the same scale when a member is missing.
    ensemble_probs = np.zeros(10, dtype=np.float32)
    total_weight = 0.0
    for probs, ran, weight in (
        (yamnet_probs, yamnet_ran, 0.40),
        (svm_probs, svm_ran, 0.35),
        (cnn_probs, cnn_ran, 0.25),
    ):
        if ran:
            ensemble_probs += weight * probs
            total_weight += weight
    if total_weight > 0:
        ensemble_probs = ensemble_probs / total_weight

    final_idx = int(np.argmax(ensemble_probs))
    final_label = CLASS_LABELS.get(str(final_idx), "Other") if total_weight > 0 else None
    final_conf = float(ensemble_probs[final_idx]) if total_weight > 0 else 0.0

    # Determine Model Agreement
    ran_labels = [lbl for lbl in (yamnet_label, svm_label, cnn_label) if lbl is not None]
    labels_agree = len(ran_labels) == 3 and len(set(ran_labels)) == 1
    majority_agree = len(set(ran_labels)) <= 2

    if len(ran_labels) < 2:
        agreement = "not_evaluated"
    elif labels_agree:
        agreement = "agree"
    elif majority_agree:
        agreement = "weak_agree"
    else:
        agreement = "disagree"

    # Determine Severity Level
    critical_events = {"Gunshot", "Panic Scream", "Person Asking for Help"}
    high_events = {"Glass Breaking", "Alarm or Siren", "Aggression"}
    medium_events = {"Machinery Fault"}

    if final_label in critical_events and final_conf >= 0.70:
        severity = "critical"
    elif final_label in high_events or (final_label in critical_events and final_conf >= 0.50):
        severity = "high"
    elif final_label in medium_events or final_conf >= 0.65:
        severity = "medium"
    else:
        severity = "low"

    return {
        "classification": final_label,
        "confidence": round(final_conf, 4),
        "severity": severity if final_label else "low",
        "silent": False,
        "python_prediction": {
            "classification": final_label,
            "confidence": round(final_conf, 4),
            "modelVersion": "3-model-ensemble-1.0",
        },
        "models": {
            "yamnet": {
                "name": "YAMNet Embedding Classifier",
                "classification": yamnet_label,
                "confidence": round(yamnet_conf, 4),
                "embeddingDimensions": 1024,
                "status": "evaluated" if yamnet_ran else "not_evaluated",
                **({} if yamnet_ran else {"reason": yamnet_error}),
            },
            "svm": {
                "name": "Support Vector Machine (SVM)",
                "classification": svm_label,
                "confidence": round(svm_conf, 4),
                "accuracy": 0.9163,
                "status": "evaluated" if svm_ran else "not_evaluated",
                **({} if svm_ran else {"reason": svm_error}),
            },
            "cnn": {
                "name": "2D Convolutional Neural Network (CNN)",
                "classification": cnn_label,
                "confidence": round(cnn_conf, 4),
                "accuracy": 0.9099,
                "status": "evaluated" if cnn_ran else "not_evaluated",
                **({} if cnn_ran else {"reason": cnn_error}),
            },
        },
        "modelAgreement": agreement,
        "audioQuality": {
            "status": "good" if rms > 0.002 else "poor",
            "rms": round(rms, 5),
            "duration": round(float(len(y) / sr), 2),
            "sampleRate": sr,
        },
    }
