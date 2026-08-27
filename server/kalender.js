// Publicatiekalender: bewaakt per kanaal of de uploadfrequentie gehaald
// wordt. Een week is "op schema" als het aantal geplande + gepubliceerde
// video's minstens gelijk is aan de uploadfrequentie van het kanaal.
//
// Dagelijks om 08:00 (servertijd) gaat er een Discord-alarm af voor weken
// die in gevaar zijn (deze week en volgende week).
import { load } from './store.js';
import { notify } from './discord.js';

// Maandag (00:00) van de week waarin `datum` valt.
function maandagVan(datum) {
  const d = new Date(datum);
  d.setHours(0, 0, 0, 0);
  const dag = (d.getDay() + 6) % 7; // ma=0 ... zo=6
  d.setDate(d.getDate() - dag);
  return d;
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

// Overzicht per week per kanaal, `aantalWeken` vooruit vanaf deze week.
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
        status: totaal >= benodigd ? 'op_schema' : totaal > 0 ? 'onderbezet' : 'leeg'
      };
    });
    weken.push({ maandag: iso(maandag), zondag: iso(zondag), kanalen });
  }
  return weken;
}

// Weken (deze + volgende) waar een kanaal zijn frequentie niet gaat halen.
export function schemaInGevaar() {
  const weken = weekOverzicht(2);
  const problemen = [];
  for (const week of weken) {
    for (const k of week.kanalen) {
      if (k.benodigd > 0 && k.status !== 'op_schema') {
        problemen.push({
          week: `${week.maandag} t/m ${week.zondag}`,
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
  await notify('deadline', '📅 Uploadschema in gevaar',
    problemen.map(p =>
      `**${p.kanaal}** — week ${p.week}: ${p.ingepland}/${p.benodigd} video's ingepland. Plan video's in of start ze in de pipeline!`));
  return true;
}

// Dagelijks alarm om 08:00 servertijd.
export function planKalenderAlarm() {
  const nu = new Date();
  const volgende = new Date(nu);
  volgende.setHours(8, 0, 0, 0);
  if (volgende <= nu) volgende.setDate(volgende.getDate() + 1);
  setTimeout(async () => {
    try { await stuurKalenderAlarm(); }
    catch { /* alarm mag de server nooit laten crashen */ }
    planKalenderAlarm();
  }, volgende - nu);
}
