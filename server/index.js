// Bloop Universe CMS — hoofdserver.
// Zero-dependency: draait op kale Node.js (>= 18). Start met `npm start`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, save, id, logActivity } from './store.js';
import * as auth from './auth.js';
import * as vault from './vault.js';
import * as pipeline from './pipeline.js';
import { notify } from './discord.js';

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
      if (raw.length > 1e6) { reject(new Error('Body te groot')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Ongeldige JSON')); }
    });
    req.on('error', reject);
  });
}

function getSid(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)sid=([a-f0-9]+)/);
  return m ? m[1] : null;
}

// --- KPI-verplichting: uploadfrequentie mag NOOIT ontbreken -----------------
function valideerKanaal(body) {
  const k = body.kpis || {};
  if (!k.uploadFrequentiePerWeek || Number(k.uploadFrequentiePerWeek) <= 0) {
    throw new Error('Uploadfrequentie is verplicht: vul in hoeveel video\'s per week dit kanaal uploadt.');
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
    notities: String(body.notities || '')
  };
}

// --- API-router --------------------------------------------------------------
async function api(req, res, url) {
  const db = load();
  const sid = getSid(req);
  const user = auth.userForSession(sid);
  const route = `${req.method} ${url.pathname}`;

  // -- publiek --
  if (route === 'POST /api/login') {
    const { email, password } = await readBody(req);
    const result = auth.login(email, password);
    if (!result) return send(res, 401, { error: 'Onjuiste inloggegevens' });
    logActivity(result.user.naam, 'logde in');
    return send(res, 200, { user: auth.publicUser(result.user) }, {
      'Set-Cookie': `sid=${result.sid}; HttpOnly; Path=/; SameSite=Strict`
    });
  }

  if (!user) return send(res, 401, { error: 'Niet ingelogd' });

  if (route === 'POST /api/logout') {
    auth.logout(sid);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' });
  }

  if (route === 'GET /api/me') return send(res, 200, { user: auth.publicUser(user) });

  if (route === 'POST /api/me/password') {
    const { nieuw } = await readBody(req);
    if (!nieuw || String(nieuw).length < 8) return send(res, 400, { error: 'Minimaal 8 tekens' });
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
        if (s.status === 'ter_goedkeuring') {
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
      activity: auth.magMinstens(user, 'manager') ? db.activity.slice(0, 20) : []
    });
  }

  // -- kanalen --
  if (route === 'GET /api/channels') {
    // Freelancers zien geen omzet-KPI's.
    const kanalen = db.channels.map(c => {
      if (auth.magMinstens(user, 'manager')) return c;
      const { kpis, ...rest } = c;
      const { omzetgroeiPctPerMaand, ...kpiRest } = kpis || {};
      return { ...rest, kpis: kpiRest };
    });
    return send(res, 200, { channels: kanalen });
  }
  if (route === 'POST /api/channels') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Alleen admin/manager' });
    const data = valideerKanaal(await readBody(req));
    if (!data.naam) return send(res, 400, { error: 'Kanaalnaam is verplicht' });
    const channel = { id: id(), ...data };
    db.channels.push(channel);
    save();
    logActivity(user.naam, `maakte kanaal "${channel.naam}" aan`);
    return send(res, 200, { channel });
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/api/channels/')) {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Alleen admin/manager' });
    const cid = url.pathname.split('/')[3];
    const channel = db.channels.find(c => c.id === cid);
    if (!channel) return send(res, 404, { error: 'Kanaal niet gevonden' });
    Object.assign(channel, valideerKanaal(await readBody(req)), { id: channel.id });
    save();
    logActivity(user.naam, `wijzigde kanaal "${channel.naam}"`);
    return send(res, 200, { channel });
  }

  // -- pipeline / videos --
  if (route === 'GET /api/videos') {
    return send(res, 200, { videos: db.videos, stappen: pipeline.STAPPEN });
  }
  if (route === 'POST /api/videos') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Alleen admin/manager' });
    const body = await readBody(req);
    if (!body.channelId || !db.channels.find(c => c.id === body.channelId)) {
      return send(res, 400, { error: 'Kies een geldig kanaal' });
    }
    if (!body.werktitel) return send(res, 400, { error: 'Werktitel is verplicht' });
    const video = pipeline.nieuweVideo(body);
    logActivity(user.naam, `startte video "${video.werktitel}" in de pipeline`);
    await notify('info', `🎬 Nieuwe video in de pipeline: ${video.werktitel}`,
      [`**Kanaal:** ${db.channels.find(c => c.id === video.channelId)?.naam}`]);
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
        if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Alleen admin/manager mag keuren' });
        video = actie === 'goedkeuren'
          ? await pipeline.keurGoed(videoId, stapKey, user)
          : await pipeline.keurAf(videoId, stapKey, user, body.feedback);
      } else if (actie === 'toewijzen') {
        if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Alleen admin/manager' });
        video = db.videos.find(v => v.id === videoId);
        if (!video) return send(res, 404, { error: 'Video niet gevonden' });
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

  // -- to-do's --
  if (route === 'GET /api/todos') return send(res, 200, { todos: db.todos });
  if (route === 'POST /api/todos') {
    const body = await readBody(req);
    if (!body.tekst) return send(res, 400, { error: 'Tekst is verplicht' });
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
    if (!todo) return send(res, 404, { error: 'Niet gevonden' });
    todo.klaar = !todo.klaar;
    save();
    return send(res, 200, { todo });
  }

  // -- gebruikers (toegangsbeheer) --
  if (route === 'GET /api/users') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Alleen admin/manager' });
    return send(res, 200, { users: db.users.map(auth.publicUser), rollen: auth.ROLLEN, functies: auth.FUNCTIES });
  }
  if (route === 'GET /api/team') {
    // Iedereen mag namen/functies zien om taken te kunnen herkennen.
    return send(res, 200, { team: db.users.map(u => ({ id: u.id, naam: u.naam, functie: u.functie, rol: u.rol })) });
  }
  if (route === 'POST /api/users') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Alleen admin' });
    const body = await readBody(req);
    if (!body.naam || !body.email || !body.password) return send(res, 400, { error: 'Naam, e-mail en wachtwoord zijn verplicht' });
    if (db.users.find(u => u.email.toLowerCase() === body.email.toLowerCase())) return send(res, 400, { error: 'E-mail bestaat al' });
    const nieuw = {
      id: id(), naam: body.naam, email: body.email,
      rol: auth.ROLLEN.includes(body.rol) ? body.rol : 'freelancer',
      functie: auth.FUNCTIES.includes(body.functie) ? body.functie : 'overig',
      passwordHash: auth.hashPassword(body.password),
      moetWachtwoordWijzigen: true
    };
    db.users.push(nieuw);
    save();
    logActivity(user.naam, `voegde gebruiker "${nieuw.naam}" toe (${nieuw.rol}, ${nieuw.functie})`);
    return send(res, 200, { user: auth.publicUser(nieuw) });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/users/')) {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Alleen admin' });
    const uid = url.pathname.split('/')[3];
    if (uid === user.id) return send(res, 400, { error: 'Je kunt jezelf niet verwijderen' });
    const idx = db.users.findIndex(u => u.id === uid);
    if (idx === -1) return send(res, 404, { error: 'Niet gevonden' });
    const [weg] = db.users.splice(idx, 1);
    save();
    logActivity(user.naam, `verwijderde gebruiker "${weg.naam}"`);
    return send(res, 200, { ok: true });
  }

  // -- vault (Channel Admin) --
  if (route === 'GET /api/vault') {
    if (!auth.magMinstens(user, 'manager')) return send(res, 403, { error: 'Geen toegang tot de vault' });
    // Geheimen worden hier NIET meegestuurd; onthullen is een aparte admin-actie.
    return send(res, 200, {
      entries: db.vault.map(({ secretEncrypted, ...rest }) => rest),
      magOnthullen: auth.magMinstens(user, 'admin')
    });
  }
  if (route === 'POST /api/vault') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Alleen admin' });
    const body = await readBody(req);
    if (!body.label) return send(res, 400, { error: 'Label is verplicht' });
    const entry = {
      id: id(), channelId: body.channelId || null, label: String(body.label),
      gebruikersnaam: String(body.gebruikersnaam || ''),
      url: String(body.url || ''), notities: String(body.notities || ''),
      secretEncrypted: body.secret ? vault.encryptSecret(body.secret) : ''
    };
    db.vault.push(entry);
    save();
    logActivity(user.naam, `voegde vault-item "${entry.label}" toe`);
    const { secretEncrypted, ...rest } = entry;
    return send(res, 200, { entry: rest });
  }
  if (req.method === 'POST' && /^\/api\/vault\/[^/]+\/onthul$/.test(url.pathname)) {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Alleen admin mag geheimen onthullen' });
    const vid = url.pathname.split('/')[3];
    const entry = db.vault.find(e => e.id === vid);
    if (!entry) return send(res, 404, { error: 'Niet gevonden' });
    logActivity(user.naam, `onthulde geheim van vault-item "${entry.label}"`);
    return send(res, 200, { secret: entry.secretEncrypted ? vault.decryptSecret(entry.secretEncrypted) : '' });
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/vault/')) {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Alleen admin' });
    const vid = url.pathname.split('/')[3];
    const idx = db.vault.findIndex(e => e.id === vid);
    if (idx === -1) return send(res, 404, { error: 'Niet gevonden' });
    logActivity(user.naam, `verwijderde vault-item "${db.vault[idx].label}"`);
    db.vault.splice(idx, 1);
    save();
    return send(res, 200, { ok: true });
  }

  // -- instellingen (Discord-webhook) --
  if (route === 'GET /api/settings') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Alleen admin' });
    return send(res, 200, { settings: db.settings });
  }
  if (route === 'PUT /api/settings') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Alleen admin' });
    const body = await readBody(req);
    db.settings.discordWebhookUrl = String(body.discordWebhookUrl || '');
    db.settings.discordEnabled = Boolean(body.discordEnabled);
    save();
    logActivity(user.naam, 'wijzigde de instellingen');
    return send(res, 200, { settings: db.settings });
  }
  if (route === 'POST /api/settings/discord-test') {
    if (!auth.magMinstens(user, 'admin')) return send(res, 403, { error: 'Alleen admin' });
    const ok = await notify('info', '🔔 Testbericht', ['De Discord-koppeling van het Bloop Universe CMS werkt!']);
    return send(res, ok ? 200 : 400, ok ? { ok: true } : { error: 'Webhook niet geconfigureerd of niet bereikbaar' });
  }

  return send(res, 404, { error: 'Onbekende route' });
}

// --- statische bestanden -----------------------------------------------------
function serveStatic(req, res, url) {
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(p));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Niet gevonden');
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

server.listen(PORT, () => {
  console.log(`\nBloop Universe CMS draait op http://localhost:${PORT}`);
  if (tijdelijkWachtwoord) {
    console.log('\n=== EERSTE START ===');
    console.log('Admin-account aangemaakt:');
    console.log('  e-mail:     admin@bloopuniverse.local');
    console.log(`  wachtwoord: ${tijdelijkWachtwoord}`);
    console.log('Wijzig dit wachtwoord direct na de eerste login.\n');
  }
});
