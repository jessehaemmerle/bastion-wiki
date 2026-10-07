/**
 * Writes an ImportBundle into the wiki: spaces, pages (parents first), attachments, tags,
 * revisions – then rewrites the placeholder links to real page / attachment URLs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { one, query } from '../db/index.js';
import { slugify } from '../lib/http.js';
import { sanitize, htmlToText } from '../lib/sanitize.js';
import { cleanProperties, normalizeTags, setTags, uniqueSlug } from '../routes/pages.js';
import { uploadDir } from '../routes/attachments.js';
import { FILE_PREFIX, PAGE_PREFIX } from './util.js';

const SOURCE_LABEL = {
  wikijs: 'Wiki.js', confluence: 'Confluence', bookstack: 'BookStack', notion: 'Notion', markdown: 'Markdown',
  mediawiki: 'MediaWiki', dokuwiki: 'DokuWiki',
};
const COLORS = ['#1f5f99', '#2f7d45', '#9a5b00', '#8e1f3f', '#007577', '#5b5b9a', '#c1121c', '#4d6f39'];

async function uniqueSpaceKey(base) {
  const root = (slugify(base) || 'import').slice(0, 24).replace(/^-+|-+$/g, '') || 'import';
  let key = /^[a-z0-9]/.test(root) ? root : `w-${root}`;
  for (let i = 2; await one('SELECT 1 FROM spaces WHERE key=$1', [key]); i++) key = `${root.slice(0, 22)}-${i}`;
  return key;
}

async function createSpace({ name, description, color, icon, defaultAccess }, userId) {
  const key = await uniqueSpaceKey(name);
  const space = await one(
    `INSERT INTO spaces (key, name, description, icon, color, default_access, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [key, String(name).slice(0, 80), String(description || '').slice(0, 500), icon || 'book-open', color || COLORS[0], defaultAccess || 'read', userId],
  );
  await query(`INSERT INTO space_permissions (space_id, principal_type, principal_id, level) VALUES ($1,'user',$2,'admin')`, [space.id, userId]);
  return space;
}

/** parents before children; missing parents and cycles become roots */
function orderPages(pages) {
  const byKey = new Map(pages.map((p) => [p.key, p]));
  const children = new Map();
  const roots = [];
  for (const p of pages) {
    let parent = p.parentKey && byKey.has(p.parentKey) && p.parentKey !== p.key ? p.parentKey : null;
    // cycle guard
    const seen = new Set([p.key]);
    for (let cur = parent; cur; cur = byKey.get(cur)?.parentKey) {
      if (seen.has(cur)) { parent = null; break; }
      seen.add(cur);
    }
    p.parentKey = parent;
    if (parent) (children.get(parent) || children.set(parent, []).get(parent)).push(p);
    else roots.push(p);
  }
  const sortFn = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title, 'de');
  const out = [];
  const walk = (list) => {
    list.sort(sortFn);
    list.forEach((p, i) => {
      p.position = i;
      out.push(p);
      walk(children.get(p.key) || []);
    });
  };
  walk(roots);
  return out;
}

/**
 * opts:
 *   spaceMode: 'existing' | 'new' | 'perGroup'
 *   spaceId, newSpace {name, color, icon, defaultAccess}, parentPageId
 *   onConflict: 'skip' | 'update' | 'duplicate'
 *   preserveDates: bool, extraTags: string[]
 */
