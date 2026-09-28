# SonicSentinel AI — Project Verification Report

**Date:** 28 Sep 2026
**Scope:** Full repository — backend, frontend, ML engine, tests, documentation
**Method:** Static review + live execution. The backend was started, the security suite was run
against it, the API was probed, and the TypeScript compiler was run.

---

## 1. Verdict summary

The **engineering** is in good shape. The backend runs, the security model is real and holds
under test, the ML ensemble is sensibly built, and the API surface is complete.

The **documentation** does not currently match the code, and the **dataset provenance is absent
entirely**. For a Final Year Project with a competition submission, provenance is the gap that
actually costs marks — everything else on this list is fixable in a day.

| Area | Status |
|------|--------|
| Backend runs, DB connects | ✅ verified live |
| Authentication & RBAC | ✅ 12/12 tests pass |
| Password storage | ✅ PBKDF2-SHA256, verified |
| User data isolation | ✅ verified |
| ML ensemble inference | ✅ loads and runs |
| API surface (40 routes) | ✅ complete |
| TypeScript build | ❌ 4 errors, blocks deploy |
| Upload content-sniffing | ❌ no-op, always passes |
| Random Forest model | ❌ trained but never used |
| Ensemble weight documentation | ❌ says RF, code uses YAMNet |
| Dataset provenance | ❌ **no evidence anywhere** |
| 6,211-clip / 5.73 h corpus | ❌ not present on disk |
| Model accuracy claims | ⚠️ unsupported by artifacts |
| Doc/code consistency | ⚠️ two contradictory doc sets |

---

## 2. What was verified working

These are not taken on trust. Each was executed.

### 2.1 Backend boots and serves

```
Database connected: SQLite (data/sonic_sentinel.db)
INFO: Application startup complete.
INFO: Uvicorn running on http://127.0.0.1:8000
```

`GET /health` → `200`

```json
{"status":"ok","model":"baseline","database":"connected","databaseEngine":"sqlite",
 "databaseReason":"","databaseDetail":""}
```

### 2.2 Security suite — 12/12 pass

Run live against the running server:

```
  RESULTS: 12 passed, 0 failed
  [SUCCESS] ALL TESTS PASSED!
```

Server-side access log during the run confirms the enforcement is real, not mocked:

```
POST /auth/register                    201 Created
POST /auth/register                    201 Created      (role=admin in body, ignored)
GET  /api/admin/overview               403 Forbidden    ← user
GET  /api/admin/users                  403 Forbidden
GET  /api/admin/detections             403 Forbidden
GET  /api/admin/alerts                 403 Forbidden
GET  /api/admin/reports                403 Forbidden
GET  /api/admin/system                 403 Forbidden
GET  /api/admin/logs                   403 Forbidden
POST /auth/login (admin)               200 OK
POST /auth/login (bad password)        401 Unauthorized
GET  /api/admin/users                  200 OK           ← admin
```

Test 11 confirmed the stored credential is `salt$hash`, 97 chars, not plaintext. Test 10
confirmed the user serializer exposes only
`['id','name','email','role','active','createdAt']` — no `password_hash`.

> **Caveat worth fixing:** `test_security.py` is a plain script, not a pytest module. Running
> `python -m pytest test_security.py` (as the root `README.md` instructs) produces 5 errors,
> because several `test_*` functions take a required argument. The suite is genuinely good — but
> the documented command to run it is wrong. Use `python test_security.py`.

### 2.3 Installed environment

Python 3.12.10 · librosa 1.0.0 · scikit-learn 1.8.0 · numpy 2.5.3 · tensorflow 2.20.0 ·
keras 3.15.1 · joblib 1.5.3 · h5py 3.16.0 · soundfile 0.12.1

### 2.4 API completeness

40 route handlers confirmed by AST scan, spanning auth, OAuth (Google + Facebook), detections,
alerts, reviews, models, reports, live sessions, 9 admin endpoints, and health.

