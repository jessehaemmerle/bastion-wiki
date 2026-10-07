/**
 * Shared helpers for all importers.
 *
 * Every importer produces an ImportBundle:
 *   {
 *     source: 'wikijs' | 'confluence' | ...,
 *     pages: [{ key, parentKey, title, html, tags, properties, pageType, createdAt, updatedAt, group, extraFiles }],
 *     files: Map<fileKey, { name, mime, data: Buffer }>,
 *     groups: Map<groupKey, { name, description }>,   // optional (Confluence space, BookStack book …)
 *     warnings: string[],
 *   }
 * Internal links/assets inside `html` are written as placeholders (see pageRef/fileRef);
 * the writer replaces them with real URLs once page and attachment ids exist.
 */
import path from 'node:path';
import AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import YAML from 'yaml';

export const PAGE_PREFIX = 'bimp://page/';
export const FILE_PREFIX = 'bimp://file/';
export const pageRef = (key) => PAGE_PREFIX + encodeURIComponent(key);
export const fileRef = (key) => FILE_PREFIX + encodeURIComponent(key);

const MAX_ENTRIES = 50000;
const MAX_UNCOMPRESSED = Number(process.env.IMPORT_MAX_UNCOMPRESSED_MB || 4096) * 1024 * 1024;

export function createBundle(source) {
  return { source, pages: [], files: new Map(), groups: new Map(), warnings: [] };
}

/** Open a ZIP archive and return { entries: Map<path, entry>, read(path) } with a single wrapper folder stripped. */
export function openZip(file) {
  let zip;
  try {
    zip = new AdmZip(file);
  } catch {
    throw new Error('Die Datei ist kein gültiges ZIP-Archiv');
  }
  const raw = zip.getEntries().filter((e) => !e.isDirectory);
  if (raw.length > MAX_ENTRIES) throw new Error(`Das Archiv enthält mehr als ${MAX_ENTRIES} Dateien`);
  const total = raw.reduce((n, e) => n + (e.header.size || 0), 0);
  if (total > MAX_UNCOMPRESSED) throw new Error('Das Archiv ist entpackt zu groß');

  const names = raw.map((e) => e.entryName.replace(/\\/g, '/'))
    .filter((n) => !n.split('/').some((s) => s === '__MACOSX' || s === '.git' || s.startsWith('.DS_Store')));
  // strip a single common wrapper directory ("export-2024/…")
  let prefix = '';
  const first = new Set(names.map((n) => (n.includes('/') ? n.split('/')[0] : '')));
  if (first.size === 1 && !first.has('')) prefix = `${[...first][0]}/`;

  const entries = new Map();
  for (const e of raw) {
    const name = e.entryName.replace(/\\/g, '/');
    if (!names.includes(name)) continue;
    const rel = path.posix.normalize(name.slice(prefix.length)).replace(/^(\.\.\/)+/, '');
    entries.set(rel, e);
  }
  return {
    entries,
    has: (p) => entries.has(p),
    read: (p) => entries.get(p)?.getData(),
    text: (p) => entries.get(p)?.getData().toString('utf8'),
  };
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', pdf: 'application/pdf', txt: 'text/plain', log: 'text/plain',
  csv: 'text/csv', json: 'application/json', xml: 'application/xml', zip: 'application/zip', gz: 'application/gzip',
  mp4: 'video/mp4', webm: 'video/webm', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  vsdx: 'application/vnd.ms-visio.drawing', drawio: 'application/xml', md: 'text/markdown',
};
export const guessMime = (name) => MIME[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream';
export const isImage = (name) => /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);

/** "netzwerk-und_firewall" → "Netzwerk und firewall" */
export function humanize(segment) {
  const s = decodeURIComponent(String(segment)).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : 'Unbenannt';
}

export function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Front matter: YAML between --- lines, or Wiki.js style <!-- key: value --> header. */
export function splitFrontMatter(text) {
  let body = String(text || '').replace(/^﻿/, '');
  let data = {};
  const yamlMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const commentMatch = body.match(/^<!--\r?\n([\s\S]*?)\r?\n-->\r?\n?/);
  const m = yamlMatch || commentMatch;
  if (m) {
    try {
      data = YAML.parse(m[1]) || {};
    } catch {
      for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^([\w-]+):\s*(.*)$/);
        if (kv) data[kv[1]] = kv[2];
      }
    }
    body = body.slice(m[0].length);
  }
  return { data: typeof data === 'object' ? data : {}, body };
}

export function toTagList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  return String(v).split(/[,;]/).map((t) => t.trim()).filter(Boolean);
}

marked.setOptions({ gfm: true, breaks: false });
export const mdToHtml = (md) => marked.parse(String(md || ''));

const CALLOUT_WORDS = {
  note: 'info', info: 'info', abstract: 'info', summary: 'info', todo: 'info', important: 'info', question: 'info', quote: 'info',
  tip: 'tip', hint: 'tip', success: 'success', check: 'success', done: 'success',
  warning: 'warning', caution: 'warning', attention: 'warning',
  danger: 'danger', error: 'danger', failure: 'danger', bug: 'danger',
};
export const calloutVariant = (word) => CALLOUT_WORDS[String(word).toLowerCase()] || 'info';

