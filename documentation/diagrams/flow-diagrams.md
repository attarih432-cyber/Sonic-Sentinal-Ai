# SonicSentinel AI — Verified Flow Diagrams

All diagrams in this file are **derived directly from the shipped source code**. Each one cites
the exact file and line ranges that implement the flow, so every box can be traced to code.

**Traceability index**

| # | Diagram | Implemented in |
|---|---------|----------------|
| 1 | System architecture | `ml-service/app/main.py`, `src/main.tsx` |
| 2 | Authentication & session flow | `main.py:508–571` |
| 3 | Audio upload → classification flow | `main.py:730–779` |
| 4 | 3-model ensemble inference flow | `app/model_evaluator.py:66–360` |
| 5 | Severity & alert decision flow | `model_evaluator.py:329–341`, `main.py:676–702` |
| 6 | Live microphone flow | `main.py:977–1090` |
| 7 | RBAC / admin access control | `main.py:1099–1500` |
| 8 | Audio preprocessing pipeline | `model_evaluator.py` (librosa section) |

---

## 1. System Architecture

```mermaid
flowchart TB
    subgraph Browser["Browser — React 18 + TypeScript + Vite"]
        L["Landing Page<br/>src/landing.tsx"]
        AU["Auth Card<br/>src/auth/AuthCard.tsx"]
        UAPP["User App Shell<br/>src/main.tsx:79"]
        ADM["Admin Dashboard<br/>src/admin/AdminDashboard.tsx"]
    end

    subgraph API["FastAPI Backend — ml-service/app/main.py"]
        AUTH["/auth/*<br/>register, login, me, logout, OAuth"]
        DET["/detections/*<br/>analyze, list, get, audio"]
        LIVE["/live/*<br/>sessions, analyze"]
        ADMR["/api/admin/*<br/>9 admin endpoints"]
    end

    subgraph ML["ML Engine — app/model_evaluator.py"]
        YA["YAMNet Embeddings<br/>1024-D → LogReg"]
        SV["SVM Pipeline<br/>242 features"]
        CN["2D CNN<br/>128x216 Mel"]
        ENS["Weighted Ensemble<br/>0.40 / 0.35 / 0.25"]
    end

    DB[("SQLite<br/>sonic_sentinel.db")]
    FILES[("Uploads dir<br/>UUID-named audio")]

    L --> AU
    AU -->|session cookie| AUTH
    AUTH -->|role=admin| ADM
    AUTH -->|role=user| UAPP
    UAPP --> DET
    UAPP --> LIVE
    ADM --> ADMR

    DET --> ML
    LIVE --> ML
    YA --> ENS
    SV --> ENS
    CN --> ENS

    DET --> DB
    ADMR --> DB
    DET --> FILES

    style ML fill:#1a1a2e,stroke:#4ade80,color:#e5e7eb
    style DB fill:#1a1a2e,stroke:#60a5fa,color:#e5e7eb
```

> **Note on the diagram set:** this file supersedes the placeholder `.md` briefs in this folder
> (e.g. `system-architecture.md`, `authentication-flow.md`) which currently contain only
> `Diagram evidence: PENDING VERIFICATION`. See `../VERIFICATION_REPORT.md` finding **D-1**.

---

## 2. Authentication & Session Flow

Implemented at `ml-service/app/main.py:508–571`. The public register endpoint hard-codes
`role="user"`, which is what defeats the privilege-escalation attempt in TEST 2.

