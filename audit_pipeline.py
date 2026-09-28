import sys
import json
from pathlib import Path
import numpy as np
import librosa
import joblib
import csv
import zipfile
import h5py

MODEL_DIR = Path("D:/SonicSentinel AI/ml-service/models/python_model")
CLASS_LABELS_PATH = MODEL_DIR / "class_labels.json"
SVM_PATH = MODEL_DIR / "svm_model.pkl"
CNN_PATH = MODEL_DIR / "cnn_model.keras"

CLASS_LABELS = json.loads(CLASS_LABELS_PATH.read_text(encoding="utf-8"))

print("=== 1. CLASS LABELS MAPPING ===")
print("Python class_labels.json:")
for k, v in sorted(CLASS_LABELS.items(), key=lambda x: int(x[0])):
    print(f"  {k} -> {v}")

gtm_metadata_path = MODEL_DIR / "metadata.json"
if gtm_metadata_path.is_file():
    gtm_meta = json.loads(gtm_metadata_path.read_text())
    print("\nTeachable Machine metadata.json wordLabels:")
    for idx, label in enumerate(gtm_meta.get("wordLabels", [])):
        print(f"  Index {idx} -> {label}")

# Load models
svm_model = joblib.load(SVM_PATH)

# Load CNN weights
temp_dir = Path("D:/SonicSentinel AI/ml-service/data/temp")
temp_dir.mkdir(parents=True, exist_ok=True)
h5_target = temp_dir / "cnn_model.weights.h5"
with zipfile.ZipFile(CNN_PATH, "r") as z:
    z.extract("model.weights.h5", temp_dir)
    extracted = temp_dir / "model.weights.h5"
    if extracted.exists():
        extracted.replace(h5_target)

cnn_weights = {}
with h5py.File(h5_target, "r") as f:
    cnn_weights["c1_w"] = f["layers/conv2d/vars/0"][:]
    cnn_weights["c1_b"] = f["layers/conv2d/vars/1"][:]
    cnn_weights["c2_w"] = f["layers/conv2d_1/vars/0"][:]
    cnn_weights["c2_b"] = f["layers/conv2d_1/vars/1"][:]
    cnn_weights["c3_w"] = f["layers/conv2d_2/vars/0"][:]
    cnn_weights["c3_b"] = f["layers/conv2d_2/vars/1"][:]
    cnn_weights["d1_w"] = f["layers/dense/vars/0"][:]
    cnn_weights["d1_b"] = f["layers/dense/vars/1"][:]
    cnn_weights["d2_w"] = f["layers/dense_1/vars/0"][:]
    cnn_weights["d2_b"] = f["layers/dense_1/vars/1"][:]

sys.path.insert(0, "D:/SonicSentinel AI/ml-service")
from app.model_evaluator import extract_tabular_features, extract_mel_spectrogram, cnn_forward_pass

uploads_dir = Path("D:/SonicSentinel AI/ml-service/data/uploads")
files = list(uploads_dir.glob("*.wav")) + list(uploads_dir.glob("*.mp3"))

print(f"\nFound {len(files)} uploaded files. Processing top 10 for empirical prediction audit...")

csv_rows = []
header = ["model", "filename", "actual_class", "predicted_class", "predicted_index", "confidence", "top2_class", "top2_confidence", "top2_margin", "all_probabilities"]

for f in files[:10]:
    y, sr = librosa.load(str(f), sr=22050, duration=5.0)
    feats = extract_tabular_features(y, sr)
    mel = extract_mel_spectrogram(y, sr)

    # 1. SVM
    svm_probs = svm_model.predict_proba(feats)[0]
    sort_idx = np.argsort(svm_probs)[::-1]
    top1_idx, top2_idx = sort_idx[0], sort_idx[1]
    top1_cls, top2_cls = CLASS_LABELS.get(str(top1_idx)), CLASS_LABELS.get(str(top2_idx))
    top1_c, top2_c = float(svm_probs[top1_idx]), float(svm_probs[top2_idx])
    margin = top1_c - top2_c
    csv_rows.append(["SVM", f.name, "Unknown", top1_cls, top1_idx, round(top1_c, 4), top2_cls, round(top2_c, 4), round(margin, 4), [round(x, 4) for x in svm_probs.tolist()]])
    print(f"[SVM] {f.name[:25]}: Top1={top1_cls} ({top1_c:.4f}), Top2={top2_cls} ({top2_c:.4f}), Margin={margin:.4f}")

    # 2. CNN
    cnn_probs = cnn_forward_pass(mel, cnn_weights)
    sort_idx = np.argsort(cnn_probs)[::-1]
    top1_idx, top2_idx = sort_idx[0], sort_idx[1]
    top1_cls, top2_cls = CLASS_LABELS.get(str(top1_idx)), CLASS_LABELS.get(str(top2_idx))
    top1_c, top2_c = float(cnn_probs[top1_idx]), float(cnn_probs[top2_idx])
    margin = top1_c - top2_c
    csv_rows.append(["CNN", f.name, "Unknown", top1_cls, top1_idx, round(top1_c, 4), top2_cls, round(top2_c, 4), round(margin, 4), [round(x, 4) for x in cnn_probs.tolist()]])
    print(f"[CNN] {f.name[:25]}: Top1={top1_cls} ({top1_c:.4f}), Top2={top2_cls} ({top2_c:.4f}), Margin={margin:.4f}")

out_csv = Path("D:/SonicSentinel AI/documentation/model-evidence/raw_prediction_debug.csv")
out_csv.parent.mkdir(parents=True, exist_ok=True)
with open(out_csv, "w", newline="", encoding="utf-8") as f_out:
    writer = csv.writer(f_out)
    writer.writerow(header)
    writer.writerows(csv_rows)

print(f"\nWrote {len(csv_rows)} empirical model prediction rows to {out_csv}")
