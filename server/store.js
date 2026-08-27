// Eenvoudige JSON-opslag. Eén databestand (data/db.json) dat bij elke
// mutatie atomisch wordt weggeschreven. Ruim voldoende voor een team
// van deze omvang; migreren naar SQLite/Postgres kan later zonder de
// API-laag te veranderen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.BLOOP_DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  users: [],
  channels: [],
  videos: [],
  todos: [],
  vault: [],
  templates: [],
  koppelcodes: [],
  settings: {
    discordWebhookUrl: '',
    discordEnabled: false,
    // Bot-toegang tot de CMS-API met een vast token (zie discord-bot/).
    botToken: '',
    // QC-checklist die elke video moet doorlopen vóór de upload-stap
    // ingeleverd mag worden. Aanpasbaar via Instellingen.
    qcItems: [
      'Eindscherm + infokaarten toegevoegd',
      'Beschrijving met keywords en tijdstempels',
      'Tags ingevuld',
      'Pinned comment klaargezet',
      'Video in de juiste afspeellijst',
      'Thumbnail geüpload en gecontroleerd op telefoonformaat',
      'Publicatietijd volgens uploadschema'
    ],
    // YouTube Data/Analytics API (zie docs/youtube-api.md)
    youtube: { clientId: '', clientSecret: '' }
  },
  activity: []
};

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
    // Nieuwe settings-velden aanvullen zonder bestaande waarden te overschrijven.
    db.settings = { ...structuredClone(EMPTY.settings), ...(opSchijf.settings || {}) };
    db.settings.youtube = { ...structuredClone(EMPTY.settings.youtube), ...(opSchijf.settings?.youtube || {}) };
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

// Activiteitenlog: wie deed wat, wanneer. Max 500 regels bewaren.
export function logActivity(userNaam, tekst) {
  const d = load();
  d.activity.unshift({ ts: new Date().toISOString(), user: userNaam, tekst });
  if (d.activity.length > 500) d.activity.length = 500;
  save();
}
