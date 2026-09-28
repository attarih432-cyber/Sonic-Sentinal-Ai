# SonicSentinel AI — Developer Guide

Everything in this guide was verified against the running code on **28 Sep 2026**. Where the
repository's own documentation disagrees with the code, this guide follows the **code** and flags
the discrepancy. See [`VERIFICATION_REPORT.md`](./VERIFICATION_REPORT.md) for the full discrepancy log.

---

## 1. What this project is

A full-stack acoustic event classification platform:

- **Frontend** — React 18 + TypeScript + Vite (`src/`)
- **Backend** — FastAPI (Python) (`ml-service/app/`)
- **ML engine** — 3-model weighted ensemble (`ml-service/app/model_evaluator.py`)
- **Database** — SQLite by default, MongoDB optional (`ml-service/app/sqlite_db.py`)
- **Deployment** — single Docker container on Railway (`Dockerfile`, `railway.json`)

The app classifies audio into 10 categories and raises severity-based alerts.

### The 10 classes

Loaded at runtime from `ml-service/models/python_model/class_labels.json`:

| Idx | Label | Severity tier |
|:---:|-------|---------------|
| 0 | Machinery Fault | medium |
| 1 | Glass Breaking | high |
| 2 | Alarm or Siren | high |
| 3 | Vehicle Horn | low |
| 4 | Animal Sound | low |
| 5 | Gunshot | critical |
| 6 | Panic Scream | critical |
| 7 | Aggression | high |
| 8 | Person Asking for Help | critical |
| 9 | Background Noise | low |

> The severity column above is the *design intent* from `model_evaluator.py:330–332`. The
> effective severity is confidence-dependent — see the Severity & Alert flow diagram.

---

## 2. Verified environment

Measured on the development machine:

| Component | Verified value |
|-----------|----------------|
| Python | **3.12.10** (the root `README.md` says 3.11 — see **M-3**) |
| librosa | 1.0.0 |
| scikit-learn | 1.8.0 |
| numpy | 2.5.3 |
| tensorflow | 2.20.0 |
| keras | 3.15.1 |
| joblib | 1.5.3 |
| h5py | 3.16.0 |
| soundfile | 0.12.1 |
| Database | SQLite — `data/sonic_sentinel.db` |

`tensorflow` is **not actually needed at inference time.** The CNN is run as a raw NumPy
forward pass and the YAMNet embedding extractor is pulled from TF Hub. If you are trimming the
image size, `tensorflow` and `tensorflow-hub` are the largest removable dependencies — but test
carefully first, since YAMNet loading goes through `tfhub.dev`.

---

## 3. Setup

### 3.1 Backend

```bash
cd ml-service
pip install -r requirements.txt
```

Create the environment file:

```bash
cp .env.example .env
```

Minimum required in `ml-service/.env`:

```env
ADMIN_EMAIL=your-admin@example.com
ADMIN_USERNAME=Your Admin Name
ADMIN_PASSWORD=<strong-unique-password>
SESSION_DAYS=7
COOKIE_SECURE=false          # set true behind HTTPS
```

Run it:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Confirm it is healthy:

```bash
curl http://localhost:8000/health
```

Verified response on a working install:

```json
{"status":"ok","model":"baseline","database":"connected","databaseEngine":"sqlite","databaseReason":"","databaseDetail":""}
```

> `model: "baseline"` is what this endpoint returns. It is **not** a sign that the ML engine is
> broken — the field reflects the TFJS metadata block, not the Python ensemble. See **M-4**.

### 3.2 Create the admin account

```bash
cd ml-service
python -m app.create_admin
```

This is **idempotent** — TEST 12 confirms re-running it does not create a duplicate admin.
The public signup form can never create an admin; the role is hard-coded server-side.

### 3.3 Frontend

```bash
npm install
npm run dev
```

App: `http://localhost:5173` · API: `http://localhost:8000`

### 3.4 ⚠️ Known build blocker

`npx tsc --noEmit` currently **fails with 4 errors** on this commit:

```
src/components/Modals.tsx(106,102): error TS18048: 'detection.confidence' is possibly 'undefined'.
src/components/Modals.tsx(116,102): error TS18048: 'detection.confidence' is possibly 'undefined'.
src/pages.tsx(570,11): error TS2322: Type 'pages.Detection' is not assignable to type 'api/detections.Detection'.
  Types of property 'severity' are incompatible. Type 'string' is not assignable to type '"low" | "medium" | "high" | "critical" | undefined'.
src/pages.tsx(1153,11): error TS2322: (same cause)
```

Root cause is a duplicated `Detection` type. `src/pages.tsx:55` declares a local `Detection`
that **widens `severity` to `string`**, while `src/api/detections.ts` uses a strict union. The
local type then gets passed to components expecting the strict one.

