// Gebruikers, sessies en toegangsbeheer.
//
// Rollen (van hoog naar laag):
//   admin      — jij. Alles, inclusief vault-geheimen en gebruikersbeheer.
//   manager    — kanaalmanager. Alles behalve geheimen onthullen en
//                gebruikers/instellingen beheren.
//   freelancer — ziet alleen de pipeline, eigen taken, to-do's en het
//                instructiecentrum. Geen vault, geen KPI-financiën.
//
// Wachtwoorden worden met scrypt gehasht (Node-native, geen dependencies).
import crypto from 'node:crypto';
import { load, save, id } from './store.js';

const SESSIONS = new Map(); // sid -> { userId, created }
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 uur

export const ROLLEN = ['admin', 'manager', 'freelancer'];
export const FUNCTIES = ['scriptwriter', 'voice-artiest', 'video-editor', 'thumbnail-artiest', 'uploader', 'overig'];

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(pw, salt, 64);
  const expect = Buffer.from(hash, 'hex');
  return check.length === expect.length && crypto.timingSafeEqual(check, expect);
}

// Eerste start: maak een admin-account aan met een tijdelijk wachtwoord
// dat in de console wordt getoond. Direct wijzigen na eerste login.
export function seedAdmin() {
  const db = load();
  if (db.users.length > 0) return null;
  const tijdelijk = crypto.randomBytes(6).toString('base64url');
  db.users.push({
    id: id(),
    naam: 'Admin',
    email: 'admin@bloopuniverse.local',
    rol: 'admin',
    functie: 'overig',
    passwordHash: hashPassword(tijdelijk),
    moetWachtwoordWijzigen: true
  });
  save();
  return tijdelijk;
}

export function login(email, password) {
  const db = load();
  const user = db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  const sid = crypto.randomBytes(24).toString('hex');
  SESSIONS.set(sid, { userId: user.id, created: Date.now() });
  return { sid, user };
}

export function logout(sid) {
  SESSIONS.delete(sid);
}

export function userForSession(sid) {
  const s = SESSIONS.get(sid);
  if (!s) return null;
  if (Date.now() - s.created > SESSION_TTL_MS) {
    SESSIONS.delete(sid);
    return null;
  }
  return load().users.find(u => u.id === s.userId) || null;
}

export function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

// rolNiveau: hoe lager het getal, hoe meer rechten.
export function rolNiveau(rol) {
  return ROLLEN.indexOf(rol);
}

export function magMinstens(user, rol) {
  return user && rolNiveau(user.rol) !== -1 && rolNiveau(user.rol) <= rolNiveau(rol);
}
