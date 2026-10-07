import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Confirm, Empty, Modal, Spinner } from '../../components/ui.jsx';
import { FIELD_TYPES } from '../../components/SheetFields.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { PAGE_TYPES } from '../../lib/format.js';
import { tr, trn } from '../../lib/i18n.js';

const newField = () => ({ id: Math.random().toString(36).slice(2, 10), label: '', type: 'text', required: false, options: [], expiry: false, leadDays: 30, hint: '' });

function SchemaModal({ schema, onClose, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState(schema
    ? { name: schema.name, description: schema.description, pageType: schema.pageType || '', fields: schema.fields.map((x) => ({ ...x, options: x.options || [] })) }
    : { name: '', description: '', pageType: '', fields: [newField()] });
  const setField = (i, patch) => setF((s) => ({ ...s, fields: s.fields.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const move = (i, d) => setF((s) => {
    const fields = [...s.fields];
    const [x] = fields.splice(i, 1);
    fields.splice(Math.max(0, Math.min(fields.length, i + d)), 0, x);
    return { ...s, fields };
  });
  const save = async () => {
    try {
      const body = { ...f, pageType: f.pageType || null, fields: f.fields.filter((x) => x.label.trim()) };
      if (schema) await api.put(`/admin/schemas/${schema.id}`, body);
      else await api.post('/admin/schemas', body);
      toast(tr('Schema gespeichert'));
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={schema ? tr('Schema bearbeiten') : tr('Neues Datenblatt-Schema')} icon="table" size="xl" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={!f.name.trim()} onClick={save}>{tr('Speichern')}</button></>}>
      <div className="form-grid">
        <div className="field"><label htmlFor="sc-name">{tr('Name')}</label><input id="sc-name" className="input" value={f.name} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tr('z. B. Zertifikat')} /></div>
        <div className="field">
          <label htmlFor="sc-type">{tr('Vorschlagen für Seitentyp')}</label>
          <select id="sc-type" className="select" value={f.pageType} onChange={(e) => setF({ ...f, pageType: e.target.value })}>
            <option value="">—</option>
            {Object.entries(PAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="field span-2"><label htmlFor="sc-desc">{tr('Beschreibung')}</label><input id="sc-desc" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      </div>
      <div className="section-title" style={{ marginTop: 18 }}><h3>{tr('Felder')}</h3></div>
      {schema && <p className="small faint" style={{ marginTop: 0 }}>{tr('Umbenannte Felder nehmen ihre Werte auf allen Seiten mit.')}</p>}
      <div className="schema-fields">
        {f.fields.map((x, i) => (
          <div key={x.id} className="schema-field">
            <div className="row" style={{ gap: 6 }}>
              <div className="col" style={{ gap: 2 }}>
                <button type="button" className="btn ghost icon sm" disabled={!i} onClick={() => move(i, -1)} aria-label={tr('Nach oben')}><Icon name="chevron-down" size={13} className="flip" /></button>
                <button type="button" className="btn ghost icon sm" disabled={i === f.fields.length - 1} onClick={() => move(i, 1)} aria-label={tr('Nach unten')}><Icon name="chevron-down" size={13} /></button>
              </div>
              <input className="input grow" value={x.label} placeholder={tr('Bezeichnung')} aria-label={tr('Bezeichnung')} onChange={(e) => setField(i, { label: e.target.value })} />
              <select className="select" style={{ width: 170 }} value={x.type} aria-label={tr('Typ')} onChange={(e) => setField(i, { type: e.target.value, expiry: e.target.value === 'date' ? x.expiry : false })}>
                {Object.keys(FIELD_TYPES).map((t) => <option key={t} value={t}>{FIELD_TYPES[t]}</option>)}
              </select>
              <label className="row small nowrap" style={{ gap: 5 }}><input type="checkbox" checked={x.required} onChange={(e) => setField(i, { required: e.target.checked })} /> {tr('Pflicht')}</label>
              <button type="button" className="btn ghost icon sm" onClick={() => setF((s) => ({ ...s, fields: s.fields.filter((_, j) => j !== i) }))} aria-label={tr('Feld entfernen')}><Icon name="x" size={14} /></button>
            </div>
            {x.type === 'select' && (
              <input className="input sm" value={x.options.join(', ')} placeholder={tr('Optionen, durch Komma getrennt')} aria-label={tr('Optionen')}
                onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })} />
            )}
            {x.type === 'date' && (
              <div className="row small wrap" style={{ gap: 10 }}>
                <label className="row" style={{ gap: 5 }}><input type="checkbox" checked={x.expiry} onChange={(e) => setField(i, { expiry: e.target.checked })} /> {tr('Ablauf überwachen (Fristen & Erinnerung)')}</label>
                {x.expiry && (
                  <label className="row" style={{ gap: 5 }}>{tr('erinnern')}
                    <input className="input sm mono" style={{ width: 70 }} type="number" min={0} max={365} value={x.leadDays} onChange={(e) => setField(i, { leadDays: Number(e.target.value) })} />
                    {tr('Tage vorher')}
                  </label>
                )}
              </div>
            )}
            <input className="input sm" value={x.hint} placeholder={tr('Hinweis für das Eingabefeld (optional)')} aria-label={tr('Hinweis')} onChange={(e) => setField(i, { hint: e.target.value })} />
          </div>
        ))}
      </div>
      <button type="button" className="btn sm" onClick={() => setF((s) => ({ ...s, fields: [...s.fields, newField()] }))}><Icon name="plus" size={14} /> {tr('Feld hinzufügen')}</button>
    </Modal>
  );
}

export default function Schemas() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useFetch('/schemas');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  if (loading && !data) return <Spinner center />;
  if (error) return <div className="error-box" role="alert">{error.message}</div>;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr('Datenblätter')}</h1>
          <p>{tr('Schemas geben dem Datenblatt einer Seite Felder mit Typ, Pflichtangaben und Ablaufdaten. Pro Seite wählbar und optional – Seiten ohne Schema behalten freie Felder.')}</p>
        </div>
        <button className="btn primary" onClick={() => setEdit('new')}><Icon name="plus" size={15} /> {tr('Neues Schema')}</button>
      </div>
      {!data.schemas.length ? <Empty icon="table" title={tr('Noch keine Schemas')} /> : (
        <div className="card table-wrap">
          <table className="data">
            <thead><tr><th>{tr('Name')}</th><th>{tr('Felder')}</th><th>{tr('Seitentyp')}</th><th>{tr('Seiten')}</th><th /></tr></thead>
            <tbody>
              {data.schemas.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><div className="tiny faint">{s.description}</div></td>
                  <td className="small">
                    {s.fields.map((f) => f.label + (f.required ? '*' : '')).join(', ')}
                    {s.fields.some((f) => f.expiry) && <span className="badge" style={{ marginLeft: 6 }}><Icon name="bell" size={11} /> {tr('Fristen')}</span>}
                  </td>
                  <td className="small">{s.pageType ? PAGE_TYPES[s.pageType]?.label : '—'}</td>
                  <td className="mono small">{s.pages}</td>
                  <td className="actions">
                    <button className="btn ghost icon sm" onClick={() => setEdit(s)} aria-label={tr('Bearbeiten')}><Icon name="pen" size={14} /></button>
                    <button className="btn ghost icon sm" onClick={() => setDel(s)} aria-label={tr('Löschen')}><Icon name="trash" size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <SchemaModal schema={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={reload} />}
      {del && (
        <Confirm danger title={tr('Schema löschen?')} confirmLabel={tr('Löschen')} onClose={() => setDel(null)}
          message={del.pages ? trn(del.pages, '1 Seite verwendet es. Ihre Werte bleiben als freie Felder erhalten.', '{n} Seiten verwenden es. Ihre Werte bleiben als freie Felder erhalten.') : tr('Keine Seite verwendet dieses Schema.')}
          onConfirm={async () => { try { await api.del(`/admin/schemas/${del.id}`); reload(); } catch (e) { toast(e.message, 'error'); } }} />
      )}
    </>
  );
}
