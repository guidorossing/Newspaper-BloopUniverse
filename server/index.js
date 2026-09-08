// Rossing T&M CMS — main server.
// Zero-dependency: runs on plain Node.js (>= 18). Start it with `npm start`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { load, save, id, logActivity } from './store.js';
import * as auth from './auth.js';
import * as vault from './vault.js';
import * as pipeline from './pipeline.js';
import * as kalender from './kalender.js';
import * as ideeen from './ideeen.js';
import * as youtube from './youtube.js';
import { notify } from './discord.js';
import * as email from './email.js';
import * as calc from '../public/calc.js';
import * as payouts from './payouts.js';
import * as rapport from './rapport.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 1e6) { reject(new Error('Request body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function getSid(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)sid=([a-f0-9]+)/);
  return m ? m[1] : null;
}

// --- KPI rule: the upload frequency may NEVER be missing --------------------
function valideerKanaal(body) {
  const k = body.kpis || {};
  if (!k.uploadFrequentiePerWeek || Number(k.uploadFrequentiePerWeek) <= 0) {
    throw new Error('Upload frequency is required: enter how many videos per week this channel publishes.');
  }
  return {
    naam: String(body.naam || '').trim(),
    onderwerp: String(body.onderwerp || ''),
    titelFormat: String(body.titelFormat || ''),
    thumbnailFormat: String(body.thumbnailFormat || ''),
    concurrenten: Array.isArray(body.concurrenten) ? body.concurrenten : [],
    kpis: {
      uploadFrequentiePerWeek: Number(k.uploadFrequentiePerWeek),
      avdMinuten: k.avdMinuten != null ? Number(k.avdMinuten) : null,
      ctrPct: k.ctrPct != null ? Number(k.ctrPct) : null,
      levertijdDagen: k.levertijdDagen != null ? Number(k.levertijdDagen) : null,
      omzetgroeiPctPerMaand: k.omzetgroeiPctPerMaand != null ? Number(k.omzetgroeiPctPerMaand) : null
    },
    uploadDagen: String(body.uploadDagen || ''),
    notities: String(body.notities || ''),
    brandId: body.brandId || null,
    productie: valideerProductie(body.productie)
  };
}

// Rates, hours and assumptions the channel is calculated with. All optional:
// where a value is missing, calc.js falls back to its default.
function valideerProductie(p = {}) {
  const nietNegatief = (v, standaard) => {
    // A missing value falls back to the default, and so does nonsense or a
    // negative amount. That way a half-filled form can never derail the
    // calculation.
    if (v == null || v === '') return standaard;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : standaard;
  };
  const perStap = (bron, standaarden) => {
    const uit = {};
    for (const s of calc.STAPPEN) uit[s.key] = nietNegatief(bron?.[s.key], standaarden[s.key]);
    return uit;
  };
  const S = calc.STANDAARD;
  return {
    kostenPerStap: perStap(p.kostenPerStap, S.kostenPerStap),
    urenPerStap: perStap(p.urenPerStap, S.urenPerStap),
    vasteKostenPerMaand: nietNegatief(p.vasteKostenPerMaand, S.vasteKostenPerMaand),
    rpm: nietNegatief(p.rpm, S.rpm),
    verwachteViewsPerVideo: nietNegatief(p.verwachteViewsPerVideo, S.verwachteViewsPerVideo),
    // An approval rate of 0 would divide by zero when working out the idea
    // stock needed; 1% is the practical minimum.
    ideeGoedkeuringsPct: Math.min(100, Math.max(1, nietNegatief(p.ideeGoedkeuringsPct, S.ideeGoedkeuringsPct))),
    urenPerFreelancerPerWeek: nietNegatief(p.urenPerFreelancerPerWeek, S.urenPerFreelancerPerWeek)
  };
}

