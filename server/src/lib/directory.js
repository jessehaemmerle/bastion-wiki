import { Client } from 'ldapts';
import { tx } from '../db/index.js';
import { HttpError } from './http.js';

/**
 * Shared logic for external identities (LDAP / Active Directory and OpenID Connect):
 * role mapping from groups, mirroring groups into Bastion groups, creating/updating the local account.
 */

/** One group per line (or ";"-separated). Plain names may also be comma-separated; DNs contain commas themselves. */
const list = (s) => String(s || '').split(/[\n;]+/).flatMap((x) => (x.includes('=') ? [x] : x.split(','))).map((x) => x.trim()).filter(Boolean);
const cnOf = (dn) => (String(dn).match(/^cn=([^,]+)/i) || [])[1] || String(dn);

/** True when any of the user's groups matches an entry (DN or plain name, case-insensitive) */
export function inGroups(userGroups, configured) {
  const wanted = list(configured).map((g) => g.toLowerCase());
  if (!wanted.length) return false;
  return userGroups.some((g) => {
    const full = String(g).toLowerCase();
    return wanted.includes(full) || wanted.includes(cnOf(g).toLowerCase());
  });
}

export function mapRole(cfg, groups) {
  if (inGroups(groups, cfg.adminGroups)) return 'admin';
  if (inGroups(groups, cfg.editorGroups)) return 'editor';
  if (inGroups(groups, cfg.viewerGroups)) return 'viewer';
  return cfg.defaultRole; // may be 'none'
}

const hasMapping = (cfg) => Boolean(list(cfg.adminGroups).length || list(cfg.editorGroups).length || list(cfg.viewerGroups).length);

/**
 * Creates or updates the account for an external identity.
 * identity: { source, externalId, username, displayName, email, groups[] }
 */
export async function upsertExternalUser(cfg, identity) {
  const role = mapRole(cfg, identity.groups);
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    throw new HttpError(403, 'Kein Zugriff: Das Konto ist in keiner berechtigten Gruppe');
  }
  return tx(async (c) => {
    let { rows: [user] } = await c.query('SELECT * FROM users WHERE auth_source=$1 AND external_id=$2', [identity.source, identity.externalId]);
    let username = String(identity.username || '').trim().slice(0, 40) || identity.externalId.slice(0, 40);
    if (!user) {
      const { rows: [byName] } = await c.query('SELECT auth_source FROM users WHERE lower(username)=lower($1)', [username]);
      // never take over a local account with the same name
      if (byName?.auth_source === 'local') throw new HttpError(409, 'Der Benutzername ist bereits für ein lokales Konto vergeben');
      // same name from another identity of this source (e.g. jane@a / jane@b) → jane-2
      for (let i = 2; byName; i++) {
        const candidate = `${username.slice(0, 36)}-${i}`;
        const { rows } = await c.query('SELECT 1 FROM users WHERE lower(username)=lower($1)', [candidate]);
        if (!rows.length) { username = candidate; break; }
      }
    }
    const email = identity.email
      ? ((await c.query('SELECT 1 FROM users WHERE lower(email)=lower($1) AND id<>$2', [identity.email, user?.id || 0])).rows.length ? null : identity.email)
      : null;
    if (!user) {
      if (identity.source === 'oidc' && cfg.autoCreate === false) throw new HttpError(403, 'Für dieses Konto existiert kein Zugang im Wiki');
      ({ rows: [user] } = await c.query(
        `INSERT INTO users (username, email, display_name, password_hash, role, auth_source, external_id)
         VALUES ($1,$2,$3,'!external',$4,$5,$6) RETURNING *`,
        [username, email, identity.displayName || username, role, identity.source, identity.externalId],
      ));
    } else {
      ({ rows: [user] } = await c.query(
        `UPDATE users SET external_id=$2, display_name=COALESCE(NULLIF($3,''), display_name),
                email=COALESCE($4, email), role=CASE WHEN $5 THEN $6 ELSE role END, updated_at=now()
          WHERE id=$1 RETURNING *`,
        [user.id, identity.externalId, identity.displayName || '', email, hasMapping(cfg), role],
      ));
    }
    if (cfg.syncGroups) {
      const { rows: groups } = await c.query("SELECT id, external_name FROM groups WHERE coalesce(external_name,'') <> ''");
      for (const g of groups) {
        if (inGroups(identity.groups, g.external_name)) {
          await c.query('INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g.id, user.id]);
        } else {
          await c.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2', [g.id, user.id]);
        }
      }
    }
    return user;
  });
}

