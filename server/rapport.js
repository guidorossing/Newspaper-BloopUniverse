// Throughput and revision report: where the production actually stalls.
//
// The pipeline records when a step was approved and every piece of feedback
// it collected. From that you can work out two things the gut feeling gets
// wrong surprisingly often: which step eats the most calendar time, and who
// needs the most revision rounds.
//
// A step starts the moment the previous step is approved (the first step
// starts when the video is created), and ends when it is approved itself.
// That is deliberately calendar time, not working time — a script that sits
// untouched for four days costs the schedule four days.
import { load } from './store.js';

const DAG_MS = 24 * 3600 * 1000;

function dagenTussen(vanIso, totIso) {
  if (!vanIso || !totIso) return null;
  const d = (new Date(totIso) - new Date(vanIso)) / DAG_MS;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

function gemiddelde(getallen) {
  const g = getallen.filter(n => n != null);
  return g.length ? Number((g.reduce((a, b) => a + b, 0) / g.length).toFixed(1)) : null;
}

/**
 * Walks every finished step and returns one row per step: how long it took,
 * how many revision rounds it needed, and whether it made its deadline.
 */
function afgerondeStappen(db, vanafIso) {
  const rijen = [];
  for (const v of db.videos) {
    const stappen = v.stappen || [];
    for (let i = 0; i < stappen.length; i++) {
      const s = stappen[i];
      if (s.status !== 'approved' || !s.goedgekeurdOp) continue;
      if (vanafIso && s.goedgekeurdOp < vanafIso) continue;
      const start = i === 0 ? v.aangemaakt : stappen[i - 1].goedgekeurdOp;
      rijen.push({
        videoId: v.id,
        video: v.werktitel,
        channelId: v.channelId,
        stapKey: s.key,
        stap: s.naam,
        assigneeId: s.assigneeId || null,
        doorlooptijd: dagenTussen(start, s.goedgekeurdOp),
        // Every rejection leaves one feedback entry, so the count of those is
        // the number of revision rounds this step needed.
        revisies: (s.feedback || []).length,
        // Only judged when a deadline was actually set.
        opTijd: s.deadline ? (s.goedgekeurdOp.slice(0, 10) <= s.deadline) : null
      });
    }
  }
  return rijen;
}

function samenvatten(rijen) {
  const opTijd = rijen.map(r => r.opTijd).filter(x => x !== null);
  return {
    afgerond: rijen.length,
    gemDoorlooptijd: gemiddelde(rijen.map(r => r.doorlooptijd)),
    revisies: rijen.reduce((a, r) => a + r.revisies, 0),
    revisiePct: rijen.length
      ? Number(((rijen.filter(r => r.revisies > 0).length / rijen.length) * 100).toFixed(0))
      : null,
    opTijdPct: opTijd.length
      ? Number(((opTijd.filter(Boolean).length / opTijd.length) * 100).toFixed(0))
      : null
  };
}

/** The full report: per step, per person and per channel, over the last N days. */
export function rapport(dagen = 90) {
  const db = load();
  const vanaf = dagen > 0 ? new Date(Date.now() - dagen * DAG_MS).toISOString() : null;
  const rijen = afgerondeStappen(db, vanaf);

  const groepeer = (sleutel, label) => {
    const map = new Map();
    for (const r of rijen) {
      const k = sleutel(r);
      if (k === undefined) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return [...map.entries()].map(([k, groep]) => ({ sleutel: k, naam: label(k), ...samenvatten(groep) }));
  };

  const perStap = groepeer(r => r.stapKey, k => k)
    .map(g => ({ ...g, naam: rijen.find(r => r.stapKey === g.sleutel)?.stap || g.sleutel }))
    .sort((a, b) => (b.gemDoorlooptijd ?? 0) - (a.gemDoorlooptijd ?? 0));

  const perPersoon = groepeer(r => r.assigneeId, k =>
    db.users.find(u => u.id === k)?.naam || (k ? 'deleted user' : 'unassigned'))
    .sort((a, b) => (b.afgerond ?? 0) - (a.afgerond ?? 0));

  const perKanaal = groepeer(r => r.channelId, k =>
    db.channels.find(c => c.id === k)?.naam || 'unknown channel')
    .sort((a, b) => (b.afgerond ?? 0) - (a.afgerond ?? 0));

  // The whole run: from creating a video to approving its last step.
  const doorlooptijden = db.videos
    .filter(v => v.afgerond && (!vanaf || (v.stappen.at(-1)?.goedgekeurdOp || '') >= vanaf))
    .map(v => dagenTussen(v.aangemaakt, v.stappen.at(-1)?.goedgekeurdOp));

  return {
    dagen,
    totaal: samenvatten(rijen),
    videoDoorlooptijd: gemiddelde(doorlooptijden),
    videosAfgerond: doorlooptijden.length,
    perStap,
    perPersoon,
    perKanaal,
    // The single step that costs the most calendar time — the bottleneck to
    // fix first if you want to raise the upload frequency. Only worth naming
    // once there is measurable time in it; with everything at zero days the
    // "slowest" step is just whichever sorted first.
    knelpunt: perStap[0]?.gemDoorlooptijd > 0 ? perStap[0] : null
  };
}
