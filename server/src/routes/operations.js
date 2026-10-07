import { Router } from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import multer from 'multer';
import { many, one, query } from '../db/index.js';
import { requireRole } from '../lib/auth.js';
import { badRequest, intParam, notFound, pick } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { encrypt, tryDecrypt } from '../lib/crypto.js';
import { checkExternalLinks, ensureLinkIndex } from '../lib/links.js';
import { EVENTS, testWebhook } from '../lib/notify.js';
import { backupPath, backupStream, createBackup, listBackups, restoreBackup } from '../lib/backup.js';
import { gitAvailable, gitState, syncGit } from '../lib/gitsync.js';
import { getSectionMasked } from '../lib/integrations.js';

/** Administration: link check, webhooks, backups, Git sync */
const router = Router();
router.use('/admin/ops', requireRole('admin'));

// ------------------------------------------------------------------ link check
router.get('/admin/ops/links', async (_req, res) => {
  const [broken, external, unlinked, stats] = await Promise.all([
    many(
      `SELECT l.source_id, l.kind, l.target_id, l.href, l.label, p.title AS source_title, s.key AS space_key
         FROM page_links l JOIN pages p ON p.id=l.source_id JOIN spaces s ON s.id=p.space_id
        WHERE (l.kind='page' AND NOT EXISTS (SELECT 1 FROM pages x WHERE x.id=l.target_id))
           OR (l.kind='attachment' AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.id=l.target_id))
        ORDER BY p.title LIMIT 500`,
    ),
    many(
      `SELECT c.href, c.status, c.error, c.checked_at,
              json_agg(DISTINCT jsonb_build_object('id', p.id, 'title', p.title)) AS pages
         FROM link_checks c JOIN page_links l ON l.href=c.href AND l.kind='external' JOIN pages p ON p.id=l.source_id
        WHERE c.status = 0 OR c.status >= 400
        GROUP BY c.href, c.status, c.error, c.checked_at ORDER BY c.status, c.href LIMIT 500`,
    ),
    many(
      `SELECT p.id, p.title, p.page_type, p.updated_at, s.key AS space_key, s.name AS space_name,
              (SELECT count(*) FROM pages c WHERE c.parent_id=p.id)::int AS children
         FROM pages p JOIN spaces s ON s.id=p.space_id
        WHERE NOT EXISTS (SELECT 1 FROM page_links l WHERE l.kind='page' AND l.target_id=p.id AND l.source_id<>p.id)
        ORDER BY p.updated_at ASC LIMIT 500`,
    ),
    one(`SELECT count(*) FILTER (WHERE kind='page')::int AS internal,
                count(*) FILTER (WHERE kind='attachment')::int AS files,
                count(DISTINCT href) FILTER (WHERE kind='external')::int AS external,
                (SELECT count(*) FROM link_checks)::int AS checked,
                (SELECT max(checked_at) FROM link_checks) AS last_check
           FROM page_links`),
  ]);
  res.json({
    stats,
    broken: broken.map((b) => ({ sourceId: b.source_id, sourceTitle: b.source_title, spaceKey: b.space_key, kind: b.kind, targetId: b.target_id, href: b.href, label: b.label })),
    external: external.map((e) => ({ href: e.href, status: e.status, error: e.error, checkedAt: e.checked_at, pages: e.pages })),
    unlinked: unlinked.map((u) => ({ id: u.id, title: u.title, pageType: u.page_type, updatedAt: u.updated_at, spaceKey: u.space_key, spaceName: u.space_name, children: u.children })),
  });
});

router.post('/admin/ops/links/check', async (req, res) => {
  const checked = await checkExternalLinks({ limit: 300 });
  await audit(req, 'admin.links.check', 'system', null, { checked });
  res.json({ checked });
});

router.post('/admin/ops/links/reindex', async (req, res) => {
  const pages = await ensureLinkIndex(true);
  res.json({ pages });
});

// ------------------------------------------------------------------ webhooks
const hookSchema = {
  name: { type: 'string', max: 80, required: true },
  kind: { type: 'string', enum: ['generic', 'slack', 'teams', 'matrix', 'discord'], required: true },
  url: { type: 'string', max: 2000, pattern: /^https?:\/\/\S+$/ },
  events: { type: 'array' },
  spaceIds: { type: 'array' },
  isActive: { type: 'bool' },
};

const mapHook = (h) => {
  const url = tryDecrypt(h.url);
  let host = '';
  try { host = new URL(url).host; } catch { /* ignore */ }
  return {
    id: h.id, name: h.name, kind: h.kind, host, events: h.events, spaceIds: h.space_ids, isActive: h.is_active,
    lastStatus: h.last_status, lastAt: h.last_at, createdAt: h.created_at,
  };
};

router.get('/admin/ops/webhooks', async (_req, res) => {
  res.json({ webhooks: (await many('SELECT * FROM webhooks ORDER BY name')).map(mapHook), events: EVENTS });
});

