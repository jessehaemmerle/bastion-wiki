import { useEffect, useState } from 'react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { CODE_LANGUAGES } from '../../lib/highlight.js';
import { renderMermaid } from '../../lib/mermaid.js';
import { tr } from '../../lib/i18n.js';

/** Live preview below Mermaid code blocks (debounced) */
function MermaidPreview({ source }) {
  const [node, setNode] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!source.trim()) return;
      renderMermaid(source)
        .then((svg) => { if (!cancelled) { setNode(svg); setError(''); } })
        .catch((e) => { if (!cancelled) setError(String(e?.message || e).split('\n')[0]); });
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [source]);
  return (
    <div className="diagram-preview" contentEditable={false}>
      <div className="eyebrow">{tr('Vorschau')}</div>
      {error ? <div className="diagram-canvas error">{tr('Diagramm fehlerhaft')}: {error}</div>
        : <div className="diagram-canvas" ref={(el) => { if (el && node) el.replaceChildren(node.cloneNode(true)); }} />}
    </div>
  );
}

export default function CodeBlockView({ node, updateAttributes, editor }) {
  const lang = node.attrs.language || 'plaintext';
  return (
    <NodeViewWrapper className="code-wrap">
      <select
        className="code-lang-select"
        contentEditable={false}
        value={CODE_LANGUAGES.some(([l]) => l === lang) ? lang : 'plaintext'}
        disabled={!editor.isEditable}
        onChange={(e) => updateAttributes({ language: e.target.value })}
      >
        {CODE_LANGUAGES.map(([id, label]) => <option key={id} value={id}>{tr(label)}</option>)}
      </select>
      <pre>
        <NodeViewContent as="code" className={`language-${lang}`} />
      </pre>
      {lang === 'mermaid' && <MermaidPreview source={node.textContent} />}
    </NodeViewWrapper>
  );
}
