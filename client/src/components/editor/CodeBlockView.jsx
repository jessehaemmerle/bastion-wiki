import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { CODE_LANGUAGES } from '../../lib/highlight.js';

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
        {CODE_LANGUAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <pre>
        <NodeViewContent as="code" className={`language-${lang}`} />
      </pre>
    </NodeViewWrapper>
  );
}
