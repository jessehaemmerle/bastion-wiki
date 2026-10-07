import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useState } from 'react';
import Icon from '../Icon.jsx';
import { Modal } from '../ui.jsx';
import { api } from '../../lib/api.js';
import { tr } from '../../lib/i18n.js';

/**
 * Secret block. The page HTML only stores a reference (data-secret-id) and a label;
 * the value is encrypted on the server and never part of the page content.
 */
function SecretView({ node, editor, deleteNode, selected }) {
  const { secretId, label } = node.attrs;
  const [shown, setShown] = useState(null);
  const reveal = async () => {
    if (shown !== null) { setShown(null); return; }
    try {
      const { value } = await api.post(`/secrets/${secretId}/reveal`);
      setShown(value);
      setTimeout(() => setShown(null), 30000);
    } catch (e) { setShown(`⚠ ${e.message}`); }
  };
  return (
    <NodeViewWrapper className={`secret-block editing ${selected ? 'selected' : ''}`} data-drag-handle="">
      <div className="secret-head" contentEditable={false}>
        <span className="secret-label"><Icon name="lock" size={14} /> {label || tr('Geheimnis')}</span>
        <code className="secret-value">{shown ?? '••••••••••••'}</code>
        {editor.isEditable && (
          <div className="secret-tools">
            <button type="button" onClick={reveal}><Icon name={shown !== null ? 'eye-off' : 'eye'} size={13} /> {shown !== null ? tr('Verbergen') : tr('Anzeigen')}</button>
            <button type="button" onClick={() => editor.storage.secret.open?.({ mode: 'edit', id: secretId, label })}><Icon name="pen" size={13} /> {tr('Ändern')}</button>
            <button type="button" onClick={() => deleteNode()} aria-label={tr('Block entfernen')}><Icon name="trash" size={13} /></button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const Secret = Node.create({
  name: 'secret',
  group: 'block',
  atom: true,
  draggable: true,

  addStorage() {
    return { open: null };
  },

  addAttributes() {
    return {
      secretId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-secret-id'),
        renderHTML: (a) => ({ 'data-secret-id': a.secretId }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') || '',
        renderHTML: (a) => ({ 'data-label': a.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="secret"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'secret' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SecretView);
  },

  addCommands() {
    return {
      insertSecret: (attrs) => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
      updateSecretLabel: (secretId, label) => ({ tr: t, state, dispatch }) => {
        state.doc.descendants((n, pos) => {
          if (n.type.name === this.name && n.attrs.secretId === secretId) t.setNodeMarkup(pos, undefined, { ...n.attrs, label });
        });
        if (dispatch) dispatch(t);
        return true;
      },
    };
  },
});

/** Create / change a secret. mode "new" inserts a block, "edit" updates value and label. */
export function SecretModal({ state, context, editor, onClose }) {
  const [label, setLabel] = useState(state.label || '');
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isNew = state.mode === 'new';
  const generate = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.!';
    const buf = crypto.getRandomValues(new Uint32Array(24));
    setValue([...buf].map((n) => chars[n % chars.length]).join(''));
    setShow(true);
  };
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isNew) {
        if (!context?.spaceId) throw new Error(tr('Bitte zuerst einen Bereich wählen'));
        const { secret } = await api.post('/secrets', { spaceId: context.spaceId, pageId: context.pageId || null, label, value });
        editor.chain().focus().insertSecret({ secretId: secret.id, label }).run();
      } else {
        await api.put(`/secrets/${state.id}`, { label, ...(value ? { value } : {}) });
        editor.commands.updateSecretLabel(state.id, label);
      }
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={isNew ? tr('Geheimnis einfügen') : tr('Geheimnis ändern')} icon="lock" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={busy || (isNew && !value)} onClick={save}>{tr('Speichern')}</button></>}>
      <form className="col" style={{ gap: 14 }} onSubmit={save}>
        <p className="muted small" style={{ margin: 0 }}>{tr('Der Wert wird verschlüsselt gespeichert und ist nicht Teil des Seiteninhalts, der Suche, der Exporte oder des Versionsverlaufs. Anzeigen können ihn nur Personen mit Schreibrechten im Bereich; jedes Anzeigen wird protokolliert.')}</p>
        {error && <div className="error-box">{error}</div>}
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="sec-label">{tr('Bezeichnung')}</label>
          <input id="sec-label" className="input" value={label} maxLength={120} autoFocus onChange={(e) => setLabel(e.target.value)} placeholder={tr('z. B. root-Passwort, iDRAC, SNMP-Community')} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="sec-value">{isNew ? tr('Wert') : tr('Neuer Wert (leer lassen, um ihn zu behalten)')}</label>
          <div className="row" style={{ gap: 6 }}>
            <input id="sec-value" className="input mono grow" type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />
            <button type="button" className="btn icon" onClick={() => setShow((s) => !s)} aria-label={show ? tr('Verbergen') : tr('Anzeigen')}><Icon name={show ? 'eye-off' : 'eye'} size={15} /></button>
            <button type="button" className="btn" onClick={generate} title={tr('Zufälliges Passwort (24 Zeichen)')}><Icon name="refresh" size={15} /> {tr('Erzeugen')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