Fix by narrowing the local type instead of widening it:

```ts
// src/pages.tsx:55
export interface Detection extends Omit<ApiDetection, 'classification' | 'confidence' | 'severity'> {
  classification: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';   // <-- keep the union
}
```

This matters beyond local dev: the Railway `Dockerfile` runs `npm run build`, so **deployments
are blocked until this is fixed** unless `build` is configured to skip type-checking. Check
`package.json` before assuming the pipeline is green.

---

## 4. Repository layout

```
SonicSentinel AI/
├── src/
│   ├── main.tsx                    Entry + role-based routing (Root → AdminDashboard | UserApp)
│   ├── landing.tsx                 Public landing page
│   ├── pages.tsx                   User pages: Overview, Analyze, History, Alerts,
│   │                               Review, Reports, Models, Analytics, Settings, Generic
│   ├── live.tsx                    LiveMonitorPage (getUserMedia + 3.5s chunk loop)
│   ├── admin/AdminDashboard.tsx    9-section admin console
│   ├── auth/                       AuthContext, AuthCard
│   │   └── ProtectedRoute.tsx.disabled   ← DEAD FILE, see **F-1**
│   ├── api/                        client.ts, auth.ts, detections.ts, …
│   ├── components/                 Modals.tsx, AudioVisuals.tsx
│   ├── ui.tsx  brand.tsx  styles.css
│
├── ml-service/
│   ├── app/
│   │   ├── main.py                 FastAPI app, 40 route handlers
│   │   ├── model_evaluator.py      3-model ensemble inference
│   │   ├── create_admin.py         Admin bootstrap CLI (idempotent)
│   │   └── sqlite_db.py            SQLite layer
│   ├── models/python_model/
│   │   ├── class_labels.json       The 10-class map (source of truth)
│   │   ├── sonicsentinel_yamnet_model.pkl   dict{classifier, scaler, classes}
│   │   ├── svm_model.pkl           sklearn Pipeline
│   │   ├── cnn_model.keras         Keras archive
│   │   ├── random_forest_model.pkl ← EXISTS BUT NEVER LOADED — see **M-1**
│   │   └── metadata.json           TFJS Speech Commands metadata
│   ├── data/                       SQLite db + uploads/ (gitignored)
│   └── test_security.py            12 live integration tests
│
├── documentation/                  Full documentation package
├── Dockerfile  railway.json  Procfile
└── build_*.py                      Documentation build scripts
```

---

## 5. The ML engine in detail

`app/model_evaluator.py` is the heart of the system. Understand this before changing anything.

### 5.1 Lazy loading and validation

`load_models()` (line 66) runs once and caches at module level. It is **not** defensive-only —
it actively rejects malformed artifacts:

- YAMNet bundle must be a `dict` containing `classifier`, `scaler`, `classes`
- `bundle["classes"]` must **exactly equal** the order of `class_labels.json`
- `classifier.n_features_in_` must be `1024`

If any check fails it logs `WARNING: Failed to load YAMNet classifier: …` and continues with
that model set to `None`. **A warning here is not cosmetic** — it silently degrades the ensemble.

> Because class order is pinned, reordering `class_labels.json` will invalidate the YAMNet model.
> If you change the taxonomy, you must retrain or re-map the models too.

### 5.2 The CNN runs without TensorFlow

`cnn_model.keras` is a zip archive. The code unzips only `model.weights.h5` and pulls ten tensors
by hard-coded H5 paths:

```
layers/conv2d/vars/{0,1}      layers/conv2d_1/vars/{0,1}
layers/conv2d_2/vars/{0,1}    layers/dense/vars/{0,1}      layers/dense_1/vars/{0,1}
```

Then `cnn_forward_pass()` does Conv2D ×3 → Global Average Pooling → Dense → Dense → softmax in
NumPy, using `scipy.signal.correlate2d`.

**Consequence:** if you retrain the CNN with a different layer count, name, or ordering, the
forward pass breaks silently. The H5 paths are a hard coupling to the training architecture.

### 5.3 The ensemble

```python
ensemble_probs = (0.40 * yamnet_probs) + (0.35 * svm_probs) + (0.25 * cnn_probs)
```

> The comment on line 312 says `RF: 0.40` — that is **wrong**, it is YAMNet. The root `README.md`
> repeats the same mistake. See **M-2**.

`cnn_probs is None` is a hard failure (`RuntimeError`). YAMNet and SVM failures degrade
gracefully. That asymmetry is intentional but means a broken SVM produces a 2-model ensemble
that still returns a confident-looking score.

### 5.4 Model agreement

Three levels, surfaced in the UI:

| Value | Condition |
|-------|-----------|
| `agree` | all three labels identical |
| `weak_agree` | exactly two labels match |
| `disagree` | all three differ |

