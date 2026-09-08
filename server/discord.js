// Discord notifications from the CMS through a webhook.
//
// Deliberately a webhook (not a bot token): the simplest and safest link.
// The full bot with approval buttons lives in discord-bot/ and talks to the
// same API as the web app. See docs/discord-integration.md for the research.
import { load } from './store.js';

const KLEUREN = {
  info: 0x5865f2,      // Discord blurple
  approved: 0x57f287,  // green
  rejected: 0xed4245,  // red
  checkpoint: 0xfee75c, // yellow
  deadline: 0xeb459e   // pink
};

export async function notify(type, titel, regels = []) {
  const { settings } = load();
  if (!settings.discordEnabled || !settings.discordWebhookUrl) return false;
  try {
    const res = await fetch(settings.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Rossing T&M CMS',
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
    // Notifications must never block the core flow.
    return false;
  }
}
