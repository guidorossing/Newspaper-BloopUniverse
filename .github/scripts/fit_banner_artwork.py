#!/usr/bin/env python3
"""Fit supplied banner artwork to YouTube's crops, and put its type in the
brand red.

    python3 .github/scripts/fit_banner_artwork.py in.webp out.png

Artwork usually arrives laid out for a rectangle nobody actually sees.
YouTube shows a band of 423px through the middle on both desktop and mobile;
everything outside it is television only. So this does three things:

  * centres the headline on that band's midline, which is also where
    add_banner_qr.py puts the QR, so the two read as aligned;
  * shrinks the subject until it clears the band and seats it on the bottom
    edge, so it rises into frame instead of floating in a strip of white;
  * repaints the headline in the brand red.

That last one matters more than it sounds. The red that comes back from an
image generator is never the brand's — this artwork arrived at #E4131E
against the #FF2D2D in logo.svg, dark enough to read as a different red
sitting next to the channel avatar. The repaint recovers each pixel's
coverage from the green channel (red type on a white ground barely moves
red, so red carries almost no signal) and re-blends, which keeps the
anti-aliased edges smooth instead of leaving a jagged mask.

The two --rows arguments are where the headline and the subject sit in the
source, in source pixels. Measure them by finding the rows that are not
blank; the default matches the first banner this was written for.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 2560, 1440
BAND_TOP, BAND_BOTTOM = 508, 931     # the window desktop and mobile both show
CLEARANCE = 30                        # gap between the band and the subject
BRAND_RED = (255, 45, 45)


def repaint(strip: Image.Image, ground: tuple, target: tuple) -> Image.Image:
    a = np.array(strip.convert("RGB")).astype(float)

    ink = (a[:, :, 0] > 120) & (a[:, :, 0] - a[:, :, 1] > 60)
    if not ink.any():
        return strip
    vals, counts = np.unique(a[ink].astype(int), axis=0, return_counts=True)
    src = vals[counts.argmax()]                      # the solid core colour

    # coverage from the channel that actually moves between ground and ink
    ch = int(np.argmax(np.abs(np.array(ground, float) - src)))
    span = ground[ch] - src[ch]
    if abs(span) < 1:
        return strip
    alpha = np.clip((ground[ch] - a[:, :, ch]) / span, 0, 1)[:, :, None]

    out = alpha * np.array(target, float) + (1 - alpha) * np.array(ground, float)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def fit(src_path: Path, dest: Path, text_rows, subject_rows, target=BRAND_RED):
    src = Image.open(src_path).convert("RGB")
    ground = src.getpixel((2, 2))
    scale = W / src.width
    canvas = Image.new("RGB", (W, H), ground)

    band_mid = (BAND_TOP + BAND_BOTTOM) // 2

    text = src.crop((0, text_rows[0], src.width, text_rows[1] + 1))
    text = text.resize((W, round(text.height * scale)), Image.LANCZOS)
    text = repaint(text, ground, target)
    canvas.paste(text, (0, band_mid - text.height // 2))

    nonwhite = (np.array(src).min(axis=2) < 235)
    band = nonwhite[subject_rows[0]:subject_rows[1] + 1]
    cols = np.where(band.any(axis=0))[0]
    subj = src.crop((cols[0], subject_rows[0], cols[-1] + 1, subject_rows[1] + 1))
    subj = subj.resize((round(subj.width * scale), round(subj.height * scale)), Image.LANCZOS)
    shrink = (H - (BAND_BOTTOM + CLEARANCE)) / subj.height
    subj = subj.resize((round(subj.width * shrink), round(subj.height * shrink)), Image.LANCZOS)
    canvas.paste(subj, ((W - subj.width) // 2, H - subj.height))

    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "PNG", optimize=True)
    return dest, shrink


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dest")
    ap.add_argument("--text-rows", nargs=2, type=int, default=[364, 426],
                    help="first and last source row of the headline")
    ap.add_argument("--subject-rows", nargs=2, type=int, default=[511, 886],
                    help="first and last source row of the subject")
    a = ap.parse_args()
    p, shrink = fit(Path(a.src), Path(a.dest), a.text_rows, a.subject_rows)
    print(f"{p}   subject at {shrink*100:.0f}%")
