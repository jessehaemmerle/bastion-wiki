import { Router } from 'express';
import { requireRole } from '../lib/auth.js';
import { badRequest, notFound, pick } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { getSection, getSectionMasked, publicBase, saveSection, SECTIONS } from '../lib/integrations.js';
import { keyFile, keySource } from '../lib/crypto.js';
import { ldapTest } from '../lib/directory.js';
import { discover } from '../lib/oidc.js';
import { renderMail, sendMail } from '../lib/mail.js';
import { getSettings } from '../lib/settings.js';

const router = Router();
router.use('/admin/integrations', requireRole('admin'));

router.get('/admin/integrations', async (req, res) => {
  const out = {};
  for (const name of Object.keys(SECTIONS)) out[name] = await getSectionMasked(name);
  res.json({
    integrations: out,
    meta: {
      oidcRedirectUri: `${await publicBase(req)}/api/auth/oidc/callback`,
      keySource: keySource(),
      keyFile: keySource() === 'file' ? keyFile() : null,
    },
  });
});

router.put('/admin/integrations/:section', async (req, res) => {
  const name = req.params.section;
  if (!SECTIONS[name]) throw notFound('Unbekannter Bereich');
  const saved = await saveSection(name, req.body || {});
  const changed = Object.keys(req.body || {}).filter((k) => k in SECTIONS[name].defaults);
  await audit(req, 'admin.integration', 'settings', name, { fields: changed });
  res.json({ [name]: saved });
});

/** Merge unsaved form values over the stored config (secrets: empty = use stored one) */
async function draftConfig(name, body) {
  const stored = await getSection(name);
  const out = { ...stored };
  for (const k of Object.keys(SECTIONS[name].defaults)) {
    if (body?.[k] === undefined) continue;
    if (SECTIONS[name].secrets.includes(k) && body[k] === '') continue;
    out[k] = body[k];
  }
  return out;
}

router.post('/admin/integrations/ldap/test', async (req, res) => {
  const cfg = await draftConfig('ldap', req.body?.config);
  if (!cfg.url) throw badRequest('Bitte die Server-Adresse angeben');
  try {
    res.json({ result: await ldapTest(cfg, String(req.body?.username || '').trim()) });
  } catch (err) {
    res.json({ result: { ok: false, error: err.message } });
  }
});

router.post('/admin/integrations/oidc/test', async (req, res) => {
  const cfg = await draftConfig('oidc', req.body?.config);
  if (!cfg.issuer) throw badRequest('Bitte die Issuer-URL angeben');
  try {
    const doc = await discover(cfg.issuer);
    res.json({ result: { ok: true, issuer: doc.issuer, authorization: doc.authorization_endpoint, scopes: doc.scopes_supported || [] } });
  } catch (err) {
    res.json({ result: { ok: false, error: err.message } });
  }
});

router.post('/admin/integrations/smtp/test', async (req, res) => {
  const { to } = pick(req.body, { to: { type: 'string', required: true, max: 200, pattern: /^[^\s@]+@[^\s@]+$/ } });
  const settings = await getSettings();
  const mail = renderMail({
    siteName: settings.siteName,
    heading: 'Test-E-Mail',
    intro: 'Der E-Mail-Versand ist korrekt eingerichtet.',
    footer: `${settings.siteName} · ${new Date().toISOString()}`,
  });
  try {
    await sendMail({ to, subject: `${settings.siteName}: Test-E-Mail`, ...mail });
    res.json({ result: { ok: true } });
  } catch (err) {
    res.json({ result: { ok: false, error: err.message } });
  }
});

export default router;
