#!/usr/bin/env python3
"""Put the sign-up QR card on a YouTube channel banner.

    python3 .github/scripts/add_banner_qr.py in.png out.png --caption "Not enough seen?"

Two things it handles that are easy to get wrong.

**The canvas.** YouTube wants 2560x1440. Art that arrives at another size or
ratio gets scaled to the full width and centred on a white field rather than
stretched, so nothing in the original composition is distorted.

**The crops.** YouTube shows three different windows out of one image:

    TV        2560 x 1440   everything
    Desktop   2560 x  423   a horizontal band through the middle
    Mobile    1546 x  423   the centre of that band

Only the mobile window is guaranteed. The QR card sits on the right, inside
the desktop band but outside the mobile one — deliberately, because that is
the only place a QR fits without crowding the artwork, and a code is no use
on a phone anyway: nobody scans the screen they are holding.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 2560, 1440
SAFE_W, SAFE_H = 1546, 423          # the window every device shows

PAPER = (247, 242, 233)
INK = (14, 14, 17)

SANS_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_QR = ROOT / "assets" / "img" / "qr-bloopuniverse-video.png"

# The card has to fit *inside* the 423px band, not merely overlap it, or
# desktop shaves its border and rounded corners off.
CARD_W, CARD_H = 350, 388
CARD_RIGHT_MARGIN = 60
QR_SIZE = 248
QR_TOP_PAD = 28


def compose(src: Path, qr_path: Path, caption: str, dest: Path, guides: bool = False):
    art = Image.open(src).convert("RGB")

    # scale to the full width; centre what that leaves on a field matched to
    # the artwork's own corner, so the seam is invisible
    scaled_h = round(art.height * W / art.width)
    art = art.resize((W, scaled_h), Image.LANCZOS)
    ground = art.getpixel((2, 2))
    im = Image.new("RGB", (W, H), ground)
    im.paste(art, (0, (H - scaled_h) // 2))
    d = ImageDraw.Draw(im)

    # the card
    x1 = W - CARD_RIGHT_MARGIN - CARD_W
    y1 = (H - CARD_H) // 2
    x2, y2 = x1 + CARD_W, y1 + CARD_H
    d.rounded_rectangle([x1, y1, x2, y2], radius=26, fill=PAPER, outline=INK, width=3)

    qr = Image.open(qr_path).convert("RGB").resize((QR_SIZE, QR_SIZE), Image.NEAREST)
    im.paste(qr, (x1 + (CARD_W - QR_SIZE) // 2, y1 + QR_TOP_PAD))

    font = ImageFont.truetype(SANS_BOLD, 30)
    d.text(((x1 + x2) / 2, y1 + QR_TOP_PAD + QR_SIZE + 42), caption,
           font=font, fill=INK, anchor="mm")

    if guides:  # a throwaway proof, never the file you upload
        g = ImageDraw.Draw(im)
        g.rectangle([0, (H - SAFE_H) // 2, W, (H + SAFE_H) // 2], outline=(0, 140, 255), width=4)
        g.rectangle([(W - SAFE_W) // 2, (H - SAFE_H) // 2,
                     (W + SAFE_W) // 2, (H + SAFE_H) // 2], outline=(255, 45, 45), width=4)

    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "PNG", optimize=True)
    return dest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dest")
    ap.add_argument("--caption", required=True)
    ap.add_argument("--qr", default=str(DEFAULT_QR))
    ap.add_argument("--guides", action="store_true",
                    help="draw the desktop and mobile crops, for checking only")
    a = ap.parse_args()
    p = compose(Path(a.src), Path(a.qr), a.caption, Path(a.dest), a.guides)
    print(f"{p}  {p.stat().st_size/1024:.0f} KB")