```mermaid
flowchart TD
    START([User submits form]) --> Q{Endpoint?}

    Q -->|POST /auth/register| RV{Valid name,<br/>email, password?}
    RV -->|No| E422[422 Validation Error]
    RV -->|Yes| RE{"Email already<br/>exists?"}
    RE -->|Yes| E409[409 Conflict]
    RE -->|No| HASH["PBKDF2-SHA256<br/>310,000 iterations<br/>store salt$hash"]
    HASH --> FORCE["role forced to 'user'<br/>client role=admin IGNORED"]
    FORCE --> INS[(Insert user doc)]
    INS --> R201([201 Created + session cookie])

    Q -->|POST /auth/login| LV{"Credentials<br/>valid?"}
    LV -->|No| E401[401 Unauthorized]
    LV -->|Yes| SC["Set sonic_session<br/>HTTP-only cookie"]
    SC --> R200([200 OK + role])

    R201 --> ME
    R200 --> ME["GET /auth/me"]
    ME --> ROLE{"role?"}
    ROLE -->|user| UDASH[User App Shell]
    ROLE -->|admin| ADASH[Admin Dashboard]

    style E401 fill:#3f1d1d,stroke:#ef4444,color:#fecaca
    style FORCE fill:#1e2a1e,stroke:#4ade80,color:#bbf7d0
```

**Security properties this flow guarantees**

| Property | Where enforced | Verified by |
|----------|----------------|-------------|
| Public signup can never create an admin | server hard-codes `role` | TEST 1, TEST 2 |
| Passwords never stored in plaintext | PBKDF2 + per-user salt | TEST 11 |
| Session cookie is HTTP-only | `set_cookie(httponly=True)` | Manual |
| Response never leaks `password_hash` | serializer field whitelist | TEST 10 |

---

## 3. Audio Upload → Classification Flow

Implemented at `ml-service/app/main.py:730–779`.

```mermaid
flowchart TD
    UP([User uploads audio file]) --> AUTH{{"Session valid?<br/>Depends(current_user)"}}
    AUTH -->|No| E401[401 Unauthorized]
    AUTH -->|Yes| SRC{"source ∈<br/>{upload, live}?"}
    SRC -->|No| E422[422 source invalid]
    SRC -->|Yes| EXT{"Extension ∈<br/>wav mp3 ogg m4a<br/>flac aac?"}
    EXT -->|No| E415[415 Unsupported Media Type]
    EXT -->|Yes| READ["Read up to<br/>MAX_UPLOAD_BYTES+1"]
    READ --> EMPTY{"Content empty?"}
    EMPTY -->|Yes| E422b[422 Empty file]
    EMPTY -->|No| BIG{"Size > 100 MB?"}
    BIG -->|Yes| E413[413 Payload Too Large]
    BIG -->|No| SNIFF["sniff_audio_content()"]
    SNIFF --> SAVE["Write to UPLOAD_DIR<br/>as UUID + ext"]
    SAVE --> EVAL["evaluate_audio(path)"]
    EVAL --> RES["label, confidence, severity,<br/>models{}, modelAgreement"]
    RES --> STAT{"confidence < 0.75<br/>OR severity ∈<br/>{high, critical}?"}
    STAT -->|Yes| PEND["status = pending_review"]
    STAT -->|No| DONE["status = complete"]
    PEND --> INS[(Insert detection doc)]
    DONE --> INS
    INS --> ALERT{"maybe_create_alert()"}
    ALERT --> OUT([201 Created<br/>full detection payload])

    style E415 fill:#3f1d1d,stroke:#ef4444,color:#fecaca
    style SNIFF fill:#3f2d1d,stroke:#f59e0b,color:#fde68a
    style EVAL fill:#1e2a1e,stroke:#4ade80,color:#bbf7d0
```

> ⚠️ **`sniff_audio_content()` is currently inert.** Every branch in
> `main.py:705–721` ends in `or True`, so the function can never return `False`. The
> content-type check above therefore always passes. Tracked as finding **S-1** in
> `../VERIFICATION_REPORT.md`. The diagram shows the *intended* behaviour.

---

## 4. 3-Model Ensemble Inference Flow

Implemented at `ml-service/app/model_evaluator.py:66–360`. This is the core of the ML engine.

