// Bloop Universe CMS — frontend (vanilla JS, geen build-stap).
let ME = null;
let CACHE = { channels: [], team: [] };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fout (${res.status})`);
  return data;
}

function magMinstens(rol) {
  const niveaus = { admin: 0, manager: 1, freelancer: 2 };
  return ME && niveaus[ME.rol] <= niveaus[rol];
}

// ---------- login / bootstrap ----------
async function init() {
  try {
    const { user } = await api('/api/me');
    ME = user;
    toonApp();
  } catch {
    $('#login-view').classList.remove('hidden');
  }
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const { user } = await api('/api/login', { method: 'POST', body: { email: $('#login-email').value, password: $('#login-password').value } });
    ME = user;
    $('#login-view').classList.add('hidden');
    toonApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.reload();
});

function toonApp() {
  $('#app-view').classList.remove('hidden');
  $('#user-badge').textContent = `${ME.naam} · ${ME.rol}`;
  if (!magMinstens('manager')) document.querySelectorAll('.manager-only').forEach(el => el.remove());
  if (!magMinstens('admin')) document.querySelectorAll('.admin-only').forEach(el => el.remove());
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => openTab(btn.dataset.tab)));
  if (ME.moetWachtwoordWijzigen) {
    const nieuw = prompt('Eerste login: kies een nieuw wachtwoord (min. 8 tekens)');
    if (nieuw && nieuw.length >= 8) api('/api/me/password', { method: 'POST', body: { nieuw } });
  }
  openTab('dashboard');
}

function openTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const render = VIEWS[tab];
  if (render) render();
}

// ---------- views ----------
const VIEWS = {
  dashboard: async () => {
    const d = await api('/api/dashboard');
    $('#content').innerHTML = `
      <h2>Dashboard</h2>
      <div class="grid">
        <div class="card stat"><div class="big">${d.kanalen}</div><div class="muted">Kanalen</div></div>
        <div class="card stat"><div class="big">${d.videosInProductie}</div><div class="muted">Video's in productie</div></div>
        <div class="card stat"><div class="big">${d.videosAfgerond}</div><div class="muted">Video's afgerond</div></div>
        <div class="card stat"><div class="big">${d.openTodos}</div><div class="muted">Open to-do's</div></div>
      </div>
      ${d.openCheckpoints.length ? `
        <h3>⏸️ Wacht op jouw goedkeuring</h3>
        <div class="card">${d.openCheckpoints.map(c => `
          <div class="todo-rij">
            <span class="badge ter_goedkeuring">${esc(c.stap)}</span>
            <span><b>${esc(c.werktitel)}</b> — ${esc(c.kanaal)}</span>
            ${c.opleverLink ? `<a href="${esc(c.opleverLink)}" target="_blank" class="muted">bekijk oplevering</a>` : ''}
            <span style="margin-left:auto"><button class="btn small" onclick="openTab('pipeline')">Naar pipeline →</button></span>
          </div>`).join('')}
        </div>` : ''}
      ${d.deadlines.length ? `
        <h3>⏰ Deadlines</h3>
        <div class="card">${d.deadlines.map(x => `
          <div class="todo-rij">
            <span class="badge ${x.urgentie}">${x.urgentie === 'te_laat' ? 'TE LAAT' : 'BINNEN 24u'}</span>
            <span><b>${esc(x.werktitel)}</b> · ${esc(x.stap)} · ${esc(x.assignee)} · deadline ${esc(x.deadline)}</span>
          </div>`).join('')}
        </div>` : ''}
      ${d.activity.length ? `
        <h3>Recente activiteit</h3>
        <div class="card">${d.activity.map(a => `
          <div class="todo-rij"><span class="muted">${new Date(a.ts).toLocaleString('nl-NL')}</span><span><b>${esc(a.user)}</b> ${esc(a.tekst)}</span></div>`).join('')}
        </div>` : ''}`;
  },

  kanalen: async () => {
    const { channels } = await api('/api/channels');
    CACHE.channels = channels;
    const isManager = magMinstens('manager');
    $('#content').innerHTML = `
      <h2>Kanalen</h2>
      ${channels.map(c => kanaalKaart(c, isManager)).join('') || '<p class="muted">Nog geen kanalen.</p>'}
      ${isManager ? `<h3>Nieuw kanaal</h3><div class="card">${kanaalForm({})}</div>` : ''}`;
    if (isManager) bindKanaalForms();
    bindYoutubeActies();
  },

  pipeline: async () => {
    const [{ videos }, { channels }, { team }] = await Promise.all([
      api('/api/videos'), api('/api/channels'), api('/api/team')
    ]);
    CACHE.channels = channels; CACHE.team = team;
    const isManager = magMinstens('manager');
    const actief = videos.filter(v => !v.afgerond);
    const klaar = videos.filter(v => v.afgerond);
    $('#content').innerHTML = `
      <h2>Pipeline</h2>
      <p class="muted">Idee → Script → Voice/Avatar → Video-edit → Thumbnail → Upload. Elke stap is een checkpoint: pas na goedkeuring gaat het werk door naar de volgende freelancer.</p>
      ${isManager ? `
        <div class="card">
          <h3 style="margin-top:0">🎬 Nieuwe video starten</h3>
          <div class="form-row">
            <div><label>Kanaal</label><select id="nv-kanaal">${channels.map(c => `<option value="${c.id}">${esc(c.naam)}</option>`).join('')}</select></div>
            <div><label>Werktitel</label><input id="nv-titel" placeholder="bijv. Top 10 ruimtemysteries"></div>
            <div><label>Geplande publicatiedatum</label><input id="nv-publicatie" type="date"></div>
          </div>
          <label>Idee / korte omschrijving</label><textarea id="nv-idee"></textarea>
          <div style="margin-top:.7rem"><button class="btn primary" id="nv-start">Start in pipeline</button> <span class="error" id="nv-error"></span></div>
        </div>` : ''}
      ${actief.map(v => videoKaart(v, isManager)).join('') || '<p class="muted">Geen video\'s in productie.</p>'}
      ${klaar.length ? `<h3>✅ Afgerond (${klaar.length})</h3>${klaar.map(v => `<div class="card"><b>${esc(v.werktitel)}</b> — ${esc(kanaalNaam(v.channelId))} <span class="badge goedgekeurd">afgerond</span></div>`).join('')}` : ''}`;
    bindVideoExtras();
    if (isManager) {
      $('#nv-start')?.addEventListener('click', async () => {
        try {
          await api('/api/videos', { method: 'POST', body: { channelId: $('#nv-kanaal').value, werktitel: $('#nv-titel').value, idee: $('#nv-idee').value, geplandePublicatie: $('#nv-publicatie').value || null } });
          VIEWS.pipeline();
        } catch (e) { $('#nv-error').textContent = e.message; }
      });
    }
    bindStapActies();
  },

  todos: async () => {
    const [{ todos }, { channels }] = await Promise.all([api('/api/todos'), api('/api/channels')]);
    CACHE.channels = channels;
    $('#content').innerHTML = `
      <h2>To-do's</h2>
      <div class="card">
        <div class="form-row">
          <input id="todo-tekst" placeholder="Nieuwe to-do…">
          <select id="todo-kanaal"><option value="">— algemeen —</option>${channels.map(c => `<option value="${c.id}">${esc(c.naam)}</option>`).join('')}</select>
          <input id="todo-deadline" type="date">
          <button class="btn primary" id="todo-add">Toevoegen</button>
        </div>
      </div>
      <div class="card" id="todo-lijst">
        ${todos.map(t => `
          <div class="todo-rij ${t.klaar ? 'klaar' : ''}">
            <input type="checkbox" ${t.klaar ? 'checked' : ''} data-toggle="${t.id}">
            <span class="tekst">${esc(t.tekst)}</span>
            ${t.channelId ? `<span class="badge">${esc(kanaalNaam(t.channelId))}</span>` : ''}
            ${t.deadline ? `<span class="muted">📅 ${esc(t.deadline)}</span>` : ''}
          </div>`).join('') || '<p class="muted">Geen to-do\'s.</p>'}
      </div>`;
    $('#todo-add').addEventListener('click', async () => {
      if (!$('#todo-tekst').value) return;
      await api('/api/todos', { method: 'POST', body: { tekst: $('#todo-tekst').value, channelId: $('#todo-kanaal').value || null, deadline: $('#todo-deadline').value || null } });
      VIEWS.todos();
    });
    document.querySelectorAll('[data-toggle]').forEach(cb =>
      cb.addEventListener('change', async () => { await api(`/api/todos/${cb.dataset.toggle}/toggle`, { method: 'POST' }); VIEWS.todos(); }));
  },

  kalender: async () => {
    const [{ weken, inGevaar }, { channels }] = await Promise.all([api('/api/kalender'), api('/api/channels')]);
    CACHE.channels = channels;
    $('#content').innerHTML = `
      <h2>📅 Publicatiekalender</h2>
      <p class="muted">Bewaakt per kanaal of de uploadfrequentie gehaald wordt. Geef video's een publicatiedatum (Pipeline → bewerken) en de kalender rekent alles uit. Bij gevaar gaat er 's ochtends automatisch een Discord-alarm af.</p>
      ${inGevaar.length ? `
        <div class="card" style="border-color:var(--red)">
          <b>⚠️ Schema in gevaar:</b>
          ${inGevaar.map(p => `<div class="todo-rij"><span class="badge leeg">${p.ingepland}/${p.benodigd}</span><span><b>${esc(p.kanaal)}</b> — week ${esc(p.week)}</span></div>`).join('')}
        </div>` : '<div class="card" style="border-color:var(--green)">✅ Alle kanalen liggen op schema voor deze en volgende week.</div>'}
      ${weken.map(w => `
        <div class="card kalender-week">
          <h3 style="margin-top:0">Week ${esc(w.maandag)} t/m ${esc(w.zondag)}</h3>
          ${w.kanalen.map(k => `
            <div class="kalender-rij">
              <span class="badge ${k.status}">${k.gepubliceerd + k.gepland}/${k.benodigd}</span>
              <b>${esc(k.kanaal)}</b>
              <span class="videos">${k.videos.map(v => `${v.afgerond ? '✅' : '🎬'} ${esc(v.werktitel)} (${esc(v.datum)})`).join(' · ') || 'niets ingepland'}</span>
            </div>`).join('') || '<p class="muted">Nog geen kanalen.</p>'}
        </div>`).join('')}`;
  },

  templates: async () => {
    const [{ templates }, { channels }] = await Promise.all([api('/api/templates'), api('/api/channels')]);
    CACHE.channels = channels;
    const isManager = magMinstens('manager');
    const types = { titel: '📝 Titelformules', thumbnail: '🖼️ Thumbnailconcepten', hook: '🪝 Hooks', beschrijving: '📄 Beschrijvingen', script: '✍️ Scriptstructuren' };
    $('#content').innerHTML = `
      <h2>🧩 Templatebibliotheek</h2>
      <p class="muted">Bewezen titelformules, thumbnailconcepten, hooks en beschrijvingen. Werkt iets goed (hoge CTR of AVD)? Sla het hier op — zo wordt het systeem elke maand slimmer.</p>
      ${Object.entries(types).map(([type, kop]) => {
        const items = templates.filter(t => t.type === type);
        if (!items.length) return '';
        return `<h3>${kop}</h3>${items.map(t => `
          <div class="card">
            <b>${esc(t.naam)}</b> ${t.channelId ? `<span class="badge">${esc(kanaalNaam(t.channelId))}</span>` : '<span class="badge">alle kanalen</span>'}
            ${isManager ? `<button class="btn small red" style="float:right" data-deltemplate="${t.id}">🗑️</button>` : ''}
            <p style="white-space:pre-wrap;margin-top:.4rem">${esc(t.inhoud)}</p>
            ${t.prestatie ? `<p class="muted" style="font-size:.82rem">📈 ${esc(t.prestatie)}</p>` : ''}
          </div>`).join('')}`;
      }).join('') || '<p class="muted">Nog geen templates.</p>'}
      ${isManager ? `
      <h3>Nieuwe template</h3>
      <div class="card">
        <div class="form-row">
          <div><label>Type</label><select id="t-type">${Object.keys(types).map(t => `<option>${t}</option>`).join('')}</select></div>
          <div><label>Naam</label><input id="t-naam" placeholder="bijv. Getal + mysterie + curiosity gap"></div>
          <div><label>Kanaal</label><select id="t-kanaal"><option value="">alle kanalen</option>${channels.map(c => `<option value="${c.id}">${esc(c.naam)}</option>`).join('')}</select></div>
        </div>
        <label>Inhoud / formule</label><textarea id="t-inhoud" placeholder="bijv. [Getal] [onderwerpen] die [onverwacht gevolg] — max 55 tekens"></textarea>
        <label>Prestatie-notitie (waarom werkt dit?)</label><input id="t-prestatie" placeholder="bijv. 8,1% CTR op video X">
        <div style="margin-top:.7rem"><button class="btn primary" id="t-add">Opslaan</button> <span class="error" id="t-error"></span></div>
      </div>` : ''}`;
    $('#t-add')?.addEventListener('click', async () => {
      try {
        await api('/api/templates', { method: 'POST', body: {
          type: $('#t-type').value, naam: $('#t-naam').value, channelId: $('#t-kanaal').value || null,
          inhoud: $('#t-inhoud').value, prestatie: $('#t-prestatie').value } });
        VIEWS.templates();
      } catch (e) { $('#t-error').textContent = e.message; }
    });
    document.querySelectorAll('[data-deltemplate]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Template verwijderen?')) {
        await api(`/api/templates/${b.dataset.deltemplate}`, { method: 'DELETE' });
        VIEWS.templates();
      }
    }));
  },

  instructies: () => {
    $('#content').innerHTML = `
      <h2>📚 Instructiecentrum</h2>
      <p class="muted">Vaste werkinstructies per rol. Nieuw teamlid? Eerst dit lezen, dan pas aan de slag.</p>
      <div class="instructie-nav">
        <button class="btn" data-inst="scriptwriter">✍️ Scriptwriter</button>
        <button class="btn" data-inst="editor">🎞️ Video-editor</button>
        <button class="btn" data-inst="thumbnail">🖼️ Thumbnail-artiest</button>
        <button class="btn" data-inst="algemeen">🧭 Algemene afspraken</button>
      </div>
      <div class="card instructie-body" id="instructie-body"></div>`;
    document.querySelectorAll('[data-inst]').forEach(b =>
      b.addEventListener('click', () => { $('#instructie-body').innerHTML = INSTRUCTIES[b.dataset.inst]; }));
    $('#instructie-body').innerHTML = INSTRUCTIES.algemeen;
  },

  vault: async () => {
    const { entries, magOnthullen } = await api('/api/vault');
    const { channels } = await api('/api/channels');
    CACHE.channels = channels;
    $('#content').innerHTML = `
      <h2>🔐 Channel Admin</h2>
      <p class="muted">Alle kanaalinformatie en inloggegevens op één plek. Geheimen zijn versleuteld opgeslagen; alleen de admin kan ze onthullen en elke onthulling wordt gelogd.</p>
      <div class="card">
        <table>
          <tr><th>Label</th><th>Kanaal</th><th>Gebruikersnaam</th><th>URL</th><th>Notities</th><th></th></tr>
          ${entries.map(e => `
            <tr>
              <td><b>${esc(e.label)}</b></td>
              <td>${esc(kanaalNaam(e.channelId))}</td>
              <td>${esc(e.gebruikersnaam)}</td>
              <td>${e.url ? `<a href="${esc(e.url)}" target="_blank">link</a>` : ''}</td>
              <td class="muted">${esc(e.notities)}</td>
              <td>
                ${magOnthullen ? `<button class="btn small" data-onthul="${e.id}">👁️ Toon geheim</button>
                <button class="btn small red" data-verwijder="${e.id}">🗑️</button>` : ''}
              </td>
            </tr>`).join('') || '<tr><td colspan="6" class="muted">Nog geen items.</td></tr>'}
        </table>
      </div>
      ${magOnthullen ? `
      <h3>Nieuw item</h3>
      <div class="card">
        <div class="form-row">
          <div><label>Label</label><input id="v-label" placeholder="bijv. YouTube-login hoofdkanaal"></div>
          <div><label>Kanaal</label><select id="v-kanaal"><option value="">—</option>${channels.map(c => `<option value="${c.id}">${esc(c.naam)}</option>`).join('')}</select></div>
          <div><label>Gebruikersnaam / e-mail</label><input id="v-user"></div>
          <div><label>Wachtwoord / geheim</label><input id="v-secret" type="password"></div>
          <div><label>URL</label><input id="v-url" placeholder="https://…"></div>
          <div><label>Notities</label><input id="v-notities" placeholder="bijv. 2FA via admin-telefoon"></div>
        </div>
        <div style="margin-top:.7rem"><button class="btn primary" id="v-add">Opslaan</button> <span class="error" id="v-error"></span></div>
      </div>` : ''}`;
    $('#v-add')?.addEventListener('click', async () => {
      try {
        await api('/api/vault', { method: 'POST', body: {
          label: $('#v-label').value, channelId: $('#v-kanaal').value || null,
          gebruikersnaam: $('#v-user').value, secret: $('#v-secret').value,
          url: $('#v-url').value, notities: $('#v-notities').value } });
        VIEWS.vault();
      } catch (e) { $('#v-error').textContent = e.message; }
    });
    document.querySelectorAll('[data-onthul]').forEach(b => b.addEventListener('click', async () => {
      const { secret } = await api(`/api/vault/${b.dataset.onthul}/onthul`, { method: 'POST' });
      alert(`Geheim:\n\n${secret || '(leeg)'}\n\nDeze onthulling is gelogd.`);
    }));
    document.querySelectorAll('[data-verwijder]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Dit vault-item definitief verwijderen?')) {
        await api(`/api/vault/${b.dataset.verwijder}`, { method: 'DELETE' });
        VIEWS.vault();
      }
    }));
  },

  team: async () => {
    const { users, rollen, functies } = await api('/api/users');
    const isAdmin = magMinstens('admin');
    $('#content').innerHTML = `
      <h2>👥 Team & toegangsbeheer</h2>
      <p class="muted">admin = alles · manager = beheer zonder geheimen · freelancer = alleen pipeline, to-do's en instructies.</p>
      <div class="card">
        <table>
          <tr><th>Naam</th><th>E-mail</th><th>Rol</th><th>Functie</th><th></th></tr>
          ${users.map(u => `
            <tr>
              <td><b>${esc(u.naam)}</b></td><td class="muted">${esc(u.email)}</td>
              <td><span class="badge">${esc(u.rol)}</span></td><td>${esc(u.functie)}</td>
              <td>${u.discordUserId ? '<span class="badge" title="Discord gekoppeld">🎮 Discord ✓</span>' : (isAdmin ? `<button class="btn small" data-koppelcode="${u.id}">🎮 Koppelcode</button>` : '')}
              ${isAdmin && u.id !== ME.id ? `<button class="btn small red" data-deluser="${u.id}">🗑️</button>` : ''}</td>
            </tr>`).join('')}
        </table>
      </div>
      ${isAdmin ? `
      <h3>Nieuw teamlid</h3>
      <div class="card">
        <div class="form-row">
          <div><label>Naam</label><input id="u-naam"></div>
          <div><label>E-mail</label><input id="u-email" type="email"></div>
          <div><label>Tijdelijk wachtwoord</label><input id="u-pass"></div>
          <div><label>Rol</label><select id="u-rol">${rollen.map(r => `<option ${r === 'freelancer' ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
          <div><label>Functie</label><select id="u-functie">${functies.map(f => `<option>${f}</option>`).join('')}</select></div>
        </div>
        <div style="margin-top:.7rem"><button class="btn primary" id="u-add">Toevoegen</button> <span class="error" id="u-error"></span></div>
      </div>` : ''}`;
    $('#u-add')?.addEventListener('click', async () => {
      try {
        await api('/api/users', { method: 'POST', body: {
          naam: $('#u-naam').value, email: $('#u-email').value, password: $('#u-pass').value,
          rol: $('#u-rol').value, functie: $('#u-functie').value } });
        VIEWS.team();
      } catch (e) { $('#u-error').textContent = e.message; }
    });
    document.querySelectorAll('[data-koppelcode]').forEach(b => b.addEventListener('click', async () => {
      const { code, uitleg } = await api(`/api/users/${b.dataset.koppelcode}/koppelcode`, { method: 'POST' });
      alert(`Koppelcode: ${code}\n\n${uitleg}`);
    }));
    document.querySelectorAll('[data-deluser]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Gebruiker verwijderen? Toegang vervalt direct.')) {
        await api(`/api/users/${b.dataset.deluser}`, { method: 'DELETE' });
        VIEWS.team();
      }
    }));
  },

  instellingen: async () => {
    const { settings } = await api('/api/settings');
    $('#content').innerHTML = `
      <h2>⚙️ Instellingen</h2>
      <div class="card">
        <h3 style="margin-top:0">Discord-koppeling</h3>
        <p class="muted">Maak in je Discord-server een webhook aan (Serverinstellingen → Integraties → Webhooks, bijv. voor #productie-updates) en plak de URL hieronder. Het CMS post dan automatisch bij elke checkpoint, goedkeuring, afkeuring en nieuwe video. Zie docs/discord-integratie.md voor de volwaardige bot met goedkeuringsknoppen.</p>
        <label>Webhook-URL</label>
        <input id="s-webhook" value="${esc(settings.discordWebhookUrl)}" placeholder="https://discord.com/api/webhooks/…">
        <label><input type="checkbox" id="s-enabled" style="width:auto" ${settings.discordEnabled ? 'checked' : ''}> Notificaties aan</label>
        <div style="margin-top:.7rem">
          <button class="btn primary" id="s-save">Alle instellingen opslaan</button>
          <button class="btn" id="s-test">Test versturen</button>
          <span id="s-msg" class="muted"></span>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Discord-bot</h3>
        <p class="muted">De bot in <code>discord-bot/</code> logt in op het CMS met dit token. Genereer het één keer en zet het in de <code>.env</code> van de bot als <code>CMS_BOT_TOKEN</code>. Opnieuw genereren maakt het oude token ongeldig.</p>
        <p>${settings.botToken ? `Huidig token: <code>${esc(settings.botToken)}</code>` : '<span class="muted">Nog geen token gegenereerd.</span>'}</p>
        <button class="btn" id="s-bottoken">🎮 Genereer ${settings.botToken ? 'nieuw ' : ''}bot-token</button>
      </div>
      <div class="card">
        <h3 style="margin-top:0">YouTube API</h3>
        <p class="muted">Voor automatische KPI's (views, AVD, omzet). Maak een OAuth-client aan in de Google Cloud Console (zie docs/youtube-api.md), vul hieronder in, en koppel daarna per kanaal via het Kanalen-tabblad. Thumbnail-CTR geeft YouTube niet via de API — die vul je handmatig in bij een video.</p>
        <div class="form-row">
          <div><label>Client-id</label><input id="s-ytclient" value="${esc(settings.youtube?.clientId || '')}" placeholder="xxxx.apps.googleusercontent.com"></div>
          <div><label>Client-secret ${settings.youtube?.clientSecretIngesteld ? '(ingesteld — alleen invullen om te vervangen)' : ''}</label><input id="s-ytsecret" type="password" placeholder="${settings.youtube?.clientSecretIngesteld ? '••••••••' : 'GOCSPX-…'}"></div>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">QC-checklist (vóór upload)</h3>
        <p class="muted">Eén regel per checkpunt. Nieuwe video's krijgen deze lijst; de upload-stap kan pas ingeleverd worden als alles is afgevinkt.</p>
        <textarea id="s-qc" style="min-height:140px">${esc((settings.qcItems || []).join('\n'))}</textarea>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Wachtwoord wijzigen</h3>
        <div class="form-row">
          <input id="pw-nieuw" type="password" placeholder="Nieuw wachtwoord (min. 8 tekens)">
          <button class="btn" id="pw-save">Wijzigen</button>
        </div>
      </div>`;
    $('#s-save').addEventListener('click', async () => {
      await api('/api/settings', { method: 'PUT', body: {
        discordWebhookUrl: $('#s-webhook').value,
        discordEnabled: $('#s-enabled').checked,
        qcItems: $('#s-qc').value.split('\n').map(s => s.trim()).filter(Boolean),
        youtube: { clientId: $('#s-ytclient').value, clientSecret: $('#s-ytsecret').value }
      } });
      $('#s-msg').textContent = 'Opgeslagen ✔';
    });
    $('#s-bottoken').addEventListener('click', async () => {
      if (!confirm('Nieuw bot-token genereren? Een eventueel oud token stopt direct met werken.')) return;
      await api('/api/settings/bot-token', { method: 'POST' });
      VIEWS.instellingen();
    });
    $('#s-test').addEventListener('click', async () => {
      try { await api('/api/settings/discord-test', { method: 'POST' }); $('#s-msg').textContent = 'Testbericht verstuurd ✔'; }
      catch (e) { $('#s-msg').textContent = e.message; }
    });
    $('#pw-save').addEventListener('click', async () => {
      try { await api('/api/me/password', { method: 'POST', body: { nieuw: $('#pw-nieuw').value } }); $('#pw-nieuw').value = ''; alert('Wachtwoord gewijzigd'); }
      catch (e) { alert(e.message); }
    });
  }
};

