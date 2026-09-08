// Idea bank: the backlog that sits in front of the pipeline.
//
// Anyone (freelancers included, also through Discord) can pitch an idea. The
// admin scores it on four axes and the system turns those into a single
// priority score. The best ideas are promoted to the production pipeline with
// one click — so the pipeline never runs dry and the upload frequency holds.
//
// Scores run from 1 (poor) to 5 (excellent). Ease of production is inverted:
// 5 means very cheap and quick to make.
import { load, save, id, logActivity } from './store.js';
import { notify } from './discord.js';

export const STATUSSEN = ['new', 'approved', 'rejected', 'promoted'];

// Weights: how heavily each axis counts towards the total score.
// Proven demand weighs heaviest — an idea that demonstrably works for
// competitors is by far the best predictor of success.
export const WEGINGEN = {
  outlierPotentie: 0.35,  // does this concept demonstrably perform for competitors?
  zoekvolume: 0.25,       // are people actively searching for this?
  productiegemak: 0.20,   // 5 = quick and cheap to make, 1 = expensive and slow
  kanaalfit: 0.20         // does it fit the channel's niche and tone?
};

// Weighted average of the four axes, rounded to one decimal (0-5).
// Axes left blank are ignored, so a partly scored idea does not come out
// artificially low.
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
    bron: String(bron || ''), // link to the outlier or competitor that inspired this
    aangedragenDoor: aangedragenDoor || 'unknown',
    aangemaakt: new Date().toISOString(),
    status: 'new',
    scores: {},
    score: null,
    notitie: '',
    videoId: null // filled in as soon as the idea is promoted to the pipeline
  };
  db.ideeen.push(idee);
  save();
  return idee;
}

export async function meldNieuwIdee(idee) {
  const db = load();
  const kanaal = db.channels.find(c => c.id === idee.channelId)?.naam;
  await notify('info', `💡 New idea: ${idee.titel}`,
    [`**By:** ${idee.aangedragenDoor}`,
     kanaal ? `**Channel:** ${kanaal}` : '',
     idee.omschrijving ? `${idee.omschrijving}` : '',
     idee.bron ? `**Source:** ${idee.bron}` : ''].filter(Boolean));
}

export function scoorIdee(ideeId, scores, user) {
  const db = load();
  const idee = db.ideeen.find(i => i.id === ideeId);
  if (!idee) throw new Error('Idea not found');
  for (const as of Object.keys(WEGINGEN)) {
    if (scores[as] !== undefined && scores[as] !== '') {
      const waarde = Number(scores[as]);
      if (!Number.isFinite(waarde) || waarde < 1 || waarde > 5) {
        throw new Error(`Score for "${as}" must be between 1 and 5`);
      }
      idee.scores[as] = waarde;
    }
  }
  if (scores.notitie !== undefined) idee.notitie = String(scores.notitie);
  idee.score = berekenScore(idee.scores);
  idee.gescoordDoor = user.naam;
  save();
  logActivity(user.naam, `scored idea "${idee.titel}" at ${idee.score ?? '?'}`);
  return idee;
}

export function zetStatus(ideeId, status, user) {
  if (!STATUSSEN.includes(status)) throw new Error('Unknown status');
  const db = load();
  const idee = db.ideeen.find(i => i.id === ideeId);
  if (!idee) throw new Error('Idea not found');
  if (idee.status === 'promoted') throw new Error('This idea is already in the pipeline');
  idee.status = status;
  save();
  logActivity(user.naam, `set idea "${idee.titel}" to ${status}`);
  return idee;
}

// Ideas sorted: highest score first, unscored ones at the bottom.
export function gesorteerd(filterStatus = null) {
  const db = load();
  return db.ideeen
    .filter(i => !filterStatus || i.status === filterStatus)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// How many usable ideas are left on the shelf per channel? Compared against
// the upload frequency this shows straight away how many weeks of stock you
// have — the earliest warning that the pipeline is about to run dry.
export function voorraad() {
  const db = load();
  return db.channels.map(c => {
    const beschikbaar = db.ideeen.filter(i =>
      i.channelId === c.id && (i.status === 'new' || i.status === 'approved')).length;
    const perWeek = c.kpis?.uploadFrequentiePerWeek || 0;
    const wekenVoorraad = perWeek > 0 ? Number((beschikbaar / perWeek).toFixed(1)) : null;
    return {
      channelId: c.id, kanaal: c.naam, beschikbaar, perWeek, wekenVoorraad,
      // Less than two weeks of stock means it is time to brainstorm.
      status: wekenVoorraad === null ? 'unknown' : wekenVoorraad >= 4 ? 'healthy' : wekenVoorraad >= 2 ? 'tight' : 'critical'
    };
  });
}
