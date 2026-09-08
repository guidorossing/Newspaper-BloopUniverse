// Channel Admin vault: channel information and credentials, encrypted on
// disk with AES-256-GCM. The key lives in data/vault.key (gitignored) or in
// the CMS_VAULT_KEY environment variable (hex, 64 characters).
//
// Important: this is a pragmatic vault for a small team. For YouTube itself
// the rule is: preferably share NO passwords, but invite freelancers through
// YouTube Studio channel permissions (role "Editor" or "Editor (limited)").
// See docs/security-access-control.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.js';

let KEY = null;

export function initVaultKey() {
  if (KEY) return;
  if (process.env.CMS_VAULT_KEY) {
    KEY = Buffer.from(process.env.CMS_VAULT_KEY, 'hex');
  } else {
    const keyFile = path.join(DATA_DIR, 'vault.key');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(keyFile)) {
      KEY = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
    } else {
      KEY = crypto.randomBytes(32);
      fs.writeFileSync(keyFile, KEY.toString('hex'), { mode: 0o600 });
    }
  }
  if (KEY.length !== 32) throw new Error('Vault key must be 32 bytes (64 hex characters)');
}

export function encryptSecret(plaintext) {
  initVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(payload) {
  initVaultKey();
  const [ivHex, tagHex, encHex] = String(payload).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}