// ---------- helpers: kanalen ----------
function kanaalNaam(cid) {
  return CACHE.channels.find(c => c.id === cid)?.naam || '—';
}

function kanaalKaart(c, isManager) {
  const k = c.kpis || {};
  return `
    <div class="card">
      <h3 style="margin-top:0">📺 ${esc(c.naam)}</h3>
      <p class="muted">${esc(c.onderwerp)}</p>
      <div class="grid" style="margin:.8rem 0">
        <div><b>Uploadfrequentie</b><br>${k.uploadFrequentiePerWeek ?? '?'}× per week ${c.uploadDagen ? `(${esc(c.uploadDagen)})` : ''}</div>
        ${k.avdMinuten != null ? `<div><b>Doel AVD</b><br>${k.avdMinuten} min</div>` : ''}
        ${k.ctrPct != null ? `<div><b>Doel CTR</b><br>${k.ctrPct}%</div>` : ''}
        ${k.levertijdDagen != null ? `<div><b>Levertijd</b><br>${k.levertijdDagen} dagen per video</div>` : ''}
        ${k.omzetgroeiPctPerMaand != null ? `<div><b>Doel omzetgroei</b><br>${k.omzetgroeiPctPerMaand}% per maand</div>` : ''}
      </div>
      ${c.titelFormat ? `<p><b>Titelformat:</b> <span class="muted">${esc(c.titelFormat)}</span></p>` : ''}
      ${c.thumbnailFormat ? `<p><b>Thumbnailformat:</b> <span class="muted">${esc(c.thumbnailFormat)}</span></p>` : ''}
      ${c.concurrenten?.length ? `<p><b>Concurrenten:</b> ${c.concurrenten.map(x => `<span class="badge">${esc(x)}</span>`).join(' ')}</p>` : ''}
      ${c.notities ? `<p class="muted">${esc(c.notities)}</p>` : ''}
      ${youtubeBlok(c, isManager)}
      ${isManager ? `<details style="margin-top:.6rem"><summary class="muted" style="cursor:pointer">Bewerken</summary>${kanaalForm(c)}</details>` : ''}
    </div>`;
}

