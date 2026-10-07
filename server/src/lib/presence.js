/**
 * Who is editing which page right now. In-memory with heartbeats – good enough to warn
 * before two people overwrite each other (the version check on save stays the hard guard).
 */
const editing = new Map(); // pageId → Map(userId → { name, since, seen })
const TTL = 45 * 1000;

function prune(pageId) {
  const m = editing.get(pageId);
  if (!m) return null;
  const now = Date.now();
  for (const [uid, e] of m) if (now - e.seen > TTL) m.delete(uid);
  if (!m.size) {
    editing.delete(pageId);
    return null;
  }
  return m;
}

export function heartbeat(pageId, user) {
  const m = prune(pageId) || new Map();
  const prev = m.get(user.id);
  m.set(user.id, { name: user.display_name, since: prev?.since || Date.now(), seen: Date.now() });
  editing.set(pageId, m);
}

export function leave(pageId, userId) {
  editing.get(pageId)?.delete(userId);
  prune(pageId);
}

/** Other people editing the page: [{ id, name, since }] */
export function editorsOf(pageId, exceptUserId) {
  const m = prune(pageId);
  if (!m) return [];
  return [...m].filter(([uid]) => uid !== exceptUserId).map(([id, e]) => ({ id, name: e.name, since: new Date(e.since).toISOString() }));
}

export const presenceCount = () => [...editing.keys()].filter((id) => prune(id)).length;
