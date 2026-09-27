# SonicSentinel AI — Preprocessing Comparison Audit

## 1. Overview
This document compares the exact audio preprocessing and feature extraction pipeline used during model training in `SonicSentinel_Training_Models_RF_SVM_CNN.ipynb` against the production inference code in `ml-service/app/model_evaluator.py`.

## 2. Preprocessing & Feature Extraction Parameter Comparison

| Parameter / Feature | Training Pipeline (`SonicSentinel_Training_Models_RF_SVM_CNN.ipynb`) | Production Inference (`model_evaluator.py`) | Match Status | Impact / Severity |
| :--- | :--- | :--- | :---: | :--- |
| **Sample Rate (SR)** | `22050` Hz | `22050` Hz | ✅ Match | None |
| **Clip Duration** | `5.0` seconds (`TARGET_LENGTH = 110250` samples) | `5.0` seconds (`duration=5.0`) | ✅ Match | None |
| **Channels** | `mono=True` | `mono=True` | ✅ Match | None |
| **Audio Trimming** | `librosa.effects.trim(y, top_db=35)` | **NOT PERFORMED** | ❌ Mismatch | High: Background silence skews energy & MFCC means |
| **Peak Normalization** | `y = y / np.max(np.abs(y))` | **NOT PERFORMED** | ❌ Mismatch | High: Volume differences alter feature scales |
| **Padding / Trimming** | `np.pad(y, (0, TARGET_LENGTH - len(y)))` to exactly 110,250 samples | **NOT PERFORMED** | ❌ Mismatch | High: Variable clip lengths produce inconsistent STFT frames |
| **Feature Vector Length (RF & SVM)** | **242 Features** | **242 Features** | ⚠️ Length Match | Length matches, but contents differ |
| **Feature 1-80 (Indices 0:80)** | `MFCC(n_mfcc=40)`: 40 means + 40 stds | `MFCC(20)` mean/std (40) + `MFCC Delta(20)` mean/std (40) | ❌ **CRITICAL MISMATCH** | **Corrupts first 80 input dimensions** |
| **Feature 81-208 (Indices 80:208)** | `MelSpectrogram(n_mels=64)`: 64 means + 64 stds | `MFCC Delta2(20)` (40) + `Chroma(12)` (24) + `Centroid, Bandwidth, Rolloff, ZCR, RMS` (10) + `SpecContrast` (14) + `Tonnetz` (12) + `Mel30` (60) | ❌ **CRITICAL MISMATCH** | **Corrupts 128 input dimensions** |
| **Feature 209-232 (Indices 208:232)** | `ChromaSTFT(12)`: 12 means + 12 stds | Excess padded values / wrong feature offsets | ❌ **CRITICAL MISMATCH** | **Corrupts 24 input dimensions** |
| **Feature 233-242 (Indices 232:242)** | `ZCR, RMS, Centroid, Bandwidth, Rolloff`: 5 means + 5 stds | Padded zeros | ❌ **CRITICAL MISMATCH** | **Corrupts last 10 input dimensions** |
| **Feature Scaling (SVM)** | `StandardScaler()` fitted in `Pipeline` on 242 training features | Passed un-preprocessed features into `svm.predict_proba()` | ❌ Mismatch | High: Scaler normalizes wrong feature values |
| **CNN Input Format** | `(128, 216, 1)` Mel Spectrogram (`n_mels=128`, `n_fft=1024`, `hop_length=512`, `power_to_db`, `min-max norm [0,1]`) | Dense matrix linear projection fallback used instead of 2D ConvNet forward pass | ❌ **CRITICAL MISMATCH** | High: CNN input image not constructed properly |

## 3. Key Findings
1. **Critical Feature Extraction Mismatch**: The 242 tabular features required by `random_forest_model.pkl` and `svm_model.pkl` were extracted using a completely different feature composition during production inference compared to training.
2. **Missing Audio Normalization**: `librosa.effects.trim(top_db=35)` and peak loudness normalization (`y = y / max|y|`) were omitted in production.
3. **CNN Input Distortion**: Production CNN inference was bypassing full 2D Mel Spectrogram image construction (`128x216x1`).
