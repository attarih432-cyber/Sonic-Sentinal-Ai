# SonicSentinel AI — Acoustic Threat Intelligence

> Forensic-grade acoustic threat classification and real-time audio signal intelligence powered by dual-engine AI (Python ML + Teachable Machine adapter) with a futuristic dark glassmorphism cyber interface.

---

## 🎧 Features

- **Real-Time Stream Telemetry**: Low-latency browser Web Audio API stream capture and continuous audio monitoring.
- **Dual-Engine AI Consensus**: Librosa feature extraction (MFCCs, Spectral Centroid, Chroma, ZCR) with Random Forest & SVM ensemble classifiers, plus Teachable Machine adapter.
- **Critical Event Detection**: Automated rule engine classifying gunshots, sirens, vehicle horns, machinery faults, and anomalies from Low to Critical severity.
- **3D Hologram & Waveform Canvas**: Real-time oscilloscope, spectrogram waterfall, and interactive audio preview waveforms.
- **Embedded Local Database**: Built-in SQLite document-store database (`data/sonic_sentinel.db`) with zero configuration, and seamless MongoDB Atlas fallback.
- **Operator Review & Auditable Pipeline**: Human-in-the-loop validation, exportable security reports, and incident management logs.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Framer Motion, Lucide Icons, Recharts, Axios
- **Backend**: Python 3.10+, FastAPI, Uvicorn, SQLite3, PyMongo, Librosa, NumPy, Scikit-learn
- **Design System**: Dark Glassmorphism, 3D Canvas visualizers, Neon Cyan/Purple cyber aesthetics

---

## 🚀 Quick Start

### 1. Backend (FastAPI ML Service)
```bash
cd ml-service
python -m venv .venv
# Activate venv:
# Windows: .venv\Scripts\activate
# Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000 --host 0.0.0.0
```

### 2. Frontend (Vite + React)
```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🛡️ License

SonicSentinel AI — Acoustic Threat Intelligence Platform. All rights reserved.
