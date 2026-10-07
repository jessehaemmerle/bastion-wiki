import { Router } from 'express';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { many, one, query, tx } from '../db/index.js';
import { hashPassword, publicUser, requireRole, validatePassword } from '../lib/auth.js';
import { badRequest, conflict, intParam, notFound, pick } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../lib/settings.js';
import { mapSpace } from './spaces.js';
import { uploadDir } from './attachments.js';
import { ensureLinkIndex } from '../lib/links.js';

const router = Router();
router.use('/admin', requireRole('admin'));

const USERNAME = /^[a-zA-Z0-9._-]{2,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const startedAt = Date.now();

// ------------------------------------------------------------------ overview
router.get('/admin/overview', async (_req, res) => {
  const [counts, db, activity, topSpaces, topEditors, recentAudit] = await Promise.all([
    one(`SELECT (SELECT count(*) FROM users)::int AS users,
                (SELECT count(*) FROM users WHERE is_active)::int AS active_users,
                (SELECT count(*) FROM groups)::int AS groups,
                (SELECT count(*) FROM spaces)::int AS spaces,
                (SELECT count(*) FROM pages)::int AS pages,
                (SELECT count(*) FROM page_revisions)::int AS revisions,
                (SELECT count(*) FROM tags)::int AS tags,
                (SELECT count(*) FROM attachments)::int AS attachments,
                (SELECT coalesce(sum(size_bytes),0) FROM attachments)::bigint AS attachment_bytes,
                (SELECT count(*) FROM sessions WHERE expires_at > now())::int AS sessions,
                (SELECT count(*) FROM pages WHERE review_due < current_date)::int AS overdue`),
    one(`SELECT pg_database_size(current_database())::bigint AS size, version() AS version`),
    many(`SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS edits
            FROM page_revisions WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
    many(`SELECT s.name, s.color, count(p.id)::int AS pages FROM spaces s LEFT JOIN pages p ON p.space_id=s.id
           GROUP BY s.id ORDER BY pages DESC LIMIT 6`),
    many(`SELECT u.display_name AS name, count(*)::int AS edits FROM page_revisions r JOIN users u ON u.id=r.author_id
           WHERE r.created_at > now() - interval '30 days' GROUP BY u.id ORDER BY edits DESC LIMIT 6`),
    many(`SELECT a.*, u.display_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
           ORDER BY a.created_at DESC LIMIT 10`),
  ]);
  res.json({
    counts,
    system: {
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      dbSize: db.size,
      dbVersion: db.version.split(' ').slice(0, 2).join(' '),
    },
    activity,
    topSpaces,
    topEditors,
    recentAudit: recentAudit.map(mapAudit),
  });
});

// ------------------------------------------------------------------ users
router.get('/admin/users', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = await many(
    `SELECT u.*,
            (SELECT count(*) FROM page_revisions r WHERE r.author_id=u.id)::int AS edits,
            (SELECT coalesce(array_agg(g.name ORDER BY g.name), '{}') FROM group_members m JOIN groups g ON g.id=m.group_id WHERE m.user_id=u.id) AS groups
       FROM users u
      WHERE $1 = '' OR u.username ILIKE $2 OR u.display_name ILIKE $2 OR u.email ILIKE $2
      ORDER BY u.created_at`,
    [q, `%${q}%`],
  );
  res.json({ users: rows.map((u) => ({ ...publicUser(u), edits: u.edits, groups: u.groups })) });
});

router.post('/admin/users', async (req, res) => {
  const b = pick(req.body, {
    username: { type: 'string', required: true, pattern: USERNAME },
    email: { type: 'string', pattern: EMAIL, max: 200 },
    displayName: { type: 'string', max: 100 },
    password: { type: 'string', required: true, trim: false },
    role: { type: 'string', enum: ['admin', 'editor', 'viewer'] },
    groupIds: { type: 'array' },
  });
  const err = validatePassword(b.password);
  if (err) throw badRequest(err);
  if (await one('SELECT 1 FROM users WHERE lower(username)=lower($1) OR (email IS NOT NULL AND lower(email)=lower($2))', [b.username, b.email || ''])) {
    throw conflict('Benutzername oder E-Mail bereits vergeben');
  }
  const user = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO users (username, email, display_name, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.username, b.email || null, b.displayName || b.username, await hashPassword(b.password), b.role || 'editor'],
    );
    for (const gid of b.groupIds || []) {
      await c.query('INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [intParam(gid), rows[0].id]);
    }
    return rows[0];
  });
  await audit(req, 'admin.user.create', 'user', user.id, { username: user.username, role: user.role });
  res.status(201).json({ user: publicUser(user) });
});

router.patch('/admin/users/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const b = pick(req.body, {
    email: { type: 'string', pattern: EMAIL, max: 200, nullable: true },
    displayName: { type: 'string', max: 100 },
    role: { type: 'string', enum: ['admin', 'editor', 'viewer'] },
    isActive: { type: 'bool' },
    password: { type: 'string', trim: false },
    groupIds: { type: 'array' },
    reset2fa: { type: 'bool' },
  }, { partial: true });
  const target = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!target) throw notFound('Benutzer nicht gefunden');
  if (b.password && target.auth_source !== 'local') throw badRequest('Das Passwort wird im Verzeichnis bzw. beim Identitätsanbieter verwaltet');
  if (id === req.user.id && (b.role && b.role !== 'admin' || b.isActive === false)) {
    throw badRequest('Du kannst dir nicht selbst die Admin-Rechte entziehen oder dich deaktivieren');
  }
  if (target.role === 'admin' && (b.role && b.role !== 'admin' || b.isActive === false)) {
    const { n } = await one(`SELECT count(*)::int AS n FROM users WHERE role='admin' AND is_active AND id<>$1`, [id]);
    if (!n) throw badRequest('Es muss mindestens ein aktiver Administrator existieren');
  }
  if (b.password) {
    const err = validatePassword(b.password);
    if (err) throw badRequest(err);
  }
  const user = await tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE users SET email = CASE WHEN $2::boolean THEN $3 ELSE email END,
              display_name=COALESCE($4,display_name), role=COALESCE($5,role), is_active=COALESCE($6,is_active),
              password_hash=COALESCE($7,password_hash), updated_at=now()
        WHERE id=$1 RETURNING *`,
      [id, 'email' in b, b.email ?? null, b.displayName, b.role, b.isActive, b.password ? await hashPassword(b.password) : null],
    );
    if (b.groupIds) {
      await c.query('DELETE FROM group_members WHERE user_id=$1', [id]);
      for (const gid of b.groupIds) await c.query('INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [intParam(gid), id]);
    }
    if (b.reset2fa) await c.query("UPDATE users SET totp_secret=NULL, totp_enabled=false, totp_recovery='[]' WHERE id=$1", [id]);
    if (b.isActive === false || b.password) await c.query('DELETE FROM sessions WHERE user_id=$1', [id]);
    return rows[0];
  });
  const { password, ...logged } = b;
  await audit(req, 'admin.user.update', 'user', id, { ...logged, passwordReset: Boolean(password) });
  res.json({ user: publicUser(user) });
});

router.delete('/admin/users/:id', async (req, res) => {
  const id = intParam(req.params.id);
  if (id === req.user.id) throw badRequest('Du kannst dich nicht selbst löschen');
  const target = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!target) throw notFound();
  if (target.role === 'admin') {
    const { n } = await one(`SELECT count(*)::int AS n FROM users WHERE role='admin' AND is_active AND id<>$1`, [id]);
    if (!n) throw badRequest('Der letzte Administrator kann nicht gelöscht werden');
  }
  await tx(async (c) => {
    await c.query(`DELETE FROM space_permissions WHERE principal_type='user' AND principal_id=$1`, [id]);
    await c.query('DELETE FROM users WHERE id=$1', [id]);
  });
  await audit(req, 'admin.user.delete', 'user', id, { username: target.username });
  res.json({ ok: true });
});

router.delete('/admin/users/:id/sessions', async (req, res) => {
  const id = intParam(req.params.id);
  await query('DELETE FROM sessions WHERE user_id=$1', [id]);
  await audit(req, 'admin.user.logout', 'user', id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ groups
router.get('/admin/groups', async (_req, res) => {
  const rows = await many(
    `SELECT g.*, coalesce(json_agg(json_build_object('id',u.id,'username',u.username,'displayName',u.display_name) ORDER BY u.display_name)
              FILTER (WHERE u.id IS NOT NULL), '[]') AS members,
            (SELECT count(*) FROM space_permissions sp WHERE sp.principal_type='group' AND sp.principal_id=g.id)::int AS space_count
       FROM groups g LEFT JOIN group_members m ON m.group_id=g.id LEFT JOIN users u ON u.id=m.user_id
      GROUP BY g.id ORDER BY g.name`,
  );
  res.json({ groups: rows.map((g) => ({ id: g.id, name: g.name, description: g.description, externalName: g.external_name || '', members: g.members, spaceCount: g.space_count, createdAt: g.created_at })) });
});

const groupSchema = {
  name: { type: 'string', max: 60, required: true },
  description: { type: 'string', max: 300 },
  externalName: { type: 'string', max: 500 },
  memberIds: { type: 'array' },
};

async function saveGroup(c, id, b) {
  if (b.memberIds) {
    await c.query('DELETE FROM group_members WHERE group_id=$1', [id]);
    for (const uid of b.memberIds) await c.query('INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, intParam(uid)]);
  }
}

router.post('/admin/groups', async (req, res) => {
  const b = pick(req.body, groupSchema);
  if (await one('SELECT 1 FROM groups WHERE lower(name)=lower($1)', [b.name])) throw conflict('Gruppe existiert bereits');
  const group = await tx(async (c) => {
    const { rows } = await c.query('INSERT INTO groups (name, description, external_name) VALUES ($1,$2,$3) RETURNING *', [b.name, b.description || '', b.externalName || null]);
    await saveGroup(c, rows[0].id, b);
    return rows[0];
  });
  await audit(req, 'admin.group.create', 'group', group.id, { name: group.name });
  res.status(201).json({ group });
});

router.patch('/admin/groups/:id', async (req, res) => {
  const id = intParam(req.params.id);
  const b = pick(req.body, groupSchema, { partial: true });
  if (b.name && (await one('SELECT 1 FROM groups WHERE lower(name)=lower($1) AND id<>$2', [b.name, id]))) throw conflict('Gruppe existiert bereits');
  const group = await tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE groups SET name=COALESCE($2,name), description=COALESCE($3,description),
              external_name=CASE WHEN $4::boolean THEN NULLIF($5,'') ELSE external_name END WHERE id=$1 RETURNING *`,
      [id, b.name, b.description, 'externalName' in b, b.externalName ?? ''],
    );
    if (!rows[0]) throw notFound();
    await saveGroup(c, id, b);
    return rows[0];
  });
  await audit(req, 'admin.group.update', 'group', id, { name: group.name, members: b.memberIds?.length });
  res.json({ group });
});

router.delete('/admin/groups/:id', async (req, res) => {
  const id = intParam(req.params.id);
  await tx(async (c) => {
    await c.query(`DELETE FROM space_permissions WHERE principal_type='group' AND principal_id=$1`, [id]);
    const { rowCount } = await c.query('DELETE FROM groups WHERE id=$1', [id]);
    if (!rowCount) throw notFound();
  });
  await audit(req, 'admin.group.delete', 'group', id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ spaces (overview incl. ones without access)
router.get('/admin/spaces', async (req, res) => {
  const rows = await many(
    `SELECT s.*, 3 AS access,
            (SELECT count(*) FROM pages p WHERE p.space_id=s.id)::int AS page_count,
            (SELECT max(updated_at) FROM pages p WHERE p.space_id=s.id) AS last_update,
            (SELECT count(*) FROM space_permissions sp WHERE sp.space_id=s.id)::int AS grants
       FROM spaces s ORDER BY s.sort_order, s.name`,
  );
  res.json({ spaces: rows.map((s) => ({ ...mapSpace(s), grants: s.grants })) });
});

// ------------------------------------------------------------------ settings
router.get('/admin/settings', async (_req, res) => {
  res.json({ settings: await getSettings(), defaults: DEFAULT_SETTINGS });
});

router.put('/admin/settings', async (req, res) => {
  const b = pick(req.body, {
    siteName: { type: 'string', max: 60, min: 1 },
    tagline: { type: 'string', max: 160 },
    defaultTheme: { type: 'string', max: 40 },
    defaultMode: { type: 'string', enum: ['light', 'dark', 'system'] },
    defaultLanguage: { type: 'string', enum: ['de', 'en'] },
    accentColor: { type: 'string', pattern: /^(#[0-9a-fA-F]{6})?$/ },
    allowRegistration: { type: 'bool' },
    defaultRole: { type: 'string', enum: ['editor', 'viewer'] },
    reviewIntervalDays: { type: 'int' },
    announcement: { type: 'string', max: 500 },
    customCss: { type: 'string', trim: false, max: 50000 },
    footerText: { type: 'string', max: 200 },
  }, { partial: true });
  if ('allowRegistration' in req.body) b.allowRegistration = req.body.allowRegistration === true;
  if (b.customCss && /<\/style/i.test(b.customCss)) throw badRequest('Ungültiges CSS');
  const settings = await updateSettings(b);
  await audit(req, 'admin.settings', 'settings', null, Object.keys(b));
  res.json({ settings });
});

// ------------------------------------------------------------------ audit log
function mapAudit(a) {
  return { id: a.id, action: a.action, entityType: a.entity_type, entityId: a.entity_id, details: a.details, ip: a.ip, createdAt: a.created_at, user: a.user_name };
}

router.get('/admin/audit', async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.action) { params.push(`${req.query.action}%`); where.push(`a.action LIKE $${params.length}`); }
  if (req.query.user) { params.push(Number(req.query.user)); where.push(`a.user_id = $${params.length}`); }
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(a.details::text ILIKE $${params.length} OR a.action ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`); }
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, total] = await Promise.all([
    many(`SELECT a.*, u.display_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${sqlWhere}
           ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
    one(`SELECT count(*)::int AS n FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${sqlWhere}`, params),
  ]);
  res.json({ entries: rows.map(mapAudit), total: total.n });
});

// ------------------------------------------------------------------ maintenance
router.post('/admin/maintenance/:task', async (req, res) => {
  const task = req.params.task;
  let result;
  if (task === 'purge-sessions') {
    result = (await query('DELETE FROM sessions WHERE expires_at < now()')).rowCount;
  } else if (task === 'purge-tags') {
    result = (await query('DELETE FROM tags t WHERE NOT EXISTS (SELECT 1 FROM page_tags pt WHERE pt.tag_id=t.id)')).rowCount;
  } else if (task === 'purge-orphans') {
    const known = new Set((await many('SELECT stored_name FROM attachments')).map((r) => r.stored_name));
    const files = await fs.readdir(uploadDir);
    let n = 0;
    for (const f of files) if (!known.has(f)) { await fs.rm(path.join(uploadDir, f), { force: true }); n++; }
    result = n;
  } else if (task === 'prune-revisions') {
    const keep = Math.max(Number(req.body?.keep) || 50, 5);
    result = (await query(
      `DELETE FROM page_revisions r USING (
         SELECT id, row_number() OVER (PARTITION BY page_id ORDER BY version DESC) AS rn FROM page_revisions) x
       WHERE r.id = x.id AND x.rn > $1`, [keep])).rowCount;
  } else if (task === 'reindex-links') {
    result = await ensureLinkIndex(true);
  } else if (task === 'vacuum') {
    await query('VACUUM ANALYZE');
    result = 'ok';
  } else {
    throw notFound('Unbekannte Wartungsaufgabe');
  }
  await audit(req, 'admin.maintenance', 'system', task, { result });
  res.json({ task, result });
});

/** Full JSON export (backup of content, without password hashes / secrets) */
router.get('/admin/export', async (req, res) => {
  const [spaces, pages, tags, pageTags, groups, members, perms, templates, users] = await Promise.all([
    many('SELECT * FROM spaces ORDER BY id'),
    many('SELECT id, space_id, parent_id, title, slug, icon, content, page_type, properties, sort_order, version, review_due, is_pinned, created_at, updated_at FROM pages ORDER BY id'),
    many('SELECT * FROM tags ORDER BY id'),
    many('SELECT * FROM page_tags'),
    many('SELECT * FROM groups ORDER BY id'),
    many('SELECT * FROM group_members'),
    many('SELECT * FROM space_permissions'),
    many('SELECT * FROM templates ORDER BY id'),
    many('SELECT id, username, email, display_name, role, is_active, created_at FROM users ORDER BY id'),
  ]);
  await audit(req, 'admin.export', 'system', null);
  res.setHeader('Content-Disposition', `attachment; filename="bastion-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ exportedAt: new Date().toISOString(), version: 1, users, groups, members, spaces, perms, pages, tags, pageTags, templates });
});

export default router;
