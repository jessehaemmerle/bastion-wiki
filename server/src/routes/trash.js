import { Router } from 'express';
import { many, one } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { forbidden, intParam, notFound, pick } from '../lib/http.js';
import { LEVEL, loadSpace, spaceAccess } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { getSettings } from '../lib/settings.js';
import { purgeTrash, restoreFromTrash } from '../lib/trash.js';

const router = Router();
router.use('/trash', requireAuth);

/** Who may see a trashed page: writers of the space – restricted pages only space admins and listed people */
async function canSee(user, entry, min = LEVEL.write) {
  if (!entry.space_id) return user.role === 'admin';
  const level = await spaceAccess(user, entry.space_id);
  if (level < min) return false;
  if (level >= LEVEL.admin) return true;
  const perms = entry.data?.permissions || [];
  if (!perms.length) return true;
  const groups = (await many('SELECT group_id FROM group_members WHERE user_id=$1', [user.id])).map((g) => g.group_id);
  return perms.some((p) => p.level === 'write' && ((p.principal_type === 'user' && p.principal_id === user.id) || (p.principal_type === 'group' && groups.includes(p.principal_id))));
}

const map = (e) => ({
  id: e.id, pageId: e.page_id, title: e.title, pageType: e.page_type, spaceId: e.space_id, spaceKey: e.space_key, spaceName: e.space_name,
  spaceColor: e.space_color, deletedAt: e.deleted_at, deletedBy: e.deleted_by_name, versions: e.versions, attachments: e.attachments,
  children: e.children,
});

router.get('/trash', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.space) {
    const space = await loadSpace(req.user, String(req.query.space));
    params.push(space.id);
    where = 'WHERE t.space_id=$1';
  }
  const rows = await many(
    `SELECT t.*, s.key AS space_key, s.name AS space_name, s.color AS space_color, u.display_name AS deleted_by_name,
            jsonb_array_length(t.data->'revisions') AS versions, jsonb_array_length(t.data->'attachments') AS attachments,
            jsonb_array_length(t.data->'children') AS children
       FROM page_trash t LEFT JOIN spaces s ON s.id=t.space_id LEFT JOIN users u ON u.id=t.deleted_by
       ${where} ORDER BY t.deleted_at DESC LIMIT 500`,
    params,
  );
  const visible = [];
  for (const r of rows) if (await canSee(req.user, r)) visible.push(map(r));
  const { trashDays } = await getSettings();
  res.json({ entries: visible, retentionDays: trashDays });
});

router.post('/trash/:id/restore', async (req, res) => {
  const entry = await one('SELECT * FROM page_trash WHERE id=$1', [intParam(req.params.id)]);
  if (!entry || !(await canSee(req.user, entry))) throw notFound('Eintrag nicht gefunden');
  const { spaceId } = pick(req.body, { spaceId: { type: 'int' } });
  if (spaceId) await loadSpace(req.user, spaceId, LEVEL.write);
  const page = await restoreFromTrash(entry, { spaceId });
  await audit(req, 'page.restore_trash', 'page', page.id, { title: page.title });
  res.json({ page: { id: page.id, title: page.title } });
});

router.delete('/trash/:id', async (req, res) => {
  const entry = await one('SELECT * FROM page_trash WHERE id=$1', [intParam(req.params.id)]);
  if (!entry || !(await canSee(req.user, entry))) throw notFound('Eintrag nicht gefunden');
  if (!(await canSee(req.user, entry, LEVEL.admin))) throw forbidden('Endgültig löschen dürfen nur Verwalter des Bereichs');
  await purgeTrash([entry]);
  await audit(req, 'page.purge', 'page', entry.page_id, { title: entry.title });
  res.json({ ok: true });
});

export default router;
