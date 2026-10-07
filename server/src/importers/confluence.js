/**
 * Confluence (Server/Data Center/Cloud) space export in HTML format:
 *   Space tools → Content tools → Export → HTML.
 * The ZIP contains index.html, one .html file per page, attachments/<pageId>/<file> and breadcrumbs per page.
 */
import path from 'node:path';
import * as cheerio from 'cheerio';
import { createBundle, fileRef, guessMime, normalizeHtml, pageRef, resolveRelative } from './util.js';

const BRUSH = {
  bash: 'bash', shell: 'bash', sh: 'bash', powershell: 'powershell', ps: 'powershell', sql: 'sql', xml: 'xml', html: 'xml',
  js: 'javascript', javascript: 'javascript', jscript: 'javascript', ts: 'typescript', py: 'python', python: 'python',
  yaml: 'yaml', yml: 'yaml', json: 'json', java: 'java', cpp: 'cpp', csharp: 'csharp', 'c#': 'csharp', php: 'php',
  ruby: 'ruby', perl: 'perl', go: 'go', css: 'css', diff: 'diff', text: 'plaintext', plain: 'plaintext', none: 'plaintext',
};
const PANEL = { information: 'info', info: 'info', note: 'warning', warning: 'danger', tip: 'success', success: 'success', error: 'danger' };

