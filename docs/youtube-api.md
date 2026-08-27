# YouTube API-koppeling instellen

Hiermee haalt het CMS automatisch de échte cijfers op: views, kijktijd
(AVD), abonneegroei en omzet per kanaal, plus views/AVD per video. Doel
vs. realisatie verschijnt met stoplichtkleuren op de kanaalkaarten.

## Eenmalig: Google Cloud-project (±10 minuten)

1. Ga naar https://console.cloud.google.com → nieuw project, bijv.
   "Bloop Universe CMS".
2. **APIs & Services → Library**: schakel in:
   - *YouTube Data API v3*
   - *YouTube Analytics API*
3. **APIs & Services → OAuth consent screen**: type *External*, vul naam +
   e-mail in. Voeg bij *Test users* elk Google-account toe waarmee je een
   YouTube-kanaal gaat koppelen (de app hoeft niet door Google-review —
   testmodus is prima voor eigen gebruik).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type: *Web application*
   - Authorized redirect URI: `https://cms.bloopuniverse.com/api/youtube/callback`
     (jouw domein + exact dit pad; lokaal testen kan met
     `http://localhost:3000/api/youtube/callback`)
5. Kopieer de **client-id** en het **client-secret** naar het CMS:
   ⚙️ Instellingen → YouTube API → opslaan.

## Per kanaal koppelen

1. Tabblad **Kanalen** → knop **▶️ Koppel YouTube** bij het kanaal.
2. Log in met het Google-account dat eigenaar is van dat YouTube-kanaal
   en geef toestemming (alleen-lezen scopes).
3. Terug in het CMS: knop **🔄 Sync cijfers**. Vanaf dan draait er ook
   elke ochtend om 07:30 automatisch een sync.

Het refresh-token wordt AES-256-versleuteld opgeslagen (zelfde kluis als
de Channel Admin) en verlaat de server nooit.

## Per video

Zet na de upload het YouTube video-id bij de video (Pipeline → bewerken →
"YouTube video-id", het deel na `watch?v=`). De sync vult dan views, AVD
en kijkpercentage automatisch.

## Wat kan níet automatisch

Thumbnail-**CTR** (impressies → clicks) stelt YouTube niet beschikbaar via
de publieke Analytics API — dat cijfer zie je alleen in YouTube Studio.
Vul het handmatig in via Pipeline → bewerken → KPI-invoer; het telt dan
gewoon mee in doel-vs-realisatie.

## Problemen oplossen

- **"Geen refresh-token ontvangen"** — je had de app al eerder
  gekoppeld. Ga naar https://myaccount.google.com/permissions, trek de
  toegang in en koppel opnieuw.
- **"access_denied" bij inloggen** — het Google-account staat niet bij
  *Test users* in het consent screen.
- **Omzet blijft leeg** — het kanaal zit niet in het
  YouTube-partnerprogramma, of je hebt de monetaire scope geweigerd; de
  sync valt dan automatisch terug op cijfers zonder omzet.
