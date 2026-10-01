#!/usr/bin/env python3
"""Put an edition into archive.html.

    python3 .github/scripts/archive_entry.py 2026-10-02 \
        --headline "Tom Cruise Timed His Makeup With a Stopwatch" \
        --teaser "Digger opened with …" --insert

This step used to be a line in the playbook that said "add the edition to the
top of archive.html", and for four weeks nobody did. The archive is the only
route from somebody reading the free edition to somebody paying for the next
one, so an empty archive is not a cosmetic problem.

Most of the card is already knowable, so the script works it out rather than
asking:

  number      from the edition's own dateline
  date        from the folder name
  cover       assets/img/social/edition-<date>.png
  link        the beehiiv slug, which follows from the number
  headline    the Subject line in the edition's header comment
  teaser      the Preview text, unless you pass a better one

The two it cannot do well are the two worth doing by hand. A headline that
sells and a teaser that names the best three things without replacing the
edition are editorial work, so --headline and --teaser override the defaults.

--insert writes the card into archive.html directly, newest first, replacing
any card already carrying the same date rather than stacking a second one.
Without it the card goes to stdout so you can look before it lands.
"""
import argparse
import html
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "archive.html"
ANCHOR = "<!-- EDITION ENTRY — newest first -->"
SLUG = "https://news.bloopuniverse.com/p/the-bloop-times-vol-1-no-{number}"

MONTHS = ("January February March April May June July August "
          "September October November December").split()


def read_edition(edition: str):
    src = (ROOT / "drafts" / edition / "email.html")
    if not src.is_file():
        raise SystemExit(f"no edition at {src}")
    s = src.read_text()

    m = re.search(r"Vol\.\s*(\d+),\s*No\.\s*(\d+)", s)
    if not m:
        raise SystemExit(f"{src} carries no 'Vol. x, No. y' dateline")
    vol, number = int(m.group(1)), int(m.group(2))

    def header(field):
        hit = re.search(rf"^\s*{field}:\s*(.+)$", s, re.M)
        return hit.group(1).strip() if hit else ""

    return vol, number, header("Subject"), header("Preview text")


def card(edition: str, vol: int, number: int, headline: str, teaser: str) -> str:
    d = date.fromisoformat(edition)
    pretty = f"{MONTHS[d.month - 1]} {d.day}, {d.year}"
    return (
        f'    <article class="archive-item" data-edition="{edition}">\n'
        f'      <div>\n'
        f'        <span class="kicker" style="margin-bottom:6px">Vol. {vol} · No. {number} '
        f'— {pretty} <span class="tag-locked">Insiders</span></span>\n'
        f'        <h2 class="h3">{html.escape(headline)}</h2>\n'
        f'        <p>{teaser}</p>\n'
        f'        <p class="mt-2"><a class="btn btn-red btn-sm" '
        f'href="{SLUG.format(number=number)}">Read this edition →</a></p>\n'
        f'      </div>\n'
        f'      <img src="/assets/img/social/edition-{edition}.png" '
        f'alt="Cover of edition No. {number}">\n'
        f'    </article>\n'
    )


def insert(block: str, edition: str):
    s = ARCHIVE.read_text()
    if ANCHOR not in s:
        raise SystemExit(f"{ARCHIVE} has lost its '{ANCHOR}' marker")

    # drop any card for this edition first, so re-running replaces instead of
    # stacking a duplicate
    s = re.sub(rf'[ \t]*<article class="archive-item" data-edition="{edition}">.*?</article>\n',
               "", s, flags=re.S)

    s = s.replace(ANCHOR, ANCHOR + "\n" + block, 1)
    ARCHIVE.write_text(s)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("edition", help="folder under drafts/, e.g. 2026-10-02")
    ap.add_argument("--headline")
    ap.add_argument("--teaser")
    ap.add_argument("--insert", action="store_true",
                    help="write it into archive.html instead of printing it")
    a = ap.parse_args()

    vol, number, subject, preview = read_edition(a.edition)
    headline = a.headline or subject
    teaser = a.teaser or preview
    if not headline:
        raise SystemExit("no headline: the edition has no Subject line, so pass --headline")

    cover = ROOT / "assets" / "img" / "social" / f"edition-{a.edition}.png"
    if not cover.is_file():
        raise SystemExit(f"no cover at {cover} — run make_social_card.py first")

    block = card(a.edition, vol, number, headline, teaser)
    if a.insert:
        insert(block, a.edition)
        print(f"archive.html ← No. {number} ({a.edition})")
    else:
        print(block, end="")