// Doel vs. realisatie: groen = doel gehaald, geel = >75%, rood = eronder.
function stoplicht(realisatie, doel, hogerIsBeter = true) {
  if (realisatie == null || doel == null) return '';
  const ratio = hogerIsBeter ? realisatie / doel : doel / realisatie;
  const kleur = ratio >= 1 ? 'groen' : ratio >= 0.75 ? 'geel' : 'rood';
  return `<span class="kpi-stoplicht ${kleur}"></span>`;
}

function youtubeBlok(c, isManager) {
  const yt = c.youtube;
  const s = c.youtubeStats;
  const k = c.kpis || {};
  if (!isManager && !s) return '';
  const avdMin = s?.avdSeconden != null ? Number((s.avdSeconden / 60).toFixed(2)) : null;
  return `
    <div style="border-top:1px solid var(--border);margin-top:.8rem;padding-top:.6rem">
      ${yt?.youtubeChannelId
        ? `<p style="font-size:.85rem">▶️ Gekoppeld aan <b>${esc(yt.youtubeNaam || yt.youtubeChannelId)}</b>
            ${s ? `<span class="muted">· ${esc(s.periode)}: <b>${s.views}</b> views · ${stoplicht(avdMin, k.avdMinuten)}AVD <b>${avdMin ?? '?'} min</b> (doel ${k.avdMinuten ?? '–'}) · +${s.abonneesErbij} abonnees${s.omzetUsd != null ? ` · $${Number(s.omzetUsd).toFixed(2)}` : ''}</span>` : '<span class="muted">· nog geen cijfers — druk op Sync</span>'}
           </p>`
        : (isManager ? '<p class="muted" style="font-size:.85rem">▶️ Nog niet aan YouTube gekoppeld — cijfers komen dan automatisch binnen.</p>' : '')}
      ${magMinstens('admin') && !yt?.youtubeChannelId ? `<button class="btn small" data-ytkoppel="${c.id}">▶️ Koppel YouTube</button>` : ''}
      ${isManager && yt?.youtubeChannelId ? `<button class="btn small" data-ytsync="1">🔄 Sync cijfers</button>` : ''}
    </div>`;
}

