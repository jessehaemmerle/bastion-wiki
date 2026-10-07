/**
 * BookStack import.
 *  - Live via REST API (Settings → Users → API tokens; needs "Access system API" permission)
 *  - Portable ZIP export (BookStack ≥ v24.11: Book/Chapter/Page → Export → "Portable ZIP")
 * Mapping: Book → top-level page (or its own space when "one space per group" is chosen),
 *          Chapter → sub page, Page → sub page of its chapter/book.
 */
import * as cheerio from 'cheerio';
import {
  createBundle, fetchBinary, fetchJson, fileRef, guessMime, mdToHtml, normalizeBaseUrl,
  normalizeHtml, pageRef, parseDate,
} from './util.js';

function bookstackCallouts(html) {
  const $ = cheerio.load(`<div id="r">${html || ''}</div>`, { decodeEntities: false });
  $('p.callout, div.callout').each((_, el) => {
    const c = $(el);
    const variant = ['success', 'warning', 'danger'].find((v) => c.hasClass(v)) || 'info';
    c.replaceWith(`<div data-type="callout" data-variant="${variant}"><p>${c.html()}</p></div>`);
  });
  // drawio diagrams are stored as images
  $('div[drawio-diagram]').each((_, el) => { $(el).replaceWith($(el).html()); });
  // image links wrapping thumbnails → keep image only
  $('a > img').each((_, el) => {
    const a = $(el).parent();
    if (a.children().length === 1 && /\/uploads\/images\//.test(a.attr('href') || '')) a.replaceWith($(el));
  });
  return $('#r').html();
}

const tagsOf = (tags) => (tags || []).map((t) => (t.value ? `${t.name}-${t.value}` : t.name));
const propsOf = (tags) => Object.fromEntries((tags || []).filter((t) => t.value).map((t) => [t.name, t.value]));

// ------------------------------------------------------------------ API
export async function importBookStackApi({ url, tokenId, tokenSecret }, onProgress = () => {}) {
  const base = normalizeBaseUrl(url);
  if (!tokenId || !tokenSecret) throw new Error('Token-ID und Token-Secret werden benötigt');
  const headers = { Authorization: `Token ${tokenId}:${tokenSecret}`, Accept: 'application/json' };
  const getAll = async (endpoint) => {
    const out = [];
    for (let offset = 0; ; offset += 500) {
      const res = await fetchJson(`${base}/api/${endpoint}?count=500&offset=${offset}`, { headers });
      out.push(...res.data);
      if (out.length >= res.total || !res.data.length) return out;
    }
  };

  const bundle = createBundle('bookstack');
  const warn = (m) => bundle.warnings.push(m);
  const [books, chapters, pageList] = await Promise.all([getAll('books'), getAll('chapters'), getAll('pages')]);
  const total = books.length + chapters.length + pageList.length;
  let done = 0;

  const bySlug = new Map(); // "book/page" and "book/chapter" → key
  const bookSlug = new Map(books.map((b) => [b.id, b.slug]));
  for (const b of books) bySlug.set(`book:${b.slug}`, `book-${b.id}`);
  for (const c of chapters) bySlug.set(`chapter:${bookSlug.get(c.book_id)}/${c.slug}`, `chapter-${c.id}`);
  for (const p of pageList) bySlug.set(`page:${bookSlug.get(p.book_id)}/${p.slug}`, `page-${p.id}`);
  const pageIds = new Set(pageList.map((p) => p.id));

  const resolveLink = (href) => {
    let u;
    try { u = new URL(href, base); } catch { return null; }
    if (!u.href.startsWith(base)) return null;
    const rel = u.pathname.slice(new URL(base).pathname.replace(/\/$/, '').length);
    let m = rel.match(/^\/link\/(\d+)/);
    if (m && pageIds.has(Number(m[1]))) return pageRef(`page-${m[1]}`);
    m = rel.match(/^\/books\/([^/]+)\/page\/([^/#?]+)/);
    if (m && bySlug.has(`page:${m[1]}/${m[2]}`)) return pageRef(bySlug.get(`page:${m[1]}/${m[2]}`));
    m = rel.match(/^\/books\/([^/]+)\/chapter\/([^/#?]+)/);
    if (m && bySlug.has(`chapter:${m[1]}/${m[2]}`)) return pageRef(bySlug.get(`chapter:${m[1]}/${m[2]}`));
    m = rel.match(/^\/books\/([^/#?]+)\/?$/);
    if (m && bySlug.has(`book:${m[1]}`)) return pageRef(bySlug.get(`book:${m[1]}`));
    return null;
  };
  const resolveAsset = async (src) => {
    let u;
    try { u = new URL(src, base); } catch { return null; }
    if (!u.href.startsWith(base) || !/\/uploads\//.test(u.pathname)) return null;
    const key = u.pathname;
    if (!bundle.files.has(key)) {
      const { data, mime } = await fetchBinary(u.href, { headers });
      const name = decodeURIComponent(u.pathname.split('/').pop());
      bundle.files.set(key, { name, mime: mime || guessMime(name), data });
    }
    return fileRef(key);
  };

  for (const b of books) {
    bundle.groups.set(`book-${b.id}`, { name: b.name, description: (b.description || '').slice(0, 500) });
    bundle.pages.push({
      key: `book-${b.id}`, parentKey: null, title: b.name, group: `book-${b.id}`, isGroupRoot: true,
      html: b.description ? `<p>${b.description.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>` : '',
      tags: [], properties: {}, createdAt: parseDate(b.created_at), updatedAt: parseDate(b.updated_at), sortOrder: 0,
    });
    onProgress(++done, total);
  }
  for (const c of chapters) {
    const full = await fetchJson(`${base}/api/chapters/${c.id}`, { headers }).catch(() => c);
    bundle.pages.push({
      key: `chapter-${c.id}`, parentKey: `book-${c.book_id}`, title: c.name, group: `book-${c.book_id}`,
      html: full.description_html || (full.description ? `<p>${full.description}</p>` : ''),
      tags: tagsOf(full.tags), properties: propsOf(full.tags), sortOrder: c.priority,
      createdAt: parseDate(c.created_at), updatedAt: parseDate(c.updated_at),
    });
    onProgress(++done, total);
  }
  for (const p of pageList) {
    const full = await fetchJson(`${base}/api/pages/${p.id}`, { headers });
    let html = full.html || (full.markdown ? mdToHtml(full.markdown) : '');
    html = await normalizeHtml(bookstackCallouts(html), { warn, resolveLink, resolveAsset });
    // attachments
    const extraFiles = [];
    try {
      const atts = await fetchJson(`${base}/api/attachments?filter[uploaded_to]=${p.id}&count=500`, { headers });
      for (const a of atts.data || []) {
        const detail = await fetchJson(`${base}/api/attachments/${a.id}`, { headers });
        if (detail.external) {
          html += `<p><a href="${detail.content}">${a.name}</a></p>`;
          continue;
        }
        const name = a.extension ? `${a.name.replace(new RegExp(`\\.${a.extension}$`), '')}.${a.extension}` : a.name;
        const key = `attachment-${a.id}`;
        bundle.files.set(key, { name, mime: guessMime(name), data: Buffer.from(detail.content, 'base64') });
        extraFiles.push(key);
      }
    } catch (err) {
      warn(`Anhänge von „${p.name}“ konnten nicht geladen werden: ${err.message}`);
    }
    bundle.pages.push({
      key: `page-${p.id}`, parentKey: p.chapter_id ? `chapter-${p.chapter_id}` : `book-${p.book_id}`, group: `book-${p.book_id}`,
      title: p.name, html, tags: tagsOf(full.tags), properties: propsOf(full.tags), sortOrder: p.priority, extraFiles,
      createdAt: parseDate(p.created_at), updatedAt: parseDate(p.updated_at),
    });
    onProgress(++done, total);
  }
  return bundle;
}

// ------------------------------------------------------------------ portable ZIP export
export async function importBookStackZip(zip) {
  const raw = zip.text('data.json');
  if (!raw) throw new Error('data.json fehlt – ist das ein „Portable ZIP“-Export von BookStack?');
  const data = JSON.parse(raw);
  const bundle = createBundle('bookstack');
  const warn = (m) => bundle.warnings.push(m);
  const images = new Map();
  const attachments = new Map();
  const entityKeys = new Map(); // "page:12" → key

  const collect = (page) => {
    for (const img of page.images || []) images.set(String(img.id), img);
    for (const a of page.attachments || []) attachments.set(String(a.id), a);
  };
  const books = data.book ? [data.book] : [];
  const looseChapters = data.chapter ? [data.chapter] : [];
  const loosePages = data.page ? [data.page] : [];
  for (const b of books) {
    entityKeys.set(`book:${b.id}`, `book-${b.id}`);
    for (const c of b.chapters || []) {
      entityKeys.set(`chapter:${c.id}`, `chapter-${c.id}`);
      for (const p of c.pages || []) { entityKeys.set(`page:${p.id}`, `page-${p.id}`); collect(p); }
    }
    for (const p of b.pages || []) { entityKeys.set(`page:${p.id}`, `page-${p.id}`); collect(p); }
  }
  for (const c of looseChapters) {
    entityKeys.set(`chapter:${c.id}`, `chapter-${c.id}`);
    for (const p of c.pages || []) { entityKeys.set(`page:${p.id}`, `page-${p.id}`); collect(p); }
  }
  for (const p of loosePages) { entityKeys.set(`page:${p.id}`, `page-${p.id}`); collect(p); }

  const fileFor = (prefix, id, item) => {
    if (!item?.file) return null;
    const key = `${prefix}-${id}`;
    const p = `files/${item.file}`;
    if (!bundle.files.has(key)) {
      const buf = zip.read(p);
      if (!buf) { warn(`Datei fehlt im Archiv: ${p}`); return null; }
      const name = item.name && /\.\w+$/.test(item.name) ? item.name : item.file;
      bundle.files.set(key, { name, mime: guessMime(name), data: buf });
    }
    return key;
  };
  const replaceRefs = (html) => html.replace(/\[\[bsexport:(image|attachment|page|chapter|book):(\d+)\]\]/g, (m, type, id) => {
    if (type === 'image') { const k = fileFor('image', id, images.get(id)); return k ? fileRef(k) : m; }
    if (type === 'attachment') { const k = fileFor('attachment', id, attachments.get(id)); return k ? fileRef(k) : m; }
    const k = entityKeys.get(`${type}:${id}`);
    return k ? pageRef(k) : '#';
  });

  const addPage = async (p, parentKey, group) => {
    let html = p.html || (p.markdown ? mdToHtml(p.markdown) : '');
    html = await normalizeHtml(bookstackCallouts(replaceRefs(html)), { warn });
    const extraFiles = [];
    for (const a of p.attachments || []) {
      if (a.link) { html += `<p><a href="${a.link}">${a.name}</a></p>`; continue; }
      const k = fileFor('attachment', a.id, a);
      if (k && !html.includes(fileRef(k))) extraFiles.push(k);
    }
    bundle.pages.push({ key: `page-${p.id}`, parentKey, group, title: p.name, html, tags: tagsOf(p.tags), properties: propsOf(p.tags), sortOrder: p.priority, extraFiles });
  };
  const addChapter = async (c, parentKey, group) => {
    bundle.pages.push({ key: `chapter-${c.id}`, parentKey, group, title: c.name, html: replaceRefs(c.description_html || ''), tags: tagsOf(c.tags), properties: propsOf(c.tags), sortOrder: c.priority });
    for (const p of c.pages || []) await addPage(p, `chapter-${c.id}`, group);
  };
  for (const b of books) {
    const group = `book-${b.id}`;
    bundle.groups.set(group, { name: b.name, description: cheerio.load(b.description_html || '').text().slice(0, 500) });
    bundle.pages.push({ key: group, parentKey: null, group, isGroupRoot: true, title: b.name, html: replaceRefs(b.description_html || ''), tags: tagsOf(b.tags), properties: propsOf(b.tags) });
    for (const c of b.chapters || []) await addChapter(c, group, group);
    for (const p of b.pages || []) await addPage(p, group, group);
  }
  for (const c of looseChapters) await addChapter(c, null, null);
  for (const p of loosePages) await addPage(p, null, null);
  if (!bundle.pages.length) throw new Error('Der Export enthält keine Bücher, Kapitel oder Seiten');
  return bundle;
}
