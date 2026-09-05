# The Bloop Times 📰

De wekelijkse online krant van het [BloopUniverse](https://www.youtube.com/@BloopUniverse) YouTube-kanaal, op **bloopuniverse.com**.

> The funniest bloopers, untold behind-the-scenes stories, and the biggest
> movie updates — delivered straight to your inbox.

**Aanbod:** één gratis proefeditie bij aanmelding, daarna elke vrijdag een nieuwe editie voor **Bloop Times Insiders** — **$9,99/maand**.

**Stack:** statische site (deze repo) → **Cloudflare Worker met static assets** (`wrangler.jsonc`) op `bloopuniverse.com` → aanmeldingen, betalingen en bezorging via **beehiiv** op `news.bloopuniverse.com`, met **Stripe** eraan gekoppeld.

## Wat zit er in deze repo?

```
index.html                        → Landingspagina (verkooppagina + knoppen naar beehiiv)
archive.html                      → Archiefpagina met alle edities
editions/2026-08-26/index.html    → Editie nr. 1 (permanent gratis voorbeeldeditie)
template/edition-template.html    → Weektemplate voor de web-editie
emails/weekly-template.html       → Weektemplate voor de e-mail (beehiiv, Custom HTML)
emails/welcome-free-edition.html  → De welkomstmail met de gratis editie (staat live)
emails/HOW-TO-SET-UP.md           → Beehiiv-walkthrough voor de welkomstautomation
CONTENT-PLAYBOOK.md               → Wat er elke week in de krant gaat, en hoe je het controleert
assets/style.css                  → Gedeelde krantenstijl (alle pagina's)
wrangler.jsonc · .assetsignore    → Cloudflare-deploy
robots.txt · sitemap.xml          → Voor Google
```

Geen build-stap, geen server. Push naar `main` → Cloudflare zet het binnen een minuut live.

---

## Hoe het in elkaar zit

| Onderdeel | Waar | Status |
|---|---|---|
| Website | `bloopuniverse.com` (Cloudflare Worker) | live |
| `www` → apex | Cloudflare Redirect Rule (301) | live |
| Nieuwsbrief | `news.bloopuniverse.com` (beehiiv) | live |
| E-maildomein | `mail.bloopuniverse.com` | live |
| Betaaltier | Bloop Times Insider, $9,99/mnd via Stripe | live |
| Welkomstautomation | beehiiv: *Signed up* → *Send email* | **Live** |

De ketting loopt vanzelf: video → site → aanmelding → gratis editie → upgradeknop.

---

## De krant zelf

De inhoud is vastgelegd in **[CONTENT-PLAYBOOK.md](CONTENT-PLAYBOOK.md)**: de vaste
volgorde van tien secties, de roterende rubriek, per sectie wat erin hoort, en —
het belangrijkste — welke bron goed genoeg is. Lees dat één keer door voordat je
aan editie nr. 2 begint.

Korte versie van de vaste volgorde:

1. The Front Page — het grootste filmnieuws van de week
2. The Wire — drie korte movie/actor updates
3. Behind the Scenes — het lange verhaal
4. Blooper of the Week — de feitenkaart
5. Improvised or Scripted? — één beroemde zin, uitgezocht
6. Did You Know? — drie feitjes
   *(+ roterend: Deleted Scene · Casting That Almost Happened · Where Are They Now?)*
7. Coming Soon — bioscoop en streaming
8. Reader Poll + Guess the Movie
9. Video of the Week + Fan Corner
10. Insiders Only — het verhaal dat nooit een video wordt
11. What We're Working On — vooruitblik

**De enige harde regel:** niets erin zonder bron. Één verzonnen castingnieuwtje
en de geloofwaardigheid is weg.

---

## Waar een editie leeft

**beehiiv houdt de krant. De website is de etalage.**

bloopuniverse.com is een statische site: die serveert iedereen hetzelfde en kan
niet controleren wie er leest. Publiceer je een betaalde editie daar, dan is hij
leesbaar voor iedereen met de URL en staat hij binnen een paar dagen in Google.
beehiiv zet de betaalmuur wél goed neer. Dus daar gaan de edities heen.

| | Waar | Wie leest het |
|---|---|---|
| Editie nr. 1 | website, `editions/2026-08-26/` | iedereen, permanent — dat is de verkooppagina |
| Elke vrijdageditie | beehiiv, **Premium only** | Insiders |
| Archiefindex | website, `archive.html` | iedereen ziet covers en teasers; de link opent beehiiv |

`template/edition-template.html` heb je dus alleen nodig voor een editie die je
bewust gratis en openbaar zet. Het wekelijkse werk is de e-mail.

---

## Donderdag staat de opzet al klaar

De GitHub Action `.github/workflows/thursday-edition-draft.yml` draait elke
donderdag om 06:00 UTC en opent een draft pull request met
`drafts/JJJJ-MM-DD/email.html` — het weektemplate met datum, jaargang en
editienummer al ingevuld — plus de volledige checklist in de PR-omschrijving.

Jij vult hem, vinkt af, en merget. Mergen verstuurt niets: de PR is een
werkbank, geen drukpers.

Eerder beginnen? **Actions → Thursday edition draft → Run workflow.** Hij maakt
geen tweede opzet voor een vrijdag die er al een heeft.

**Eenmalig aanzetten:** Settings → Actions → General → *Workflow permissions* →
zet **Allow GitHub Actions to create and approve pull requests** aan. Zonder dat
vinkje maakt de action de bestanden wel, maar de PR niet.

---

## Vrijdag: nakijken en versturen

1. Factcheck-ronde, dan de pull request mergen
2. beehiiv → nieuwe post → **Blank draft** → `/` → **Custom HTML** → `email.html` plakken
3. Doelgroep op **Premium only**
4. Onderwerpregel + previewtekst, testmail naar jezelf, lezen op je telefoon
5. **Inplannen** voor vrijdagochtend in plaats van handmatig versturen — een
   ingeplande post kun je tot het laatste moment nog aanpassen of annuleren
6. Post-URL kopiëren, editie bovenaan in `archive.html` zetten, pushen

---

## Weekritme

| Dag | Werk |
|---|---|
| Ma | Trades scannen: front page + drie Wire-items kiezen, bronnen meteen noteren |
| Di | Behind the Scenes + de roterende rubriek schrijven |
| Wo | Blooper of the Week, Improvised or Scripted, Did You Know, still voor Guess the Movie |
| Do | Coming Soon (data hercontroleren), pollresultaten, Fan Corner, Video of the Week, Insidersverhaal |
| Vr | Factcheck, web-editie publiceren, daarna versturen via beehiiv, community-post op YouTube |

---

## Promotie

- Link naar **bloopuniverse.com** in elke videobeschrijving en in de kanaalbanner
- Community-post bij elke nieuwe editie, met één grappige kop als teaser
- Noem de krant in de outro: *"Read the full story in this week's Bloop Times — link below."*
- Editie nr. 1 blijft permanent gratis en openbaar: dat is de belangrijkste verkooppagina

## Meten (na vier weken)

Beehiiv: aanmeldingen, open-rate, conversie naar Insider, opzeggingen.
Stripe: omzet. Werkt $9,99 niet? Kijk dan eerst naar de sectie *Insiders Only* —
als die niet sterk genoeg is, is het niet de prijs die het probleem is.
