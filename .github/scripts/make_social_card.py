#!/usr/bin/env python3
"""Draw the share card for an edition — the picture people see when a link to
it lands in a chat, a timeline, or the archive.

    python3 .github/scripts/make_social_card.py 2026-09-11 \
        --number "Vol. 1, No. 1" \
        --date "September 11, 2026" \
        --headline "The Hug Tobey Maguire Never Saw Coming"

Writes assets/img/social/edition-<date>.png at 1200x630, which is what
beehiiv asks for and what every link preview crops to.

It is the front page of the paper, not a poster: masthead, dateline, one
headline. Nothing here is a claim the edition doesn't already make.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PAPER = (247, 242, 233)
INK = (20, 20, 24)
BLACK = (14, 14, 17)
RED = (255, 45, 45)
MUTED = (94, 90, 85)

SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

W, H = 1200, 630
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "img" / "social"


def tracked(d, xy, text, font, fill, spacing):
    """Letter-spaced text. Pillow has no tracking, and the uppercase labels in
    this paper are nothing without it."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + spacing
    return x


def tracked_width(d, text, font, spacing):
    return sum(d.textlength(c, font=font) + spacing for c in text) - spacing


def wrap(d, text, font, max_w):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if d.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def build(number: str, date: str, headline: str, dest: Path):
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)

    f_mast = ImageFont.truetype(SERIF, 104)
    f_head = ImageFont.truetype(SERIF, 46)
    f_label = ImageFont.truetype(SANS, 17)
    f_bar = ImageFont.truetype(SANS, 19)
    f_mark = ImageFont.truetype(SANS, 30)

    # top bar, same furniture as the email
    d.rectangle([0, 0, W, 86], fill=BLACK)
    d.rounded_rectangle([48, 22, 100, 66], radius=10, fill=RED)
    d.text((74, 44), "BU", font=f_mark, fill=(255, 255, 255), anchor="mm")
    tracked(d, (120, 36), "THE OFFICIAL BLOOPUNIVERSE WEEKLY", f_bar, (142, 142, 150), 2.6)

    # masthead
    d.text((W // 2, 186), "The Bloop Times", font=f_mast, fill=INK, anchor="mm")
    tag = "BLOOPERS · UNTOLD STORIES · THE BIGGEST MOVIE NEWS"
    tw = tracked_width(d, tag, f_label, 3.4)
    tracked(d, ((W - tw) / 2, 240), tag, f_label, MUTED, 3.4)

    # dateline, ruled above and below like the paper's
    d.rectangle([48, 292, W - 48, 296], fill=INK)
    line = f"{number}   ·   {date}   ·   "
    lw = tracked_width(d, line, f_label, 2.4) + tracked_width(d, "INSIDERS ONLY", f_label, 2.4)
    x = tracked(d, ((W - lw) / 2, 314), line, f_label, MUTED, 2.4)
    tracked(d, (x, 314), "INSIDERS ONLY", f_label, RED, 2.4)
    d.line([48, 350, W - 48, 350], fill=INK, width=1)

    # the headline, vertically centred in what is left
    lines = wrap(d, headline, f_head, W - 200)
    block = len(lines) * 62
    y = 388 + (H - 60 - 388 - block) / 2
    for ln in lines:
        d.text((W // 2, y), ln, font=f_head, fill=INK, anchor="ma")
        y += 62

    d.rectangle([0, H - 10, W, H], fill=RED)

    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "PNG", optimize=True)
    return dest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("edition", help="edition date, e.g. 2026-09-11")
    ap.add_argument("--number", required=True, help='e.g. "Vol. 1, No. 1"')
    ap.add_argument("--date", required=True, help='e.g. "September 11, 2026"')
    ap.add_argument("--headline", required=True)
    a = ap.parse_args()
    p = build(a.number, a.date, a.headline, OUT / f"edition-{a.edition}.png")
    print(f"{p}  {p.stat().st_size/1024:.0f} KB")
