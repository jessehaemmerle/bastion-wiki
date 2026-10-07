import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { ColorPicker, Confirm, Modal, Spinner, TagPill } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { timeAgo } from '../../lib/format.js';

export default function AdminTags() {
  const { toast } = useApp();
  const { data, loading, reload } = useFetch('/tags?all=true');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [q, setQ] = useState('');
  const save = async () => {
    try {
      const res = await api.patch(`/tags/${edit.id}`, { name: edit.name, color: edit.color });
      toast(res.merged ? 'Tags zusammengeführt' : 'Tag gespeichert');
      setEdit(null);
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const tags = (data?.tags || []).filter((t) => t.name.includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head">
        <div><h1>Tags</h1><p>Umbenennen, einfärben oder zusammenführen. Wird ein Tag auf einen bestehenden Namen umbenannt, werden beide zusammengeführt.</p></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="input-icon" style={{ maxWidth: 320, width: '100%' }}><Icon name="search" /><input className="input sm" placeholder="Filtern …" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span className="faint small">{tags.length} Tags</span>
        </div>
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Tag</th><th>Seiten</th><th>Zuletzt verwendet</th><th /></tr></thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.id}>
                    <td><TagPill name={t.name} color={t.color} /></td>
                    <td className="mono small">{t.count}</td>
                    <td className="small faint">{t.last_used ? timeAgo(t.last_used) : '—'}</td>
                    <td className="actions">
                      <button className="btn ghost icon sm" onClick={() => setEdit({ ...t })} aria-label="Bearbeiten"><Icon name="edit" size={14} /></button>
                      <button className="btn ghost icon sm" onClick={() => setDel(t)} aria-label="Löschen"><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && (
        <Modal title="Tag bearbeiten" icon="tag" onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Abbrechen</button><button className="btn primary" onClick={save}>Speichern</button></>}>
          <div className="field"><label>Name</label><input className="input mono" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div className="field"><label>Farbe</label><ColorPicker value={edit.color} onChange={(c) => setEdit({ ...edit, color: c })} /></div>
          <div className="row"><span className="faint small">Vorschau:</span> <TagPill name={edit.name || 'tag'} color={edit.color} link={false} /></div>
        </Modal>
      )}
      {del && <Confirm danger title="Tag löschen?" message={`#${del.name} wird von ${del.count} Seiten entfernt.`} confirmLabel="Löschen" onClose={() => setDel(null)}
        onConfirm={async () => { await api.del(`/tags/${del.id}`); toast('Tag gelöscht'); reload(); }} />}
    </>
  );
}
