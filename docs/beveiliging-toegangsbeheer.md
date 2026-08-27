# Beveiliging & toegangsbeheer

## Rollenmodel in het CMS

| | admin (jij) | manager | freelancer |
|---|---|---|---|
| Dashboard + pipeline | ✅ | ✅ | ✅ (zonder omzetcijfers) |
| Checkpoints goed-/afkeuren | ✅ | ✅ | ❌ |
| Kanalen aanmaken/bewerken | ✅ | ✅ | alleen lezen |
| Omzet-KPI's zien | ✅ | ✅ | ❌ |
| Channel Admin (vault) zien | ✅ | ✅ (zonder geheimen) | ❌ |
| Geheimen onthullen | ✅ (gelogd) | ❌ | ❌ |
| Gebruikers beheren | ✅ | ❌ | ❌ |
| Instellingen (Discord) | ✅ | ❌ | ❌ |

Elke onthulling van een geheim en elke beheeractie komt in het
activiteitenlog op het dashboard — je ziet dus altijd wie wat deed.

## Hoe de vault werkt

- Geheimen worden versleuteld opgeslagen met AES-256-GCM.
- De sleutel staat in `data/vault.key` (of env `BLOOP_VAULT_KEY`) en de hele
  `data/`-map is **gitignored**: er komt nooit een wachtwoord in git.
- Geheimen worden nooit in lijst-API's meegestuurd; onthullen is een aparte,
  gelogde admin-actie.

## Belangrijker dan de vault: deel zo min mogelijk wachtwoorden

1. **YouTube:** geef freelancers geen kanaalwachtwoord maar een uitnodiging
   via YouTube Studio → Instellingen → Machtigingen, rol **"Editor
   (beperkt)"** (kan uploaden en metadata bewerken, ziet geen omzet, kan
   niets publiceren als je "publiceren" voorbehoudt). Intrekken = één klik,
   geen wachtwoord hoeven wijzigen als iemand vertrekt.
2. **Google-account van het kanaal:** 2FA verplicht, herstelcodes bij de
   admin, en het admin-e-mailadres is nooit het adres dat je met
   freelancers deelt.
3. **Bij vertrek van een teamlid:** account in het CMS verwijderen (Team-tab),
   Discord-rollen intrekken, YouTube-machtiging intrekken, en alle
   wachtwoorden roteren die diegene ooit onthuld heeft gekregen (check het
   activiteitenlog).
4. **Wachtwoorden in Discord of e-mail delen: nooit.** Alles via de vault of
   een password manager met gedeelde kluizen (1Password/Bitwarden) als je
   toch iets moet delen.

## Server-checklist bij livegang

- Draai het CMS achter HTTPS (bijv. Caddy of nginx met Let's Encrypt);
  cookies zijn HttpOnly/SameSite=Strict maar horen over TLS te gaan.
- Maak dagelijks een backup van `data/db.json` én `data/vault.key`
  (zonder de sleutel zijn de geheimen onherstelbaar).
- Gebruik per persoon één account; nooit accounts delen, anders is het
  activiteitenlog niets meer waard.
