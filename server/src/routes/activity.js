import { Router } from 'express';
import { many, one, query } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { intParam } from '../lib/http.js';
import { LEVEL, loadPage, loadSpace } from '../lib/permissions.js';
import { editorsOf, heartbeat, leave } from '../lib/presence.js';

/** Personal activity: watching, inbox, recently viewed, edit presence */
const router = Router();

// ------------------------------------------------------------------ presence
router.post('/pages/:id/presence', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  heartbeat(page.id, req.user);
  res.json({ editors: editorsOf(page.id, req.user.id) });
});

router.delete('/pages/:id/presence', requireAuth, async (req, res) => {
  leave(intParam(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ watching
router.post('/pages/:id/watch', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const { rowCount } = await query('DELETE FROM watches WHERE user_id=$1 AND page_id=$2', [req.user.id, page.id]);
  if (!rowCount) await query('INSERT INTO watches (user_id, page_id) VALUES ($1,$2)', [req.user.id, page.id]);
  res.json({ watching: !rowCount });
});

router.post('/spaces/:id/watch', requireAuth, async (req, res) => {
  const space = await loadSpace(req.user, req.params.id);
  const { rowCount } = await query('DELETE FROM watches WHERE user_id=$1 AND space_id=$2', [req.user.id, space.id]);
  if (!rowCount) await query('INSERT INTO watches (user_id, space_id) VALUES ($1,$2)', [req.user.id, space.id]);
  res.json({ watching: !rowCount });
});

router.get('/me/watches', requireAuth, async (req, res) => {
  const rows = await many(
    `SELECT w.page_id, w.space_id, w.created_at, p.title, s.name AS space_name, s.key AS space_key, s.color AS space_color
       FROM watches w LEFT JOIN pages p ON p.id=w.page_id LEFT JOIN spaces s ON s.id=coalesce(w.space_id, p.space_id)
      WHERE w.user_id=$1 AND (CASE WHEN w.page_id IS NULL THEN space_access(s.id, $1) ELSE page_access(w.page_id, $1) END) >= 1 ORDER BY w.space_id IS NULL, s.name, p.title`,
    [req.user.id],
  );
  res.json({
    watches: rows.map((r) => ({
      pageId: r.page_id, spaceId: r.space_id, title: r.title, spaceName: r.space_name, spaceKey: r.space_key, spaceColor: r.space_color, createdAt: r.created_at,
    })),
  });
});

// ------------------------------------------------------------------ inbox
router.get('/notifications', requireAuth, async (req, res) => {
  // interpolated into SQL: must be a positive integer (negative/NaN/Infinity → SQL error)
  const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 30, 1), 100);
  const [rows, unread] = await Promise.all([
    many(
      `SELECT n.*, p.title AS page_title, s.key AS space_key FROM notifications n
         LEFT JOIN pages p ON p.id=n.page_id LEFT JOIN spaces s ON s.id=p.space_id
        WHERE n.user_id=$1 AND (n.page_id IS NULL OR page_access(n.page_id, $1) >= 1)
        ORDER BY n.created_at DESC LIMIT ${limit}`,
      [req.user.id],
    ),
    one('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]),
  ]);
  res.json({
    unread: unread.n,
    notifications: rows.map((n) => ({
      id: n.id, kind: n.kind, pageId: n.page_id, title: n.page_title || n.data.title, data: n.data,
      read: Boolean(n.read_at), createdAt: n.created_at,
    })),
  });
});

router.get('/notifications/unread', requireAuth, async (req, res) => {
  const { n } = await one('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ unread: n });
});

router.post('/notifications/read', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (ids) await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id = ANY($2) AND read_at IS NULL', [req.user.id, ids]);
  else await query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ recently viewed + favourites for the sidebar
router.get('/me/recent', requireAuth, async (req, res) => {
  const [recent, favorites] = await Promise.all([
    many(
      `SELECT p.id, p.title, p.icon, p.page_type, s.key AS space_key, s.color AS space_color, v.viewed_at
         FROM page_views v JOIN pages p ON p.id=v.page_id JOIN spaces s ON s.id=p.space_id
        WHERE v.user_id=$1 AND page_access(p.id,$1) >= 1 ORDER BY v.viewed_at DESC LIMIT 8`,
      [req.user.id],
    ),
    many(
      `SELECT p.id, p.title, p.icon, p.page_type, s.key AS space_key, s.color AS space_color
         FROM favorites f JOIN pages p ON p.id=f.page_id JOIN spaces s ON s.id=p.space_id
        WHERE f.user_id=$1 AND page_access(p.id,$1) >= 1 ORDER BY f.created_at DESC LIMIT 15`,
      [req.user.id],
    ),
  ]);
  const map = (p) => ({ id: p.id, title: p.title, icon: p.icon, pageType: p.page_type, spaceKey: p.space_key, spaceColor: p.space_color, viewedAt: p.viewed_at });
  // open change requests this person could review (sidebar badge)
  const { n } = await one(
    `SELECT count(*)::int AS n FROM change_requests cr JOIN pages p ON p.id=cr.page_id
      WHERE cr.status='pending' AND cr.author_id IS DISTINCT FROM $1 AND page_access(p.id, $1) >= 2
        AND (p.approver_group_id IS NULL OR EXISTS (SELECT 1 FROM users WHERE id=$1 AND role='admin')
             OR EXISTS (SELECT 1 FROM group_members g WHERE g.group_id=p.approver_group_id AND g.user_id=$1))`,
    [req.user.id],
  );
  res.json({ recent: recent.map(map), favorites: favorites.map(map), approvals: n });
});

export default router;