function bindYoutubeActies() {
  document.querySelectorAll('[data-ytkoppel]').forEach(b => b.addEventListener('click', async () => {
    try {
      const { url } = await api(`/api/youtube/koppel?channelId=${b.dataset.ytkoppel}`);
      window.open(url, '_blank');
      alert('Log in met het Google-account van dit YouTube-kanaal. Kom daarna terug en druk op "Sync cijfers".');
    } catch (e) { alert(e.message); }
  }));
  document.querySelectorAll('[data-ytsync]').forEach(b => b.addEventListener('click', async () => {
    b.textContent = '⏳ bezig…';
    try {
      const { resultaten } = await api('/api/youtube/sync', { method: 'POST' });
      alert(resultaten.map(r => `${r.kanaal}: ${r.videos} video's bijgewerkt${r.fouten.length ? `\n  fouten: ${r.fouten.join('; ')}` : ''}`).join('\n'));
      VIEWS.kanalen();
    } catch (e) { alert(e.message); VIEWS.kanalen(); }
  }));
}

function kanaalForm(c) {
  const k = c.kpis || {};
  const cid = c.id || 'nieuw';
  return `
    <div data-kanaalform="${cid}">
      <div class="form-row">
        <div><label>Kanaalnaam *</label><input class="f-naam" value="${esc(c.naam || '')}"></div>
        <div><label>Onderwerp / niche</label><input class="f-onderwerp" value="${esc(c.onderwerp || '')}" placeholder="bijv. ruimtemysteries, faceless"></div>
        <div><label>Uploadfrequentie per week * (NOOIT vergeten)</label><input class="f-freq" type="number" min="1" value="${k.uploadFrequentiePerWeek ?? ''}"></div>
        <div><label>Uploaddagen</label><input class="f-dagen" value="${esc(c.uploadDagen || '')}" placeholder="bijv. di + vr 17:00"></div>
        <div><label>Doel AVD (minuten)</label><input class="f-avd" type="number" step="0.1" value="${k.avdMinuten ?? ''}"></div>
        <div><label>Doel CTR (%)</label><input class="f-ctr" type="number" step="0.1" value="${k.ctrPct ?? ''}"></div>
        <div><label>Levertijd per video (dagen)</label><input class="f-levertijd" type="number" value="${k.levertijdDagen ?? ''}"></div>
        <div><label>Doel omzetgroei (% per maand)</label><input class="f-omzet" type="number" step="0.1" value="${k.omzetgroeiPctPerMaand ?? ''}"></div>
      </div>
      <label>Titelformat / -structuur</label><input class="f-titelformat" value="${esc(c.titelFormat || '')}" placeholder="bijv. [Getal] + [onderwerp] + curiosity gap — max 55 tekens">
      <label>Thumbnailformat / -structuur</label><input class="f-thumbformat" value="${esc(c.thumbnailFormat || '')}" placeholder="bijv. 1 gezicht/object rechts, 3-4 woorden links, felle contrastkleur">
      <label>Concurrenten (komma-gescheiden)</label><input class="f-concurrenten" value="${esc((c.concurrenten || []).join(', '))}">
      <label>Notities</label><textarea class="f-notities">${esc(c.notities || '')}</textarea>
      <div style="margin-top:.7rem"><button class="btn primary f-save">Opslaan</button> <span class="error f-error"></span></div>
    </div>`;
}