### 2.5 Frontend structure is coherent

Role-based routing in `src/main.tsx:330–399` is correct: role is read from the server via
`/auth/me`, never from `localStorage`. 10 user nav items and 9 admin nav items map to
implemented pages.

---

## 3. Findings

Severity: **S** = security · **M** = model/ML · **D** = data/documentation · **F** = frontend ·
**R** = repo hygiene

### S-1 — Upload content-sniffing is a no-op 🔴

`ml-service/app/main.py:705–721`

```python
def sniff_audio_content(content: bytes, suffix: str) -> bool:
    if suffix == ".wav":
        return content[:4] == b"RIFF" or b"WAVE" in content[:32] or True   # ← always True
    if suffix == ".mp3":
        return content[:3] == b"ID3" or ... or True                        # ← always True
    ...
    return True                                                           # ← always True
```

Every branch ends in `or True`, so the function can never return `False`. The check at
`main.py:744` therefore always passes. A file named `evil.wav` containing arbitrary bytes is
accepted and written to disk.

**Impact:** the extension allow-list and the 100 MB cap still apply, so this is not an
unauthenticated-write primitive. But the advertised MIME validation does not exist, and a
non-audio payload reaches the librosa decode path.

**Fix:** drop every `or True` and return the real comparison, with an explicit `False` default
and a `try/except` around decode failures at the call site.

### M-1 — The Random Forest is trained but never used 🔴

`random_forest_model.pkl` exists. A repo-wide search for `random_forest` / `RandomForest`
across `ml-service/` returns **zero code references**. `model_evaluator.py` loads exactly three
models: YAMNet, SVM, CNN.

But the root `README.md` presents Random Forest as **model #1 with 93.67% accuracy** — the
highest number in the document — and states the ensemble is
`RF × 0.40 + SVM × 0.35 + CNN × 0.25`.

**Impact:** the README misdescribes the shipped system. A reviewer who asks "show me the RF
contribution to the ensemble" will find nothing, because there isn't one.

**Fix:** either add RF as a genuine fourth ensemble member, or delete the artifact and correct
the README table, the ensemble line, and the `model_summary.md` accuracy claim.

### M-2 — Ensemble weight comment contradicts the code 🟡

`model_evaluator.py:312–313`

```python
# 5. Ensemble Weighted Decision (RF: 0.40, SVM: 0.35, CNN: 0.25)
ensemble_probs = (0.40 * yamnet_probs) + (0.35 * svm_probs) + (0.25 * cnn_probs)
```

The code is right; the comment says RF where the variable is `yamnet_probs`. The root README
repeats the error. Five-minute fix, but it is the kind of error that undermines confidence in
the accuracy table.

### M-3 — Python version mismatch 🟡

README badges and prerequisites say **Python 3.11**; the machine runs **3.12.10** and everything
works. Update the docs to 3.12, or pin 3.11 in the Dockerfile and confirm it still builds.

### M-4 — Typos in the model label metadata 🟡

`ml-service/models/python_model/metadata.json`

```json
[" Aggression"," Glass Breaking"," Gunshot"," Panic Scream","Alaram or siren",
 "Background Noise","Person Asking for Help","animal sound","machinery fault","vehical horn"]
```

`Alaram` → Alarm, `vehical` → Vehicle. Also inconsistent casing and leading spaces. These are
user-visible class names on the Models page.

### M-5 — Model status endpoint reports `baseline` 🟡

`GET /health` and `GET /model/status` return `status: "baseline"`, sourced from
`metadata.json`, which describes a **TFJS Speech Commands v0.04** artifact (`"modelName":"TMv2"`).

This is confusing in two directions: the root README describes model #4 as a
"Google Teachable Machine" model that needs a pasted URL, while the metadata says the shipped
artifact is Google Speech Commands. They are different things, and neither is a
SonicSentinel-trained model.

### M-6 — YAMNet and SVM failures degrade silently 🟡

