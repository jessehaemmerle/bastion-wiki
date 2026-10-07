import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { many, one, query, tx } from '../db/index.js';
import { HttpError, slugify } from './http.js';
import { syncLinks } from './links.js';

/**
 * Trash: a deleted page is stored as a complete snapshot (page, versions, tags, attachments,
 * secrets, runs, comments, permissions) and removed from the live tables, so no query anywhere
 * can accidentally show it. Restoring re-creates it under its old id – links to /p/<id> work again.
 */
const uploadDir = path.join(config.dataDir, 'uploads');

async function columns(c, table) {
  const { rows } = await c.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND is_generated <> 'ALWAYS'`,
    [table],
  );
  return new Map(rows.map((r) => [r.column_name, r.data_type]));
}

// people may have been deleted since – their references become NULL instead of breaking the restore
const USER_COLS = ['created_by', 'updated_by', 'author_id', 'started_by', 'uploaded_by', 'resolved_by', 'reviewer_id'];

async function insertRow(c, table, cols, input, userIds) {
  const row = { ...input };
  for (const k of USER_COLS) if (row[k] != null && userIds && !userIds.has(row[k])) row[k] = null;
  const keys = Object.keys(row).filter((k) => cols.has(k));
  const vals = keys.map((k) => (cols.get(k) === 'jsonb' && row[k] !== null ? JSON.stringify(row[k]) : row[k]));
  const { rows } = await c.query(
    `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map((_k, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    vals,
  );
  return rows[0];
}

/** Moves a page into the trash (inside a transaction `c`). Children move up one level. */
export async function trashPage(c, page, userId) {
  const q = async (sql, p = [page.id]) => (await c.query(sql, p)).rows;
  const snapshot = { ...(await q('SELECT * FROM pages WHERE id=$1'))[0] };
  delete snapshot.search_vector;
  const data = {
    page: snapshot,
    revisions: await q('SELECT * FROM page_revisions WHERE page_id=$1 ORDER BY version'),
    tags: (await q('SELECT t.name FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=$1')).map((t) => t.name),
    attachments: await q('SELECT * FROM attachments WHERE page_id=$1'),
    secrets: await q('SELECT * FROM page_secrets WHERE page_id=$1'),
    runs: await q('SELECT * FROM runbook_runs WHERE page_id=$1'),
    comments: await q('SELECT * FROM comments WHERE page_id=$1 ORDER BY id'),
    permissions: await q('SELECT principal_type, principal_id, level FROM page_permissions WHERE page_id=$1'),
    children: (await q('SELECT id FROM pages WHERE parent_id=$1')).map((r) => r.id),
  };
  await c.query(
    `INSERT INTO page_trash (page_id, space_id, parent_id, title, page_type, data, deleted_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [page.id, page.space_id, page.parent_id, page.title, page.page_type, JSON.stringify(data), userId],
  );
  await c.query('UPDATE pages SET parent_id=$2 WHERE parent_id=$1', [page.id, page.parent_id]);
  await c.query('DELETE FROM pages WHERE id=$1', [page.id]);
}

/** Restores a trash entry. Returns the page row. */
export async function restoreFromTrash(entry, { spaceId } = {}) {
  const d = entry.data;
  const targetSpace = spaceId || entry.space_id;
  if (!targetSpace || !(await one('SELECT 1 FROM spaces WHERE id=$1', [targetSpace]))) {
    throw new HttpError(400, 'Der ursprüngliche Bereich existiert nicht mehr – bitte einen Zielbereich wählen');
  }
  const page = await tx(async (c) => {
    const userIds = new Set((await c.query('SELECT id FROM users')).rows.map((u) => u.id));
    const ins = (table, cols, row) => insertRow(c, table, cols, row, userIds);
    const pageCols = await columns(c, 'pages');
    const taken = (await c.query('SELECT 1 FROM pages WHERE id=$1', [entry.page_id])).rows.length;
    const row = { ...d.page, space_id: targetSpace };
    if (taken) delete row.id;
    // parent only if it still exists in the target space
    const parent = row.parent_id ? (await c.query('SELECT 1 FROM pages WHERE id=$1 AND space_id=$2', [row.parent_id, targetSpace])).rows.length : 0;
    if (!parent) row.parent_id = null;
    // slug may have been reused meanwhile
    let slug = row.slug || slugify(row.title);
    for (let i = 2; (await c.query('SELECT 1 FROM pages WHERE space_id=$1 AND slug=$2', [targetSpace, slug])).rows.length; i++) slug = `${row.slug}-${i}`;
    row.slug = slug;
    if (row.schema_id && !(await c.query('SELECT 1 FROM sheet_schemas WHERE id=$1', [row.schema_id])).rows.length) row.schema_id = null;
    if (row.approver_group_id && !(await c.query('SELECT 1 FROM groups WHERE id=$1', [row.approver_group_id])).rows.length) row.approver_group_id = null;
    const p = await ins('pages', pageCols, row);

    const revCols = await columns(c, 'page_revisions');
    for (const r of d.revisions || []) { const x = { ...r, page_id: p.id }; delete x.id; await ins('page_revisions', revCols, x); }
    for (const name of d.tags || []) {
      const { rows: [t] } = await c.query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [name]);
      await c.query('INSERT INTO page_tags (page_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [p.id, t.id]);
    }
    const attCols = await columns(c, 'attachments');
    for (const a of d.attachments || []) {
      const x = { ...a, page_id: p.id };
      if ((await c.query('SELECT 1 FROM attachments WHERE id=$1', [a.id])).rows.length) delete x.id;
      await ins('attachments', attCols, x);
    }
    const secCols = await columns(c, 'page_secrets');
    for (const s of d.secrets || []) {
      if ((await c.query('SELECT 1 FROM page_secrets WHERE id=$1', [s.id])).rows.length) continue;
      await ins('page_secrets', secCols, { ...s, page_id: p.id, space_id: targetSpace });
    }
    const runCols = await columns(c, 'runbook_runs');
    for (const r of d.runs || []) { const x = { ...r, page_id: p.id }; delete x.id; await ins('runbook_runs', runCols, x); }
    const comCols = await columns(c, 'comments');
    const commentIds = new Map();
    for (const cm of d.comments || []) {
      const x = { ...cm, page_id: p.id, parent_id: cm.parent_id ? commentIds.get(cm.parent_id) ?? null : null };
      delete x.id;
      const inserted = await ins('comments', comCols, x);
      commentIds.set(cm.id, inserted.id);
    }
    for (const pp of d.permissions || []) {
      await c.query('INSERT INTO page_permissions (page_id, principal_type, principal_id, level) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [p.id, pp.principal_type, pp.principal_id, pp.level]);
    }
    // former children that were moved up on deletion come back underneath
    if (d.children?.length) {
      await c.query(
        'UPDATE pages SET parent_id=$1 WHERE id = ANY($2) AND space_id=$3 AND parent_id IS NOT DISTINCT FROM $4',
        [p.id, d.children, targetSpace, entry.parent_id],
      );
    }
    await syncLinks(c, p.id, p.content);
    await c.query('DELETE FROM page_trash WHERE id=$1', [entry.id]);
    return p;
  });
  return page;
}

/** Removes trash entries for good, including attachment files nobody else uses */
export async function purgeTrash(entries) {
  for (const e of entries) {
    await query('DELETE FROM page_trash WHERE id=$1', [e.id]);
    for (const a of e.data?.attachments || []) {
      const still = await one(
        `SELECT 1 FROM attachments WHERE stored_name=$1
          UNION ALL SELECT 1 FROM page_trash t, jsonb_array_elements(t.data->'attachments') x WHERE x->>'stored_name'=$1 LIMIT 1`,
        [a.stored_name],
      );
      if (!still && /^[a-f0-9]{32}$/.test(a.stored_name)) await fs.rm(path.join(uploadDir, a.stored_name), { force: true });
    }
  }
}

export async function purgeExpiredTrash(days) {
  const old = await many(`SELECT * FROM page_trash WHERE deleted_at < now() - make_interval(days => $1)`, [Math.max(1, Number(days) || 30)]);
  await purgeTrash(old);
  return old.length;
}

/** stored_name of every attachment that only lives in the trash (kept by the orphan clean-up) */
export async function trashedFiles() {
  return (await many(`SELECT x->>'stored_name' AS f FROM page_trash t, jsonb_array_elements(t.data->'attachments') x`)).map((r) => r.f);
}
