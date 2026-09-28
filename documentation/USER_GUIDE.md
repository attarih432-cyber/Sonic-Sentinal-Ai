# SonicSentinel AI — User Guide

For end users and administrators. No coding knowledge needed.

---

## 1. What SonicSentinel does

SonicSentinel listens to audio and tells you **what sound it is** and **how urgent it is**.

Point it at a recording, or let it listen to your microphone in real time, and it classifies the
sound into one of 10 categories, gives a confidence score, and raises an alert for anything
serious.

### The 10 sound categories

| Category | Typical example | Alert level |
|----------|-----------------|-------------|
| Machinery Fault | Grinding, rattling motor | Medium |
| Glass Breaking | Shattering window | High |
| Alarm or Siren | Fire alarm, police siren | High |
| Vehicle Horn | Car / truck horn | Low |
| Animal Sound | Barking, meowing | Low |
| Gunshot | Firearm discharge | **Critical** |
| Panic Scream | Someone shouting in fear | **Critical** |
| Aggression | Shouting, physical conflict | High |
| Person Asking for Help | "Help!", "Someone call an ambulance" | **Critical** |
| Background Noise | Traffic, wind, hum | Low |

> Alert level is the *typical* level. A very confident detection can be raised, and a marginal
> one can be lowered. The score you see is the one that counts.

---

## 2. Getting started

### Step 1 — Open the app

Go to the site address (e.g. `http://localhost:5173` for a local install). You land on the
welcome page.

### Step 2 — Create an account

1. Click **Get Started** (or **Sign Up**).
2. Fill in your name, email, and a password.
3. Submit.

You are now signed in and land on your **Dashboard**.

> New accounts are always standard users. Administrator access is granted separately by the
> project team — it cannot be selected during signup, and the server ignores any attempt to set
> it. This is a deliberate security control, not a bug.

### Step 3 — Analyse your first sound

1. In the left sidebar click **Upload Audio**.
2. Drag a file onto the drop zone, or click to browse.
3. Wait a few seconds.

You will see the result. Continue to §4 to understand it.

---

## 3. The three ways to use it

### A. Upload a file

Best for reviewing a recording you already have.

**Supported formats:** WAV, MP3, OGG, M4A, FLAC, AAC
**Maximum size:** 100 MB

> Only the first ~5 seconds are analysed, because the models are trained on 5-second windows. A
> longer file is not an error — you are simply hearing the opening of it.

### B. Live monitoring

Best for supervising a space in real time.

1. Click **Live Monitoring** in the sidebar.
2. Click **Start Monitoring**.
3. Your browser will ask for microphone permission → choose **Allow**.
4. SonicSentinel analyses a 3.5-second chunk roughly every 3.5 seconds and streams results in.
5. Click **Stop Monitoring** when done.

**Good to know:**
- You must use a browser with `getUserMedia` support and serve the page over **HTTPS or
  `localhost`** — browsers block microphone access on insecure origins.
- The microphone is released when you stop or close the tab.
- Only one live session runs at a time.

### C. Review & confirm

Every analysis is auto-filed. Anything the system is unsure about is queued for you.

1. Click **Manual Review** in the sidebar.
2. You see detections that need a human decision.
3. Confirm the label or correct it. Corrections feed back into quality control.

---

## 4. Reading a result

When an analysis finishes you get a card like this:

```
┌──────────────────────────────────────────────┐
│  GLASS BREAKING                              │
│  ████████░░  87%  confidence                 │
│  Severity:  ● HIGH                           │
│                                              │
│  Model breakdown                             │
│    YAMNet      Glass Breaking      91%       │
│    SVM         Glass Breaking      86%       │
│    CNN         Alarm or Siren      64%  ⚠️   │
│                                              │
│  Agreement:  weak_agree                       │
└──────────────────────────────────────────────┘
```

### The four things to read

| Field | What it means | What to do with it |
|-------|---------------|--------------------|
| **Classification** | the winning sound category | your headline answer |
| **Confidence** | 0–100% ensemble certainty | below ~65%? treat it as a hint, not a fact |
| **Severity** | Low / Medium / High / Critical | drives alerting and email |
| **Model breakdown** | each model's independent opinion | see below |

### Understanding model agreement

The three models vote independently, and they often disagree. The agreement badge tells you how
much to trust the result:

