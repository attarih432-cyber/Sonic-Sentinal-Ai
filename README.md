# 🎙️ SonicSentinel AI

<div align="center">

**AcousticX Intelligence Platform — Real-Time Sound Event Classification & Critical Security Monitoring**

[![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://typescriptlang.org)
[![Railway](https://img.shields.io/badge/Deploy-Railway-7B2BF9?logo=railway)](https://railway.app)

*Detect, classify, and alert on 10 critical acoustic event types in real-time.*

</div>

---

## 📌 Project Overview

SonicSentinel AI is a **Final Year AI/ML Project** built for the **Aptech TechWiz 7 — NextWave AI & ML Category**. It is a full-stack audio intelligence platform that:

- Accepts **live microphone streams** or **uploaded audio files**
- Runs audio through a **4-model classification engine** (3 Python ML models + Google Teachable Machine)
- Shows **individual confidence scores** for each model
- Generates a **weighted ensemble verdict**
- Fires **real-time severity alerts** (Critical / High / Medium / Low)
- Provides a **secure Admin Dashboard** with full user & detection management

---

## 🔊 10 Sound Event Categories

| Index | Class Name | Severity |
|:-----:|:-----------|:--------:|
| 0 | Machinery Fault | Medium |
| 1 | Glass Breaking | High |
| 2 | Alarm or Siren | High |
| 3 | Vehicle Horn | Low |
| 4 | Animal Sound | Low |
| 5 | Gunshot | **Critical** |
| 6 | Panic Scream | **Critical** |
| 7 | Aggression / Violent Conflict | High |
| 8 | Person Asking for Help | **Critical** |
| 9 | Background Noise | Low |

---

## 🤖 Machine Learning Models

### Python ML Engine (Backend — FastAPI)

| # | Model | Type | Accuracy | Input | Location |
|---|-------|------|:--------:|-------|----------|
| 1 | **YAMNet Embedding Classifier** | YAMNet + Logistic Regression | Not yet re-evaluated | 1024-D YAMNet embeddings | `ml-service/models/python_model/sonicsentinel_yamnet_model.pkl` |
| 2 | **SVM Pipeline** | StandardScaler + SVC (RBF, C=10) | **91.63%** | 242 acoustic tabular features | `ml-service/models/python_model/svm_model.pkl` |
| 3 | **2D CNN** | Keras Conv2D (3 blocks) | **90.99%** | 128×216 Mel Spectrogram | `ml-service/models/python_model/cnn_model.keras` |

**Ensemble Voting Weights:** `RF × 0.40 + SVM × 0.35 + CNN × 0.25`

### Google Teachable Machine (Browser — Secondary Classifier)

| # | Model | Type | Platform | Status |
|---|-------|------|----------|--------|
| 4 | **Teachable Machine Audio** | Neural Net (TF.js) | In-browser (client-side) | Integrated (URL required) |

> **Important:** Google Teachable Machine runs **entirely in the browser** using TensorFlow.js. It is a **secondary, independent classifier** — its predictions are shown separately below the Python ensemble results. Its output does NOT influence the Python models, and vice versa.

### 242 Acoustic Features (RF & SVM)
```
Indices   0:80  — MFCC (n_mfcc=40): 40 Means + 40 Stds
Indices  80:208 — Mel Spectrogram (n_mels=64): 64 Means + 64 Stds
Indices 208:232 — Chroma STFT (n_chroma=12): 12 Means + 12 Stds
Indices 232:242 — ZCR, RMS, Spectral Centroid, Bandwidth, Rolloff (mean+std each)
```

### Audio Preprocessing Pipeline (Training & Inference)
```
1. Load audio:  librosa.load(sr=22050, mono=True, duration=5.0)
2. Trim silence: librosa.effects.trim(top_db=35)
3. Pad or crop:  to exactly 110,250 samples (5.0s @ 22050Hz)
4. Peak normalize: y = y / max(|y|)
5. Extract features → feed to RF / SVM (tabular) or CNN (spectrogram)
```

---

## 🏗️ System Architecture

```
Browser (React + TypeScript + Vite)
         │
         ▼  REST API (cookie session)
FastAPI Backend (Python 3.11)
         │
         ├── /auth/*        ─── Signup / Login / OAuth / Logout
         ├── /detections/*  ─── Audio upload + 3-model inference
         ├── /live/*        ─── 3.5s microphone chunk analysis
         └── /api/admin/*   ─── Admin-only management (RBAC guarded)
                    │
                    ▼
         3-Model Python ML Engine
         ├── YAMNet Embedding Classifier (sonicsentinel_yamnet_model.pkl)
         ├── SVM Pipeline  (svm_model.pkl)
         └── 2D CNN        (cnn_model.keras — NumPy forward pass)
                    │
                    ▼
         SQLite (default) / MongoDB Atlas (optional)

Browser also runs ─► Google Teachable Machine (TF.js — client-side only)
```

---

## 🔐 Authentication & Admin Access

### User Roles

| Role | How Created | Access |
|------|-------------|--------|
| `user` | Public `/auth/register` signup page | Own detections, history, live monitor |
| `admin` | **CLI only** — `python -m app.create_admin` | Full Admin Dashboard: all users, all detections, system management |

> ⚠️ **Security Rule:** The public signup form has **no role selector**. Any client-side attempt to set `role=admin` or `isAdmin=true` is **strictly rejected by the backend**.

### Admin Account (Initial Setup)

```
Email:    admin@sonicsentinel.com
Username: SonicSentinel Admin
Password: SonicAdmin@2024!
```

To create the admin account on a new deployment:
```bash
cd ml-service
python -m app.create_admin
```

Or set these environment variables and run the command:
```env
ADMIN_EMAIL=admin@sonicsentinel.com
ADMIN_USERNAME=SonicSentinel Admin
ADMIN_PASSWORD=SonicAdmin@2024!
```

### Password Security
- **Algorithm:** PBKDF2-SHA256 with 310,000 iterations
- **Storage:** Only the salt + hash stored in DB — never plaintext

---

## 📊 Dataset

| Metric | Value |
|--------|-------|
| Total Audio Clips | **6,211** |
| Total Duration | **20,632.6 seconds** (~5.73 hours) |
| Classes | **10** |
| Training Split | 4,347 clips (70%) |
| Validation Split | 932 clips (15%) |
| Test Split | 932 clips (15%) |
| Duplicate Groups | 1,950 unique content groups (SHA-256 deduped) |

**Class-wise sample counts:**
| Class | Count |
|-------|------:|
| Machinery Fault | 681 |
| Glass Breaking | 734 |
| Alarm or Siren | 524 |
| Vehicle Horn | 327 |
| Animal Sound | 928 |
| Gunshot | 826 |
| Panic Scream | 349 |
| Aggression / Violent Conflict | 802 |
| Person Asking for Help | 300 |
| Background Noise | 740 |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+
- `librosa`, `scikit-learn`, `h5py`, `joblib`, `soundfile`, `numpy` installed

### 1. Backend
```bash
cd ml-service
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend
```bash
npm install
npm run dev
```

App runs at: **http://localhost:5173**
API runs at: **http://localhost:8000**

### 3. Create Admin Account
```bash
cd ml-service
python -m app.create_admin
```

---

## ☁️ Railway Cloud Deployment

```bash
# Push to GitHub main branch → Railway auto-builds from Dockerfile
git push origin main
```

**Environment Variables (set in Railway dashboard):**
```env
USE_SQLITE=true
SESSION_DAYS=7
ADMIN_EMAIL=admin@sonicsentinel.com
ADMIN_USERNAME=SonicSentinel Admin
ADMIN_PASSWORD=YourStrongPassword@2024!
```

Railway will:
1. Build the React frontend (`npm run build`)
2. Build the Python 3.11 backend (`pip install requirements.txt`)
3. Install system deps: `ffmpeg`, `libsndfile1`
4. Serve everything from a single container on Railway's auto-assigned `$PORT`

---

## 📁 Project Structure

```
SonicSentinel AI/
├── src/                          ← React TypeScript frontend
│   ├── pages.tsx                 ← Main app pages (Dashboard, Analyze, History…)
│   ├── live.tsx                  ← Live microphone monitor
│   ├── admin/AdminDashboard.tsx  ← Admin-only dashboard (9 sections)
│   ├── api/                      ← API client modules
│   └── components/               ← Shared UI components
│
├── ml-service/
│   ├── app/
│   │   ├── main.py               ← FastAPI backend (~1,450 lines)
│   │   ├── model_evaluator.py    ← 3-model inference engine
│   │   ├── create_admin.py       ← Admin creation CLI
│   │   └── sqlite_db.py          ← SQLite DB layer
│   └── models/python_model/
│       ├── sonicsentinel_yamnet_model.pkl
│       ├── svm_model.pkl
│       ├── cnn_model.keras
│       └── class_labels.json
│
├── documentation/                ← Complete FYP documentation package
│   ├── Project_Report.docx       ← Professional Word report
│   ├── Project_Report.pdf        ← PDF version
│   ├── SonicSentinel_Project_Presentation.pptx  ← 20-slide deck
│   ├── SRS_COMPLIANCE_MATRIX.md  ← 99-item requirements traceability
│   ├── API_DOCUMENTATION.md      ← Full REST API spec
│   ├── AI_USAGE.md               ← AI tool transparency declaration
│   ├── diagrams/                 ← 21 system architecture diagrams
│   ├── graphs/                   ← 15 evaluation graphs & confusion matrices
│   ├── model-evidence/           ← Per-model accuracy evidence
│   ├── dataset/                  ← Dataset card and data dictionary
│   └── testing/                  ← Test plan, report, results
│
├── Dockerfile                    ← Multi-stage Railway production build
├── railway.json                  ← Railway platform configuration
└── RAILWAY_DEPLOYMENT.md         ← Step-by-step deployment guide
```

---

## 🧪 Security Tests

```bash
cd ml-service
python -m pytest test_security.py -v
```

**Result: 12/12 Tests PASSED** — covers RBAC isolation, role injection prevention, password hashing, admin endpoint protection, and user data isolation.

---

## 🔧 Google Teachable Machine Setup

To connect your trained Teachable Machine audio model:

1. Train your model at [teachablemachine.withgoogle.com](https://teachablemachine.withgoogle.com)
2. Export → **TensorFlow.js** format → Copy the model URL
3. Open `src/pages.tsx`, find:
   ```typescript
   const GTM_MODEL_URL = 'https://teachablemachine.withgoogle.com/models/YOUR_GTM_MODEL_ID/';
   ```
4. Replace `YOUR_GTM_MODEL_ID` with your actual model ID
5. Run `npm run build` → commit → push to Railway

---

## 📃 License

Built for academic and competition purposes. All models, code, and documentation are property of the development team.