```mermaid
flowchart TD
    IN["Audio file path"] --> LOAD["load_models()<br/>lazy, cached at module level"]

    LOAD --> YC{"YAMNet bundle<br/>loads?"}
    YC -->|Yes| YV["Validate: has classifier,<br/>scaler, classes;<br/>class order == class_labels.json;<br/>n_features_in_ == 1024"]
    YV --> YE["tfhub YAMNet →<br/>1024-D embedding"]
    YE --> YSC["StandardScaler"]
    YSC --> YCL["LogisticRegression<br/>→ yamnet_probs"]
    YC -->|No| YSKIP[yamnet_probs = None]

    LOAD --> SC{"SVM pipeline<br/>loads?"}
    SC -->|Yes| STF["242 acoustic features"]
    STF --> SSC["StandardScaler"]
    SSC --> SVC["SVC(RBF, C=10)<br/>→ svm_probs"]
    SC -->|No| SSKIP[svm_probs = None]

    LOAD --> CC{"CNN .keras<br/>unzips + loads?"}
    CC -->|Yes| CEX["Extract model.weights.h5"]
    CEX --> CPULL["Pull 10 weight tensors<br/>conv2d, conv2d_1,<br/>conv2d_2, dense, dense_1"]
    CPULL --> CMS["128x216 Mel spectrogram"]
    CMS --> CFWD["NumPy forward pass<br/>Conv2D x3 + GAP + Dense"]
    CFWD --> CPL["softmax → cnn_probs"]
    CC -->|No| CSKIP[cnn_probs = None]

    YCL --> ENS
    SVC --> ENS
    CPL --> ENS["ensemble_probs =<br/>0.40*YAMNet + 0.35*SVM<br/>+ 0.25*CNN"]
    YSKIP --> ENS
    SSKIP --> ENS
    CSKIP --> ENS

    ENS --> ARG{"cnn_probs is None?"}
    ARG -->|Yes| RAISE["RuntimeError:<br/>CNN produced no prediction"]
    ARG -->|No| FIN["final_idx = argmax(ensemble_probs)<br/>final_label = CLASS_LABELS[final_idx]"]

    FIN --> AGR["Agreement check"]
    AGR --> A1{"All 3 labels equal?"}
    A1 -->|Yes| AG1["agreement = 'agree'"]
    A1 -->|No| A2{"Any 2 equal?"}
    A2 -->|Yes| AG2["agreement = 'weak_agree'"]
    A2 -->|No| AG3["agreement = 'disagree'"]

    AG1 --> OUT["Return classification,<br/>confidence, severity,<br/>models{}, modelAgreement"]
    AG2 --> OUT
    AG3 --> OUT

    style ENS fill:#1e2a1e,stroke:#4ade80,color:#bbf7d0
    style RAISE fill:#3f1d1d,stroke:#ef4444,color:#fecaca
    style YSKIP fill:#3f2d1d,stroke:#f59e0b,color:#fde68a
```

> **Note:** the source comment on line 312 reads `Ensemble Weighted Decision (RF: 0.40, ...)`
> but line 313 actually multiplies **`yamnet_probs`**. The code is correct and the comment is
> wrong. See finding **M-2**.

---

## 5. Severity & Alert Decision Flow

Severity logic at `model_evaluator.py:329–341`; alert creation at `main.py:676–702`.

