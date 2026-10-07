import { Router } from 'express';
import TurndownService from 'turndown';
import { many, one, query, tx } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, conflict, intParam, notFound, pick, slugify } from '../lib/http.js';
import { LEVEL, LEVEL_NAME, loadPage, loadSpace } from '../lib/permissions.js';
import { sanitize, htmlToText } from '../lib/sanitize.js';
import { audit } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

const PAGE_TYPES = ['doc', 'runbook', 'incident', 'host', 'service', 'network', 'change', 'howto', 'checklist'];

const pageSchema = {
  spaceId: { type: 'int' },
  parentId: { type: 'int', nullable: true },
  title: { type: 'string', max: 200, min: 1 },
  content: { type: 'string', trim: false, max: 5_000_000 },
  icon: { type: 'string', max: 40, nullable: true },
  pageType: { type: 'string', enum: PAGE_TYPES },
  properties: { type: 'object' },
  tags: { type: 'array' },
  reviewDue: { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/, nullable: true },
  isPinned: { type: 'bool' },
  summary: { type: 'string', max: 300 },
  baseVersion: { type: 'int' },
};

export function cleanProperties(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {}).slice(0, 50)) {
    const key = String(k).trim().slice(0, 60);
    if (!key) continue;
    out[key] = String(v ?? '').slice(0, 1000);
  }
  return out;
}

export function normalizeTags(tags) {
  return [...new Set((tags || [])
    .map((t) => String(t).trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 40))
    .filter((t) => /^[\p{L}\p{N}][\p{L}\p{N}._/+-]*$/u.test(t)))].slice(0, 30);
}

