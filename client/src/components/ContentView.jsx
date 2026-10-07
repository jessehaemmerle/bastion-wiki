import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { hljs } from '../lib/highlight.js';
import { slugify } from '../lib/slug.js';

const PURIFY = {
  ADD_ATTR: ['data-type', 'data-variant', 'data-checked', 'data-language', 'target', 'colwidth'],
  RETURN_DOM_FRAGMENT: true,
};

const ICON_COPY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function button(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.append(document.createRange().createContextualFragment(ICON_COPY), document.createTextNode(label));
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Renders (already server-sanitized) page HTML, sanitizes it again client-side,
 * then enhances it: syntax highlighting, copy buttons, heading anchors, task toggles.
 */
export default function ContentView({ html, onHeadings, onToggleTask, className = '' }) {
  const ref = useRef(null);
  const toggleRef = useRef(onToggleTask);
  toggleRef.current = onToggleTask;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.replaceChildren(DOMPurify.sanitize(html || '', PURIFY));

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

    // code blocks
    root.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement;
      const lang = (code.className.match(/language-([\w+#-]+)/) || [])[1];
      pre.dataset.language = lang || 'text';
      try {
        if (lang && hljs.getLanguage(lang)) code.innerHTML = hljs.highlight(code.textContent, { language: lang }).value;
        else hljs.highlightElement(code);
      } catch { /* ignore highlighting errors */ }
      const tools = document.createElement('div');
      tools.className = 'code-tools';
      const copyBtn = button('Kopieren', async () => {
        const text = code.textContent;
        try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
        copyBtn.classList.add('done');
        copyBtn.lastChild.textContent = 'Kopiert';
        setTimeout(() => { copyBtn.classList.remove('done'); copyBtn.lastChild.textContent = 'Kopieren'; }, 1400);
      });
      tools.append(copyBtn);
      pre.append(tools);
    });

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
  }, [html, onHeadings]);

  return <div ref={ref} className={`prose readonly ${className}`} />;
}
