import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { hljs } from '../lib/highlight.js';
import { slugify } from '../lib/slug.js';
import { api } from '../lib/api.js';
import { tr } from '../lib/i18n.js';
import { renderMermaid } from '../lib/mermaid.js';

const PURIFY = {
  ADD_ATTR: ['data-type', 'data-variant', 'data-checked', 'data-language', 'data-secret-id', 'data-snippet-id', 'data-label', 'target', 'colwidth'],
  RETURN_DOM_FRAGMENT: true,
};

const SVG = {
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
};
const icon = (name, size = 13) => document.createRange().createContextualFragment(
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[name]}</svg>`,
);

function button(label, iconName, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.append(icon(iconName), document.createTextNode(label));
  b.addEventListener('click', onClick);
  return b;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

const VAR_RE = /\{\{\s*([\p{L}\p{N}_.-]{1,40})\s*\}\}/gu;

/** Replaces {{name}} placeholders; unknown/empty ones stay visible */
export function fillPlaceholders(text, vars) {
  return text.replace(VAR_RE, (m, name) => (vars?.[name] ? vars[name] : m));
}

/** hljs escapes the code; the result is sanitised once more before it reaches the DOM */
function highlight(code, text) {
  const lang = (code.className.match(/language-([\w+#-]+)/) || [])[1];
  try {
    const out = lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }) : hljs.highlightAuto(text);
    code.replaceChildren(DOMPurify.sanitize(out.value, { RETURN_DOM_FRAGMENT: true }));
    code.classList.add('hljs');
  } catch {
    code.textContent = text;
  }
}

/** Secret block: label + masked value, reveal and copy on demand (every reveal is audited server-side) */
function secretWidget(el, mode, values) {
  const id = el.dataset.secretId;
  const label = el.dataset.label || tr('Geheimnis');
  el.replaceChildren();
  el.classList.add('secret-block');
  const head = document.createElement('div');
  head.className = 'secret-head';
  const name = document.createElement('span');
  name.className = 'secret-label';
  name.append(icon('lock', 14), document.createTextNode(label));
  const value = document.createElement('code');
  value.className = 'secret-value';
  value.textContent = '••••••••••••';
  head.append(name, value);
  el.append(head);
  if (mode === 'values') {
    // printed handbook: value in clear text (already revealed and audited)
    if (values?.[id] != null) { value.textContent = values[id]; el.classList.add('revealed'); } else value.textContent = tr('(nicht freigegeben)');
    return;
  }
  if (mode === 'hidden' || !id) {
    const note = document.createElement('span');
    note.className = 'secret-note';
    note.textContent = tr('Nur angemeldet im Wiki einsehbar');
    head.append(note);
    return;
  }
  const tools = document.createElement('div');
  tools.className = 'secret-tools';
  let timer = null;
  let cached = null;
  const fetchValue = async () => {
    if (cached !== null) return cached;
    const { value: v } = await api.post(`/secrets/${id}/reveal`);
    cached = v;
    setTimeout(() => { cached = null; }, 30000);
    return v;
  };
  const fail = (e) => {
    value.textContent = e.status === 403 ? tr('Keine Berechtigung (Schreibrechte nötig)') : e.message;
    value.classList.add('error');
  };
  const show = button(tr('Anzeigen'), 'eye', async () => {
    if (el.classList.contains('revealed')) {
      el.classList.remove('revealed');
      value.textContent = '••••••••••••';
      show.lastChild.textContent = tr('Anzeigen');
      clearTimeout(timer);
      return;
    }
    try {
      value.textContent = await fetchValue();
      el.classList.add('revealed');
      show.lastChild.textContent = tr('Verbergen');
      clearTimeout(timer);
      timer = setTimeout(() => { if (el.classList.contains('revealed')) show.click(); }, 30000);
    } catch (e) { fail(e); }
  });
  const copy = button(tr('Kopieren'), 'copy', async () => {
    try {
      await copyText(await fetchValue());
      copy.classList.add('done');
      copy.lastChild.textContent = tr('Kopiert');
      setTimeout(() => { copy.classList.remove('done'); copy.lastChild.textContent = tr('Kopieren'); }, 1400);
    } catch (e) { fail(e); }
  });
  tools.append(show, copy);
  head.append(tools);
}

/**
 * Renders (already server-sanitized) page HTML, sanitizes it again client-side,
 * then enhances it: syntax highlighting, copy buttons, heading anchors, task toggles,
 * secret blocks, Mermaid diagrams and {{placeholders}} in code.
 */
export default function ContentView({ html, onHeadings, onToggleTask, onVariables, variables, secretMode = 'reveal', secretValues, snippets, className = '' }) {
  const ref = useRef(null);
  const toggleRef = useRef(onToggleTask);
  toggleRef.current = onToggleTask;
  const varsRef = useRef(variables);
  varsRef.current = variables;
  const onVarsRef = useRef(onVariables);
  onVarsRef.current = onVariables;

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let cancelled = false;
    root.replaceChildren(DOMPurify.sanitize(html || '', PURIFY));

    // snippets: references → current snippet content
    root.querySelectorAll('div[data-type="snippet"]').forEach((el) => {
      const sn = snippets?.[el.dataset.snippetId];
      const box = document.createElement('div');
      box.className = 'snippet-content';
      if (sn) {
        box.dataset.snippet = sn.name;
        box.title = tr('Baustein: {name}', { name: sn.name });
        box.append(DOMPurify.sanitize(sn.content, PURIFY));
      } else {
        box.classList.add('missing');
        box.textContent = tr('Baustein nicht gefunden (gelöscht?)');
      }
      el.replaceWith(box);
    });

    // headings → ids + anchors for the TOC
    const used = new Set();
    const headings = [];
    root.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
      let id = slugify(h.textContent) || 'abschnitt';
      while (used.has(id)) id += '-';
      used.add(id);
      h.id = id;
      const a = document.createElement('a');
      a.href = `#${id}`;
      a.className = 'anchor';
      a.textContent = '#';
      a.setAttribute('aria-hidden', 'true');
      h.prepend(a);
      headings.push({ id, text: h.textContent.replace(/^#/, ''), level: Number(h.tagName[1]) });
    });
    onHeadings?.(headings);

    // secrets
    root.querySelectorAll('div[data-type="secret"]').forEach((el) => secretWidget(el, secretMode, secretValues));

    // code blocks
    const varNames = new Set();
    root.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement;
      const lang = (code.className.match(/language-([\w+#-]+)/) || [])[1];
      const source = code.textContent;

      if (lang === 'mermaid') {
        const fig = document.createElement('figure');
        fig.className = 'diagram';
        fig.setAttribute('aria-label', tr('Diagramm'));
        const canvas = document.createElement('div');
        canvas.className = 'diagram-canvas';
        canvas.textContent = tr('Diagramm wird geladen …');
        const src = document.createElement('pre');
        src.className = 'diagram-source';
        src.hidden = true;
        src.textContent = source;
        const tools = document.createElement('div');
        tools.className = 'code-tools';
        tools.append(button(tr('Quelltext'), 'code', () => { src.hidden = !src.hidden; }));
        fig.append(canvas, src, tools);
        pre.replaceWith(fig);
        renderMermaid(source)
          .then((svg) => { if (!cancelled) canvas.replaceChildren(svg); })
          .catch((e) => {
            if (cancelled) return;
            canvas.textContent = `${tr('Diagramm fehlerhaft')}: ${String(e?.message || e).split('\n')[0]}`;
            canvas.classList.add('error');
            src.hidden = false;
          });
        return;
      }

      pre.dataset.language = lang || 'text';
      const names = [...source.matchAll(VAR_RE)].map((m) => m[1]);
      if (names.length) {
        code.dataset.template = source;
        names.forEach((n) => varNames.add(n));
        highlight(code, fillPlaceholders(source, varsRef.current));
      } else {
        highlight(code, source);
      }
      const tools = document.createElement('div');
      tools.className = 'code-tools';
      const copyBtn = button(tr('Kopieren'), 'copy', async () => {
        await copyText(code.textContent);
        copyBtn.classList.add('done');
        copyBtn.lastChild.textContent = tr('Kopiert');
        setTimeout(() => { copyBtn.classList.remove('done'); copyBtn.lastChild.textContent = tr('Kopieren'); }, 1400);
      });
      tools.append(copyBtn);
      pre.append(tools);
    });
    onVarsRef.current?.([...varNames]);

    // tables scroll horizontally on small screens
    root.querySelectorAll('table').forEach((t) => {
      if (t.parentElement?.classList.contains('table-scroll')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      t.replaceWith(wrap);
      wrap.append(t);
    });

    // task items
    root.querySelectorAll('ul[data-type="taskList"] > li').forEach((li, index) => {
      let input = li.querySelector(':scope > label input[type="checkbox"]');
      if (!input) {
        const label = document.createElement('label');
        input = document.createElement('input');
        input.type = 'checkbox';
        label.append(input);
        const div = document.createElement('div');
        while (li.firstChild) div.append(li.firstChild);
        li.append(label, div);
      }
      input.checked = li.dataset.checked === 'true';
      input.disabled = !toggleRef.current;
      input.addEventListener('change', () => {
        li.dataset.checked = String(input.checked);
        toggleRef.current?.(index, input.checked);
      });
    });
    return () => { cancelled = true; };
  }, [html, onHeadings, secretMode, secretValues, snippets]);

  // placeholder values changed → refill only the affected code blocks
  useEffect(() => {
    ref.current?.querySelectorAll('pre > code[data-template]').forEach((code) => {
      highlight(code, fillPlaceholders(code.dataset.template, variables));
    });
  }, [variables]);

  return <div ref={ref} className={`prose readonly ${className}`} />;
}
