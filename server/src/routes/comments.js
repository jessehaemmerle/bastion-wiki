import { Router } from 'express';
import { many, one, query } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { forbidden, intParam, notFound, pick } from '../lib/http.js';
import { LEVEL, loadPage } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { notifyPageEvent, notifyUsers } from '../lib/notify.js';

/** Comments on pages: threads (one level of replies), @mentions, resolve */
const router = Router();

const MENTION = /(^|[^\w@.])@([a-zA-Z0-9._-]{2,40})/g;

async function mentionedUsers(body) {
  const names = [...new Set([...String(body).matchAll(MENTION)].map((m) => m[2].toLowerCase().replace(/[.]+$/, '')))];
  if (!names.length) return [];
  return many('SELECT id, username FROM users WHERE is_active AND lower(username) = ANY($1)', [names]);
}

const mapComment = (c) => ({
  id: c.id, parentId: c.parent_id, body: c.body, authorId: c.author_id, author: c.author_name, authorUsername: c.author_username,
  createdAt: c.created_at, editedAt: c.edited_at, resolvedAt: c.resolved_at, resolvedBy: c.resolved_by_name,
});

const SELECT = `SELECT c.*, u.display_name AS author_name, u.username AS author_username, r.display_name AS resolved_by_name
  FROM comments c LEFT JOIN users u ON u.id=c.author_id LEFT JOIN users r ON r.id=c.resolved_by`;

router.get('/pages/:id/comments', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const rows = await many(`${SELECT} WHERE c.page_id=$1 ORDER BY c.created_at`, [page.id]);
  res.json({ comments: rows.map(mapComment), canModerate: page.access >= LEVEL.admin, canResolve: page.access >= LEVEL.write });
});

router.post('/pages/:id/comments', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const b = pick(req.body, { body: { type: 'string', required: true, max: 10000 }, parentId: { type: 'int', nullable: true } });
  let parentId = null;
  if (b.parentId) {
    const parent = await one('SELECT id, parent_id FROM comments WHERE id=$1 AND page_id=$2', [b.parentId, page.id]);
    if (!parent) throw notFound('Kommentar nicht gefunden');
    parentId = parent.parent_id || parent.id; // replies stay one level deep
  }
  const mentioned = await mentionedUsers(b.body);
  const row = await one(
    'INSERT INTO comments (page_id, parent_id, author_id, body, mentions) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [page.id, parentId, req.user.id, b.body, mentioned.map((m) => m.id)],
  );
  // reopen a resolved thread when someone answers
  if (parentId) await query('UPDATE comments SET resolved_at=NULL, resolved_by=NULL WHERE id=$1', [parentId]);
  const excerpt = b.body.replace(/\s+/g, ' ').slice(0, 160);
  await notifyUsers(mentioned.map((m) => m.id), 'comment.mention', page, req.user, { commentId: row.id, excerpt });
  // the thread's participants and the page's watchers hear about it (but not twice)
  const participants = parentId ? (await many('SELECT DISTINCT author_id FROM comments WHERE (id=$1 OR parent_id=$1) AND author_id IS NOT NULL', [parentId])).map((r) => r.author_id) : [];
  const already = new Set([...mentioned.map((m) => m.id), req.user.id]);
  await notifyUsers(participants.filter((id) => !already.has(id)), 'comment.create', page, req.user, { commentId: row.id, excerpt });
  participants.forEach((id) => already.add(id));
  await notifyPageEvent('comment.create', page, req.user, { commentId: row.id, excerpt, skipUsers: [...already] });
  await audit(req, 'comment.create', 'page', page.id, { comment: row.id });
  const comment = await one(`${SELECT} WHERE c.id=$1`, [row.id]);
  res.status(201).json({ comment: mapComment(comment) });
});

async function loadComment(user, id) {
  const c = await one('SELECT * FROM comments WHERE id=$1', [id]);
  if (!c) throw notFound('Kommentar nicht gefunden');
  const page = await loadPage(user, c.page_id);
  return { c, page };
}

router.patch('/comments/:id', requireAuth, async (req, res) => {
  const { c, page } = await loadComment(req.user, intParam(req.params.id));
  const b = pick(req.body, { body: { type: 'string', max: 10000, min: 1 }, resolved: { type: 'bool' } }, { partial: true });
  if (b.body !== undefined) {
    if (c.author_id !== req.user.id) throw forbidden('Nur eigene Kommentare können bearbeitet werden');
    const mentioned = await mentionedUsers(b.body);
    const fresh = mentioned.filter((m) => !c.mentions.includes(m.id));
    await query('UPDATE comments SET body=$2, mentions=$3, edited_at=now() WHERE id=$1', [c.id, b.body, mentioned.map((m) => m.id)]);
    await notifyUsers(fresh.map((m) => m.id), 'comment.mention', page, req.user, { commentId: c.id, excerpt: b.body.slice(0, 160) });
  }
  if (req.body && typeof req.body === 'object' && 'resolved' in req.body) {
    if (c.parent_id) throw forbidden('Nur ganze Diskussionen können erledigt werden');
    if (c.author_id !== req.user.id && page.access < LEVEL.write) throw forbidden();
    await query(
      'UPDATE comments SET resolved_at=CASE WHEN $2 THEN now() END, resolved_by=CASE WHEN $2 THEN $3::int END WHERE id=$1',
      [c.id, req.body.resolved === true, req.user.id],
    );
  }
  const comment = await one(`${SELECT} WHERE c.id=$1`, [c.id]);
  res.json({ comment: mapComment(comment) });
});

router.delete('/comments/:id', requireAuth, async (req, res) => {
  const { c, page } = await loadComment(req.user, intParam(req.params.id));
  if (c.author_id !== req.user.id && page.access < LEVEL.admin) throw forbidden('Nur eigene Kommentare können gelöscht werden');
  await query('DELETE FROM comments WHERE id=$1', [c.id]);
  await audit(req, 'comment.delete', 'page', page.id, { comment: c.id });
  res.json({ ok: true });
});

/** People for the @mention picker: only those who can read the page */
router.get('/pages/:id/mentionable', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const q = String(req.query.q || '').trim();
  const rows = await many(
    `SELECT id, username, display_name FROM users
      WHERE is_active AND ($2 = '' OR username ILIKE $3 OR display_name ILIKE $3) AND page_access($1, id) >= 1
      ORDER BY display_name LIMIT 8`,
    [page.id, q, `%${q.replace(/[%_\\]/g, '\\$&')}%`],
  );
  res.json({ users: rows.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name })) });
});

export default router;
