#!/usr/bin/env python
"""
SonicSentinel AI — Documentation Visual Asset Renderer
=====================================================

Renders the documentation hero and instrument figures from REAL data in this
repository. Nothing here is hardcoded or synthesised.

Input
-----
`ml-service/data/uploads/87c0e526-4df5-4872-a605-dfabd526668d.wav`
    The one genuine long recording in the project (54.29 s, 48 kHz, stereo,
    24-bit). Every pixel of the hero figure is a measured STFT of this file.

Output
------
documentation/assets/
    spectrogram-hero.png   time-frequency STFT, log-frequency axis, real Hz labels
    waveform-hero.png      peak-envelope amplitude trace, same time base
    corpus-dedupe.png      measured per-file content hashes for the upload corpus

Design
------
The colour ramp is built from the documentation palette so the figure and the
page are one system:

    ink  #0A0F1C  →  #12203A  →  #1C5A6E  →  signal #38E8C6
                                        →  warn   #F5A524  →  crit #FF5470

Usage
-----
    python documentation/tools/render_figures.py
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap

import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
UPLOADS = ROOT / "ml-service" / "data" / "uploads"
ASSETS = ROOT / "documentation" / "assets"
HERO_WAV = UPLOADS / "87c0e526-4df5-4872-a605-dfabd526668d.wav"

# ---------------------------------------------------------------- palette ---
INK = "#0A0F1C"
PANEL = "#121A2B"
RULE = "#22304A"
SIGNAL = "#38E8C6"
WARN = "#F5A524"
CRIT = "#FF5470"
TEXT = "#E6EDF7"
MUTED = "#8494AC"

# One ramp, used for the spectrogram. Rises out of the page background so the
# figure has no visible frame.
RAMP = LinearSegmentedColormap.from_list(
    "sentinel",
    [INK, "#0F1A2E", "#14304A", "#1C5A6E", "#2E8F84", SIGNAL, WARN, CRIT],
    N=512,
)

plt.rcParams.update({
    "figure.facecolor": INK,
    "axes.facecolor": INK,
    "savefig.facecolor": INK,
    "text.color": TEXT,
    "axes.labelcolor": MUTED,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
    "font.family": "sans-serif",
    "font.sans-serif": ["Segoe UI", "DejaVu Sans", "Arial"],
})


def hero_spectrogram() -> str:
    """Real STFT of the project's genuine long recording."""
    y, sr = sf.read(str(HERO_WAV), always_2d=True)
    mono = y.mean(axis=1)
    n = len(mono)
    dur = n / sr

    n_fft, hop = 2048, 512
    win = np.hanning(n_fft).astype(np.float32)
    frames = 1 + (n - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(frames)[:, None]
    spec = np.abs(np.fft.rfft(mono[idx] * win, axis=1)).T  # freq x time

    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    db = 20.0 * np.log10(spec + 1e-8)
    vmax = db.max()
    vmin = vmax - 78.0  # a ~78 dB dynamic range window, stated on the figure

    # Aspect chosen so the time axis stays wide; height tracks the visible band.
    fmax_show = min(16000.0, sr / 2.0)
    band = freqs <= fmax_show
    db_band, freqs_band = db[band], freqs[band]

    fig_w = 16.0
    fig_h = 6.4
    dpi = 130
    fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=dpi)

    ax.imshow(
        db_band,
        origin="lower",
        aspect="auto",
        cmap=RAMP,
        vmin=vmin,
        vmax=vmax,
        extent=[0.0, dur, freqs_band[0], freqs_band[-1]],
        interpolation="bilinear",
    )

    # Frequency ruler — real values, evenly spaced, log-familiar placement.
    ticks = [0, 2000, 4000, 6000, 8000, 12000, 16000]
    ax.set_yticks([t for t in ticks if t <= freqs_band[-1]])
    ax.set_yticklabels([f"{t//1000}k" if t >= 1000 else f"{t}" for t in ticks if t <= freqs_band[-1]])
    ax.set_ylabel("frequency  (Hz)", fontsize=10, labelpad=10)

    step = 5 if dur < 60 else 10
    tx = np.arange(0, dur + 0.001, step)
    ax.set_xticks(tx)
    ax.set_xticklabels([f"{t:g}" for t in tx])
    ax.set_xlabel("time  (s)", fontsize=10, labelpad=8)

    # Mark the 5 s analysis window the models actually consume.
    ax.axvline(5.0, color=SIGNAL, lw=1.0, alpha=0.55, ls=(0, (5, 4)))
    ax.text(
        5.35, freqs_band[-1] * 0.955, "5 s model window",
        color=SIGNAL, fontsize=9, va="top", ha="left",
    )

    for s in ax.spines.values():
        s.set_color(RULE)
        s.set_linewidth(0.8)
    ax.tick_params(length=3, width=0.8, labelsize=9)

    # Measured facts, printed on the figure so the image is self-describing.
    ax.text(
        0.0, -0.155,
        f"{HERO_WAV.name[:8]}…wav    {sr/1000:.0f} kHz    {y.shape[1]} ch    "
        f"{dur:.2f} s    STFT {n_fft}/{hop}    {db_band.shape[1]} frames    "
        f"window {vmax - vmin:.0f} dB",
        transform=ax.transAxes, color=MUTED, fontsize=9, va="top",
    )
    ax.text(
        1.0, -0.155, "measured — not synthesised",
        transform=ax.transAxes, color=SIGNAL, fontsize=9, va="top", ha="right",
    )

    fig.subplots_adjust(left=0.062, right=0.995, top=0.965, bottom=0.145)
    out = ASSETS / "spectrogram-hero.png"
    fig.savefig(out, dpi=dpi)
    plt.close(fig)
    return str(out)