`model_evaluator.py:81` and `:88` log a warning and continue with that model set to `None`. The
ensemble then runs on fewer models and still returns a confident-looking score. Only the CNN
failure is fatal (`RuntimeError` at line 306).

**Fix:** surface degraded-ensemble state in the detection record, e.g.
`modelsUsed: 2, degraded: true`, so the UI and the admin console can show it.

### D-1 — Two contradictory documentation sets 🔴

The `documentation/` tree contains both an underscore set and a hyphen set, with **opposite**
content:

| File | Content |
|------|---------|
| `dataset/dataset_card.md` | Claims 6,211 clips, 20,632.6 s, 70/15/15 splits, 1,950 content groups |
| `dataset/dataset-card.md` | *"The repository contains runtime uploads, not a labelled training manifest. Source, licensing, taxonomy, duplicate groups, and split policy are PENDING VERIFICATION."* |

The same duplication affects `data_dictionary.md` / `data-dictionary.md`,
`dataset_summary.md` / `dataset-summary.md`, `test_plan.md` / `test-plan.md`, and
`test_results.md` / `test-results.md`.

Meanwhile every diagram brief (`system-architecture.md`, `authentication-flow.md`, …) is a
three-line stub reading `Diagram evidence: PENDING VERIFICATION`, sitting next to 40+ PNGs of
unknown origin.

**Impact:** the underscore set makes confident, specific, unbacked claims. The hyphen set is
honest. A reviewer opening the wrong file reaches a completely different conclusion about the
project. **This is the most damaging documentation problem**, worse than any missing file,
because it presents unverifiable numbers as established fact.

**Fix:** delete the underscore set. Keep one canonical file per artefact. Replace the diagram
stubs with the code-derived diagrams in `diagrams/flow-diagrams.md`.

### D-2 — Dataset provenance is entirely absent 🔴

**This is the finding that matters most for a competition submission.**

A repo-wide search across all source, documentation, and configuration for
`Freesound`, `Pixabay`, `ElevenLabs`, `Urban8k`, `ESC-50` returns **no matches** other than
unrelated npm sponsor URLs in `package-lock.json`.

There is no download script, no URL manifest, no licence file, no retrieval log, and no
training corpus in the repository. `documentation/dataset/audio-inventory.csv` documents the
**35 runtime uploads** in `ml-service/data/uploads/` — and contains only technical columns
(`channels`, `sample_rate_hz`, `frames`, `sample_width_bytes`). It has no source, no licence,
and no class column.

Measured directly with `ml-service/tools/dataset_provenance.py`:

```
files            : 35
readable         : 34
unique (sha256)  : 19
duplicates       : 16
total duration   : 105.12 s (0.03 h)
durations        : {'1-3s': 17, '<1s': 13, '3-5s': 3, '>30s': 1, 'unknown': 1}
sample rates     : {'16000': 17, '44100': 7, '24000': 2, '32000': 7, '48000': 1}
classes found    : 1  (UNLABELLED)
```

**35 files, 105 seconds, 19 unique, no labels.** The documented corpus is
**6,211 clips / 20,632.6 seconds**. The gap is roughly 177×.

The measured audio also contradicts the documented format: the README/`dataset_summary.md`
claims `22,050 Hz, Mono, 16-bit PCM`; the files on disk are 16/24/32/44.1/48 kHz, mostly not
5 s, and include one `.webm` and one `.mp3`.

**On the specific question of "urban noise from Freesound/GitHub/Pixabay, and a help class
generated with Pixabay and ElevenLabs":** nothing in this repository supports that statement, so
it has not been written into the documentation. If it is factually what happened, it should be
recorded from your actual download and generation history — that record is what makes the claim
defensible, and a supervisor or judge may well ask to see it.

`ml-service/tools/dataset_provenance.py` was written to close this gap from evidence. Point it at
the real corpus and it produces a measured inventory, a duplicate analysis, and a provenance
document with the source/licence/synthesis tables **left blank for you to complete from your own
records**. See §5.

