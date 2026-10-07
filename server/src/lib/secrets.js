import crypto from 'node:crypto';

/** Secret blocks live outside the page HTML; the page only carries data-secret-id="…". */
export function secretIds(html) {
  return [...new Set([...String(html || '').matchAll(/data-secret-id="([A-Za-z0-9_-]{8,64})"/g)].map((m) => m[1]))];
}

export const newSecretId = () => crypto.randomBytes(16).toString('base64url');

/** Attach not-yet-linked secrets referenced in the content to the page (same space only) */
export async function linkSecrets(c, pageId, spaceId, html) {
  const ids = secretIds(html);
  if (!ids.length) return;
  await c.query(
    `UPDATE page_secrets SET page_id=$1 WHERE id = ANY($2) AND space_id=$3 AND (page_id IS NULL OR page_id=$1)`,
    [pageId, ids, spaceId],
  );
}

/** Duplicating a page clones its secrets, so the copies can change independently */
export async function cloneSecrets(c, html, newPageId, userId) {
  let out = String(html || '');
  for (const id of secretIds(out)) {
    // only secrets the user may reveal: an id copied from a page they can merely read must not become a readable copy
    const { rows: [s] } = await c.query(
      `SELECT * FROM page_secrets WHERE id=$1
          AND (CASE WHEN page_id IS NULL THEN space_access(space_id, $2) ELSE page_access(page_id, $2) END) >= 2`,
      [id, userId],
    );
    if (!s) continue;
    const nid = newSecretId();
    await c.query(
      `INSERT INTO page_secrets (id, space_id, page_id, label, ciphertext, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [nid, s.space_id, newPageId, s.label, s.ciphertext, userId],
    );
    out = out.replaceAll(`data-secret-id="${id}"`, `data-secret-id="${nid}"`);
  }
  return out;
}
