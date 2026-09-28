# SonicSentinel AI — Two Models, Two Jobs

Your project runs **two independent classifiers**. They never combine, never vote together, and
one cannot substitute for the other. This document explains what each one is, where it runs, and
why the difference matters.

There is also a naming problem worth fixing: the second model is called "Teachable Machine"
throughout the code and README, but it is not one. Details in §5.

---

## 1. The short version

| | **Your custom model** | **The "Google" model** |
|---|---|---|
| What it is | 3-model weighted ensemble you built | single transfer-learning network with a 10-class head |
| Runs on | the FastAPI server | the visitor's browser |
| Runtime | librosa, scikit-learn, NumPy | TensorFlow.js |
| Owns the answer? | **yes** | no |
| Raises alerts? | **yes** | no |
| Trained on your data | yes (per project) | only the final layer |

The first is the system. The second is a cross-check that is displayed beside it.

---

## 2. Your custom model — the 3-model ensemble

**Code:** `ml-service/app/model_evaluator.py`
**Artifacts:** `ml-service/models/python_model/{sonicsentinel_yamnet_model.pkl, svm_model.pkl, cnn_model.keras}`

Three classifiers run independently on the same audio, each producing a 10-class probability
vector, and those vectors are combined by a fixed weighted sum.

### The three members

| # | Member | Input | Algorithm | Ensemble weight |
|---|--------|-------|-----------|----------------:|
| 1 | **YAMNet classifier** | 1024-D YAMNet embedding | StandardScaler → LogisticRegression | **0.40** |
| 2 | **SVM pipeline** | 242 acoustic features | StandardScaler → SVC (RBF, C=10) | **0.35** |
| 3 | **2D CNN** | 128 × 216 Mel spectrogram | Conv2D ×3 → GlobalAvgPool → Dense ×2 | **0.25** |

### The combination

```python
ensemble_probs = (0.40 * yamnet_probs) + (0.35 * svm_probs) + (0.25 * cnn_probs)
final_label   = CLASS_LABELS[argmax(ensemble_probs)]
```

This is a **weighted vote**, not a stacking or bagging scheme. There is no meta-classifier
learning how to trust each member — the 0.40 / 0.35 / 0.25 split is fixed in the source.

### The 242 features the SVM sees

```
  0: 80    MFCC (n_mfcc=40)        40 means + 40 standard deviations
 80:208   Mel spectrogram (64)    64 means + 64 standard deviations
208:232   Chroma STFT (12)        12 means + 12 standard deviations
232:242   scalar statistics       ZCR, RMS, spectral centroid,
                                    bandwidth, rolloff — mean + std each
```

### Preprocessing applied before any member runs

```
1. librosa.load(sr=22050, mono=True, duration=5.0)
2. librosa.effects.trim(top_db=35)
3. pad or crop to exactly 110,250 samples (5.0 s at 22,050 Hz)
4. peak normalise: y = y / max(abs(y))
5. branch to the three members
```

### What this model owns

This is the model's output — the part that persists and that the system acts on:

- the classification stored on the detection record
- the confidence shown to the user
- the **severity**, which decides alerting
- the alert row and the critical-alert email
- the review-queue flag (`pending_review` when confidence < 0.75 or severity is high/critical)
- everything in Event History, Alerts, Reports, Analytics, and the Admin console

`model_evaluator.py` also reports **agreement** between the three members — `agree`,
`weak_agree`, or `disagree` — which is the honest way to tell the user how much to trust a
result.

---

## 3. The "Google" model — a transfer-learning network in the browser

**Code:** `src/pages.tsx:594–706`
**Served from:** `/tm-model/` — a static mount of `ml-service/models/python_model`
(`ml-service/app/main.py:1526–1528`)
**Files:** `model.json`, `metadata.json`, `weights.bin`
**Runtimes:** `public/vendor/tf.min.js`, `public/vendor/speech-commands.min.js`

### What it actually is

Reading `models/python_model/model.json` shows a **tfjs-layers** network:

