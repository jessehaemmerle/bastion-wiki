import { Router } from 'express';
import { one, many, query } from '../db/index.js';
import {
  createSession, destroySession, hashPassword, verifyPassword, validatePassword,
  publicUser, requireAuth, loginRateLimit, resetLoginRateLimit, randomToken, sha256,
} from '../lib/auth.js';
import { badRequest, conflict, forbidden, intParam, notFound, pick, unauthorized } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';

const router = Router();

const USERNAME = /^[a-zA-Z0-9._-]{2,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/auth/login', async (req, res) => {
  const { username, password } = pick(req.body, {
    username: { type: 'string', required: true, max: 200 },
    password: { type: 'string', required: true, trim: false, max: 200 },
  });
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (!loginRateLimit(key)) throw badRequest('Zu viele Anmeldeversuche – bitte in 15 Minuten erneut versuchen');

  const user = await one(
    'SELECT * FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
    [username],
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await audit(req, 'auth.login_failed', 'user', user?.id, { username });
    throw unauthorized('Benutzername oder Passwort falsch');
  }
  if (!user.is_active) throw forbidden('Dieses Konto ist deaktiviert');

  resetLoginRateLimit(key);
  await createSession(res, req, user.id);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  req.user = user;
  await audit(req, 'auth.login', 'user', user.id);
  res.json({ user: publicUser(user) });
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
  res.status(201).json({ user: publicUser(user) });
});

// ------------------------------------------------------------------ self service
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user) });
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
  res.json({ user: publicUser(user) });
});

function sanitizePrefs(p) {
  const out = {};
  if (typeof p.theme === 'string' && p.theme.length < 40) out.theme = p.theme;
  if (['light', 'dark', 'system'].includes(p.mode)) out.mode = p.mode;
  if (typeof p.accent === 'string' && /^(#[0-9a-f]{6})?$/i.test(p.accent)) out.accent = p.accent;
  if (['compact', 'comfortable'].includes(p.density)) out.density = p.density;
  if (typeof p.sidebarCollapsed === 'boolean') out.sidebarCollapsed = p.sidebarCollapsed;
  if (['sans', 'serif', 'mono'].includes(p.font)) out.font = p.font;
  return out;
}

router.post('/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = pick(req.body, {
    currentPassword: { type: 'string', required: true, trim: false },
    newPassword: { type: 'string', required: true, trim: false },
  });
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
