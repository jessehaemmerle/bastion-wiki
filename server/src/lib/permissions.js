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
    `SELECT p.*, space_access(p.space_id, $2) AS access FROM pages p WHERE p.id = $1`,
    [pageId, user.id],
  );
  if (!page || page.access < LEVEL.read) throw notFound('Seite nicht gefunden');
  if (page.access < min) throw forbidden();
  return page;
}
