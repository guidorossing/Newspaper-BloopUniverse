# Onderzoek: Discord-server koppelen aan het Bloop Universe CMS

Dit document beschrijft **hoe** je de Discord-server aan het systeem koppelt,
welke opties er zijn, en welke inrichting wordt aanbevolen. Beide onderdelen
zijn ook al **gebouwd** in deze repo (webhook-notificaties in het CMS +
volwaardige bot in `discord-bot/`).

## De drie koppelingsopties

### Optie 1 — Webhook (eenrichting: CMS → Discord) ✅ gebouwd, direct bruikbaar

Een webhook is een URL die Discord per kanaal uitgeeft. Het CMS post er
JSON-berichten naartoe; er is geen bot-account of hosting nodig.

- **Instellen (2 minuten):** Discord → Serverinstellingen → Integraties →
  Webhooks → Nieuwe webhook → kies kanaal (bijv. `#productie-updates`) →
  URL kopiëren → plakken in het CMS onder ⚙️ Instellingen → "Test versturen".
- **Wat je krijgt:** automatisch bericht bij elke nieuwe video, ingeleverd
  checkpoint (geel), goedkeuring (groen, met ping wie er nu aan zet is),
  afkeuring (rood, met feedback) en afgeronde video.
- **Beperking:** eenrichtingsverkeer. Je kunt er niet vanuit Discord mee
  goedkeuren of statussen opvragen.

### Optie 2 — Bot (tweerichting: Discord ↔ CMS) ✅ gebouwd in `discord-bot/`

Een echte "Discord Robot": een applicatie met eigen account die in de server
zit, slash-commands aanbiedt en op knoppen reageert.

- **Freelancers werken volledig via Discord:**
  - `/koppel <code>` — eenmalig je Discord-account aan je CMS-account
    koppelen (de admin genereert de code via Team → 🎮 Koppelcode)
  - `/mijntaken` — je open taken, deadlines en de laatste feedback
  - `/inleveren` — taak kiezen uit een menu, link plakken in een popup,
    klaar; de API handelt namens jouw gekoppelde account, dus alle
    rolregels en de QC-gate blijven gelden
  - afkeur-feedback komt met een @mention terug in het productiekanaal
- **Voor de admin:**
  - `/status` — pipeline-overzicht van alle video's in productie
  - `/checkpoints` — alles wat op goedkeuring wacht, met ✅/❌-knoppen;
    afkeuren opent een popup waarin je direct de feedback typt
  - `/deadlines` — wat te laat of bijna te laat is
  - dagelijkse 09:00-reminder met openstaand werk en deadlines
- **Beveiliging:** alleen Discord-leden met de rol `CMS Admin` mogen de
  keurknoppen gebruiken; de bot authenticeert bij het CMS met een vast
  bot-token (Instellingen → Genereer bot-token) en freelancer-acties
  lopen altijd via hun gekoppelde CMS-account.
- **Instellen:**
  1. https://discord.com/developers/applications → New Application → Bot →
     token kopiëren.
  2. Onder "Installation"/OAuth2: scope `bot` + `applications.commands`,
     permissies "Send Messages" en "Embed Links"; met de gegenereerde URL
     de bot in je server uitnodigen.
  3. In het CMS: Instellingen → **Genereer bot-token**.
  4. `cd discord-bot && cp .env.example .env` → invullen (Discord-token +
     CMS_BOT_TOKEN) → `npm install && npm start`.
  5. De bot moet ergens draaien dat altijd aanstaat: dezelfde VPS als het
     CMS (zie docs/deploy-vps.md — er staat een kant-en-klare
     systemd-unit in deploy/).

### Optie 3 — Discord als identiteitslaag (OAuth2 / Linked Roles) — later

Freelancers loggen in op het CMS mét hun Discord-account, en hun CMS-rol
bepaalt automatisch hun Discord-rollen (en dus welke kanalen ze zien).
Krachtig, maar pas de moeite waard bij >10 teamleden. Nog niet gebouwd;
de auth-laag (`server/auth.js`) is er wel op voorbereid (rol per gebruiker).

## Aanbevolen serverinrichting

```
📁 ALGEMEEN
   #welkom              — regels + link naar het instructiecentrum
   #aankondigingen      — alleen admin schrijft
📁 PRODUCTIE (bot + webhook posten hier)
   #productie-updates   — webhook: alle checkpoints en goedkeuringen
   #goedkeuringen       — bot: /checkpoints met knoppen (alleen admin ziet dit)
   #deadlines           — dagelijkse 09:00-reminder
📁 PER STAP (freelancers zien alleen hun eigen stap-kanaal)
   #ideeen              — ideeënbank, iedereen mag pitchen
   #scripts             — scriptwriters + admin
   #voice-avatar        — voice-artiesten + admin
   #video-edit          — editors + admin
   #thumbnails          — thumbnail-artiesten + admin
   #upload              — uploaders + admin
📁 PER KANAAL (optioneel bij meerdere kanalen)
   #kanaal-<naam>       — alles wat specifiek over dat kanaal gaat
```

**Discord-rollen** spiegelen de CMS-rollen: `CMS Admin`, `Manager`,
`Scriptwriter`, `Voice`, `Editor`, `Thumbnail`, `Uploader`. Zet
kanaalpermissies zo dat een freelancer alléén Algemeen + zijn eigen
stap-kanaal ziet — zo lekt er nooit informatie (omzet, wachtwoorden,
andermans tarieven) naar de verkeerde persoon. Dit is het Discord-verlengstuk
van het toegangsbeheer in het CMS.

## Waarom deze combinatie

| | Webhook | Bot | OAuth2 |
|---|---|---|---|
| Moeite | 2 min | ~30 min | dagen |
| Hosting nodig | nee | ja | ja |
| Notificaties | ✅ | ✅ | — |
| Goedkeuren vanuit Discord | ❌ | ✅ | — |
| Automatisch rollenbeheer | ❌ | deels | ✅ |

**Advies:** start vandaag met de webhook (staat al in het CMS), zet de bot
erbij zodra het CMS op een server draait, en bewaar OAuth2 voor het moment
dat het team groeit.
