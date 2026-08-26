// Productiepipeline: Idee -> Script -> Voice/Avatar -> Video-edit ->
// Thumbnail -> Upload.
//
// Elke stap is een checkpoint: een freelancer levert in ("ter_goedkeuring"),
// de admin/manager keurt goed of af. Pas na goedkeuring schuift de video
// door en krijgt de volgende freelancer zijn taak (en een Discord-ping).
import { load, save, id, logActivity } from './store.js';
import { notify } from './discord.js';

export const STAPPEN = [
  { key: 'idee', naam: 'Idee', functie: 'overig' },
  { key: 'script', naam: 'Script', functie: 'scriptwriter' },
  { key: 'voice', naam: 'Voice / Avatar', functie: 'voice-artiest' },
  { key: 'video', naam: 'Video-edit', functie: 'video-editor' },
  { key: 'thumbnail', naam: 'Thumbnail', functie: 'thumbnail-artiest' },
  { key: 'upload', naam: 'Upload', functie: 'uploader' }
];

export const STAP_STATUS = ['wachtend', 'bezig', 'ter_goedkeuring', 'goedgekeurd', 'afgekeurd'];

export function nieuweVideo({ channelId, werktitel, idee, deadlines = {}, assignees = {} }) {
  const db = load();
  const video = {
    id: id(),
    channelId,
    werktitel,
    idee: idee || '',
    aangemaakt: new Date().toISOString(),
    afgerond: false,
    stappen: STAPPEN.map((s, i) => ({
      key: s.key,
      naam: s.naam,
      status: i === 0 ? 'bezig' : 'wachtend',
      assigneeId: assignees[s.key] || null,
      deadline: deadlines[s.key] || null,
      opleverLink: '',
      feedback: [],
      ingeleverdOp: null,
      goedgekeurdOp: null
    }))
  };
  db.videos.push(video);
  save();
  return video;
}

export function huidigeStap(video) {
  return video.stappen.find(s => s.status !== 'goedgekeurd') || null;
}

function stapVan(video, stapKey) {
  const stap = video.stappen.find(s => s.key === stapKey);
  if (!stap) throw new Error(`Onbekende stap: ${stapKey}`);
  return stap;
}

function naamVan(db, userId) {
  return db.users.find(u => u.id === userId)?.naam || 'niemand';
}

function kanaalNaam(db, video) {
  return db.channels.find(c => c.id === video.channelId)?.naam || 'onbekend kanaal';
}

// Freelancer levert werk in -> checkpoint "ter_goedkeuring".
export async function leverIn(videoId, stapKey, user, opleverLink) {
  const db = load();
  const video = db.videos.find(v => v.id === videoId);
  if (!video) throw new Error('Video niet gevonden');
  const stap = stapVan(video, stapKey);
  if (stap.status !== 'bezig' && stap.status !== 'afgekeurd') {
    throw new Error(`Stap "${stap.naam}" staat niet open voor inleveren (status: ${stap.status})`);
  }
  if (user.rol === 'freelancer' && stap.assigneeId && stap.assigneeId !== user.id) {
    throw new Error('Deze stap is aan een andere freelancer toegewezen');
  }
  stap.status = 'ter_goedkeuring';
  stap.opleverLink = opleverLink || stap.opleverLink;
  stap.ingeleverdOp = new Date().toISOString();
  save();
  logActivity(user.naam, `leverde "${stap.naam}" in voor video "${video.werktitel}"`);
  await notify('checkpoint', `⏸️ Checkpoint: ${stap.naam} ingeleverd`,
    [`**Video:** ${video.werktitel} (${kanaalNaam(db, video)})`,
     `**Door:** ${user.naam}`,
     stap.opleverLink ? `**Oplevering:** ${stap.opleverLink}` : '',
     'Wacht op goedkeuring van de admin.'].filter(Boolean));
  return video;
}

// Admin/manager keurt goed -> volgende stap wordt actief + notificatie.
export async function keurGoed(videoId, stapKey, user) {
  const db = load();
  const video = db.videos.find(v => v.id === videoId);
  if (!video) throw new Error('Video niet gevonden');
  const stap = stapVan(video, stapKey);
  if (stap.status !== 'ter_goedkeuring') throw new Error('Deze stap is niet ter goedkeuring aangeboden');
  stap.status = 'goedgekeurd';
  stap.goedgekeurdOp = new Date().toISOString();

  const idx = video.stappen.findIndex(s => s.key === stapKey);
  const volgende = video.stappen[idx + 1] || null;
  if (volgende) {
    volgende.status = 'bezig';
  } else {
    video.afgerond = true;
  }
  save();
  logActivity(user.naam, `keurde "${stap.naam}" goed voor video "${video.werktitel}"`);

  if (volgende) {
    await notify('goedgekeurd', `✅ ${stap.naam} goedgekeurd — door naar ${volgende.naam}`,
      [`**Video:** ${video.werktitel} (${kanaalNaam(db, video)})`,
       `**Volgende stap:** ${volgende.naam} — ${naamVan(db, volgende.assigneeId)}`,
       volgende.deadline ? `**Deadline:** ${volgende.deadline}` : ''].filter(Boolean));
  } else {
    await notify('goedgekeurd', `🎉 Video afgerond: ${video.werktitel}`,
      [`**Kanaal:** ${kanaalNaam(db, video)}`, 'Alle stappen zijn goedgekeurd en de video is geüpload.']);
  }
  return video;
}

// Admin/manager keurt af -> stap terug naar de freelancer, met feedback.
export async function keurAf(videoId, stapKey, user, feedbackTekst) {
  const db = load();
  const video = db.videos.find(v => v.id === videoId);
  if (!video) throw new Error('Video niet gevonden');
  const stap = stapVan(video, stapKey);
  if (stap.status !== 'ter_goedkeuring') throw new Error('Deze stap is niet ter goedkeuring aangeboden');
  stap.status = 'afgekeurd';
  stap.feedback.push({ door: user.naam, tekst: feedbackTekst || '(geen toelichting)', ts: new Date().toISOString() });
  save();
  logActivity(user.naam, `keurde "${stap.naam}" af voor video "${video.werktitel}"`);
  await notify('afgekeurd', `❌ ${stap.naam} afgekeurd — revisie nodig`,
    [`**Video:** ${video.werktitel} (${kanaalNaam(db, video)})`,
     `**Voor:** ${naamVan(db, stap.assigneeId)}`,
     `**Feedback:** ${feedbackTekst || '(geen toelichting)'}`]);
  return video;
}

// Deadlinebewaking: stappen die (bijna) over hun deadline zijn.
export function deadlineOverzicht() {
  const db = load();
  const nu = new Date();
  const morgen = new Date(nu.getTime() + 24 * 3600 * 1000);
  const items = [];
  for (const v of db.videos) {
    if (v.afgerond) continue;
    for (const s of v.stappen) {
      if (!s.deadline || s.status === 'goedgekeurd' || s.status === 'wachtend') continue;
      const d = new Date(s.deadline + 'T23:59:59');
      const status = d < nu ? 'te_laat' : d <= morgen ? 'bijna' : null;
      if (status) {
        items.push({
          videoId: v.id, werktitel: v.werktitel, stap: s.naam, deadline: s.deadline,
          assignee: naamVan(db, s.assigneeId), urgentie: status
        });
      }
    }
  }
  return items;
}
