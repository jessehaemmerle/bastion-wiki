import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { PermissionsModal, SpaceFormModal } from '../../components/SpaceForms.jsx';
import { Spinner } from '../../components/ui.jsx';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { ACCESS_LABELS, timeAgo } from '../../lib/format.js';
import { tr } from '../../lib/i18n.js';

export default function AdminSpaces() {
  const { loadSpaces } = useApp();
  const { data, error, loading, reload } = useFetch('/admin/spaces');
  const [edit, setEdit] = useState(null);
  const [perms, setPerms] = useState(null);
  const done = () => { reload(); loadSpaces(); };
  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Bereiche & Berechtigungen')}</h1><p>{tr('Alle Bereiche – auch solche, in denen du selbst nicht Mitglied bist.')}</p></div>
        <button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" /> {tr('Bereich anlegen')}</button>
      </div>
      <div className="card">
        {loading ? <Spinner /> : error ? <div className="error-box" role="alert">{error.message}</div> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{tr('Bereich')}</th><th>{tr('Schlüssel')}</th><th>{tr('Standardzugriff')}</th><th>{tr('Explizite Rechte')}</th><th>{tr('Seiten')}</th><th>{tr('Aktivität')}</th><th /></tr></thead>
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
                      <button className="btn sm" onClick={() => setPerms(s)}><Icon name="shield" size={14} /> {tr('Rechte')}</button>{' '}
                      <button className="btn ghost icon sm" onClick={() => setEdit(s)} aria-label={tr('Bearbeiten')}><Icon name="edit" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card pad" style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>{tr('So funktionieren Berechtigungen')}</div>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>{tr('Der Standardzugriff gilt für jede angemeldete Person: kein Zugriff, Lesen oder Schreiben.')}</li>
          <li>{tr('Explizite Rechte für Personen oder Gruppen erweitern den Zugriff: Lesen, Schreiben oder Verwalten.')}</li>
          <li>{tr('Es gilt immer die höchste Stufe. Die Rolle „Betrachter“ ist global auf Lesen begrenzt, Administratoren haben immer Vollzugriff.')}</li>
          <li>{tr('„Verwalten“ erlaubt Bereichseinstellungen, Rechtevergabe und Löschen.')}</li>
        </ul>
      </div>
      {edit && <SpaceFormModal space={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={done} />}
      {perms && <PermissionsModal space={perms} onClose={() => { setPerms(null); reload(); }} />}
    </>
  );
}
