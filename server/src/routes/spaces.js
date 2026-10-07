import { Router } from 'express';
import { many, one, query, tx } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, conflict, forbidden, intParam, pick } from '../lib/http.js';
import { LEVEL, LEVEL_NAME, loadSpace } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

const KEY = /^[a-z0-9][a-z0-9-]{1,30}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

const spaceSchema = {
  key: { type: 'string', pattern: KEY, required: true },
  name: { type: 'string', max: 80, required: true },
  description: { type: 'string', max: 500 },
  icon: { type: 'string', max: 40 },
  color: { type: 'string', pattern: COLOR },
  defaultAccess: { type: 'string', enum: ['none', 'read', 'write'] },
  sortOrder: { type: 'int' },
};

export function mapSpace(s) {
  return {
    id: s.id,
    key: s.key,
    name: s.name,
    description: s.description,
    icon: s.icon,
    color: s.color,
    defaultAccess: s.default_access,
    sortOrder: s.sort_order,
    access: LEVEL_NAME[s.access] ?? undefined,
    pageCount: s.page_count,
    updatedAt: s.last_update ?? s.updated_at,
    createdAt: s.created_at,
  };
}

router.get('/spaces', async (req, res) => {
  const rows = await many(
    `SELECT * FROM (
       SELECT s.*, space_access(s.id, $1) AS access,
              (SELECT count(*) FROM pages p WHERE p.space_id = s.id)::int AS page_count,
              (SELECT max(updated_at) FROM pages p WHERE p.space_id = s.id) AS last_update
         FROM spaces s) x
      WHERE access >= 1 ORDER BY sort_order, name`,
    [req.user.id],
  );
  res.json({ spaces: rows.map(mapSpace) });
});

router.post('/spaces', async (req, res) => {
  if (req.user.role === 'viewer') throw forbidden('Betrachter können keine Bereiche anlegen');
  const b = pick(req.body, spaceSchema);
  const key = b.key.toLowerCase();
  if (await one('SELECT 1 FROM spaces WHERE key=$1', [key])) throw conflict('Ein Bereich mit diesem Schlüssel existiert bereits');
  const space = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO spaces (key, name, description, icon, color, default_access, sort_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [key, b.name, b.description || '', b.icon || 'folder', b.color || '#6366f1', b.defaultAccess || 'read', b.sortOrder || 0, req.user.id],
    );
    await c.query(
      `INSERT INTO space_permissions (space_id, principal_type, principal_id, level) VALUES ($1,'user',$2,'admin')`,
      [rows[0].id, req.user.id],
    );
    return rows[0];
  });
  await audit(req, 'space.create', 'space', space.id, { key, name: b.name });
  res.status(201).json({ space: mapSpace({ ...space, access: LEVEL.admin, page_count: 0 }) });
});

router.get('/spaces/:key', async (req, res) => {
  const space = await loadSpace(req.user, req.params.key);
  const pages = await many(
    `SELECT id, parent_id, title, slug, icon, page_type, sort_order, updated_at, review_due
       FROM pages WHERE space_id=$1 ORDER BY sort_order, title`,
    [space.id],
  );
  const stats = await one(
    `SELECT count(*)::int AS pages,
            count(*) FILTER (WHERE review_due < current_date)::int AS overdue,
            count(DISTINCT updated_by)::int AS contributors
       FROM pages WHERE space_id=$1`,
    [space.id],
  );
  res.json({
    space: mapSpace(space),
    stats,
    pages: pages.map((p) => ({
      id: p.id, parentId: p.parent_id, title: p.title, slug: p.slug, icon: p.icon,
      pageType: p.page_type, sortOrder: p.sort_order, updatedAt: p.updated_at, reviewDue: p.review_due,
    })),
  });
});

