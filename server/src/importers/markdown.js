/**
 * Folder-of-documents importer. Handles:
 *  - Wiki.js disk/Git storage exports (<!-- title: … --> headers, absolute /path links, {.is-info} callouts)
 *  - Notion "Markdown & CSV" exports (32-hex ids in file names, sibling folders for sub pages)
 *  - Obsidian vaults ([[wikilinks]], ![[embeds]], > [!note] callouts)
 *  - MkDocs / GitHub wikis / any folder of .md / .html files (index.md / README.md as folder page)
 */
import path from 'node:path';
import {
  createBundle, fileRef, guessMime, humanize, mdToHtml, normalizeHtml, pageRef, parseDate,
  resolveRelative, splitFrontMatter, toTagList, calloutVariant,
} from './util.js';

const DOC_RE = /\.(md|markdown|mdown|html?)$/i;
const NOTION_ID = /\s+[0-9a-f]{32}$/i;
const INDEX_NAMES = ['index', 'readme', '_index', 'home', 'start'];

const cleanName = (s) => s.replace(NOTION_ID, '').trim();
const stripExt = (p) => p.replace(DOC_RE, '');

function detectFlavor(zip, docs) {
  const sample = docs.slice(0, 30).map((p) => zip.text(p) || '');
  if (sample.some((t) => /^<!--\r?\ntitle:/.test(t))) return 'wikijs';
  if (docs.some((p) => NOTION_ID.test(stripExt(path.posix.basename(p))))) return 'notion';
  if (sample.some((t) => /\[\[[^\]]+\]\]/.test(t)) || [...zip.entries.keys()].some((p) => p.startsWith('.obsidian/'))) return 'obsidian';
  return 'generic';
}

/** Convert MkDocs admonitions and Obsidian syntax before markdown parsing */
function preprocess(md) {
  // !!! note "Title"\n    indented body
  md = md.replace(/^(!!!|\?\?\?\+?)\s+(\w+)(?:\s+"([^"]*)")?\n((?:(?: {4}|\t).*\n?|\s*\n)+)/gm, (_m, _k, type, title, body) => {
    const inner = body.replace(/^(?: {4}|\t)/gm, '');
    return `\n<div data-type="callout" data-variant="${calloutVariant(type)}">\n\n${title ? `**${title}**\n\n` : ''}${inner}\n</div>\n\n`;
  });
  // ![[image.png|300]] embeds
  md = md.replace(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, (_m, target) => `![${target}](<${target.trim()}>)`);
  // [[Page|Alias]] and [[Page#Heading]]
  md = md.replace(/\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, target, _h, alias) => `[${(alias || target).trim()}](<wikilink:${target.trim()}>)`);
  return md;
}

