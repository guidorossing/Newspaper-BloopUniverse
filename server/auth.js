// Users, sessions and access control.
//
// Roles (from most to least privileged):
//   admin      — you. Everything, including vault secrets and user management.
//   manager    — channel manager. Everything except revealing secrets and
//                managing users and settings.
//   freelancer — sees only the pipeline, their own tasks, the to-do list and
//                the instruction centre. No vault, no financial KPIs.
//
// Passwords are hashed with scrypt (built into Node, no dependencies).
import crypto from 'node:crypto';
import { load, save, id } from './store.js';

const SESSIONS = new Map(); // sid -> { userId, created }
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export const ROLLEN = ['admin', 'manager', 'freelancer'];
export const FUNCTIES = ['scriptwriter', 'voice-artist', 'video-editor', 'thumbnail-artist', 'uploader', 'other'];

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

// First boot: create an admin account with a temporary password that is
// printed to the console. Change it immediately after the first login.
export function seedAdmin() {
  const db = load();
  if (db.users.length > 0) return null;
  const tijdelijk = crypto.randomBytes(6).toString('base64url');
  db.users.push({
    id: id(),
    naam: 'Admin',
    email: 'info@rossingtm.com',
    rol: 'admin',
    functie: 'other',
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

// rolNiveau: the lower the number, the more rights.
export function rolNiveau(rol) {
  return ROLLEN.indexOf(rol);
}

export function magMinstens(user, rol) {
  return user && rolNiveau(user.rol) !== -1 && rolNiveau(user.rol) <= rolNiveau(rol);
}
