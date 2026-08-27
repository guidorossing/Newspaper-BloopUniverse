// YouTube-koppeling: haalt per gekoppeld kanaal en per video de échte
// cijfers op via de YouTube Data API v3 + YouTube Analytics API v2.
//
// Werking (zie docs/youtube-api.md voor de volledige setup):
//   1. Admin vult Google OAuth client-id/secret in bij Instellingen.
//   2. Per kanaal: "Koppel YouTube" -> Google-loginscherm -> refresh-token
//      wordt AES-versleuteld opgeslagen bij het kanaal.
//   3. "Sync" (of de dagelijkse auto-sync) haalt views, kijktijd (AVD) en
//      omzet op voor kanaal en video's met een ingevuld youtubeVideoId.
//
// Let op: thumbnail-CTR (impressies) stelt YouTube niet open via de
// publieke Analytics API — dat veld blijft handmatig in te vullen vanuit
// YouTube Studio. Alle andere KPI's gaan automatisch.
import { load, save, logActivity } from './store.js';
import { encryptSecret, decryptSecret } from './vault.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly'
].join(' ');

// access-tokens per kanaal in geheugen; refresh-token staat versleuteld in de db.
const accessTokens = new Map(); // channelId -> { token, verlooptOm }

export function authUrl(channelId, redirectUri) {
  const { settings } = load();
  if (!settings.youtube.clientId) throw new Error('Vul eerst de Google client-id in bij Instellingen');
  const p = new URLSearchParams({
    client_id: settings.youtube.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: channelId
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google OAuth-fout: ${data.error_description || data.error || res.status}`);
  return data;
}

// Stap 2 van OAuth: code inwisselen en refresh-token opslaan bij het kanaal.
export async function verwerkCallback(code, channelId, redirectUri) {
  const db = load();
  const channel = db.channels.find(c => c.id === channelId);
  if (!channel) throw new Error('Kanaal niet gevonden');
  const { settings } = db;
  const tokens = await tokenRequest({
    code,
    client_id: settings.youtube.clientId,
    client_secret: settings.youtube.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });
  if (!tokens.refresh_token) throw new Error('Geen refresh-token ontvangen — trek de app-toegang in via myaccount.google.com/permissions en koppel opnieuw');

  // Welk YouTube-kanaal hoort bij dit Google-account?
  const kanaalRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  const kanaalData = await kanaalRes.json();
  const yt = kanaalData.items?.[0];

  channel.youtube = {
    refreshTokenEncrypted: encryptSecret(tokens.refresh_token),
    youtubeChannelId: yt?.id || '',
    youtubeNaam: yt?.snippet?.title || '',
    gekoppeldOp: new Date().toISOString()
  };
  accessTokens.set(channelId, { token: tokens.access_token, verlooptOm: Date.now() + (tokens.expires_in - 60) * 1000 });
  save();
  logActivity('Systeem', `YouTube-kanaal "${channel.youtube.youtubeNaam}" gekoppeld aan "${channel.naam}"`);
  return channel.youtube.youtubeNaam;
}

async function accessTokenVoor(channel) {
  const cached = accessTokens.get(channel.id);
  if (cached && cached.verlooptOm > Date.now()) return cached.token;
  const { settings } = load();
  const tokens = await tokenRequest({
    refresh_token: decryptSecret(channel.youtube.refreshTokenEncrypted),
    client_id: settings.youtube.clientId,
    client_secret: settings.youtube.clientSecret,
    grant_type: 'refresh_token'
  });
  accessTokens.set(channel.id, { token: tokens.access_token, verlooptOm: Date.now() + (tokens.expires_in - 60) * 1000 });
  return tokens.access_token;
}

async function analyticsQuery(token, youtubeChannelId, params) {
  const p = new URLSearchParams({ ids: `channel==${youtubeChannelId}`, ...params });
  const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${p}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Analytics-fout: ${data.error?.message || res.status}`);
  return data;
}

// Haal cijfers op voor één kanaal + alle video's met een youtubeVideoId.
export async function syncKanaal(channelId) {
  const db = load();
  const channel = db.channels.find(c => c.id === channelId);
  if (!channel?.youtube?.refreshTokenEncrypted) throw new Error('Dit kanaal is niet aan YouTube gekoppeld');
  const token = await accessTokenVoor(channel);
  const ytId = channel.youtube.youtubeChannelId;
  const vandaag = new Date().toISOString().slice(0, 10);
  const resultaat = { kanaal: channel.naam, videos: 0, fouten: [] };

  // Kanaaltotalen over de laatste 28 dagen (incl. omzet als dat mag).
  const start28 = new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    const rap = await analyticsQuery(token, ytId, {
      startDate: start28, endDate: vandaag,
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,estimatedRevenue'
    });
    const rij = rap.rows?.[0] || [];
    channel.youtubeStats = {
      periode: 'laatste 28 dagen',
      views: rij[0] ?? 0,
      kijkMinuten: rij[1] ?? 0,
      avdSeconden: rij[2] ?? 0,
      abonneesErbij: rij[3] ?? 0,
      omzetUsd: rij[4] ?? null,
      laatstOpgehaald: new Date().toISOString()
    };
  } catch (e) {
    // Zonder monetair recht faalt estimatedRevenue; probeer zonder omzet.
    try {
      const rap = await analyticsQuery(token, ytId, {
        startDate: start28, endDate: vandaag,
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained'
      });
      const rij = rap.rows?.[0] || [];
      channel.youtubeStats = {
        periode: 'laatste 28 dagen',
        views: rij[0] ?? 0, kijkMinuten: rij[1] ?? 0, avdSeconden: rij[2] ?? 0,
        abonneesErbij: rij[3] ?? 0, omzetUsd: null,
        laatstOpgehaald: new Date().toISOString()
      };
    } catch (e2) {
      resultaat.fouten.push(`kanaalcijfers: ${e2.message}`);
    }
  }

  // Per video (levensduur-totalen).
  for (const video of db.videos.filter(v => v.channelId === channelId && v.youtubeVideoId)) {
    try {
      const rap = await analyticsQuery(token, ytId, {
        startDate: '2000-01-01', endDate: vandaag,
        metrics: 'views,averageViewDuration,averageViewPercentage',
        filters: `video==${video.youtubeVideoId}`
      });
      const rij = rap.rows?.[0] || [];
      video.stats = {
        ...(video.stats || {}),
        views: rij[0] ?? 0,
        avdMinuten: rij[1] != null ? Number((rij[1] / 60).toFixed(2)) : null,
        avdPct: rij[2] ?? null,
        laatstOpgehaald: new Date().toISOString()
      };
      resultaat.videos++;
    } catch (e) {
      resultaat.fouten.push(`${video.werktitel}: ${e.message}`);
    }
  }
  save();
  return resultaat;
}

export async function syncAlles() {
  const db = load();
  const resultaten = [];
  for (const c of db.channels.filter(c => c.youtube?.refreshTokenEncrypted)) {
    try { resultaten.push(await syncKanaal(c.id)); }
    catch (e) { resultaten.push({ kanaal: c.naam, videos: 0, fouten: [e.message] }); }
  }
  return resultaten;
}

// Dagelijkse auto-sync om 07:30 servertijd (vóór het kalender-alarm van 08:00).
export function planAutoSync() {
  const nu = new Date();
  const volgende = new Date(nu);
  volgende.setHours(7, 30, 0, 0);
  if (volgende <= nu) volgende.setDate(volgende.getDate() + 1);
  setTimeout(async () => {
    try { await syncAlles(); } catch { /* sync mag nooit de server breken */ }
    planAutoSync();
  }, volgende - nu);
}