router.post('/admin/ops/webhooks', async (req, res) => {
  const b = pick(req.body, { ...hookSchema, url: { ...hookSchema.url, required: true } });
  const events = (b.events || EVENTS).filter((e) => EVENTS.includes(e));
  const row = await one(
    `INSERT INTO webhooks (name, kind, url, events, space_ids, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.name, b.kind, encrypt(b.url), events, (b.spaceIds || []).map(Number).filter(Number.isInteger), b.isActive ?? true],
  );
  await audit(req, 'admin.webhook.create', 'webhook', row.id, { name: b.name, kind: b.kind });
  res.status(201).json({ webhook: mapHook(row) });
});

router.put('/admin/ops/webhooks/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const b = pick(req.body, hookSchema, { partial: true });
  const row = await one(
    `UPDATE webhooks SET name=COALESCE($2,name), kind=COALESCE($3,kind), url=COALESCE($4,url), events=COALESCE($5,events),
            space_ids=COALESCE($6,space_ids), is_active=COALESCE($7,is_active) WHERE id=$1 RETURNING *`,
    [id, b.name ?? null, b.kind ?? null, b.url ? encrypt(b.url) : null, b.events ? b.events.filter((e) => EVENTS.includes(e)) : null,
      b.spaceIds ? b.spaceIds.map(Number).filter(Number.isInteger) : null, b.isActive ?? null],
  );
  if (!row) throw notFound();
  await audit(req, 'admin.webhook.update', 'webhook', id, { name: row.name });
  res.json({ webhook: mapHook(row) });
});

router.delete('/admin/ops/webhooks/:id', async (req, res) => {
  const id = intParam(req.params.id);
  await query('DELETE FROM webhooks WHERE id=$1', [id]);
  await audit(req, 'admin.webhook.delete', 'webhook', id);
  res.json({ ok: true });
});

router.post('/admin/ops/webhooks/:id/test', async (req, res) => {
  const hook = await one('SELECT * FROM webhooks WHERE id=$1', [intParam(req.params.id)]);
  if (!hook) throw notFound();
  const status = await testWebhook(hook);
  res.json({ status, ok: /^2\d\d$/.test(status) });
});

// ------------------------------------------------------------------ backups
router.get('/admin/ops/backups', async (_req, res) => {
  res.json({ backups: await listBackups(), schedule: await getSectionMasked('backup') });
});

router.post('/admin/ops/backups', async (req, res) => {
  const b = await createBackup('manual');
  await audit(req, 'admin.backup.create', 'system', b.name, { size: b.size });
  res.status(201).json({ backup: b });
});

router.get('/admin/ops/backups/:name', async (req, res) => {
  const file = backupPath(req.params.name);
  if (!file) throw notFound('Sicherung nicht gefunden');
  await audit(req, 'admin.backup.download', 'system', req.params.name);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="bastion-${req.params.name}"`);
  backupStream(req.params.name).pipe(res);
});

router.delete('/admin/ops/backups/:name', async (req, res) => {
  const file = backupPath(req.params.name);
  if (!file) throw notFound('Sicherung nicht gefunden');
  await fs.rm(file, { force: true });
  await audit(req, 'admin.backup.delete', 'system', req.params.name);
  res.json({ ok: true });
});

const restoreUpload = multer({ dest: os.tmpdir(), limits: { fileSize: Number(process.env.IMPORT_MAX_MB || 1024) * 1024 * 1024, files: 1 } });

/** Restore from a stored backup (body.name) or an uploaded archive (multipart "file"). Needs confirm=RESTORE. */
router.post('/admin/ops/restore', async (req, res) => {
  await new Promise((resolve, reject) => restoreUpload.single('file')(req, res, (err) => (err ? reject(badRequest(err.message)) : resolve())));
  if (req.body?.confirm !== 'RESTORE') throw badRequest('Bitte die Wiederherstellung bestätigen');
  const file = req.file?.path || backupPath(req.body?.name);
  if (!file) throw notFound('Sicherung nicht gefunden');
  // safety net: snapshot of the current state first
  const before = await createBackup('manual');
  try {
    const result = await restoreBackup(file);
    console.log(`[backup] wiederhergestellt (vorher gesichert als ${before.name})`);
    res.json({ ok: true, safetyBackup: before.name, warnings: result.warnings, createdAt: result.manifest.createdAt });
  } finally {
    if (req.file) await fs.rm(req.file.path, { force: true });
  }
});

// ------------------------------------------------------------------ git
router.get('/admin/ops/git', async (_req, res) => {
  res.json({ state: { ...gitState }, available: await gitAvailable() });
});

router.post('/admin/ops/git/sync', async (req, res) => {
  try {
    const result = await syncGit({ force: true });
    await audit(req, 'admin.git.sync', 'system', null, result || {});
    res.json({ result, state: { ...gitState } });
  } catch (err) {
    res.json({ error: err.message, state: { ...gitState } });
  }
});

export default router;