export async function importMarkdownZip(zip, { flavor: wanted = 'auto', folderPages = true } = {}) {
  const docs = [...zip.entries.keys()].filter((p) => DOC_RE.test(p) && !p.startsWith('.obsidian/'));
  if (!docs.length) throw new Error('Im Archiv wurden keine Markdown- oder HTML-Dateien gefunden');
  const flavor = wanted === 'auto' ? detectFlavor(zip, docs) : wanted;
  const bundle = createBundle(flavor === 'wikijs' ? 'wikijs' : flavor === 'notion' ? 'notion' : 'markdown');
  bundle.flavor = flavor;
  const warn = (m) => bundle.warnings.push(m);

  // ---------- pass 1: identify pages by path key
  const byKey = new Map();
  const byBasename = new Map(); // for wikilinks
  for (const file of docs) {
    const noExt = stripExt(file);
    const dir = path.posix.dirname(noExt);
    const base = path.posix.basename(noExt);
    // folder pages: dir/index.md → key "dir"
    const isIndex = INDEX_NAMES.includes(base.toLowerCase()) && dir !== '.';
    const key = isIndex && !byKey.has(dir) ? dir : noExt;
    const raw = zip.text(file);
    const { data, body } = splitFrontMatter(raw);
    const doc = { key, file, data, body, isHtml: /\.html?$/i.test(file) };
    byKey.set(key, doc);
    const bn = cleanName(path.posix.basename(key)).toLowerCase();
    if (!byBasename.has(bn)) byBasename.set(bn, key);
    if (data.title) byBasename.set(String(data.title).toLowerCase(), key);
  }
  if (flavor === 'notion') {
    for (const f of zip.entries.keys()) if (/\.csv$/i.test(f)) warn(`Notion-Datenbank übersprungen (CSV wird nicht importiert): ${f}`);
  }

  // parent = nearest ancestor that is a page; optionally create folder pages
  const folderKeys = new Set();
  const parentOf = (key) => {
    let dir = path.posix.dirname(key);
    while (dir && dir !== '.') {
      if (byKey.has(dir)) return dir;
      if (folderPages) {
        folderKeys.add(dir);
        return dir;
      }
      dir = path.posix.dirname(dir);
    }
    return null;
  };
  const parents = new Map([...byKey.keys()].map((k) => [k, parentOf(k)]));
  // folder pages themselves need parents too
  for (let changed = true; changed;) {
    changed = false;
    for (const f of folderKeys) {
      if (!parents.has(f)) { parents.set(f, parentOf(f)); changed = true; }
    }
  }

  // ---------- link + asset resolution
  const resolvePageKey = (fromKey, fromFile, href) => {
    if (href.startsWith('wikilink:')) {
      let name = href.slice(9);
      try { name = decodeURIComponent(name); } catch { /* keep */ }
      name = name.replace(/\.md$/i, '').toLowerCase();
      return byBasename.get(name) || byBasename.get(path.posix.basename(name)) || null;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null;
    const candidates = [];
    if (href.startsWith('/')) {
      // Wiki.js absolute paths, optionally with a locale prefix (/en/…)
      let t = href.split('#')[0].split('?')[0];
      try { t = decodeURIComponent(t); } catch { /* keep */ }
      t = t.replace(/^\/+/, '').replace(/\/$/, '');
      candidates.push(t, t.replace(/^[a-z]{2}(-[a-z]{2})?\//i, ''));
    } else {
      candidates.push(resolveRelative(fromFile, href));
    }
    for (const target of candidates) {
      const k = lookup(target);
      if (k) return k;
    }
    return null;
  };
  const lookup = (target) => {
    if (!target) return null;
    const noExt = stripExt(target);
    if (byKey.has(noExt)) return noExt;
    if (byKey.has(target)) return target;
    for (const idx of INDEX_NAMES) {
      const k = stripExt(path.posix.join(noExt, idx));
      if (byKey.get(k)?.key === noExt) return noExt;
    }
    if (folderKeys.has(noExt)) return noExt;
    return null;
  };

  const assetCache = new Map();
  const resolveAssetPath = (fromFile, src) => {
    let candidate = src.startsWith('/') ? resolveRelative('', src) : resolveRelative(fromFile, src);
    if (candidate && zip.has(candidate)) return candidate;
    // Obsidian/Notion: look up by file name anywhere in the archive
    let name = path.posix.basename(String(src).split('?')[0]);
    try { name = decodeURIComponent(name); } catch { /* keep */ }
    for (const p of zip.entries.keys()) if (path.posix.basename(p) === name && !DOC_RE.test(p)) return p;
    return null;
  };
  const addFile = (p) => {
    if (!assetCache.has(p)) {
      bundle.files.set(p, { name: path.posix.basename(p), mime: guessMime(p), data: zip.read(p) });
      assetCache.set(p, fileRef(p));
    }
    return assetCache.get(p);
  };

  // ---------- pass 2: convert
  for (const [key, doc] of byKey) {
    let md = doc.body;
    let title = doc.data.title ? String(doc.data.title) : null;
    if (!doc.isHtml) {
      const h1 = md.match(/^\s*#\s+(.+?)\s*#*\s*$/m);
      if (!title && h1 && md.trimStart().startsWith('#')) title = h1[1];
      if (h1 && title && h1[1].trim() === title.trim()) md = md.replace(h1[0], '');
    }
    if (!title) {
      const base = path.posix.basename(key);
      title = INDEX_NAMES.includes(base.toLowerCase()) ? humanize(path.posix.basename(path.posix.dirname(key)) || base) : cleanName(humanize(base));
    }
    let html = doc.isHtml
      ? (doc.body.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? doc.body)
      : mdToHtml(preprocess(md));
    html = await normalizeHtml(html, {
      warn,
      resolveLink: (href) => {
        const k = resolvePageKey(key, doc.file, href);
        return k ? pageRef(k) : null;
      },
      resolveAsset: async (src, opts) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('wikilink:')) return null;
        const p = resolveAssetPath(doc.file, src.replace(/^wikilink:/, ''));
        if (!p) return null;
        if (opts?.link && DOC_RE.test(p)) return null;
        return addFile(p);
      },
    });
    const props = {};
    if (doc.data.description) props.Beschreibung = String(doc.data.description);
    bundle.pages.push({
      key,
      parentKey: parents.get(key) || null,
      title: cleanName(title).slice(0, 200),
      html,
      tags: toTagList(doc.data.tags),
      properties: props,
      createdAt: parseDate(doc.data.dateCreated || doc.data.created || doc.data.date),
      updatedAt: parseDate(doc.data.date || doc.data.updated || doc.data.dateUpdated),
    });
  }
  for (const key of folderKeys) {
    if (byKey.has(key)) continue;
    bundle.pages.push({ key, parentKey: parents.get(key) || null, title: cleanName(humanize(path.posix.basename(key))), html: '', tags: [], properties: {} });
  }
  return bundle;
}
