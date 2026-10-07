import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { many, one, query } from '../db/index.js';
import { randomToken, requireAuth, requireRole, sha256 } from '../lib/auth.js';
import { badRequest, forbidden, intParam, notFound, pick } from '../lib/http.js';
import { LEVEL, loadPage } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { getSection } from '../lib/integrations.js';
import { getSettings } from '../lib/settings.js';
import { uploadDir } from './attachments.js';
import { expandSnippets } from '../lib/snippets.js';

/**
 * Read-only share links with an expiry date – for external contractors or the on-call
 * phone without an account. Only the one page (and its attachments) is visible; secret blocks stay hidden.
 */
export const publicRouter = Router();
const router = Router();

const mapShare = (s) => ({
  id: s.id, prefix: s.token_prefix, note: s.note, expiresAt: s.expires_at, views: s.views, lastViewAt: s.last_view_at,
  createdAt: s.created_at, createdBy: s.created_by_name, pageId: s.page_id, pageTitle: s.page_title,
  expired: new Date(s.expires_at) < new Date(),
});

router.get('/pages/:id/shares', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const rows = await many(
    `SELECT s.*, u.display_name AS created_by_name FROM share_links s LEFT JOIN users u ON u.id=s.created_by
      WHERE s.page_id=$1 ORDER BY s.created_at DESC`,
    [page.id],
  );
  res.json({ shares: rows.map(mapShare) });
});

router.post('/pages/:id/shares', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const security = await getSection('security');
  if (!security.allowSharing) throw forbidden('Freigabelinks sind deaktiviert');
  const b = pick(req.body, { days: { type: 'int', required: true }, note: { type: 'string', max: 200 } });
  const max = Math.max(1, Number(security.maxShareDays) || 90);
  if (b.days < 1 || b.days > max) throw badRequest(`Gültigkeit muss zwischen 1 und ${max} Tagen liegen`);
  const token = `shr_${randomToken(24)}`;
  const row = await one(
    `INSERT INTO share_links (token_hash, token_prefix, page_id, note, expires_at, created_by)
     VALUES ($1,$2,$3,$4, now() + make_interval(days => $5), $6) RETURNING *`,
    [sha256(token), token.slice(0, 10), page.id, b.note || '', b.days, req.user.id],
  );
  await audit(req, 'share.create', 'page', page.id, { share: row.id, days: b.days, note: b.note || '' });
  res.status(201).json({ share: { ...mapShare(row), token, path: `/share/${token}` } });
});

router.delete('/shares/:id', requireAuth, async (req, res) => {
  const share = await one('SELECT * FROM share_links WHERE id=$1', [intParam(req.params.id)]);
  if (!share) throw notFound();
  if (req.user.role !== 'admin') await loadPage(req.user, share.page_id, LEVEL.write);
  await query('DELETE FROM share_links WHERE id=$1', [share.id]);
  await audit(req, 'share.revoke', 'page', share.page_id, { share: share.id });
  res.json({ ok: true });
});

router.get('/admin/shares', requireRole('admin'), async (_req, res) => {
  const rows = await many(
    `SELECT s.*, u.display_name AS created_by_name, p.title AS page_title FROM share_links s
       JOIN pages p ON p.id=s.page_id LEFT JOIN users u ON u.id=s.created_by
      ORDER BY s.expires_at < now(), s.created_at DESC LIMIT 500`,
  );
  res.json({ shares: rows.map(mapShare) });
});

// ------------------------------------------------------------------ public side
async function resolve(token) {
  if (!/^shr_[A-Za-z0-9_-]{20,64}$/.test(String(token))) return null;
  const security = await getSection('security');
  if (!security.allowSharing) return null;
  return one('SELECT * FROM share_links WHERE token_hash=$1 AND expires_at > now()', [sha256(token)]);
}

publicRouter.get('/public/share/:token', async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const share = await resolve(req.params.token);
  if (!share) throw notFound('Der Link ist ungültig oder abgelaufen');
  const [page, tags, attachments, settings] = await Promise.all([
    one(`SELECT p.*, s.name AS space_name, u.display_name AS updated_by_name FROM pages p
           JOIN spaces s ON s.id=p.space_id LEFT JOIN users u ON u.id=p.updated_by WHERE p.id=$1`, [share.page_id]),
    many('SELECT t.name, t.color FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=$1 ORDER BY t.name', [share.page_id]),
    many('SELECT id, filename, mime_type, size_bytes FROM attachments WHERE page_id=$1 ORDER BY created_at DESC', [share.page_id]),
    getSettings(),
  ]);
  if (!page) throw notFound('Der Link ist ungültig oder abgelaufen');
  query('UPDATE share_links SET views=views+1, last_view_at=now() WHERE id=$1', [share.id]).catch(() => {});
  const base = `/api/public/share/${req.params.token}/attachments/`;
  res.json({
    siteName: settings.siteName,
    expiresAt: share.expires_at,
    page: {
      title: page.title, icon: page.icon, pageType: page.page_type, properties: page.properties,
      content: (await expandSnippets(page.content)).replace(/\/api\/attachments\/(\d+)/g, `${base}$1`),
      updatedAt: page.updated_at, updatedBy: page.updated_by_name, spaceName: page.space_name, version: page.version, tags,
      attachments: attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mime_type, size: a.size_bytes, url: `${base}${a.id}` })),
    },
  });
});

publicRouter.get('/public/share/:token/attachments/:id', async (req, res) => {
  const share = await resolve(req.params.token);
  if (!share) throw notFound();
  const a = await one('SELECT * FROM attachments WHERE id=$1 AND page_id=$2', [intParam(req.params.id), share.page_id]);
  if (!a) throw notFound('Datei nicht gefunden');
  const file = path.join(uploadDir, a.stored_name);
  if (!fs.existsSync(file)) throw notFound('Datei fehlt im Speicher');
  const inline = /^image\/(png|jpe?g|gif|webp|avif)$/.test(a.mime_type) && req.query.download === undefined;
  res.setHeader('Content-Type', inline ? a.mime_type : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(file);
});

export default router;
