import { one } from '../db/index.js';
import { forbidden, HttpError, notFound } from './http.js';

export const LEVEL = { none: 0, read: 1, write: 2, admin: 3 };
export const LEVEL_NAME = ['none', 'read', 'write', 'admin'];

export async function spaceAccess(user, spaceId) {
  if (!user) return 0;
  const row = await one('SELECT space_access($1, $2) AS level', [spaceId, user.id]);
  return row?.level ?? 0;
}

/** Load a space (by id or key) and ensure the user has at least `min` access. */
export async function loadSpace(user, idOrKey, min = LEVEL.read) {
  const byId = /^\d+$/.test(String(idOrKey));
  const space = await one(
    `SELECT s.*, space_access(s.id, $2) AS access FROM spaces s WHERE ${byId ? 's.id = $1' : 's.key = $1'}`,
    [byId ? Number(idOrKey) : String(idOrKey), user.id],
  );
  if (!space || space.access < LEVEL.read) throw notFound('Bereich nicht gefunden');
  if (space.access < min) throw forbidden();
  return space;
}

/** Load a page and ensure the user has at least `min` access to its space. */
export async function loadPage(user, pageId, min = LEVEL.read) {
  const page = await one(
    `SELECT p.*, page_access(p.id, $2) AS access FROM pages p WHERE p.id = $1`,
    [pageId, user.id],
  );
  if (!page || page.access < LEVEL.read) throw notFound('Seite nicht gefunden');
  if (page.access < min) throw forbidden();
  return page;
}

/** Whether the page or one of its parents carries page-level restrictions */
export async function isRestricted(pageId) {
  const row = await one(
    `WITH RECURSIVE up AS (SELECT id, parent_id, 0 AS d FROM pages WHERE id=$1
       UNION ALL SELECT p.id, p.parent_id, up.d+1 FROM pages p JOIN up ON p.id=up.parent_id WHERE up.d < 50)
     SELECT EXISTS (SELECT 1 FROM up JOIN page_permissions pp ON pp.page_id=up.id) AS r`,
    [pageId],
  );
  return Boolean(row?.r);
}

/** Effective level for a page, already loaded or not */
export async function pageAccess(user, pageId) {
  if (!user) return 0;
  const row = await one('SELECT page_access($1, $2) AS level', [pageId, user.id]);
  return row?.level ?? 0;
}

/**
 * Before a page gets a new parent (or space): restrictions it only inherited from ancestors it is leaving
 * are written onto the page itself, so moving never widens who can see it. Several restrictions combine
 * like page_access() does – a principal keeps access only if every one of them grants it (weakest level).
 * Throws 409 if nobody would be left with a grant (an empty list would mean "unrestricted").
 */
export async function carryRestrictions(c, pageId, newParentId) {
  const { rows } = await c.query(
    `WITH RECURSIVE old_up AS (
       SELECT parent_id AS id, 0 AS d FROM pages WHERE id=$1 AND parent_id IS NOT NULL
       UNION SELECT p.parent_id, old_up.d + 1 FROM pages p JOIN old_up ON p.id=old_up.id WHERE p.parent_id IS NOT NULL AND old_up.d < 50
     ), new_up AS (
       SELECT $2::int AS id, 0 AS d WHERE $2::int IS NOT NULL
       UNION SELECT p.parent_id, new_up.d + 1 FROM pages p JOIN new_up ON p.id=new_up.id WHERE p.parent_id IS NOT NULL AND new_up.d < 50
     )
     SELECT pp.page_id, pp.principal_type, pp.principal_id, pp.level FROM page_permissions pp
      WHERE pp.page_id IN (SELECT id FROM old_up EXCEPT SELECT id FROM new_up) OR pp.page_id=$1`,
    [pageId, newParentId],
  );
  const lost = rows.filter((r) => r.page_id !== pageId);
  if (!lost.length) return;
  const sets = new Map();
  for (const r of rows) {
    if (!sets.has(r.page_id)) sets.set(r.page_id, new Map());
    sets.get(r.page_id).set(`${r.principal_type}:${r.principal_id}`, r.level);
  }
  const [first, ...rest] = [...sets.values()];
  const keep = [...first].filter(([k]) => rest.every((s) => s.has(k)))
    .map(([k, level]) => [k, rest.some((s) => s.get(k) === 'read') ? 'read' : level]);
  if (!keep.length) {
    throw new HttpError(409, 'Die Seite würde beim Verschieben ihre Zugriffsbeschränkung verlieren – bitte zuerst eigene Seitenrechte setzen');
  }
  await c.query('DELETE FROM page_permissions WHERE page_id=$1', [pageId]);
  for (const [k, level] of keep) {
    const [type, id] = k.split(':');
    await c.query('INSERT INTO page_permissions (page_id, principal_type, principal_id, level) VALUES ($1,$2,$3,$4)', [pageId, type, Number(id), level]);
  }
}
