# The Bloop Times 📰

De wekelijkse online krant van het [BloopUniverse](https://www.youtube.com/@BloopUniverse) YouTube-kanaal, met een abonnement van **€9,99/maand via Stripe**.

## Wat zit er in deze repo?

```
index.html                        → Landingspagina met abonnementsknop (Stripe)
assets/style.css                  → Gedeelde krantenstijl (alle pagina's)
editions/2026-08-26/index.html    → Editie #1 (gratis proefeditie / voorbeeld)
template/edition-template.html    → Template om elke week een nieuwe editie te maken
```

Alles is statische HTML — geen build-stap, geen server nodig. Direct te hosten op GitHub Pages, Netlify of Vercel.

---

## Stappenplan van A tot Z

### Stap 1 — Website live zetten (GitHub Pages, gratis)

1. Merge deze branch naar `main`.
2. Ga op GitHub naar **Settings → Pages**.
3. Kies bij *Source*: **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Na ±1 minuut staat de site live op `https://<jouw-gebruikersnaam>.github.io/Newspaper-BloopUniverse/`.
5. (Optioneel) Koppel een eigen domein zoals `bloopuniverse.com` onder dezelfde Pages-instellingen.

### Stap 2 — Stripe-betaallink maken (€9,99/maand)

1. Maak een account op [stripe.com](https://stripe.com) en doorloop de verificatie (KVK/bankrekening).
2. Ga naar **Product catalogus → Product toevoegen**:
   - Naam: `The Bloop Times — Weekly Subscription`
   - Prijs: **€9,99**, type **Terugkerend**, interval **Maandelijks**
3. Ga naar **Betaallinks (Payment Links) → Nieuwe link** en kies dit product.
   - Zet aan: *Klanten toestaan zelf op te zeggen via het klantportaal*
   - Vraag het **e-mailadres** van de klant uit (nodig om de krant te bezorgen!)
4. Kopieer de link (vorm: `https://buy.stripe.com/xxxxx`).
5. Open `index.html`, zoek naar `REPLACE_WITH_YOUR_PAYMENT_LINK` en plak daar jouw link. Commit en push.

> **Tip:** activeer in Stripe ook het **klantportaal** (Settings → Billing → Customer portal), zodat abonnees zelf kunnen opzeggen. Dat voorkomt chargebacks en support-mails.

### Stap 3 — Bezorging aan abonnees

Simpelste werkwijze om mee te starten (geen techniek nodig):

1. In Stripe zie je onder **Klanten** wie een actief abonnement heeft (met e-mailadres).
2. Stuur elke week een korte mail met de link naar de nieuwste editie (bijv. via Gmail met BCC, of gratis via Mailerlite/Brevo zodra je >20 abonnees hebt).
3. De nieuwste editie kun je een onvindbare mapnaam geven tot je hem publiek maakt, of je maakt elke oude editie na 4 weken gratis toegankelijk ("de nieuwste week is voor abonnees").

Wil je later een échte inlogmuur (alleen betalende leden kunnen lezen)? Dan is de volgende stap een dienst als **Memberstack**, **Outseta** of **Ghost** — of een klein backendje met Stripe Checkout. Dat kunnen we in een vervolgsessie bouwen.

### Stap 4 — Wekelijkse routine (±45 min per week)

| Dag | Actie |
|---|---|
| Ma | Kopieer `template/edition-template.html` naar `editions/JJJJ-MM-DD/index.html` |
| Ma | Vul in: nieuwe video's van de week, views-cijfers, één "Behind the Bloop"-verhaal, quiz, beste fan-comment |
| Di | Nalezen, koppen aanscherpen, thumbnail-URL's checken |
| Wo | Commit + push → editie staat live. Mail de link naar je abonnees |
| Wo | Promo: community-post op YouTube + vermelding in je nieuwste video |

De weekcijfers (views, nieuwe uploads) kun je elke week opnieuw door Claude laten ophalen en de editie laten voorschrijven — jij hoeft alleen nog te redigeren.

### Stap 5 — Promotie

- Zet de link naar de krant in **elke videobeschrijving** en je **kanaalbanner**.
- Maak een **community-post** bij elke nieuwe editie met één grappige kop als teaser.
- Noem de krant in je video-outro: *"Read the full story in this week's Bloop Times."*
- Houd editie #1 permanent gratis als proefeditie — dat is je belangrijkste verkooppagina.

### Stap 6 — Meten en bijsturen (na 4 weken)

- Stripe-dashboard: aanmeldingen, opzeggingen, omzet.
- Werkt €9,99 niet? Overweeg een tussentier (€4,99) of een jaarprijs met korting.
- Vraag opzeggers (via Stripe-portal exit-vraag) waarom ze weggaan.

---

## Nieuwe editie maken — korte checklist

1. `cp template/edition-template.html editions/JJJJ-MM-DD/index.html`
2. Alle `[PLACEHOLDERS]` invullen, Vol./No. ophogen
3. Link "Latest edition" in `index.html` (footer) bijwerken
4. Committen, pushen, mailen. Klaar. 🗞️