```
conv2d_1_input        [null, 43, 232, 1]     8 filters,  2×8 kernel    trainable: false
max_pooling2d_1
conv2d_2            32 filters,  2×4 kernel                        trainable: false
max_pooling2d_2
conv2d_3            32 filters,  2×4 kernel                        trainable: false
max_pooling2d_3
conv2d_4            32 filters,  2×4 kernel                        trainable: false
max_pooling2d_4
flatten_1            → 704
dropout_1           0.25
dense_1              2000 units, relu                              trainable: false
sequential_3 → NewHeadDense   10 units, softmax                     trainable: TRUE
```

**Every convolution is frozen. Only the final 10-way softmax head is trainable.**

`metadata.json` states the backbone plainly:

```json
{"tfjsSpeechCommandsVersion":"0.4.0","modelName":"TMv2",
 "wordLabels":[" Aggression"," Glass Breaking"," Gunshot"," Panic Scream",
               "Alaram or siren","Background Noise","Person Asking for Help",
               "animal sound","machinery fault","vehical horn"]}
```

So the architecture is Google's **Speech Commands v0.04** backbone, with a custom head trained
to map it onto your 10 acoustic classes.

### What that means for your project

| Measure | Value |
|---------|-------|
| Total parameters | ~1,438,682 |
| Trainable parameters | **20,010** (the `NewHeadDense` layer) |
| Share trainable | **~1.4%** |

Roughly 98.6% of this network is Google's, untouched. Your dataset shaped the last 1.4%.

This is exactly the trade-off that makes browser-side models practical — you get a strong
pretrained audio backbone for free — but it also means this model is **not** an independent
trained classifier of your acoustic classes in the way the Python ensemble is. It is Google's
feature extractor plus your label mapping.

### How the browser feeds it audio

Unlike the server pipeline, this path selects the **loudest one-second window** rather than
resampling a fixed 5 seconds:

1. decode the uploaded file at 44,100 Hz
2. slide a 1-second window (44,100 samples) forward in 0.1 s steps
3. score each window by summed absolute amplitude
4. run the highest-energy window through `recognizer.recognize()`

### The label alias fix

`model.json` carries the misspellings `Alaram or siren` and `vehical horn`. Rather than editing
the shipped weights, the frontend patches them at display time
(`src/pages.tsx:680–686`):

```ts
const aliases: Record<string, string> = {
  'alaram or siren': 'Alarm or Siren',
  'vehical horn':    'Vehicle Horn',
  'animal sound':    'Animal Sound',
};
```

---

## 4. The difference that actually matters: independence

The two models are deliberately kept apart, and the code enforces that.

### The Python result is the only one that persists

`ml-service/app/main.py:766` writes the detection record with:

```python
"teachable_prediction": None,
```

It is stored as `None` on every detection. The browser model never writes to the database.

### The browser model is never allowed to stand in for the server

`src/pages.tsx:699–701`:

```ts
// Never synthesize a Teachable Machine score from the Python result.
setGtmResult(null);
setGtmError('Teachable Machine could not produce a prediction for this audio.');
```

If the TFJS model fails, the UI shows an error. It does not quietly reuse the ensemble's numbers
and relabel them as a second opinion. This is the right call — a fallback that looks like two
independent models agreeing is worse than one model with no second opinion.

### When the browser model does not run at all

- the audio is shorter than one second, or
- `/tm-model/` is unreachable, or
- `speechCommands.create()` throws, or
- the runtimes in `public/vendor/` fail to load

In every case you see the ensemble result alone, and the second panel reports why it is empty.

---

## 5. Three naming problems worth fixing

The code calls the browser model "GTM" everywhere. It is not a Teachable Machine model.

| What the code calls it | What it is |
|---|---|
| `GTM_MODEL_URL` | a **local** path, `'/tm-model/'` (`src/pages.tsx:595`) |
| `ensureGtmRuntime` | loads the **Speech Commands** runtime, not the TM SDK (`pages.tsx:617–618`) |
| "Teachable Machine" (UI label, `pages.tsx:957`) | a **tfjs-layers** model, not a TM GraphModel export |