### 5.5 Severity ladder

```python
critical_events = {"Gunshot", "Panic Scream", "Person Asking for Help"}
high_events     = {"Glass Breaking", "Alarm or Siren", "Aggression"}
medium_events   = {"Machinery Fault"}
```

Resolution order (line 334):

1. critical label **and** conf ≥ 0.70 → `critical`
2. high label, **or** critical label with conf ≥ 0.50 → `high`
3. medium label, **or** conf ≥ 0.65 → `medium`
4. otherwise → `low`

Note that rule 3 means a high-confidence detection of *any* class can be escalated to `medium`
by confidence alone.

---

## 6. API surface

40 route handlers. Full reference in [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md).

| Group | Endpoints |
|-------|-----------|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/forgot-password` · `GET /auth/me` · `PATCH /auth/profile` |
| OAuth | `GET /auth/google`, `/auth/google/callback`, `/auth/facebook`, `/auth/facebook/callback` |
| Detections | `POST /detections/analyze`, `POST /predict` · `GET /detections`, `/detections/{id}`, `/detections/{id}/audio` |
| Alerts | `GET /alerts` · `PATCH /alerts/{id}` |
| Reviews | `GET /reviews` · `POST /reviews` |
| Models | `GET /models`, `/model/status` |
| Reports | `GET /reports/overview`, `/reports/activity`, `/reports/severity` |
| Live | `POST /live/sessions/start`, `/live/sessions/{id}/stop`, `/live/analyze` · `GET /live/sessions`, `/live/sessions/active` |
| Admin | `GET /api/admin/overview`, `/users`, `/users/{id}`, `/detections`, `/alerts`, `/reports`, `/system`, `/logs` · `PATCH`+`DELETE` on `/users/{id}` |
| System | `GET /health` |

### Upload guard rails

`POST /detections/analyze` enforces, in order:

- `source` ∈ `{upload, live}` → else 422
- extension ∈ `{wav, mp3, ogg, m4a, flac, aac}` → else 415
- non-empty content → else 422
- size ≤ `MAX_UPLOAD_BYTES` (100 MB) → else 413
- content sniff → **currently a no-op, see S-1**

Files are stored as `uuid4() + suffix`, never under the user-supplied name. The original name is
kept in the DB record for display.

---

## 7. Auth & security model

- **Session cookie** `sonic_session`, HTTP-only
- **PBKDF2-SHA256**, 310,000 iterations, stored as `salt$hash`
- **Role source of truth** is the server (`GET /auth/me`), never `localStorage`
- **Public signup cannot escalate** — `role` is hard-coded to `user` in the handler
- **Admin guard** on all `/api/admin/*` routes returns 403 for non-admins
- **User data isolation** — detection queries are filtered by `user_id`

---

## 8. Testing

### 8.1 Security suite — 12/12 passing

```bash
# terminal 1 — the tests are LIVE integration tests, a running server is mandatory
cd ml-service
python -m uvicorn app.main:app --port 8000

# terminal 2
cd ml-service
python test_security.py
```

Verified result:

```
  RESULTS: 12 passed, 0 failed
  [SUCCESS] ALL TESTS PASSED!
```

| # | Test | Verified behaviour |
|---|------|--------------------|
| 1 | Public signup → `role=user` | 201, role=user |
| 2 | Client `role=admin` ignored | attack silently downgraded |
| 3 | User blocked from `/api/admin` | 403 |
| 4 | Admin API → 403 for user | all 6 endpoints 403 |
| 5 | Admin login succeeds | role=admin |
| 6 | Admin wrong password rejected | 401 |
| 7 | Admin can list users | 200 |
| 8 | User cannot list users | 403 |
| 9 | User data isolation | scoped correctly |
| 10 | No credentials in response | no `password_hash` field |
| 11 | Password stored hashed | `salt$hash`, len 97 |
| 12 | No duplicate admin on re-run | idempotent |

> ⚠️ Do **not** run this as `pytest`. It is a script with module-level `test_*` functions that
> take required arguments (`fn(user_email)`), so pytest collects them and reports
> `TypeError`/errors rather than running the suite. Use `python test_security.py`.

### 8.2 Manual smoke test

```bash
curl http://localhost:8000/health
curl http://localhost:8000/model/status
```

Then in the browser: register → Upload Audio → drop a WAV → confirm you get a per-model
breakdown, an ensemble label, a confidence, and a severity badge.

---

## 9. Frontend architecture

### Role-based routing (`src/main.tsx:330–399`)

```
Root
├── loading?              → full-screen loader
├── user && role=admin    → <AdminDashboard>
├── user && role=user     → <UserApp>
├── view === 'auth'       → <AuthCard>
└── else                  → <LandingPage>
```

There is no router library in the active path. `page` is `useState` inside `UserApp`, and admin
sections are switched with a `switch` in `AdminDashboard.tsx:995–1001`. The app has **no
addressable URLs** — refreshing always lands on the landing page.

**Security note:** this is a UI-level gate, not an access control. It is safe here *only*
because the backend independently enforces RBAC. Do not treat hiding the admin component as
authorization.

### User navigation (10 items, `src/pages.tsx:41–52`)

Dashboard · Upload Audio · Live Monitoring · Event History · Alerts · Manual Review · Reports ·
Models · Analytics · Settings

### Admin navigation (9 items, `src/admin/AdminDashboard.tsx:962–972`)

Overview · Users · Detections · Alerts · Reports · Models · Logs · System · Settings

---

## 10. Configuration reference

### `ml-service/.env` (backend)

| Variable | Default | Notes |
|----------|---------|-------|
| `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | used by `create_admin` |
| `SESSION_DAYS` | 7 | cookie lifetime |
| `COOKIE_SECURE` | false | **set `true` in production** |
| `MAX_UPLOAD_BYTES` | 104857600 | 100 MB |
| `UPLOAD_DIR` | `./ml-service/data/uploads` | |
| `MODEL_CONFIDENCE_THRESHOLD` | 0.75 | |
| `ALERT_CONFIDENCE_THRESHOLD` | 0.85 | |
| `ALERT_COOLDOWN_SECONDS` | 60 | per user+severity+class dedup window |
| `YAMNET_HANDLE` | `https://tfhub.dev/google/yamnet/1` | embedding extractor |
| `USE_SQLITE` | — | `true` forces SQLite over Mongo |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | — | optional OAuth |
| `FACEBOOK_APP_ID` / `_SECRET` / `_REDIRECT_URI` | — | optional OAuth |

### Root `.env` (Vite)

Only `VITE_*` vars reach the browser. The template at `.env.example` documents backend vars for
reference — they are **not** exposed to the client.

---

## 11. Deployment (Railway)

`Dockerfile` is multi-stage: builds React → builds Python → serves from one container on
Railway's `$PORT`.

Required Railway variables:

```env
USE_SQLITE=true
SESSION_DAYS=7
COOKIE_SECURE=true
ADMIN_EMAIL=...
ADMIN_USERNAME=...
ADMIN_PASSWORD=<strong, unique>
```

System packages the build installs: `ffmpeg`, `libsndfile1`.

Deploy: push to `main`; Railway auto-builds.

> **Two things to fix before you deploy:** (1) the TypeScript errors in §3.4 will fail
> `npm run build`; (2) `COOKIE_SECURE` must be `true` or session cookies are sent over plaintext.

---

## 12. Housekeeping debt

Work through these in order; each is small.

| # | Item | Effort |
|---|------|--------|
| **T-1** | Fix 4 TypeScript errors (blocks build) | 20 min |
| **S-1** | `sniff_audio_content()` returns `True` on every branch — remove the `or True` and make it actually reject | 30 min |
| **M-1** | Decide on `random_forest_model.pkl`: wire it in or delete it + correct the README | 1 h |
| **M-2** | Fix the `RF: 0.40` comment in `model_evaluator.py:312` and the README ensemble line | 5 min |
| **M-4** | Fix typos in `metadata.json` word labels: `Alaram`→`Alarm`, `vehical`→`Vehicle` | 5 min |
| **F-1** | Delete `src/auth/ProtectedRoute.tsx.disabled` or restore it | 5 min |
| **D-1** | Reconcile duplicate doc files (`dataset_card.md` vs `dataset-card.md`, etc.) | 1 h |
| **R-1** | Remove the plaintext admin password from the root `README.md` | 5 min |
| **R-2** | Rotate `ADMIN_PASSWORD` in `ml-service/.env` — it is a default shipped in a git repo | 5 min |

---

## 13. Dataset provenance

**There is currently no dataset provenance for this project**, and none could be verified. The
repository contains no download script, no URL manifest, no licence file, and no training corpus.
`documentation/dataset/audio-inventory.csv` describes the 38 runtime uploads in
`ml-service/data/uploads/`, not a training set.

Concretely: **no file anywhere in the repository mentions Freesound, Pixabay, ElevenLabs, Urban8k,
or ESC-50.** The model label set traces to Google's Speech Commands v0.04 TFJS metadata
(`models/python_model/metadata.json`), which is a different thing entirely and does not explain
the training corpus.

Because this is a Final Year Project with a competition submission, provenance is the one area
where a gap is disqualifying rather than merely untidy. `documentation/dataset/PROVENANCE.md`
contains a capture script and a fill-in template so the answer can be recorded from **your actual
download history** — which is the only version of this claim that is worth making.
