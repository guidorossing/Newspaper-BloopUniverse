#!/usr/bin/env python3
"""Draw the fixed art The Bloop Times email uses: section icons, the film-strip
rule, and the clapperboard.

Run from the repository root:

    python3 .github/scripts/make_assets.py

Everything here is generated rather than sourced, so it carries no factual
claim — no take numbers on the slate, no captions, nothing a reader could
mistake for reporting. Three rules the email format forces:

  * PNG and GIF only. SVG does not render in Gmail, and a webfont renders
    nowhere worth counting.
  * Solid backgrounds, never transparency. A client that repaints the page
    dark leaves a solid PNG alone; a transparent one becomes a red smear.
    That is why each icon exists twice — once on the paper colour, once on
    white for the panels that sit on white.
  * Drawn at 2x and placed at 1x, so the art stays sharp on a phone.

Outlook plays no GIF at all: it freezes on frame one. Both animations are
built so frame one is a finished picture on its own.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PAPER = (247, 242, 233)
WHITE = (255, 255, 255)
RED = (255, 45, 45)
INK = (14, 14, 17)

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

S = 56   # icon canvas at 2x; placed at 20px in the email
W = 4    # stroke weight at 2x

ROOT = Path(__file__).resolve().parents[2]
IMG = ROOT / "assets" / "img"
ICO = IMG / "ico"

# The background colour the icon is being drawn onto. Set per render so the
# knockout details (the clapper's teeth) punch through to the right colour.
bg = PAPER


def newspaper(d):
    d.rectangle([6, 10, 44, 48], outline=RED, width=W)
    d.rectangle([44, 18, 50, 48], outline=RED, width=W)
    d.rectangle([12, 16, 38, 24], fill=RED)
    for y in (30, 37, 44):
        d.line([12, y, 38, y], fill=RED, width=3)


def bolt(d):
    d.polygon([(32, 4), (14, 30), (26, 30), (22, 52), (42, 24), (29, 24)], fill=RED)


def clapper_icon(d):
    d.rectangle([6, 24, 50, 50], outline=RED, width=W)
    d.polygon([(6, 22), (48, 10), (52, 22), (10, 22)], fill=RED)
    for x in (16, 28, 40):
        d.line([x, 10, x - 3, 22], fill=bg, width=3)


def filmstrip(d):
    # Three fat perforations a side rather than a dense ladder: at 20px, a
    # finer strip collapses into a red smudge.
    d.rectangle([8, 10, 48, 46], outline=RED, width=W)
    for y in (16, 26, 36):
        d.rectangle([12, y, 18, y + 6], fill=RED)
        d.rectangle([38, y, 44, y + 6], fill=RED)
    d.rectangle([24, 10, 32, 46], fill=RED)


def quotes(d):
    for x in (10, 30):
        d.rectangle([x, 12, x + 16, 30], fill=RED)
        d.polygon([(x, 30), (x + 16, 30), (x + 4, 44)], fill=RED)


def bulb(d):
    d.ellipse([13, 6, 43, 36], outline=RED, width=W)
    d.rectangle([22, 36, 34, 44], outline=RED, width=W)
    d.line([22, 48, 34, 48], fill=RED, width=W)


def scissors(d):
    d.line([14, 10, 38, 38], fill=RED, width=W)
    d.line([42, 10, 18, 38], fill=RED, width=W)
    d.ellipse([8, 36, 22, 50], outline=RED, width=W)
    d.ellipse([34, 36, 48, 50], outline=RED, width=W)


def calendar(d):
    d.rectangle([6, 12, 50, 48], outline=RED, width=W)
    d.rectangle([6, 12, 50, 22], fill=RED)
    d.line([17, 4, 17, 14], fill=RED, width=W)
    d.line([39, 4, 39, 14], fill=RED, width=W)
    for y in (29, 39):
        for x in (13, 25, 37):
            d.rectangle([x, y, x + 6, y + 6], fill=RED)


def chart(d):
    d.line([8, 50, 50, 50], fill=RED, width=W)
    d.rectangle([12, 30, 21, 47], fill=RED)
    d.rectangle([25, 14, 34, 47], fill=RED)
    d.rectangle([38, 36, 47, 47], fill=RED)


def question(d):
    f = ImageFont.truetype(BOLD, 54)
    d.text((S // 2, S // 2), "?", font=f, fill=RED, anchor="mm")


def play(d):
    d.rounded_rectangle([4, 12, 52, 46], radius=7, outline=RED, width=W)
    d.polygon([(23, 20), (23, 38), (38, 29)], fill=RED)


def chat(d):
    d.rounded_rectangle([4, 8, 42, 34], radius=6, outline=RED, width=W)
    d.polygon([(12, 33), (26, 33), (12, 46)], fill=RED)
    for x in (14, 23, 32):
        d.rectangle([x, 18, x + 4, 22], fill=RED)


def pencil(d):
    d.polygon([(38, 6), (50, 18), (22, 46), (10, 50), (14, 38)], outline=RED, width=W)
    d.line([32, 12, 44, 24], fill=RED, width=W)


ICONS = {
    "front-page": newspaper,
    "wire": bolt,
    "behind": clapper_icon,
    "blooper": filmstrip,
    "improvised": quotes,
    "didyouknow": bulb,
    "deleted": scissors,
    "coming": calendar,
    "poll": chart,
    "guess": question,
    "video": play,
    "fan": chat,
    "working": pencil,
}


def draw_icons():
    global bg
    ICO.mkdir(parents=True, exist_ok=True)
    for name, fn in ICONS.items():
        for suffix, colour in (("", PAPER), ("-on-white", WHITE)):
            bg = colour
            im = Image.new("RGB", (S, S), colour)
            fn(ImageDraw.Draw(im))
            im.save(ICO / f"{name}{suffix}.png", optimize=True)
    bg = PAPER


def film_strip():
    """1104x36 at 2x. The sprockets travel exactly one pitch over the loop, so
    it cycles seamlessly and reads as film running rather than film twitching."""
    w, h, pitch = 1104, 36, 24
    frames = []
    for step in range(6):
        im = Image.new("RGB", (w, h), PAPER)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 3, w, h - 4], fill=INK)
        x = -pitch + step * (pitch / 6)
        while x < w + pitch:
            d.rectangle([x, 8, x + 10, 14], fill=PAPER)
            d.rectangle([x, h - 15, x + 10, h - 9], fill=PAPER)
            x += pitch
        d.line([0, h // 2 - 1, w, h // 2 - 1], fill=RED, width=2)
        frames.append(im.convert("P", palette=Image.ADAPTIVE, colors=8))
    frames[0].save(IMG / "rule-filmstrip.gif", save_all=True,
                   append_images=frames[1:], duration=110, loop=0, optimize=True)


def clapperboard(background=WHITE, name="clapper"):
    """A clapper that snaps. It holds closed for most of the loop, opens over
    three frames and shuts in two, so the motion is a punctuation mark rather
    than a flicker running the whole time somebody is reading."""
    w, h = 260, 200
    hinge = (24, 84)
    arm_len, arm_h = 214, 34
    font = ImageFont.truetype(BOLD, 15)

    def rot(px, py, deg):
        r = math.radians(deg)
        dx, dy = px - hinge[0], py - hinge[1]
        return (hinge[0] + dx * math.cos(r) - dy * math.sin(r),
                hinge[1] + dx * math.sin(r) + dy * math.cos(r))

    def frame(angle):
        im = Image.new("RGB", (w, h), background)
        d = ImageDraw.Draw(im)
        d.rectangle([18, 86, 242, 182], fill=INK)
        for y in (112, 138, 164):
            d.line([32, y, 228, y], fill=(58, 58, 66), width=2)
        d.text((32, 96), "THE BLOOP TIMES", font=font, fill=RED)

        corners = [rot(hinge[0], hinge[1] - arm_h, angle),
                   rot(hinge[0] + arm_len, hinge[1] - arm_h, angle),
                   rot(hinge[0] + arm_len, hinge[1], angle),
                   rot(hinge[0], hinge[1], angle)]
        d.polygon(corners, fill=INK)
        for i in range(7):
            a = hinge[0] + 8 + i * 30
            d.polygon([rot(a, hinge[1] - arm_h + 3, angle),
                       rot(a + 15, hinge[1] - arm_h + 3, angle),
                       rot(a + 6, hinge[1] - 3, angle),
                       rot(a - 9, hinge[1] - 3, angle)], fill=background)
        d.ellipse([hinge[0] - 6, hinge[1] - 6, hinge[0] + 6, hinge[1] + 6], fill=RED)
        return im.convert("P", palette=Image.ADAPTIVE, colors=16)

    plan = [(0, 900), (-6, 90), (-13, 90), (-20, 90), (-26, 260), (-14, 60), (0, 60)]
    frames = [frame(a) for a, _ in plan]
    frames[0].save(IMG / f"{name}.gif", save_all=True, append_images=frames[1:],
                   duration=[ms for _, ms in plan], loop=0, optimize=True)


if __name__ == "__main__":
    draw_icons()
    film_strip()
    clapperboard()
    print(f"icons: {len(ICONS) * 2}   "
          f"rule-filmstrip.gif: {(IMG / 'rule-filmstrip.gif').stat().st_size}B   "
          f"clapper.gif: {(IMG / 'clapper.gif').stat().st_size}B")
