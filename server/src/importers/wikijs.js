/**
 * Wiki.js 2.x live import via its GraphQL API (Administration → API Access → API key).
 * Pages are fetched and turned into a virtual archive, then processed by the Markdown importer,
 * so ZIP and API imports produce identical results.
 */
import { fetchBinary, fetchJson, normalizeBaseUrl } from './util.js';
import { importMarkdownZip } from './markdown.js';

const ASSET_RE = /(?:\]\(|src=["']|href=["'])(\/[^)"'\s]+\.(?:png|jpe?g|gif|webp|svg|pdf|txt|log|zip|gz|conf|cfg|ya?ml|json|xml|csv|docx?|xlsx?|pptx?|vsdx|drawio|sh|ps1))/gi;

export function virtualZip(files) {
  const entries = new Map(Object.entries(files));
  return {
    entries,
    has: (p) => entries.has(p),
    read: (p) => {
      const v = entries.get(p);
      return v == null ? undefined : Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8');
    },
    text: (p) => {
      const v = entries.get(p);
      return v == null ? undefined : Buffer.isBuffer(v) ? v.toString('utf8') : String(v);
    },
  };
}

export async function importWikiJsApi({ url, token }, onProgress = () => {}) {
  const base = normalizeBaseUrl(url);
  if (!token) throw new Error('API-Schlüssel fehlt');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const gql = async (query, variables) => {
    const res = await fetchJson(`${base}/graphql`, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    if (res.errors?.length) throw new Error(`Wiki.js: ${res.errors[0].message}`);
    return res.data;
  };

  const list = (await gql('{ pages { list(limit: 100000, orderBy: PATH) { id path locale title } } }')).pages.list;
  const locales = new Set(list.map((p) => p.locale));
  const files = {};
  const warnings = [];
  let done = 0;
  for (const item of list) {
    const { pages: { single: p } } = await gql(
      'query($id:Int!){ pages { single(id:$id) { id path locale title description content editor isPublished tags { tag } createdAt updatedAt } } }',
      { id: item.id },
    );
    const prefix = locales.size > 1 ? `${p.locale}/` : '';
    const ext = p.editor === 'markdown' ? 'md' : 'html';
    const header = [
      '<!--',
      `title: ${JSON.stringify(p.title)}`,
      `description: ${JSON.stringify(p.description || '')}`,
      `tags: ${JSON.stringify((p.tags || []).map((t) => t.tag))}`,
      `date: ${p.updatedAt}`,
      `dateCreated: ${p.createdAt}`,
      '-->',
      '',
    ].join('\n');
    files[`${prefix}${p.path}.${ext}`] = header + (p.content || '');
    for (const m of (p.content || '').matchAll(ASSET_RE)) {
      const assetPath = decodeURIComponent(m[1]).replace(/^\//, '');
      if (files[assetPath]) continue;
      try {
        files[assetPath] = (await fetchBinary(`${base}/${encodeURI(assetPath)}`, { headers: { Authorization: headers.Authorization } })).data;
      } catch (err) {
        warnings.push(`Datei konnte nicht geladen werden: /${assetPath} (${err.message})`);
      }
    }
    onProgress(++done, list.length);
  }
  const bundle = await importMarkdownZip(virtualZip(files), { flavor: 'wikijs' });
  bundle.source = 'wikijs';
  bundle.warnings.unshift(...warnings);
  return bundle;
}
