// Rekenkern van het CMS: capaciteit en productiekosten per kanaal.
//
// Dit bestand wordt door twee kanten gebruikt en moet daarom puur blijven —
// alleen invoer in, uitkomst uit, geen DOM en geen bestandssysteem:
//   - de browser rekent er live mee terwijl je aan een schuifbalk sleept
//   - de server rekent er de totalen voor het dashboard mee
// Eén bron van waarheid, zodat het scherm en het dashboard nooit uit elkaar
// kunnen lopen.

export const WEKEN_PER_MAAND = 52 / 12; // 4,33

// De vijf betaalde productiestappen. 'idee' staat er bewust niet bij: die
// stap kost denkwerk, geen factuur.
export const STAPPEN = [
  { key: 'script', label: 'Script', functie: 'scriptwriter' },
  { key: 'voice', label: 'Voice / avatar', functie: 'voice-artiest' },
  { key: 'video', label: 'Video-edit', functie: 'video-editor' },
  { key: 'thumbnail', label: 'Thumbnail', functie: 'thumbnail-artiest' },
  { key: 'upload', label: 'Upload / SEO', functie: 'uploader' }
];

// Startwaarden voor een nieuw kanaal: marktconforme freelancetarieven voor
// faceless-content van ~10 minuten. Bedoeld om meteen aan te passen naar je
// eigen tarieven — ze staan hier zodat een nieuw kanaal nooit op nul begint
// en de berekening dus altijd iets zinnigs laat zien.
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

/** Vult de productie-instellingen van een kanaal aan met de standaardwaarden. */
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
 * Wat er nodig is om de gekozen uploadfrequentie vol te houden.
 * Alles hangt aan één getal: video's per week.
 */
export function capaciteit(kanaal = {}) {
  const p = productieVan(kanaal);
  const perWeek = getal(kanaal.kpis?.uploadFrequentiePerWeek, 0);
  const perMaand = perWeek * WEKEN_PER_MAAND;
  const levertijd = getal(kanaal.kpis?.levertijdDagen, 0);

  // Niet elk gepitcht idee haalt de pipeline. Bij een goedkeuringspercentage
  // van 50% heb je twee ideeën nodig per video die je wilt maken.
  const ratio = Math.max(p.ideeGoedkeuringsPct, 1) / 100;
  const ideeenPerMaand = perMaand / ratio;

  // Hoeveel video's er tegelijk onderhanden zijn: een video die 14 dagen
  // doorlooptijd heeft bij 3 uploads per week, betekent 6 video's in de
  // pipeline op elk moment.
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
 * Wat het kost, en wat het moet opleveren om uit te komen.
 * Bedragen in euro's; RPM is euro per 1.000 weergaven.
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

  // Vaste kosten omslaan over de video's van die maand, zodat break-even en
  // marge per video de volledige kostprijs meenemen.
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

/** Capaciteit en kosten in één keer — wat de schuifbalken laten zien. */
export function doorrekenen(kanaal = {}) {
  return { capaciteit: capaciteit(kanaal), kosten: kosten(kanaal) };
}

/** Optelsom over alle kanalen, voor het dashboard. */
export function bedrijfsTotalen(kanalen = []) {
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
  return t;
}