// --- API router --------------------------------------------------------------
// The Discord bot authenticates with a fixed token (Settings -> bot token).
// With an X-Discord-User header the API acts on behalf of the linked CMS user;
// without that header the bot acts as a "manager" (for overviews and the
// approval buttons, which the bot itself already limits to CMS Admins).
function botUser(req, db) {
  const token = req.headers['x-bot-token'];
  if (!token || !db.settings.botToken) return null;
  const a = Buffer.from(String(token));
  const b = Buffer.from(db.settings.botToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const discordId = req.headers['x-discord-user'];
  if (discordId) {
    const gekoppeld = db.users.find(u => u.discordUserId === discordId);
    if (gekoppeld) return gekoppeld;
  }
  return { id: 'discord-bot', naam: 'Discord bot', rol: 'manager', functie: 'other' };
}

async function api(req, res, url) {
  const db = load();
  const sid = getSid(req);
  const user = auth.userForSession(sid) || botUser(req, db);
  const route = `${req.method} ${url.pathname}`;

  // -- public --
  if (route === 'POST /api/login') {
    const { email, password } = await readBody(req);
    const result = auth.login(email, password);
    if (!result) return send(res, 401, { error: 'Incorrect email or password' });
    logActivity(result.user.naam, 'signed in');
    return send(res, 200, { user: auth.publicUser(result.user) }, {
      'Set-Cookie': `sid=${result.sid}; HttpOnly; Path=/; SameSite=Strict`
    });
  }

  // YouTube OAuth callback: Google sends the browser here. The SameSite=Strict
  // session cookie does not survive that redirect, so this route is public by
  // design. The code is only usable together with our client secret.
  if (route === 'GET /api/youtube/callback') {
    const redirectUri = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/youtube/callback`;
    try {
      const naam = await youtube.verwerkCallback(url.searchParams.get('code'), url.searchParams.get('state'), redirectUri);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<h2>✅ YouTube channel "${naam}" linked</h2><p>You can close this tab and go back to the CMS.</p>`);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<h2>❌ Linking failed</h2><p>${e.message}</p>`);
    }
  }

  if (!user) return send(res, 401, { error: 'Not signed in' });

  // -- Discord account linking (the bot redeems a link code) --
  if (route === 'POST /api/discord/koppel') {
    if (user.id !== 'discord-bot' && !auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Only the bot or a manager' });
    const { code, discordUserId, discordNaam } = await readBody(req);
    const kc = db.koppelcodes.find(k => k.code === code);
    if (!kc) return send(res, 404, { error: 'Unknown or already used link code' });
    const doel = db.users.find(u => u.id === kc.userId);
    if (!doel) return send(res, 404, { error: 'That user no longer exists' });
    doel.discordUserId = String(discordUserId);
    db.koppelcodes = db.koppelcodes.filter(k => k.code !== code);
    save();
    logActivity('Discord bot', `linked Discord account ${discordNaam || discordUserId} to ${doel.naam}`);
    return send(res, 200, { naam: doel.naam, functie: doel.functie });
  }

  if (route === 'POST /api/logout') {
    auth.logout(sid);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
  }

  if (route === 'GET /api/me') return send(res, 200, { user: auth.publicUser(user) });

  if (route === 'POST /api/me/password') {
    const { nieuw } = await readBody(req);
    if (!nieuw || String(nieuw).length < 8) return send(res, 400, { error: 'At least 8 characters' });
    user.passwordHash = auth.hashPassword(nieuw);
    user.moetWachtwoordWijzigen = false;
    save();
    return send(res, 200, { ok: true });
  }

  // -- dashboard --
  if (route === 'GET /api/dashboard') {
    const openCheckpoints = [];
    for (const v of db.videos) {
      for (const s of v.stappen) {
        if (s.status === 'awaiting_approval') {
          openCheckpoints.push({
            videoId: v.id, werktitel: v.werktitel, stap: s.naam, stapKey: s.key,
            kanaal: db.channels.find(c => c.id === v.channelId)?.naam || '?',
            opleverLink: s.opleverLink
          });
        }
      }
    }
    return send(res, 200, {
      kanalen: db.channels.length,
      videosInProductie: db.videos.filter(v => !v.afgerond).length,
      videosAfgerond: db.videos.filter(v => v.afgerond).length,
      openCheckpoints: auth.magMinstens(user, 'manager') ? openCheckpoints : [],
      deadlines: pipeline.deadlineOverzicht(),
      openTodos: db.todos.filter(t => !t.klaar).length,
      ideeenOpVoorraad: db.ideeen.filter(i => i.status === 'new' || i.status === 'approved').length,
      // Channels with less than two weeks of idea stock: the pipeline is drying up.
      ideeenAlarm: ideeen.voorraad().filter(v => v.status === 'critical'),
      // Capacity and cost across all channels. Contains rates, so admins and
      // managers only.
      totalen: auth.magMinstens(user, 'manager') ? calc.bedrijfsTotalen(db.channels, db.brands) : null,
      activity: auth.magMinstens(user, 'manager') ? db.activity.slice(0, 20) : []
    });
  }

  // -- channels --
  if (route === 'GET /api/channels') {
    const kanalen = db.channels.map(c => {
      // The refresh token (encrypted or not) never leaves the server.
      const { youtube: yt, ...zonderYt } = c;
      const veiligYt = yt ? { youtubeChannelId: yt.youtubeChannelId, youtubeNaam: yt.youtubeNaam, gekoppeldOp: yt.gekoppeldOp } : undefined;
      const basis = { ...zonderYt, ...(veiligYt ? { youtube: veiligYt } : {}) };
      if (auth.magMinstens(user, 'manager')) return basis;
      // Freelancers see no revenue KPIs, no channel revenue and no rates.
      const { kpis, youtubeStats, productie, ...rest } = basis;
      const { omzetgroeiPctPerMaand, ...kpiRest } = kpis || {};
      const veiligeStats = youtubeStats ? { ...youtubeStats, omzetUsd: undefined } : undefined;
      return { ...rest, kpis: kpiRest, ...(veiligeStats ? { youtubeStats: veiligeStats } : {}) };
    });
    return send(res, 200, { channels: kanalen });
  }
  if (route === 'POST /api/channels') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const data = valideerKanaal(await readBody(req));
    if (!data.naam) return send(res, 400, { error: 'Channel name is required' });
    const channel = { id: id(), ...data };
    db.channels.push(channel);
    save();
    logActivity(user.naam, `created channel "${channel.naam}"`);
    return send(res, 200, { channel });
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/api/channels/')) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const cid = url.pathname.split('/')[3];
    const channel = db.channels.find(c => c.id === cid);
    if (!channel) return send(res, 404, { error: 'Channel not found' });
    Object.assign(channel, valideerKanaal(await readBody(req)), { id: channel.id });
    save();
    logActivity(user.naam, `edited channel "${channel.naam}"`);
    return send(res, 200, { channel });
  }

  // -- pipeline / videos --
  if (route === 'GET /api/videos') {
    return send(res, 200, { videos: db.videos, stappen: pipeline.STAPPEN });
  }
  if (route === 'POST /api/videos') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const body = await readBody(req);
    if (!body.channelId || !db.channels.find(c => c.id === body.channelId)) {
      return send(res, 400, { error: 'Pick a valid channel' });
    }
    if (!body.werktitel) return send(res, 400, { error: 'Working title is required' });
    const video = pipeline.nieuweVideo({ ...body, geplandePublicatie: body.geplandePublicatie || null });
    logActivity(user.naam, `started video "${video.werktitel}" in the pipeline`);
    await notify('info', `🎬 New video in the pipeline: ${video.werktitel}`,
      [`**Channel:** ${db.channels.find(c => c.id === video.channelId)?.naam}`]);
    return send(res, 200, { video });
  }
  if (req.method === 'POST' && /^\/api\/videos\/[^/]+\/stappen\/[^/]+\/(inleveren|goedkeuren|afkeuren|toewijzen)$/.test(url.pathname)) {
    const [, , , videoId, , stapKey, actie] = url.pathname.split('/');
    const body = await readBody(req);
    try {
      let video;
      if (actie === 'inleveren') {
        video = await pipeline.leverIn(videoId, stapKey, user, body.opleverLink);
      } else if (actie === 'goedkeuren' || actie === 'afkeuren') {
        if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Only an admin or manager can approve' });
        video = actie === 'goedkeuren'
          ? await pipeline.keurGoed(videoId, stapKey, user)
          : await pipeline.keurAf(videoId, stapKey, user, body.feedback);
      } else if (actie === 'toewijzen') {
        if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
        video = db.videos.find(v => v.id === videoId);
        if (!video) return send(res, 404, { error: 'Video not found' });
        const stap = video.stappen.find(s => s.key === stapKey);
        stap.assigneeId = body.assigneeId || null;
        stap.deadline = body.deadline || stap.deadline;
        save();
      }
      return send(res, 200, { video });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  // -- edit a video (scheduling, YouTube id) --
  if (req.method === 'PUT' && /^\/api\/videos\/[^/]+$/.test(url.pathname)) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const video = db.videos.find(v => v.id === url.pathname.split('/')[3]);
    if (!video) return send(res, 404, { error: 'Video not found' });
    const body = await readBody(req);
    if (body.werktitel !== undefined) video.werktitel = String(body.werktitel);
    if (body.idee !== undefined) video.idee = String(body.idee);
    if (body.geplandePublicatie !== undefined) video.geplandePublicatie = body.geplandePublicatie || null;
    if (body.youtubeVideoId !== undefined) video.youtubeVideoId = String(body.youtubeVideoId).trim();
    save();
    return send(res, 200, { video });
  }

  // -- tick off the QC checklist --
  if (req.method === 'POST' && /^\/api\/videos\/[^/]+\/qc\/\d+\/toggle$/.test(url.pathname)) {
    const [, , , videoId, , index] = url.pathname.split('/');
    const video = db.videos.find(v => v.id === videoId);
    if (!video) return send(res, 404, { error: 'Video not found' });
    const item = (video.qc || [])[Number(index)];
    if (!item) return send(res, 404, { error: 'QC item not found' });
    item.done = !item.done;
    save();
    return send(res, 200, { qc: video.qc });
  }

  // -- manual KPI entry (fallback, and the CTR the API does not expose) --
  if (req.method === 'POST' && /^\/api\/videos\/[^/]+\/stats$/.test(url.pathname)) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const video = db.videos.find(v => v.id === url.pathname.split('/')[3]);
    if (!video) return send(res, 404, { error: 'Video not found' });
    const body = await readBody(req);
    video.stats = {
      ...(video.stats || {}),
      ...(body.views !== undefined && body.views !== '' ? { views: Number(body.views) } : {}),
      ...(body.ctrPct !== undefined && body.ctrPct !== '' ? { ctrPct: Number(body.ctrPct) } : {}),
      ...(body.avdMinuten !== undefined && body.avdMinuten !== '' ? { avdMinuten: Number(body.avdMinuten) } : {}),
      handmatigBijgewerkt: new Date().toISOString()
    };
    save();
    return send(res, 200, { stats: video.stats });
  }

  // -- idea bank --
  if (route === 'GET /api/ideeen') {
    return send(res, 200, {
      ideeen: ideeen.gesorteerd(url.searchParams.get('status')),
      voorraad: ideeen.voorraad(),
      wegingen: ideeen.WEGINGEN
    });
  }
  if (route === 'POST /api/ideeen') {
    // Anyone can pitch — freelancers and the Discord bot included.
    const body = await readBody(req);
    if (!body.titel) return send(res, 400, { error: 'Title is required' });
    const idee = ideeen.nieuwIdee({ ...body, aangedragenDoor: user.naam });
    logActivity(user.naam, `pitched idea "${idee.titel}"`);
    await ideeen.meldNieuwIdee(idee);
    return send(res, 200, { idee });
  }
  if (req.method === 'POST' && /^\/api\/ideeen\/[^/]+\/score$/.test(url.pathname)) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Only an admin or manager can score' });
    try {
      return send(res, 200, { idee: ideeen.scoorIdee(url.pathname.split('/')[3], await readBody(req), user) });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }
  if (req.method === 'POST' && /^\/api\/ideeen\/[^/]+\/status$/.test(url.pathname)) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    try {
      const { status } = await readBody(req);
      return send(res, 200, { idee: ideeen.zetStatus(url.pathname.split('/')[3], status, user) });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }
  // Promote: the idea becomes a video in the pipeline and leaves the backlog.
  if (req.method === 'POST' && /^\/api\/ideeen\/[^/]+\/promoveer$/.test(url.pathname)) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const idee = db.ideeen.find(i => i.id === url.pathname.split('/')[3]);
    if (!idee) return send(res, 404, { error: 'Idea not found' });
    if (idee.status === 'promoted') return send(res, 400, { error: 'This idea is already in the pipeline' });
    const body = await readBody(req);
    const channelId = body.channelId || idee.channelId;
    if (!channelId || !db.channels.find(c => c.id === channelId)) {
      return send(res, 400, { error: 'Pick a valid channel for this idea' });
    }
    const video = pipeline.nieuweVideo({
      channelId,
      werktitel: idee.titel,
      idee: [idee.omschrijving, idee.bron ? `Source: ${idee.bron}` : ''].filter(Boolean).join('\n'),
      geplandePublicatie: body.geplandePublicatie || null
    });
    idee.status = 'promoted';
    idee.videoId = video.id;
    save();
    logActivity(user.naam, `promoted idea "${idee.titel}" to the pipeline`);
    await notify('info', `🎬 Idea promoted to production: ${video.werktitel}`,
      [`**Channel:** ${db.channels.find(c => c.id === channelId)?.naam}`,
       idee.score != null ? `**Idea score:** ${idee.score}/5` : ''].filter(Boolean));
    return send(res, 200, { idee, video });
  }
  if (req.method === 'DELETE' && /^\/api\/ideeen\/[^/]+$/.test(url.pathname)) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const idx = db.ideeen.findIndex(i => i.id === url.pathname.split('/')[3]);
    if (idx === -1) return send(res, 404, { error: 'Not found' });
    logActivity(user.naam, `deleted idea "${db.ideeen[idx].titel}"`);
    db.ideeen.splice(idx, 1);
    save();
    return send(res, 200, { ok: true });
  }

  // -- brands (channels grouped per brand or client) --
  if (route === 'GET /api/brands') {
    return send(res, 200, { brands: db.brands });
  }
  if (route === 'POST /api/brands') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const body = await readBody(req);
    if (!String(body.naam || '').trim()) return send(res, 400, { error: 'Brand name is required' });
    const brand = { id: id(), naam: String(body.naam).trim(), notities: String(body.notities || '') };
    db.brands.push(brand);
    save();
    logActivity(user.naam, `created brand "${brand.naam}"`);
    return send(res, 200, { brand });
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/api/brands/')) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const brand = db.brands.find(b => b.id === url.pathname.split('/')[3]);
    if (!brand) return send(res, 404, { error: 'Brand not found' });
    const body = await readBody(req);
    if (body.naam !== undefined) brand.naam = String(body.naam).trim() || brand.naam;
    if (body.notities !== undefined) brand.notities = String(body.notities);
    save();
    return send(res, 200, { brand });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/brands/')) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const bid = url.pathname.split('/')[3];
    const idx = db.brands.findIndex(b => b.id === bid);
    if (idx === -1) return send(res, 404, { error: 'Not found' });
    // Deleting a brand must never silently orphan its channels, so the
    // channels have to be moved out first.
    const inGebruik = db.channels.filter(c => c.brandId === bid).map(c => c.naam);
    if (inGebruik.length) {
      return send(res, 400, { error: `Still used by: ${inGebruik.join(', ')}. Move those channels to another brand first.` });
    }
    logActivity(user.naam, `deleted brand "${db.brands[idx].naam}"`);
    db.brands.splice(idx, 1);
    save();
    return send(res, 200, { ok: true });
  }

  // -- payouts (what each freelancer earned) --
  if (route === 'GET /api/payouts') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const maanden = payouts.beschikbareMaanden();
    const maand = url.searchParams.get('maand') || maanden[0] || new Date().toISOString().slice(0, 7);
    return send(res, 200, { ...payouts.overzicht(maand), maanden });
  }
  if (route === 'POST /api/payouts/markeer') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    const { maand, userId, bedrag } = await readBody(req);
    if (!maand || !userId) return send(res, 400, { error: 'Month and user are required' });
    return send(res, 200, payouts.markeerBetaald(maand, userId, bedrag, user));
  }

  // -- throughput and revision report --
  if (route === 'GET /api/rapport') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    return send(res, 200, rapport.rapport(Number(url.searchParams.get('dagen')) || 90));
  }

  // -- publishing calendar --
  if (route === 'GET /api/kalender') {
    return send(res, 200, {
      weken: kalender.weekOverzicht(Number(url.searchParams.get('weken')) || 6),
      inGevaar: kalender.schemaInGevaar()
    });
  }

  // -- template library --
  if (route === 'GET /api/templates') {
    return send(res, 200, { templates: db.templates });
  }
  if (route === 'POST /api/templates') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const body = await readBody(req);
    if (!body.naam || !body.inhoud) return send(res, 400, { error: 'Name and content are required' });
    const template = {
      id: id(), channelId: body.channelId || null,
      type: ['titel', 'thumbnail', 'hook', 'beschrijving', 'script'].includes(body.type) ? body.type : 'titel',
      naam: String(body.naam), inhoud: String(body.inhoud),
      prestatie: String(body.prestatie || '')
    };
    db.templates.push(template);
    save();
    logActivity(user.naam, `added template "${template.naam}" (${template.type})`);
    return send(res, 200, { template });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/templates/')) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    const idx = db.templates.findIndex(t => t.id === url.pathname.split('/')[3]);
    if (idx === -1) return send(res, 404, { error: 'Not found' });
    db.templates.splice(idx, 1);
    save();
    return send(res, 200, { ok: true });
  }

  // -- YouTube integration --
  if (route === 'GET /api/youtube/koppel') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    const redirectUri = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/youtube/callback`;
    try {
      return send(res, 200, { url: youtube.authUrl(url.searchParams.get('channelId'), redirectUri) });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }
  if (route === 'POST /api/youtube/sync') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    try {
      const resultaten = await youtube.syncAlles();
      logActivity(user.naam, 'ran a YouTube sync');
      return send(res, 200, { resultaten });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  // -- link code for a Discord account --
  if (req.method === 'POST' && /^\/api\/users\/[^/]+\/koppelcode$/.test(url.pathname)) {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    const doel = db.users.find(u => u.id === url.pathname.split('/')[3]);
    if (!doel) return send(res, 404, { error: 'User not found' });
    db.koppelcodes = db.koppelcodes.filter(k => k.userId !== doel.id);
    const code = crypto.randomBytes(4).toString('hex');
    db.koppelcodes.push({ code, userId: doel.id, aangemaakt: new Date().toISOString() });
    save();
    return send(res, 200, { code, uitleg: `Ask ${doel.naam} to type "/link code:${code}" in Discord` });
  }

  // -- to-do's --
  if (route === 'GET /api/todos') return send(res, 200, { todos: db.todos });
  if (route === 'POST /api/todos') {
    const body = await readBody(req);
    if (!body.tekst) return send(res, 400, { error: 'Text is required' });
    const todo = {
      id: id(), tekst: String(body.tekst), channelId: body.channelId || null,
      assigneeId: body.assigneeId || null, deadline: body.deadline || null,
      klaar: false, aangemaaktDoor: user.naam
    };
    db.todos.push(todo);
    save();
    return send(res, 200, { todo });
  }
  if (req.method === 'POST' && /^\/api\/todos\/[^/]+\/toggle$/.test(url.pathname)) {
    const tid = url.pathname.split('/')[3];
    const todo = db.todos.find(t => t.id === tid);
    if (!todo) return send(res, 404, { error: 'Not found' });
    todo.klaar = !todo.klaar;
    save();
    return send(res, 200, { todo });
  }

  // -- users (access control) --
  if (route === 'GET /api/users') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Admins and managers only' });
    return send(res, 200, { users: db.users.map(auth.publicUser), rollen: auth.ROLLEN, functies: auth.FUNCTIES });
  }
  if (route === 'GET /api/team') {
    // Everyone may see names and roles so they can recognise their tasks.
    return send(res, 200, { team: db.users.map(u => ({ id: u.id, naam: u.naam, functie: u.functie, rol: u.rol })) });
  }
  if (route === 'POST /api/users') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    const body = await readBody(req);
    if (!body.naam || !body.email || !body.password) return send(res, 400, { error: 'Name, email and password are required' });
    if (db.users.find(u => u.email.toLowerCase() === body.email.toLowerCase())) return send(res, 400, { error: 'That email address is already in use' });
    const nieuw = {
      id: id(), naam: body.naam, email: body.email,
      rol: auth.ROLLEN.includes(body.rol) ? body.rol : 'freelancer',
      functie: auth.FUNCTIES.includes(body.functie) ? body.functie : 'other',
      passwordHash: auth.hashPassword(body.password),
      moetWachtwoordWijzigen: true
    };
    db.users.push(nieuw);
    save();
    logActivity(user.naam, `added user "${nieuw.naam}" (${nieuw.rol}, ${nieuw.functie})`);
    return send(res, 200, { user: auth.publicUser(nieuw) });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/users/')) {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    const uid = url.pathname.split('/')[3];
    if (uid === user.id) return send(res, 400, { error: 'You cannot delete your own account' });
    const idx = db.users.findIndex(u => u.id === uid);
    if (idx === -1) return send(res, 404, { error: 'Not found' });
    const [weg] = db.users.splice(idx, 1);
    save();
    logActivity(user.naam, `deleted user "${weg.naam}"`);
    return send(res, 200, { ok: true });
  }

  // -- vault (Channel Admin) --
  if (route === 'GET /api/vault') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'No access to the vault' });
    // Secrets are NOT included here; revealing one is a separate admin action.
    return send(res, 200, {
      entries: db.vault.map(({ secretEncrypted, ...rest }) => rest),
      magOnthullen: auth.magMinstens(user, 'admin')
    });
  }
  if (route === 'POST /api/vault') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    const body = await readBody(req);
    if (!body.label) return send(res, 400, { error: 'Label is required' });
    const entry = {
      id: id(), channelId: body.channelId || null, label: String(body.label),
      gebruikersnaam: String(body.gebruikersnaam || ''),
      url: String(body.url || ''), notities: String(body.notities || ''),
      secretEncrypted: body.secret ? vault.encryptSecret(body.secret) : ''
    };
    db.vault.push(entry);
    save();
    logActivity(user.naam, `added vault entry "${entry.label}"`);
    const { secretEncrypted, ...rest } = entry;
    return send(res, 200, { entry: rest });
  }
  if (req.method === 'POST' && /^\/api\/vault\/[^/]+\/onthul$/.test(url.pathname)) {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Only an admin can reveal secrets' });
    const vid = url.pathname.split('/')[3];
    const entry = db.vault.find(e => e.id === vid);
    if (!entry) return send(res, 404, { error: 'Not found' });
    logActivity(user.naam, `revealed the secret of vault entry "${entry.label}"`);
    return send(res, 200, { secret: entry.secretEncrypted ? vault.decryptSecret(entry.secretEncrypted) : '' });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/vault/')) {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    const vid = url.pathname.split('/')[3];
    const idx = db.vault.findIndex(e => e.id === vid);
    if (idx === -1) return send(res, 404, { error: 'Not found' });
    logActivity(user.naam, `deleted vault entry "${db.vault[idx].label}"`);
    db.vault.splice(idx, 1);
    save();
    return send(res, 200, { ok: true });
  }

  // -- settings (Discord webhook) --
  if (route === 'GET /api/settings') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    return send(res, 200, {
      settings: {
        ...db.settings,
        youtube: { clientId: db.settings.youtube.clientId, clientSecretIngesteld: Boolean(db.settings.youtube.clientSecret) },
        // The mailbox password never leaves the server, only whether it is set.
        smtp: { ...(db.settings.smtp || {}), passEncrypted: undefined, wachtwoordIngesteld: Boolean(db.settings.smtp?.passEncrypted) }
      }
    });
  }
  if (route === 'PUT /api/settings') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    const body = await readBody(req);
    db.settings.discordWebhookUrl = String(body.discordWebhookUrl || '');
    db.settings.discordEnabled = Boolean(body.discordEnabled);
    if (Array.isArray(body.qcItems)) {
      db.settings.qcItems = body.qcItems.map(String).filter(Boolean);
    }
    if (body.youtube) {
      db.settings.youtube.clientId = String(body.youtube.clientId || '');
      if (body.youtube.clientSecret) db.settings.youtube.clientSecret = String(body.youtube.clientSecret);
    }
    if (body.smtp) {
      const oud = db.settings.smtp || {};
      db.settings.smtp = {
        enabled: Boolean(body.smtp.enabled),
        host: String(body.smtp.host || ''),
        port: Number(body.smtp.port) || 587,
        secure: Boolean(body.smtp.secure),
        user: String(body.smtp.user || ''),
        from: String(body.smtp.from || ''),
        // An empty password field means "leave it as it was", so saving the
        // other settings does not wipe the stored password.
        passEncrypted: body.smtp.pass ? vault.encryptSecret(body.smtp.pass) : oud.passEncrypted || ''
      };
    }
    save();
    logActivity(user.naam, 'changed the settings');
    return send(res, 200, { settings: db.settings });
  }
  if (route === 'POST /api/settings/bot-token') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    db.settings.botToken = crypto.randomBytes(24).toString('hex');
    save();
    logActivity(user.naam, 'generated a new bot token');
    return send(res, 200, { botToken: db.settings.botToken });
  }

  // -- open tasks for the signed-in (or Discord-linked) user --
  if (route === 'GET /api/mijn-taken') {
    const taken = [];
    for (const v of db.videos) {
      if (v.afgerond) continue;
      for (const s of v.stappen) {
        if (s.assigneeId === user.id && ['in_progress', 'rejected', 'awaiting_approval'].includes(s.status)) {
          taken.push({
            videoId: v.id, werktitel: v.werktitel,
            kanaal: db.channels.find(c => c.id === v.channelId)?.naam || '?',
            stap: s.naam, stapKey: s.key, status: s.status, deadline: s.deadline,
            feedback: s.feedback.at(-1)?.tekst || null
          });
        }
      }
    }
    return send(res, 200, { taken, naam: user.naam });
  }
  if (route === 'POST /api/settings/discord-test') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    const ok = await notify('info', '🔔 Test message', ['The Discord integration of the Rossing T&M CMS is working.']);
    return send(res, ok ? 200 : 400, ok ? { ok: true } : { error: 'Webhook not configured or unreachable' });
  }

  if (route === 'POST /api/settings/mail-test') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Admins only' });
    try {
      const ok = await email.stuurMail({
        naar: [user.email],
        onderwerp: 'Rossing T&M CMS — test message',
        tekst: 'If you are reading this, the CMS can send email through your own mailbox.'
      });
      return send(res, ok ? 200 : 400, ok ? { ok: true } : { error: 'Email is switched off or not configured' });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  return send(res, 404, { error: 'Unknown route' });
}

// --- static files ------------------------------------------------------------
function serveStatic(req, res, url) {
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(p));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

load();
vault.initVaultKey();
const tijdelijkWachtwoord = auth.seedAdmin();
kalender.planKalenderAlarm();
youtube.planAutoSync();

server.listen(PORT, () => {
  console.log(`\nRossing T&M CMS running on http://localhost:${PORT}`);
  if (tijdelijkWachtwoord) {
    console.log('\n=== FIRST START ===');
    console.log('Admin account created:');
    console.log('  email:    info@rossingtm.com');
    console.log(`  password: ${tijdelijkWachtwoord}`);
    console.log('Change this password immediately after the first sign-in.\n');
  }
});
