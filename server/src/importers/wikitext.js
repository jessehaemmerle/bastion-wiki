/**
 * Lightweight converters for MediaWiki wikitext and DokuWiki syntax to HTML.
 * They cover the constructs used in typical IT documentation (headings, lists, tables,
 * code, links, images, notes). Templates/plugins without an equivalent are dropped and reported.
 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function protect(text, store, re, render) {
  return text.replace(re, (...m) => {
    store.push(render(...m));
    return `\u0000${store.length - 1}\u0000`;
  });
}
const restore = (html, store) => {
  let out = html;
  for (let i = 0; i < 3 && /\u0000\d+\u0000/.test(out); i++) out = out.replace(/\u0000(\d+)\u0000/g, (_m, n) => store[Number(n)]);
  return out;
};
const codeBlock = (lang, code) => `<pre><code class="language-${esc((lang || 'plaintext').toLowerCase())}">${esc(String(code).replace(/^\n|\n$/g, ''))}</code></pre>`;

/** items: [{ depth (1-based), ordered, html }] → nested <ul>/<ol> */
function buildLists(items) {
  let out = '';
  const stack = [];
  for (const it of items) {
    const tag = it.ordered ? 'ol' : 'ul';
    while (stack.length > it.depth) out += `</li></${stack.pop()}>`;
    if (stack.length === it.depth && stack[stack.length - 1] !== tag) out += `</li></${stack.pop()}>`;
    if (stack.length === it.depth) {
      out += `</li><li>${it.html}`;
      continue;
    }
    while (stack.length < it.depth) {
      out += `<${tag}><li>`;
      stack.push(tag);
    }
    out += it.html;
  }
  while (stack.length) out += `</li></${stack.pop()}>`;
  return out;
}

