# 🔬 SonicSentinel AI — Complete Prediction Pipeline Audit Report

**Audit Date:** September 28, 2026  
**Status:** COMPLETE (Diagnostic Findings Documented — No Models Modified)

---

## 📌 1. Class Label Mapping Audit

### Comparative Index Table

| Index | Python (`class_labels.json`) | Google Teachable Machine (`metadata.json`) | Status / Discrepancy |
|:-----:|:-----------------------------|:-------------------------------------------|:---------------------|
| **0** | `Machinery Fault`            | ` Aggression`                              | 🚨 **Mismatch** (Machinery vs Aggression) |
| **1** | `Glass Breaking`             | ` Glass Breaking`                          | ✅ Matching |
| **2** | `Alarm or Siren`             | ` Gunshot`                                 | 🚨 **Mismatch** (Alarm vs Gunshot) |
| **3** | `Vehicle Horn`               | ` Panic Scream`                            | 🚨 **Mismatch** (Horn vs Scream) |
| **4** | `Animal Sound`               | `Alaram or siren`                          | 🚨 **Mismatch** (Animal vs Alarm) |
| **5** | `Gunshot`                    | `Background Noise`                         | 🚨 **Mismatch** (Gunshot vs Background) |
| **6** | `Panic Scream`               | `Person Asking for Help`                   | 🚨 **Mismatch** (Scream vs Help) |
| **7** | `Aggression`                 | `animal sound`                             | 🚨 **Mismatch** (Aggression vs Animal) |
| **8** | `Person Asking for Help`     | `machinery fault`                          | 🚨 **Mismatch** (Help vs Machinery) |
| **9** | `Background Noise`           | `vehical horn`                             | 🚨 **Mismatch** (Background vs Horn) |

> ⚠️ **Key Finding:** Google Teachable Machine uses a custom index mapping exported by TF.js SpeechCommands, whereas the Python ML engine uses alphabetical folder sorting (`0..9`). Passing a GTM index directly into the Python index lookup maps **Gunshot (Index 2 in GTM)** to **Alarm or Siren (Index 2 in Python)**!

---

## 🤖 2. Teachable Machine Audit

- **Model Topology:** `model.json` + `weights.bin` + `metadata.json` (SpeechCommands BROWSER_FFT)
- **Class Labels Order:** `[' Aggression', ' Glass Breaking', ' Gunshot', ' Panic Scream', 'Alaram or siren', 'Background Noise', 'Person Asking for Help', 'animal sound', 'machinery fault', 'vehical horn']`
- **Root Cause of Repeated Predictions:**
  1. SpeechCommands `recognizer.recognize()` expects a 1-second 44,100Hz audio frame. Passing multi-second raw audio files without sliding window extraction forced the recognizer into fallback evaluation loops.
  2. Fallback indexing previously defaulted to index 0 (`" Aggression"`) or mapped index 2 (`"Gunshot"`) onto Python class 2 (`"Alarm or Siren"`).

---

## 🌲 3. Random Forest, SVM & CNN Empirical Audit

### Raw Model Probabilities across 5 Uploaded Files

#### Audio File 1: `02fec425-7f9e-475c-b093-fe44e41adf91.wav`
- **Random Forest:** Top1 = `Vehicle Horn` (0.2450), Top2 = `Alarm or Siren` (0.2250) [Margin: 0.0200]
- **SVM:** Top1 = `Alarm or Siren` (0.5217), Top2 = `Vehicle Horn` (0.3518) [Margin: 0.1699]
- **CNN:** Top1 = `Alarm or Siren` (0.6077), Top2 = `Gunshot` (0.1200) [Margin: 0.4877]
- **Ensemble Verdict:** `Alarm or Siren` (Combined Score: 0.5513)

#### Audio File 2: `1a912d67-5cc1-427b-9ff0-d5d5ee38f193.wav`
- **Random Forest:** Top1 = `Vehicle Horn` (0.2050), Top2 = `Alarm or Siren` (0.1750) [Margin: 0.0300]
- **SVM:** Top1 = `Alarm or Siren` (0.5217), Top2 = `Vehicle Horn` (0.3518) [Margin: 0.1699]
- **CNN:** Top1 = `Alarm or Siren` (0.6449), Top2 = `Gunshot` (0.1345) [Margin: 0.5104]
- **Ensemble Verdict:** `Alarm or Siren` (Combined Score: 0.5658)

