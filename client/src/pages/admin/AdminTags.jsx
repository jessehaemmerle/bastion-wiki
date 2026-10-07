import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { ColorPicker, Confirm, Modal, Spinner, TagPill } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { timeAgo } from '../../lib/format.js';
import { tr } from '../../lib/i18n.js';

export default function AdminTags() {
  const { toast } = useApp();
  const { data, loading, reload } = useFetch('/tags?all=true');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [q, setQ] = useState('');
  const save = async () => {
    try {
      const res = await api.patch(`/tags/${edit.id}`, { name: edit.name, color: edit.color });
      toast(res.merged ? tr('Tags zusammengeführt') : tr('Tag gespeichert'));
      setEdit(null);
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const tags = (data?.tags || []).filter((t) => t.name.includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Tags')}</h1><p>{tr('Umbenennen, einfärben oder zusammenführen. Wird ein Tag auf einen bestehenden Namen umbenannt, werden beide zusammengeführt.')}</p></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="input-icon" style={{ maxWidth: 320, width: '100%' }}><Icon name="search" /><input className="input sm" placeholder={tr('Filtern …')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="faint small">{tr('{n} Tags', { n: tags.length })}</span>
        </div>
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{tr('Tag')}</th><th>{tr('Seiten')}</th><th>{tr('Zuletzt verwendet')}</th><th /></tr></thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.id}>
                    <td><TagPill name={t.name} color={t.color} /></td>
                    <td className="mono small">{t.count}</td>
                    <td className="small faint">{t.last_used ? timeAgo(t.last_used) : '—'}</td>
                    <td className="actions">
                      <button className="btn ghost icon sm" onClick={() => setEdit({ ...t })} aria-label={tr('Bearbeiten')}><Icon name="edit" size={14} /></button>
                      <button className="btn ghost icon sm" onClick={() => setDel(t)} aria-label={tr('Löschen')}><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && (
        <Modal title={tr('Tag bearbeiten')} icon="tag" onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>{tr('Abbrechen')}</button><button className="btn primary" onClick={save}>{tr('Speichern')}</button></>}>
          <div className="field"><label>{tr('Name')}</label><input className="input mono" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div className="field"><label>{tr('Farbe')}</label><ColorPicker value={edit.color} onChange={(c) => setEdit({ ...edit, color: c })} /></div>
          <div className="row"><span className="faint small">{tr('Vorschau:')}</span> <TagPill name={edit.name || 'tag'} color={edit.color} link={false} /></div>
        </Modal>
      )}
      {del && <Confirm danger title={tr('Tag löschen?')} message={tr('#{name} wird von {n} Seiten entfernt.', { name: del.name, n: del.count })} confirmLabel={tr('Löschen')} onClose={() => setDel(null)}
        onConfirm={async () => { await api.del(`/tags/${del.id}`); toast(tr('Tag gelöscht')); reload(); }} />}
    </>
  );
}
