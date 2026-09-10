# The Bloop Times — how this project works

Read this before touching anything. It is the standing agreement: what the
product is, what has been decided, and the mistakes this project has already
made once. The detail lives in the files named at the end; this is the shape.

---

## The product

**The Bloop Times** is a weekly email newspaper about films — bloopers, the
stories behind them, and the week's movie news. It is published by the
**BloopUniverse** YouTube channel (movie bloopers, ~5.4K subscribers, mostly
American viewers).

> The funniest bloopers, untold behind-the-scenes stories, and the biggest
> movie updates — delivered straight to your inbox.

Two ways to read it:

| | What it is | Where |
|---|---|---|
| **The free edition** | One complete sample, sent on sign-up. Permanent, unchanging, deliberately carries no news. | Welcome email + `editions/2026-08-26/` |
| **Bloop Times Insider** | A new edition every Friday, $9.99/month. | beehiiv, Premium only |

Written in **English** — the readers are American. Conversation with Guido is
in **Dutch**.

---

## The one rule

**Nothing goes in that you cannot point at a source for.**

A paper about what really happened on set is worth nothing the moment a reader
can't be sure it's true. One invented casting, one wrong release date, one
"fun fact" that turns out to be a myth, and the reason to pay is gone.

- News: two trade outlets, or one plus the studio's own announcement.
- Behind-the-scenes: a named person, in a named place — commentary track,
  printed interview, documentary.
- Famous but unconfirmed: say so in the text, or leave it out. No third option.
- Can't source it well enough? Leave the section thinner and say so. A thin
  section is recoverable; a fabricated one is not.

Corrections get printed the following Friday, and credited.

---

## Decisions already made

Don't re-open these without asking.

- **$9.99 is the whole price.** Prices are in US dollars and include any VAT
  that applies. Nothing is added at checkout, and no Stripe Tax is configured.
  Revisit at hundreds of European subscribers, not before.
- **The free edition carries no number.** Friday editions are numbered from
  **No. 1**. The sample is a specimen of the paper, not an instalment — number
  it and the first edition anyone pays for arrives as No. 2.
- **beehiiv holds the paper; the website is the shop window.** A static site
  cannot check who is reading, so a paid edition published there is readable by
  anyone with the URL and indexed within days.
- **The word is "edition", never "issue".**
- **The paid tier is "Bloop Times Insider"** — named after the paper, not the
  channel.
- **Buttons never say "Subscribe" for the free sign-up.** It's one sample, not
  an ongoing free subscription: "Get your free edition" / "Try it free".
- **The welcome email and the three follow-ups carry no news.** They fire on a
  timer and may be read a year later. That omission is also the sales argument.

---

## The week

**Thursday 06:00 UTC** — a scheduled session researches the week's real film
news, writes the full edition into `drafts/YYYY-MM-DD/`, and pushes a branch
named `edition/YYYY-MM-DD`. A workflow opens the draft pull request, using the
session's own `SOURCES.md` as the body.

**Friday** — Guido reads it, checks the sources, merges. Then he says it's
approved, and only then does anything reach beehiiv: created as a **draft**
first, audience **Premium only**, scheduled by hand until one send has gone
through cleanly.

Nothing is sent or scheduled without Guido saying so, in that turn. Not once.

---

## Working agreements

- **Draft pull requests, always.** Guido merges; Claude does not.
- **Nothing automatic outside Thursday morning.** No polling, no scheduled
  check-ins, no speculative runs. Thursday's session is the one authorised
  standing cost; everything else waits to be asked. A weekly run costs
  roughly $10, which is worth knowing before adding more.
- **Say what can't be verified.** Guido would rather hear "I couldn't check
  this" than read a confident guess.
- **Business facts on the site are real.** Rossing T&M, KvK 98932640, VAT
  NL005362628B32, Groningerweg 24, 9321 AD Peize. Guido — not beehiiv — is the
  merchant of record: beehiiv connects his own Stripe account and takes no
  revenue share, so the obligations are his.

---

## Mistakes this project has already made

Each of these cost time once. They are cheap to avoid twice.

**GitHub has merged a stale head three times.** PRs #1, #3 and #16 were merged
carrying only part of the branch, and the later commits were silently dropped —
including, once, half an address that had been the whole point of the change.
After a merge, verify `origin/main` actually contains the change rather than
trusting the PR page.

**A scheduled session with no repository attached fails in under three
minutes.** It reports "the repository is not attached" as if that were a
conclusion. The repo must be in the trigger's environment sources; the session
prompt also tells it to `add_repo` itself as a fallback.

**Claude sessions cannot reach beehiiv.** `api.beehiiv.com` and
`developers.beehiiv.com` are both blocked by the egress proxy — verified, not
assumed. Anything that must talk to beehiiv runs in GitHub Actions, where the
API key lives as a repository secret and never enters the repo or a
conversation.

**`title` is not the subject line.** beehiiv keeps them apart. Sending only
`title` ships an edition with a blank subject.

**Never hotlink `i.ytimg.com`.** What YouTube serves at
`vi/<id>/hq720.jpg` is a 1280×720 JPEG of around a quarter-megabyte, and the
email shows it 552px wide. Four of them made one edition carry 938KB of
pictures; Guido's phone loaded the icons and gave up on the thumbnails. Run
`python3 .github/scripts/fetch_thumbs.py <videoId> …` and point at
`bloopuniverse.com/assets/img/thumbs/<videoId>.jpg` — same pictures, a third
of the weight, and no third party in the delivery path of a paid product.

**A merge does not reach beehiiv.** The post holds its own copy of the HTML,
pasted into a Custom HTML block. Change the file, merge it, deploy it — the
post is still the old one. Re-paste, then test. This cost a round of
"it still doesn't work" that was really "you tested the same email twice".

**The email HTML must stay email-safe.** Tables, inline styles, no webfonts,
600px, no media queries or flexbox or grid. It breaks in Outlook otherwise.

**Three papers in one funnel.** The landing page, the free edition and the
Friday editions once each described a different set of sections. Change the
format in one place and the other two need changing too.

---

## Where the detail lives

| File | What it covers |
|---|---|
| `CONTENT-PLAYBOOK.md` | The eleven sections, the running order, sourcing standards, the weekly rhythm |
| `README.md` | The stack, where things are hosted, how to publish an edition |
| `emails/HOW-TO-SET-UP.md` | The beehiiv automation: welcome email and the three follow-ups |
| `template/edition-template.html` | Web edition template |
| `emails/weekly-template.html` | Friday email template |
| `.github/workflows/` | Thursday scaffold fallback, auto-PR, beehiiv scheduling |

---

## Off limits

The directories `server/`, `public/`, `discord-bot/`, `deploy/` and `docs/`,
and the branch `claude/bloop-universe-cms-h4vlgj`, belong to the Rossing T&M
CMS — a different system with its own routine. Touch nothing there.