router.patch('/spaces/:id', async (req, res) => {
  const space = await loadSpace(req.user, intParam(req.params.id), LEVEL.admin);
  const b = pick(req.body, spaceSchema, { partial: true });
  if (b.key && b.key !== space.key && (await one('SELECT 1 FROM spaces WHERE key=$1', [b.key]))) {
    throw conflict('Ein Bereich mit diesem Schlüssel existiert bereits');
  }
  const row = await one(
    `UPDATE spaces SET key=COALESCE($2,key), name=COALESCE($3,name), description=COALESCE($4,description),
            icon=COALESCE($5,icon), color=COALESCE($6,color), default_access=COALESCE($7,default_access),
            sort_order=COALESCE($8,sort_order), updated_at=now()
      WHERE id=$1 RETURNING *, space_access(id, $9) AS access`,
    [space.id, b.key, b.name, b.description, b.icon, b.color, b.defaultAccess, b.sortOrder, req.user.id],
  );
  await audit(req, 'space.update', 'space', space.id, b);
  res.json({ space: mapSpace(row) });
});

router.delete('/spaces/:id', async (req, res) => {
  const space = await loadSpace(req.user, intParam(req.params.id), LEVEL.admin);
  if (req.body?.confirm !== space.key) throw badRequest('Bitte den Bereichsschlüssel zur Bestätigung angeben');
  await query('DELETE FROM spaces WHERE id=$1', [space.id]);
  await audit(req, 'space.delete', 'space', space.id, { key: space.key, name: space.name });
  res.json({ ok: true });
});

// ------------------------------------------------------------------ permissions
router.get('/spaces/:id/permissions', async (req, res) => {
  const space = await loadSpace(req.user, intParam(req.params.id), LEVEL.admin);
  const rows = await many(
    `SELECT sp.*, CASE WHEN sp.principal_type='user' THEN u.display_name ELSE g.name END AS name,
            u.username
       FROM space_permissions sp
       LEFT JOIN users u  ON sp.principal_type='user'  AND u.id = sp.principal_id
       LEFT JOIN groups g ON sp.principal_type='group' AND g.id = sp.principal_id
      WHERE sp.space_id=$1 ORDER BY sp.principal_type DESC, name`,
    [space.id],
  );
  res.json({
    defaultAccess: space.default_access,
    permissions: rows
      .filter((r) => r.name)
      .map((r) => ({ principalType: r.principal_type, principalId: r.principal_id, level: r.level, name: r.name, username: r.username })),
  });
});

router.put('/spaces/:id/permissions', async (req, res) => {
  const space = await loadSpace(req.user, intParam(req.params.id), LEVEL.admin);
  const { permissions, defaultAccess } = pick(req.body, {
    permissions: { type: 'array', required: true },
    defaultAccess: { type: 'string', enum: ['none', 'read', 'write'] },
  });
  const clean = [];
  const seen = new Set();
  for (const p of permissions) {
    if (!['user', 'group'].includes(p?.principalType)) throw badRequest('Ungültiger Prinzipaltyp');
    if (!['read', 'write', 'admin'].includes(p?.level)) throw badRequest('Ungültige Berechtigungsstufe');
    const id = intParam(p.principalId, 'principalId');
    const k = `${p.principalType}:${id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push({ type: p.principalType, id, level: p.level });
  }
  // Guard against locking yourself out (unless you're a global admin)
  if (req.user.role !== 'admin') {
    const self = clean.find((p) => p.type === 'user' && p.id === req.user.id);
    if (!self || self.level !== 'admin') {
      const viaGroup = await one(
        `SELECT 1 FROM group_members WHERE user_id=$1 AND group_id = ANY($2::int[])`,
        [req.user.id, clean.filter((p) => p.type === 'group' && p.level === 'admin').map((p) => p.id)],
      );
      if (!viaGroup) throw badRequest('Du kannst dir nicht selbst die Admin-Berechtigung für diesen Bereich entziehen');
    }
  }
  await tx(async (c) => {
    await c.query('DELETE FROM space_permissions WHERE space_id=$1', [space.id]);
    for (const p of clean) {
      await c.query(
        'INSERT INTO space_permissions (space_id, principal_type, principal_id, level) VALUES ($1,$2,$3,$4)',
        [space.id, p.type, p.id, p.level],
      );
    }
    if (defaultAccess) await c.query('UPDATE spaces SET default_access=$2 WHERE id=$1', [space.id, defaultAccess]);
  });
  await audit(req, 'space.permissions', 'space', space.id, { permissions: clean, defaultAccess });
  res.json({ ok: true });
});

export default router;
