import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from './http.js';

/**
 * OpenID Connect – authorization code flow with PKCE (Keycloak, Authentik, Entra ID, Google, Okta, …).
 */
const discoveryCache = new Map();
const jwksCache = new Map();
const pending = new Map(); // state → { nonce, verifier, next, redirectUri, exp }

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export async function discover(issuer) {
  const key = issuer.replace(/\/+$/, '');
  const hit = discoveryCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.doc;
  const res = await fetch(`${key}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new HttpError(502, `OIDC-Discovery fehlgeschlagen (HTTP ${res.status})`);
  const doc = await res.json();
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) throw new HttpError(502, 'OIDC-Discovery unvollständig');
  discoveryCache.set(key, { doc, exp: Date.now() + 10 * 60 * 1000 });
  return doc;
}

function jwks(uri) {
  if (!jwksCache.has(uri)) jwksCache.set(uri, createRemoteJWKSet(new URL(uri)));
  return jwksCache.get(uri);
}

function cleanup() {
  const now = Date.now();
  for (const [k, v] of pending) if (v.exp < now) pending.delete(k);
}

/** Returns the URL of the identity provider to redirect the browser to */
export async function authorizationUrl(cfg, { redirectUri, next }) {
  const doc = await discover(cfg.issuer);
  cleanup();
  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  pending.set(state, { nonce, verifier, next, redirectUri, exp: Date.now() + 10 * 60 * 1000 });
  const url = new URL(doc.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope: cfg.scopes || 'openid profile email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

const claim = (claims, path) => String(path || '').split('.').reduce((o, k) => (o == null ? undefined : o[k]), claims);

/** Handles the callback: code → tokens → verified claims → identity */
export async function handleCallback(cfg, { code, state }) {
  const p = pending.get(state);
  pending.delete(state);
  if (!p || p.exp < Date.now()) throw new HttpError(400, 'Anmeldung abgelaufen – bitte erneut versuchen');
  const doc = await discover(cfg.issuer);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: p.redirectUri,
    code_verifier: p.verifier,
    client_id: cfg.clientId,
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const methods = doc.token_endpoint_auth_methods_supported || ['client_secret_basic'];
  if (cfg.clientSecret) {
    if (methods.includes('client_secret_basic')) {
      headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString('base64')}`;
    } else {
      body.set('client_secret', cfg.clientSecret);
    }
  }
  const res = await fetch(doc.token_endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
  const tokens = await res.json().catch(() => ({}));
  if (!res.ok || !tokens.id_token) {
    throw new HttpError(502, `Token-Abruf fehlgeschlagen: ${tokens.error_description || tokens.error || `HTTP ${res.status}`}`);
  }
  const { payload } = await jwtVerify(tokens.id_token, jwks(doc.jwks_uri), {
    issuer: doc.issuer,
    audience: cfg.clientId,
    clockTolerance: 60,
  });
  if (payload.nonce !== p.nonce) throw new HttpError(400, 'Ungültige Anmeldeantwort (nonce)');

  let claims = { ...payload };
  if (doc.userinfo_endpoint && tokens.access_token) {
    try {
      const info = await fetch(doc.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(8000) });
      if (info.ok) {
        const data = await info.json();
        if (data.sub === payload.sub) claims = { ...data, ...claims, ...(claim(claims, cfg.groupsClaim) ? {} : { [cfg.groupsClaim]: claim(data, cfg.groupsClaim) }) };
      }
    } catch { /* userinfo is optional */ }
  }
  const groups = claim(claims, cfg.groupsClaim);
  const username = claim(claims, cfg.usernameClaim) || claims.preferred_username || claims.email || claims.sub;
  return {
    next: p.next,
    identity: {
      source: 'oidc',
      externalId: String(claims.sub),
      username: String(username).replace(/@.*$/, '').replace(/[^a-zA-Z0-9._-]/g, '-'),
      displayName: claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || String(username),
      email: claims.email || null,
      groups: Array.isArray(groups) ? groups.map(String) : groups ? String(groups).split(/[\s,]+/) : [],
    },
  };
}