/**
 * Normalise imported HTML into the editor's dialect and rewrite links.
 * resolveLink(href) → placeholder | null (null = keep as is)
 * resolveAsset(src) → Promise<placeholder | null>
 */
export async function normalizeHtml(html, { resolveLink = () => null, resolveAsset = async () => null, warn = () => {} } = {}) {
  const $ = cheerio.load(`<div id="__root">${html || ''}</div>`, { decodeEntities: false });
  const root = $('#__root');
  root.find('script, style, link, meta, iframe, object, embed, form, noscript').remove();

  // GitHub/Obsidian alerts: > [!NOTE] … and Wiki.js: > text {.is-info}
  root.find('blockquote').each((_, el) => {
    const bq = $(el);
    const inner = bq.html() || '';
    let variant = null;
    let out = inner;
    const gh = inner.match(/^\s*<p>\s*\[!(\w+)\][+-]?\s*([^<\n]*)/i);
    if (gh) {
      variant = calloutVariant(gh[1]);
      out = inner.replace(/\[!\w+\][+-]?[ \t]*/, '').replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/, '');
      if (gh[2].trim()) out = out.replace(gh[2], `<strong>${gh[2].trim()}</strong>`);
    }
    const wj = inner.match(/\{\.is-(info|success|warning|danger)\}/);
    if (wj) {
      variant = wj[1];
      out = inner.replace(/\s*\{\.is-\w+\}\s*/g, '');
    }
    if (variant) bq.replaceWith(`<div data-type="callout" data-variant="${variant}">${out}</div>`);
  });

  // GFM task lists → TipTap task lists
  root.find('li').each((_, el) => {
    const li = $(el);
    const box = li.children('input[type="checkbox"]').first().length
      ? li.children('input[type="checkbox"]').first()
      : li.children('p').first().children('input[type="checkbox"]').first();
    if (!box.length) return;
    const checked = box.is('[checked]');
    box.remove();
    const content = li.html().trim();
    li.attr('data-type', 'taskItem').attr('data-checked', String(checked));
    li.html(/^<p>/.test(content) ? content : `<p>${content}</p>`);
    li.parent('ul, ol').attr('data-type', 'taskList');
  });
  root.find('ol[data-type="taskList"]').each((_, el) => { el.tagName = 'ul'; });

  root.find('a[href]').each((_, el) => {
    const a = $(el);
    const href = a.attr('href');
    if (!href || href.startsWith('#') || /^(mailto|tel):/i.test(href)) return;
    const resolved = resolveLink(href);
    if (resolved) a.attr('href', resolved);
  });

  const imgs = root.find('img[src]').toArray();
  for (const el of imgs) {
    const img = $(el);
    const src = img.attr('src');
    if (!src || src.startsWith('data:') || src.startsWith('bimp://')) continue;
    try {
      const resolved = await resolveAsset(src);
      if (resolved) img.attr('src', resolved);
      else if (!/^https?:\/\//i.test(src)) warn(`Bild nicht gefunden: ${src}`);
    } catch (err) {
      warn(`Bild konnte nicht geladen werden: ${src} (${err.message})`);
    }
  }
  // links to files (non-pages) – e.g. "[Config](files/nginx.conf)"
  const fileLinks = root.find('a[href]').toArray().filter((el) => !String($(el).attr('href')).startsWith('bimp://'));
  for (const el of fileLinks) {
    const a = $(el);
    const href = a.attr('href');
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) continue;
    try {
      const resolved = await resolveAsset(href, { link: true });
      if (resolved) a.attr('href', resolved);
    } catch { /* keep */ }
  }
  return root.html();
}

/** Resolve a relative path against the directory of `fromPath` (both posix, no leading slash). */
export function resolveRelative(fromPath, target) {
  let t = String(target).split('#')[0].split('?')[0];
  try { t = decodeURIComponent(t); } catch { /* keep raw */ }
  if (!t) return null;
  if (t.startsWith('/')) return path.posix.normalize(t.slice(1));
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), t)).replace(/^(\.\.\/)+/, '');
}

/** Fetch helper for API importers (JSON or binary) with timeout and readable errors. */
export async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} von ${new URL(url).host}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

export async function fetchBinary(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const type = res.headers.get('content-type') || '';
  if (type.includes('text/html')) throw new Error('Antwort ist eine HTML-Seite (Anmeldung erforderlich?)');
  return { data: Buffer.from(await res.arrayBuffer()), mime: type.split(';')[0] || null };
}

export function normalizeBaseUrl(url) {
  let u;
  try {
    u = new URL(String(url || '').trim());
  } catch {
    throw new Error('Ungültige Adresse – bitte die vollständige URL inkl. https:// angeben');
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Nur http- und https-Adressen sind erlaubt');
  return u.toString().replace(/\/+$/, '');
}
