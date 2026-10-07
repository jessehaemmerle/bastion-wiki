import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config.js';
import { one, query } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, intParam, notFound } from '../lib/http.js';
import { LEVEL, loadPage } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

export const uploadDir = path.join(config.dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 10 },
});

// Types we are happy to render inline; everything else is forced to download.
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|text\/plain|video\/(mp4|webm))$/;

router.post('/pages/:id/attachments', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  await new Promise((resolve, reject) => upload.array('files')(req, res, (err) => (err ? reject(badRequest(err.message)) : resolve())));
  if (!req.files?.length) throw badRequest('Keine Datei hochgeladen');
  const out = [];
  for (const f of req.files) {
    // multer decodes the filename as latin1
    const filename = Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 200);
    const row = await one(
      `INSERT INTO attachments (page_id, filename, stored_name, mime_type, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, filename, mime_type, size_bytes, created_at`,
      [page.id, filename, f.filename, f.mimetype || 'application/octet-stream', f.size, req.user.id],
    );
    out.push({ id: row.id, filename: row.filename, mimeType: row.mime_type, size: row.size_bytes, createdAt: row.created_at, url: `/api/attachments/${row.id}` });
  }
  await audit(req, 'attachment.upload', 'page', page.id, { files: out.map((f) => f.filename) });
  res.status(201).json({ attachments: out });
});

router.get('/attachments/:id', async (req, res) => {
  const a = await one('SELECT * FROM attachments WHERE id=$1', [intParam(req.params.id)]);
  if (!a) throw notFound('Datei nicht gefunden');
  await loadPage(req.user, a.page_id);
  const file = path.join(uploadDir, a.stored_name);
  if (!fs.existsSync(file)) throw notFound('Datei fehlt im Speicher');
  const inline = INLINE.test(a.mime_type) && req.query.download === undefined;
  res.setHeader('Content-Type', inline ? a.mime_type : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(file);
});

router.delete('/attachments/:id', async (req, res) => {
  const a = await one('SELECT * FROM attachments WHERE id=$1', [intParam(req.params.id)]);
  if (!a) throw notFound('Datei nicht gefunden');
  await loadPage(req.user, a.page_id, LEVEL.write);
  await query('DELETE FROM attachments WHERE id=$1', [a.id]);
  fs.rm(path.join(uploadDir, a.stored_name), { force: true }, () => {});
  await audit(req, 'attachment.delete', 'page', a.page_id, { filename: a.filename });
  res.json({ ok: true });
});

export default router;
