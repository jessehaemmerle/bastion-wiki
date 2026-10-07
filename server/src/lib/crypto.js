import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Symmetric encryption for secrets at rest (secret blocks, TOTP seeds, LDAP/SMTP passwords, webhook URLs).
 * Key: SECRET_KEY env (any string, stretched with scrypt) or a random key generated once in DATA_DIR/secret.key.
 * Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>" (AES-256-GCM).
 */
let key = null;

export const keyFile = () => path.join(config.dataDir, 'secret.key');

function loadKey() {
  if (key) return key;
  if (process.env.SECRET_KEY) {
    key = crypto.scryptSync(process.env.SECRET_KEY, 'bastion-secret-key', 32);
    return key;
  }
  const file = keyFile();
  if (fs.existsSync(file)) {
    key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  } else {
    fs.mkdirSync(config.dataDir, { recursive: true });
    key = crypto.randomBytes(32);
    fs.writeFileSync(file, `${key.toString('base64')}\n`, { mode: 0o600 });
    console.log(`[crypto] neuer Schlüssel erzeugt: ${file} – zusammen mit der Datenbank sichern!`);
  }
  if (key.length !== 32) throw new Error('secret.key ist ungültig (32 Byte Base64 erwartet)');
  return key;
}

export const keySource = () => (process.env.SECRET_KEY ? 'env' : 'file');

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decrypt(blob) {
  if (!blob) return '';
  const [v, iv, tag, data] = String(blob).split(':');
  if (v !== 'v1') throw new Error('Unbekanntes Verschlüsselungsformat');
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(iv, 'base64'), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Decrypts or returns '' when the key does not match (e.g. restored backup without key) */
export function tryDecrypt(blob) {
  try { return decrypt(blob); } catch { return ''; }
}

/** Make sure the key exists at startup, so it is created before the first secret */
export const initCrypto = () => { loadKey(); };
