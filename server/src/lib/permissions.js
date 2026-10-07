import { one } from '../db/index.js';
import { forbidden, notFound } from './http.js';

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
