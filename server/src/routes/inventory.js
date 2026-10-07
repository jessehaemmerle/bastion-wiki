import { Router } from 'express';
import { many } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { intParam } from '../lib/http.js';
import { loadPage } from '../lib/permissions.js';

/**
 * Inventory: hosts, services and networks are pages with a page type and a data sheet.
 * This view lists them as a table and finds the pages that mention them.
 */
const router = Router();

const TYPES = ['host', 'service', 'network'];
const IDENT_KEYS = /^(host|hostname|host-?name|fqdn|dns|dns-?name|ip|ip-?adresse|ip-?address|ipv4|ipv6|adresse|address|name|service|dienst|vm|vlan|subnetz|subnet|netz|network|url)$/i;

router.get('/inventory', requireAuth, async (req, res) => {
  const type = TYPES.includes(req.query.type) ? req.query.type : 'host';
  const params = [req.user.id, type];
  let where = 'space_access(p.space_id,$1) >= 1 AND p.page_type=$2';
  if (req.query.space) {
    params.push(String(req.query.space));
    where += ` AND s.key=$${params.length}`;
  }
  const [rows, counts] = await Promise.all([
    many(
      `SELECT p.id, p.title, p.icon, p.properties, p.updated_at, p.review_due, s.key AS space_key, s.name AS space_name, s.color AS space_color,
              (SELECT coalesce(array_agg(t.name ORDER BY t.name), '{}') FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=p.id) AS tags,
              (SELECT count(*) FROM page_links l WHERE l.kind='page' AND l.target_id=p.id)::int AS backlinks
         FROM pages p JOIN spaces s ON s.id=p.space_id WHERE ${where} ORDER BY lower(p.title) LIMIT 2000`,
      params,
    ),
    many(
      `SELECT p.page_type AS type, count(*)::int AS n FROM pages p
        WHERE space_access(p.space_id,$1) >= 1 AND p.page_type = ANY($2) GROUP BY 1`,
      [req.user.id, TYPES],
    ),
  ]);
  res.json({
    type,
    counts: Object.fromEntries(TYPES.map((t) => [t, counts.find((c) => c.type === t)?.n || 0])),
    items: rows.map((r) => ({
      id: r.id, title: r.title, icon: r.icon, properties: r.properties, updatedAt: r.updated_at, reviewDue: r.review_due,
      spaceKey: r.space_key, spaceName: r.space_name, spaceColor: r.space_color, tags: r.tags, backlinks: r.backlinks,
    })),
  });
});

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Identifiers of a page: title (for inventory types) + values of hostname/IP/… fields */
export function identifiersOf(page) {
  const ids = new Set();
  if (TYPES.includes(page.page_type)) ids.add(page.title.trim());
  for (const [k, v] of Object.entries(page.properties || {})) {
    if (!IDENT_KEYS.test(k.trim())) continue;
    for (const part of String(v).split(/[,;\s]+/)) {
      const val = part.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
      if (val.length >= 3 && val.length <= 120) ids.add(val);
    }
  }
  return [...ids].slice(0, 12);
}

/** Pages that mention this page's identifiers (whole-word match), plus pages this page mentions */
router.get('/pages/:id/related', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const idents = identifiersOf(page);
  let mentions = [];
  if (idents.length) {
    const patterns = idents.map((i) => `\\m${reEscape(i)}\\M`);
    mentions = await many(
      `SELECT p.id, p.title, p.icon, p.page_type, s.key AS space_key, s.name AS space_name, s.color AS space_color,
              (SELECT array_agg(x) FROM unnest($3::text[]) AS x WHERE p.content_text ~* x OR p.properties::text ~* x OR p.title ~* x) AS hits
         FROM pages p JOIN spaces s ON s.id=p.space_id
        WHERE p.id<>$1 AND space_access(p.space_id,$2) >= 1
          AND (p.content_text ~* ANY($3) OR p.properties::text ~* ANY($3) OR p.title ~* ANY($3))
        ORDER BY p.page_type = ANY($4) DESC, p.updated_at DESC LIMIT 40`,
      [page.id, req.user.id, patterns, TYPES],
    );
  }
  // inventory objects mentioned on this page
  const objects = await many(
    `SELECT p.id, p.title, p.icon, p.page_type, s.key AS space_key, s.name AS space_name, s.color AS space_color
       FROM pages p JOIN spaces s ON s.id=p.space_id
      WHERE p.id<>$1 AND p.page_type = ANY($3) AND space_access(p.space_id,$2) >= 1 AND length(p.title) >= 3
        AND ($4::text ~* ('\\m' || regexp_replace(p.title, '([.*+?^$(){}|\\[\\]\\\\])', '\\\\\\1', 'g') || '\\M'))
      ORDER BY p.title LIMIT 40`,
    [page.id, req.user.id, TYPES, `${page.title}\n${page.content_text}\n${Object.values(page.properties || {}).join('\n')}`],
  );
  const byPattern = new Map(idents.map((i) => [`\\m${reEscape(i)}\\M`, i]));
  const map = (r) => ({
    id: r.id, title: r.title, icon: r.icon, pageType: r.page_type, spaceKey: r.space_key, spaceName: r.space_name, spaceColor: r.space_color,
    hits: (r.hits || []).map((h) => byPattern.get(h) || h),
  });
  res.json({ identifiers: idents, mentions: mentions.map(map), objects: objects.filter((o) => !mentions.some((m) => m.id === o.id)).map(map) });
});

export default router;
