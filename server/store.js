// Simple JSON storage. One data file (data/db.json) written atomically on
// every mutation. Plenty for a team of this size; moving to SQLite or
// Postgres later can be done without touching the API layer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.CMS_DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  users: [],
  // Brands group channels: one brand can hold several channels, and the
  // dashboard reports cost and margin per brand as well as per channel.
  brands: [],
  channels: [],
  videos: [],
  ideeen: [],
  todos: [],
  vault: [],
  templates: [],
  koppelcodes: [],
  // Recorded payouts: which freelancer was paid for which month.
  payouts: [],
  settings: {
    discordWebhookUrl: '',
    discordEnabled: false,
    // Bot access to the CMS API with a fixed token (see discord-bot/).
    botToken: '',
    // QC checklist every video must pass before the upload step can be
    // submitted. Editable under Settings.
    qcItems: [
      'End screen and info cards added',
      'Description with keywords and timestamps',
      'Tags filled in',
      'Pinned comment prepared',
      'Video added to the right playlist',
      'Thumbnail uploaded and checked at phone size',
      'Publish time matches the upload schedule'
    ],
    // YouTube Data/Analytics API (see docs/youtube-api.md)
    youtube: { clientId: '', clientSecret: '' }
  },
  activity: []
};

// The system used to be Dutch. Databases created before the switch to
// English still hold the old status and role values; these maps translate
// them on load so an existing installation keeps working after an update.
const OUDE_WAARDEN = {
  functie: { 'voice-artiest': 'voice-artist', 'thumbnail-artiest': 'thumbnail-artist', overig: 'other' },
  stapStatus: {
    wachtend: 'waiting', bezig: 'in_progress', ter_goedkeuring: 'awaiting_approval',
    goedgekeurd: 'approved', afgekeurd: 'rejected'
  },
  stapNaam: { Idee: 'Idea', 'Video-edit': 'Video edit' },
  ideeStatus: { nieuw: 'new', goedgekeurd: 'approved', afgewezen: 'rejected', gepromoveerd: 'promoted' }
};

const OUDE_QC_ITEMS = [
  'Eindscherm + infokaarten toegevoegd',
  'Beschrijving met keywords en tijdstempels',
  'Tags ingevuld',
  'Pinned comment klaargezet',
  'Video in de juiste afspeellijst',
  'Thumbnail geüpload en gecontroleerd op telefoonformaat',
  'Publicatietijd volgens uploadschema'
];

function migreerNaarEngels(d) {
  for (const u of d.users) u.functie = OUDE_WAARDEN.functie[u.functie] || u.functie;
  for (const v of d.videos) {
    for (const s of v.stappen || []) {
      s.status = OUDE_WAARDEN.stapStatus[s.status] || s.status;
      s.naam = OUDE_WAARDEN.stapNaam[s.naam] || s.naam;
    }
  }
  for (const i of d.ideeen) i.status = OUDE_WAARDEN.ideeStatus[i.status] || i.status;
  // Only replace the untouched Dutch default list; a checklist the user has
  // edited themselves stays exactly as it is.
  const qc = d.settings.qcItems;
  if (Array.isArray(qc) && qc.length === OUDE_QC_ITEMS.length && qc.every((x, n) => x === OUDE_QC_ITEMS[n])) {
    d.settings.qcItems = [...EMPTY.settings.qcItems];
  }
}

let db = null;

export function id() {
  return crypto.randomBytes(8).toString('hex');
}

export function load() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    const opSchijf = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db = { ...structuredClone(EMPTY), ...opSchijf };
    // Add new settings fields without overwriting existing values.
    db.settings = { ...structuredClone(EMPTY.settings), ...(opSchijf.settings || {}) };
    db.settings.youtube = { ...structuredClone(EMPTY.settings.youtube), ...(opSchijf.settings?.youtube || {}) };
    migreerNaarEngels(db);
    save();
  } else {
    db = structuredClone(EMPTY);
    save();
  }
  return db;
}

export function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// Activity log: who did what, when. Keeps at most 500 lines.
export function logActivity(userNaam, tekst) {
  const d = load();
  d.activity.unshift({ ts: new Date().toISOString(), user: userNaam, tekst });
  if (d.activity.length > 500) d.activity.length = 500;
  save();
}