#### Audio File 3: `2ed2d61b-7ebb-4a8d-8275-e627bf0b54e1.wav`
- **Random Forest:** Top1 = `Machinery Fault` (0.2150), Top2 = `Vehicle Horn` (0.2000) [Margin: 0.0150]
- **SVM:** Top1 = `Alarm or Siren` (0.4762), Top2 = `Vehicle Horn` (0.3821) [Margin: 0.0941]
- **CNN:** Top1 = `Alarm or Siren` (0.5626), Top2 = `Gunshot` (0.2006) [Margin: 0.3620]
- **Ensemble Verdict:** `Alarm or Siren` (Combined Score: 0.4933)

#### Audio File 4: `3c2e33a0-4d72-4ac1-b4cb-24ba9232807f.wav`
- **Random Forest:** Top1 = `Alarm or Siren` (0.2900), Top2 = `Vehicle Horn` (0.1750) [Margin: 0.1150]
- **SVM:** Top1 = `Alarm or Siren` (0.5136), Top2 = `Vehicle Horn` (0.3577) [Margin: 0.1559]
- **CNN:** Top1 = `Alarm or Siren` (0.7346), Top2 = `Gunshot` (0.1055) [Margin: 0.6291]
- **Ensemble Verdict:** `Alarm or Siren` (Combined Score: 0.4794)

#### Audio File 5: `7b17a5c8-c65f-459b-8f24-51ebcc261e8c.wav`
- **Random Forest:** Top1 = `Alarm or Siren` (0.3900), Top2 = `Panic Scream` (0.1500) [Margin: 0.2400]
- **SVM:** Top1 = `Alarm or Siren` (0.5217), Top2 = `Vehicle Horn` (0.3518) [Margin: 0.1699]
- **CNN:** Top1 = `Alarm or Siren` (0.9457), Top2 = `Gunshot` (0.0339) [Margin: 0.9118]
- **Ensemble Verdict:** `Alarm or Siren` (Combined Score: 0.7050)

---

## 📐 4. Feature Extraction & Preprocessing Audit

### Preprocessing Comparison Table

| Parameter | Training Preprocessing (Colab Notebook) | Production Inference Preprocessing (`model_evaluator.py`) | Impact |
|:----------|:----------------------------------------|:----------------------------------------------------------|:-------|
| **Feature Shape** | `(1, 242)` | `(1, 242)` | ✅ Shapes Match |
| **Peak Normalization** | Raw amplitude range | `y = y / max(\|y\|)` peak normalized | 🚨 **Scale Mismatch**: Shifts RMS & Mel scale |
| **StandardScaler** | Fitted on raw amplitude features | Pipeline applies fitted `StandardScaler` to normalized features | 🚨 Out-of-distribution feature shift |
| **CNN Normalization** | Log Mel Spectrogram (`db`) | `(mel_db - min) / (max - min)` [0, 1] scaled | 🚨 Alters Conv2D activation thresholds |

---

## 🛠️ 5. Summary of Root Causes & Diagnostic Verdict

1. **Class Mapping Shift**: Teachable Machine index 2 is `Gunshot`, whereas Python index 2 is `Alarm or Siren`. Displaying GTM index directly without label translation mapped `Gunshot` predictions to `Alarm or Siren`.
2. **Preprocessing Feature Scale Shift**: In production inference, peak normalization (`y = y / peak`) modifies feature magnitudes before passing to `StandardScaler()`. This causes SVM and CNN decision boundaries to drift heavily toward class index 2 (`Alarm or Siren`).
3. **No Hardcoded Fallbacks Found in Backend**: Backend `model_evaluator.py` dynamically computes probability vectors for all 3 models (`predict_proba`). The high probability for `Alarm or Siren` is an empirical output of the feature scale shift, not a hardcoded fallback string.
