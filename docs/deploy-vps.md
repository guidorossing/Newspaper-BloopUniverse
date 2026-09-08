# Livegang op een VPS (met eigen domein)

Zo zet je het CMS + de Discord-bot 24/7 online zodat freelancers overal
kunnen inloggen. Reken op ~30 minuten en ~€11/maand (Hetzner CPX12,
DigitalOcean Basic of vergelijkbaar, Ubuntu 24.04 of nieuwer).

## 1. Server klaarzetten

```bash
# als root op de verse VPS:
adduser --disabled-password --gecos "" rossingtm
apt update && apt upgrade -y
apt install -y git curl

# Node 22 — de versie in Ubuntu zelf is te oud voor het CMS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version   # moet >= 18 zijn

# code binnenhalen
git clone https://github.com/guidorossing/Newspaper-BloopUniverse.git /opt/cms-rossingtm
chown -R rossingtm:rossingtm /opt/cms-rossingtm
```

## 2. Domein + HTTPS (Caddy)

1. Maak bij je domeinbeheerder een A-record: `cms.rossingtm.com` →
   IP van de VPS. Controleer met `ping cms.rossingtm.com` dat het
   doorgekomen is voordat je verder gaat.
2. Caddy zit **niet** in de standaard pakketbron van Ubuntu; voeg eerst
   zijn eigen bron toe:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

3. Zet `deploy/Caddyfile` neer en herlaad Caddy:

```bash
cp /opt/cms-rossingtm/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile   # pas het domein aan!
systemctl reload caddy
```

Caddy regelt het HTTPS-certificaat automatisch via Let's Encrypt. De
`X-Forwarded-Proto`-header staat al goed voor de YouTube OAuth-redirect.

## 3. CMS als service

```bash
cp /opt/cms-rossingtm/deploy/cms-rossingtm.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cms-rossingtm
journalctl -u cms-rossingtm -n 20   # hier staat het tijdelijke admin-wachtwoord
```

Log in op `https://cms.rossingtm.com`, wijzig direct het
admin-wachtwoord, en loop de Instellingen langs (Discord-webhook,
bot-token, QC-lijst, YouTube client-id/secret).

## 4. Discord-bot als service

```bash
cd /opt/cms-rossingtm/discord-bot
sudo -u rossingtm npm install
sudo -u rossingtm cp .env.example .env
# vul .env: Discord-token/client-id/guild-id + CMS_URL=http://localhost:3000
# + CMS_BOT_TOKEN uit het CMS (Instellingen -> Genereer bot-token)
cp /opt/cms-rossingtm/deploy/cms-rossingtm-discord-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cms-rossingtm-discord-bot
```

## 5. Backups (verplicht!)

Alles staat in `/opt/cms-rossingtm/data/`: de database én de
vault-sleutel. Zonder `vault.key` zijn de wachtwoorden in de Channel Admin
onherstelbaar. Dagelijkse backup via cron:

```bash
crontab -e   # als root, voeg toe:
0 3 * * * tar czf /root/backup-cms-$(date +\%u).tar.gz -C /opt/cms-rossingtm data
```

(Bewaart 7 roterende dagelijkse backups. Kopieer ze af en toe naar je
eigen computer of een object store.)

## 6. Updaten

```bash
cd /opt/cms-rossingtm && sudo -u rossingtm git pull
systemctl restart cms-rossingtm cms-rossingtm-discord-bot
```

## Alternatief: Railway/Render

Wil je toch geen server beheren: het CMS is één `npm start` zonder
dependencies, dus elke Node-host werkt. Let op twee dingen: mount een
persistent volume op `data/` (anders ben je je database kwijt bij elke
deploy) en zet `CMS_VAULT_KEY` als environment-variabele.
