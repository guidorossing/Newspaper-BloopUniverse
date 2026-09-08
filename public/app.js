// Rossing T&M CMS — frontend (vanilla JS, no build step).
import * as calc from '/calc.js';
let ME = null;
let CACHE = { channels: [], team: [], brands: [] };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error (${res.status})`);
  return data;
}

function magMinstens(rol) {
  const niveaus = { admin: 0, manager: 1, freelancer: 2 };
  return ME && niveaus[ME.rol] <= niveaus[rol];
}

// ---------- sign-in / bootstrap ----------
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
    const nieuw = prompt('First sign-in: choose a new password (at least 8 characters)');
    if (nieuw && nieuw.length >= 8) api('/api/me/password', { method: 'POST', body: { nieuw } });
  }
  openTab('dashboard');
}

window.openTab = openTab;   // the dashboard buttons call this inline
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
        <div class="card stat"><div class="big">${d.kanalen}</div><div class="muted">Channels</div></div>
        <div class="card stat"><div class="big">${d.videosInProductie}</div><div class="muted">Videos in production</div></div>
        <div class="card stat"><div class="big">${d.videosAfgerond}</div><div class="muted">Videos finished</div></div>
        <div class="card stat"><div class="big">${d.ideeenOpVoorraad ?? 0}</div><div class="muted">Ideas in stock</div></div>
        <div class="card stat"><div class="big">${d.openTodos}</div><div class="muted">Open to-dos</div></div>
        ${d.totalen ? `
          <div class="card stat"><div class="big">${eur(d.totalen.kostenPerMaand)}</div><div class="muted">Production cost / month</div></div>
          <div class="card stat"><div class="big">${nl(d.totalen.videosPerMaand, 0)}</div><div class="muted">Videos / month planned</div></div>
          <div class="card stat"><div class="big">${nl(d.totalen.urenPerWeek, 0)}</div><div class="muted">Hours of work per week</div></div>` : ''}
      </div>
      ${d.totalen?.perMerk?.length > 1 ? `
        <h3>🏷️ Per brand</h3>
        <div class="card">
          ${d.totalen.perMerk.map(m => `
            <div class="reken-rij">
              <span><b>${esc(m.naam)}</b></span>
              <span class="muted">${m.kanalen} channel${m.kanalen === 1 ? '' : 's'} · ${nl(m.videosPerMaand, 1)} videos/mo · ${nl(m.urenPerWeek, 0)} hrs/wk</span>
              <span class="muted">${eur(m.kostenPerMaand)} cost/mo</span>
              <b class="${m.margePerMaand >= 0 ? 'goed' : 'slecht'}">${eur(m.margePerMaand)}</b>
            </div>`).join('')}
        </div>` : ''}
      ${d.totalen?.perKanaal?.length ? `
        <h3>💶 Cost and capacity per channel</h3>
        <div class="card">
          ${d.totalen.perKanaal.map(k => `
            <div class="reken-rij">
              <span><b>${esc(k.naam)}</b></span>
              <span class="muted">${nl(k.videosPerMaand, 1)} videos/mo · ${nl(k.urenPerWeek, 0)} hrs/wk</span>
              <span class="muted">${eur(k.kostprijsPerVideo, 2)} per video</span>
              <span class="muted">break-even ${k.breakEvenViews == null ? '—' : nl(k.breakEvenViews, 0) + ' views'}</span>
              <b class="${k.margePerMaand >= 0 ? 'goed' : 'slecht'}">${eur(k.margePerMaand)}</b>
            </div>`).join('')}
          <div class="reken-rij totaal">
            <span><b>All channels combined</b></span>
            <span class="muted">${eur(d.totalen.kostenPerMaand)} cost/mo · ${eur(d.totalen.omzetPerMaand)} expected revenue</span>
            <b class="${d.totalen.margePerMaand >= 0 ? 'goed' : 'slecht'}">${eur(d.totalen.margePerMaand)}</b>
          </div>
        </div>` : ''}
      ${d.ideeenAlarm?.length ? `
        <div class="card" style="border-color:var(--red)">
          <b>💡 Idea stock critical — the pipeline is about to run dry:</b>
          ${d.ideeenAlarm.map(v => `
            <div class="todo-rij">
              <span class="badge critical">${v.wekenVoorraad ?? 0} wk</span>
              <span><b>${esc(v.kanaal)}</b> — ${v.beschikbaar} ideas, ${v.perWeek}×/week needed</span>
              <span style="margin-left:auto"><button class="btn small" onclick="openTab('ideeen')">Go to idea bank →</button></span>
            </div>`).join('')}
        </div>` : ''}
      ${d.openCheckpoints.length ? `
        <h3>⏸️ Waiting for your approval</h3>
        <div class="card">${d.openCheckpoints.map(c => `
          <div class="todo-rij">
            <span class="badge awaiting_approval">${esc(c.stap)}</span>
            <span><b>${esc(c.werktitel)}</b> — ${esc(c.kanaal)}</span>
            ${c.opleverLink ? `<a href="${esc(c.opleverLink)}" target="_blank" class="muted">view delivery</a>` : ''}
            <span style="margin-left:auto"><button class="btn small" onclick="openTab('pipeline')">Go to pipeline →</button></span>
          </div>`).join('')}
        </div>` : ''}
      ${d.deadlines.length ? `
        <h3>⏰ Deadlines</h3>
        <div class="card">${d.deadlines.map(x => `
          <div class="todo-rij">
            <span class="badge ${x.urgentie}">${x.urgentie === 'overdue' ? 'OVERDUE' : 'WITHIN 24H'}</span>
            <span><b>${esc(x.werktitel)}</b> · ${esc(x.stap)} · ${esc(x.assignee)} · deadline ${esc(x.deadline)}</span>
          </div>`).join('')}
        </div>` : ''}
      ${d.activity.length ? `
        <h3>Recent activity</h3>
        <div class="card">${d.activity.map(a => `
          <div class="todo-rij"><span class="muted">${new Date(a.ts).toLocaleString('en-GB')}</span><span><b>${esc(a.user)}</b> ${esc(a.tekst)}</span></div>`).join('')}
        </div>` : ''}`;
  },

  kanalen: async () => {
    const [{ channels }, { brands }] = await Promise.all([api('/api/channels'), api('/api/brands')]);
    CACHE.channels = channels;
    CACHE.brands = brands;
    const isManager = magMinstens('manager');
    // Channels are shown grouped by brand, with the unassigned ones last.
    const groepen = [...brands.map(b => ({ brand: b, kanalen: channels.filter(c => c.brandId === b.id) })),
                     { brand: null, kanalen: channels.filter(c => !c.brandId || !brands.some(b => b.id === c.brandId)) }]
      .filter(g => g.kanalen.length);
    $('#content').innerHTML = `
      <h2>Channels</h2>
      ${groepen.map(g => `
        ${brands.length ? `<h3>${g.brand ? '🏷️ ' + esc(g.brand.naam) : 'Without a brand'}</h3>` : ''}
        ${g.kanalen.map(c => kanaalKaart(c, isManager)).join('')}`).join('')
        || '<p class="muted">No channels yet.</p>'}
      ${isManager ? `
        <h3>Brands</h3>
        <div class="card">
          <p class="muted" style="margin-top:0">Group channels under a brand or client. The dashboard then reports cost and margin per brand as well.</p>
          ${brands.map(b => `
            <div class="todo-rij">
              <b>🏷️ ${esc(b.naam)}</b>
              <span class="muted">${channels.filter(c => c.brandId === b.id).length} channels${b.notities ? ' · ' + esc(b.notities) : ''}</span>
              <span style="margin-left:auto"><button class="btn small red" data-delbrand="${b.id}">🗑️</button></span>
            </div>`).join('') || '<p class="muted">No brands yet.</p>'}
          <div class="form-row" style="margin-top:.6rem">
            <input id="b-naam" placeholder="Brand or client name">
            <input id="b-notities" placeholder="Note (optional)">
            <button class="btn primary" id="b-add">Add brand</button>
          </div>
          <span class="error" id="b-error"></span>
        </div>
        <h3>New channel</h3><div class="card">${kanaalForm({})}</div>` : ''}`;
    if (isManager) {
      bindKanaalForms();
      $('#b-add').addEventListener('click', async () => {
        try {
          await api('/api/brands', { method: 'POST', body: { naam: $('#b-naam').value, notities: $('#b-notities').value } });
          VIEWS.kanalen();
        } catch (e) { $('#b-error').textContent = e.message; }
      });
      document.querySelectorAll('[data-delbrand]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this brand? Its channels stay, they just lose the label.')) return;
        try { await api(`/api/brands/${b.dataset.delbrand}`, { method: 'DELETE' }); VIEWS.kanalen(); }
        catch (e) { alert(e.message); }
      }));
    }
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
      <p class="muted">Idea → Script → Voice/Avatar → Video edit → Thumbnail → Upload. Every step is a checkpoint: work only moves to the next freelancer after approval.</p>
      ${isManager ? `
        <div class="card">
          <h3 style="margin-top:0">🎬 Start a new video</h3>
          <div class="form-row">
            <div><label>Channel</label><select id="nv-kanaal">${channels.map(c => `<option value="${c.id}">${esc(c.naam)}</option>`).join('')}</select></div>
            <div><label>Working title</label><input id="nv-titel" placeholder="e.g. Top 10 space mysteries"></div>
            <div><label>Planned publish date</label><input id="nv-publicatie" type="date"></div>
          </div>
          <label>Idea / short description</label><textarea id="nv-idee"></textarea>
          <div style="margin-top:.7rem"><button class="btn primary" id="nv-start">Start in pipeline</button> <span class="error" id="nv-error"></span></div>
        </div>` : ''}
      ${actief.map(v => videoKaart(v, isManager)).join('') || '<p class="muted">No videos in production.</p>'}
      ${klaar.length ? `<h3>✅ Finished (${klaar.length})</h3>${klaar.map(v => `<div class="card"><b>${esc(v.werktitel)}</b> — ${esc(kanaalNaam(v.channelId))} <span class="badge approved">finished</span></div>`).join('')}` : ''}`;
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
      <h2>To-dos</h2>
      <div class="card">
        <div class="form-row">
          <input id="todo-tekst" placeholder="New to-do…">
          <select id="todo-kanaal"><option value="">— general —</option>${channels.map(c => `<option value="${c.id}">${esc(c.naam)}</option>`).join('')}</select>
          <input id="todo-deadline" type="date">
          <button class="btn primary" id="todo-add">Add</button>
        </div>
      </div>
      <div class="card" id="todo-lijst">
        ${todos.map(t => `
          <div class="todo-rij ${t.klaar ? 'done' : ''}">
            <input type="checkbox" ${t.klaar ? 'checked' : ''} data-toggle="${t.id}">
            <span class="tekst">${esc(t.tekst)}</span>
            ${t.channelId ? `<span class="badge">${esc(kanaalNaam(t.channelId))}</span>` : ''}
            ${t.deadline ? `<span class="muted">📅 ${esc(t.deadline)}</span>` : ''}
          </div>`).join('') || '<p class="muted">No to-dos.</p>'}
      </div>`;
    $('#todo-add').addEventListener('click', async () => {
      if (!$('#todo-tekst').value) return;
      await api('/api/todos', { method: 'POST', body: { tekst: $('#todo-tekst').value, channelId: $('#todo-kanaal').value || null, deadline: $('#todo-deadline').value || null } });
      VIEWS.todos();
    });
    document.querySelectorAll('[data-toggle]').forEach(cb =>
      cb.addEventListener('change', async () => { await api(`/api/todos/${cb.dataset.toggle}/toggle`, { method: 'POST' }); VIEWS.todos(); }));
  },

  ideeen: async () => {
    const [{ ideeen, voorraad }, { channels }] = await Promise.all([api('/api/ideeen'), api('/api/channels')]);
    CACHE.channels = channels;
    const isManager = magMinstens('manager');
    const asLabels = {
      outlierPotentie: 'Outlier potential',
      zoekvolume: 'Search volume',
      productiegemak: 'Ease of production',
      kanaalfit: 'Channel fit'
    };
    const open = ideeen.filter(i => i.status === 'new' || i.status === 'approved');
    const rest = ideeen.filter(i => i.status === 'rejected' || i.status === 'promoted');
    $('#content').innerHTML = `
      <h2>💡 Idea bank</h2>
      <p class="muted">The stock that sits in front of the pipeline. Anyone can pitch; you score on four axes and promote the best ideas into production. That way the pipeline never runs dry and the upload frequency holds.</p>

      <div class="card">
        <h3 style="margin-top:0">📦 Stock per channel</h3>
        ${voorraad.map(v => `
          <div class="kalender-rij">
            <span class="badge ${v.status}">${v.wekenVoorraad ?? '?'} wk</span>
            <b>${esc(v.kanaal)}</b>
            <span class="muted">${v.beschikbaar} ideas on the shelf · ${v.perWeek}×/week needed${v.status === 'critical' ? ' — <b>time to brainstorm</b>' : ''}</span>
          </div>`).join('') || '<p class="muted">No channels yet.</p>'}
      </div>

      <div class="card">
        <h3 style="margin-top:0">➕ Pitch an idea</h3>
        <div class="form-row">
          <div><label>Title / working title</label><input id="i-titel" placeholder="e.g. The 5 strangest signals from space"></div>
          <div><label>Channel</label><select id="i-kanaal"><option value="">— not decided yet —</option>${channels.map(c => `<option value="${c.id}">${esc(c.naam)}</option>`).join('')}</select></div>
        </div>
        <label>Why is this a good idea?</label><textarea id="i-omschrijving" placeholder="What is the hook? Who is it for? What makes it different from what already exists?"></textarea>
        <label>Source / inspiration (link to the outlier or competitor)</label><input id="i-bron" placeholder="https://youtube.com/watch?v=...">
        <div style="margin-top:.7rem"><button class="btn primary" id="i-add">Add idea</button> <span class="error" id="i-error"></span></div>
      </div>

      <h3>On the shelf (${open.length})</h3>
      ${open.map(i => ideeKaart(i, isManager, asLabels)).join('') || '<p class="muted">No ideas yet — pitch one above.</p>'}

      ${rest.length ? `<h3>Archive (${rest.length})</h3>${rest.map(i => `
        <div class="card">
          <b>${esc(i.titel)}</b> <span class="badge ${i.status}">${i.status}</span>
          ${i.score != null ? `<span class="muted"> · score ${i.score}/5</span>` : ''}
          <span class="muted"> · ${esc(kanaalNaam(i.channelId))}</span>
        </div>`).join('')}` : ''}`;

    $('#i-add').addEventListener('click', async () => {
      if (!$('#i-titel').value.trim()) { $('#i-error').textContent = 'Title is required'; return; }
      try {
        await api('/api/ideeen', { method: 'POST', body: {
          titel: $('#i-titel').value, channelId: $('#i-kanaal').value || null,
          omschrijving: $('#i-omschrijving').value, bron: $('#i-bron').value } });
        VIEWS.ideeen();
      } catch (e) { $('#i-error').textContent = e.message; }
    });
    bindIdeeActies();
  },

  kalender: async () => {
    const [{ weken, inGevaar }, { channels }] = await Promise.all([api('/api/kalender'), api('/api/channels')]);
    CACHE.channels = channels;
    $('#content').innerHTML = `
      <h2>📅 Publishing calendar</h2>
      <p class="muted">Watches per channel whether the upload frequency is being met. Give videos a publish date (Pipeline → edit) and the calendar works out the rest. When a week is at risk, a Discord alert goes out automatically in the morning.</p>
      ${inGevaar.length ? `
        <div class="card" style="border-color:var(--red)">
          <b>⚠️ Schedule at risk:</b>
          ${inGevaar.map(p => `<div class="todo-rij"><span class="badge empty">${p.ingepland}/${p.benodigd}</span><span><b>${esc(p.kanaal)}</b> — week ${esc(p.week)}</span></div>`).join('')}
        </div>` : '<div class="card" style="border-color:var(--green)">✅ Every channel is on track for this week and next.</div>'}
      ${weken.map(w => `
        <div class="card kalender-week">
          <h3 style="margin-top:0">Week ${esc(w.maandag)} to ${esc(w.zondag)}</h3>
          ${w.kanalen.map(k => `
            <div class="kalender-rij">
              <span class="badge ${k.status}">${k.gepubliceerd + k.gepland}/${k.benodigd}</span>
              <b>${esc(k.kanaal)}</b>
              <span class="videos">${k.videos.map(v => `${v.afgerond ? '✅' : '🎬'} ${esc(v.werktitel)} (${esc(v.datum)})`).join(' · ') || 'nothing scheduled'}</span>
            </div>`).join('') || '<p class="muted">No channels yet.</p>'}
        </div>`).join('')}`;
  },

  templates: async () => {
    const [{ templates }, { channels }] = await Promise.all([api('/api/templates'), api('/api/channels')]);
    CACHE.channels = channels;
    const isManager = magMinstens('manager');
    const types = { titel: '📝 Title formulas', thumbnail: '🖼️ Thumbnail concepts', hook: '🪝 Hooks', beschrijving: '📄 Descriptions', script: '✍️ Script structures' };
    $('#content').innerHTML = `
      <h2>🧩 Template library</h2>
      <p class="muted">Proven title formulas, thumbnail concepts, hooks and descriptions. Did something work well (high CTR or AVD)? Save it here — that is how the system gets smarter every month.</p>
      ${Object.entries(types).map(([type, kop]) => {
        const items = templates.filter(t => t.type === type);
        if (!items.length) return '';
        return `<h3>${kop}</h3>${items.map(t => `
          <div class="card">
            <b>${esc(t.naam)}</b> ${t.channelId ? `<span class="badge">${esc(kanaalNaam(t.channelId))}</span>` : '<span class="badge">all channels</span>'}
            ${isManager ? `<button class="btn small red" style="float:right" data-deltemplate="${t.id}">🗑️</button>` : ''}
            <p style="white-space:pre-wrap;margin-top:.4rem">${esc(t.inhoud)}</p>
            ${t.prestatie ? `<p class="muted" style="font-size:.82rem">📈 ${esc(t.prestatie)}</p>` : ''}
          </div>`).join('')}`;
      }).join('') || '<p class="muted">No templates yet.</p>'}
      ${isManager ? `
      <h3>New template</h3>
      <div class="card">
        <div class="form-row">
          <div><label>Type</label><select id="t-type">${Object.keys(types).map(t => `<option>${t}</option>`).join('')}</select></div>
          <div><label>Name</label><input id="t-naam" placeholder="e.g. Number + mystery + curiosity gap"></div>
          <div><label>Channel</label><select id="t-kanaal"><option value="">all channels</option>${channels.map(c => `<option value="${c.id}">${esc(c.naam)}</option>`).join('')}</select></div>
        </div>
        <label>Content / formula</label><textarea id="t-inhoud" placeholder="e.g. [Number] [topics] that [unexpected consequence] — max 55 characters"></textarea>
        <label>Performance note (why does this work?)</label><input id="t-prestatie" placeholder="e.g. 8.1% CTR on video X">
        <div style="margin-top:.7rem"><button class="btn primary" id="t-add">Save</button> <span class="error" id="t-error"></span></div>
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
      if (confirm('Delete this template?')) {
        await api(`/api/templates/${b.dataset.deltemplate}`, { method: 'DELETE' });
        VIEWS.templates();
      }
    }));
  },

  instructies: () => {
    $('#content').innerHTML = `
      <h2>📚 Instruction centre</h2>
      <p class="muted">Fixed working instructions per role. New team member? Read this first, then start.</p>
      <div class="instructie-nav">
        <button class="btn" data-inst="scriptwriter">✍️ Scriptwriter</button>
        <button class="btn" data-inst="editor">🎞️ Video editor</button>
        <button class="btn" data-inst="thumbnail">🖼️ Thumbnail artist</button>
        <button class="btn" data-inst="algemeen">🧭 House rules</button>
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
      <p class="muted">All channel information and credentials in one place. Secrets are stored encrypted; only the admin can reveal them, and every reveal is logged.</p>
      <div class="card">
        <table>
          <tr><th>Label</th><th>Channel</th><th>Username</th><th>URL</th><th>Notes</th><th></th></tr>
          ${entries.map(e => `
            <tr>
              <td><b>${esc(e.label)}</b></td>
              <td>${esc(kanaalNaam(e.channelId))}</td>
              <td>${esc(e.gebruikersnaam)}</td>
              <td>${e.url ? `<a href="${esc(e.url)}" target="_blank">link</a>` : ''}</td>
              <td class="muted">${esc(e.notities)}</td>
              <td>
                ${magOnthullen ? `<button class="btn small" data-onthul="${e.id}">👁️ Show secret</button>
                <button class="btn small red" data-verwijder="${e.id}">🗑️</button>` : ''}
              </td>
            </tr>`).join('') || '<tr><td colspan="6" class="muted">No entries yet.</td></tr>'}
        </table>
      </div>
      ${magOnthullen ? `
      <h3>New entry</h3>
      <div class="card">
        <div class="form-row">
          <div><label>Label</label><input id="v-label" placeholder="e.g. YouTube login main channel"></div>
          <div><label>Channel</label><select id="v-kanaal"><option value="">—</option>${channels.map(c => `<option value="${c.id}">${esc(c.naam)}</option>`).join('')}</select></div>
          <div><label>Username / email</label><input id="v-user"></div>
          <div><label>Password / secret</label><input id="v-secret" type="password"></div>
          <div><label>URL</label><input id="v-url" placeholder="https://…"></div>
          <div><label>Notes</label><input id="v-notities" placeholder="e.g. 2FA on the admin phone"></div>
        </div>
        <div style="margin-top:.7rem"><button class="btn primary" id="v-add">Save</button> <span class="error" id="v-error"></span></div>
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
      alert(`Secret:\n\n${secret || '(empty)'}\n\nThis reveal has been logged.`);
    }));
    document.querySelectorAll('[data-verwijder]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Permanently delete this vault entry?')) {
        await api(`/api/vault/${b.dataset.verwijder}`, { method: 'DELETE' });
        VIEWS.vault();
      }
    }));
  },

  team: async () => {
    const { users, rollen, functies } = await api('/api/users');
    const isAdmin = magMinstens('admin');
    $('#content').innerHTML = `
      <h2>👥 Team &amp; access control</h2>
      <p class="muted">admin = everything · manager = management without secrets · freelancer = pipeline, to-dos and instructions only.</p>
      <div class="card">
        <table>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Job</th><th></th></tr>
          ${users.map(u => `
            <tr>
              <td><b>${esc(u.naam)}</b></td><td class="muted">${esc(u.email)}</td>
              <td><span class="badge">${esc(u.rol)}</span></td><td>${esc(u.functie)}</td>
              <td>${u.discordUserId ? '<span class="badge" title="Discord linked">🎮 Discord ✓</span>' : (isAdmin ? `<button class="btn small" data-koppelcode="${u.id}">🎮 Link code</button>` : '')}
              ${isAdmin && u.id !== ME.id ? `<button class="btn small red" data-deluser="${u.id}">🗑️</button>` : ''}</td>
            </tr>`).join('')}
        </table>
      </div>
      ${isAdmin ? `
      <h3>New team member</h3>
      <div class="card">
        <div class="form-row">
          <div><label>Name</label><input id="u-naam"></div>
          <div><label>Email</label><input id="u-email" type="email"></div>
          <div><label>Temporary password</label><input id="u-pass"></div>
          <div><label>Role</label><select id="u-rol">${rollen.map(r => `<option ${r === 'freelancer' ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
          <div><label>Job</label><select id="u-functie">${functies.map(f => `<option>${f}</option>`).join('')}</select></div>
        </div>
        <div style="margin-top:.7rem"><button class="btn primary" id="u-add">Add</button> <span class="error" id="u-error"></span></div>
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
      alert(`Link code: ${code}\n\n${uitleg}`);
    }));
    document.querySelectorAll('[data-deluser]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Delete this user? Their access ends immediately.')) {
        await api(`/api/users/${b.dataset.deluser}`, { method: 'DELETE' });
        VIEWS.team();
      }
    }));
  },

  payouts: async () => {
    const gekozen = CACHE.payoutMaand || '';
    const d = await api('/api/payouts' + (gekozen ? `?maand=${gekozen}` : ''));
    CACHE.payoutMaand = d.maand;
    const isAdmin = magMinstens('admin');
    const maandNaam = m => new Date(m + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    $('#content').innerHTML = `
      <h2>💶 Payouts</h2>
      <p class="muted">What each freelancer earned in a month. A step counts once it has been <b>approved</b> — work still awaiting approval is not owed yet. The amount comes from the fee set on that channel for that step.</p>

      <div class="card">
        <div class="form-row">
          <div><label>Month</label><select id="p-maand">
            ${(d.maanden.length ? d.maanden : [d.maand]).map(m => `<option value="${m}" ${m === d.maand ? 'selected' : ''}>${maandNaam(m)}</option>`).join('')}
          </select></div>
          <div><label>Total this month</label><div class="reken-groot" style="font-size:1.4rem">${eur(d.totaal, 2)}</div></div>
          <div><label>Still to pay</label><div class="reken-groot ${d.nogTeBetalen > 0 ? 'slecht' : 'goed'}" style="font-size:1.4rem">${eur(d.nogTeBetalen, 2)}</div></div>
        </div>
      </div>

      ${d.personen.map(p => `
        <div class="card">
          <div class="todo-rij">
            <b>${esc(p.naam)}</b>
            <span class="badge">${esc(p.functie)}</span>
            ${p.betaald ? '<span class="badge approved">paid</span>' : ''}
            <span style="margin-left:auto"><b>${eur(p.totaal, 2)}</b></span>
            ${isAdmin ? `<button class="btn small ${p.betaald ? '' : 'green'}" data-betaal="${p.userId}:${p.totaal}">${p.betaald ? 'Undo' : 'Mark as paid'}</button>` : ''}
          </div>
          <details style="margin-top:.4rem">
            <summary class="muted" style="cursor:pointer">${p.regels.length} step${p.regels.length === 1 ? '' : 's'} — show the breakdown</summary>
            ${p.regels.map(r => `
              <div class="reken-rij">
                <span class="muted">${esc(r.datum)}</span>
                <span>${esc(r.stap)} — <b>${esc(r.video)}</b></span>
                <span class="muted">${esc(r.kanaal)}</span>
                <b>${eur(r.bedrag, 2)}</b>
              </div>`).join('')}
          </details>
        </div>`).join('') || '<p class="muted">Nothing was approved in this month yet.</p>'}

      ${d.zonderToewijzing.regels.length ? `
        <div class="card" style="border-color:var(--yellow)">
          <b>⚠️ ${eur(d.zonderToewijzing.totaal, 2)} on steps without an assignee</b>
          <p class="muted" style="margin:.3rem 0 0">Someone did this work, but the step was never assigned, so the system cannot tell who to pay. Assign the step in the pipeline and it moves into the right person's total.</p>
          ${d.zonderToewijzing.regels.map(r => `
            <div class="reken-rij"><span class="muted">${esc(r.datum)}</span><span>${esc(r.stap)} — ${esc(r.video)}</span><b>${eur(r.bedrag, 2)}</b></div>`).join('')}
        </div>` : ''}`;

    $('#p-maand').addEventListener('change', e => { CACHE.payoutMaand = e.target.value; VIEWS.payouts(); });
    document.querySelectorAll('[data-betaal]').forEach(b => b.addEventListener('click', async () => {
      const [userId, bedrag] = b.dataset.betaal.split(':');
      await api('/api/payouts/markeer', { method: 'POST', body: { maand: d.maand, userId, bedrag: Number(bedrag) } });
      VIEWS.payouts();
    }));
  },

  rapport: async () => {
    const dagen = CACHE.rapportDagen || 90;
    const r = await api(`/api/rapport?dagen=${dagen}`);
    const dag = n => n == null ? '—' : `${nl(n, 1)} d`;
    const pct = n => n == null ? '—' : `${n}%`;
    const tabel = (kop, rijen, eersteKop) => `
      <h3>${kop}</h3>
      <div class="card">
        <table>
          <tr><th>${eersteKop}</th><th>Finished</th><th>Avg. lead time</th><th>Needed a revision</th><th>On time</th></tr>
          ${rijen.map(g => `
            <tr>
              <td><b>${esc(g.naam)}</b></td>
              <td>${g.afgerond}</td>
              <td>${dag(g.gemDoorlooptijd)}</td>
              <td>${pct(g.revisiePct)}${g.revisies ? ` <span class="muted">(${g.revisies}×)</span>` : ''}</td>
              <td>${pct(g.opTijdPct)}</td>
            </tr>`).join('') || `<tr><td colspan="5" class="muted">Nothing finished in this period.</td></tr>`}
        </table>
      </div>`;

    $('#content').innerHTML = `
      <h2>📈 Throughput and revisions</h2>
      <p class="muted">Where the production actually stalls. Lead time is measured in calendar days from the moment a step opens until it is approved — a script that sits untouched for four days costs the schedule four days, whoever is at fault.</p>

      <div class="card">
        <div class="form-row">
          <div><label>Period</label><select id="r-dagen">
            ${[30, 90, 180, 365].map(n => `<option value="${n}" ${n === dagen ? 'selected' : ''}>last ${n} days</option>`).join('')}
          </select></div>
          <div><label>Steps finished</label><div class="reken-groot" style="font-size:1.4rem">${r.totaal.afgerond}</div></div>
          <div><label>Videos finished</label><div class="reken-groot" style="font-size:1.4rem">${r.videosAfgerond}</div></div>
          <div><label>Idea to upload</label><div class="reken-groot" style="font-size:1.4rem">${dag(r.videoDoorlooptijd)}</div></div>
        </div>
      </div>

      ${r.knelpunt ? `
        <div class="card" style="border-color:var(--yellow)">
          <b>🔎 Slowest step: ${esc(r.knelpunt.naam)}</b>
          <p class="muted" style="margin:.3rem 0 0">Takes ${dag(r.knelpunt.gemDoorlooptijd)} on average${r.knelpunt.revisiePct ? `, and ${r.knelpunt.revisiePct}% of them needed a revision` : ''}. If you want to upload more often, this is the step to fix first — adding people anywhere else will not help.</p>
        </div>` : ''}

      ${tabel('Per step', r.perStap, 'Step')}
      ${tabel('Per person', r.perPersoon, 'Person')}
      ${tabel('Per channel', r.perKanaal, 'Channel')}`;

    $('#r-dagen').addEventListener('change', e => { CACHE.rapportDagen = Number(e.target.value); VIEWS.rapport(); });
  },

  instellingen: async () => {
    const { settings } = await api('/api/settings');
    $('#content').innerHTML = `
      <h2>⚙️ Settings</h2>
      <div class="card">
        <h3 style="margin-top:0">Discord integration</h3>
        <p class="muted">Create a webhook in your Discord server (Server Settings → Integrations → Webhooks, for example for #production-updates) and paste the URL below. The CMS then posts automatically on every checkpoint, approval, rejection and new video. See docs/discord-integration.md for the full bot with approval buttons.</p>
        <label>Webhook URL</label>
        <input id="s-webhook" value="${esc(settings.discordWebhookUrl)}" placeholder="https://discord.com/api/webhooks/…">
        <label><input type="checkbox" id="s-enabled" style="width:auto" ${settings.discordEnabled ? 'checked' : ''}> Notifications on</label>
        <div style="margin-top:.7rem">
          <button class="btn primary" id="s-save">Save all settings</button>
          <button class="btn" id="s-test">Send a test</button>
          <span id="s-msg" class="muted"></span>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Discord bot</h3>
        <p class="muted">The bot in <code>discord-bot/</code> signs in to the CMS with this token. Generate it once and put it in the bot's <code>.env</code> as <code>CMS_BOT_TOKEN</code>. Generating a new one invalidates the old token.</p>
        <p>${settings.botToken ? `Current token: <code>${esc(settings.botToken)}</code>` : '<span class="muted">No token generated yet.</span>'}</p>
        <button class="btn" id="s-bottoken">🎮 Generate ${settings.botToken ? 'a new ' : 'a '}bot token</button>
      </div>
      <div class="card">
        <h3 style="margin-top:0">YouTube API</h3>
        <p class="muted">For automatic KPIs (views, AVD, revenue). Create an OAuth client in the Google Cloud Console (see docs/youtube-api.md), fill it in below, then link each channel from the Channels tab. YouTube does not expose thumbnail CTR through the API — you enter that by hand on a video.</p>
        <div class="form-row">
          <div><label>Client ID</label><input id="s-ytclient" value="${esc(settings.youtube?.clientId || '')}" placeholder="xxxx.apps.googleusercontent.com"></div>
          <div><label>Client secret ${settings.youtube?.clientSecretIngesteld ? '(set — only fill in to replace it)' : ''}</label><input id="s-ytsecret" type="password" placeholder="${settings.youtube?.clientSecretIngesteld ? '••••••••' : 'GOCSPX-…'}"></div>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Email notifications</h3>
        <p class="muted">Sends the same notices as Discord, from your own mailbox — no third-party service involved. Strato's outgoing server is <code>smtp.strato.com</code>, port <code>465</code> with implicit TLS, and the username is the full email address. The password is stored encrypted, the same way as the vault.</p>
        <div class="form-row">
          <div><label>SMTP server</label><input id="m-host" value="${esc(settings.smtp?.host || '')}" placeholder="smtp.strato.com"></div>
          <div><label>Port</label><input id="m-port" type="number" value="${settings.smtp?.port || 465}"></div>
          <div><label>Username</label><input id="m-user" value="${esc(settings.smtp?.user || '')}" placeholder="cms@rossingtm.com"></div>
          <div><label>Password ${settings.smtp?.wachtwoordIngesteld ? '(set — only fill in to replace it)' : ''}</label><input id="m-pass" type="password" placeholder="${settings.smtp?.wachtwoordIngesteld ? '••••••••' : ''}"></div>
          <div><label>Sender address</label><input id="m-from" value="${esc(settings.smtp?.from || '')}" placeholder="cms@rossingtm.com"></div>
        </div>
        <label><input type="checkbox" id="m-secure" style="width:auto" ${settings.smtp?.secure !== false ? 'checked' : ''}> Implicit TLS (leave on for port 465, off for 587)</label>
        <label><input type="checkbox" id="m-enabled" style="width:auto" ${settings.smtp?.enabled ? 'checked' : ''}> Email notifications on</label>
        <div style="margin-top:.7rem">
          <button class="btn" id="m-test">Send a test to ${esc(ME.email)}</button>
          <span id="m-msg" class="muted"></span>
        </div>
        <p class="muted" style="font-size:.8rem;margin-bottom:0">Save with the button at the top before testing — the test uses what is stored, not what is on screen.</p>
      </div>

      <div class="card">
        <h3 style="margin-top:0">QC checklist (before upload)</h3>
        <p class="muted">One line per check. New videos get this list; the upload step can only be submitted once everything is ticked off.</p>
        <textarea id="s-qc" style="min-height:140px">${esc((settings.qcItems || []).join('\n'))}</textarea>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Change password</h3>
        <div class="form-row">
          <input id="pw-nieuw" type="password" placeholder="New password (at least 8 characters)">
          <button class="btn" id="pw-save">Change</button>
        </div>
      </div>`;
    $('#s-save').addEventListener('click', async () => {
      await api('/api/settings', { method: 'PUT', body: {
        discordWebhookUrl: $('#s-webhook').value,
        discordEnabled: $('#s-enabled').checked,
        qcItems: $('#s-qc').value.split('\n').map(s => s.trim()).filter(Boolean),
        youtube: { clientId: $('#s-ytclient').value, clientSecret: $('#s-ytsecret').value },
        smtp: {
          enabled: $('#m-enabled').checked, host: $('#m-host').value, port: $('#m-port').value,
          secure: $('#m-secure').checked, user: $('#m-user').value, from: $('#m-from').value,
          pass: $('#m-pass').value
        }
      } });
      $('#m-pass').value = '';
      $('#s-msg').textContent = 'Saved ✔';
    });
    $('#s-bottoken').addEventListener('click', async () => {
      if (!confirm('Generate a new bot token? Any existing token stops working immediately.')) return;
      await api('/api/settings/bot-token', { method: 'POST' });
      VIEWS.instellingen();
    });
    $('#s-test').addEventListener('click', async () => {
      try { await api('/api/settings/discord-test', { method: 'POST' }); $('#s-msg').textContent = 'Test message sent ✔'; }
      catch (e) { $('#s-msg').textContent = e.message; }
    });
    $('#m-test').addEventListener('click', async () => {
      $('#m-msg').textContent = 'sending…';
      try { await api('/api/settings/mail-test', { method: 'POST' }); $('#m-msg').textContent = 'Sent ✔ — check your inbox'; }
      catch (e) { $('#m-msg').textContent = e.message; }
    });
    $('#pw-save').addEventListener('click', async () => {
      try { await api('/api/me/password', { method: 'POST', body: { nieuw: $('#pw-nieuw').value } }); $('#pw-nieuw').value = ''; alert('Password changed'); }
      catch (e) { alert(e.message); }
    });
  }
};

// ---------- helpers: channels ----------
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
        <div><b>Upload frequency</b><br>${k.uploadFrequentiePerWeek ?? '?'}× per week ${c.uploadDagen ? `(${esc(c.uploadDagen)})` : ''}</div>
        ${k.avdMinuten != null ? `<div><b>Target AVD</b><br>${k.avdMinuten} min</div>` : ''}
        ${k.ctrPct != null ? `<div><b>Target CTR</b><br>${k.ctrPct}%</div>` : ''}
        ${k.levertijdDagen != null ? `<div><b>Lead time</b><br>${k.levertijdDagen} days per video</div>` : ''}
        ${k.omzetgroeiPctPerMaand != null ? `<div><b>Target revenue growth</b><br>${k.omzetgroeiPctPerMaand}% per month</div>` : ''}
      </div>
      ${c.titelFormat ? `<p><b>Title format:</b> <span class="muted">${esc(c.titelFormat)}</span></p>` : ''}
      ${c.thumbnailFormat ? `<p><b>Thumbnail format:</b> <span class="muted">${esc(c.thumbnailFormat)}</span></p>` : ''}
      ${c.concurrenten?.length ? `<p><b>Competitors:</b> ${c.concurrenten.map(x => `<span class="badge">${esc(x)}</span>`).join(' ')}</p>` : ''}
      ${c.notities ? `<p class="muted">${esc(c.notities)}</p>` : ''}
      ${youtubeBlok(c, isManager)}
      ${isManager ? `<details style="margin-top:.6rem"><summary class="muted" style="cursor:pointer">Edit</summary>${kanaalForm(c)}</details>` : ''}
    </div>`;
}

// Target vs. actual: green = target met, amber = above 75%, red = below.
function stoplicht(realisatie, doel, hogerIsBeter = true) {
  if (realisatie == null || doel == null) return '';
  const ratio = hogerIsBeter ? realisatie / doel : doel / realisatie;
  const kleur = ratio >= 1 ? 'green' : ratio >= 0.75 ? 'amber' : 'red';
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
        ? `<p style="font-size:.85rem">▶️ Linked to <b>${esc(yt.youtubeNaam || yt.youtubeChannelId)}</b>
            ${s ? `<span class="muted">· ${esc(s.periode)}: <b>${s.views}</b> views · ${stoplicht(avdMin, k.avdMinuten)}AVD <b>${avdMin ?? '?'} min</b> (target ${k.avdMinuten ?? '–'}) · +${s.abonneesErbij} subscribers${s.omzetUsd != null ? ` · $${Number(s.omzetUsd).toFixed(2)}` : ''}</span>` : '<span class="muted">· no figures yet — press Sync</span>'}
           </p>`
        : (isManager ? '<p class="muted" style="font-size:.85rem">▶️ Not linked to YouTube yet — once linked, the figures come in automatically.</p>' : '')}
      ${magMinstens('admin') && !yt?.youtubeChannelId ? `<button class="btn small" data-ytkoppel="${c.id}">▶️ Link YouTube</button>` : ''}
      ${isManager && yt?.youtubeChannelId ? `<button class="btn small" data-ytsync="1">🔄 Sync figures</button>` : ''}
    </div>`;
}

function bindYoutubeActies() {
  document.querySelectorAll('[data-ytkoppel]').forEach(b => b.addEventListener('click', async () => {
    try {
      const { url } = await api(`/api/youtube/koppel?channelId=${b.dataset.ytkoppel}`);
      window.open(url, '_blank');
      alert('Sign in with the Google account that owns this YouTube channel, then come back and press "Sync figures".');
    } catch (e) { alert(e.message); }
  }));
  document.querySelectorAll('[data-ytsync]').forEach(b => b.addEventListener('click', async () => {
    b.textContent = '⏳ working…';
    try {
      const { resultaten } = await api('/api/youtube/sync', { method: 'POST' });
      alert(resultaten.map(r => `${r.kanaal}: ${r.videos} videos updated${r.fouten.length ? `\n  errors: ${r.fouten.join('; ')}` : ''}`).join('\n'));
      VIEWS.kanalen();
    } catch (e) { alert(e.message); VIEWS.kanalen(); }
  }));
}

// ---------- channel form with sliders ----------
// Every slider is an <input type="range"> with a readable number beside it.
// On every movement the whole channel is recalculated through calc.js — the
// same functions the server uses for the dashboard.
function schuif(cls, label, o) {
  const waarde = o.waarde ?? o.standaard ?? o.min;
  return `
    <div class="schuif">
      <label>${label}<b class="schuif-uit" data-uit="${cls}">${toonWaarde(waarde, o)}</b></label>
      <input type="range" class="${cls}" min="${o.min}" max="${o.max}" step="${o.step}"
             value="${waarde}" data-eenheid="${o.eenheid || ''}" data-decimalen="${o.decimalen ?? 0}">
      ${o.uitleg ? `<small class="muted">${o.uitleg}</small>` : ''}
    </div>`;
}

function toonWaarde(v, o) {
  const n = Number(v);
  const tekst = nl(n, o.decimalen ?? 0);
  return o.eenheid === '€' ? `€ ${tekst}` : `${tekst}${o.eenheid ? ' ' + o.eenheid : ''}`;
}

const nl = (n, dec = 0) => new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: dec, maximumFractionDigits: dec
}).format(Number.isFinite(Number(n)) ? Number(n) : 0);
const eur = (n, dec = 0) => '€ ' + nl(n, dec);

function kanaalForm(c) {
  const k = c.kpis || {};
  const p = calc.productieVan(c);
  const cid = c.id || 'nieuw';
  // Fees move in steps of 2.50 so half-euro rates land exactly on the slider.
  const kost = (key, label, max) => schuif(`f-kost-${key}`, label,
    { min: 0, max, step: 2.5, waarde: p.kostenPerStap[key], eenheid: '€', decimalen: 2 });
  const uur = (key, label) => schuif(`f-uur-${key}`, label,
    { min: 0, max: 20, step: 0.5, waarde: p.urenPerStap[key], eenheid: 'hrs', decimalen: 1 });

  return `
    <div data-kanaalform="${cid}">
      <div class="form-row">
        <div><label>Channel name *</label><input class="f-naam" value="${esc(c.naam || '')}"></div>
        <div><label>Topic / niche</label><input class="f-onderwerp" value="${esc(c.onderwerp || '')}" placeholder="e.g. space mysteries, faceless"></div>
        <div><label>Upload days</label><input class="f-dagen" value="${esc(c.uploadDagen || '')}" placeholder="e.g. Tue + Fri 17:00"></div>
        <div><label>Brand</label><select class="f-brand">
          <option value="">— no brand —</option>
          ${(CACHE.brands || []).map(b => `<option value="${b.id}" ${c.brandId === b.id ? 'selected' : ''}>${esc(b.naam)}</option>`).join('')}
        </select></div>
      </div>

      <h4 class="blok-kop">📈 Rhythm and targets</h4>
      <div class="schuif-rij">
        ${schuif('f-freq', 'Upload frequency per week *', {
          min: 1, max: 14, step: 1, waarde: k.uploadFrequentiePerWeek || 2, eenheid: '× / week',
          uitleg: 'The number everything else hangs off.' })}
        ${schuif('f-levertijd', 'Lead time per video', {
          min: 1, max: 45, step: 1, waarde: k.levertijdDagen || 14, eenheid: 'days',
          uitleg: 'From idea to upload. Sets the deadline for each step.' })}
        ${schuif('f-avd', 'Target average view duration (AVD)', {
          min: 0, max: 30, step: 0.5, waarde: k.avdMinuten ?? 4, eenheid: 'min', decimalen: 1 })}
        ${schuif('f-ctr', 'Target CTR', {
          min: 0, max: 20, step: 0.1, waarde: k.ctrPct ?? 6, eenheid: '%', decimalen: 1 })}
        ${schuif('f-omzet', 'Target revenue growth', {
          min: 0, max: 50, step: 0.5, waarde: k.omzetgroeiPctPerMaand ?? 10, eenheid: '% / month', decimalen: 1 })}
      </div>

      <h4 class="blok-kop">💶 What one video costs</h4>
      <div class="schuif-rij">
        ${kost('script', 'Script', 300)}
        ${kost('voice', 'Voice / avatar', 300)}
        ${kost('video', 'Video edit', 600)}
        ${kost('thumbnail', 'Thumbnail', 200)}
        ${kost('upload', 'Upload / SEO', 200)}
        ${schuif('f-vast', 'Fixed cost per month', {
          min: 0, max: 2000, step: 2.5, waarde: p.vasteKostenPerMaand, eenheid: '€', decimalen: 2,
          uitleg: 'Tools, subscriptions, stock footage.' })}
      </div>

      <h4 class="blok-kop">⏱️ How much work one video is</h4>
      <div class="schuif-rij">
        ${uur('script', 'Script')}
        ${uur('voice', 'Voice / avatar')}
        ${uur('video', 'Video edit')}
        ${uur('thumbnail', 'Thumbnail')}
        ${uur('upload', 'Upload / SEO')}
        ${schuif('f-uren-per-freelancer', 'Available per freelancer', {
          min: 4, max: 40, step: 2, waarde: p.urenPerFreelancerPerWeek, eenheid: 'hrs / week',
          uitleg: 'Used to work out how many people you need.' })}
      </div>

      <h4 class="blok-kop">🎯 Assumptions for the payback</h4>
      <div class="schuif-rij">
        ${schuif('f-rpm', 'RPM (revenue per 1,000 views)', {
          min: 0, max: 30, step: 0.25, waarde: p.rpm, eenheid: '€', decimalen: 2 })}
        ${schuif('f-views', 'Expected views per video', {
          min: 0, max: 200000, step: 1000, waarde: p.verwachteViewsPerVideo, eenheid: 'views' })}
        ${schuif('f-ideeratio', 'Share of ideas that make it through', {
          min: 5, max: 100, step: 5, waarde: p.ideeGoedkeuringsPct, eenheid: '%',
          uitleg: 'At 50% you need two ideas per video.' })}
      </div>

      <div class="rekenblok" data-rekenblok></div>

      <label>Title format / structure</label><input class="f-titelformat" value="${esc(c.titelFormat || '')}" placeholder="e.g. [Number] + [topic] + curiosity gap — max 55 characters">
      <label>Thumbnail format / structure</label><input class="f-thumbformat" value="${esc(c.thumbnailFormat || '')}" placeholder="e.g. one face/object on the right, 3-4 words on the left, bright contrast colour">
      <label>Competitors (comma separated)</label><input class="f-concurrenten" value="${esc((c.concurrenten || []).join(', '))}">
      <label>Notes</label><textarea class="f-notities">${esc(c.notities || '')}</textarea>
      <div style="margin-top:.7rem"><button class="btn primary f-save">Save</button> <span class="error f-error"></span></div>
    </div>`;
}

/** Reads the form back as a channel object — for both the live calculation and saving. */
function kanaalUitForm(form) {
  const v = cls => form.querySelector('.' + cls)?.value;
  const n = cls => { const x = Number(v(cls)); return Number.isFinite(x) ? x : null; };
  const perStap = prefix => Object.fromEntries(calc.STAPPEN.map(s => [s.key, Number(v(`${prefix}-${s.key}`)) || 0]));
  return {
    naam: v('f-naam'),
    onderwerp: v('f-onderwerp'),
    titelFormat: v('f-titelformat'),
    thumbnailFormat: v('f-thumbformat'),
    concurrenten: (v('f-concurrenten') || '').split(',').map(s => s.trim()).filter(Boolean),
    uploadDagen: v('f-dagen'),
    notities: v('f-notities'),
    brandId: v('f-brand') || null,
    kpis: {
      uploadFrequentiePerWeek: n('f-freq'),
      avdMinuten: n('f-avd'),
      ctrPct: n('f-ctr'),
      levertijdDagen: n('f-levertijd'),
      omzetgroeiPctPerMaand: n('f-omzet')
    },
    productie: {
      kostenPerStap: perStap('f-kost'),
      urenPerStap: perStap('f-uur'),
      vasteKostenPerMaand: n('f-vast'),
      rpm: n('f-rpm'),
      verwachteViewsPerVideo: n('f-views'),
      ideeGoedkeuringsPct: n('f-ideeratio'),
      urenPerFreelancerPerWeek: n('f-uren-per-freelancer')
    }
  };
}

/** The panel under the sliders: what the chosen settings actually mean. */
function rekenblokHtml(kanaal) {
  const { capaciteit: cap, kosten: g } = calc.doorrekenen(kanaal);
  const winst = g.margePerMaand >= 0;
  const bemensing = calc.STAPPEN.map(s => `
    <div class="reken-rij">
      <span>${s.label}</span>
      <span class="muted">${nl(cap.urenPerWeek[s.key], 1)} hrs/week</span>
      <b>${cap.freelancersNodig[s.key]}×</b>
    </div>`).join('');

  return `
    <div class="reken-kolommen">
      <div>
        <h5>Rhythm</h5>
        <div class="reken-groot">${nl(cap.perMaand, 1)}<small>videos per month</small></div>
        <div class="reken-rij"><span>Per year</span><b>${nl(cap.perJaar, 0)}</b></div>
        <div class="reken-rij"><span>Ideas needed per month</span><b>${nl(cap.ideeenPerMaand, 0)}</b></div>
        <div class="reken-rij"><span>In progress at once</span><b>${cap.onderhandenWerk} videos</b></div>
      </div>
      <div>
        <h5>Staffing</h5>
        <div class="reken-groot">${nl(cap.urenTotaalPerWeek, 1)}<small>hours of work per week</small></div>
        ${bemensing}
        <div class="reken-rij totaal"><span>Freelancers needed</span><b>${cap.freelancersTotaal}</b></div>
      </div>
      <div>
        <h5>Money</h5>
        <div class="reken-groot">${eur(g.kostprijsPerVideo, 2)}<small>cost price per video</small></div>
        <div class="reken-rij"><span>Production cost per month</span><b>${eur(g.perMaand)}</b></div>
        <div class="reken-rij"><span>Per year</span><b>${eur(g.perJaar)}</b></div>
        <div class="reken-rij"><span>Break-even</span><b>${g.breakEvenViews == null ? '—' : nl(g.breakEvenViews, 0) + ' views'}</b></div>
        <div class="reken-rij"><span>Expected revenue per month</span><b>${eur(g.omzetPerMaand)}</b></div>
        <div class="reken-rij totaal"><span>Margin per month</span>
          <b class="${winst ? 'goed' : 'slecht'}">${eur(g.margePerMaand)}</b></div>
      </div>
    </div>
    <p class="reken-conclusie ${winst ? 'goed' : 'slecht'}">
      ${winst
        ? `At ${nl(g.verwachteViewsPerVideo, 0)} views per video you keep ${eur(g.margePerVideo, 2)} per video — ${eur(g.margePerMaand)} per month.`
        : `At ${nl(g.verwachteViewsPerVideo, 0)} views per video this channel costs you ${eur(Math.abs(g.margePerMaand))} per month. You need ${g.breakEvenViews == null ? 'a higher RPM' : nl(g.breakEvenViews, 0) + ' views per video'} to break even.`}
    </p>`;
}

function bindKanaalForms() {
  document.querySelectorAll('[data-kanaalform]').forEach(form => {
    const herbereken = () => {
      // Update the number beside the slider.
      form.querySelectorAll('input[type=range]').forEach(r => {
        const uit = form.querySelector(`[data-uit="${r.className}"]`);
        if (uit) uit.textContent = toonWaarde(r.value, {
          eenheid: r.dataset.eenheid, decimalen: Number(r.dataset.decimalen || 0)
        });
      });
      form.querySelector('[data-rekenblok]').innerHTML = rekenblokHtml(kanaalUitForm(form));
    };
    form.addEventListener('input', e => { if (e.target.type === 'range') herbereken(); });
    herbereken();

    form.querySelector('.f-save').addEventListener('click', async () => {
      const body = kanaalUitForm(form);
      const cid = form.dataset.kanaalform;
      try {
        if (cid === 'nieuw') await api('/api/channels', { method: 'POST', body });
        else await api(`/api/channels/${cid}`, { method: 'PUT', body });
        VIEWS.kanalen();
      } catch (e) { form.querySelector('.f-error').textContent = e.message; }
    });
  });
}

// ---------- helpers: idea bank ----------
function ideeKaart(i, isManager, asLabels) {
  const klasse = i.score == null ? '' : i.score >= 4 ? 'high' : i.score >= 3 ? 'mid' : 'low';
  return `
    <div class="card">
      <div class="idee-kaart">
        <div class="idee-score ${klasse}">${i.score ?? '–'}<small>out of 5</small></div>
        <div class="idee-body">
          <b>${esc(i.titel)}</b>
          <span class="badge ${i.status}">${esc(i.status)}</span>
          <span class="badge">${esc(kanaalNaam(i.channelId))}</span>
          ${i.omschrijving ? `<p class="muted" style="margin-top:.35rem;white-space:pre-wrap">${esc(i.omschrijving)}</p>` : ''}
          <p class="muted" style="font-size:.8rem">
            💬 ${esc(i.aangedragenDoor)}
            ${i.bron ? ` · 🔗 <a href="${esc(i.bron)}" target="_blank">source</a>` : ''}
            ${i.notitie ? ` · 📝 ${esc(i.notitie)}` : ''}
          </p>
          ${isManager ? `
            <details>
              <summary class="muted" style="cursor:pointer">⭐ Score it (1 = poor, 5 = excellent)</summary>
              <div class="score-assen" data-scoreform="${i.id}">
                ${Object.entries(asLabels).map(([as, label]) => `
                  <div class="score-as">
                    <label>${label}</label>
                    <select class="s-${as}">
                      <option value="">—</option>
                      ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${i.scores?.[as] === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                  </div>`).join('')}
              </div>
              <label>Note</label><input class="s-notitie" value="${esc(i.notitie || '')}" data-notitie="${i.id}" placeholder="e.g. a competitor got 400k views with this">
              <div style="margin-top:.6rem"><button class="btn small primary" data-scoreopslaan="${i.id}">Save score</button></div>
            </details>
            <div class="acties" style="margin-top:.6rem">
              <button class="btn small green" data-promoveer="${i.id}">🎬 To pipeline</button>
              <button class="btn small" data-status="${i.id}:approved">👍 Approve</button>
              <button class="btn small red" data-status="${i.id}:rejected">👎 Reject</button>
              <button class="btn small red" data-delidee="${i.id}">🗑️</button>
            </div>` : ''}
        </div>
      </div>
    </div>`;
}

function bindIdeeActies() {
  document.querySelectorAll('[data-scoreopslaan]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.scoreopslaan;
    const form = document.querySelector(`[data-scoreform="${id}"]`);
    const body = { notitie: document.querySelector(`[data-notitie="${id}"]`).value };
    for (const as of ['outlierPotentie', 'zoekvolume', 'productiegemak', 'kanaalfit']) {
      body[as] = form.querySelector(`.s-${as}`).value;
    }
    try { await api(`/api/ideeen/${id}/score`, { method: 'POST', body }); VIEWS.ideeen(); }
    catch (e) { alert(e.message); }
  }));
  document.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', async () => {
    const [id, status] = b.dataset.status.split(':');
    try { await api(`/api/ideeen/${id}/status`, { method: 'POST', body: { status } }); VIEWS.ideeen(); }
    catch (e) { alert(e.message); }
  }));
  document.querySelectorAll('[data-promoveer]').forEach(b => b.addEventListener('click', async () => {
    const opties = CACHE.channels.map((c, n) => `${n + 1}. ${c.naam}`).join('\n');
    const keuze = prompt(`Which channel?\n${opties}\n\nNumber:`);
    if (keuze === null) return;
    const kanaal = CACHE.channels[Number(keuze) - 1];
    if (!kanaal) { alert('That is not a valid channel'); return; }
    const datum = prompt('Planned publish date (YYYY-MM-DD, leave empty to decide later):') || null;
    try {
      await api(`/api/ideeen/${b.dataset.promoveer}/promoveer`, { method: 'POST', body: { channelId: kanaal.id, geplandePublicatie: datum } });
      alert('🎬 The idea is now in the pipeline.');
      VIEWS.ideeen();
    } catch (e) { alert(e.message); }
  }));
  document.querySelectorAll('[data-delidee]').forEach(b => b.addEventListener('click', async () => {
    if (confirm('Permanently delete this idea?')) {
      await api(`/api/ideeen/${b.dataset.delidee}`, { method: 'DELETE' });
      VIEWS.ideeen();
    }
  }));
}

// ---------- helpers: pipeline ----------
function videoKaart(v, isManager) {
  const uploadActief = v.stappen.find(s => s.key === 'upload' && s.status !== 'waiting');
  const s = v.stats;
  return `
    <div class="card" data-video="${v.id}">
      <h3 style="margin-top:0">🎬 ${esc(v.werktitel)} <span class="muted" style="font-weight:400">— ${esc(kanaalNaam(v.channelId))}</span></h3>
      ${v.idee ? `<p class="muted">${esc(v.idee)}</p>` : ''}
      <p class="muted" style="font-size:.85rem">
        ${v.geplandePublicatie ? `📅 publishes: <b>${esc(v.geplandePublicatie)}</b>` : '📅 no publish date yet'}
        ${v.youtubeVideoId ? ` · ▶️ <a href="https://youtu.be/${esc(v.youtubeVideoId)}" target="_blank">${esc(v.youtubeVideoId)}</a>` : ''}
        ${s ? ` · 👁 ${s.views ?? '?'} views${s.ctrPct != null ? ` · CTR ${s.ctrPct}%` : ''}${s.avdMinuten != null ? ` · AVD ${s.avdMinuten} min` : ''}` : ''}
        ${isManager ? ` · <a href="#" data-videoedit="${v.id}">edit</a>` : ''}
      </p>
      <div class="stappen">
        ${v.stappen.map(st => stapBlok(v, st, isManager)).join('')}
      </div>
      ${v.qc?.length ? `
      <details ${uploadActief ? 'open' : ''} style="margin-top:.5rem">
        <summary class="muted" style="cursor:pointer">✅ QC checklist before upload (${v.qc.filter(q => q.done).length}/${v.qc.length})</summary>
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
    const datum = prompt('Planned publish date (YYYY-MM-DD, empty = none):');
    if (datum === null) return;
    const ytId = prompt('YouTube video id after upload (e.g. dQw4w9WgXcQ, empty = none):');
    if (ytId === null) return;
    await api(`/api/videos/${vid}`, { method: 'PUT', body: { geplandePublicatie: datum || null, youtubeVideoId: ytId || '' } });
    const stats = prompt('Manual KPI entry views,CTR%,AVDmin (e.g. 15000,6.2,4.5 — empty = skip):');
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
  const magInleveren = (s.status === 'in_progress' || s.status === 'rejected') && (isManager || isMijn || !s.assigneeId);
  return `
    <div class="stap ${s.status === 'in_progress' || s.status === 'awaiting_approval' || s.status === 'rejected' ? 'active' : ''}">
      <div class="stap-naam">${esc(s.naam)}</div>
      <span class="badge ${s.status}">${s.status.replace('_', ' ')}</span>
      <div class="stap-meta">${assignee ? `👤 ${esc(assignee.naam)}` : '👤 unassigned'}${s.deadline ? ` · 📅 ${esc(s.deadline)}` : ''}</div>
      ${s.opleverLink ? `<div class="stap-meta">🔗 <a href="${esc(s.opleverLink)}" target="_blank">delivery</a></div>` : ''}
      ${s.feedback.map(f => `<div class="feedback-blok"><b>${esc(f.door)}:</b> ${esc(f.tekst)}</div>`).join('')}
      <div class="acties">
        ${magInleveren ? `<button class="btn small" data-actie="inleveren" data-v="${v.id}" data-s="${s.key}">📤 Submit</button>` : ''}
        ${isManager && s.status === 'awaiting_approval' ? `
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
        const link = prompt('Link to your delivery (Drive, Frame.io, …) — may be left empty:') ?? '';
        await api(`/api/videos/${v}/stappen/${s}/inleveren`, { method: 'POST', body: { opleverLink: link } });
      } else if (actie === 'goedkeuren') {
        await api(`/api/videos/${v}/stappen/${s}/goedkeuren`, { method: 'POST', body: {} });
      } else if (actie === 'afkeuren') {
        const feedback = prompt('Feedback for the freelancer (what needs to change?):');
        if (feedback === null) return;
        await api(`/api/videos/${v}/stappen/${s}/afkeuren`, { method: 'POST', body: { feedback } });
      } else if (actie === 'toewijzen') {
        const opties = CACHE.team.map((u, i) => `${i + 1}. ${u.naam} (${u.functie})`).join('\n');
        const keuze = prompt(`Who takes this step?\n${opties}\n\nNumber (empty = nobody):`);
        if (keuze === null) return;
        const gekozen = CACHE.team[Number(keuze) - 1];
        const deadline = prompt('Deadline (YYYY-MM-DD, empty = none):') || null;
        await api(`/api/videos/${v}/stappen/${s}/toewijzen`, { method: 'POST', body: { assigneeId: gekozen?.id || null, deadline } });
      }
      VIEWS.pipeline();
    } catch (e) { alert(e.message); }
  }));
}

// ---------- instruction centre (content) ----------
const INSTRUCTIES = {
  algemeen: `
    <h4>🧭 How we work at Rossing T&amp;M</h4>
    <ol>
      <li><b>The pipeline is sacred.</b> Idea → Script → Voice/Avatar → Video edit → Thumbnail → Upload. Your step only starts once the previous one has been approved — you are notified automatically, here and in Discord.</li>
      <li><b>Every step ends at a checkpoint.</b> Hand in through the "Submit" button with a link to your work. The admin either approves it or sends feedback. Rejected means one revision round; after that we talk it through.</li>
      <li><b>Deadlines are commitments.</b> See a deadline you are not going to make? Say so in Discord at least 24 hours in advance and we will move it. Without that warning, we will not.</li>
      <li><b>Channel settings are the law.</b> Title format, thumbnail format, tone and upload frequency are fixed per channel under "Channels". Deviate only with explicit approval up front.</li>
      <li><b>Work talk happens in Discord</b>, in the channel for your step. No side conversations or DMs about work — that is how information gets lost.</li>
      <li><b>File names:</b> <code>[channel]-[working title]-[step]-[version]</code>, for example <code>bloopuniverse-space-mysteries-script-v2</code>.</li>
    </ol>`,
  scriptwriter: `
    <h4>✍️ Scriptwriter instructions</h4>
    <ol>
      <li><b>Read the idea and the channel settings first</b> (topic, tone, audience, title format). The script has to deliver on the title and the thumbnail — no clickbait the video does not pay off.</li>
      <li><b>The hook (0–30 seconds) is 80% of your job.</b> Open with the core promise of the title, ask a question, or set up the mystery. Never "welcome back to the channel".</li>
      <li><b>Structure:</b> hook → context → build in blocks with a mini cliffhanger every 60–90 seconds (this is what drives AVD) → payoff → outro that points at another video.</li>
      <li><b>Write for the ear, not the eye:</b> short sentences, active voice, spoken language. Read it out loud before you submit.</li>
      <li><b>Length:</b> follow the channel's target length (see channel settings); count roughly 150 words per minute of voiceover.</li>
      <li><b>Mark direction notes</b> for the editor in [square brackets]: [B-ROLL: rocket launch], [PAUSE], [EMPHASIS].</li>
      <li><b>Check your facts:</b> every claim must be verifiable; list your sources at the bottom of the script.</li>
      <li><b>Submitting:</b> a Google Doc link through the "Submit" button, with comment access enabled. One revision round is included in the fee.</li>
    </ol>`,
  editor: `
    <h4>🎞️ Video editor instructions</h4>
    <ol>
      <li><b>Work from the approved script and voiceover.</b> Follow the [direction notes] in the script; deviate only when it makes the video stronger, and say so when you submit.</li>
      <li><b>The first 30 seconds:</b> highest pace, best footage. A visual change every 3–5 seconds (shot, zoom, text or overlay) — this is where we win or lose the viewer.</li>
      <li><b>Retention rhythm:</b> no shot longer than about 6 seconds without movement or change; a subtle zoom on stills; music under the whole video, ducked under the voiceover (-15 to -20 dB).</li>
      <li><b>Style per channel:</b> colours, typeface and overlay style are in the channel settings. Consistency beats creativity here.</li>
      <li><b>Audio first:</b> a clean voiceover (no clipping, no hiss), loudness around -14 LUFS for YouTube.</li>
      <li><b>Rights:</b> only stock or licence-free material from the agreed libraries, with the source noted in the project file.</li>
      <li><b>Delivery:</b> MP4 1080p (or 4K if agreed), H.264, plus the project file in the shared folder. Submit through the button with the link. One revision round is included in the fee.</li>
    </ol>`,
  thumbnail: `
    <h4>🖼️ Thumbnail artist instructions</h4>
    <ol>
      <li><b>Follow the channel's thumbnail format</b> (see channel settings): fixed composition, colour use and text position. The thumbnail has to look like family next to the channel's other videos.</li>
      <li><b>One idea per thumbnail.</b> One subject, face or object as the eye-catcher, at most 3–4 words of text, and that text must NOT repeat the title literally — they complement each other.</li>
      <li><b>Readable at 120 pixels:</b> check your design at phone size. High contrast, thick outlines, no thin typefaces.</li>
      <li><b>Curiosity gap:</b> the thumbnail raises a question only the video answers — but never promises something the video does not contain.</li>
      <li><b>Look at the competitors</b> (listed per channel): stand out next to their thumbnails in the results rather than copying them.</li>
      <li><b>Specifications:</b> 1280×720, JPG or PNG under 2 MB, plus the source file (PSD/Figma) in the shared folder.</li>
      <li><b>Deliver two variants</b> per video so we can A/B test. One revision round is included in the fee.</li>
    </ol>`
};

init();
