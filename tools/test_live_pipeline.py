"""End-to-end check of the live microphone path, without a browser.

It reproduces byte-for-byte what src/lib/audio.ts encodes (16-bit PCM mono WAV
at the AudioContext sample rate), pushes several 5 s windows through the real
POST /live/analyze endpoint, and asserts the response carries a per-model
breakdown. It also checks that the old silent-audio behaviour is gone: a
silent window must not come back as a confident "Background Noise".

Run with the backend up:  python tools/test_live_pipeline.py
"""
from __future__ import annotations

import io
import json
import math
import os
import struct
import sys
import time
import wave

import requests

BASE = os.getenv("API_BASE", "http://127.0.0.1:8000")
EMAIL = os.getenv("SS_EMAIL", "admin@sonicsentinel.com")
PASSWORD = os.getenv("SS_PASSWORD", "SonicAdmin@2024!")
RATE = 44100            # a common AudioContext rate
WINDOW_SECONDS = 5      # must match WINDOW_SECONDS in src/live.tsx


# ── the browser-side encoder, reimplemented in Python for the test ──────────
def encode_wav(samples: list[float], rate: int = RATE) -> bytes:
    """Mirror of encodeWav() in src/lib/audio.ts."""
    data = b"".join(
        struct.pack("<h", int(max(-1.0, min(1.0, s)) * (0x8000 if s < 0 else 0x7FFF)))
        for s in samples
    )
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data)
    return buf.getvalue()


def tone(kind: str, seconds: float = WINDOW_SECONDS, rate: int = RATE) -> list[float]:
    n = int(rate * seconds)
    out = []
    for i in range(n):
        t = i / rate
        if kind == "silence":
            v = 0.0
        elif kind == "horn":
            v = 0.5 * math.sin(2 * math.pi * 440 * t) + 0.3 * math.sin(2 * math.pi * 880 * t)
        elif kind == "white_noise":
            v = ((os.urandom(1)[0] / 127.5) - 1.0) * 0.25
        elif kind == "low_rumble":
            v = 0.4 * math.sin(2 * math.pi * 70 * t)
        elif kind == "high_hiss":
            v = 0.2 * math.sin(2 * math.pi * 6500 * t)
        else:
            raise ValueError(kind)
        out.append(v)
    return out


def normalize(samples: list[float], target_peak: float = 0.95) -> list[float]:
    """Mirror of normalize() in src/lib/audio.ts."""
    peak = max((abs(s) for s in samples), default=0.0)
    if peak < 1e-6 or peak >= target_peak:
        return samples
    gain = target_peak / peak
    return [s * gain for s in samples]


def main() -> int:
    failures: list[str] = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}{('  -> ' + detail) if detail else ''}")
        if not ok:
            failures.append(label)

    print("health")
    try:
        health = requests.get(f"{BASE}/health", timeout=20)
        health.raise_for_status()
        print("  ", health.json())
    except Exception as exc:
        print("  backend not reachable:", exc)
        return 2

    print("\nlogin")
    session = requests.Session()
    r = session.post(
        f"{BASE}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    check("login 200", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code != 200:
        return 2

    print("\nstart live session")
    r = session.post(f"{BASE}/live/sessions/start", files={"source": (None, "microphone")}, timeout=30)
    check("session start 201", r.status_code == 201, f"HTTP {r.status_code}")
    session_id = r.json().get("id") if r.status_code == 201 else None

    print(f"\npushing 5 x {WINDOW_SECONDS}s windows as 16-bit PCM WAV @ {RATE} Hz")
    results = {}
    for kind in ("horn", "white_noise", "low_rumble", "high_hiss", "silence"):
        blob = encode_wav(normalize(tone(kind)))
        t0 = time.time()
        r = session.post(
            f"{BASE}/live/analyze",
            files={"audio": (f"live_mic_{kind}.wav", blob, "audio/wav")},
            data={"session_id": session_id} if session_id else {},
            timeout=180,
        )
        dt = time.time() - t0
        if r.status_code != 201:
            check(f"window '{kind}' accepted", False, f"HTTP {r.status_code} {r.text[:160]}")
            continue
        d = r.json()
        results[kind] = d
        print(
            f"  {kind:<12} {dt:5.1f}s  {d['classification']:<20} "
            f"{round((d.get('confidence') or 0) * 100):>3}%  severity={d.get('severity')}"
        )

    print("\nresponse contract")
    sample = next(iter(results.values()), None)
    if sample is None:
        print("  no window was accepted; cannot continue")
        return 1
    bd = sample.get("modelBreakdown") or {}
    check("modelBreakdown present", bool(bd))
    for key in ("yamnet", "cnn", "svm", "teachable_machine"):
        check(f"breakdown has '{key}'", key in bd)
    tm = bd.get("teachable_machine", {})
    check("teachable_machine marked browser_side", tm.get("status") == "browser_side", str(tm.get("status")))

    print("\nhonesty checks")
    for kind, d in results.items():
        bd = d.get("modelBreakdown") or {}
        for key in ("yamnet", "cnn", "svm"):
            m = bd.get(key) or {}
            if m.get("status") != "evaluated":
                check(f"{kind}/{key} explains itself", bool(m.get("reason")), str(m.get("reason"))[:60])

    sil = results.get("silence")
    if sil:
        check(
            "silent window is NOT a confident Background Noise",
            (sil.get("confidence") or 0) == 0.0,
            f"classification={sil['classification']!r} confidence={sil.get('confidence')}",
        )
        sb = (sil.get("modelBreakdown") or {})
        check(
            "silent window ran no model",
            all((sb.get(k) or {}).get("status") == "not_evaluated" for k in ("yamnet", "cnn", "svm")),
        )

    print("\ndiscrimination")
    real = [k for k in results if k != "silence"]
    labels = {(results[k].get("classification")) for k in real}
    yamnet = {
        ((results[k].get("modelBreakdown") or {}).get("yamnet") or {}).get("classification")
        for k in real
    }
    print(f"  merged classes across {len(real)} sounds: {sorted(x for x in labels if x)}")
    print(f"  YAMNet classes across {len(real)} sounds: {sorted(x for x in yamnet if x)}")
    check("YAMNet produced more than one class", len([x for x in yamnet if x]) > 1)

    print("\nstop live session")
    if session_id:
        r = session.post(f"{BASE}/live/sessions/{session_id}/stop", timeout=30)
        check("session stop 200", r.status_code == 200, f"HTTP {r.status_code}")
        if r.status_code == 200:
            check("session is stopped", r.json().get("status") == "stopped", str(r.json().get("status")))

    print("\nerror handling")
    r = session.post(
        f"{BASE}/live/analyze",
        files={"audio": ("live_mic_x.webm", b"\x1a\x45\xdf\xa3not-real-webm", "audio/webm")},
        timeout=60,
    )
    check("garbage webm is rejected, not silently 'no event'", r.status_code in (415, 400, 422), f"HTTP {r.status_code}")

    r = session.post(
        f"{BASE}/live/analyze",
        files={"audio": ("live_mic_x.exe", b"MZ\x90\x00", "application/octet-stream")},
        timeout=60,
    )
    check("non-audio extension rejected", r.status_code in (415, 422), f"HTTP {r.status_code}")

    print()
    if failures:
        print(f"{len(failures)} FAILED:")
        for f in failures:
            print("  -", f)
        return 1
    print("all live-pipeline checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
