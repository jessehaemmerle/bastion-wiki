import { Router } from 'express';
import { one, many, query } from '../db/index.js';
import QRCode from 'qrcode';
import {
  createSession, destroySession, hashPassword, verifyPassword, validatePassword,
  requireAuth, loginRateLimit, resetLoginRateLimit, randomToken, sha256, twoFactorRequired, userPayload,
} from '../lib/auth.js';
import { badRequest, conflict, forbidden, HttpError, intParam, notFound, pick, unauthorized } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import { getSection, publicBase } from '../lib/integrations.js';
import { ldapAuthenticate, upsertExternalUser } from '../lib/directory.js';
import { authorizationUrl, handleCallback } from '../lib/oidc.js';
import { encrypt, tryDecrypt } from '../lib/crypto.js';
import { generateSecret, otpauthUri, recoveryCodes, verifyTotp } from '../lib/totp.js';

const router = Router();

const USERNAME = /^[a-zA-Z0-9._-]{2,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ------------------------------------------------------------------ login
const challenges = new Map(); // second factor: token → { userId, exp, tries }
const lastTotp = new Map();   // userId → last accepted counter (no replay within the window)

async function finishLogin(req, res, user, method) {
  await createSession(res, req, user.id);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  req.user = user;
  await audit(req, 'auth.login', 'user', user.id, { method });
  res.json({ user: await userPayload(user) });
}

router.post('/auth/login', async (req, res) => {
  const { username, password } = pick(req.body, {
    username: { type: 'string', required: true, max: 200 },
    password: { type: 'string', required: true, trim: false, max: 200 },
  });
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (!loginRateLimit(key)) throw badRequest('Zu viele Anmeldeversuche – bitte in 15 Minuten erneut versuchen');

  const security = await getSection('security');
  const ldap = await getSection('ldap');
  let user = await one(
    'SELECT * FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
    [username],
  );
  let method = 'password';
  if (user?.auth_source === 'local') {
    if (!security.localLogin && user.role !== 'admin') throw forbidden('Die Anmeldung mit lokalem Konto ist deaktiviert');
    if (!(await verifyPassword(password, user.password_hash))) user = null;
  } else if (ldap.enabled && ldap.url && (!user || user.auth_source === 'ldap')) {
    method = 'ldap';
    let identity = null;
    try {
      identity = await ldapAuthenticate(ldap, username, password);
    } catch (err) {
      console.error('[ldap]', err.message);
      throw new HttpError(503, 'Verzeichnisdienst nicht erreichbar');
    }
    user = identity ? await upsertExternalUser(ldap, identity) : null;
  } else {
    user = null; // SSO accounts cannot sign in with a password
  }
  if (!user) {
    await audit(req, 'auth.login_failed', 'user', null, { username, method });
    throw unauthorized('Benutzername oder Passwort falsch');
  }
  if (!user.is_active) throw forbidden('Dieses Konto ist deaktiviert');
  resetLoginRateLimit(key);

  if (user.totp_enabled) {
    const challenge = randomToken(24);
    for (const [k, v] of challenges) if (v.exp < Date.now()) challenges.delete(k);
    challenges.set(challenge, { userId: user.id, exp: Date.now() + 5 * 60 * 1000, tries: 0, method });
    return res.json({ totpRequired: true, challenge });
  }
  await finishLogin(req, res, user, method);
});

router.post('/auth/login/totp', async (req, res) => {
  const { challenge, code } = pick(req.body, {
    challenge: { type: 'string', required: true, max: 100 },
    code: { type: 'string', required: true, max: 40 },
  });
  const c = challenges.get(challenge);
  if (!c || c.exp < Date.now() || c.tries >= 5) {
    challenges.delete(challenge);
    throw unauthorized('Anmeldung abgelaufen – bitte erneut versuchen');
  }
  c.tries += 1;
  const user = await one('SELECT * FROM users WHERE id=$1 AND is_active', [c.userId]);
  if (!user) throw unauthorized();
  const ok = await checkSecondFactor(user, code);
  if (!ok) {
    await audit(req, 'auth.totp_failed', 'user', user.id);
    throw unauthorized('Code ungültig');
  }
  challenges.delete(challenge);
  await finishLogin(req, res, user, `${c.method}+totp${ok === 'recovery' ? '-recovery' : ''}`);
});

/** true | 'recovery' | false. Recovery codes are single-use. */
async function checkSecondFactor(user, code) {
  const secret = tryDecrypt(user.totp_secret);
  const counter = secret ? verifyTotp(secret, code) : null;
  if (counter !== null) {
    if (lastTotp.get(user.id) === counter) return false;
    lastTotp.set(user.id, counter);
    return true;
  }
  const hash = sha256(String(code).trim().toLowerCase());
  const codes = user.totp_recovery || [];
  if (codes.includes(hash)) {
    await query('UPDATE users SET totp_recovery=$2 WHERE id=$1', [user.id, JSON.stringify(codes.filter((h) => h !== hash))]);
    return 'recovery';
  }
  return false;
}

// ------------------------------------------------------------------ OpenID Connect
const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');

router.get('/auth/oidc/start', async (req, res) => {
  const cfg = await getSection('oidc');
  if (!cfg.enabled || !cfg.issuer || !cfg.clientId) throw notFound('Single Sign-on ist nicht eingerichtet');
  const redirectUri = `${await publicBase(req)}/api/auth/oidc/callback`;
  res.redirect(await authorizationUrl(cfg, { redirectUri, next: safeNext(req.query.next) }));
});

router.get('/auth/oidc/callback', async (req, res) => {
  const fail = (msg) => res.redirect(`/login?sso_error=${encodeURIComponent(msg)}`);
  const cfg = await getSection('oidc');
  if (!cfg.enabled) return fail('Single Sign-on ist nicht eingerichtet');
  if (req.query.error) return fail(String(req.query.error_description || req.query.error).slice(0, 200));
  try {
    const { identity, next } = await handleCallback(cfg, { code: String(req.query.code || ''), state: String(req.query.state || '') });
    const user = await upsertExternalUser(cfg, identity);
    if (!user.is_active) return fail('Dieses Konto ist deaktiviert');
    await createSession(res, req, user.id);
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    req.user = user;
    await audit(req, 'auth.login', 'user', user.id, { method: 'oidc' });
    res.redirect(safeNext(next));
  } catch (err) {
    if (!err.status || err.status >= 500) console.error('[oidc]', err.message);
    await audit(req, 'auth.login_failed', 'user', null, { method: 'oidc', error: err.message });
    fail(err.status && err.status < 600 ? err.message : 'Anmeldung fehlgeschlagen');
  }
});

router.post('/auth/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
});