export async function setTags(c, pageId, tags) {
  await c.query('DELETE FROM page_tags WHERE page_id=$1', [pageId]);
  for (const name of normalizeTags(tags)) {
    const { rows } = await c.query(
      `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [name],
    );
    await c.query('INSERT INTO page_tags (page_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [pageId, rows[0].id]);
  }
}

export async function uniqueSlug(c, spaceId, title, excludeId = 0) {
  const base = slugify(title);
  let slug = base;
  for (let i = 2; ; i++) {
    const { rows } = await c.query('SELECT 1 FROM pages WHERE space_id=$1 AND slug=$2 AND id<>$3', [spaceId, slug, excludeId]);
    if (!rows.length) return slug;
    slug = `${base}-${i}`;
  }
}

async function assertParent(c, parentId, spaceId, selfId = null) {
  if (parentId == null) return;
  const { rows } = await c.query('SELECT id, space_id FROM pages WHERE id=$1', [parentId]);
  if (!rows[0] || rows[0].space_id !== spaceId) throw badRequest('Übergeordnete Seite gehört nicht zu diesem Bereich');
  if (selfId) {
    // prevent cycles: walk up from the new parent
    const { rows: chain } = await c.query(
      `WITH RECURSIVE up AS (SELECT id, parent_id FROM pages WHERE id=$1
         UNION ALL SELECT p.id, p.parent_id FROM pages p JOIN up ON p.id = up.parent_id)
       SELECT id FROM up`,
      [parentId],
    );
    if (chain.some((r) => r.id === selfId)) throw badRequest('Eine Seite kann nicht unter sich selbst verschoben werden');
  }
}

function mapListPage(p) {
  return {
    id: p.id, title: p.title, slug: p.slug, icon: p.icon, pageType: p.page_type,
    spaceId: p.space_id, spaceKey: p.space_key, spaceName: p.space_name, spaceColor: p.space_color, spaceIcon: p.space_icon,
    updatedAt: p.updated_at, updatedBy: p.updated_by_name, reviewDue: p.review_due, isPinned: p.is_pinned,
    tags: p.tags || [], excerpt: p.excerpt,
  };
}

const LIST_SELECT = `
  SELECT p.id, p.title, p.slug, p.icon, p.page_type, p.space_id, p.updated_at, p.review_due, p.is_pinned,
         s.key AS space_key, s.name AS space_name, s.color AS space_color, s.icon AS space_icon,
         u.display_name AS updated_by_name,
         left(p.content_text, 220) AS excerpt,
         (SELECT coalesce(array_agg(t.name ORDER BY t.name), '{}') FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=p.id) AS tags
    FROM pages p JOIN spaces s ON s.id = p.space_id
    LEFT JOIN users u ON u.id = p.updated_by`;

// ------------------------------------------------------------------ lists
router.get('/pages', async (req, res) => {
  const where = ['space_access(p.space_id, $1) >= 1'];
  const params = [req.user.id];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (req.query.space) add('s.key = ?', String(req.query.space));
  if (req.query.tag) add('EXISTS (SELECT 1 FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=p.id AND t.name = ?)', String(req.query.tag));
  if (req.query.type) add('p.page_type = ?', String(req.query.type));
  if (req.query.author) add('p.updated_by = ?', Number(req.query.author));
  if (req.query.review === 'overdue') where.push('p.review_due < current_date');
  if (req.query.review === 'soon') where.push(`p.review_due BETWEEN current_date AND current_date + 30`);
  if (req.query.pinned === 'true') where.push('p.is_pinned');
  const sort = { updated: 'p.updated_at DESC', title: 'p.title ASC', created: 'p.created_at DESC', review: 'p.review_due ASC NULLS LAST' }[req.query.sort] || 'p.updated_at DESC';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rows = await many(`${LIST_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({ pages: rows.map(mapListPage) });
});

router.get('/dashboard', async (req, res) => {
  const uid = req.user.id;
  const [recent, favorites, overdue, mine, pinned, stats, activity] = await Promise.all([
    many(`${LIST_SELECT} WHERE space_access(p.space_id,$1) >= 1 ORDER BY p.updated_at DESC LIMIT 8`, [uid]),
    many(`${LIST_SELECT} JOIN favorites f ON f.page_id = p.id AND f.user_id = $1 WHERE space_access(p.space_id,$1) >= 1 ORDER BY f.created_at DESC LIMIT 12`, [uid]),
    many(`${LIST_SELECT} WHERE space_access(p.space_id,$1) >= 1 AND p.review_due < current_date + 7 ORDER BY p.review_due ASC LIMIT 8`, [uid]),
    many(`${LIST_SELECT} WHERE space_access(p.space_id,$1) >= 1 AND p.updated_by = $1 ORDER BY p.updated_at DESC LIMIT 6`, [uid]),
    many(`${LIST_SELECT} WHERE space_access(p.space_id,$1) >= 1 AND p.is_pinned ORDER BY p.title LIMIT 12`, [uid]),
    one(`SELECT count(*)::int AS pages,
                count(DISTINCT p.space_id)::int AS spaces,
                count(*) FILTER (WHERE p.updated_at > now() - interval '7 days')::int AS updated_week,
                count(*) FILTER (WHERE p.review_due < current_date)::int AS overdue,
                (SELECT count(DISTINCT pt.tag_id) FROM page_tags pt JOIN pages p2 ON p2.id=pt.page_id WHERE space_access(p2.space_id,$1) >= 1)::int AS tags
           FROM pages p WHERE space_access(p.space_id,$1) >= 1`, [uid]),
    many(`SELECT date_trunc('day', r.created_at)::date AS day, count(*)::int AS edits
            FROM page_revisions r JOIN pages p ON p.id = r.page_id
           WHERE r.created_at > now() - interval '30 days' AND space_access(p.space_id,$1) >= 1
           GROUP BY 1 ORDER BY 1`, [uid]),
  ]);
  res.json({
    recent: recent.map(mapListPage),
    favorites: favorites.map(mapListPage),
    reviewDue: overdue.map(mapListPage),
    mine: mine.map(mapListPage),
    pinned: pinned.map(mapListPage),
    stats,
    activity,
  });
});

// ------------------------------------------------------------------ single page
router.get('/pages/:id', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const [space, tags, breadcrumbs, children, attachments, fav, authors] = await Promise.all([
    one('SELECT * FROM spaces WHERE id=$1', [page.space_id]),
    many('SELECT t.name, t.color FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=$1 ORDER BY t.name', [page.id]),
    many(
      `WITH RECURSIVE up AS (SELECT id, parent_id, title, 0 AS depth FROM pages WHERE id=$1
         UNION ALL SELECT p.id, p.parent_id, p.title, up.depth+1 FROM pages p JOIN up ON p.id=up.parent_id WHERE up.depth < 50)
       SELECT id, title FROM up WHERE id<>$1 ORDER BY depth DESC`,
      [page.id],
    ),
    many('SELECT id, title, icon, page_type FROM pages WHERE parent_id=$1 ORDER BY sort_order, title', [page.id]),
    many(
      `SELECT a.id, a.filename, a.mime_type, a.size_bytes, a.created_at, u.display_name AS uploaded_by
         FROM attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.page_id=$1 ORDER BY a.created_at DESC`,
      [page.id],
    ),
    one('SELECT 1 FROM favorites WHERE user_id=$1 AND page_id=$2', [req.user.id, page.id]),
    one(
      `SELECT c.display_name AS created_by, u.display_name AS updated_by
         FROM pages p LEFT JOIN users c ON c.id=p.created_by LEFT JOIN users u ON u.id=p.updated_by WHERE p.id=$1`,
      [page.id],
    ),
  ]);
  res.json({
    page: {
      id: page.id, spaceId: page.space_id, parentId: page.parent_id, title: page.title, slug: page.slug,
      icon: page.icon, content: page.content, pageType: page.page_type, properties: page.properties,
      version: page.version, reviewDue: page.review_due, isPinned: page.is_pinned,
      createdAt: page.created_at, updatedAt: page.updated_at,
      createdBy: authors?.created_by, updatedBy: authors?.updated_by,
      access: LEVEL_NAME[page.access], isFavorite: Boolean(fav),
      wordCount: page.content_text ? page.content_text.split(/\s+/).filter(Boolean).length : 0,
      tags, breadcrumbs, children: children.map((c) => ({ id: c.id, title: c.title, icon: c.icon, pageType: c.page_type })),
      attachments: attachments.map((a) => ({
        id: a.id, filename: a.filename, mimeType: a.mime_type, size: a.size_bytes, createdAt: a.created_at, uploadedBy: a.uploaded_by,
      })),
      space: { id: space.id, key: space.key, name: space.name, color: space.color, icon: space.icon },
    },
  });
});

router.post('/pages', async (req, res) => {
  const b = pick(req.body, { ...pageSchema, spaceId: { ...pageSchema.spaceId, required: true }, title: { ...pageSchema.title, required: true } });
  const space = await loadSpace(req.user, b.spaceId, LEVEL.write);
  const content = sanitize(b.content);
  const properties = cleanProperties(b.properties);
  const page = await tx(async (c) => {
    await assertParent(c, b.parentId ?? null, space.id);
    const slug = await uniqueSlug(c, space.id, b.title);
    const { rows: [{ next }] } = await c.query(
      'SELECT coalesce(max(sort_order),0)+1 AS next FROM pages WHERE space_id=$1 AND parent_id IS NOT DISTINCT FROM $2',
      [space.id, b.parentId ?? null],
    );
    const { rows } = await c.query(
      `INSERT INTO pages (space_id, parent_id, title, slug, icon, content, content_text, page_type, properties,
                          sort_order, review_due, is_pinned, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`,
      [space.id, b.parentId ?? null, b.title, slug, b.icon ?? null, content, htmlToText(content), b.pageType || 'doc',
        properties, next, b.reviewDue ?? null, Boolean(b.isPinned), req.user.id],
    );
    await c.query(
      `INSERT INTO page_revisions (page_id, version, title, content, properties, summary, author_id)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [rows[0].id, b.title, content, properties, b.summary || 'Seite erstellt', req.user.id],
    );
    await setTags(c, rows[0].id, b.tags);
    return rows[0];
  });
  await audit(req, 'page.create', 'page', page.id, { title: page.title, space: space.key });
  res.status(201).json({ page: { id: page.id, slug: page.slug, spaceKey: space.key, version: page.version } });
});

router.put('/pages/:id', async (req, res) => {
  const current = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const b = pick(req.body, pageSchema, { partial: true });
  if (b.baseVersion && b.baseVersion !== current.version) {
    const who = await one('SELECT display_name FROM users WHERE id=$1', [current.updated_by]);
    throw conflict(`Die Seite wurde zwischenzeitlich von ${who?.display_name || 'jemand anderem'} bearbeitet (Version ${current.version}). Bitte neu laden.`);
  }
  const title = b.title ?? current.title;
  const content = b.content !== undefined ? sanitize(b.content) : current.content;
  const properties = b.properties !== undefined ? cleanProperties(b.properties) : current.properties;
  const contentChanged = content !== current.content || title !== current.title
    || JSON.stringify(properties) !== JSON.stringify(current.properties);

  const page = await tx(async (c) => {
    if (b.parentId !== undefined) await assertParent(c, b.parentId, current.space_id, current.id);
    const slug = title !== current.title ? await uniqueSlug(c, current.space_id, title, current.id) : current.slug;
    const version = contentChanged ? current.version + 1 : current.version;
    const { rows } = await c.query(
      `UPDATE pages SET title=$2, slug=$3, content=$4, content_text=$5, properties=$6,
              icon=$7, page_type=$8, review_due=$9, is_pinned=$10, parent_id=$11,
              version=$12, updated_by=$13, updated_at=now()
        WHERE id=$1 RETURNING *`,
      [current.id, title, slug, content, htmlToText(content), properties,
        b.icon !== undefined ? b.icon : current.icon, b.pageType ?? current.page_type,
        b.reviewDue !== undefined ? b.reviewDue : current.review_due,
        b.isPinned ?? current.is_pinned, b.parentId !== undefined ? b.parentId : current.parent_id,
        version, req.user.id],
    );
    if (contentChanged) {
      await c.query(
        `INSERT INTO page_revisions (page_id, version, title, content, properties, summary, author_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [current.id, version, title, content, properties, b.summary || '', req.user.id],
      );
    }
    if (b.tags) await setTags(c, current.id, b.tags);
    return rows[0];
  });
  await audit(req, 'page.update', 'page', page.id, { title: page.title, version: page.version });
  res.json({ page: { id: page.id, slug: page.slug, version: page.version, updatedAt: page.updated_at } });
});

router.delete('/pages/:id', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  // Children move up one level instead of disappearing
  await tx(async (c) => {
    await c.query('UPDATE pages SET parent_id=$2 WHERE parent_id=$1', [page.id, page.parent_id]);
    await c.query('DELETE FROM pages WHERE id=$1', [page.id]);
  });
  await audit(req, 'page.delete', 'page', page.id, { title: page.title });
  res.json({ ok: true });
});

