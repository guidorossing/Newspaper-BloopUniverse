#!/usr/bin/env python3
"""Pull YouTube thumbnails into assets/img/thumbs/ at the size the email
actually shows them.

    python3 .github/scripts/fetch_thumbs.py hFmO0sy5azE Q4sWSFaU8ks ...

Why not just link i.ytimg.com directly, which is what the first draft did:

  * The file YouTube serves at `hq720.jpg` is 1280x720 and weighs 180-270 KB.
    The email displays it 552 px wide. Four of those is nearly a megabyte of
    pictures to move a fifth of a megabyte of actual image, and a phone on a
    weak connection is the first thing to give up on it.
  * It puts a third party in the delivery path of a paid product. Everything
    else in the edition comes from bloopuniverse.com; a thumbnail should too.

So: fetch once, resize to 2x the display width, and serve it from our own
origin next to the icons. Re-run it whenever an edition points at new videos.
"""
import io
import sys
import urllib.request
from pathlib import Path

from PIL import Image

DISPLAY_WIDTH = 552          # the email's content column
# 1.5x, not 2x. Held next to the 1280px original at the size the email
# actually shows it, 828px is indistinguishable — past that you are paying
# for pixels nobody sees. Same for the quality: 76 survives the text overlays
# these thumbnails carry, and 85 only costs more.
TARGET_WIDTH = round(DISPLAY_WIDTH * 1.5)
QUALITY = 76

OUT = Path(__file__).resolve().parents[2] / "assets" / "img" / "thumbs"


def fetch(video_id: str) -> Path:
    # hq720 is the widescreen crop. hqdefault is 4:3 with black bars baked in,
    # which would letterbox the picture inside the paper.
    url = f"https://i.ytimg.com/vi/{video_id}/hq720.jpg"
    raw = urllib.request.urlopen(url, timeout=60).read()
    im = Image.open(io.BytesIO(raw)).convert("RGB")

    if im.width > TARGET_WIDTH:
        h = round(im.height * TARGET_WIDTH / im.width)
        im = im.resize((TARGET_WIDTH, h), Image.LANCZOS)

    dest = OUT / f"{video_id}.jpg"
    im.save(dest, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    print(f"  {video_id}  {len(raw)/1024:6.0f} KB -> {dest.stat().st_size/1024:5.0f} KB"
          f"   {im.width}x{im.height}")
    return dest


if __name__ == "__main__":
    ids = sys.argv[1:]
    if not ids:
        sys.exit("usage: fetch_thumbs.py <videoId> [<videoId> ...]")
    OUT.mkdir(parents=True, exist_ok=True)
    before = after = 0
    for vid in ids:
        p = fetch(vid)
        after += p.stat().st_size
    print(f"\n{len(ids)} thumbnails, {after/1024:.0f} KB total in assets/img/thumbs/")
