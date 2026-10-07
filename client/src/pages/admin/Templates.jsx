import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Editor from '../../components/editor/Editor.jsx';
import { PropertiesEditor, TagInput } from '../../components/PageFields.jsx';
import { Confirm, IconPicker, Modal, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { PAGE_TYPES } from '../../lib/format.js';

function TemplateModal({ template, onClose, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState({
    name: template?.name || '', description: template?.description || '', icon: template?.icon || 'file-text',
    pageType: template?.pageType || 'doc', content: template?.content || '', properties: template?.properties || {}, tags: template?.tags || [],
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      if (template) await api.put(`/templates/${template.id}`, f);
      else await api.post('/templates', f);
      toast('Vorlage gespeichert');
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={template ? `Vorlage: ${template.name}` : 'Neue Vorlage'} icon="layers" size="xl" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={!f.name} onClick={save}><Icon name="save" /> Speichern</button></>}>
      <div className="form-grid">
        <div className="field"><label>Name</label><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></div>
        <div className="field"><label>Seitentyp</label>
          <select className="select" value={f.pageType} onChange={(e) => set('pageType', e.target.value)}>
            {Object.entries(PAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Beschreibung</label><input className="input" value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="field"><label>Symbol</label><IconPicker value={f.icon} onChange={(i) => set('icon', i)} /></div>
      <div className="field"><label>Standard-Tags</label><TagInput value={f.tags} onChange={(t) => set('tags', t)} /></div>
      <div className="field"><label>Standard-Eigenschaften</label><PropertiesEditor value={f.properties} onChange={(p) => set('properties', p)} /></div>
      <div className="field"><label>Inhalt</label><Editor content={f.content} onChange={(html) => set('content', html)} /></div>
    </Modal>
  );
}

export default function Templates() {
  const { toast } = useApp();
  const { data, loading, reload } = useFetch('/templates');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  return (
    <>
      <div className="page-head">
        <div><span className="eyebrow">Inhalte</span><h1>Vorlagen</h1><p>Vorlagen für einheitliche Dokumentation – Runbooks, Hosts, Incidents, Changes …</p></div>
        <button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" /> Vorlage anlegen</button>
      </div>
      {loading ? <Spinner /> : (
        <div className="grid-3">
          {data.templates.map((t) => (
            <div key={t.id} className="card pad col" style={{ gap: 10 }}>
              <div className="row between">
                <span className="space-chip" style={{ '--sc': 'var(--accent)' }}><Icon name={t.icon} size={16} /></span>
                <div className="row" style={{ gap: 2 }}>
                  <button className="btn ghost icon sm" onClick={() => setEdit(t)} aria-label="Bearbeiten"><Icon name="edit" size={14} /></button>
                  <button className="btn ghost icon sm" onClick={() => setDel(t)} aria-label="Löschen"><Icon name="trash" size={14} /></button>
                </div>
              </div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{t.name}</h3>
              <div className="small muted grow">{t.description}</div>
              <div className="row wrap" style={{ gap: 4 }}>
                <span className="badge mono">{PAGE_TYPES[t.pageType]?.label || t.pageType}</span>
                {t.isBuiltin && <span className="badge">mitgeliefert</span>}
                {Object.keys(t.properties).length > 0 && <span className="badge">{Object.keys(t.properties).length} Eigenschaften</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <TemplateModal template={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={reload} />}
      {del && <Confirm danger title="Vorlage löschen?" message={`„${del.name}“ wird gelöscht. Bestehende Seiten bleiben unverändert.`} confirmLabel="Löschen" onClose={() => setDel(null)}
        onConfirm={async () => { await api.del(`/templates/${del.id}`); toast('Vorlage gelöscht'); reload(); }} />}
    </>
  );
}