router.post('/pages/:id/move', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const b = pick(req.body, {
    spaceId: { type: 'int' },
    parentId: { type: 'int', nullable: true },
    position: { type: 'int' },
  });
  const targetSpaceId = b.spaceId ?? page.space_id;
  if (targetSpaceId !== page.space_id) await loadSpace(req.user, targetSpaceId, LEVEL.write);
  const parentId = b.parentId ?? null;
  await tx(async (c) => {
    await assertParent(c, parentId, targetSpaceId, page.id);
    if (targetSpaceId !== page.space_id) {
      // move whole subtree to the new space
      const slug = await uniqueSlug(c, targetSpaceId, page.title, page.id);
      await c.query(
        `WITH RECURSIVE sub AS (SELECT id FROM pages WHERE id=$1 UNION ALL SELECT p.id FROM pages p JOIN sub ON p.parent_id=sub.id)
         UPDATE pages SET space_id=$2 WHERE id IN (SELECT id FROM sub) AND id<>$1`,
        [page.id, targetSpaceId],
      );
      await c.query('UPDATE pages SET space_id=$2, slug=$3 WHERE id=$1', [page.id, targetSpaceId, slug]);
    }
    const { rows: siblings } = await c.query(
      'SELECT id FROM pages WHERE space_id=$1 AND parent_id IS NOT DISTINCT FROM $2 AND id<>$3 ORDER BY sort_order, title',
      [targetSpaceId, parentId, page.id],
    );
    const ids = siblings.map((s) => s.id);
    const pos = Math.max(0, Math.min(b.position ?? ids.length, ids.length));
    ids.splice(pos, 0, page.id);
    await c.query('UPDATE pages SET parent_id=$2 WHERE id=$1', [page.id, parentId]);
    for (let i = 0; i < ids.length; i++) await c.query('UPDATE pages SET sort_order=$2 WHERE id=$1', [ids[i], i]);
  });
  await audit(req, 'page.move', 'page', page.id, { spaceId: targetSpaceId, parentId });
  res.json({ ok: true });
});

