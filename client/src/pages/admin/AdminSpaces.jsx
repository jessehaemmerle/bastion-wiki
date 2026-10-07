import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { PermissionsModal, SpaceFormModal } from '../../components/SpaceForms.jsx';
import { Spinner } from '../../components/ui.jsx';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { ACCESS_LABELS, timeAgo } from '../../lib/format.js';

export default function AdminSpaces() {
  const { loadSpaces } = useApp();
  const { data, loading, reload } = useFetch('/admin/spaces');
  const [edit, setEdit] = useState(null);
  const [perms, setPerms] = useState(null);
  const done = () => { reload(); loadSpaces(); };
  return (
    <>
      <div className="page-head">
        <div><h1>Bereiche & Berechtigungen</h1><p>Alle Bereiche – auch solche, in denen du selbst nicht Mitglied bist.</p></div>
        <button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" /> Bereich anlegen</button>
      </div>
      <div className="card">
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Bereich</th><th>Schlüssel</th><th>Standardzugriff</th><th>Explizite Rechte</th><th>Seiten</th><th>Aktivität</th><th /></tr></thead>
              <tbody>
                {data.spaces.map((s) => (
                  <tr key={s.id}>
                    <td><div className="row"><span className="space-chip" style={{ '--sc': s.color, width: 28, height: 28 }}><Icon name={s.icon} size={14} /></span><Link to={`/s/${s.key}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{s.name}</Link></div></td>
                    <td className="mono small">{s.key}</td>
                    <td><span className={`badge ${s.defaultAccess === 'none' ? 'warning' : ''}`}><Icon name={s.defaultAccess === 'none' ? 'lock' : s.defaultAccess === 'read' ? 'eye' : 'pen'} size={12} /> {ACCESS_LABELS[s.defaultAccess]}</span></td>
                    <td className="mono small">{s.grants}</td>
                    <td className="mono small">{s.pageCount}</td>
                    <td className="small faint">{s.updatedAt ? timeAgo(s.updatedAt) : '—'}</td>
                    <td className="actions">
                      <button className="btn sm" onClick={() => setPerms(s)}><Icon name="shield" size={14} /> Rechte</button>{' '}
                      <button className="btn ghost icon sm" onClick={() => setEdit(s)} aria-label="Bearbeiten"><Icon name="edit" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card pad" style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>So funktionieren Berechtigungen</div>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li><strong>Standardzugriff</strong> gilt für jede angemeldete Person (Kein Zugriff / Lesen / Schreiben).</li>
          <li><strong>Explizite Rechte</strong> für Personen oder Gruppen erweitern den Zugriff: Lesen, Schreiben oder Verwalten.</li>
          <li>Es gilt immer die <strong>höchste</strong> Stufe. Rolle <em>Betrachter</em> ist global auf Lesen begrenzt, <em>Administratoren</em> haben immer Vollzugriff.</li>
          <li>„Verwalten“ erlaubt Bereichseinstellungen, Rechtevergabe und Löschen.</li>
        </ul>
      </div>
      {edit && <SpaceFormModal space={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={done} />}
      {perms && <PermissionsModal space={perms} onClose={() => { setPerms(null); reload(); }} />}
    </>
  );
}
