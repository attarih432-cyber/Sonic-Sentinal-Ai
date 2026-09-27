# Model Summary

SonicSentinel AI incorporates a 3-model Python ML engine:
1. **Random Forest Classifier**: 400 decision trees, 242 acoustic features. **Accuracy: 93.67%**.
2. **SVM Pipeline**: StandardScaler + SVC (RBF kernel, C=10), 242 acoustic features. **Accuracy: 91.63%**.
3. **2D CNN**: 3 Convolutional blocks (32, 64, 128 filters), Global Average Pooling, Dense layers on 128x216 Mel Spectrograms. **Accuracy: 90.99%**.