Consequences:

1. **The README instruction does not apply.** `README.md` says to find
   `const GTM_MODEL_URL` and paste a `https://teachablemachine.withgoogle.com/models/...` URL.
   The variable is a local path, and the model format a TM export would not match. Pasting a TM
   URL there cannot work.

2. **The TM favicon in the UI is misleading** — it labels a Google Speech Commands model as a
   Teachable Machine model.

3. **`modelName: "TMv2"` is probably where the confusion started.** It looks like a Teachable
   Machine v2 export, but the architecture and `tfjsSpeechCommandsVersion` say otherwise.

If you intend to keep calling it Teachable Machine, then the model needs to actually be trained
and exported from Teachable Machine. If you intend to keep the current model, rename the
variable to something accurate like `BROWSER_MODEL_URL` and drop the TM favicon. Either is fine —
the mismatch is the problem.

---

## 6. Side-by-side

| | Custom ensemble | Browser model |
|---|---|---|
| **Location** | `ml-service/app/model_evaluator.py` | `src/pages.tsx:594–706` |
| **Executes on** | server, CPU | the visitor's device, GPU/WASM |
| **Format** | joblib `.pkl` + Keras `.keras` | tfjs-layers `.json` + `weights.bin` |
| **Members** | three | one |
| **Window** | 5.0 s @ 22,050 Hz mono | 1.0 s @ 44,100 Hz, loudest window |
| **Trim** | `top_db=35` silence trim | none — energy-based window pick |
| **Normalise** | peak normalise | none |
| **Feature path** | YAMNet embedding / 242 tabular / Mel image | 43 × 232 spectrogram |
| **Backbone** | YAMNet (TF Hub), trainable | Speech Commands v0.04, **frozen** |
| **Trainable share** | full model | ~1.4% (head only) |
| **Decision rule** | 0.40/0.35/0.25 weighted sum | single softmax argmax |
| **Agreement signal** | yes — `agree` / `weak_agree` / `disagree` | none |
| **Severity** | yes | no |
| **Stored in DB** | yes | no — `teachable_prediction: None` |
| **Fires alerts** | yes | no |
| **Works offline** | yes, once YAMNet is cached | yes, runtimes are vendored |
| **Network round-trip** | required for upload | none |

---

## 7. Why keep both at all

The browser model earns its place for two reasons that have nothing to do with accuracy:

1. **Zero-latency pre-check.** It can run before an upload is sent, so the UI can react without
   waiting on a network round-trip.
2. **Independent disagreement.** When the browser model and the server ensemble disagree, that
   disagreement is information — it suggests the clip sits near a decision boundary, or that the
   loudest-second heuristic picked a different window than the server's fixed 5 s. Surfacing that
   honestly is more useful than pretending to a single authoritative number.

Note the asymmetry: the browser model reports its top 10 scores but contributes no confidence in
the alerting sense. It is a reading, not a verdict.

---

## 8. A caution about the two labels

Because the browser model's head is the only trained part, its label set comes from
`metadata.json` and needs the alias map to line up with `class_labels.json`. Compare them:

| Index | `class_labels.json` (server) | `metadata.json` (browser) |
|---|---|---|
| 0 | Machinery Fault | `machinery fault` |
| 1 | Glass Breaking | ` Glass Breaking` |
| 2 | Alarm or Siren | `Alaram or siren` |
| 3 | Vehicle Horn | `vehical horn` |
| 4 | Animal Sound | `animal sound` |
| 5 | Gunshot | ` Gunshot` |
| 6 | Panic Scream | ` Panic Scream` |
| 7 | Aggression | ` Aggression` |
| 8 | Person Asking for Help | `Person Asking for Help` |
| 9 | Background Noise | `Background Noise` |

The order matches, which is the part that actually matters for correctness. The spelling and
casing differences are cosmetic and handled by the alias map. If you ever regenerate the browser
model, keep the index order identical or the two panels will silently disagree about what index 3
means.
