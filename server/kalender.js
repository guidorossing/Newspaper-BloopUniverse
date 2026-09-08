// Publishing calendar: watches per channel whether the upload frequency is
// being met. A week is "on_track" when the number of planned plus published
// videos is at least the channel's upload frequency.
//
// Every day at 08:00 server time a Discord alert goes out for the weeks at
// risk (this week and next week).
import { load } from './store.js';
import { notify } from './discord.js';

// Monday (00:00) of the week that `datum` falls in.
function maandagVan(datum) {
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  const dag = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - dag);
  return d;
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

// Overview per week per channel, `aantalWeken` ahead from this week.
export function weekOverzicht(aantalWeken = 6) {
  const db = load();
  const start = maandagVan(new Date());
  const weken = [];
  for (let w = 0; w < aantalWeken; w++) {
    const maandag = new Date(start.getTime() + w * 7 * 24 * 3600 * 1000);
    const zondag = new Date(maandag.getTime() + 6 * 24 * 3600 * 1000);
    const kanalen = db.channels.map(c => {
      const benodigd = c.kpis?.uploadFrequentiePerWeek || 0;
      const inWeek = db.videos.filter(v =>
        v.channelId === c.id && v.geplandePublicatie &&
        v.geplandePublicatie >= iso(maandag) && v.geplandePublicatie <= iso(zondag));
      const gepubliceerd = inWeek.filter(v => v.afgerond);
      const gepland = inWeek.filter(v => !v.afgerond);
      const totaal = inWeek.length;
      return {
        channelId: c.id,
        kanaal: c.naam,
        benodigd,
        gepubliceerd: gepubliceerd.length,
        gepland: gepland.length,
        videos: inWeek.map(v => ({
          id: v.id, werktitel: v.werktitel, datum: v.geplandePublicatie, afgerond: v.afgerond
        })),
        status: totaal >= benodigd ? 'on_track' : totaal > 0 ? 'understaffed' : 'empty'
      };
    });
    weken.push({ maandag: iso(maandag), zondag: iso(zondag), kanalen });
  }
  return weken;
}

// Weeks (this one and the next) where a channel will miss its frequency.
export function schemaInGevaar() {
  const weken = weekOverzicht(2);
  const problemen = [];
  for (const week of weken) {
    for (const k of week.kanalen) {
      if (k.benodigd > 0 && k.status !== 'on_track') {
        problemen.push({
          week: `${week.maandag} to ${week.zondag}`,
          kanaal: k.kanaal,
          benodigd: k.benodigd,
          ingepland: k.gepubliceerd + k.gepland
        });
      }
    }
  }
  return problemen;
}

export async function stuurKalenderAlarm() {
  const problemen = schemaInGevaar();
  if (!problemen.length) return false;
  await notify('deadline', '📅 Upload schedule at risk',
    problemen.map(p =>
      `**${p.kanaal}** — week ${p.week}: ${p.ingepland}/${p.benodigd} videos scheduled. Schedule more videos or start them in the pipeline.`));
  return true;
}

// Daily alert at 08:00 server time.
export function planKalenderAlarm() {
  const nu = new Date();
  const volgende = new Date(nu);
  volgende.setHours(8, 0, 0, 0);
  if (volgende <= nu) volgende.setDate(volgende.getDate() + 1);
  setTimeout(async () => {
    try { await stuurKalenderAlarm(); }
    catch { /* an alert must never crash the server */ }
    planKalenderAlarm();
  }, volgende - nu);
}