router.post('/auth/register', async (req, res) => {
  const settings = await getSettings();
  if (!settings.allowRegistration) throw forbidden('Registrierung ist deaktiviert');
  const body = pick(req.body, {
    username: { type: 'string', required: true, pattern: USERNAME },
    email: { type: 'string', pattern: EMAIL, max: 200 },
    displayName: { type: 'string', max: 100 },
    password: { type: 'string', required: true, trim: false },
  });
  const pwErr = validatePassword(body.password);
  if (pwErr) throw badRequest(pwErr);
  const exists = await one('SELECT 1 FROM users WHERE lower(username)=lower($1) OR (email IS NOT NULL AND lower(email)=lower($2))', [body.username, body.email || '']);
  if (exists) throw conflict('Benutzername oder E-Mail bereits vergeben');
  const role = ['editor', 'viewer'].includes(settings.defaultRole) ? settings.defaultRole : 'viewer';
  const user = await one(
    `INSERT INTO users (username, email, display_name, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [body.username, body.email || null, body.displayName || body.username, await hashPassword(body.password), role],
  );
  req.user = user;
  await audit(req, 'auth.register', 'user', user.id);
  await createSession(res, req, user.id);
  res.status(201).json({ user: await userPayload(user) });
});

// ------------------------------------------------------------------ self service
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await userPayload(req.user) });
});

router.patch('/me', requireAuth, async (req, res) => {
  const body = pick(req.body, {
    displayName: { type: 'string', max: 100, min: 1 },
    email: { type: 'string', pattern: EMAIL, max: 200, nullable: true },
    preferences: { type: 'object' },
  }, { partial: true });
  if (body.email) {
    const taken = await one('SELECT 1 FROM users WHERE lower(email)=lower($1) AND id<>$2', [body.email, req.user.id]);
    if (taken) throw conflict('E-Mail bereits vergeben');
  }
  const prefs = body.preferences
    ? { ...(req.user.preferences || {}), ...sanitizePrefs(body.preferences) }
    : req.user.preferences;
  const user = await one(
    `UPDATE users SET display_name = COALESCE($2, display_name),
                      email = CASE WHEN $3::boolean THEN $4 ELSE email END,
                      preferences = $5, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [req.user.id, body.displayName ?? null, 'email' in body, body.email ?? null, prefs],
  );
  res.json({ user: await userPayload(user) });
});

