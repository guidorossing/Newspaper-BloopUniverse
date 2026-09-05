// Ideeënbank: de backlog vóór de pipeline.
//
// Iedereen (ook freelancers, ook via Discord) mag ideeën pitchen. De admin
// scoort ze op vier assen; het systeem rekent er één prioriteitsscore van.
// De beste ideeën promoveer je met één klik naar de productiepipeline —
// zo staat de pipeline nooit droog en valt de uploadfrequentie niet om.
//
// Scores lopen van 1 (slecht) tot 5 (uitstekend). Productiekosten is
// omgekeerd: 5 = heel goedkoop te maken.
import { load, save, id, logActivity } from './store.js';
import { notify } from './discord.js';

export const STATUSSEN = ['nieuw', 'goedgekeurd', 'afgewezen', 'gepromoveerd'];

// Wegingen: hoe zwaar telt elke as mee in de totaalscore.
// Bewezen vraag weegt het zwaarst — een idee dat bij concurrenten al
// aantoonbaar werkt, is veruit de beste voorspeller voor succes.
export const WEGINGEN = {
  outlierPotentie: 0.35,  // doet dit concept het aantoonbaar goed bij concurrenten?
  zoekvolume: 0.25,       // zoeken mensen hier actief naar?
  productiegemak: 0.20,   // 5 = snel/goedkoop te maken, 1 = duur en traag
  kanaalfit: 0.20         // past het bij de niche en toon van het kanaal?
};

// Gewogen gemiddelde van de vier assen, afgerond op 1 decimaal (0-5).
// Niet-ingevulde assen tellen niet mee, zodat een half gescoord idee
// niet kunstmatig laag uitkomt.
export function berekenScore(scores = {}) {
  let som = 0;
  let gewicht = 0;
  for (const [as, weging] of Object.entries(WEGINGEN)) {
    const waarde = Number(scores[as]);
    if (Number.isFinite(waarde) && waarde > 0) {
      som += waarde * weging;
      gewicht += weging;
    }
  }
  if (!gewicht) return null;
  return Number((som / gewicht).toFixed(1));
}

export function nieuwIdee({ titel, omschrijving, channelId, bron, aangedragenDoor }) {
  const db = load();
  const idee = {
    id: id(),
    titel: String(titel).trim(),
    omschrijving: String(omschrijving || ''),
    channelId: channelId || null,
    bron: String(bron || ''), // link naar de outlier/concurrent die dit inspireerde
    aangedragenDoor: aangedragenDoor || 'onbekend',
    aangemaakt: new Date().toISOString(),
    status: 'nieuw',
    scores: {},
    score: null,
    notitie: '',
    videoId: null // gevuld zodra het idee naar de pipeline promoveert
  };
  db.ideeen.push(idee);
  save();
  return idee;
}

export async function meldNieuwIdee(idee) {
  const db = load();
  const kanaal = db.channels.find(c => c.id === idee.channelId)?.naam;
  await notify('info', `💡 Nieuw idee: ${idee.titel}`,
    [`**Door:** ${idee.aangedragenDoor}`,
     kanaal ? `**Kanaal:** ${kanaal}` : '',
     idee.omschrijving ? `${idee.omschrijving}` : '',
     idee.bron ? `**Bron:** ${idee.bron}` : ''].filter(Boolean));
}

export function scoorIdee(ideeId, scores, user) {
  const db = load();
  const idee = db.ideeen.find(i => i.id === ideeId);
  if (!idee) throw new Error('Idee niet gevonden');
  for (const as of Object.keys(WEGINGEN)) {
    if (scores[as] !== undefined && scores[as] !== '') {
      const waarde = Number(scores[as]);
      if (!Number.isFinite(waarde) || waarde < 1 || waarde > 5) {
        throw new Error(`Score voor "${as}" moet tussen 1 en 5 liggen`);
      }
      idee.scores[as] = waarde;
    }
  }
  if (scores.notitie !== undefined) idee.notitie = String(scores.notitie);
  idee.score = berekenScore(idee.scores);
  idee.gescoordDoor = user.naam;
  save();
  logActivity(user.naam, `scoorde idee "${idee.titel}" op ${idee.score ?? '?'}`);
  return idee;
}

export function zetStatus(ideeId, status, user) {
  if (!STATUSSEN.includes(status)) throw new Error('Onbekende status');
  const db = load();
  const idee = db.ideeen.find(i => i.id === ideeId);
  if (!idee) throw new Error('Idee niet gevonden');
  if (idee.status === 'gepromoveerd') throw new Error('Dit idee staat al in de pipeline');
  idee.status = status;
  save();
  logActivity(user.naam, `zette idee "${idee.titel}" op ${status}`);
  return idee;
}

// Ideeën gesorteerd: hoogste score eerst, ongescoorde onderaan.
export function gesorteerd(filterStatus = null) {
  const db = load();
  return db.ideeen
    .filter(i => !filterStatus || i.status === filterStatus)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// Hoeveel bruikbare ideeën liggen er nog op de plank per kanaal?
// Vergeleken met de uploadfrequentie zie je direct hoeveel weken
// voorraad je hebt — de vroegste waarschuwing dat de pipeline opdroogt.
export function voorraad() {
  const db = load();
  return db.channels.map(c => {
    const beschikbaar = db.ideeen.filter(i =>
      i.channelId === c.id && (i.status === 'nieuw' || i.status === 'goedgekeurd')).length;
    const perWeek = c.kpis?.uploadFrequentiePerWeek || 0;
    const wekenVoorraad = perWeek > 0 ? Number((beschikbaar / perWeek).toFixed(1)) : null;
    return {
      channelId: c.id, kanaal: c.naam, beschikbaar, perWeek, wekenVoorraad,
      // Minder dan 2 weken voorraad = tijd om te brainstormen.
      status: wekenVoorraad === null ? 'onbekend' : wekenVoorraad >= 4 ? 'ruim' : wekenVoorraad >= 2 ? 'krap' : 'kritiek'
    };
  });
}
