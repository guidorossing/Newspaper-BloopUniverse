// Notifications from the CMS: to Discord through a webhook, and by email
// where that is configured.
//
// Deliberately a webhook (not a bot token): the simplest and safest link.
// The full bot with approval buttons lives in discord-bot/ and talks to the
// same API as the web app. See docs/discord-integration.md for the research.
import { load } from './store.js';
import { stuurMail, beheerdersAdressen } from './email.js';

const KLEUREN = {
  info: 0x5865f2,      // Discord blurple
  approved: 0x57f287,  // green
  rejected: 0xed4245,  // red
  checkpoint: 0xfee75c, // yellow
  deadline: 0xeb459e   // pink
};

/**
 * One notification, delivered over every channel that is switched on.
 *
 * `ontvangers` are email addresses; leave it out and the mail goes to every
 * admin and manager, which is who the management-level notices are for. The
 * pipeline passes the freelancer's own address where the message is meant for
 * one person.
 *
 * Neither channel may ever block the core flow, so both failures are
 * swallowed: a video does not stay stuck because a mail server is down.
 */
export async function notify(type, titel, regels = [], ontvangers = null) {
  const uitkomsten = await Promise.allSettled([
    naarDiscord(type, titel, regels),
    stuurMail({
      naar: ontvangers ?? beheerdersAdressen(),
      onderwerp: titel,
      // Discord bold markers are noise in a plain-text email.
      tekst: regels.join('\n').replace(/\*\*/g, '')
    })
  ]);
  return uitkomsten.some(u => u.status === 'fulfilled' && u.value);
}

async function naarDiscord(type, titel, regels) {
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
    return false;
  }
}