function sanitizePrefs(p) {
  const out = {};
  if (typeof p.theme === 'string' && p.theme.length < 40) out.theme = p.theme;
  if (['light', 'dark', 'system'].includes(p.mode)) out.mode = p.mode;
  if (['de', 'en'].includes(p.language)) out.language = p.language;
  if (typeof p.accent === 'string' && /^(#[0-9a-f]{6})?$/i.test(p.accent)) out.accent = p.accent;
  if (['compact', 'comfortable'].includes(p.density)) out.density = p.density;
  if (typeof p.sidebarCollapsed === 'boolean') out.sidebarCollapsed = p.sidebarCollapsed;
  if (['sans', 'serif', 'mono'].includes(p.font)) out.font = p.font;
  if (typeof p.emailNotifications === 'boolean') out.emailNotifications = p.emailNotifications;
  if (typeof p.autoWatch === 'boolean') out.autoWatch = p.autoWatch;
  return out;
}

router.post('/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = pick(req.body, {
    currentPassword: { type: 'string', required: true, trim: false },
    newPassword: { type: 'string', required: true, trim: false },
  });
  if (req.user.auth_source !== 'local') throw badRequest('Das Passwort wird im Verzeichnis bzw. beim Identitätsanbieter verwaltet');
  if (!(await verifyPassword(currentPassword, req.user.password_hash))) throw badRequest('Aktuelles Passwort ist falsch');
  const err = validatePassword(newPassword);
  if (err) throw badRequest(err);
  await query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [req.user.id, await hashPassword(newPassword)]);
  // Invalidate all other sessions
  const current = req.cookies?.bastion_sid ? sha256(req.cookies.bastion_sid) : '';
  await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2', [req.user.id, current]);
  await audit(req, 'user.password_changed', 'user', req.user.id);
  res.json({ ok: true });
});

router.get('/me/sessions', requireAuth, async (req, res) => {
  const current = req.cookies?.bastion_sid ? sha256(req.cookies.bastion_sid) : '';
  const rows = await many(
    `SELECT id, user_agent, ip, created_at, expires_at FROM sessions
      WHERE user_id=$1 AND expires_at > now() ORDER BY created_at DESC`,
    [req.user.id],
  );
  res.json({
    sessions: rows.map((s) => ({
      id: s.id.slice(0, 12), userAgent: s.user_agent, ip: s.ip, createdAt: s.created_at,
      expiresAt: s.expires_at, current: s.id === current,
    })),
  });
});

