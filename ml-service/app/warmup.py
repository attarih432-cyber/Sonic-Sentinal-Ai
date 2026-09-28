"""Background model warm-up.

The first YAMNet embedding on a fresh process spends one to two minutes
building the TensorFlow graph and the CPU kernels. Paying that cost inside a
live microphone request means the first prediction stalls with no explanation,
and the client's request can time out before it ever returns.

Running one synthetic window on a daemon thread at start-up moves that cost to
before anyone asks for a prediction. /health reports the state so the UI can
say "warming up" instead of appearing broken.
"""
from __future__ import annotations

import threading
import time
import traceback
from typing import Any, Dict

# Shared with the request path; plain dict assignment is atomic in CPython and
# every field is replaced wholesale, so no lock is needed.
STATE: Dict[str, Any] = {
    "status": "cold",       # cold | warming | ready | error
    "started_at": None,
    "finished_at": None,
    "seconds": None,
    "error": None,
}

_lock = threading.Lock()
_thread: threading.Thread | None = None


def snapshot() -> Dict[str, Any]:
    return dict(STATE)


def is_ready() -> bool:
    return STATE.get("status") == "ready"


def _work() -> None:
    import numpy as np

    started = time.time()
    STATE["status"] = "warming"
    STATE["started_at"] = started
    try:
        from . import model_evaluator as me

        me.load_models()

        # One synthetic 5 s window, matching the contract the models were
        # trained on, so every code path is exercised: load, features, the
        # YAMNet head and the CNN forward pass.
        sr = 22050
        t = np.linspace(0.0, 5.0, sr * 5, endpoint=False, dtype=np.float32)
        probe = (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

        me.extract_tabular_features(probe, sr)
        me.extract_mel_spectrogram(probe, sr)
        try:
            me.extract_yamnet_embedding(probe, sr)
        except Exception as exc:  # the YAMNet head is allowed to be absent
            print(f"warm-up: YAMNet embedding not available ({type(exc).__name__}: {exc})")
        try:
            weights = getattr(me, "_CNN_WEIGHTS", None)
            if weights:
                me.cnn_forward_pass(me.extract_mel_spectrogram(probe, sr), weights)
        except Exception as exc:
            print(f"warm-up: CNN forward pass not available ({type(exc).__name__}: {exc})")

        STATE["status"] = "ready"
    except Exception as exc:
        STATE["status"] = "error"
        STATE["error"] = f"{type(exc).__name__}: {exc}"
        print("warm-up failed:\n" + traceback.format_exc())
    finally:
        finished = time.time()
        STATE["finished_at"] = finished
        STATE["seconds"] = round(finished - started, 2)
        print(f"warm-up: {STATE['status']} in {STATE['seconds']}s")


def start() -> None:
    """Kick off the warm-up once. Safe to call repeatedly."""
    global _thread
    with _lock:
        if _thread is not None and _thread.is_alive():
            return
        _thread = threading.Thread(target=_work, name="model-warmup", daemon=True)
        _thread.start()


def wait(timeout: float | None = None) -> bool:
    """Block until the warm-up finishes. Used by the CLI tools, not the API."""
    t = _thread
    if t is None:
        return is_ready()
    t.join(timeout)
    return not t.is_alive()
