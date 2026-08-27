// Discord-notificaties vanuit het CMS via een webhook.
//
// Dit is bewust een webhook (geen bot-token): de eenvoudigste en veiligste
// koppeling. De volwaardige bot met goedkeuringsknoppen staat in
// discord-bot/ en praat met dezelfde API als de webapp.
// Zie docs/discord-integratie.md voor het volledige onderzoek.
import { load } from './store.js';

const KLEUREN = {
  info: 0x5865f2,       // Discord blurple
  goedgekeurd: 0x57f287, // groen
  afgekeurd: 0xed4245,   // rood
  checkpoint: 0xfee75c,  // geel
  deadline: 0xeb459e     // roze
};

export async function notify(type, titel, regels = []) {
  const { settings } = load();
  if (!settings.discordEnabled || !settings.discordWebhookUrl) return false;
  try {
    const res = await fetch(settings.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Bloop Universe CMS',
        embeds: [{
          title: titel,
          description: regels.join('\n'),
          color: KLEUREN[type] ?? KLEUREN.info,
          timestamp: new Date().toISOString()
        }]
      })
    });
    return res.ok;
  } catch {
    // Notificaties mogen nooit de kernflow blokkeren.
    return false;
  }
}
