import fs from 'node:fs/promises';
import path from 'node:path';
import TurndownService from 'turndown';
import YAML from 'yaml';
import { many } from '../db/index.js';
import { expandSnippets } from './snippets.js';

/** HTML → Markdown for page exports, Git sync and backups */
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
turndown.addRule('fencedLang', {
  filter: (node) => node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE',
  replacement: (_c, node) => {
    const code = node.firstChild;
    const lang = (code.getAttribute('class') || '').match(/language-([\w+#-]+)/)?.[1] || '';
    return `\n\n\`\`\`${lang}\n${code.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
  },
});
turndown.addRule('callout', {
  filter: (node) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'callout',
  replacement: (content, node) => `\n\n> **${(node.getAttribute('data-variant') || 'info').toUpperCase()}**\n${content.trim().split('\n').map((l) => `> ${l}`).join('\n')}\n\n`,
});

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Secret blocks are empty divs in the HTML – make them visible (but masked) in exports */
export const secretPlaceholdersHtml = (html) => String(html || '').replace(
  /<div([^>]*?)data-type="secret"([^>]*)><\/div>/g,
  (m, a, b) => {
    const label = (`${a}${b}`.match(/data-label="([^"]*)"/) || [])[1] || 'Secret';
    return `<p><strong>🔒 ${label}</strong> – ••••••••</p>`;
  },
);

export const htmlToMarkdown = (html) => turndown.turndown(secretPlaceholdersHtml(html));

/** Single page as Markdown with the data sheet as front matter */
export function pageMarkdown(page, meta = null) {
  const front = meta || (Object.keys(page.properties || {}).length ? page.properties : null);
  const fm = front ? `---\n${YAML.stringify(front).trim()}\n---\n\n` : '';
  return `${fm}# ${page.title}\n\n${htmlToMarkdown(page.content || '')}\n`;
}

const safeName = (s) => String(s || 'page').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'page';

/**
 * Writes all spaces as a folder tree:  <space-key>/<page>.md, children in <page>/…
 * baseUrl turns attachment and page links into absolute links (optional).
 */
export async function exportTree(dir, { baseUrl = '', skipRestricted = false } = {}) {
  const [spaces, pages, tags, restricted] = await Promise.all([
    many('SELECT id, key, name, description FROM spaces ORDER BY sort_order, name'),
    many(`SELECT p.*, u.display_name AS updated_by_name FROM pages p LEFT JOIN users u ON u.id=p.updated_by ORDER BY p.sort_order, p.title`),
    many('SELECT pt.page_id, t.name FROM page_tags pt JOIN tags t ON t.id=pt.tag_id ORDER BY t.name'),
    skipRestricted ? many('SELECT DISTINCT page_id FROM page_permissions') : [],
  ]);
  // restricted pages (and with them their subpages) stay out of exports that leave the server
  const hidden = new Set(restricted.map((r) => r.page_id));
  const tagsOf = new Map();
  for (const t of tags) (tagsOf.get(t.page_id) || tagsOf.set(t.page_id, []).get(t.page_id)).push(t.name);
  const children = new Map();
  for (const p of pages) {
    const k = `${p.space_id}:${p.parent_id ?? 0}`;
    (children.get(k) || children.set(k, []).get(k)).push(p);
  }
  const absolutize = (md) => (baseUrl ? md.replace(/\]\((\/(?:api\/attachments|p)\/[^)\s]+)\)/g, `](${baseUrl}$1)`) : md);
  let files = 0;
  for (const s of spaces) {
    const root = path.join(dir, safeName(s.key));
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, 'README.md'), `# ${s.name}\n\n${s.description || ''}\n`);
    const walk = async (parentId, folder) => {
      const used = new Set();
      for (const p of children.get(`${s.id}:${parentId}`) || []) {
        if (hidden.has(p.id)) continue;
        let name = safeName(p.slug);
        while (used.has(name)) name += '-';
        used.add(name);
        const meta = {
          title: p.title,
          id: p.id,
          type: p.page_type,
          ...(tagsOf.get(p.id) ? { tags: tagsOf.get(p.id) } : {}),
          ...(Object.keys(p.properties || {}).length ? { properties: p.properties } : {}),
          ...(p.review_due ? { review: p.review_due } : {}),
          updated: new Date(p.updated_at).toISOString(),
          ...(p.updated_by_name ? { author: p.updated_by_name } : {}),
          version: p.version,
        };
        await fs.writeFile(path.join(folder, `${name}.md`), absolutize(pageMarkdown({ ...p, content: await expandSnippets(p.content) }, meta)));
        files++;
        if (children.has(`${s.id}:${p.id}`)) {
          const sub = path.join(folder, name);
          await fs.mkdir(sub, { recursive: true });
          await walk(p.id, sub);
        }
      }
    };
    await walk(0, root);
  }
  return files;
}
