"""Restore the Live monitor layout rules that styles.css is missing.

styles.css is the only stylesheet main.tsx imports, but the layout classes the
Live monitor depends on were never carried over from the legacy sheet. This
copies those rules verbatim so the page keeps its original design.
"""
import re

LEGACY = "src/styles.legacy-20260925.css"
CURRENT = "src/styles.css"
OUT = "src/live.css"

NEED = [
    "dash", "hero", "hero-pills", "eyebrow", "grad-text", "muted",
    "section-head", "live-panel", "live-results", "live-visual", "wave-canvas",
    "rms-meter", "rms-fill", "center-pad", "empty-state", "err-text",
    "detect-list", "detect-row", "sound", "detect-main", "conf", "pill-soft",
    "row-actions", "auth-input", "cam-stage", "cam-empty", "cam-live",
    "cam-wrap", "cam-toolbar", "mirrored", "event-list", "event-row",
    "event-dot", "event-time", "tiny", "danger", "primary",
]

HEADER = """/* ===========================================================================
 * Live monitor stylesheet.
 *
 * styles.css is the only stylesheet main.tsx imports, but the layout classes
 * the Live monitor relies on (panel grid, section headers, detection rows,
 * camera stage) were never carried over from styles.legacy-20260925.css.
 * The rules below are copied verbatim from that file so the Live page keeps
 * the original SonicSentinel look instead of a newly invented one.
 * =========================================================================== */
"""


def main() -> None:
    legacy = re.sub(r"/\*.*?\*/", "", open(LEGACY, encoding="utf-8").read(), flags=re.S)
    current = open(CURRENT, encoding="utf-8").read()

    def defined(css: str, name: str) -> bool:
        return bool(re.search(r"\." + re.escape(name) + r"(?![\w-])", css))

    missing = {n for n in NEED if not defined(current, n)}

    keep = []
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", legacy):
        sels = [s.strip() for s in sel.split(",") if s.strip()]
        if not sels or any(s.startswith("@") for s in sels):
            continue
        if any(re.search(r"\." + re.escape(n) + r"(?![\w-])", s) for s in sels for n in missing):
            keep.append((sel.strip(), body.strip()))

    rendered = "\n\n".join(
        sel + " {\n  " + re.sub(r"\s*\n\s*", "\n  ", body).strip() + "\n}"
        for sel, body in keep
    )
    open(OUT, "w", encoding="utf-8").write(HEADER + "\n" + rendered + "\n")

    print("classes restored:", len(missing))
    print("rules written:", len(keep))
    for name in sorted(missing):
        print("  +", name)


if __name__ == "__main__":
    main()
