"""Start the ML service on Windows without the proactor accept-loop crash.

Windows' default IocpProactor event loop can fail an accept with
``OSError: [WinError 64] The specified network name is no longer available``,
which kills the listener even though the process is still alive. Switching to
the selector event loop avoids that path. On non-Windows platforms the default
loop is left alone.

    python run_server.py [--port 8000] [--reload]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))


def _use_selector_loop() -> None:
    if sys.platform == "win32":
        policy = getattr(asyncio, "WindowsSelectorEventLoopPolicy", None)
        if policy is not None:
            asyncio.set_event_loop_policy(policy())
            print("asyncio: WindowsSelectorEventLoopPolicy (avoids WinError 64)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Run the SonicSentinel ML service")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--reload", action="store_true")
    ap.add_argument(
        "--no-warmup",
        action="store_true",
        help="skip the background model warm-up (the first prediction will be slow)",
    )
    ap.add_argument(
        "--wait-warmup",
        action="store_true",
        help="block until the models are warm before serving the first request",
    )
    args = ap.parse_args()

    _use_selector_loop()

    import uvicorn

    if not args.no_warmup:
        from app import warmup

        warmup.start()
        if args.wait_warmup:
            # Blocking start: the port does not open until the models can
            # actually answer, which is what a benchmark or a test wants.
            print("warming models, waiting…")
            warmup.wait()
            print("models warm:", warmup.snapshot())

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
