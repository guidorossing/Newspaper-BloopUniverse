// What each freelancer earned, and what still has to be paid.
//
// The CMS already knows who delivered which step and when it was approved;
// the channel knows what that step is worth. Put those together and the
// monthly payout run is a report instead of a spreadsheet.
//
// An approved step is what counts as earned — not a submitted one. A step
// that is still awaiting approval, or was rejected, is not owed yet.
import { load, save, id, logActivity } from './store.js';
import { productieVan, STAPPEN } from '../public/calc.js';

const BETAALDE_STAPPEN = new Set(STAPPEN.map(s => s.key)); // 'idee' is unpaid

/** 'YYYY-MM' for a date, or null if there is no usable date. */
function maandVan(iso) {
  return typeof iso === 'string' && iso.length >= 7 ? iso.slice(0, 7) : null;
}

/** The months that have any earnings, newest first — for the month picker. */
export function beschikbareMaanden() {
  const db = load();
  const maanden = new Set();
  for (const v of db.videos) {
    for (const s of v.stappen || []) {
      if (s.status === 'approved' && BETAALDE_STAPPEN.has(s.key)) {
        const m = maandVan(s.goedgekeurdOp);
        if (m) maanden.add(m);
      }
    }
  }
  return [...maanden].sort().reverse();
}

/**
 * Everything approved in one month, grouped per person.
 * Steps without an assignee are collected separately: that work was done by
 * someone, so it should not quietly disappear from the total.
 */
export function overzicht(maand) {
  const db = load();
  const perPersoon = new Map();
  const zonderNaam = [];
  let totaal = 0;

  for (const v of db.videos) {
    const kanaal = db.channels.find(c => c.id === v.channelId);
    const tarieven = productieVan(kanaal || {}).kostenPerStap;
    for (const s of v.stappen || []) {
      if (s.status !== 'approved' || !BETAALDE_STAPPEN.has(s.key)) continue;
      if (maandVan(s.goedgekeurdOp) !== maand) continue;

      const regel = {
        videoId: v.id,
        video: v.werktitel,
        kanaal: kanaal?.naam || 'unknown channel',
        stap: s.naam,
        stapKey: s.key,
        datum: s.goedgekeurdOp.slice(0, 10),
        // A rejected round costs the same fee — the freelancer still did the
        // work once. Revisions are visible in the report, not in the invoice.
        bedrag: Number(tarieven[s.key]) || 0
      };
      totaal += regel.bedrag;

      if (!s.assigneeId) { zonderNaam.push(regel); continue; }
      if (!perPersoon.has(s.assigneeId)) {
        const u = db.users.find(x => x.id === s.assigneeId);
        perPersoon.set(s.assigneeId, {
          userId: s.assigneeId,
          naam: u?.naam || 'deleted user',
          functie: u?.functie || 'other',
          email: u?.email || '',
          regels: [],
          totaal: 0
        });
      }
      const p = perPersoon.get(s.assigneeId);
      p.regels.push(regel);
      p.totaal += regel.bedrag;
    }
  }

  const betaald = new Set(db.payouts.filter(b => b.maand === maand).map(b => b.userId));
  const personen = [...perPersoon.values()]
    .map(p => ({ ...p, betaald: betaald.has(p.userId) }))
    .sort((a, b) => b.totaal - a.totaal);

  return {
    maand,
    personen,
    zonderToewijzing: { regels: zonderNaam, totaal: zonderNaam.reduce((a, r) => a + r.bedrag, 0) },
    totaal,
    nogTeBetalen: personen.filter(p => !p.betaald).reduce((a, p) => a + p.totaal, 0)
  };
}

/** Tick one person off for one month, or untick them again. */
export function markeerBetaald(maand, userId, bedrag, user) {
  const db = load();
  const bestaand = db.payouts.find(b => b.maand === maand && b.userId === userId);
  const naam = db.users.find(u => u.id === userId)?.naam || userId;
  if (bestaand) {
    db.payouts = db.payouts.filter(b => b !== bestaand);
    save();
    logActivity(user.naam, `undid the payout mark for ${naam} (${maand})`);
    return { betaald: false };
  }
  db.payouts.push({
    id: id(), maand, userId, bedrag: Number(bedrag) || 0,
    betaaldOp: new Date().toISOString(), door: user.naam
  });
  save();
  logActivity(user.naam, `marked ${naam} as paid for ${maand}`);
  return { betaald: true };
}