function bindKanaalForms() {
  document.querySelectorAll('[data-kanaalform]').forEach(form => {
    form.querySelector('.f-save').addEventListener('click', async () => {
      const body = {
        naam: form.querySelector('.f-naam').value,
        onderwerp: form.querySelector('.f-onderwerp').value,
        titelFormat: form.querySelector('.f-titelformat').value,
        thumbnailFormat: form.querySelector('.f-thumbformat').value,
        concurrenten: form.querySelector('.f-concurrenten').value.split(',').map(s => s.trim()).filter(Boolean),
        uploadDagen: form.querySelector('.f-dagen').value,
        notities: form.querySelector('.f-notities').value,
        kpis: {
          uploadFrequentiePerWeek: form.querySelector('.f-freq').value || null,
          avdMinuten: form.querySelector('.f-avd').value || null,
          ctrPct: form.querySelector('.f-ctr').value || null,
          levertijdDagen: form.querySelector('.f-levertijd').value || null,
          omzetgroeiPctPerMaand: form.querySelector('.f-omzet').value || null
        }
      };
      const cid = form.dataset.kanaalform;
      try {
        if (cid === 'nieuw') await api('/api/channels', { method: 'POST', body });
        else await api(`/api/channels/${cid}`, { method: 'PUT', body });
        VIEWS.kanalen();
      } catch (e) { form.querySelector('.f-error').textContent = e.message; }
    });
  });
}

