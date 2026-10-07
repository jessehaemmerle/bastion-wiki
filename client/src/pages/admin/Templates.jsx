import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Editor from '../../components/editor/Editor.jsx';
import { PropertiesEditor, TagInput } from '../../components/PageFields.jsx';
import { Confirm, IconPicker, Modal, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { PAGE_TYPES } from '../../lib/format.js';
import { LANGUAGES, tr } from '../../lib/i18n.js';

function TemplateModal({ template, onClose, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState({
    name: template?.name || '', description: template?.description || '', icon: template?.icon || 'file-text',
    pageType: template?.pageType || 'doc', content: template?.content || '', properties: template?.properties || {}, tags: template?.tags || [],
    language: template ? template.language || '' : '', schemaId: template?.schemaId || '',
  });
  const [schemas, setSchemas] = useState([]);
  useEffect(() => { api.get('/schemas').then((d) => setSchemas(d.schemas)).catch(() => {}); }, []);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      // "" = all languages; the server stores that as NULL ('' violates the language check → 500)
      const body = { ...f, language: f.language || null, schemaId: f.schemaId ? Number(f.schemaId) : null };
      if (template) await api.put(`/templates/${template.id}`, body);
      else await api.post('/templates', body);
      toast(tr('Vorlage gespeichert'));
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={template ? tr('Vorlage: {name}', { name: template.name }) : tr('Neue Vorlage')} icon="layers" size="xl" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={!f.name} onClick={save}><Icon name="save" /> {tr('Speichern')}</button></>}>
      <div className="form-grid">
        <div className="field"><label>{tr('Name')}</label><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></div>
        <div className="field"><label>{tr('Seitentyp')}</label>
          <select className="select" value={f.pageType} onChange={(e) => set('pageType', e.target.value)}>
            {Object.entries(PAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>{tr('Sprache')}</label>
        <select className="select" value={f.language} onChange={(e) => set('language', e.target.value)}>
          <option value="">{tr('Alle Sprachen')}</option>
          {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <span className="hint">{tr('Die Vorlagenauswahl zeigt Vorlagen in der Sprache der Oberfläche und solche für alle Sprachen.')}</span>
      </div>
      <div className="field"><label>{tr('Beschreibung')}</label><input className="input" value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="field"><label>{tr('Symbol')}</label><IconPicker value={f.icon} onChange={(i) => set('icon', i)} /></div>
      <div className="field"><label>{tr('Standard-Tags')}</label><TagInput value={f.tags} onChange={(t) => set('tags', t)} /></div>
      <div className="field">
        <label htmlFor="tpl-schema">{tr('Datenblatt-Schema')}</label>
        <select id="tpl-schema" className="select" value={f.schemaId} onChange={(e) => set('schemaId', e.target.value)}>
          <option value="">{tr('Freie Felder (ohne Schema)')}</option>
          {schemas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <span className="hint">{tr('Neue Seiten aus dieser Vorlage verwenden das Schema – änderbar pro Seite.')}</span>
      </div>
      <div className="field"><label>{tr('Standard-Eigenschaften')}</label><PropertiesEditor value={f.properties} onChange={(p) => set('properties', p)} /></div>
      <div className="field"><label>{tr('Inhalt')}</label><Editor content={f.content} onChange={(html) => set('content', html)} /></div>
    </Modal>
  );
}

export default function Templates() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useFetch('/templates');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Vorlagen')}</h1><p>{tr('Vorlagen für einheitliche Dokumentation – Runbooks, Hosts, Incidents, Changes …')}</p></div>
        <button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" /> {tr('Vorlage anlegen')}</button>
      </div>
      {loading ? <Spinner /> : error ? <div className="error-box" role="alert">{error.message}</div> : (
        <div className="grid-3">
          {data.templates.map((t) => (
            <div key={t.id} className="card pad col" style={{ gap: 10 }}>
              <div className="row between">
                <Icon name={t.icon} size={18} />
                <div className="row" style={{ gap: 2 }}>
                  <button className="btn ghost icon sm" onClick={() => setEdit(t)} aria-label={tr('Bearbeiten')}><Icon name="edit" size={14} /></button>
                  <button className="btn ghost icon sm" onClick={() => setDel(t)} aria-label={tr('Löschen')}><Icon name="trash" size={14} /></button>
                </div>
              </div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{t.name}</h3>
              <div className="small muted grow">{t.description}</div>
              <div className="row wrap" style={{ gap: 4 }}>
                <span className="tape">{PAGE_TYPES[t.pageType]?.label || t.pageType}</span>
                {t.isBuiltin && <span className="badge">{tr('Standard')}</span>}
                <span className="badge">{t.language ? LANGUAGES.find((l) => l.id === t.language)?.name : tr('Alle Sprachen')}</span>
                {Object.keys(t.properties).length > 0 && <span className="badge">{tr('{n} Eigenschaften', { n: Object.keys(t.properties).length })}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <TemplateModal template={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={reload} />}
      {del && <Confirm danger title={tr('Vorlage löschen?')} message={tr('„{name}“ wird gelöscht. Bestehende Seiten bleiben unverändert.', { name: del.name })} confirmLabel={tr('Löschen')} onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.del(`/templates/${del.id}`); toast(tr('Vorlage gelöscht')); reload(); } catch (e) { toast(e.message, 'error'); } }} />}
    </>
  );
}