```mermaid
flowchart TD
    P["final_label + final_conf"] --> SEV{"Severity classification"}

    SEV --> CRIT{"label ∈ {Gunshot,<br/>Panic Scream,<br/>Person Asking for Help}<br/>AND conf ≥ 0.70?"}
    CRIT -->|Yes| SC[severity = critical]

    SEV --> HIGH{"label ∈ {Glass Breaking,<br/>Alarm or Siren, Aggression}<br/>OR (critical label<br/>AND conf ≥ 0.50)?"}
    HIGH -->|Yes| SH[severity = high]

    SEV --> MED{"label = Machinery Fault<br/>OR conf ≥ 0.65?"}
    MED -->|Yes| SM[severity = medium]

    SEV -->|none of the above| SL[severity = low]

    SC --> ALERT
    SH --> ALERT
    SM --> ALERT
    SL --> ALERT

    ALERT{"Create an alert row?"}
    ALERT -->|severity = low| NOALERT[No alert created]
    ALERT -->|severity ≠ low| CD{"Duplicate within<br/>ALERT_COOLDOWN_SECONDS<br/>(default 60s)?"}
    CD -->|Yes| SKIP[Skipped — cooldown active]
    CD -->|No| INSALERT[(Insert alert doc)]
    INSALERT --> EMAIL{"severity = critical?"}
    EMAIL -->|Yes| MAIL["send_resend_alert_email()<br/>to registered user email"]
    EMAIL -->|No| NOMAIL[No email]

    NOALERT --> END([Done])
    SKIP --> END
    NOMAIL --> END
    MAIL --> END

    style SC fill:#3f1d1d,stroke:#ef4444,color:#fecaca
    style SH fill:#3f2d1d,stroke:#f59e0b,color:#fde68a
    style SM fill:#1e2a1e,stroke:#4ade80,color:#bbf7d0
    style SL fill:#1a1a2e,stroke:#64748b,color:#e2e8f0
```

---

## 6. Live Microphone Flow

Implemented at `ml-service/app/main.py:977–1090`.

```mermaid
sequenceDiagram
    autonumber
    participant U as User (Browser)
    participant M as getUserMedia
    participant FE as LiveMonitorPage
    participant BE as FastAPI /live/*
    participant EV as evaluate_audio
    participant DB as SQLite

    U->>M: Click "Start Monitoring"
    M->>M: Request microphone permission
    alt Permission denied
        M-->>FE: NotAllowedError
        FE-->>U: Show permission guidance
    else Granted
        M-->>FE: MediaStream
        FE->>FE: Create AudioContext + AnalyserNode
        FE->>BE: POST /live/sessions/start
        BE->>DB: Insert live session (status=active)
        BE-->>FE: 201 {session_id}

        loop Every 3.5 seconds
            FE->>FE: Capture 3.5s PCM chunk
            FE->>BE: POST /live/analyze (multipart, source="live", session_id)
            BE->>EV: evaluate_audio(chunk)
            EV-->>BE: label, confidence, severity, per-model breakdown
            BE->>DB: Insert detection (source="live")
            opt severity ≠ low
                BE->>DB: maybe_create_alert() (60s cooldown)
                BE-->>M: send_resend_alert_email() if critical
            end
            BE-->>FE: 201 detection payload
            FE-->>U: Push live result card + waveform
        end

        U->>FE: Click "Stop"
        FE->>BE: POST /live/sessions/{id}/stop
        BE->>DB: Set session status = ended
        BE-->>FE: 200 session summary
        FE->>M: Release mic tracks
    end
```

**Session lifecycle state machine** (`main.py:977–1024`)

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Active: POST /live/sessions/start
    Active --> Active: POST /live/analyze (chunks)
    Active --> Ended: POST /live/sessions/{id}/stop
    Active --> Idle: Browser tab closed / mic released
    Ended --> [*]

    note right of Active
        GET /live/sessions/active
        returns the single
        in-progress session
    end note
