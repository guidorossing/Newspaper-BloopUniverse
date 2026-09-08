// Production pipeline: Idea -> Script -> Voice/Avatar -> Video edit ->
// Thumbnail -> Upload.
//
// Every step is a checkpoint: a freelancer submits their work
// ("awaiting_approval"), the admin or manager approves or rejects it. Only
// after approval does the video move on and the next freelancer get their
// task (and a Discord ping).
import { load, save, id, logActivity } from './store.js';
import { notify } from './discord.js';
import { adresVan, beheerdersAdressen } from './email.js';

export const STAPPEN = [
  { key: 'idee', naam: 'Idea', functie: 'other' },
  { key: 'script', naam: 'Script', functie: 'scriptwriter' },
  { key: 'voice', naam: 'Voice / Avatar', functie: 'voice-artist' },
  { key: 'video', naam: 'Video edit', functie: 'video-editor' },
  { key: 'thumbnail', naam: 'Thumbnail', functie: 'thumbnail-artist' },
  { key: 'upload', naam: 'Upload', functie: 'uploader' }
];

export const STAP_STATUS = ['waiting', 'in_progress', 'awaiting_approval', 'approved', 'rejected'];

export function nieuweVideo({ channelId, werktitel, idee, deadlines = {}, assignees = {}, geplandePublicatie = null }) {
  const db = load();
  const video = {
    id: id(),
    channelId,
    werktitel,
    idee: idee || '',
    aangemaakt: new Date().toISOString(),
    geplandePublicatie: geplandePublicatie || null,
    youtubeVideoId: '',
    stats: null, // { views, ctrPct, avdMinuten, impressies, laatstOpgehaald }
    qc: db.settings.qcItems.map(label => ({ label, done: false })),
    afgerond: false,
    stappen: STAPPEN.map((s, i) => ({
      key: s.key,
      naam: s.naam,
      status: i === 0 ? 'in_progress' : 'waiting',
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
  return video.stappen.find(s => s.status !== 'approved') || null;
}

function stapVan(video, stapKey) {
  const stap = video.stappen.find(s => s.key === stapKey);
  if (!stap) throw new Error(`Unknown step: ${stapKey}`);
  return stap;
}

function naamVan(db, userId) {
  return db.users.find(u => u.id === userId)?.naam || 'nobody';
}

// Name plus Discord mention (if the account is linked), so the right
// freelancer gets pinged directly in the notification channel.
function mentionVan(db, userId) {
  const u = db.users.find(x => x.id === userId);
  if (!u) return 'nobody';
  return u.discordUserId ? `${u.naam} <@${u.discordUserId}>` : u.naam;
}

function kanaalNaam(db, video) {
  return db.channels.find(c => c.id === video.channelId)?.naam || 'unknown channel';
}

// A freelancer submits their work -> checkpoint "awaiting_approval".
export async function leverIn(videoId, stapKey, user, opleverLink) {
  const db = load();
  const video = db.videos.find(v => v.id === videoId);
  if (!video) throw new Error('Video not found');
  const stap = stapVan(video, stapKey);
  if (stap.status !== 'in_progress' && stap.status !== 'rejected') {
    throw new Error(`Step "${stap.naam}" is not open for submission (status: ${stap.status})`);
  }
  if (user.rol === 'freelancer' && stap.assigneeId && stap.assigneeId !== user.id) {
    throw new Error('This step is assigned to another freelancer');
  }
  // QC gate: the upload step can only be submitted once the whole quality
  // checklist has been ticked off.
  if (stapKey === 'upload') {
    const open = (video.qc || []).filter(q => !q.done);
    if (open.length) {
      throw new Error(`QC checklist is not complete yet. Still open: ${open.map(q => q.label).join(' · ')}`);
    }
  }
  stap.status = 'awaiting_approval';
  stap.opleverLink = opleverLink || stap.opleverLink;
  stap.ingeleverdOp = new Date().toISOString();
  save();
  logActivity(user.naam, `submitted "${stap.naam}" for video "${video.werktitel}"`);
  await notify('checkpoint', `⏸️ Checkpoint: ${stap.naam} submitted`,
    [`**Video:** ${video.werktitel} (${kanaalNaam(db, video)})`,
     `**By:** ${user.naam}`,
     stap.opleverLink ? `**Delivery:** ${stap.opleverLink}` : '',
     'Waiting for the admin to approve.'].filter(Boolean));
  return video;
}

// Admin/manager approves -> the next step opens up and a notification goes out.
export async function keurGoed(videoId, stapKey, user) {
  const db = load();
  const video = db.videos.find(v => v.id === videoId);
  if (!video) throw new Error('Video not found');
  const stap = stapVan(video, stapKey);
  if (stap.status !== 'awaiting_approval') throw new Error('This step has not been submitted for approval');
  stap.status = 'approved';
  stap.goedgekeurdOp = new Date().toISOString();

  const idx = video.stappen.findIndex(s => s.key === stapKey);
  const volgende = video.stappen[idx + 1] || null;
  if (volgende) {
    volgende.status = 'in_progress';
  } else {
    video.afgerond = true;
  }
  save();
  logActivity(user.naam, `approved "${stap.naam}" for video "${video.werktitel}"`);

  if (volgende) {
    // The freelancer whose turn it now is gets the mail as well as the
    // managers — for them this is the message that their work has started.
    const naar = [...new Set([...beheerdersAdressen(), adresVan(volgende.assigneeId)].filter(Boolean))];
    await notify('approved', `✅ ${stap.naam} approved — on to ${volgende.naam}`,
      [`**Video:** ${video.werktitel} (${kanaalNaam(db, video)})`,
       `**Next step:** ${volgende.naam} — ${mentionVan(db, volgende.assigneeId)}`,
       volgende.deadline ? `**Deadline:** ${volgende.deadline}` : ''].filter(Boolean), naar);
  } else {
    await notify('approved', `🎉 Video finished: ${video.werktitel}`,
      [`**Channel:** ${kanaalNaam(db, video)}`, 'Every step has been approved and the video is uploaded.']);
  }
  return video;
}

// Admin/manager rejects -> the step goes back to the freelancer, with feedback.
export async function keurAf(videoId, stapKey, user, feedbackTekst) {
  const db = load();
  const video = db.videos.find(v => v.id === videoId);
  if (!video) throw new Error('Video not found');
  const stap = stapVan(video, stapKey);
  if (stap.status !== 'awaiting_approval') throw new Error('This step has not been submitted for approval');
  stap.status = 'rejected';
  stap.feedback.push({ door: user.naam, tekst: feedbackTekst || '(no explanation given)', ts: new Date().toISOString() });
  save();
  logActivity(user.naam, `rejected "${stap.naam}" for video "${video.werktitel}"`);
  await notify('rejected', `❌ ${stap.naam} rejected — revision needed`,
    [`**Video:** ${video.werktitel} (${kanaalNaam(db, video)})`,
     `**For:** ${mentionVan(db, stap.assigneeId)}`,
     `**Feedback:** ${feedbackTekst || '(no explanation given)'}`],
    [...new Set([...beheerdersAdressen(), adresVan(stap.assigneeId)].filter(Boolean))]);
  return video;
}

// Deadline watch: steps that are past their deadline or nearly there.
export function deadlineOverzicht() {
  const db = load();
  const nu = new Date();
  const morgen = new Date(nu.getTime() + 24 * 3600 * 1000);
  const items = [];
  for (const v of db.videos) {
    if (v.afgerond) continue;
    for (const s of v.stappen) {
      if (!s.deadline || s.status === 'approved' || s.status === 'waiting') continue;
      const d = new Date(s.deadline + 'T23:59:59');
      const status = d < nu ? 'overdue' : d <= morgen ? 'soon' : null;
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