// ---------- helpers: pipeline ----------
function videoKaart(v, isManager) {
  const uploadActief = v.stappen.find(s => s.key === 'upload' && s.status !== 'wachtend');
  const s = v.stats;
  return `
    <div class="card" data-video="${v.id}">
      <h3 style="margin-top:0">🎬 ${esc(v.werktitel)} <span class="muted" style="font-weight:400">— ${esc(kanaalNaam(v.channelId))}</span></h3>
      ${v.idee ? `<p class="muted">${esc(v.idee)}</p>` : ''}
      <p class="muted" style="font-size:.85rem">
        ${v.geplandePublicatie ? `📅 publicatie: <b>${esc(v.geplandePublicatie)}</b>` : '📅 nog geen publicatiedatum'}
        ${v.youtubeVideoId ? ` · ▶️ <a href="https://youtu.be/${esc(v.youtubeVideoId)}" target="_blank">${esc(v.youtubeVideoId)}</a>` : ''}
        ${s ? ` · 👁 ${s.views ?? '?'} views${s.ctrPct != null ? ` · CTR ${s.ctrPct}%` : ''}${s.avdMinuten != null ? ` · AVD ${s.avdMinuten} min` : ''}` : ''}
        ${isManager ? ` · <a href="#" data-videoedit="${v.id}">bewerken</a>` : ''}
      </p>
      <div class="stappen">
        ${v.stappen.map(st => stapBlok(v, st, isManager)).join('')}
      </div>
      ${v.qc?.length ? `
      <details ${uploadActief ? 'open' : ''} style="margin-top:.5rem">
        <summary class="muted" style="cursor:pointer">✅ QC-checklist vóór upload (${v.qc.filter(q => q.done).length}/${v.qc.length})</summary>
        <div class="qc-lijst">
          ${v.qc.map((q, i) => `
            <label class="qc-item ${q.done ? 'done' : ''}">
              <input type="checkbox" ${q.done ? 'checked' : ''} data-qc="${v.id}:${i}"> ${esc(q.label)}
            </label>`).join('')}
        </div>
      </details>` : ''}
    </div>`;
}

