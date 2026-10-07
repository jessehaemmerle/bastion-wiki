import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { SpaceFormModal } from '../components/SpaceForms.jsx';
import { Empty } from '../components/ui.jsx';
import { useApp } from '../lib/context.jsx';
import { useChrome } from '../lib/hooks.js';
import { ACCESS_LABELS, timeAgo } from '../lib/format.js';

export default function Spaces() {
  const { spaces, user, loadSpaces } = useApp();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  useChrome([{ label: 'Bereiche' }]);

  useEffect(() => {
    if (params.get('new')) {
      setCreating(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Bereiche</h1>
          <p>Jeder Bereich hat eigene Berechtigungen und einen eigenen Seitenbaum.</p>
        </div>
        {user.role !== 'viewer' && <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> Bereich anlegen</button>}
      </div>
      {spaces.length === 0 ? (
        <Empty icon="grid" title="Noch keine Bereiche">Ein Bereich bündelt Seiten eines Teams oder Themas, z. B. „Netzwerk“ oder „Runbooks“. Lege den ersten an, um loszulegen.</Empty>
      ) : (
        <table className="space-index">
          <tbody>
            {spaces.map((s) => (
              <tr key={s.id}>
                <td><span className="stripe" style={{ '--sc': s.color }} /></td>
                <td>
                  <Link to={`/s/${s.key}`}>{s.name}</Link>
                  <div className="small muted">{s.description || 'Ohne Beschreibung'}</div>
                </td>
                <td className="small muted nowrap">{s.pageCount} Seiten</td>
                <td className="small muted nowrap desktop-only">{s.updatedAt ? `geändert ${timeAgo(s.updatedAt)}` : 'leer'}</td>
                <td className="small muted nowrap desktop-only">{ACCESS_LABELS[s.access]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && <SpaceFormModal onClose={() => setCreating(false)} onSaved={(s) => { loadSpaces(); navigate(`/s/${s.key}`); }} />}
    </div>
  );
}