function renderBlocks(lines, { heading, listItem, inline, tableRow, isTableLine, preLine, quoteLine, hr }) {
  const out = [];
  let para = [];
  let list = [];
  let table = [];
  let pre = [];
  let quote = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    if (list.length) out.push(buildLists(list));
    if (table.length) out.push(`<table><tbody>${table.join('')}</tbody></table>`);
    if (pre.length) out.push(codeBlock('plaintext', pre.join('\n')));
    if (quote.length) out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
    para = []; list = []; table = []; pre = []; quote = [];
  };
  for (const line of lines) {
    let m;
    if (/^\u0000\d+\u0000$/.test(line.trim())) { flush(); out.push(line.trim()); continue; }
    if ((m = heading(line))) { flush(); out.push(`<h${m.level}>${inline(m.text)}</h${m.level}>`); continue; }
    if (hr(line)) { flush(); out.push('<hr>'); continue; }
    if ((m = listItem(line))) {
      if (!list.length) flush();
      list.push({ depth: m.depth, ordered: m.ordered, html: inline(m.text) });
      continue;
    }
    if (isTableLine(line)) {
      if (!table.length) flush();
      const row = tableRow(line);
      if (row) table.push(row);
      continue;
    }
    if ((m = preLine(line)) != null) { if (!pre.length) flush(); pre.push(m); continue; }
    if ((m = quoteLine(line)) != null) { if (!quote.length) flush(); quote.push(m); continue; }
    if (!line.trim()) { flush(); continue; }
    if (list.length || table.length || pre.length || quote.length) flush();
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

// ------------------------------------------------------------------ MediaWiki
const MW_FILE_NS = /^(file|image|datei|bild|media):/i;
const MW_CAT_NS = /^(category|kategorie):/i;
const MW_ALLOWED_TAGS = /&lt;(\/?)(b|i|u|s|strike|del|ins|code|tt|kbd|sup|sub|small|big|br\s*\/?|mark)&gt;/gi;
const MW_IMG_OPTS = /^(thumb|thumbnail|frame|frameless|border|left|right|center|none|\d+(x\d+)?px|mini|miniatur|links|rechts|zentriert|upright.*|alt=.*)$/i;

export function mediawikiToHtml(src, { resolveLink, resolveFile, warn }) {
  const store = [];
  const tags = [];
  let text = String(src || '').replace(/\r\n/g, '\n');
  text = protect(text, store, /<(syntaxhighlight|source)(?:\s+lang="?([\w+#-]+)"?)?[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, lang, code) => codeBlock(lang, code));
  text = protect(text, store, /<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, code) => codeBlock('plaintext', code));
  text = protect(text, store, /<nowiki>([\s\S]*?)<\/nowiki>/gi, (_m, t) => esc(t));
  text = text.replace(/<!--[\s\S]*?-->/g, '').replace(/__[A-Z]+__/g, '');
  let templates = 0;
  for (let i = 0; i < 5 && /\{\{[^{}]*\}\}/.test(text); i++) text = text.replace(/\{\{[^{}]*\}\}/g, () => { templates++; return ''; });
  if (templates) warn(`${templates} Vorlage(n) {{…}} entfernt`);

  const inline = (t) => {
    let s = esc(t).replace(MW_ALLOWED_TAGS, '<$1$2>');
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, target, label) => {
      const tgt = target.trim();
      if (MW_CAT_NS.test(tgt)) { tags.push(tgt.replace(MW_CAT_NS, '')); return ''; }
      if (MW_FILE_NS.test(tgt)) {
        const name = tgt.replace(MW_FILE_NS, '');
        const caption = (label || '').split('|').filter((p) => !MW_IMG_OPTS.test(p.trim())).pop() || name;
        const ref = resolveFile(name);
        return ref ? `<img src="${ref}" alt="${caption}">` : `<em>[Datei: ${name}]</em>`;
      }
      const href = resolveLink(tgt.replace(/#.*$/, '')) || '#';
      return `<a href="${href}">${(label || tgt).trim()}</a>`;
    });
    s = s.replace(/\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]+))?\]/g, (_m, url, label) => `<a href="${url}">${label || url}</a>`);
    s = s.replace(/'''''(.+?)'''''/g, '<strong><em>$1</em></strong>').replace(/'''(.+?)'''/g, '<strong>$1</strong>').replace(/''(.+?)''/g, '<em>$1</em>');
    return s;
  };

  text = protect(text, store, /^\{\|[^\n]*\n([\s\S]*?)\n\|\}/gm, (_m, body) => {
    const rows = [];
    let cur = [];
    const cellContent = (c) => {
      const pipe = c.indexOf('|');
      return inline(pipe > 0 && /=/.test(c.slice(0, pipe)) && !c.slice(0, pipe).includes('[[') ? c.slice(pipe + 1).trim() : c);
    };
    for (const line of body.split('\n')) {
      if (line.startsWith('|+')) continue;
      if (line.startsWith('|-')) { if (cur.length) rows.push(cur); cur = []; continue; }
      if (line.startsWith('!')) for (const c of line.slice(1).split('!!')) cur.push(`<th><p>${cellContent(c.trim())}</p></th>`);
      else if (line.startsWith('|')) for (const c of line.slice(1).split('||')) cur.push(`<td><p>${cellContent(c.trim())}</p></td>`);
      else if (cur.length && line.trim()) cur[cur.length - 1] = cur[cur.length - 1].replace(/<\/p><\/t([dh])>$/, ` ${inline(line)}</p></t$1>`);
    }
    if (cur.length) rows.push(cur);
    return `<table><tbody>${rows.map((r) => `<tr>${r.join('')}</tr>`).join('')}</tbody></table>`;
  });

  const html = renderBlocks(text.split('\n'), {
    heading: (l) => { const m = l.match(/^(={1,6})\s*(.+?)\s*\1\s*$/); return m ? { level: Math.min(Math.max(m[1].length - 1, 1), 4), text: m[2] } : null; },
    hr: (l) => /^-{4,}\s*$/.test(l),
    listItem: (l) => { const m = l.match(/^([*#]+)\s*(.*)$/); return m ? { depth: m[1].length, ordered: m[1].endsWith('#'), text: m[2] } : null; },
    isTableLine: () => false,
    tableRow: () => null,
    preLine: (l) => (/^ \S/.test(l) ? l.slice(1) : null),
    quoteLine: (l) => (/^:+/.test(l) ? l.replace(/^:+\s*/, '') : null),
    inline,
  });
  return { html: restore(html, store), tags };
}

// ------------------------------------------------------------------ DokuWiki
const NOTE_VARIANT = { important: 'warning', warning: 'danger', tip: 'tip', classic: 'info' };

function dokuTableRow(line, inline) {
  const body = line.replace(/[|^]\s*$/, '');
  const cells = [...body.matchAll(/([|^])([^|^]*)/g)].map((m) => {
    const tag = m[1] === '^' ? 'th' : 'td';
    return `<${tag}><p>${inline(m[2].trim())}</p></${tag}>`;
  });
  return cells.length ? `<tr>${cells.join('')}</tr>` : null;
}

export function dokuwikiToHtml(src, { resolveLink, resolveFile, warn }) {
  const store = [];
  let text = String(src || '').replace(/\r\n/g, '\n');
  text = protect(text, store, /<(code|file)(?:\s+([\w+#-]+))?[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, lang, code) => codeBlock(lang === '-' ? 'plaintext' : lang, code));
  text = protect(text, store, /<nowiki>([\s\S]*?)<\/nowiki>|%%([\s\S]*?)%%/gi, (_m, a, b) => esc(a ?? b));
  text = text.replace(/~~[A-Z]+~~/g, '');

  const inline = (t) => {
    let s = esc(t);
    s = s.replace(/\{\{\s*([^}|?]+?)(?:\?[^}|]*)?\s*(?:\|([^}]*))?\}\}/g, (_m, id, alt) => {
      const ref = resolveFile(id.trim());
      if (!ref) return `<em>[Datei: ${id.trim()}]</em>`;
      return /\.(png|jpe?g|gif|webp|svg)$/i.test(id) ? `<img src="${ref}" alt="${(alt || id).trim()}">` : `<a href="${ref}">${(alt || id).trim()}</a>`;
    });
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, target, label) => {
      const tgt = target.trim();
      if (/^https?:\/\//i.test(tgt)) return `<a href="${tgt}">${label || tgt}</a>`;
      const href = resolveLink(tgt.replace(/#.*$/, '')) || '#';
      return `<a href="${href}">${(label || tgt.split(':').pop()).trim()}</a>`;
    });
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^:])\/\/(.+?)\/\//g, '$1<em>$2</em>')
      .replace(/__(.+?)__/g, '<u>$1</u>')
      .replace(/''(.+?)''/g, '<code>$1</code>')
      .replace(/&lt;del&gt;(.+?)&lt;\/del&gt;/g, '<s>$1</s>')
      .replace(/\\\\(\s|$)/g, '<br>');
  };

  text = protect(text, store, /<note(?:\s+(\w+))?>([\s\S]*?)<\/note>/gi, (_m, type, body) =>
    `<div data-type="callout" data-variant="${NOTE_VARIANT[(type || 'classic').toLowerCase()] || 'info'}"><p>${inline(body.trim())}</p></div>`);
  if (/<WRAP/i.test(text)) {
    warn('WRAP-Container wurden in normale Absätze umgewandelt');
    text = text.replace(/<\/?WRAP[^>]*>/gi, '');
  }

  const html = renderBlocks(text.split('\n'), {
    heading: (l) => { const m = l.match(/^\s*(={2,6})\s*(.+?)\s*={2,6}\s*$/); return m ? { level: Math.min(Math.max(7 - m[1].length, 1), 4), text: m[2] } : null; },
    hr: (l) => /^-{4,}\s*$/.test(l),
    listItem: (l) => { const m = l.match(/^( {2,}|\t+)([*-])\s+(.*)$/); return m ? { depth: Math.max(1, Math.floor(m[1].replace(/\t/g, '  ').length / 2)), ordered: m[2] === '-', text: m[3] } : null; },
    isTableLine: (l) => /^[|^]/.test(l),
    tableRow: (l) => dokuTableRow(l, inline),
    preLine: (l) => (/^( {2,}|\t)(?![*-]\s)\S/.test(l) ? l.replace(/^( {2}|\t)/, '') : null),
    quoteLine: (l) => (/^>+/.test(l) ? l.replace(/^>+\s*/, '') : null),
    inline,
  });
  return restore(html, store);
}