export async function importConfluenceZip(zip) {
  const bundle = createBundle('confluence');
  const warn = (m) => bundle.warnings.push(m);
  const htmlFiles = [...zip.entries.keys()].filter((p) => /\.html?$/i.test(p) && !p.includes('/'));
  const pagesFiles = htmlFiles.filter((p) => path.posix.basename(p).toLowerCase() !== 'index.html');
  if (!pagesFiles.length) throw new Error('Keine Confluence-Seiten gefunden. Bitte den HTML-Export eines Bereichs hochladen.');

  // space info from index.html
  const index = zip.text(htmlFiles.find((p) => path.posix.basename(p).toLowerCase() === 'index.html') || '');
  let spaceName = null;
  if (index) {
    const $i = cheerio.load(index);
    spaceName = $i('#title-text').text().trim().replace(/^Space Details:?\s*/i, '') || $i('title').text().trim() || null;
    const desc = $i('#main-content table.confluenceTable').first().text().replace(/\s+/g, ' ').trim();
    bundle.groups.set('space', { name: spaceName || 'Confluence', description: desc.slice(0, 500) });
  }

  // pass 1: titles, breadcrumbs
  const meta = new Map();
  for (const file of pagesFiles) {
    const $ = cheerio.load(zip.text(file));
    let title = $('#title-text').text().trim() || $('title').text().trim();
    title = title.replace(/^[^:]{1,80}\s:\s/, '').trim(); // "Space : Title"
    const crumbs = $('#breadcrumbs a').toArray().map((a) => $(a).attr('href')).filter(Boolean);
    const parentFile = crumbs.reverse().find((h) => h && !/index\.html?$/i.test(h) && h !== path.posix.basename(file));
    const pageId = (path.posix.basename(file).match(/_?(\d+)\.html?$/) || [])[1] || null;
    meta.set(file, { title: title || path.posix.basename(file, '.html'), parentFile: parentFile ? resolveRelative(file, parentFile) : null, pageId });
  }

  const pageKeyForHref = (from, href) => {
    const target = resolveRelative(from, href);
    if (target && meta.has(target)) return target;
    // Cloud links like /wiki/spaces/KEY/pages/12345/Title
    const id = String(href).match(/pages\/(\d+)/)?.[1] || String(href).match(/pageId=(\d+)/)?.[1];
    if (id) for (const [f, m] of meta) if (m.pageId === id) return f;
    return null;
  };

  // pass 2: content
  for (const [file, m] of meta) {
    const $ = cheerio.load(zip.text(file), { decodeEntities: false });
    const main = $('#main-content').length ? $('#main-content') : $('body');

    // code macros
    main.find('pre.syntaxhighlighter-pre, div.code pre, div.preformatted pre').each((_, el) => {
      const pre = $(el);
      const params = pre.attr('data-syntaxhighlighter-params') || '';
      const brush = (params.match(/brush:\s*([\w#+-]+)/) || [])[1]?.toLowerCase();
      const lang = BRUSH[brush] || 'plaintext';
      const code = $('<code>').addClass(`language-${lang}`).text(pre.text());
      pre.closest('div.code, div.preformatted').length
        ? pre.closest('div.code, div.preformatted').replaceWith($('<pre>').append(code))
        : pre.replaceWith($('<pre>').append(code));
    });
    // info / note / warning / tip panels
    main.find('.confluence-information-macro').each((_, el) => {
      const box = $(el);
      const type = (box.attr('class').match(/confluence-information-macro-(\w+)/) || [])[1];
      const title = box.find('.title').first().text().trim();
      const body = box.find('.confluence-information-macro-body').html() || box.html();
      box.replaceWith(`<div data-type="callout" data-variant="${PANEL[type] || 'info'}">${title ? `<p><strong>${title}</strong></p>` : ''}${body}</div>`);
    });
    main.find('.panel').each((_, el) => {
      const panel = $(el);
      const head = panel.find('.panelHeader').text().trim();
      const body = panel.find('.panelContent').html() || '';
      panel.replaceWith(`<div data-type="callout" data-variant="info">${head ? `<p><strong>${head}</strong></p>` : ''}${body}</div>`);
    });
    // expand macro
    main.find('.expand-container').each((_, el) => {
      const ex = $(el);
      ex.replaceWith(`<details><summary>${ex.find('.expand-control-text').text().trim() || 'Details'}</summary>${ex.find('.expand-content').html() || ''}</details>`);
    });
    // task lists
    main.find('ul.inline-task-list').each((_, el) => {
      const ul = $(el).attr('data-type', 'taskList').removeAttr('class');
      ul.children('li').each((__, li) => {
        const item = $(li);
        item.attr('data-type', 'taskItem').attr('data-checked', String(item.hasClass('checked')));
        item.html(`<p>${item.html()}</p>`);
      });
    });
    // status lozenges, user mentions, emoticons
    main.find('.status-macro').each((_, el) => $(el).replaceWith(`<strong>[${$(el).text().trim()}]</strong>`));
    main.find('img.emoticon').each((_, el) => $(el).replaceWith($(el).attr('alt') || ''));
    main.find('.confluence-embedded-file-wrapper').each((_, el) => { $(el).replaceWith($(el).html()); });
    main.find('.table-wrap').each((_, el) => { $(el).replaceWith($(el).html()); });
    // real file names: the "Attachments" section links attachments/<page>/<id>.ext with the original name as text
    const realNames = new Map();
    main.parent().find('a[href^="attachments/"]').each((_, el) => {
      const name = $(el).text().trim();
      if (name && /\.\w{1,8}$/.test(name)) realNames.set(resolveRelative(file, $(el).attr('href')), name);
    });
    $('a[href^="attachments/"]').each((_, el) => {
      const name = $(el).text().trim();
      if (name && /\.\w{1,8}$/.test(name)) realNames.set(resolveRelative(file, $(el).attr('href')), name);
    });
    const fileName = (p) => realNames.get(p) || path.posix.basename(p);
    // drop the "Attachments" section – files are attached anyway
    main.find('#attachments').closest('.pageSection').remove();
    main.find('.pageSection.group').filter((_, el) => /attachments|anhänge/i.test($(el).find('h2').text())).remove();

    const usedFiles = new Set();
    const html = await normalizeHtml(main.html(), {
      warn,
      resolveLink: (href) => {
        const k = pageKeyForHref(file, href);
        return k ? pageRef(k) : null;
      },
      resolveAsset: async (src) => {
        const p = resolveRelative(file, src);
        if (!p || !zip.has(p) || /^images\/icons\//.test(p)) return null;
        usedFiles.add(p);
        if (!bundle.files.has(p)) bundle.files.set(p, { name: fileName(p), mime: guessMime(fileName(p)), data: zip.read(p) });
        return fileRef(p);
      },
    });

    // every file in attachments/<pageId>/ belongs to this page, even if not linked inline
    const extraFiles = [];
    if (m.pageId) {
      const dir = `attachments/${m.pageId}/`;
      for (const p of zip.entries.keys()) {
        if (!p.startsWith(dir) || usedFiles.has(p)) continue;
        if (!bundle.files.has(p)) bundle.files.set(p, { name: fileName(p), mime: guessMime(fileName(p)), data: zip.read(p) });
        extraFiles.push(p);
      }
    }
    bundle.pages.push({
      key: file,
      parentKey: m.parentFile && meta.has(m.parentFile) ? m.parentFile : null,
      title: m.title.slice(0, 200),
      html,
      tags: [],
      properties: m.pageId ? { 'Confluence-ID': m.pageId } : {},
      group: 'space',
      extraFiles,
    });
  }
  return bundle;
}