router.post('/pages/:id/duplicate', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const tags = await many('SELECT t.name FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=$1', [page.id]);
  const copy = await tx(async (c) => {
    const title = `${page.title} (Kopie)`;
    const slug = await uniqueSlug(c, page.space_id, title);
    const { rows } = await c.query(
      `INSERT INTO pages (space_id, parent_id, title, slug, icon, content, content_text, page_type, properties, sort_order, review_due, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
      [page.space_id, page.parent_id, title, slug, page.icon, page.content, page.content_text, page.page_type, page.properties,
        page.sort_order + 1, page.review_due, req.user.id],
    );
    await c.query(
      `INSERT INTO page_revisions (page_id, version, title, content, properties, summary, author_id) VALUES ($1,1,$2,$3,$4,$5,$6)`,
      [rows[0].id, title, page.content, page.properties, `Kopie von #${page.id}`, req.user.id],
    );
    await setTags(c, rows[0].id, tags.map((t) => t.name));
    return rows[0];
  });
  await audit(req, 'page.duplicate', 'page', copy.id, { from: page.id });
  res.status(201).json({ page: { id: copy.id } });
});

router.post('/pages/:id/favorite', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const { rowCount } = await query('DELETE FROM favorites WHERE user_id=$1 AND page_id=$2', [req.user.id, page.id]);
  if (!rowCount) await query('INSERT INTO favorites (user_id, page_id) VALUES ($1,$2)', [req.user.id, page.id]);
  res.json({ isFavorite: !rowCount });
});

