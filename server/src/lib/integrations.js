import { one, query } from '../db/index.js';
import { encrypt, tryDecrypt } from './crypto.js';
import { badRequest } from './http.js';

/**
 * Admin-configurable integrations. Stored in `settings` under "int.<section>".
 * Fields listed in `secrets` are encrypted at rest and never sent back to the browser.
 */
export const SECTIONS = {
  ldap: {
    secrets: ['bindPassword'],
    defaults: {
      enabled: false,
      url: '',
      startTls: false,
      caCert: '',
      bindDn: '',
      bindPassword: '',
      baseDn: '',
      userFilter: '(&(objectClass=person)(|(sAMAccountName={username})(uid={username})(mail={username})))',
      usernameAttr: 'sAMAccountName',
      displayNameAttr: 'displayName',
      emailAttr: 'mail',
      groupAttr: 'memberOf',
      groupBaseDn: '',
      groupFilter: '',
      adminGroups: '',
      editorGroups: '',
      viewerGroups: '',
      defaultRole: 'editor',
      syncGroups: true,
    },
  },
  oidc: {
    secrets: ['clientSecret'],
    defaults: {
      enabled: false,
      issuer: '',
      clientId: '',
      clientSecret: '',
      scopes: 'openid profile email',
      buttonLabel: 'Single Sign-on',
      usernameClaim: 'preferred_username',
      groupsClaim: 'groups',
      adminGroups: '',
      editorGroups: '',
      viewerGroups: '',
      defaultRole: 'editor',
      syncGroups: true,
      autoCreate: true,
    },
  },
  security: {
    secrets: [],
    defaults: {
      require2fa: 'off',         // off | admins | all
      localLogin: true,          // show the username/password form
      allowSharing: true,
      maxShareDays: 90,
      publicUrl: '',             // used in e-mails and as OIDC redirect base
    },
  },
  smtp: {
    secrets: ['password'],
    defaults: {
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      user: '',
      password: '',
      from: '',
      digestMinutes: 10,
    },
  },
  backup: {
    secrets: [],
    defaults: { enabled: false, hour: 3, keep: 7 },
  },
  git: {
    secrets: ['remote'],
    defaults: {
      enabled: false,
      remote: '',
      branch: 'main',
      intervalMinutes: 60,
      authorName: 'Bastion',
      authorEmail: 'bastion@localhost',
    },
  },
};

const cache = new Map();

/** Full config incl. decrypted secrets – server-side use only */
export async function getSection(name) {
  if (cache.has(name)) return cache.get(name);
  const def = SECTIONS[name];
  const row = await one('SELECT value FROM settings WHERE key=$1', [`int.${name}`]);
  const out = { ...def.defaults, ...(row?.value || {}) };
  for (const k of def.secrets) out[k] = out[k] ? tryDecrypt(out[k]) : '';
  cache.set(name, out);
  return out;
}

/** Config for the admin UI: secrets replaced by a flag */
export async function getSectionMasked(name) {
  const cfg = await getSection(name);
  const out = { ...cfg };
  for (const k of SECTIONS[name].secrets) {
    out[k] = '';
    out[`${k}Set`] = Boolean(cfg[k]);
  }
  return out;
}

/** Validates against the defaults' types. Secret fields: undefined = keep, '' = clear. */
export async function saveSection(name, patch) {
  const def = SECTIONS[name];
  if (!def) throw badRequest('Unbekannter Bereich');
  const row = await one('SELECT value FROM settings WHERE key=$1', [`int.${name}`]);
  const stored = { ...(row?.value || {}) };
  for (const [k, dv] of Object.entries(def.defaults)) {
    if (!(k in (patch || {})) || patch[k] === undefined) continue;
    let v = patch[k];
    if (typeof dv === 'boolean') v = v === true;
    else if (typeof dv === 'number') {
      v = Number(v);
      if (!Number.isFinite(v)) throw badRequest(`Feld "${k}" muss eine Ganzzahl sein`);
    } else {
      if (typeof v !== 'string') throw badRequest(`Feld "${k}" muss Text sein`);
      v = k === 'caCert' ? v.trim() : v.trim().slice(0, 4000);
    }
    if (def.secrets.includes(k)) stored[k] = v ? encrypt(v) : '';
    else stored[k] = v;
  }
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [`int.${name}`, JSON.stringify(stored)],
  );
  cache.delete(name);
  return getSectionMasked(name);
}

export const clearIntegrationCache = () => cache.clear();

/** Base URL for links in e-mails/webhooks and the OIDC redirect */
export async function publicBase(req) {
  const sec = await getSection('security');
  const configured = (sec.publicUrl || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  if (configured) return configured;
  if (req) return `${req.protocol}://${req.get('host')}`;
  return '';
}
