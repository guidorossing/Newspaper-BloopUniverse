#!/usr/bin/env python3
"""Scaffold next Friday's edition so a draft is waiting on Thursday morning.

Fills in the things that are mechanical — the date, the volume, the edition
number — and leaves every [PLACEHOLDER] that needs a human. Writes into
drafts/YYYY-MM-DD/ and never touches a published edition.
"""
import datetime as dt
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
EDITIONS_PER_VOLUME = 52


def next_friday(today: dt.date) -> dt.date:
    """The Friday this draft is for. Run on a Thursday, that's tomorrow."""
    ahead = (4 - today.weekday()) % 7        # Friday == 4
    return today + dt.timedelta(days=ahead or 7)


def edition_number() -> tuple[int, int]:
    """One more than everything already published or drafted. Simple counting
    beats a calendar: skip a week and the numbering still stays honest."""
    published = len(list((ROOT / "editions").glob("*/index.html")))
    drafted = len(list((ROOT / "drafts").glob("*/email.html")))
    number = published + drafted + 1
    volume = ((number - 1) // EDITIONS_PER_VOLUME) + 1
    within = ((number - 1) % EDITIONS_PER_VOLUME) + 1
    return volume, within


def fill(text: str, published: dt.date, volume: int, number: int) -> str:
    full_date = f"{published:%B} {published.day}, {published:%Y}"
    swaps = {
        "[FULL DATE]": full_date,
        "[WEEKDAY]": f"{published:%A}",
        "[YYYY-MM-DD]": f"{published:%Y-%m-%d}",
        "[VOL]": str(volume),
        "[NO]": str(number),
    }
    for old, new in swaps.items():
        text = text.replace(old, new)
    return text


def main() -> int:
    today = dt.date.today()
    published = next_friday(today)
    volume, number = edition_number()
    slug = f"{published:%Y-%m-%d}"

    out = ROOT / "drafts" / slug
    if (out / "email.html").exists():
        print(f"drafts/{slug}/ already exists — nothing to do")
        print("::notice::Draft already scaffolded, skipping")
        return 0
    out.mkdir(parents=True, exist_ok=True)

    sources = {
        "email.html": ROOT / "emails" / "weekly-template.html",
        "web.html": ROOT / "template" / "edition-template.html",
    }
    for name, src in sources.items():
        if not src.exists():
            print(f"missing template: {src}", file=sys.stderr)
            return 1
        (out / name).write_text(
            fill(src.read_text(encoding="utf-8"), published, volume, number),
            encoding="utf-8",
        )

    remaining = len(re.findall(r"\[[A-Z][A-Z0-9 ,'&/·—-]{2,}\]", (out / "email.html").read_text(encoding="utf-8")))

    (out / "README.md").write_text(f"""# Edition No. {number} — {published:%A, %B} {published.day}, {published:%Y}

Vol. {volume}, No. {number}. Scaffolded automatically on {today:%A %d %B %Y}.

- `email.html` — the edition itself. Fill it in, paste into beehiiv as a
  **Custom HTML** block, set the audience to **Premium only**, schedule for
  Friday morning. This is the product.
- `web.html` — optional. Only needed if this edition is going out free and
  public. Paid editions live behind beehiiv's paywall, not on the website.

There are still **{remaining} placeholders** in `email.html`.

Section briefs and sourcing rules: [CONTENT-PLAYBOOK.md](../../CONTENT-PLAYBOOK.md)
""", encoding="utf-8")

    print(f"scaffolded drafts/{slug}/ — Vol. {volume}, No. {number}, {remaining} placeholders left")
    for key, value in {
        "slug": slug,
        "volume": volume,
        "number": number,
        "friday": f"{published:%A, %B} {published.day}, {published:%Y}",
        "placeholders": remaining,
    }.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
