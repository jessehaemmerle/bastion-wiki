import { Router } from 'express';
import { many, one, query } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, forbidden, notFound, pick } from '../lib/http.js';
import { LEVEL, LEVEL_NAME, loadPage, loadSpace, spaceAccess } from '../lib/permissions.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { newSecretId } from '../lib/secrets.js';
import { audit } from '../lib/audit.js';

/**
 * Secret blocks: values are encrypted, never part of page HTML, search, exports or history.
 * Reading the value needs write access to the space; every reveal is audited.
 */
const router = Router();
router.use('/secrets', requireAuth);

const ID = /^[A-Za-z0-9_-]{8,64}$/;

async function loadSecret(user, id, min) {
  if (!ID.test(id)) throw notFound('Geheimnis nicht gefunden');
  const s = await one(
    `SELECT ps.*, u.display_name AS updated_by_name, p.title AS page_title FROM page_secrets ps
       LEFT JOIN users u ON u.id=ps.updated_by LEFT JOIN pages p ON p.id=ps.page_id WHERE ps.id=$1`,
    [id],
  );
  if (!s) throw notFound('Geheimnis nicht gefunden');
  const access = await spaceAccess(user, s.space_id);
  if (access < LEVEL.read) throw notFound('Geheimnis nicht gefunden');
  if (access < min) throw forbidden('Zum Anzeigen von Geheimnissen sind Schreibrechte im Bereich nötig');
  return { ...s, access };
}

const meta = (s) => ({
  id: s.id, label: s.label, pageId: s.page_id, updatedAt: s.updated_at, updatedBy: s.updated_by_name,
  canReveal: s.access >= LEVEL.write, access: LEVEL_NAME[s.access],
});

router.post('/secrets', async (req, res) => {
  const b = pick(req.body, {
    spaceId: { type: 'int', required: true },
    pageId: { type: 'int', nullable: true },
    label: { type: 'string', max: 120 },
    value: { type: 'string', required: true, trim: false, max: 20000 },
  });
  const space = await loadSpace(req.user, b.spaceId, LEVEL.write);
  if (b.pageId) {
    const page = await loadPage(req.user, b.pageId, LEVEL.write);
    if (page.space_id !== space.id) throw badRequest('Seite gehört nicht zu diesem Bereich');
  }
  const id = newSecretId();
  await query(
    `INSERT INTO page_secrets (id, space_id, page_id, label, ciphertext, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
    [id, space.id, b.pageId ?? null, b.label || '', encrypt(b.value), req.user.id],
  );
  await audit(req, 'secret.create', 'secret', id, { label: b.label || '', page: b.pageId ?? null });
  res.status(201).json({ secret: { id, label: b.label || '' } });
});

router.get('/secrets/:id', async (req, res) => {
  res.json({ secret: meta(await loadSecret(req.user, req.params.id, LEVEL.read)) });
});

/** Batch metadata for rendering a page */
router.post('/secrets/lookup', async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((x) => ID.test(String(x))).slice(0, 200);
  if (!ids.length) return res.json({ secrets: [] });
  const rows = await many(
    `SELECT ps.*, u.display_name AS updated_by_name, space_access(ps.space_id, $2) AS access
       FROM page_secrets ps LEFT JOIN users u ON u.id=ps.updated_by WHERE ps.id = ANY($1)`,
    [ids, req.user.id],
  );
  res.json({ secrets: rows.filter((r) => r.access >= LEVEL.read).map(meta) });
});

router.post('/secrets/:id/reveal', async (req, res) => {
  const s = await loadSecret(req.user, req.params.id, LEVEL.write);
  let value;
  try {
    value = decrypt(s.ciphertext);
  } catch {
    throw badRequest('Entschlüsselung fehlgeschlagen – passt der Schlüssel (SECRET_KEY / secret.key) zur Datenbank?');
  }
  await audit(req, 'secret.reveal', 'secret', s.id, { label: s.label, page: s.page_id, pageTitle: s.page_title });
  res.json({ value });
});

router.put('/secrets/:id', async (req, res) => {
  const s = await loadSecret(req.user, req.params.id, LEVEL.write);
  const b = pick(req.body, {
    label: { type: 'string', max: 120 },
    value: { type: 'string', trim: false, max: 20000 },
  }, { partial: true });
  await query(
    `UPDATE page_secrets SET label=COALESCE($2,label), ciphertext=COALESCE($3,ciphertext), updated_by=$4, updated_at=now() WHERE id=$1`,
    [s.id, b.label ?? null, b.value !== undefined ? encrypt(b.value) : null, req.user.id],
  );
  await audit(req, 'secret.update', 'secret', s.id, { label: b.label ?? s.label, valueChanged: b.value !== undefined });
  res.json({ ok: true });
});

router.delete('/secrets/:id', async (req, res) => {
  const s = await loadSecret(req.user, req.params.id, LEVEL.write);
  await query('DELETE FROM page_secrets WHERE id=$1', [s.id]);
  await audit(req, 'secret.delete', 'secret', s.id, { label: s.label });
  res.json({ ok: true });
});

export default router;
