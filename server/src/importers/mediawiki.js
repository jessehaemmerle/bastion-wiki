/**
 * MediaWiki XML dump (Special:Export or dumpBackup.php). Uploaded files are not part of the XML;
 * an optional ZIP with the "images" directory can be supplied to import them as well.
 */
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { createBundle, fileRef, guessMime, normalizeHtml, pageRef, parseDate } from './util.js';
import { mediawikiToHtml } from './wikitext.js';

const normTitle = (t) => String(t).replace(/_/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());

export async function importMediaWikiXml(xml, { imagesZip = null, namespaces = [0] } = {}) {
  const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => ['page', 'revision', 'namespace'].includes(name) });
  let doc;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    throw new Error(`XML konnte nicht gelesen werden: ${err.message}`);
  }
  const pages = doc?.mediawiki?.page;
  if (!pages?.length) throw new Error('Keine Seiten im MediaWiki-Export gefunden');
  const bundle = createBundle('mediawiki');
  const warn = (m) => bundle.warnings.push(m);
  const siteName = doc.mediawiki.siteinfo?.sitename;
  if (siteName) bundle.groups.set('wiki', { name: String(siteName), description: '' });

  const images = new Map(); // normalized file name → zip path
  if (imagesZip) for (const p of imagesZip.entries.keys()) images.set(normTitle(path.posix.basename(p)), p);

  const items = [];
  let skipped = 0;
  for (const p of pages) {
    if (!namespaces.includes(Number(p.ns))) { skipped++; continue; }
    if (p.redirect !== undefined) { skipped++; continue; }
    const rev = p.revision[p.revision.length - 1];
    const text = typeof rev.text === 'object' ? rev.text['#text'] ?? '' : rev.text ?? '';
    if (/^#(redirect|weiterleitung)/i.test(String(text).trim())) { skipped++; continue; }
    items.push({ title: normTitle(p.title), text: String(text), timestamp: rev.timestamp, author: rev.contributor?.username });
  }
  if (skipped) warn(`${skipped} Weiterleitungen bzw. Seiten aus anderen Namensräumen übersprungen`);
  const titles = new Set(items.map((i) => i.title));
  const missingFiles = new Set();

  for (const it of items) {
    const { html, tags } = mediawikiToHtml(it.text, {
      warn,
      resolveLink: (t) => (titles.has(normTitle(t)) ? pageRef(normTitle(t)) : null),
      resolveFile: (name) => {
        const p = images.get(normTitle(name));
        if (!p) { missingFiles.add(name); return null; }
        if (!bundle.files.has(p)) bundle.files.set(p, { name: path.posix.basename(p), mime: guessMime(p), data: imagesZip.read(p) });
        return fileRef(p);
      },
    });
    // sub pages "Server/Linux" → parent "Server"
    const slash = it.title.lastIndexOf('/');
    const parent = slash > 0 && titles.has(it.title.slice(0, slash)) ? it.title.slice(0, slash) : null;
    bundle.pages.push({
      key: it.title,
      parentKey: parent,
      title: (parent ? it.title.slice(slash + 1) : it.title).slice(0, 200),
      html: await normalizeHtml(html, { warn }),
      tags,
      properties: it.author ? { 'Letzte Änderung (MediaWiki)': it.author } : {},
      createdAt: parseDate(it.timestamp),
      updatedAt: parseDate(it.timestamp),
      group: siteName ? 'wiki' : null,
    });
  }
  if (missingFiles.size) warn(`${missingFiles.size} eingebundene Dateien nicht gefunden (ZIP mit dem images-Ordner zusätzlich hochladen)`);
  return bundle;
}
