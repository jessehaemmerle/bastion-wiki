import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { one, query } from '../db/index.js';
import { forbidden, unauthorized } from './http.js';

export const SESSION_COOKIE = 'bastion_sid';
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const hashPassword = (pw) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Passwort muss mindestens 8 Zeichen lang sein';
  if (pw.length > 200) return 'Passwort ist zu lang';
  return null;
}

/** Public projection of a user row */
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    isActive: u.is_active,
    preferences: u.preferences || {},
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
  };
}

export async function createSession(res, req, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + config.sessionDays * 864e5);
  await query(
    `INSERT INTO sessions (id, user_id, user_agent, ip, expires_at) VALUES ($1,$2,$3,$4,$5)`,
    [sha256(token), userId, (req.get('user-agent') || '').slice(0, 300), req.ip, expires],
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    expires,
    path: '/',
  });
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await query('DELETE FROM sessions WHERE id = $1', [sha256(token)]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Resolves req.user from session cookie or bearer API token. Never throws. */
export async function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    if (header.startsWith('Bearer ')) {
      const token = header.slice(7).trim();
      const row = await one(
        `SELECT u.*, t.id AS token_id FROM api_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1 AND u.is_active AND (t.expires_at IS NULL OR t.expires_at > now())`,
        [sha256(token)],
      );
      if (row) {
        req.user = row;
        req.authMethod = 'token';
        query('UPDATE api_tokens SET last_used_at = now() WHERE id = $1', [row.token_id]).catch(() => {});
      }
    } else {
      const token = req.cookies?.[SESSION_COOKIE];
      if (token) {
        const row = await one(
          `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.id = $1 AND s.expires_at > now() AND u.is_active`,
          [sha256(token)],
        );
        if (row) {
          req.user = row;
          req.authMethod = 'session';
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if ((ROLE_RANK[req.user.role] || 0) < ROLE_RANK[role]) return next(forbidden());
    next();
  };
}

/**
 * CSRF protection for cookie-authenticated, state-changing requests:
 * the browser's Origin (or Referer) must match the Host we are served from.
 */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.authMethod === 'token') return next();
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return next(); // non-browser clients
  try {
    const { host } = new URL(origin);
    const expected = req.get('x-forwarded-host') || req.get('host');
    if (host !== expected) return next(forbidden('Ungültige Herkunft der Anfrage'));
  } catch {
    return next(forbidden('Ungültige Herkunft der Anfrage'));
  }
  next();
}

/** Very small in-memory rate limiter for login attempts */
const attempts = new Map();
export function loginRateLimit(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = attempts.get(key) || { count: 0, since: now };
  if (now - entry.since > windowMs) {
    entry.count = 0;
    entry.since = now;
  }
  entry.count += 1;
  attempts.set(key, entry);
  if (attempts.size > 10000) attempts.clear();
  return entry.count <= 10;
}
export const resetLoginRateLimit = (key) => attempts.delete(key);