router.delete('/me/sessions', requireAuth, async (req, res) => {
  const current = req.cookies?.bastion_sid ? sha256(req.cookies.bastion_sid) : '';
  await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2', [req.user.id, current]);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ two-factor authentication (TOTP)
const pendingTotp = new Map(); // userId → { secret, exp }

router.post('/me/totp/setup', requireAuth, async (req, res) => {
  if (req.authMethod === 'token') throw forbidden();
  if (req.user.auth_source === 'oidc') throw badRequest('Für Single-Sign-on-Konten regelt der Identitätsanbieter die Zwei-Faktor-Anmeldung');
  const secret = generateSecret();
  pendingTotp.set(req.user.id, { secret, exp: Date.now() + 15 * 60 * 1000 });
  const settings = await getSettings();
  const uri = otpauthUri(secret, req.user.username, settings.siteName || 'Bastion');
  res.json({ secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
});

router.post('/me/totp/enable', requireAuth, async (req, res) => {
  if (req.authMethod === 'token') throw forbidden();
  const { code } = pick(req.body, { code: { type: 'string', required: true, max: 20 } });
  const p = pendingTotp.get(req.user.id);
  if (!p || p.exp < Date.now()) throw badRequest('Einrichtung abgelaufen – bitte neu starten');
  if (verifyTotp(p.secret, code) === null) throw badRequest('Code ungültig – Uhrzeit des Geräts prüfen');
  pendingTotp.delete(req.user.id);
  const codes = recoveryCodes();
  await query('UPDATE users SET totp_secret=$2, totp_enabled=true, totp_recovery=$3, updated_at=now() WHERE id=$1',
    [req.user.id, encrypt(p.secret), JSON.stringify(codes.map((c) => sha256(c)))]);
  await audit(req, 'user.totp_enabled', 'user', req.user.id);
  res.json({ recoveryCodes: codes });
});

router.post('/me/totp/recovery', requireAuth, async (req, res) => {
  if (req.authMethod === 'token') throw forbidden();
  const { code } = pick(req.body, { code: { type: 'string', required: true, max: 40 } });
  if (!req.user.totp_enabled || !(await checkSecondFactor(req.user, code))) throw badRequest('Code ungültig');
  const codes = recoveryCodes();
  await query('UPDATE users SET totp_recovery=$2 WHERE id=$1', [req.user.id, JSON.stringify(codes.map((c) => sha256(c)))]);
  await audit(req, 'user.totp_recovery_renewed', 'user', req.user.id);
  res.json({ recoveryCodes: codes });
});

router.post('/me/totp/disable', requireAuth, async (req, res) => {
  if (req.authMethod === 'token') throw forbidden();
  const { code } = pick(req.body, { code: { type: 'string', required: true, max: 40 } });
  if (!req.user.totp_enabled) return res.json({ ok: true });
  const security = await getSection('security');
  if (twoFactorRequired(security, req.user)) throw badRequest('Zwei-Faktor-Anmeldung ist für dein Konto vorgeschrieben');
  if (!(await checkSecondFactor(req.user, code))) throw badRequest('Code ungültig');
  await query("UPDATE users SET totp_secret=NULL, totp_enabled=false, totp_recovery='[]', updated_at=now() WHERE id=$1", [req.user.id]);
  await audit(req, 'user.totp_disabled', 'user', req.user.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ API tokens
router.get('/me/tokens', requireAuth, async (req, res) => {
  const rows = await many(
    `SELECT id, name, token_prefix, last_used_at, expires_at, created_at FROM api_tokens
      WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.user.id],
  );
  res.json({ tokens: rows });
});

router.post('/me/tokens', requireAuth, async (req, res) => {
  if (req.authMethod === 'token') throw forbidden('API-Tokens können nur über die Weboberfläche erstellt werden');
  const { name, expiresInDays } = pick(req.body, {
    name: { type: 'string', required: true, max: 80 },
    expiresInDays: { type: 'int' },
  });
  const token = `bst_${randomToken(24)}`;
  const expires = expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 864e5) : null;
  const row = await one(
    `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix, expires_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, name, token_prefix, expires_at, created_at`,
    [req.user.id, name, sha256(token), token.slice(0, 10), expires],
  );
  await audit(req, 'token.create', 'api_token', row.id, { name });
  res.status(201).json({ token: { ...row, secret: token } });
});

router.delete('/me/tokens/:id', requireAuth, async (req, res) => {
  const id = intParam(req.params.id);
  const { rowCount } = await query('DELETE FROM api_tokens WHERE id=$1 AND user_id=$2', [id, req.user.id]);
  if (!rowCount) throw notFound();
  await audit(req, 'token.delete', 'api_token', id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ directory (for permission pickers)
router.get('/directory', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const like = `%${q}%`;
  const users = await many(
    `SELECT id, username, display_name FROM users
      WHERE is_active AND ($1 = '' OR username ILIKE $2 OR display_name ILIKE $2)
      ORDER BY display_name LIMIT 20`,
    [q, like],
  );
  const groups = await many(
    `SELECT g.id, g.name, (SELECT count(*) FROM group_members m WHERE m.group_id=g.id)::int AS members
       FROM groups g WHERE $1 = '' OR g.name ILIKE $2 ORDER BY g.name LIMIT 20`,
    [q, like],
  );
  res.json({
    users: users.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name })),
    groups,
  });
});

export default router;