| Badge | Meaning | How much to trust it |
|-------|---------|----------------------|
| `agree` | all three models picked the same class | high — safe to act on |
| `weak_agree` | two of three matched | medium — sanity-check against the recording |
| `disagree` | all three differ | low — review manually, the ensemble is a guess here |

> A useful rule: if `disagree` **and** confidence is under 70%, assume the answer is unreliable
> and listen to the clip yourself.

---

## 5. Alerts

### How an alert is raised

1. The classified severity is not `low`.
2. No alert of the same severity + class was raised for you in the last **60 seconds** (a
   cooldown, so a continuous siren does not spam you).
3. If the severity is `critical`, an **email** is sent to your registered address.

### Managing alerts

Go to **Alerts** in the sidebar.

- Unread alerts show a badge count on the sidebar item and a dot on the bell icon.
- Open an alert to jump to the detection.
- Mark alerts as read.
- A critical alert with an email also appears in your inbox — check that address too if you are
  relying on email notification.

---

## 6. Reports & Analytics

| Page | What you get |
|------|--------------|
| **Reports** | Exportable summaries of your detections and activity |
| **Analytics** | Charts: class distribution, severity breakdown, activity over time |
| **Models** | What each of the 3 models is, and how it performs |
| **Event History** | Every detection you have ever run, newest first, with audio playback |

**Event History** is the place to re-listen to anything. Each row can play back the stored audio
and shows the original verdict, so you can audit the system's work.

---

## 7. Settings & your account

Click the account row at the bottom of the sidebar (or the avatar top-right).

| Control | What it does |
|---------|--------------|
| **Profile** | update your name and email |
| **Password** | change your password |
| **Theme** | dark / light — also on the sun-moon button in the header |
| **Log out** | ends the session |

### Useful shortcuts

| Key | Action |
|-----|--------|
| `Ctrl/⌘ + K` | jump focus to the search box |
| `Esc` | close the mobile navigation drawer |

---

## 8 Administrator guide

Administrators get a completely different console. If you log in and see the admin dashboard,
your account has the `admin` role.

### Admin sections

| Section | Purpose |
|---------|---------|
| **Overview** | platform KPIs — users, detections, alerts, activity |
| **Users** | every registered account; view detail, activate/deactivate, change role, delete |
| **Detections** | every detection across all users |
| **Alerts** | every alert across the platform |
| **Reports** | system-wide reporting |
| **Models** | loaded model status and configuration |
| **Logs** | audit trail of system activity |
| **System** | runtime info, database health, model health |
| **Settings** | admin-specific configuration |

### Things to watch

- **Users → System Online indicator** — confirms the backend is reachable.
- **Models** — if a model fails to load you get a warning; the ensemble silently drops to
  fewer models, which reduces accuracy without breaking anything visible.
- **Logs** — the first place to look when a user reports "it didn't detect anything".

### Typical admin tasks

**Deactivate a user**
`Users` → select the account → toggle active. The user is signed out and cannot sign back in.
Preferable to deletion, because it preserves their detection history.

**Grant admin**
`Users` → select the account → set role to `admin`. The change applies on their next request.

**Investigate a missed detection**
`Logs` for the timestamp → `Detections` filtered by that user → open the entry → play the
audio → check the model breakdown for a `disagree` badge.

---

## 9. Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Microphone blocked" | browser denied permission, or the page is not on HTTPS/localhost | allow the mic in the site settings; use HTTPS |
| No live results appear | the tab is backgrounded and the browser throttles timers | keep the tab in the foreground during monitoring |
| "Unsupported format" | the file extension is not in the supported list | convert to WAV or MP3 |
| "File exceeds the 100 MB limit" | file too large | trim to a short excerpt |
| Analysis returns `disagree` at low confidence | the models are genuinely uncertain | treat as inconclusive; review manually |
| I cannot see the admin dashboard | your account is a standard user | ask the project team to grant the role |
| Login says invalid credentials | wrong email or password | note there is no self-service reset; ask the team |
| An alert did not arrive | cooldown window active, or severity was `low` | check the Alerts page directly |

---

## 10. Privacy

- Audio you upload or capture is stored on the server so you can review it later in
  **Event History**.
- Audio you capture via **Live Monitoring** is analysed in 3.5-second chunks; each chunk is
  stored as a detection.
- Passwords are never stored in readable form — only a salted PBKDF2-SHA256 hash.
- Your email is used for critical-alert notifications.
- Deleting a detection from your history removes the associated stored audio.

Administrators can view detection data across the platform, because that is a core part of
running the system.
