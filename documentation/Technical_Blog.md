# Building SonicSentinel AI: An Audio Event Classification and Critical Sound Detection System

## 1. Introduction
Modern public safety, industrial operations, and facility management rely heavily on automated monitoring. While visual surveillance cameras are widespread, audio surveillance provides critical context in low-visibility environments or blind spots. **SonicSentinel AI** is an advanced acoustic intelligence platform designed to listen to real-time audio from microphone streams or uploaded clips and accurately classify sound events into **10 critical categories**.

## 2. Sound Categories & Problem Statement
In real-world facilities, detecting emergencies early saves lives and prevents catastrophic machinery failure. SonicSentinel AI targets 10 key sound categories:
1. Machinery Fault
2. Glass Breaking
3. Alarm or Siren
4. Vehicle Horn
5. Animal Sound
6. Gunshot
7. Panic Scream
8. Aggression / Violent Conflict
9. Person Asking for Help
10. Background Noise

## 3. System Architecture & 3-Model Python Engine
SonicSentinel AI employs a multi-model ensemble approach combining three distinct machine learning paradigms:
- **Random Forest Classifier**: Trained on 242 acoustic tabular features (MFCCs, Mel64 spectral statistics, Chroma STFT, ZCR, RMS, Spectral Centroid, Bandwidth, and Rolloff). Achieves **93.67% accuracy**.
- **Support Vector Machine (SVM) Pipeline**: Utilizes a `StandardScaler` normalization pipeline combined with an RBF kernel SVC (`C=10`). Achieves **91.63% accuracy**.
- **2D Convolutional Neural Network (CNN)**: Processes 128x216 log-compressed Mel Spectrogram images using 3 convolutional blocks, batch normalization, and global average pooling. Achieves **90.99% accuracy**.

## 4. Real-Time Live Microphone Chunking & Safety Rules
The system captures live microphone audio in 3.5-second chunks using the Web Audio API and MediaRecorder. Chunks are analyzed in real time. Critical events (such as **Gunshots**, **Panic Screams**, and **Person Asking for Help**) that exceed confidence thresholds automatically trigger high-severity alerts.

## 5. Security, RBAC, and Production Deployment
SonicSentinel AI enforces strict Role-Based Access Control (RBAC):
- Public registration strictly assigns `role = "user"`. Client attempts to specify admin privileges are rejected.
- Administrator accounts are initialized via a secure server-side CLI (`python -m app.create_admin`).
- Endpoints under `/api/admin/*` are guarded by the `require_admin` dependency (HTTP 403 Forbidden for non-admins).
- Single-container Docker deployment bundles the React Vite frontend and FastAPI backend for seamless Railway cloud deployment.
