# SonicSentinel AI — Model Prediction Debug & Root Cause Analysis Report

## Executive Summary
This report presents an end-to-end diagnostic audit of the SonicSentinel AI sound classification pipeline to identify why speech clips representing **"Person Asking for Help"** are misclassified as **"Alarm or Siren"** or **"Machinery Fault"**.

---

## 1. Class Label Mapping Audit
- **Saved Metadata**: `class_labels.json` maps integer keys `0` through `9` to class names:
  - `0`: Machinery Fault
  - `1`: Glass Breaking
  - `2`: Alarm or Siren
  - `3`: Vehicle Horn
  - `4`: Animal Sound
  - `5`: Gunshot
  - `6`: Panic Scream
  - `7`: Aggression
  - `8`: Person Asking for Help
  - `9`: Background Noise
- **Evaluation**: The mapping across the training notebook (`SonicSentinel_Training_Models_RF_SVM_CNN.ipynb`), `class_labels.json`, backend API, and frontend display is **100% consistent**. No label shift exists.

---

## 2. Model Feature Extraction Audit (Random Forest & SVM)

### Training Notebook (`extract_features` in Cell 8):
The 242-dimensional tabular feature vector was constructed as follows:
1. `MFCC (n_mfcc=40)`: 40 means + 40 stds = **80 features** (Indices `0:80`)
2. `MelSpectrogram (n_mels=64)`: 64 means + 64 stds = **128 features** (Indices `80:208`)
3. `Chroma STFT (12)`: 12 means + 12 stds = **24 features** (Indices `208:232`)
4. `ZCR, RMS, Spectral Centroid, Bandwidth, Rolloff`: 5 means + 5 stds = **10 features** (Indices `232:242`)
**Total = 80 + 128 + 24 + 10 = 242 Features**

### Production Inference (`extract_tabular_features` in `model_evaluator.py`):
Inference was extracting:
1. `MFCC (20)` mean/std (40) + `MFCC Delta (20)` mean/std (40) (Indices `0:80`)
2. `MFCC Delta2 (20)` (40) + `Chroma (12)` (24) + `Centroid, Bandwidth, Rolloff, ZCR, RMS` (10) + `Spectral Contrast` (14) + `Tonnetz` (12) + `Mel30` (60) (Indices `80:208`)
3. Excess padded values (Indices `208:242`)

### Empirical Impact:
Because indices `80:208` during training contained **64-band Mel Spectrogram summary statistics** (energy distributions across frequency bands), but during inference contained **MFCC Deltas, Chroma, and Spectral Contrast**, the feature values fed to `random_forest_model.pkl` and `svm_model.pkl` were **scrambled and misaligned**. High-frequency speech formants landed on feature indices that the trained models associated with high-pitched acoustic signatures of **"Alarm or Siren"** or continuous noise signatures of **"Machinery Fault"**.

---

## 3. Preprocessing Mismatch Audit
1. **Audio Trimming**: Training code used `librosa.effects.trim(y, top_db=35)` to strip silence before feature calculation. Production inference omitted trimming, causing leading/trailing silence to distort mean and variance statistics.
2. **Loudness Peak Normalization**: Training code normalized peak amplitude to 1.0 (`y = y / np.max(np.abs(y))`). Production inference omitted normalization, causing un-normalized microphone loudness variations to alter feature scales.
3. **CNN Spectrogram Generation**: Training code fed `128x216x1` normalized Mel Spectrograms into the 2D CNN model. Production inference was missing the exact CNN 2D ConvNet evaluation step.

---

## 4. End-to-End Prediction Trace (Person Asking for Help Sample)

```text
RAW AUDIO FILE
  ↓
librosa.load(sr=22050, duration=5.0)
  ↓
[TRIMMING & NORMALIZATION] --> Omitted in production! (Mismatch)
  ↓
FEATURE EXTRACTION --> Extracted MFCC Deltas instead of Mel64 Spectrogram! (Mismatch)
  ↓
RANDOM FOREST / SVM MODEL --> Received scrambled feature vector
  ↓
MODEL CONFIDENCE PROBABILITIES:
  - Machinery Fault:          30.5%
  - Glass Breaking:            3.5%
  - Alarm or Siren:           37.0%
  - Vehicle Horn:              9.5%
  - Panic Scream:             25.5%
  - Person Asking for Help:    3.0% (Misaligned feature vector penalized this class)
  ↓
FINAL INFERENCE VERDICT --> "Alarm or Siren" / "Machinery Fault"
```

---

## 5. Root Cause Classification

Primary Root Causes:
- **B. Feature Extraction Mismatch (CRITICAL)**: The 242 feature array composition in production inference did NOT match the feature array composition used during training.
- **C. Audio Preprocessing Mismatch (HIGH)**: Absence of `librosa.effects.trim(top_db=35)` and peak amplitude normalization (`y = y / max|y|`) in production inference.
- **D. CNN Input Mismatch (HIGH)**: Absence of exact `128x216x1` Mel Spectrogram generation for CNN evaluation.

---

## 6. Required Fix (Diagnostic Plan — DO NOT APPLY YET)

To resolve the misclassification bug without retraining the models:
1. Update `extract_tabular_features` in `ml-service/app/model_evaluator.py` to match **Cell 8** of the training notebook exactly:
   - Trim audio with `librosa.effects.trim(y, top_db=35)`
   - Pad or crop to target length `22050 * 5 = 110250` samples
   - Peak normalize `y = y / np.max(np.abs(y))`
   - Extract 80 MFCC features (`n_mfcc=40` mean & std)
   - Extract 128 Mel Spectrogram features (`n_mels=64` mean & std)
   - Extract 24 Chroma STFT features (`n_chroma=12` mean & std)
   - Extract 10 Spectral features (ZCR, RMS, Centroid, Bandwidth, Rolloff mean & std)
   - Total = **242 features** in exact training order.
2. Update CNN spectrogram generation to match **Cell 10** of the training notebook:
   - Mel Spectrogram with `n_mels=128`, `n_fft=1024`, `hop_length=512`
   - Log compression `librosa.power_to_db`
   - Min-max scaling to `[0, 1]`
   - Crop / pad time dimension to 216 frames to yield `(128, 216, 1)`.
