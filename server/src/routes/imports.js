import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config.js';
import { many, one } from '../db/index.js';
import { requireRole } from '../lib/auth.js';
import { badRequest, notFound, pick } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { SOURCES, discard, startAnalysis, startRun } from '../importers/jobs.js';

const router = Router();
router.use('/admin/imports', requireRole('admin'));

const tmpDir = path.join(config.dataDir, 'imports');
fs.mkdirSync(tmpDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({ destination: tmpDir, filename: (_r, _f, cb) => cb(null, crypto.randomBytes(12).toString('hex')) }),
  limits: { fileSize: Number(process.env.IMPORT_MAX_MB || 1024) * 1024 * 1024, files: 2 },
});

const mapJob = (j) => ({
  id: j.id, source: j.source, label: j.label, status: j.status, progress: j.progress, total: j.total,
  preview: j.preview, result: j.result, warnings: j.warnings, error: j.error, options: j.options,
  createdAt: j.created_at, finishedAt: j.finished_at, createdBy: j.created_by_name,
});

router.get('/admin/imports/sources', (_req, res) => {
  res.json({ sources: Object.entries(SOURCES).map(([id, s]) => ({ id, ...s })) });
});

router.get('/admin/imports', async (_req, res) => {
  const rows = await many(
    `SELECT j.id, j.source, j.label, j.status, j.progress, j.total, j.result, j.error, j.created_at, j.finished_at,
            '{}'::jsonb AS preview, '[]'::jsonb AS warnings, '{}'::jsonb AS options, u.display_name AS created_by_name
       FROM import_jobs j LEFT JOIN users u ON u.id=j.created_by ORDER BY j.created_at DESC LIMIT 50`,
  );
  res.json({ jobs: rows.map(mapJob) });
});

router.get('/admin/imports/:id', async (req, res) => {
  const j = await one('SELECT j.*, u.display_name AS created_by_name FROM import_jobs j LEFT JOIN users u ON u.id=j.created_by WHERE j.id=$1', [req.params.id]);
  if (!j) throw notFound('Import nicht gefunden');
  res.json({ job: mapJob(j) });
});

router.post('/admin/imports', async (req, res) => {
  await new Promise((resolve, reject) => upload.fields([{ name: 'file', maxCount: 1 }, { name: 'extra', maxCount: 1 }])(req, res, (err) => (err ? reject(badRequest(err.message)) : resolve())));
  const file = req.files?.file?.[0];
  const extra = req.files?.extra?.[0];
  const cleanup = () => [file, extra].forEach((f) => f && fs.rm(f.path, { force: true }, () => {}));
  const source = String(req.body.source || '');
  const def = SOURCES[source];
  if (!def) { cleanup(); throw badRequest('Unbekannte Importquelle'); }
  let connection = null;
  if (def.kind === 'file' && !file) { cleanup(); throw badRequest('Bitte eine Exportdatei hochladen'); }
  if (def.kind === 'api') {
    connection = {
      url: String(req.body.url || ''),
      token: String(req.body.token || ''),
      tokenId: String(req.body.tokenId || ''),
      tokenSecret: String(req.body.tokenSecret || ''),
    };
    if (!connection.url) { cleanup(); throw badRequest('Bitte die Adresse des Wikis angeben'); }
  }
  const label = file ? `${def.label}: ${Buffer.from(file.originalname, 'latin1').toString('utf8')}` : `${def.label}: ${connection.url}`;
  const job = await startAnalysis({ source, userId: req.user.id, label, filePath: file?.path, extraPath: extra?.path, connection });
  await audit(req, 'admin.import.analyse', 'import', job.id, { source, label });
  res.status(202).json({ job: mapJob(job) });
});

router.post('/admin/imports/:id/run', async (req, res) => {
  const j = await one('SELECT * FROM import_jobs WHERE id=$1', [req.params.id]);
  if (!j) throw notFound('Import nicht gefunden');
  if (j.status !== 'ready') throw badRequest('Dieser Import ist nicht bereit');
  const b = pick(req.body, {
    spaceMode: { type: 'string', enum: ['existing', 'new', 'perGroup'], required: true },
    spaceId: { type: 'int' },
    parentPageId: { type: 'int', nullable: true },
    newSpaceName: { type: 'string', max: 80 },
    defaultAccess: { type: 'string', enum: ['none', 'read', 'write'] },
    onConflict: { type: 'string', enum: ['skip', 'update', 'duplicate'] },
    preserveDates: { type: 'bool' },
    extraTags: { type: 'array' },
  });
  if (b.spaceMode === 'existing') {
    if (!b.spaceId || !(await one('SELECT 1 FROM spaces WHERE id=$1', [b.spaceId]))) throw badRequest('Bitte einen Zielbereich wählen');
    if (b.parentPageId && !(await one('SELECT 1 FROM pages WHERE id=$1 AND space_id=$2', [b.parentPageId, b.spaceId]))) throw badRequest('Die übergeordnete Seite liegt nicht im Zielbereich');
  }
  const options = {
    spaceMode: b.spaceMode,
    spaceId: b.spaceId,
    parentPageId: b.parentPageId || null,
    newSpace: { name: b.newSpaceName, defaultAccess: b.defaultAccess || 'read' },
    onConflict: b.onConflict || 'skip',
    preserveDates: b.preserveDates !== false,
    extraTags: (b.extraTags || []).map(String).slice(0, 10),
  };
  await startRun(j.id, options, req.user.id);
  await audit(req, 'admin.import.run', 'import', j.id, options);
  res.status(202).json({ ok: true });
});

router.delete('/admin/imports/:id', async (req, res) => {
  await discard(req.params.id);
  res.json({ ok: true });
});

export default router;
