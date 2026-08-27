# Livegang op een VPS (met eigen domein)

Zo zet je het CMS + de Discord-bot 24/7 online zodat freelancers overal
kunnen inloggen. Reken op ~30 minuten en ~€5/maand (Hetzner CX22,
DigitalOcean Basic of vergelijkbaar, Ubuntu 24.04).

## 1. Server klaarzetten

```bash
# als root op de verse VPS:
adduser --disabled-password --gecos "" bloop
apt update && apt install -y nodejs npm git caddy
node --version   # moet >= 18 zijn

# code binnenhalen
git clone https://github.com/guidorossing/Newspaper-BloopUniverse.git /opt/bloop-universe
chown -R bloop:bloop /opt/bloop-universe
```

## 2. Domein + HTTPS (Caddy)

1. Maak bij je domeinbeheerder een A-record: `cms.bloopuniverse.com` →
   IP van de VPS.
2. Zet `deploy/Caddyfile` neer en start Caddy:

```bash
cp /opt/bloop-universe/deploy/Caddyfile /etc/caddy/Caddyfile
# pas het domein in het bestand aan!
systemctl reload caddy
```

Caddy regelt het HTTPS-certificaat automatisch via Let's Encrypt. De
`X-Forwarded-Proto`-header staat al goed voor de YouTube OAuth-redirect.

## 3. CMS als service

```bash
cp /opt/bloop-universe/deploy/bloop-cms.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bloop-cms
journalctl -u bloop-cms -n 20   # hier staat het tijdelijke admin-wachtwoord
```

Log in op `https://cms.bloopuniverse.com`, wijzig direct het
admin-wachtwoord, en loop de Instellingen langs (Discord-webhook,
bot-token, QC-lijst, YouTube client-id/secret).

## 4. Discord-bot als service

```bash
cd /opt/bloop-universe/discord-bot
sudo -u bloop npm install
sudo -u bloop cp .env.example .env
# vul .env: Discord-token/client-id/guild-id + CMS_URL=http://localhost:3000
# + CMS_BOT_TOKEN uit het CMS (Instellingen -> Genereer bot-token)
cp /opt/bloop-universe/deploy/bloop-discord-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bloop-discord-bot
```

## 5. Backups (verplicht!)

Alles staat in `/opt/bloop-universe/data/`: de database én de
vault-sleutel. Zonder `vault.key` zijn de wachtwoorden in de Channel Admin
onherstelbaar. Dagelijkse backup via cron:

```bash
crontab -e   # als root, voeg toe:
0 3 * * * tar czf /root/backup-bloop-$(date +\%u).tar.gz -C /opt/bloop-universe data
```

(Bewaart 7 roterende dagelijkse backups. Kopieer ze af en toe naar je
eigen computer of een object store.)

## 6. Updaten

```bash
cd /opt/bloop-universe && sudo -u bloop git pull
systemctl restart bloop-cms bloop-discord-bot
```

## Alternatief: Railway/Render

Wil je toch geen server beheren: het CMS is één `npm start` zonder
dependencies, dus elke Node-host werkt. Let op twee dingen: mount een
persistent volume op `data/` (anders ben je je database kwijt bij elke
deploy) en zet `BLOOP_VAULT_KEY` als environment-variabele.