### D-3 — Model accuracy claims are unsupported 🔴

| Claim | Source | Supporting artifact |
|-------|--------|---------------------|
| RF **93.67%** | `model_summary.md` | none — and the model is never loaded (**M-1**) |
| SVM **91.63%** | `README.md`, `model_summary.md` | `svm-results.csv` exists — unverified |
| CNN **90.99%** | `README.md`, `model_summary.md` | `cnn-results.csv` exists — unverified |
| YAMNet "Not yet re-evaluated" | `README.md` | honest, and the only one so marked |

`documentation/model-evidence/README.md` states: *"Artifacts and results: PENDING VERIFICATION."*

The three `.csv` result files were not cross-checked against a reproducible evaluation run in
this pass. To make the numbers defensible, ship the evaluation script that regenerates them
from a named test split, and record the split.

### D-4 — Root README publishes the admin password in plaintext 🔴

```markdown
### Admin Account (Initial Setup)
Email:    admin@sonicsentinel.com
Password: SonicAdmin@2024!
```

The same values are the live defaults in `ml-service/.env:26–28`. Anyone with repo access has
admin. For a project going to a competition this is a real exposure.

**Fix:** remove the block from the README, rotate `ADMIN_PASSWORD`, and confirm
`ml-service/.env` is covered by `.gitignore`.

### D-5 — README overstates deliverable sizes 🟡

`README.md:266–270` and `README_DOCUMENTATION.md` advertise "21 system architecture diagrams",
"15 evaluation graphs", "99-item requirements traceability matrix", "20-slide deck".

`documentation/diagrams/` holds 40+ PNGs and `graphs/` holds 15 PNGs, but the corresponding
markdown briefs are stubs and `SRS_COMPLIANCE_MATRIX.md` was not cross-checked. Counts should be
verified before the report is submitted, and each graph should state which evaluation run
produced it.

### F-1 — `ProtectedRoute.tsx` is disabled and dead 🟡

`src/auth/ProtectedRoute.tsx.disabled` contains a working `ProtectedRoute` component that is not
imported anywhere. Navigation is `useState`-based, so the app has no addressable URLs —
refreshing returns you to the landing page and loses your place.

Either restore real routing (better UX, and genuinely useful for an FYP demo) or delete the
dead file so it does not suggest protection that isn't wired up. Note the app is **not**
insecure today: the server enforces RBAC independently, and TEST 3/4 prove it.

### R-1 — Duplicate/stale files in the repo 🟡

- `src/styles.legacy-20260925.css` — superseded stylesheet
- `audit_pipeline.py`, `audit_tmp.py`, `scratch_temp/` — scratch working files
- `.env` present at repo root in addition to `ml-service/.env`

Confirm all are gitignored, and remove the scratch files before submission.

### R-2 — Test command in README is wrong 🟡

`README.md:283` says `python -m pytest test_security.py -v`. That produces 5 errors. The correct
command is `python test_security.py`. See §2.2.

---

## 4. Priority fix list

Ordered by risk of costing marks or breaking a demo.

| # | Finding | Effort | Do first? |
|---|---------|--------|:---------:|
| 1 | **D-2** dataset provenance | 2–4 h | ✅ |
| 2 | **D-1** delete contradictory doc set | 1 h | ✅ |
| 3 | **D-4** remove + rotate admin password | 10 min | ✅ |
| 4 | **T-1** fix 4 TS errors (blocks deploy) | 20 min | ✅ |
| 5 | **S-1** make content-sniffing real | 30 min | |
| 6 | **D-3** justify or remove accuracy claims | 2 h | |
| 7 | **M-1** resolve the Random Forest | 1 h | |
| 8 | **M-2/M-4/M-3** comment, labels, version | 15 min | |
| 9 | **M-6** surface degraded ensembles | 45 min | |
| 10 | **D-5 / F-1 / R-1 / R-2** tidy | 1 h | |

