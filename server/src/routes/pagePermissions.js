import { Router } from 'express';
import { many, tx } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, intParam, pick } from '../lib/http.js';
import { LEVEL, loadPage, spaceAccess } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';

/**
 * Page-level restrictions: an allow list of people and groups for a page and its subpages.
 * They can only narrow what the space grants; space admins always keep full access.
 */
const router = Router();
router.use('/pages/:id/permissions', requireAuth);

async function entriesOf(pageId) {
  return many(
    `SELECT pp.principal_type, pp.principal_id, pp.level,
            CASE WHEN pp.principal_type='user' THEN u.display_name ELSE g.name END AS name,
            CASE WHEN pp.principal_type='user' THEN u.username END AS username
       FROM page_permissions pp
       LEFT JOIN users u ON pp.principal_type='user' AND u.id=pp.principal_id
       LEFT JOIN groups g ON pp.principal_type='group' AND g.id=pp.principal_id
      WHERE pp.page_id=$1 ORDER BY pp.principal_type DESC, name`,
    [pageId],
  );
}
const mapEntry = (e) => ({ principalType: e.principal_type, principalId: e.principal_id, level: e.level, name: e.name || '?', username: e.username });

router.get('/pages/:id/permissions', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const ancestors = await many(
    `WITH RECURSIVE up AS (SELECT id, parent_id, title, 0 AS d FROM pages WHERE id=$1
       UNION ALL SELECT p.id, p.parent_id, p.title, up.d+1 FROM pages p JOIN up ON p.id=up.parent_id WHERE up.d < 50)
     SELECT up.id, up.title, up.d FROM up WHERE up.d > 0 AND EXISTS (SELECT 1 FROM page_permissions pp WHERE pp.page_id=up.id)
     ORDER BY up.d DESC`,
    [page.id],
  );
  const inherited = [];
  for (const a of ancestors) inherited.push({ pageId: a.id, title: a.title, entries: (await entriesOf(a.id)).map(mapEntry) });
  res.json({
    entries: (await entriesOf(page.id)).map(mapEntry),
    inherited,
    canManage: page.access >= LEVEL.write,
    isSpaceAdmin: (await spaceAccess(req.user, page.space_id)) >= LEVEL.admin,
  });
});

router.put('/pages/:id/permissions', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const { entries } = pick(req.body, { entries: { type: 'array', required: true } });
  const clean = new Map();
  for (const e of entries.slice(0, 200)) {
    if (!['user', 'group'].includes(e?.principalType) || !['read', 'write'].includes(e?.level)) throw badRequest('Ungültiger Eintrag');
    clean.set(`${e.principalType}:${intParam(e.principalId)}`, { type: e.principalType, id: Number(e.principalId), level: e.level });
  }
  // whoever restricts a page keeps write access to it (unless they are a space admin anyway)
  const spaceLevel = await spaceAccess(req.user, page.space_id);
  if (clean.size && spaceLevel < LEVEL.admin) clean.set(`user:${req.user.id}`, { type: 'user', id: req.user.id, level: 'write' });
  await tx(async (c) => {
    await c.query('DELETE FROM page_permissions WHERE page_id=$1', [page.id]);
    for (const e of clean.values()) {
      await c.query('INSERT INTO page_permissions (page_id, principal_type, principal_id, level) VALUES ($1,$2,$3,$4)', [page.id, e.type, e.id, e.level]);
    }
  });
  await audit(req, 'page.permissions', 'page', page.id, { title: page.title, entries: [...clean.values()] });
  res.json({ entries: (await entriesOf(page.id)).map(mapEntry) });
});

export default router;