function bindVideoExtras() {
  document.querySelectorAll('[data-qc]').forEach(cb => cb.addEventListener('change', async () => {
    const [videoId, index] = cb.dataset.qc.split(':');
    await api(`/api/videos/${videoId}/qc/${index}/toggle`, { method: 'POST' });
    VIEWS.pipeline();
  }));
  document.querySelectorAll('[data-videoedit]').forEach(a => a.addEventListener('click', async e => {
    e.preventDefault();
    const vid = a.dataset.videoedit;
    const datum = prompt('Geplande publicatiedatum (JJJJ-MM-DD, leeg = geen):');
    if (datum === null) return;
    const ytId = prompt('YouTube video-id na upload (bijv. dQw4w9WgXcQ, leeg = geen):');
    if (ytId === null) return;
    await api(`/api/videos/${vid}`, { method: 'PUT', body: { geplandePublicatie: datum || null, youtubeVideoId: ytId || '' } });
    const stats = prompt('Handmatige KPI-invoer views,CTR%,AVDmin (bijv. 15000,6.2,4.5 — leeg = overslaan):');
    if (stats) {
      const [views, ctrPct, avdMinuten] = stats.split(',').map(x => x.trim());
      await api(`/api/videos/${vid}/stats`, { method: 'POST', body: { views, ctrPct, avdMinuten } });
    }
    VIEWS.pipeline();
  }));
}

function stapBlok(v, s, isManager) {
  const assignee = CACHE.team.find(u => u.id === s.assigneeId);
  const isMijn = ME && s.assigneeId === ME.id;
  const magInleveren = (s.status === 'bezig' || s.status === 'afgekeurd') && (isManager || isMijn || !s.assigneeId);
  return `
    <div class="stap ${s.status === 'bezig' || s.status === 'ter_goedkeuring' || s.status === 'afgekeurd' ? 'actief' : ''}">
      <div class="stap-naam">${esc(s.naam)}</div>
      <span class="badge ${s.status}">${s.status.replace('_', ' ')}</span>
      <div class="stap-meta">${assignee ? `👤 ${esc(assignee.naam)}` : '👤 niet toegewezen'}${s.deadline ? ` · 📅 ${esc(s.deadline)}` : ''}</div>
      ${s.opleverLink ? `<div class="stap-meta">🔗 <a href="${esc(s.opleverLink)}" target="_blank">oplevering</a></div>` : ''}
      ${s.feedback.map(f => `<div class="feedback-blok"><b>${esc(f.door)}:</b> ${esc(f.tekst)}</div>`).join('')}
      <div class="acties">
        ${magInleveren ? `<button class="btn small" data-actie="inleveren" data-v="${v.id}" data-s="${s.key}">📤 Inleveren</button>` : ''}
        ${isManager && s.status === 'ter_goedkeuring' ? `
          <button class="btn small green" data-actie="goedkeuren" data-v="${v.id}" data-s="${s.key}">✅</button>
          <button class="btn small red" data-actie="afkeuren" data-v="${v.id}" data-s="${s.key}">❌</button>` : ''}
        ${isManager ? `<button class="btn small" data-actie="toewijzen" data-v="${v.id}" data-s="${s.key}">👤</button>` : ''}
      </div>
    </div>`;
}

function bindStapActies() {
  document.querySelectorAll('[data-actie]').forEach(b => b.addEventListener('click', async () => {
    const { actie, v, s } = b.dataset;
    try {
      if (actie === 'inleveren') {
        const link = prompt('Link naar je oplevering (Drive, Frame.io, …) — mag leeg zijn:') ?? '';
        await api(`/api/videos/${v}/stappen/${s}/inleveren`, { method: 'POST', body: { opleverLink: link } });
      } else if (actie === 'goedkeuren') {
        await api(`/api/videos/${v}/stappen/${s}/goedkeuren`, { method: 'POST', body: {} });
      } else if (actie === 'afkeuren') {
        const feedback = prompt('Feedback voor de freelancer (wat moet anders?):');
        if (feedback === null) return;
        await api(`/api/videos/${v}/stappen/${s}/afkeuren`, { method: 'POST', body: { feedback } });
      } else if (actie === 'toewijzen') {
        const opties = CACHE.team.map((u, i) => `${i + 1}. ${u.naam} (${u.functie})`).join('\n');
        const keuze = prompt(`Wie krijgt deze stap?\n${opties}\n\nNummer (leeg = niemand):`);
        if (keuze === null) return;
        const gekozen = CACHE.team[Number(keuze) - 1];
        const deadline = prompt('Deadline (JJJJ-MM-DD, leeg = geen):') || null;
        await api(`/api/videos/${v}/stappen/${s}/toewijzen`, { method: 'POST', body: { assigneeId: gekozen?.id || null, deadline } });
      }
      VIEWS.pipeline();
    } catch (e) { alert(e.message); }
  }));
}

