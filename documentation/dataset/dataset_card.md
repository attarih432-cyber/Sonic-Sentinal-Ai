# SonicSentinel AI — Dataset Card

## 1. Overview
The SonicSentinel AI acoustic dataset comprises **6,211 audio clips** across **10 required sound categories** totaling 20,632.6 seconds (approx. 5.73 hours).

## 2. Category Breakdown
1. Machinery Fault: 681 clips
2. Glass Breaking: 734 clips
3. Alarm or Siren: 524 clips
4. Vehicle Horn: 327 clips
5. Animal Sound: 928 clips
6. Gunshot: 826 clips
7. Panic Scream: 349 clips
8. Aggression / Violent Conflict: 802 clips
9. Person Asking for Help: 300 clips
10. Background Noise: 740 clips

## 3. Data Split
- **Training**: 4,347 clips (70%)
- **Validation**: 932 clips (15%)
- **Testing**: 932 clips (15%)
Grouped stratified splitting by content hash was enforced to eliminate duplicate data leakage.