export async function writeBundle(bundle, opts, { userId, onProgress = () => {}, warn = () => {} }) {
  const label = SOURCE_LABEL[bundle.source] || bundle.source;
  const result = { created: 0, updated: 0, skipped: 0, attachments: 0, failed: 0, spaces: [], firstPageId: null };
  const extraTags = normalizeTags(opts.extraTags || []);

  // ---------- target spaces
  const spaceFor = new Map(); // group key ('' = default) → space row
  let pages = bundle.pages.map((p) => ({ ...p }));
  if (opts.spaceMode === 'existing') {
    const space = await one('SELECT * FROM spaces WHERE id=$1', [opts.spaceId]);
    if (!space) throw new Error('Zielbereich existiert nicht');
    spaceFor.set('', space);
  } else if (opts.spaceMode === 'perGroup' && bundle.groups.size) {
    let i = 0;
    for (const [gk, g] of bundle.groups) {
      const space = await createSpace({ name: g.name, description: g.description, color: COLORS[i++ % COLORS.length], defaultAccess: opts.newSpace?.defaultAccess }, userId);
      spaceFor.set(gk, space);
      result.spaces.push({ id: space.id, key: space.key, name: space.name });
    }
    // group roots (e.g. BookStack books) become the space itself
    const rootKeys = new Set(pages.filter((p) => p.isGroupRoot).map((p) => p.key));
    pages = pages.filter((p) => !p.isGroupRoot).map((p) => (rootKeys.has(p.parentKey) ? { ...p, parentKey: null } : p));
  }
  const defaultSpace = async () => {
    if (!spaceFor.has('')) {
      const name = opts.newSpace?.name || [...bundle.groups.values()][0]?.name || `${label}-Import`;
      const space = await createSpace({ ...opts.newSpace, name, description: opts.newSpace?.description || `Importiert aus ${label}` }, userId);
      spaceFor.set('', space);
      result.spaces.push({ id: space.id, key: space.key, name: space.name });
    }
    return spaceFor.get('');
  };

  const ordered = orderPages(pages);
  const ids = new Map(); // key → page id
  const spaceOfKey = new Map();
  const work = [];
  const total = ordered.length * 2;
  let step = 0;

  // ---------- pass 1: create page rows (parents first)
  for (const p of ordered) {
    try {
      const space = spaceFor.get(p.group || '') || spaceFor.get('') || (await defaultSpace());
      let parentId = p.parentKey && spaceOfKey.get(p.parentKey) === space.id ? ids.get(p.parentKey) ?? null : null;
      if (!p.parentKey && opts.spaceMode === 'existing' && opts.parentPageId) parentId = opts.parentPageId;
      const title = (p.title || 'Unbenannt').slice(0, 200);
      const existing = opts.onConflict !== 'duplicate'
        ? await one('SELECT id, version FROM pages WHERE space_id=$1 AND parent_id IS NOT DISTINCT FROM $2 AND lower(title)=lower($3) LIMIT 1', [space.id, parentId, title])
        : null;
      spaceOfKey.set(p.key, space.id);
      if (existing && opts.onConflict === 'skip') {
        ids.set(p.key, existing.id);
        result.skipped++;
      } else if (existing && opts.onConflict === 'update') {
        ids.set(p.key, existing.id);
        work.push({ p, id: existing.id, version: existing.version + 1, update: true });
      } else {
        const slug = await uniqueSlug({ query: (...a) => query(...a) }, space.id, title);
        const row = await one(
          `INSERT INTO pages (space_id, parent_id, title, slug, content, content_text, page_type, properties, sort_order, version, created_by, updated_by)
           VALUES ($1,$2,$3,$4,'','',$5,$6,$7,1,$8,$8) RETURNING id`,
          [space.id, parentId, title, slug, p.pageType || 'doc', cleanProperties(p.properties), p.position ?? 0, userId],
        );
        ids.set(p.key, row.id);
        work.push({ p, id: row.id, version: 1, update: false });
        result.firstPageId ??= row.id;
      }
    } catch (err) {
      result.failed++;
      warn(`Seite „${p.title}“ konnte nicht angelegt werden: ${err.message}`);
    }
    onProgress(++step, total);
  }

  // ---------- pass 2: attachments, links, content, revisions, tags
  for (const { p, id, version, update } of work) {
    try {
      const attached = new Map(); // fileKey → attachment id
      const attach = async (fileKey) => {
        if (attached.has(fileKey)) return attached.get(fileKey);
        const f = bundle.files.get(fileKey);
        if (!f?.data) return null;
        if (update) {
          const same = await one('SELECT id FROM attachments WHERE page_id=$1 AND filename=$2 AND size_bytes=$3', [id, String(f.name).slice(0, 200), f.data.length]);
          if (same) { attached.set(fileKey, same.id); return same.id; }
        }
        const stored = crypto.randomBytes(16).toString('hex');
        await fs.writeFile(path.join(uploadDir, stored), f.data);
        const row = await one(
          `INSERT INTO attachments (page_id, filename, stored_name, mime_type, size_bytes, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [id, String(f.name).slice(0, 200), stored, f.mime || 'application/octet-stream', f.data.length, userId],
        );
        attached.set(fileKey, row.id);
        result.attachments++;
        return row.id;
      };
      let html = String(p.html || '');
      // drop a leading <h1> that only repeats the page title
      const h1 = html.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1 && h1[1].replace(/<[^>]+>/g, '').trim().toLowerCase() === String(p.title).trim().toLowerCase()) html = html.slice(h1[0].length);
      const fileKeys = [...new Set([...html.matchAll(/bimp:\/\/file\/([^"'\s)<>]+)/g)].map((m) => decodeURIComponent(m[1])))];
      for (const k of fileKeys) await attach(k);
      for (const k of p.extraFiles || []) await attach(k);
      html = html
        .replace(/bimp:\/\/file\/([^"'\s)<>]+)/g, (_m, k) => {
          const aid = attached.get(decodeURIComponent(k));
          return aid ? `/api/attachments/${aid}` : '#';
        })
        .replace(/bimp:\/\/page\/([^"'\s)<>]+)/g, (_m, k) => {
          const pid = ids.get(decodeURIComponent(k));
          return pid ? `/p/${pid}` : '#';
        });
      if (html.includes(PAGE_PREFIX) || html.includes(FILE_PREFIX)) html = html.replaceAll(PAGE_PREFIX, '#').replaceAll(FILE_PREFIX, '#');
      const content = sanitize(html);
      const props = cleanProperties(p.properties);
      const created = opts.preserveDates && p.createdAt ? p.createdAt : null;
      const updated = opts.preserveDates && (p.updatedAt || p.createdAt) ? p.updatedAt || p.createdAt : null;
      await query(
        `UPDATE pages SET content=$2, content_text=$3, properties=$4, version=$5, updated_by=$6,
                created_at=COALESCE($7::timestamptz, created_at), updated_at=COALESCE($8::timestamptz, now())
          WHERE id=$1`,
        [id, content, htmlToText(content), props, version, userId, update ? null : created, updated],
      );
      await query(
        `INSERT INTO page_revisions (page_id, version, title, content, properties, summary, author_id, created_at)
         VALUES ($1,$2,(SELECT title FROM pages WHERE id=$1),$3,$4,$5,$6,COALESCE($7::timestamptz, now()))
         ON CONFLICT (page_id, version) DO NOTHING`,
        [id, version, content, props, `Importiert aus ${label}`, userId, updated],
      );
      const tags = normalizeTags([...(p.tags || []), ...extraTags]);
      if (tags.length) {
        if (update) {
          const existingTags = (await query('SELECT t.name FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=$1', [id])).rows.map((r) => r.name);
          await setTags({ query: (...a) => query(...a) }, id, [...existingTags, ...tags]);
        } else {
          await setTags({ query: (...a) => query(...a) }, id, tags);
        }
      }
      if (update) result.updated++;
      else result.created++;
    } catch (err) {
      result.failed++;
      warn(`Inhalt von „${p.title}“ konnte nicht geschrieben werden: ${err.message}`);
    }
    onProgress(++step, total);
  }
  for (const s of spaceFor.values()) if (!result.spaces.some((x) => x.id === s.id)) result.spaces.push({ id: s.id, key: s.key, name: s.name });
  return result;
}