router.post('/pages/:id/reviewed', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const days = Math.min(Math.max(Number(req.body?.days) || 180, 1), 3650);
  const row = await one(
    `UPDATE pages SET review_due = current_date + $2::int WHERE id=$1 RETURNING review_due`,
    [page.id, days],
  );
  await audit(req, 'page.reviewed', 'page', page.id, { reviewDue: row.review_due });
  res.json({ reviewDue: row.review_due });
});

// ------------------------------------------------------------------ revisions
router.get('/pages/:id/revisions', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const rows = await many(
    `SELECT r.version, r.title, r.summary, r.created_at, length(r.content) AS size, u.display_name AS author
       FROM page_revisions r LEFT JOIN users u ON u.id=r.author_id WHERE r.page_id=$1 ORDER BY r.version DESC`,
    [page.id],
  );
  res.json({ revisions: rows.map((r) => ({ version: r.version, title: r.title, summary: r.summary, createdAt: r.created_at, size: r.size, author: r.author })) });
});

router.get('/pages/:id/revisions/:version', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const r = await one(
    `SELECT r.*, u.display_name AS author FROM page_revisions r LEFT JOIN users u ON u.id=r.author_id
      WHERE r.page_id=$1 AND r.version=$2`,
    [page.id, intParam(req.params.version, 'Version')],
  );
  if (!r) throw notFound('Version nicht gefunden');
  res.json({ revision: { version: r.version, title: r.title, content: r.content, properties: r.properties, summary: r.summary, createdAt: r.created_at, author: r.author } });
});

router.post('/pages/:id/revisions/:version/restore', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const version = intParam(req.params.version, 'Version');
  const r = await one('SELECT * FROM page_revisions WHERE page_id=$1 AND version=$2', [page.id, version]);
  if (!r) throw notFound('Version nicht gefunden');
  const next = page.version + 1;
  await tx(async (c) => {
    await c.query(
      `UPDATE pages SET title=$2, content=$3, content_text=$4, properties=$5, version=$6, updated_by=$7, updated_at=now() WHERE id=$1`,
      [page.id, r.title, r.content, htmlToText(r.content), r.properties, next, req.user.id],
    );
    await c.query(
      `INSERT INTO page_revisions (page_id, version, title, content, properties, summary, author_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [page.id, next, r.title, r.content, r.properties, `Wiederhergestellt aus Version ${version}`, req.user.id],
    );
  });
  await audit(req, 'page.restore', 'page', page.id, { from: version, to: next });
  res.json({ version: next });
});

// ------------------------------------------------------------------ export
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
turndown.addRule('fencedLang', {
  filter: (node) => node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE',
  replacement: (_c, node) => {
    const code = node.firstChild;
    const lang = (code.getAttribute('class') || '').match(/language-([\w+#-]+)/)?.[1] || '';
    return `\n\n\`\`\`${lang}\n${code.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
  },
});
turndown.addRule('callout', {
  filter: (node) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'callout',
  replacement: (content, node) => `\n\n> **${(node.getAttribute('data-variant') || 'info').toUpperCase()}**\n${content.trim().split('\n').map((l) => `> ${l}`).join('\n')}\n\n`,
});

router.get('/pages/:id/export', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const format = req.query.format === 'html' ? 'html' : 'md';
  const name = page.slug || `page-${page.id}`;
  if (format === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.html"`);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return res.send(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(page.title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 16px;line-height:1.6}pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>
</head><body><h1>${esc(page.title)}</h1>${page.content}</body></html>`);
  }
  const props = Object.entries(page.properties || {});
  const front = props.length
    ? `---\n${props.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n`
    : '';
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.md"`);
  res.send(`${front}# ${page.title}\n\n${turndown.turndown(page.content || '')}\n`);
});

export default router;