// ------------------------------------------------------------------ LDAP

/** RFC 4515 escaping for values in search filters */
export const escapeFilter = (s) => String(s).replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

const first = (v) => (Array.isArray(v) ? v[0] : v) ?? '';
const all = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map(String);
/** Attribute names are case-insensitive in LDAP; servers differ in what they send back */
const attr = (entry, name) => {
  if (!name) return undefined;
  if (name in entry) return entry[name];
  const key = Object.keys(entry).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? entry[key] : undefined;
};

function ldapClient(cfg) {
  const tlsOptions = cfg.caCert ? { ca: [cfg.caCert] } : undefined;
  return new Client({ url: cfg.url, timeout: 8000, connectTimeout: 8000, tlsOptions });
}

async function openBound(cfg) {
  const client = ldapClient(cfg);
  if (cfg.startTls) await client.startTLS(cfg.caCert ? { ca: [cfg.caCert] } : {});
  if (cfg.bindDn) await client.bind(cfg.bindDn, cfg.bindPassword);
  return client;
}

async function findUser(client, cfg, username) {
  const filter = cfg.userFilter.replaceAll('{username}', escapeFilter(username));
  // attribute names are case-insensitive; request them lower-case, objectGUID as raw bytes
  const attributes = [...new Set(['dn', cfg.usernameAttr, cfg.displayNameAttr, cfg.emailAttr, cfg.groupAttr, 'cn', 'objectGUID', 'entryUUID']
    .filter(Boolean).map((a) => a.toLowerCase()))];
  const { searchEntries } = await client.search(cfg.baseDn, {
    scope: 'sub', filter, attributes, sizeLimit: 2, explicitBufferAttributes: ['objectGUID', 'objectguid'],
  });
  return searchEntries;
}

async function groupsOf(client, cfg, entry, username) {
  const groups = cfg.groupAttr ? all(attr(entry, cfg.groupAttr)) : [];
  if (cfg.groupFilter && cfg.groupBaseDn) {
    const filter = cfg.groupFilter.replaceAll('{dn}', escapeFilter(entry.dn)).replaceAll('{username}', escapeFilter(username));
    const { searchEntries } = await client.search(cfg.groupBaseDn, { scope: 'sub', filter, attributes: ['dn', 'cn'], sizeLimit: 500 });
    groups.push(...searchEntries.map((g) => g.dn));
  }
  return groups;
}

function stableId(entry) {
  const guid = attr(entry, 'objectGUID') || attr(entry, 'entryUUID');
  if (Buffer.isBuffer(guid)) return guid.toString('hex');
  return first(guid) || entry.dn;
}

/** Verifies the password against the directory. Returns an identity or null. */
export async function ldapAuthenticate(cfg, username, password) {
  // An empty password would be an anonymous bind – which many servers accept.
  if (!password) return null;
  const client = await openBound(cfg);
  try {
    const entries = await findUser(client, cfg, username);
    if (entries.length !== 1) return null;
    const entry = entries[0];
    const groups = await groupsOf(client, cfg, entry, username);
    const userClient = ldapClient(cfg);
    try {
      if (cfg.startTls) await userClient.startTLS(cfg.caCert ? { ca: [cfg.caCert] } : {});
      await userClient.bind(entry.dn, password);
    } catch {
      return null;
    } finally {
      await userClient.unbind().catch(() => {});
    }
    return {
      source: 'ldap',
      externalId: stableId(entry),
      username: first(attr(entry, cfg.usernameAttr)) || username,
      displayName: first(attr(entry, cfg.displayNameAttr)) || first(attr(entry, 'cn')) || username,
      email: first(attr(entry, cfg.emailAttr)) || null,
      groups,
    };
  } finally {
    await client.unbind().catch(() => {});
  }
}

/** Connection test for the admin UI: bind with the service account, optionally look up one user */
export async function ldapTest(cfg, username) {
  const client = await openBound(cfg);
  try {
    if (!username) return { ok: true };
    const entries = await findUser(client, cfg, username);
    if (!entries.length) return { ok: true, found: false };
    const entry = entries[0];
    const groups = await groupsOf(client, cfg, entry, username);
    return {
      ok: true,
      found: true,
      dn: entry.dn,
      username: first(attr(entry, cfg.usernameAttr)) || username,
      displayName: first(attr(entry, cfg.displayNameAttr)) || first(attr(entry, 'cn')),
      email: first(attr(entry, cfg.emailAttr)) || null,
      groups,
      role: mapRole(cfg, groups),
    };
  } finally {
    await client.unbind().catch(() => {});
  }
}
