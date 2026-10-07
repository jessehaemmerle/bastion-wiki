import DOMPurify from 'dompurify';

/**
 * Mermaid is large – it is only loaded when a page actually contains a diagram.
 * Rendering runs with securityLevel "strict" and the SVG is sanitised again before insertion.
 */
let loader = null;
let counter = 0;

async function load() {
  loader ??= import('mermaid').then((m) => m.default);
  return loader;
}

export async function renderMermaid(source) {
  const mermaid = await load();
  const dark = document.documentElement.dataset.mode === 'dark';
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'neutral',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif',
  });
  const id = `mmd-${Date.now().toString(36)}-${counter++}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ['style'],
      RETURN_DOM_FRAGMENT: true,
    });
  } finally {
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
  }
}
