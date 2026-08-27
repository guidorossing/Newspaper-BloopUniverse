# 🪐 Bloop Universe CMS

Productie- en kanaalbeheersysteem voor faceless YouTube-kanalen. Eén plek
voor kanaalinstellingen, de productiepipeline met goedkeurings-checkpoints,
to-do's, het instructiecentrum, de beveiligde Channel Admin en de
Discord-koppeling.

## Starten

Vereist alleen Node.js 18+ — geen dependencies, geen build-stap.

```bash
npm start
# → http://localhost:3000
```

Bij de eerste start wordt een admin-account aangemaakt; het tijdelijke
wachtwoord verschijnt in de terminal. Direct wijzigen na inloggen.

## Wat zit erin

| Module | Wat het doet |
|---|---|
| 📊 Dashboard | Openstaande checkpoints, deadlinebewaking, activiteitenlog |
| 📺 Kanalen | Per kanaal: onderwerp, titel- en thumbnailformat, concurrenten, uploaddagen en KPI's (AVD, CTR, levertijd, omzetgroei, **uploadfrequentie — verplicht veld**), plus YouTube-koppeling met doel-vs-realisatie-stoplichten |
| 🎬 Pipeline | Idee → Script → Voice/Avatar → Video-edit → Thumbnail → Upload. Elke stap is een checkpoint: freelancer levert in, admin keurt goed of af; pas na goedkeuring gaat het werk door naar de volgende freelancer. Per video: geplande publicatiedatum, QC-checklist (harde gate vóór upload) en KPI's |
| 📅 Kalender | Publicatiekalender die de uploadfrequentie bewaakt; bij gevaar gaat er 's ochtends automatisch een Discord-alarm af |
| 🧩 Templates | Bibliotheek met bewezen titelformules, thumbnailconcepten, hooks, beschrijvingen en scriptstructuren, met prestatie-notities |
| ✅ To-do's | Algemeen of per kanaal, met deadlines |
| 📚 Instructiecentrum | Werkinstructies voor scriptwriter, video-editor en thumbnail-artiest + algemene teamafspraken (ook in `docs/instructiecentrum/`) |
| 🔐 Channel Admin | Alle kanaalinformatie en wachtwoorden, AES-256-versleuteld; onthullen kan alleen de admin en wordt gelogd |
| 👥 Team | Toegangsbeheer met rollen: admin / manager / freelancer; Discord-koppelcodes per teamlid |
| ⚙️ Instellingen | Discord-webhook + bot-token, YouTube API-gegevens, QC-checklist beheren |

## Discord ("Discord Robot")

- **Webhook (ingebouwd):** plak een webhook-URL onder ⚙️ Instellingen en elk
  checkpoint, elke goed-/afkeuring en elke nieuwe video wordt automatisch in
  je Discord-server gepost.
- **Bot (`discord-bot/`):** freelancers werken volledig via Discord —
  `/koppel` (account koppelen), `/mijntaken`, `/inleveren` (met menu +
  popup). Voor de admin: `/status`, `/checkpoints` met
  ✅/❌-goedkeuringsknoppen (afkeuren opent een feedback-popup) en
  `/deadlines`, plus een dagelijkse 09:00-reminder. Zie
  `docs/discord-integratie.md` voor de aanbevolen serverinrichting.

## YouTube API

Koppel per kanaal het echte YouTube-kanaal (⚙️ Instellingen → YouTube
API, daarna 📺 Kanalen → Koppel YouTube). Views, AVD, abonneegroei en
omzet komen dan automatisch binnen (dagelijkse sync om 07:30) en worden
als doel-vs-realisatie met stoplichtkleuren getoond. Setup:
`docs/youtube-api.md`.

## Live zetten

`docs/deploy-vps.md` beschrijft de volledige livegang op een VPS met
eigen domein (Caddy + HTTPS + systemd + backups); kant-en-klare
configs staan in `deploy/`.

## Documentatie

- `docs/discord-integratie.md` — onderzoek + handleiding Discord-koppeling
- `docs/youtube-api.md` — YouTube API-koppeling stap voor stap
- `docs/deploy-vps.md` — livegang op een VPS met eigen domein
- `docs/beveiliging-toegangsbeheer.md` — rollenmodel, vault, wachtwoordbeleid
- `docs/extra-ideeen.md` — wat er al in zit + roadmap met uitbreidingsideeën
- `docs/instructiecentrum/` — deelbare instructies per freelancersrol

## Techniek

- Zero-dependency Node.js-server (`server/`), JSON-opslag in `data/`
  (gitignored — bevat kanaalinfo en versleutelde geheimen).
- Vanilla-JS frontend (`public/`), geen build-stap.
- Discord-bot als los pakket (`discord-bot/`, enige dependency: discord.js).
