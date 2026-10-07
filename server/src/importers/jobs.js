/**
 * Import jobs: analyse (parse source → bundle + preview), then run (write bundle).
 * Bundles live in memory between analysis and run; job metadata is persisted in import_jobs.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { one, query } from '../db/index.js';
import { openZip } from './util.js';
import { importMarkdownZip } from './markdown.js';
import { importWikiJsApi, virtualZip } from './wikijs.js';
import { importConfluenceZip } from './confluence.js';
import { importBookStackApi, importBookStackZip } from './bookstack.js';
import { importMediaWikiXml } from './mediawiki.js';
import { importDokuWikiZip } from './dokuwiki.js';
import { writeBundle } from './writer.js';

export const SOURCES = {
  'wikijs-zip': { label: 'Wiki.js (Export / Git-Speicher)', kind: 'file' },
  'wikijs-api': { label: 'Wiki.js (GraphQL-API)', kind: 'api' },
  'confluence-zip': { label: 'Confluence (HTML-Export)', kind: 'file' },
  'bookstack-api': { label: 'BookStack (REST-API)', kind: 'api' },
  'bookstack-zip': { label: 'BookStack (Portable ZIP)', kind: 'file' },
  'notion-zip': { label: 'Notion (Markdown & CSV)', kind: 'file' },
  'markdown-zip': { label: 'Markdown / HTML (Obsidian, MkDocs, GitHub-Wiki …)', kind: 'file' },
  'mediawiki-xml': { label: 'MediaWiki (XML-Export)', kind: 'file' },
  'dokuwiki-zip': { label: 'DokuWiki (data-Ordner)', kind: 'file' },
};

const bundles = new Map(); // job id → bundle
const BUNDLE_TTL = 2 * 3600 * 1000;

const MAX_WARNINGS = 500;
const trimWarnings = (w) => (w.length > MAX_WARNINGS ? [...w.slice(0, MAX_WARNINGS), `… und ${w.length - MAX_WARNINGS} weitere Hinweise`] : w);

async function update(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE import_jobs SET ${sets} WHERE id=$1`, [id, ...keys.map((k) => (typeof fields[k] === 'object' && fields[k] !== null && !(fields[k] instanceof Date) ? JSON.stringify(fields[k]) : fields[k]))]);
}

function throttle(fn, ms = 700) {
  let last = 0;
  return (...a) => {
    const now = Date.now();
    if (now - last > ms) { last = now; fn(...a); }
  };
}

function buildPreview(bundle) {
  const byKey = new Map(bundle.pages.map((p) => [p.key, p]));
  const depth = (p) => {
    let d = 0;
    for (let cur = p; cur?.parentKey && byKey.has(cur.parentKey) && d < 20; cur = byKey.get(cur.parentKey)) d++;
    return d;
  };
  // tree order (parents before children) for display
  const children = new Map();
  const roots = [];
  for (const p of bundle.pages) {
    if (p.parentKey && byKey.has(p.parentKey)) (children.get(p.parentKey) || children.set(p.parentKey, []).get(p.parentKey)).push(p);
    else roots.push(p);
  }
  const tree = [];
  const walk = (list) => {
    for (const p of list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title, 'de'))) {
      if (tree.length >= 400) return;
      tree.push({ title: p.title, depth: depth(p), files: (p.extraFiles?.length || 0) + ((p.html || '').match(/bimp:\/\/file\//g) || []).length, empty: !p.html });
      walk(children.get(p.key) || []);
    }
  };
  walk(roots);
  let bytes = 0;
  for (const f of bundle.files.values()) bytes += f.data?.length || 0;
  const tags = new Set(bundle.pages.flatMap((p) => p.tags || []));
  return {
    pages: bundle.pages.length,
    files: bundle.files.size,
    bytes,
    tags: tags.size,
    groups: [...bundle.groups.entries()].map(([key, g]) => ({ key, name: g.name, pages: bundle.pages.filter((p) => p.group === key && !p.isGroupRoot).length })),
    flavor: bundle.flavor || null,
    tree,
    truncated: bundle.pages.length > tree.length,
  };
}

async function analyse(job, source, { filePath, extraPath, connection }) {
  const progress = throttle((done, total) => update(job.id, { progress: done, total }).catch(() => {}));
  switch (source) {
    case 'wikijs-zip': return importMarkdownZip(openZip(filePath), { flavor: 'wikijs' });
    case 'notion-zip': return importMarkdownZip(openZip(filePath), { flavor: 'notion' });
    case 'markdown-zip': return importMarkdownZip(openZip(filePath), { flavor: 'auto' });
    case 'confluence-zip': return importConfluenceZip(openZip(filePath));
    case 'bookstack-zip': return importBookStackZip(openZip(filePath));
    case 'dokuwiki-zip': return importDokuWikiZip(openZip(filePath));
    case 'wikijs-api': return importWikiJsApi(connection, progress);
    case 'bookstack-api': return importBookStackApi(connection, progress);
    case 'mediawiki-xml': {
      const buf = await fs.readFile(filePath);
      let xml;
      let imagesZip = null;
      if (buf.subarray(0, 2).toString() === 'PK') {
        // ZIP containing the XML dump and optionally the images folder
        const zip = openZip(filePath);
        const xmlPath = [...zip.entries.keys()].find((p) => /\.xml$/i.test(p));
        if (!xmlPath) throw new Error('Im ZIP wurde keine XML-Datei gefunden');
        xml = zip.text(xmlPath);
        const images = new Map([...zip.entries].filter(([p]) => !/\.xml$/i.test(p)));
        imagesZip = virtualZip(Object.fromEntries([...images.keys()].map((p) => [p, zip.read(p)])));
      } else {
        xml = buf.toString('utf8');
      }
      if (extraPath) imagesZip = openZip(extraPath);
      return importMediaWikiXml(xml, { imagesZip });
    }
    default:
      throw new Error('Unbekannte Importquelle');
  }
}

export async function startAnalysis({ source, userId, label, filePath, extraPath, connection }) {
  if (!SOURCES[source]) throw new Error('Unbekannte Importquelle');
  const id = crypto.randomUUID();
  const job = await one(
    `INSERT INTO import_jobs (id, source, label, created_by, options) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [id, source, label || SOURCES[source].label, userId, JSON.stringify(connection?.url ? { url: connection.url } : {})],
  );
  (async () => {
    try {
      const bundle = await analyse(job, source, { filePath, extraPath, connection });
      if (!bundle.pages.length) throw new Error('Die Quelle enthält keine importierbaren Seiten');
      bundles.set(id, bundle);
      setTimeout(() => {
        if (bundles.delete(id)) update(id, { status: 'discarded', error: 'Analyse abgelaufen – bitte erneut hochladen' }).catch(() => {});
      }, BUNDLE_TTL).unref();
      await update(id, { status: 'ready', preview: buildPreview(bundle), warnings: trimWarnings(bundle.warnings) });
    } catch (err) {
      console.error('[import] analysis failed', err);
      await update(id, { status: 'failed', error: err.message, finished_at: new Date() }).catch(() => {});
    } finally {
      for (const p of [filePath, extraPath]) if (p) fs.rm(p, { force: true }).catch(() => {});
    }
  })();
  return job;
}

export async function startRun(id, options, userId) {
  const bundle = bundles.get(id);
  if (!bundle) throw new Error('Für diesen Import liegen keine analysierten Daten mehr vor – bitte erneut hochladen');
  bundles.delete(id);
  await update(id, { status: 'running', progress: 0, total: bundle.pages.length * 2, options });
  (async () => {
    const warnings = [...bundle.warnings];
    try {
      const result = await writeBundle(bundle, options, {
        userId,
        warn: (m) => warnings.push(m),
        onProgress: throttle((done, total) => update(id, { progress: done, total }).catch(() => {})),
      });
      await update(id, { status: 'done', progress: bundle.pages.length * 2, result, warnings: trimWarnings(warnings), finished_at: new Date() });
    } catch (err) {
      console.error('[import] run failed', err);
      await update(id, { status: 'failed', error: err.message, warnings: trimWarnings(warnings), finished_at: new Date() }).catch(() => {});
    }
  })();
}

export function discard(id) {
  bundles.delete(id);
  return update(id, { status: 'discarded', finished_at: new Date() });
}

/** Jobs that were in flight when the server stopped can't be resumed */
export async function recoverJobs() {
  await query(`UPDATE import_jobs SET status='failed', error='Abgebrochen, weil der Server neu gestartet wurde', finished_at=now()
                WHERE status IN ('analyzing','ready','running')`);
}
