// Channel Admin vault: kanaalinformatie + inloggegevens, versleuteld op
// schijf met AES-256-GCM. De sleutel staat in data/vault.key (gitignored)
// of in de env-variabele BLOOP_VAULT_KEY (hex, 64 tekens).
//
// Belangrijk: dit is een pragmatische kluis voor een klein team. Voor
// YouTube zelf geldt: deel bij voorkeur GEEN wachtwoorden, maar nodig
// freelancers uit via YouTube Studio-kanaalmachtigingen (rol "Editor" of
// "Editor (beperkt)"). Zie docs/beveiliging-toegangsbeheer.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './store.js';

let KEY = null;

export function initVaultKey() {
  if (KEY) return;
  if (process.env.BLOOP_VAULT_KEY) {
    KEY = Buffer.from(process.env.BLOOP_VAULT_KEY, 'hex');
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
  if (KEY.length !== 32) throw new Error('Vault-sleutel moet 32 bytes (64 hex-tekens) zijn');
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
