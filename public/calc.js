// The CMS calculation core: capacity and production cost per channel.
//
// This file is used from two sides and therefore has to stay pure — input in,
// result out, no DOM and no file system:
//   - the browser recalculates live while you drag a slider
//   - the server uses it for the totals on the dashboard
// One source of truth, so the screen and the dashboard can never drift apart.

export const WEKEN_PER_MAAND = 52 / 12; // 4.33

// The five paid production steps. 'idee' is deliberately absent: that step
// costs thinking, not an invoice.
export const STAPPEN = [
  { key: 'script', label: 'Script', functie: 'scriptwriter' },
  { key: 'voice', label: 'Voice / avatar', functie: 'voice-artist' },
  { key: 'video', label: 'Video edit', functie: 'video-editor' },
  { key: 'thumbnail', label: 'Thumbnail', functie: 'thumbnail-artist' },
  { key: 'upload', label: 'Upload / SEO', functie: 'uploader' }
];

// Starting values for a new channel: market-rate freelance fees for roughly
// ten minutes of faceless content. Meant to be replaced with your own rates —
// they are here so a new channel never starts at zero and the calculation
// always shows something meaningful.
export const STANDAARD = {
  kostenPerStap: { script: 35, voice: 10, video: 90, thumbnail: 20, upload: 10 },
  urenPerStap: { script: 3, voice: 1, video: 5, thumbnail: 1, upload: 0.5 },
  vasteKostenPerMaand: 0,
  rpm: 4,
  verwachteViewsPerVideo: 10000,
  ideeGoedkeuringsPct: 50,
  urenPerFreelancerPerWeek: 20
};

