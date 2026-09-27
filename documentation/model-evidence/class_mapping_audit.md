# SonicSentinel AI — Class Mapping Audit Report

## 1. Overview
This audit inspects the class index mappings across the training pipeline, saved artifacts (`class_labels.json`), model output structures, backend inference handlers, and frontend UI components.

## 2. Class Mapping Verification Table

| Index | Training Class Name | Saved Model Class (`class_labels.json`) | Inference Class Order (`model_evaluator.py`) | Backend Returned Class | Frontend Displayed Class | Status |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **0** | Machinery Fault | Machinery Fault | Machinery Fault | Machinery Fault | Machinery Fault | ✅ Match |
| **1** | Glass Breaking | Glass Breaking | Glass Breaking | Glass Breaking | Glass Breaking | ✅ Match |
| **2** | Alarm or Siren | Alarm or Siren | Alarm or Siren | Alarm or Siren | Alarm or Siren | ✅ Match |
| **3** | Vehicle Horn | Vehicle Horn | Vehicle Horn | Vehicle Horn | Vehicle Horn | ✅ Match |
| **4** | Animal Sound | Animal Sound | Animal Sound | Animal Sound | Animal Sound | ✅ Match |
| **5** | Gunshot | Gunshot | Gunshot | Gunshot | Gunshot | ✅ Match |
| **6** | Panic Scream | Panic Scream | Panic Scream | Panic Scream | Panic Scream | ✅ Match |
| **7** | Aggression | Aggression | Aggression | Aggression | Aggression | ✅ Match |
| **8** | Person Asking for Help | Person Asking for Help | Person Asking for Help | Person Asking for Help | Person Asking for Help | ✅ Match |
| **9** | Background Noise | Background Noise | Background Noise | Background Noise | Background Noise | ✅ Match |

## 3. Findings
- **Class Indexing Consistency**: The 10 class labels and their integer indices (0 through 9) are **100% consistent** across training, saved model metadata (`class_labels.json`), backend responses, and frontend displays.
- **Label Shift**: There are no accidental label shifts or index offsets between 0 and 9.
- **Conclusion**: Class label mapping is **NOT** the root cause of the misclassification bug.