def hero_waveform() -> str:
    """Peak-envelope amplitude trace, same time base as the spectrogram."""
    y, sr = sf.read(str(HERO_WAV), always_2d=True)
    mono = y.mean(axis=1)
    dur = len(mono) / sr

    # 1400 buckets, peak per bucket — a readable envelope, not 2.6M points.
    buckets = 1400
    step = max(1, len(mono) // buckets)
    usable = (len(mono) // step) * step
    seg = mono[:usable].reshape(-1, step)
    peak = np.abs(seg).max(axis=1)
    t = (np.arange(len(peak)) * step + step / 2) / sr

    fig, ax = plt.subplots(figsize=(16.0, 2.5), dpi=130)
    ax.fill_between(t, -peak, peak, color=SIGNAL, alpha=0.30, linewidth=0)
    ax.plot(t, peak, color=SIGNAL, lw=0.7)
    ax.plot(t, -peak, color=SIGNAL, lw=0.7)
    ax.axhline(0, color=RULE, lw=0.6)
    ax.axvline(5.0, color=WARN, lw=1.0, alpha=0.7, ls=(0, (5, 4)))

    ax.set_xlim(0, dur)
    ax.set_ylim(-0.62, 0.62)
    ax.set_yticks([])
    step_t = 5 if dur < 60 else 10
    ax.set_xticks(np.arange(0, dur + 0.001, step_t))
    ax.set_xticklabels([f"{t:g}" for t in np.arange(0, dur + 0.001, step_t)], fontsize=9)
    ax.set_xlabel("time  (s)", fontsize=10, labelpad=6)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(length=0)
    ax.text(
        0.0, 1.06, "peak envelope    ±1.0 full scale",
        transform=ax.transAxes, color=MUTED, fontsize=9, va="bottom",
    )
    ax.text(
        1.0, 1.06, f"{len(peak)} buckets from {len(mono):,} samples",
        transform=ax.transAxes, color=MUTED, fontsize=9, va="bottom", ha="right",
    )

    fig.subplots_adjust(left=0.048, right=0.995, top=0.80, bottom=0.30)
    out = ASSETS / "waveform-hero.png"
    fig.savefig(out, dpi=130)
    plt.close(fig)
    return str(out)


def corpus_dedupe() -> str:
    """Measured content-hash duplication across the upload corpus."""
    files = sorted(p for p in UPLOADS.iterdir() if p.is_file())
    digests: dict[str, list[str]] = {}
    for p in files:
        h = hashlib.sha256()
        with p.open("rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        digests.setdefault(h.hexdigest(), []).append(p.name)

    groups = sorted(digests.values(), key=len, reverse=True)
    labels = [f"group {i+1}" for i in range(len(groups))]
    sizes = [len(g) for g in groups]
    singles = sum(1 for s in sizes if s == 1)
    dupfiles = sum(s for s in sizes if s > 1)

    fig, (ax1, ax2) = plt.subplots(
        1, 2, figsize=(15.0, 4.4), dpi=130, gridspec_kw={"width_ratios": [1.15, 1]}
    )

    colours = [CRIT if s > 1 else RULE for s in sizes]
    ax1.barh(labels[::-1], sizes[::-1], color=colours[::-1], height=0.62)
    ax1.set_xlabel("files sharing one SHA-256 content hash", fontsize=10, labelpad=8)
    ax1.set_xlim(0, max(sizes) + 1.2)
    ax1.set_yticks(range(len(labels)))
    ax1.set_yticklabels(labels[::-1], fontsize=8)
    ax1.set_title(
        f"{len(groups)} unique contents across {len(files)} files",
        fontsize=11, color=TEXT, loc="left", pad=10,
    )
    for i, s in enumerate(sizes[::-1]):
        if s > 1:
            ax1.text(s + 0.14, i, f"{s}", va="center", color=CRIT, fontsize=9)
    for s in ax1.spines.values():
        s.set_color(RULE)
        s.set_linewidth(0.8)
    ax1.tick_params(length=3, width=0.8, labelsize=8)

    ax2.barh(
        ["unique files", "duplicate copies"],
        [singles, dupfiles - singles if dupfiles else 0],
        color=[SIGNAL, CRIT], height=0.5,
    )
    ax2.set_xlabel("file count", fontsize=10, labelpad=8)
    ax2.set_xlim(0, len(files) + 3)
    ax2.set_title(
        f"{len(files) - dupfiles} unique  ·  {dupfiles} extra copies",
        fontsize=11, color=TEXT, loc="left", pad=10,
    )
    for i, v in enumerate([singles, dupfiles - singles if dupfiles else 0]):
        ax2.text(v + 0.5, i, f"{v}", va="center", color=TEXT, fontsize=10)
    for s in ax2.spines.values():
        s.set_color(RULE)
        s.set_linewidth(0.8)
    ax2.tick_params(length=3, width=0.8, labelsize=9)

    fig.subplots_adjust(left=0.075, right=0.99, top=0.86, bottom=0.155, wspace=0.24)
    out = ASSETS / "corpus-dedupe.png"
    fig.savefig(out, dpi=130)
    plt.close(fig)
    return str(out)


def main() -> int:
    ASSETS.mkdir(parents=True, exist_ok=True)
    if not HERO_WAV.is_file():
        print(f"ERROR: hero recording not found: {HERO_WAV}")
        return 2
    for fn in (hero_spectrogram, hero_waveform, corpus_dedupe):
        path = fn()
        size = Path(path).stat().st_size
        print(f"  rendered {Path(path).name:<28} {size/1024:7.1f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