```

---

## 7. RBAC / Admin Access Control

All 9 admin endpoints are behind the same guard. The frontend *also* hides the admin UI, but the
authoritative check is server-side — this is exactly what TEST 3 and TEST 4 exercise.

```mermaid
flowchart TD
    REQ([Request to /api/admin/*]) --> COOKIE{"sonic_session<br/>cookie present?"}
    COOKIE -->|No| E401[401 Unauthorized]
    COOKIE -->|Yes| LOOKUP["Load user from DB by session id"]
    LOOKUP --> ROLE{"user.role == 'admin'?"}

    ROLE -->|No| E403["403 Forbidden<br/>TEST 3 + TEST 4"]
    ROLE -->|Yes| GUARD["admin_guard passes"]

    GUARD --> EP{"Which endpoint?"}
    EP -->|/overview| O1["Platform KPIs"]
    EP -->|/users| O2["List all users"]
    EP -->|/users/{id}| O3["User detail"]
    EP -->|/users/{id} PATCH| O4["Activate / deactivate / role change"]
    EP -->|/users/{id} DELETE| O5["Delete user (204)"]
    EP -->|/detections| O6["All users' detections"]
    EP -->|/alerts| O7["All alerts"]
    EP -->|/reports| O8["System-wide reports"]
    EP -->|/system| O9["Runtime + DB + model status"]
    EP -->|/logs| O10["Audit log"]

    O1 --> RESP([200 JSON])
    O2 --> RESP
    O3 --> RESP
    O4 --> RESP
    O5 --> RESP
    O6 --> RESP
    O7 --> RESP
    O8 --> RESP
    O9 --> RESP
    O10 --> RESP

    style E403 fill:#3f1d1d,stroke:#ef4444,color:#fecaca
    style GUARD fill:#1e2a1e,stroke:#4ade80,color:#bbf7d0
```

**Data-isolation guarantee for normal users** (`main.py:787–839`)

```mermaid
flowchart LR
    U["Normal user"] --> REQ["GET /detections"]
    REQ --> FILTER["Query filtered by<br/>user_id = session user"]
    FILTER --> ONLY["Only own rows returned"]
    ONLY --> TEST["TEST 9 verifies this"]

    style ONLY fill:#1e2a1e,stroke:#4ade80,color:#bbf7d0
```

---

## 8. Audio Preprocessing Pipeline

Shared by training and inference so the feature space stays consistent.

```mermaid
flowchart TD
    RAW["Raw audio file<br/>any of wav/mp3/ogg/m4a/flac/aac"] --> L1["1. librosa.load<br/>sr=22050, mono=True, duration=5.0"]
    L1 --> L2["2. librosa.effects.trim<br/>top_db=35"]
    L2 --> L3{"Length == 110,250<br/>samples?"}
    L3 -->|Short| PAD["Zero-pad to centre"]
    L3 -->|Long| CROP["Crop to 5.0 s"]
    PAD --> L4
    CROP --> L4["4. Peak normalise<br/>y = y / max abs y"]
    L4 --> BRANCH{"Which model?"}

    BRANCH -->|YAMNet| YF["tfhub YAMNet<br/>→ 1024-D embedding"]
    BRANCH -->|SVM| FEAT["242 features"]
    BRANCH -->|CNN| MEL["128 x 216<br/>Mel spectrogram"]

    FEAT --> IDX1["0:80 — MFCC<br/>40 means + 40 stds"]
    FEAT --> IDX2["80:208 — Mel<br/>64 means + 64 stds"]
    FEAT --> IDX3["208:232 — Chroma STFT<br/>12 means + 12 stds"]
    FEAT --> IDX4["232:242 — scalar stats<br/>ZCR, RMS, centroid,<br/>bandwidth, rolloff"]

    IDX1 --> SCALER[StandardScaler]
    IDX2 --> SCALER
    IDX3 --> SCALER
    IDX4 --> SCALER
    SCALER --> SVMP["SVC(RBF, C=10)"]

    MEL --> CONV["Conv2D x3<br/>32 → 64 → 128"]
    CONV --> GAP["Global Avg Pool"]
    GAP --> DENSE["Dense → Dense"]
    DENSE --> SOFT["Softmax → cnn_probs"]

    style BRANCH fill:#1e2a1e,stroke:#4ade80,color:#bbf7d0
```

---

## Appendix — diagram coverage gaps

These diagrams are **not** in this file because the code does not implement them. Adding them
would mean drawing something that does not exist:

| Requested diagram | Status |
|-------------------|--------|
| CI/CD deployment flow | No CI config in repo (only `railway.json` + `Dockerfile`) |
| Dataset construction pipeline | No dataset build script, manifest, or training corpus in repo — see `../VERIFICATION_REPORT.md` **D-2** |
| Model retraining / drift pipeline | No training script in repo; only pre-built `.pkl` / `.keras` artifacts |
| Random Forest inference stage | `random_forest_model.pkl` exists but is never loaded by any code — see **M-1** |
