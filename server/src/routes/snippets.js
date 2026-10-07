import { Router } from 'express';
import { many, one, query } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { forbidden, intParam, notFound, pick } from '../lib/http.js';
import { htmlToText, sanitize } from '../lib/sanitize.js';
import { audit } from '../lib/audit.js';

/** Snippets: everyone can use them, editors and admins maintain them */
const router = Router();
router.use('/snippets', requireAuth);

const canEdit = (user) => ['admin', 'editor'].includes(user.role);
const usage = `(SELECT count(*) FROM pages p WHERE p.content LIKE '%data-snippet-id="' || s.id || '"%')::int`;
const map = (s) => ({
  id: s.id, name: s.name, description: s.description, content: s.content, version: s.version, updatedAt: s.updated_at,
  updatedBy: s.updated_by_name, usage: s.usage,
});
const SELECT = `SELECT s.*, u.display_name AS updated_by_name, ${usage} AS usage FROM snippets s LEFT JOIN users u ON u.id=s.updated_by`;

router.get('/snippets', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = await many(
    `${SELECT} WHERE $1 = '' OR s.name ILIKE $2 OR s.description ILIKE $2 OR s.content_text ILIKE $2 ORDER BY lower(s.name)`,
    [q, `%${q.replace(/[%_\\]/g, '\\$&')}%`],
  );
  res.json({ snippets: rows.map((s) => ({ ...map(s), content: undefined })), canEdit: canEdit(req.user) });
});

router.get('/snippets/:id', async (req, res) => {
  const s = await one(`${SELECT} WHERE s.id=$1`, [intParam(req.params.id)]);
  if (!s) throw notFound('Baustein nicht gefunden');
  // pages that use it (only those the user can read)
  const pages = await many(
    `SELECT p.id, p.title, sp.name AS space_name FROM pages p JOIN spaces sp ON sp.id=p.space_id
      WHERE p.content LIKE $1 AND page_access(p.id, $2) >= 1 ORDER BY p.title LIMIT 100`,
    [`%data-snippet-id="${s.id}"%`, req.user.id],
  );
  res.json({ snippet: map(s), pages: pages.map((p) => ({ id: p.id, title: p.title, spaceName: p.space_name })), canEdit: canEdit(req.user) });
});

const body = {
  name: { type: 'string', required: true, max: 120 },
  description: { type: 'string', max: 300 },
  content: { type: 'string', trim: false, max: 2_000_000 },
};
// no snippets inside snippets – one level keeps rendering simple and loop-free
const noNesting = (html) => String(html).replace(/<div[^>]*data-type="snippet"[^>]*><\/div>/g, '');

router.post('/snippets', async (req, res) => {
  if (!canEdit(req.user)) throw forbidden();
  const b = pick(req.body, body);
  const content = noNesting(sanitize(b.content || ''));
  const row = await one(
    `INSERT INTO snippets (name, description, content, content_text, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$5) RETURNING id`,
    [b.name, b.description || '', content, htmlToText(content), req.user.id],
  );
  await audit(req, 'snippet.create', 'snippet', row.id, { name: b.name });
  res.status(201).json({ snippet: map(await one(`${SELECT} WHERE s.id=$1`, [row.id])) });
});

router.put('/snippets/:id', async (req, res) => {
  if (!canEdit(req.user)) throw forbidden();
  const id = intParam(req.params.id);
  const b = pick(req.body, body, { partial: true });
  const content = b.content !== undefined ? noNesting(sanitize(b.content)) : null;
  const { rowCount } = await query(
    `UPDATE snippets SET name=COALESCE($2,name), description=COALESCE($3,description), content=COALESCE($4,content),
            content_text=COALESCE($5,content_text), version=version+1, updated_by=$6, updated_at=now() WHERE id=$1`,
    [id, b.name ?? null, b.description ?? null, content, content !== null ? htmlToText(content) : null, req.user.id],
  );
  if (!rowCount) throw notFound('Baustein nicht gefunden');
  await audit(req, 'snippet.update', 'snippet', id, { name: b.name });
  res.json({ snippet: map(await one(`${SELECT} WHERE s.id=$1`, [id])) });
});

router.delete('/snippets/:id', async (req, res) => {
  if (!canEdit(req.user)) throw forbidden();
  const id = intParam(req.params.id);
  await query('DELETE FROM snippets WHERE id=$1', [id]);
  await audit(req, 'snippet.delete', 'snippet', id);
  res.json({ ok: true });
});

export default router;
