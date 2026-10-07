/**
 * DokuWiki: ZIP of the data directory (or of data/pages + data/media).
 * Namespaces become the page hierarchy; ns:start is used as the namespace page.
 */
import path from 'node:path';
import { createBundle, fileRef, guessMime, humanize, normalizeHtml, pageRef } from './util.js';
import { dokuwikiToHtml } from './wikitext.js';

const cleanId = (id) => String(id).trim().toLowerCase().replace(/^:+/, '').replace(/[\s/]+/g, '_').replace(/:+/g, ':');

export async function importDokuWikiZip(zip) {
  const all = [...zip.entries.keys()];
  const pagesRoot = all.find((p) => /(^|\/)pages\/.+\.txt$/.test(p))?.replace(/(^|\/)pages\/.*$/, '$1pages/') ?? '';
  const mediaRoot = pagesRoot.replace(/pages\/$/, 'media/');
  const pageFiles = all.filter((p) => p.startsWith(pagesRoot) && p.endsWith('.txt'));
  if (!pageFiles.length) throw new Error('Keine DokuWiki-Seiten (*.txt im Ordner pages/) gefunden');
  const bundle = createBundle('dokuwiki');
  const warn = (m) => bundle.warnings.push(m);

  const ids = new Map(); // id "ns:page" → zip path
  for (const p of pageFiles) ids.set(p.slice(pagesRoot.length, -4).split('/').join(':'), p);

  // namespace page: ns:start, ns:ns or ns (file next to folder)
  const nsPage = (ns) => [`${ns}:start`, `${ns}:${ns.split(':').pop()}`, ns].find((id) => ids.has(id)) || null;
  const keyFor = (id) => {
    const nsHome = nsPage(id);
    return nsHome || (ids.has(id) ? id : null);
  };
  const folderKeys = new Set();
  const parentOf = (id) => {
    const parts = id.split(':');
    const isHome = parts.length > 1 && (parts[parts.length - 1] === 'start' || parts[parts.length - 1] === parts[parts.length - 2]);
    const ns = parts.slice(0, isHome ? -2 : -1).join(':');
    if (!ns) return null;
    const home = nsPage(ns);
    if (home && home !== id) return home;
    folderKeys.add(`ns:${ns}`);
    return `ns:${ns}`;
  };

  const resolveLink = (from, target) => {
    let id = cleanId(target);
    if (id.startsWith('.')) id = [...from.split(':').slice(0, -1), id.replace(/^\.:?/, '')].filter(Boolean).join(':');
    else if (!target.includes(':')) {
      const local = [...from.split(':').slice(0, -1), id].join(':');
      if (ids.has(local) || nsPage(local)) id = local;
    }
    const k = keyFor(id);
    return k ? pageRef(k) : null;
  };
  const resolveFile = (from, target) => {
    let id = cleanId(target);
    if (!target.includes(':')) id = [...from.split(':').slice(0, -1), id].join(':');
    const p = `${mediaRoot}${id.split(':').join('/')}`;
    if (!zip.has(p)) return null;
    if (!bundle.files.has(p)) bundle.files.set(p, { name: path.posix.basename(p), mime: guessMime(p), data: zip.read(p) });
    return fileRef(p);
  };

  for (const [id, file] of ids) {
    const raw = zip.text(file);
    const h = raw.match(/^\s*(={2,6})\s*(.+?)\s*\1\s*$/m);
    const title = h ? h[2] : humanize(id.split(':').pop() === 'start' ? id.split(':').slice(-2, -1)[0] || 'Start' : id.split(':').pop());
    const body = h && raw.trimStart().startsWith(h[0].trim()) ? raw.replace(h[0], '') : raw;
    const html = dokuwikiToHtml(body, { warn, resolveLink: (t) => resolveLink(id, t), resolveFile: (t) => resolveFile(id, t) });
    bundle.pages.push({ key: id, parentKey: parentOf(id), title: title.slice(0, 200), html: await normalizeHtml(html, { warn }), tags: [], properties: {} });
  }
  for (const k of folderKeys) {
    const ns = k.slice(3);
    const parentNs = ns.split(':').slice(0, -1).join(':');
    const parent = parentNs ? nsPage(parentNs) || `ns:${parentNs}` : null;
    if (parent && parent.startsWith('ns:')) folderKeys.add(parent);
    bundle.pages.push({ key: k, parentKey: parent, title: humanize(ns.split(':').pop()), html: '', tags: [], properties: {} });
  }
  return bundle;
}
