import * as cheerio from 'cheerio';
import { many, one, query } from '../db/index.js';

/**
 * Index of the links in page content – powers backlinks ("linked from"), the broken-link
 * report and the external link check.
 */
export function extractLinks(html) {
  const $ = cheerio.load(String(html || ''), null, false);
  const out = [];
  const seen = new Set();
  const add = (href, label) => {
    const h = String(href || '').trim();
    if (!h || h.startsWith('#')) return;
    let m;
    let link = null;
    if ((m = h.match(/^\/p\/(\d+)(?:[/?#].*)?$/))) link = { kind: 'page', targetId: Number(m[1]) };
    else if ((m = h.match(/^\/api\/attachments\/(\d+)/))) link = { kind: 'attachment', targetId: Number(m[1]) };
    else if (/^https?:\/\//i.test(h)) link = { kind: 'external', targetId: null };
    if (!link) return;
    const key = `${link.kind}|${link.targetId ?? h}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...link, href: h.slice(0, 2000), label: String(label || '').trim().slice(0, 200) });
  };
  $('a[href]').each((_i, el) => add($(el).attr('href'), $(el).text()));
  $('img[src]').each((_i, el) => add($(el).attr('src'), $(el).attr('alt')));
  return out;
}

/** Replace the indexed links of one page. `c` is a pg client or the pool. */
export async function syncLinks(c, pageId, html) {
  const links = extractLinks(html);
  await c.query('DELETE FROM page_links WHERE source_id=$1', [pageId]);
  if (!links.length) return;
  await c.query(
    `INSERT INTO page_links (source_id, kind, target_id, href, label)
     SELECT $1, x.kind, x.target_id, x.href, x.label
       FROM jsonb_to_recordset($2::jsonb) AS x(kind text, target_id int, href text, label text)`,
    [pageId, JSON.stringify(links.map((l) => ({ kind: l.kind, target_id: l.targetId, href: l.href, label: l.label })))],
  );
}

/** First start after the upgrade (or after a restore): index every page once */
export async function ensureLinkIndex(force = false) {
  if (!force) {
    const { indexed } = await one(`SELECT EXISTS (SELECT 1 FROM page_links) OR NOT EXISTS (SELECT 1 FROM pages) AS indexed`);
    if (indexed) return 0;
  }
  const pages = await many('SELECT id, content FROM pages');
  for (const p of pages) await syncLinks({ query: (...a) => query(...a) }, p.id, p.content);
  if (pages.length) console.log(`[links] ${pages.length} Seiten indiziert`);
  return pages.length;
}

/** Pages the user may read that link to `pageId` */
export const backlinks = (pageId, userId) => many(
  `SELECT DISTINCT p.id, p.title, p.icon, p.page_type, s.key AS space_key, s.name AS space_name, s.color AS space_color
     FROM page_links l JOIN pages p ON p.id=l.source_id JOIN spaces s ON s.id=p.space_id
    WHERE l.kind='page' AND l.target_id=$1 AND l.source_id<>$1 AND space_access(p.space_id,$2) >= 1
    ORDER BY p.title`,
  [pageId, userId],
);

/** External link check with bounded concurrency; results land in link_checks */
export async function checkExternalLinks({ limit = 300, concurrency = 6 } = {}) {
  const rows = await many(
    `SELECT l.href FROM page_links l LEFT JOIN link_checks c ON c.href=l.href
      WHERE l.kind='external' GROUP BY l.href ORDER BY min(c.checked_at) NULLS FIRST, l.href LIMIT $1`,
    [limit],
  );
  const queue = rows.map((r) => r.href);
  let checked = 0;
  async function probe(href) {
    let status = 0;
    let error = null;
    try {
      let res = await fetch(href, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      // many servers do not implement HEAD properly
      if ([403, 405, 501].includes(res.status)) res = await fetch(href, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      status = res.status;
      res.body?.cancel?.().catch?.(() => {});
    } catch (err) {
      error = err.cause?.code || err.name || 'error';
    }
    await query(
      `INSERT INTO link_checks (href, status, error, checked_at) VALUES ($1,$2,$3,now())
       ON CONFLICT (href) DO UPDATE SET status=EXCLUDED.status, error=EXCLUDED.error, checked_at=now()`,
      [href, status, error],
    );
    checked++;
  }
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) await probe(queue.shift());
  }));
  return checked;
}
