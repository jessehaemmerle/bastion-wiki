import { Router } from 'express';
import { many, one } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();
router.use(requireAuth);

/**
 * Parse a query like `nginx reload tag:web space:infra type:runbook`
 * into filters + free text.
 */
export function parseQuery(raw) {
  const filters = { tags: [], space: null, type: null };
  const words = [];
  const re = /(\w+):("[^"]+"|\S+)|"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(raw))) {
    if (m[1]) {
      const key = m[1].toLowerCase();
      const val = m[2].replace(/^"|"$/g, '');
      if (key === 'tag' || key === 't') filters.tags.push(val.toLowerCase().replace(/^#/, ''));
      else if (key === 'space' || key === 's') filters.space = val.toLowerCase();
      else if (key === 'type') filters.type = val.toLowerCase();
      else words.push(m[0]);
    } else if (m[3]) words.push(m[3]);
    else if (m[4]?.startsWith('#') && m[4].length > 1) filters.tags.push(m[4].slice(1).toLowerCase());
    else if (m[4]) words.push(m[4]);
  }
  return { filters, text: words.join(' ').trim() };
}

function toTsQuery(text) {
  const terms = text
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}_.-]/gu, '').replace(/^[.-]+|[.-]+$/g, ''))
    .filter(Boolean)
    .slice(0, 12);
  if (!terms.length) return null;
  return terms.map((t) => `'${t.replace(/'/g, "''")}':*`).join(' & ');
}

const MARK_START = '\u0002';
const MARK_END = '\u0003';

router.get('/search', async (req, res) => {
  const raw = String(req.query.q || '').slice(0, 300);
  const limit = Math.min(Math.max(Math.floor(Number(req.query.limit)) || 20, 1), 100);
  const { filters, text } = parseQuery(raw);
  if (req.query.space) filters.space = String(req.query.space);
  if (req.query.type) filters.type = String(req.query.type);
  if (req.query.tag) filters.tags.push(String(req.query.tag));

  // unaccent before quoting: it can turn letters into quotes (e.g. U+02BC → ') and break the tsquery syntax
  const tsq = text ? toTsQuery((await one('SELECT immutable_unaccent($1) AS t', [text]))?.t || '') : null;
  const params = [req.user.id];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  const where = ['page_access(p.id, $1) >= 1'];

  let rank = '0';
  let headline = 'left(p.content_text, 200)';
  if (text) {
    const like = p(`%${text.replace(/[%_\\]/g, '\\$&')}%`);
    if (tsq) {
      const q = p(tsq);
      const tsExpr = `to_tsquery('simple', ${q})`;
      where.push(`(p.search_vector @@ ${tsExpr} OR p.title ILIKE ${like} OR p.content_text ILIKE ${like} OR p.properties::text ILIKE ${like})`);
      rank = `ts_rank_cd(p.search_vector, ${tsExpr}) + similarity(p.title, ${p(text)}) * 2 + CASE WHEN p.title ILIKE ${like} THEN 1 ELSE 0 END`;
      headline = `ts_headline('simple', p.content_text, ${tsExpr},
        'StartSel=${MARK_START}, StopSel=${MARK_END}, MaxWords=32, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "')`;
    } else {
      where.push(`(p.title ILIKE ${like} OR p.content_text ILIKE ${like})`);
    }
  }
  if (filters.space) where.push(`s.key = ${p(filters.space)}`);
  if (filters.type) where.push(`p.page_type = ${p(filters.type)}`);
  for (const tag of filters.tags) {
    where.push(`EXISTS (SELECT 1 FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=p.id AND t.name = ${p(tag)})`);
  }
  if (!text && !filters.space && !filters.type && !filters.tags.length) {
    return res.json({ query: raw, filters, pages: [], spaces: [], tags: [], total: 0 });
  }

  const started = Date.now();
  const pages = await many(
    `SELECT p.id, p.title, p.icon, p.page_type, p.updated_at, s.key AS space_key, s.name AS space_name, s.color AS space_color,
            ${headline} AS snippet, ${rank} AS rank,
            (SELECT coalesce(array_agg(t.name ORDER BY t.name), '{}') FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=p.id) AS tags
       FROM pages p JOIN spaces s ON s.id=p.space_id
      WHERE ${where.join(' AND ')}
      ORDER BY rank DESC, p.updated_at DESC
      LIMIT ${limit}`,
    params,
  );

  let spaces = [];
  let tags = [];
  if (text) {
    const like = `%${text.replace(/[%_\\]/g, '\\$&')}%`;
    [spaces, tags] = await Promise.all([
      many(
        `SELECT id, key, name, icon, color, description FROM spaces s
          WHERE space_access(s.id, $1) >= 1 AND (name ILIKE $2 OR key ILIKE $2 OR description ILIKE $2) ORDER BY name LIMIT 5`,
        [req.user.id, like],
      ),
      many(
        `SELECT t.name, t.color, count(pt.page_id)::int AS count FROM tags t
           JOIN page_tags pt ON pt.tag_id=t.id JOIN pages p ON p.id=pt.page_id
          WHERE page_access(p.id, $1) >= 1 AND (t.name ILIKE $2 OR similarity(t.name, $3) > 0.3)
          GROUP BY t.id ORDER BY count DESC LIMIT 8`,
        [req.user.id, like, text],
      ),
    ]);
  }

  res.json({
    query: raw,
    filters,
    tookMs: Date.now() - started,
    total: pages.length,
    pages: pages.map((r) => ({
      id: r.id, title: r.title, icon: r.icon, pageType: r.page_type, updatedAt: r.updated_at,
      spaceKey: r.space_key, spaceName: r.space_name, spaceColor: r.space_color,
      snippet: r.snippet, tags: r.tags, rank: Number(r.rank),
    })),
    spaces,
    tags,
  });
});

export default router;