---

## 5. How to close the provenance gap

The script is written and tested:

```bash
# 1. Point it at wherever the real corpus lives
python ml-service/tools/dataset_provenance.py \
  --root "C:/path/to/actual/corpus" \
  --out documentation/dataset/evidence

# 2. Complete the blank tables in documentation/dataset/evidence/provenance.md
#    from your actual download + generation history
```

It writes `inventory.csv` (per-file measured properties + SHA-256), `manifest.json`,
`dataset_card_generated.md` (real measured numbers), and `provenance.md`.

The provenance document deliberately leaves the source table, the licence table, the synthesis
disclosure, the ethics checklist, and the split policy **blank**. Those require knowledge you
hold and no tool can recover from files on disk. That is the point — a provenance section filled
in by guessing is worse than an empty one, because it looks like evidence.

**One specific warning.** If any part of the corpus is TTS-generated (ElevenLabs, or any other
synthesiser), check the terms of the specific plan you used. Several of these services prohibit
using the output to train models. If they do, the generated audio cannot be described as
training data for this project, and that needs to be resolved before the report is submitted —
not after.

**Second warning.** "Person Asking for Help" is the class most likely to be over-populated by
synthesis, because genuine recordings are hard to obtain. If the test split contains synthetic
clips, the reported accuracy for that class is not measuring real-world performance. State
explicitly whether the test split is real-only, synthetic-only, or mixed.

---

## 6. Documentation deliverables produced by this review

| File | Contents |
|------|----------|
| `DEVELOPER_GUIDE.md` | Setup, architecture, ML engine internals, API reference, config, deployment, debt list |
| `USER_GUIDE.md` | End-user and admin guide — pages, reading results, alerts, troubleshooting, privacy |
| `diagrams/flow-diagrams.md` | 8 code-derived Mermaid flow diagrams, each citing its source lines |
| `VERIFICATION_REPORT.md` | This document |
| `../ml-service/tools/dataset_provenance.py` | Provenance capture tool (tested) |

### Suggested documentation cleanup

```
documentation/
├── DEVELOPER_GUIDE.md          NEW
├── USER_GUIDE.md               NEW
├── VERIFICATION_REPORT.md      NEW
├── AI_USAGE.md                 keep
├── API_DOCUMENTATION.md        keep
├── diagrams/
│   └── flow-diagrams.md        NEW  (code-derived, replaces the stubs)
└── dataset/
    ├── PROVENANCE.md           run the tool to generate
    └── evidence/               generated artefacts

DELETE: dataset/dataset_card.md, dataset/dataset_summary.md,
        dataset/dataset_quality_report.md,  (all underscore variants — D-1)
DELETE: diagrams/*.md stubs, src/styles.legacy-*.css, audit_tmp.py
```

---

## 7. Final assessment

The system is genuinely well built where it counts. The security posture is real and
independently verified — 12/12 live tests, server-enforced RBAC, PBKDF2 hashing, working data
isolation. The ML ensemble is a legitimate design with sensible model diversity, honest
agreement reporting, and a confidence-aware severity ladder. None of that is in doubt.

Two things stand between this project and a strong submission:

1. **The documentation currently asserts numbers the project cannot support** — 6,211 clips, a
   5.73-hour corpus, four model accuracies, 21 diagrams, 99 traced requirements — while the
   repository contains 35 audio files totalling 105 seconds and no training corpus at all. The
   honest files and the overclaiming files sit side by side, so which story a reviewer reads
   depends on which filename they open.

2. **There is no dataset provenance record.** For a supervised FYP with a judging panel, this is
   the first thing an examiner asks about and the one thing that cannot be reconstructed
   after the fact.

Neither is a hard engineering problem. The first is mostly deleting files and correcting claims
that the code does not support. The second needs an afternoon with your download history. Both are
worth doing before submission rather than during judging.
