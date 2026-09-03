# The Bloop Times 📰

De wekelijkse online krant van het [BloopUniverse](https://www.youtube.com/@BloopUniverse) YouTube-kanaal, op **bloopuniverse.com**. Gratis wekelijkse editie via e-mail, met een premium-abonnement van **€9,99/maand**.

**Stack:** statische website (deze repo) → gehost op **Cloudflare Pages** → aanmeldingen, betalingen en bezorging via **beehiiv** (met **Stripe** eraan gekoppeld).

## Wat zit er in deze repo?

```
index.html                        → Landingspagina (verkooppagina + aanmeldknoppen naar beehiiv)
archive.html                      → Archiefpagina met alle edities
editions/2026-08-26/index.html    → Editie #1 (gratis proefeditie / voorbeeld)
template/edition-template.html    → Template om elke week een nieuwe editie te maken
assets/style.css                  → Gedeelde krantenstijl (alle pagina's)
robots.txt · sitemap.xml          → Voor Google
```

Alles is statische HTML — geen build-stap, geen server nodig.

---

## Stappenplan van A tot Z

### Stap 1 — Site live zetten op Cloudflare Pages (±5 min)

1. Merge deze branch naar `main`.
2. Ga in Cloudflare naar **Workers & Pages → Create → Pages → Connect to Git**.
3. Kies de repo `Newspaper-BloopUniverse`, branch `main`.
4. Build-instellingen: *Framework preset* = **None**, *Build command* = **leeg laten**, *Build output directory* = `/` (root). Klik **Save and Deploy**.
5. Na ±1 minuut staat de site op een `*.pages.dev`-adres.

### Stap 2 — bloopuniverse.com koppelen (±2 min)

1. In je Pages-project: **Custom domains → Set up a custom domain** → vul `bloopuniverse.com` in.
2. Omdat het domein al bij Cloudflare staat, wordt het DNS-record automatisch aangemaakt. Herhaal voor `www.bloopuniverse.com`.
3. HTTPS staat automatisch aan. Klaar — geen `CNAME`-bestand of handmatige DNS nodig.

> Bij elke push naar `main` zet Cloudflare de site binnen een minuut automatisch opnieuw live.

### Stap 3 — beehiiv-links in de site zetten (±2 min)

De site verwijst op drie plekken naar beehiiv. Vervang de placeholders:

| Placeholder | Vervangen door | Waar te vinden in beehiiv |
|---|---|---|
| `https://YOUR-PUBLICATION.beehiiv.com/subscribe` | jouw aanmeldpagina | **Audience → Subscribe forms** of gewoon je publicatie-URL + `/subscribe` |
| `https://YOUR-PUBLICATION.beehiiv.com/upgrade` | jouw upgrade/premium-pagina | **Monetization → Paid subscriptions** → de upgrade-link |

Zoek in `index.html` en `archive.html` naar `YOUR-PUBLICATION` en plak de echte links. Commit, push — klaar.

> **Tip:** heb je in beehiiv een eigen domein ingesteld (bijv. `news.bloopuniverse.com`)? Gebruik dan die links, dat oogt netter.

### Stap 4 — beehiiv Premium + Stripe controleren

In beehiiv onder **Monetization → Paid subscriptions**:
- Stripe gekoppeld ✔
- Tier aangemaakt: *Premium*, **€9,99/maand** ✔
- Omschrijf wat premium krijgt (volledige archief, bonusverhalen, early access) — dit toont beehiiv op de betaalpagina.

Beehiiv regelt daarmee de betaalmuur, opzeggen, facturen én welke lezers welke mail krijgen. De website hoeft hier niets voor te doen.

### Stap 5 — Wekelijkse routine (vrijdag)

| Dag | Actie | Wie |
|---|---|---|
| Do | Concepteditie schrijven: `template/edition-template.html` kopiëren naar `editions/JJJJ-MM-DD/index.html`, placeholders invullen | Claude (op verzoek) of jij |
| Vr | Nalezen, editie toevoegen aan `archive.html` (blok kopiëren, nieuwste bovenaan) en aan `sitemap.xml`, mergen → live | Jij (±20 min) |
| Vr | Zelfde inhoud als beehiiv-post versturen naar je lezers (gratis versie naar iedereen, volledige versie naar premium) | Jij in beehiiv (±10 min) |
| Vr | Community-post op YouTube + link in de videobeschrijving | Jij (±5 min) |

Vraag Claude in een sessie: *"Maak editie #2"* — dan worden verse kanaalcijfers opgehaald en wordt het concept geschreven; jij redigeert alleen nog.

### Stap 6 — Promotie

- Link naar **bloopuniverse.com** in elke videobeschrijving en in je kanaalbanner.
- Pin een community-post bij elke nieuwe editie met één grappige kop als teaser.
- Noem de krant in je video-outro: *"Read the full story in this week's Bloop Times — link below."*
- Editie #1 blijft permanent gratis en openbaar: dat is je belangrijkste verkooppagina.

### Stap 7 — Meten en bijsturen (na 4 weken)

- Beehiiv-dashboard: aanmeldingen, open-rate, premium-conversie, opzeggingen.
- Stripe-dashboard: omzet.
- Werkt €9,99 niet? Overweeg een jaarprijs met korting of een tussentier.

---

## Nieuwe editie maken — korte checklist

1. `cp template/edition-template.html editions/JJJJ-MM-DD/index.html`
2. Alle `[PLACEHOLDERS]` invullen, Vol./No. ophogen
3. Nieuw blok bovenaan in `archive.html` + regel in `sitemap.xml`
4. Committen, pushen → Cloudflare zet 'm live. Dan versturen via beehiiv. 🗞️