// ---------- instructiecentrum (inhoud) ----------
const INSTRUCTIES = {
  algemeen: `
    <h4>🧭 Zo werken we bij Bloop Universe</h4>
    <ol>
      <li><b>De pipeline is heilig.</b> Idee → Script → Voice/Avatar → Video-edit → Thumbnail → Upload. Jouw stap begint pas als de vorige stap is goedgekeurd — je krijgt automatisch bericht (hier en in Discord).</li>
      <li><b>Elke stap eindigt met een checkpoint.</b> Lever in via de knop "Inleveren" met een link naar je werk. De admin keurt goed of geeft feedback. Afgekeurd = één revisieronde, daarna overleg.</li>
      <li><b>Deadlines zijn afspraken.</b> Zie je dat je een deadline niet gaat halen? Meld het minimaal 24 uur van tevoren in Discord — dan schuiven we, zonder melding niet.</li>
      <li><b>Kanaalinstellingen zijn de wet.</b> Titelformat, thumbnailformat, toon en uploadfrequentie staan per kanaal vast onder "Kanalen". Wijk je af, dan alleen met expliciete goedkeuring vooraf.</li>
      <li><b>Communicatie loopt via Discord</b> in het kanaal van jouw stap. Geen losse appjes of DM's over werk — dan raakt informatie kwijt.</li>
      <li><b>Bestandsnamen:</b> <code>[kanaal]-[werktitel]-[stap]-[versie]</code>, bijv. <code>bloop-ruimtemysteries-script-v2</code>.</li>
    </ol>`,
  scriptwriter: `
    <h4>✍️ Instructies scriptwriter</h4>
    <ol>
      <li><b>Lees eerst het idee en de kanaalinstellingen</b> (onderwerp, toon, doelgroep, titelformat). Het script moet de titel en thumbnail waarmaken — geen clickbait die de video niet inlost.</li>
      <li><b>Hook (0–30 sec) is 80% van je werk.</b> Open met de kernbelofte van de titel, stel een vraag of schets het mysterie. Geen "welkom terug bij het kanaal".</li>
      <li><b>Structuur:</b> hook → context → opbouw in blokken met mini-cliffhangers elke 60–90 sec (voor AVD) → payoff → uitleiding met doorkijk naar een andere video.</li>
      <li><b>Schrijf voor het oor, niet voor het oog:</b> korte zinnen, actieve vorm, spreektaal. Lees hardop voor je inlevert.</li>
      <li><b>Lengte:</b> volg de doellengte van het kanaal (zie kanaalinstellingen); reken ±150 woorden per minuut voiceover.</li>
      <li><b>Markeer regie-aanwijzingen</b> voor de editor tussen [blokhaken]: [B-ROLL: raketlancering], [PAUZE], [NADRUK].</li>
      <li><b>Feiten checken:</b> elke claim moet klopbaar zijn; zet bronnen onderaan het script.</li>
      <li><b>Inleveren:</b> Google Doc-link via de knop "Inleveren", commentaarrechten aan. Eén revisieronde zit in de prijs.</li>
    </ol>`,
  editor: `
    <h4>🎞️ Instructies video-editor</h4>
    <ol>
      <li><b>Werk vanuit het goedgekeurde script + voiceover.</b> Volg de [regie-aanwijzingen] in het script; wijk alleen af als het de video sterker maakt en meld dat bij inlevering.</li>
      <li><b>Eerste 30 seconden:</b> hoogste tempo, beste beelden. Elke 3–5 seconden een visuele wissel (beeld, zoom, tekst of overlay) — hier winnen of verliezen we de kijker.</li>
      <li><b>Retentie-ritme:</b> geen shot langer dan ~6 sec zonder beweging of verandering; subtiele zoom op statische beelden; muziek onder de hele video, ducken onder voiceover (-15 tot -20 dB).</li>
      <li><b>Stijl per kanaal:</b> kleuren, lettertype en overlay-stijl staan in de kanaalinstellingen. Consistentie gaat boven creativiteit.</li>
      <li><b>Audio eerst:</b> voiceover schoon (geen clipping, ruis weg), loudness rond -14 LUFS voor YouTube.</li>
      <li><b>Rechten:</b> alleen stock/licentievrij materiaal van de afgesproken bibliotheken; bronvermelding in het projectbestand.</li>
      <li><b>Oplevering:</b> MP4 1080p (of 4K indien afgesproken), H.264, + projectbestand in de gedeelde map. Lever in via de knop met de link. Eén revisieronde zit in de prijs.</li>
    </ol>`,
  thumbnail: `
    <h4>🖼️ Instructies thumbnail-artiest</h4>
    <ol>
      <li><b>Volg het thumbnailformat van het kanaal</b> (zie kanaalinstellingen): vaste opbouw, kleurgebruik en tekstpositie. De thumbnail moet naast de andere video's van het kanaal als familie herkenbaar zijn.</li>
      <li><b>Eén idee per thumbnail.</b> Eén onderwerp/gezicht/object als blikvanger, maximaal 3–4 woorden tekst, en die tekst mag NIET letterlijk de titel herhalen — ze vullen elkaar aan.</li>
      <li><b>Leesbaar op 120 pixels:</b> check je ontwerp op telefoonformaat. Hoog contrast, dikke outlines, geen dunne letters.</li>
      <li><b>Curiosity gap:</b> de thumbnail roept een vraag op die alleen de video beantwoordt — maar belooft niets dat er niet in zit.</li>
      <li><b>Kijk naar de concurrenten</b> (lijst per kanaal): val op in de zoekresultaten náást hun thumbnails, kopieer ze niet.</li>
      <li><b>Specificaties:</b> 1280×720, JPG/PNG onder 2 MB, plus het bronbestand (PSD/Figma) in de gedeelde map.</li>
      <li><b>Lever 2 varianten</b> per video zodat we kunnen A/B-testen. Eén revisieronde zit in de prijs.</li>
    </ol>`
};

init();
