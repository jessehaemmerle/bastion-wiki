import { Router } from 'express';
import { many, one, query, tx } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { badRequest, intParam, notFound, pick } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { normalizeTags } from './pages.js';

const router = Router();
router.use(requireAuth);

router.get('/tags', async (req, res) => {
  const rows = await many(
    `SELECT t.id, t.name, t.color, count(p.id)::int AS count, max(p.updated_at) AS last_used
       FROM tags t
       LEFT JOIN page_tags pt ON pt.tag_id = t.id
       LEFT JOIN pages p ON p.id = pt.page_id AND space_access(p.space_id, $1) >= 1
      GROUP BY t.id
     HAVING count(p.id) > 0 OR $2::boolean
      ORDER BY count(p.id) DESC, t.name`,
    [req.user.id, req.user.role === 'admin' && req.query.all === 'true'],
  );
  res.json({ tags: rows });
});

router.get('/tags/:name', async (req, res) => {
  const tag = await one('SELECT * FROM tags WHERE name=$1', [req.params.name.toLowerCase()]);
  if (!tag) throw notFound('Tag nicht gefunden');
  const related = await many(
    `SELECT t2.name, t2.color, count(*)::int AS count
       FROM page_tags a JOIN page_tags b ON a.page_id=b.page_id AND b.tag_id<>a.tag_id
       JOIN tags t2 ON t2.id=b.tag_id JOIN pages p ON p.id=a.page_id
      WHERE a.tag_id=$1 AND space_access(p.space_id,$2) >= 1
      GROUP BY t2.id ORDER BY count DESC LIMIT 12`,
    [tag.id, req.user.id],
  );
  res.json({ tag, related });
});

// ---- admin tag management
router.patch('/tags/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  const b = pick(req.body, { name: { type: 'string', max: 40 }, color: { type: 'string', pattern: /^#[0-9a-fA-F]{6}$/ } }, { partial: true });
  const name = b.name ? normalizeTags([b.name])[0] : undefined;
  if (b.name && !name) throw badRequest('Ungültiger Tag-Name');
  const existing = name ? await one('SELECT id FROM tags WHERE name=$1 AND id<>$2', [name, id]) : null;
  if (existing) {
    // rename onto an existing tag => merge
    await tx(async (c) => {
      await c.query(
        `INSERT INTO page_tags (page_id, tag_id) SELECT page_id, $2 FROM page_tags WHERE tag_id=$1 ON CONFLICT DO NOTHING`,
        [id, existing.id],
      );
      await c.query('DELETE FROM tags WHERE id=$1', [id]);
    });
    await audit(req, 'tag.merge', 'tag', id, { into: name });
    return res.json({ merged: true, id: existing.id });
  }
  const row = await one('UPDATE tags SET name=COALESCE($2,name), color=COALESCE($3,color) WHERE id=$1 RETURNING *', [id, name, b.color]);
  if (!row) throw notFound();
  await audit(req, 'tag.update', 'tag', id, b);
  res.json({ tag: row });
});

router.delete('/tags/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  const { rowCount } = await query('DELETE FROM tags WHERE id=$1', [id]);
  if (!rowCount) throw notFound();
  await audit(req, 'tag.delete', 'tag', id);
  res.json({ ok: true });
});

export default router;
