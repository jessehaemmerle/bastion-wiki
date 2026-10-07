import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import ContentView from '../ContentView.jsx';
import { Modal, Spinner } from '../ui.jsx';
import { api } from '../../lib/api.js';
import { timeAgo } from '../../lib/format.js';
import { tr } from '../../lib/i18n.js';

/**
 * Snippet reference. The page stores only <div data-type="snippet" data-snippet-id="7">;
 * the content is maintained under "Snippets" and shown wherever it is used.
 */
function SnippetView({ node, deleteNode, editor, selected }) {
  const { snippetId, label } = node.attrs;
  const [snippet, setSnippet] = useState(null);
  useEffect(() => {
    let off = false;
    api.get(`/snippets/${snippetId}`).then((d) => !off && setSnippet(d.snippet)).catch(() => !off && setSnippet(false));
    return () => { off = true; };
  }, [snippetId]);
  return (
    <NodeViewWrapper className={`snippet-block editing ${selected ? 'selected' : ''}`} data-drag-handle="">
      <div className="snippet-head" contentEditable={false}>
        <Icon name="layers" size={14} />
        <span className="grow">{tr('Baustein')}: <strong>{snippet?.name || label || `#${snippetId}`}</strong></span>
        {editor.isEditable && (
          <>
            <a className="btn ghost sm" href={`/snippets/${snippetId}`} target="_blank" rel="noreferrer"><Icon name="external-link" size={13} /> {tr('Baustein bearbeiten')}</a>
            <button type="button" className="btn ghost icon sm" onClick={() => deleteNode()} aria-label={tr('Block entfernen')}><Icon name="trash" size={13} /></button>
          </>
        )}
      </div>
      <div className="snippet-preview" contentEditable={false}>
        {snippet === null ? <Spinner /> : snippet === false ? <span className="faint small">{tr('Baustein nicht gefunden (gelöscht?)')}</span> : <ContentView html={snippet.content} />}
      </div>
    </NodeViewWrapper>
  );
}

export const Snippet = Node.create({
  name: 'snippet',
  group: 'block',
  atom: true,
  draggable: true,

  addStorage() {
    return { pick: null };
  },

  addAttributes() {
    return {
      snippetId: {
        default: null,
        parseHTML: (el) => Number(el.getAttribute('data-snippet-id')) || null,
        renderHTML: (a) => ({ 'data-snippet-id': a.snippetId }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') || '',
        renderHTML: (a) => ({ 'data-label': a.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="snippet"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'snippet' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SnippetView);
  },
});

export function SnippetPicker({ editor, onClose }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [active, setActive] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => api.get(`/snippets?q=${encodeURIComponent(q)}`).then((d) => setList(d.snippets)).catch(() => setList([])), 150);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!active) return;
    api.get(`/snippets/${active.id}`).then((d) => setActive((a) => (a?.id === d.snippet.id ? d.snippet : a))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  const insert = (s) => {
    editor.chain().focus().insertContent({ type: 'snippet', attrs: { snippetId: s.id, label: s.name } }).run();
    onClose();
  };
  return (
    <Modal title={tr('Baustein einfügen')} icon="layers" size="lg" onClose={onClose}
      footer={<><a className="btn ghost" href="/snippets" target="_blank" rel="noreferrer">{tr('Bausteine verwalten')}</a><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={!active} onClick={() => insert(active)}>{tr('Einfügen')}</button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>{tr('Ein Baustein wird an einer Stelle gepflegt – Änderungen erscheinen sofort auf allen Seiten, die ihn verwenden.')}</p>
      <div className="input-icon" style={{ marginBottom: 10 }}><Icon name="search" size={15} /><input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Baustein suchen …')} aria-label={tr('Baustein suchen')} /></div>
      <div className="snippet-pick">
        <div className="picker-list">
          {!list ? <Spinner /> : !list.length ? <div className="faint small" style={{ padding: 8 }}>{tr('Noch keine Bausteine.')}</div> : list.map((s) => (
            <button key={s.id} type="button" className={active?.id === s.id ? 'active' : ''} onClick={() => setActive(s)} onDoubleClick={() => insert(s)}>
              <Icon name="layers" size={15} />
              <span className="grow" style={{ minWidth: 0 }}><span className="ellipsis" style={{ display: 'block', fontWeight: 700 }}>{s.name}</span><span className="faint tiny">{s.description || timeAgo(s.updatedAt)}</span></span>
              <span className="faint tiny mono">{s.usage}×</span>
            </button>
          ))}
        </div>
        <div className="snippet-preview">{active?.content ? <ContentView html={active.content} /> : <span className="faint small">{tr('Vorschau')}</span>}</div>
      </div>
    </Modal>
  );
}