function getal(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Fills in a channel's production settings with the defaults. */
export function productieVan(kanaal = {}) {
  const p = kanaal.productie || {};
  return {
    kostenPerStap: { ...STANDAARD.kostenPerStap, ...(p.kostenPerStap || {}) },
    urenPerStap: { ...STANDAARD.urenPerStap, ...(p.urenPerStap || {}) },
    vasteKostenPerMaand: getal(p.vasteKostenPerMaand, STANDAARD.vasteKostenPerMaand),
    rpm: getal(p.rpm, STANDAARD.rpm),
    verwachteViewsPerVideo: getal(p.verwachteViewsPerVideo, STANDAARD.verwachteViewsPerVideo),
    ideeGoedkeuringsPct: getal(p.ideeGoedkeuringsPct, STANDAARD.ideeGoedkeuringsPct),
    urenPerFreelancerPerWeek: getal(p.urenPerFreelancerPerWeek, STANDAARD.urenPerFreelancerPerWeek)
  };
}

/**
 * What it takes to sustain the chosen upload frequency.
 * Everything hangs off one number: videos per week.
 */
export function capaciteit(kanaal = {}) {
  const p = productieVan(kanaal);
  const perWeek = getal(kanaal.kpis?.uploadFrequentiePerWeek, 0);
  const perMaand = perWeek * WEKEN_PER_MAAND;
  const levertijd = getal(kanaal.kpis?.levertijdDagen, 0);

  // Not every pitched idea makes it into the pipeline. At a 50% approval rate
  // you need two ideas for every video you want to make.
  const ratio = Math.max(p.ideeGoedkeuringsPct, 1) / 100;
  const ideeenPerMaand = perMaand / ratio;

  // How many videos are in progress at once: a fourteen-day lead time at three
  // uploads a week means six videos sitting in the pipeline at any moment.
  const onderhandenWerk = levertijd > 0 ? Math.ceil((levertijd / 7) * perWeek) : 0;

  const urenPerWeek = {};
  const freelancersNodig = {};
  let urenTotaal = 0;
  for (const s of STAPPEN) {
    const u = perWeek * getal(p.urenPerStap[s.key], 0);
    urenPerWeek[s.key] = u;
    urenTotaal += u;
    freelancersNodig[s.key] = p.urenPerFreelancerPerWeek > 0
      ? Math.ceil(u / p.urenPerFreelancerPerWeek)
      : 0;
  }

  return {
    perWeek,
    perMaand,
    perJaar: perWeek * 52,
    ideeenPerMaand,
    ideeenPerWeek: ideeenPerMaand / WEKEN_PER_MAAND,
    onderhandenWerk,
    urenPerWeek,
    urenTotaalPerWeek: urenTotaal,
    freelancersNodig,
    freelancersTotaal: Object.values(freelancersNodig).reduce((a, b) => a + b, 0)
  };
}

/**
 * What it costs, and what it has to earn to break even.
 * Amounts in euros; RPM is euros per 1,000 views.
 */
export function kosten(kanaal = {}) {
  const p = productieVan(kanaal);
  const perWeek = getal(kanaal.kpis?.uploadFrequentiePerWeek, 0);
  const perMaand = perWeek * WEKEN_PER_MAAND;

  const perStap = {};
  let perVideo = 0;
  for (const s of STAPPEN) {
    const bedrag = getal(p.kostenPerStap[s.key], 0);
    perStap[s.key] = bedrag;
    perVideo += bedrag;
  }

  const variabelPerMaand = perVideo * perMaand;
  const totaalPerMaand = variabelPerMaand + p.vasteKostenPerMaand;

  // Spread the fixed costs across that month's videos, so break-even and
  // margin per video reflect the full cost price.
  const vasteKostenPerVideo = perMaand > 0 ? p.vasteKostenPerMaand / perMaand : 0;
  const kostprijsPerVideo = perVideo + vasteKostenPerVideo;

  const omzetPerVideo = (p.verwachteViewsPerVideo / 1000) * p.rpm;
  const breakEvenViews = p.rpm > 0 ? (kostprijsPerVideo / p.rpm) * 1000 : null;

  const margePerVideo = omzetPerVideo - kostprijsPerVideo;
  const omzetPerMaand = omzetPerVideo * perMaand;

  return {
    perStap,
    perVideo,
    kostprijsPerVideo,
    vasteKostenPerMaand: p.vasteKostenPerMaand,
    variabelPerMaand,
    perMaand: totaalPerMaand,
    perJaar: totaalPerMaand * 12,
    rpm: p.rpm,
    verwachteViewsPerVideo: p.verwachteViewsPerVideo,
    omzetPerVideo,
    omzetPerMaand,
    breakEvenViews,
    margePerVideo,
    margePerMaand: omzetPerMaand - totaalPerMaand,
    margePct: omzetPerVideo > 0 ? (margePerVideo / omzetPerVideo) * 100 : null
  };
}

/** Capacity and cost in one go — what the sliders show. */
export function doorrekenen(kanaal = {}) {
  return { capaciteit: capaciteit(kanaal), kosten: kosten(kanaal) };
}

/** The sum across all channels, for the dashboard. */
export function bedrijfsTotalen(kanalen = [], merken = []) {
  const t = {
    kanalen: kanalen.length,
    videosPerMaand: 0,
    kostenPerMaand: 0,
    omzetPerMaand: 0,
    urenPerWeek: 0,
    ideeenPerMaand: 0,
    perKanaal: []
  };
  for (const k of kanalen) {
    const c = capaciteit(k);
    const g = kosten(k);
    t.videosPerMaand += c.perMaand;
    t.kostenPerMaand += g.perMaand;
    t.omzetPerMaand += g.omzetPerMaand;
    t.urenPerWeek += c.urenTotaalPerWeek;
    t.ideeenPerMaand += c.ideeenPerMaand;
    t.perKanaal.push({
      id: k.id,
      naam: k.naam,
      videosPerMaand: c.perMaand,
      kostenPerMaand: g.perMaand,
      kostprijsPerVideo: g.kostprijsPerVideo,
      breakEvenViews: g.breakEvenViews,
      margePerMaand: g.margePerMaand,
      urenPerWeek: c.urenTotaalPerWeek
    });
  }
  t.margePerMaand = t.omzetPerMaand - t.kostenPerMaand;
  t.perMerk = perMerk(t.perKanaal, kanalen, merken);
  return t;
}

/**
 * The same totals rolled up per brand. Channels without a brand end up under
 * "Unassigned", so the brand rows always add up to the company total.
 */
function perMerk(perKanaal, kanalen, merken) {
  const merkVan = new Map(kanalen.map(k => [k.id, k.brandId || null]));
  const naamVan = new Map(merken.map(m => [m.id, m.naam]));
  const groepen = new Map();
  for (const k of perKanaal) {
    const mid = merkVan.get(k.id) || null;
    if (!groepen.has(mid)) {
      groepen.set(mid, {
        brandId: mid,
        naam: mid ? (naamVan.get(mid) || 'Unknown brand') : 'Unassigned',
        kanalen: 0, videosPerMaand: 0, kostenPerMaand: 0, margePerMaand: 0, urenPerWeek: 0
      });
    }
    const g = groepen.get(mid);
    g.kanalen++;
    g.videosPerMaand += k.videosPerMaand;
    g.kostenPerMaand += k.kostenPerMaand;
    g.margePerMaand += k.margePerMaand;
    g.urenPerWeek += k.urenPerWeek;
  }
  // Brands with channels first, biggest spend on top; "Unassigned" last.
  return [...groepen.values()].sort((a, b) =>
    (a.brandId === null) - (b.brandId === null) || b.kostenPerMaand - a.kostenPerMaand);
}
