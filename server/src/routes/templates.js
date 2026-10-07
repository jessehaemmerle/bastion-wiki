import { Router } from 'express';
import { many, one, query } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { intParam, notFound, pick } from '../lib/http.js';
import { sanitize } from '../lib/sanitize.js';
import { audit } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

const map = (t) => ({
  id: t.id, name: t.name, description: t.description, icon: t.icon, pageType: t.page_type,
  content: t.content, properties: t.properties, tags: t.tags, sortOrder: t.sort_order, isBuiltin: t.is_builtin,
  updatedAt: t.updated_at,
});

const schema = {
  name: { type: 'string', max: 80, required: true },
  description: { type: 'string', max: 300 },
  icon: { type: 'string', max: 40 },
  pageType: { type: 'string', max: 30 },
  content: { type: 'string', trim: false, max: 1_000_000 },
  properties: { type: 'object' },
  tags: { type: 'array' },
  sortOrder: { type: 'int' },
};

router.get('/templates', async (_req, res) => {
  const rows = await many('SELECT * FROM templates ORDER BY sort_order, name');
  res.json({ templates: rows.map(map) });
});

router.post('/templates', requireRole('admin'), async (req, res) => {
  const b = pick(req.body, schema);
  const row = await one(
    `INSERT INTO templates (name, description, icon, page_type, content, properties, tags, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.name, b.description || '', b.icon || 'file-text', b.pageType || 'doc', sanitize(b.content), b.properties || {},
      (b.tags || []).map(String), b.sortOrder || 0],
  );
  await audit(req, 'template.create', 'template', row.id, { name: row.name });
  res.status(201).json({ template: map(row) });
});

router.put('/templates/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  const b = pick(req.body, schema, { partial: true });
  const row = await one(
    `UPDATE templates SET name=COALESCE($2,name), description=COALESCE($3,description), icon=COALESCE($4,icon),
            page_type=COALESCE($5,page_type), content=COALESCE($6,content), properties=COALESCE($7,properties),
            tags=COALESCE($8,tags), sort_order=COALESCE($9,sort_order), updated_at=now()
      WHERE id=$1 RETURNING *`,
    [id, b.name, b.description, b.icon, b.pageType, b.content !== undefined ? sanitize(b.content) : null,
      b.properties ?? null, b.tags ? b.tags.map(String) : null, b.sortOrder],
  );
  if (!row) throw notFound();
  await audit(req, 'template.update', 'template', id, { name: row.name });
  res.json({ template: map(row) });
});

router.delete('/templates/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  const { rowCount } = await query('DELETE FROM templates WHERE id=$1', [id]);
  if (!rowCount) throw notFound();
  await audit(req, 'template.delete', 'template', id);
  res.json({ ok: true });
});

export default router;
