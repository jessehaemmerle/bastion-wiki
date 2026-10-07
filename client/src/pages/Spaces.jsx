import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { SpaceFormModal } from '../components/SpaceForms.jsx';
import { Empty } from '../components/ui.jsx';
import { useApp } from '../lib/context.jsx';
import { useChrome } from '../lib/hooks.js';
import { ACCESS_LABELS, timeAgo } from '../lib/format.js';
import { tr, trn } from '../lib/i18n.js';

export default function Spaces() {
  const { spaces, user, loadSpaces } = useApp();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  useChrome([{ label: tr('Bereiche') }]);

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
          <h1>{tr('Bereiche')}</h1>
          <p>{tr('Jeder Bereich hat eigene Berechtigungen und einen eigenen Seitenbaum.')}</p>
        </div>
        {user.role !== 'viewer' && <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> {tr('Bereich anlegen')}</button>}
      </div>
      {spaces.length === 0 ? (
        <Empty icon="grid" title={tr('Noch keine Bereiche')}>{tr('Ein Bereich bündelt Seiten eines Teams oder Themas, z. B. „Netzwerk“ oder „Runbooks“. Lege den ersten an, um loszulegen.')}</Empty>
      ) : (
        <table className="space-index">
          <tbody>
            {spaces.map((s) => (
              <tr key={s.id}>
                <td><span className="stripe" style={{ '--sc': s.color }} /></td>
                <td>
                  <Link to={`/s/${s.key}`}>{s.name}</Link>
                  <div className="small muted">{s.description || tr('Ohne Beschreibung')}</div>
                </td>
                <td className="small muted nowrap">{trn(s.pageCount, '1 Seite', '{n} Seiten')}</td>
                <td className="small muted nowrap desktop-only">{s.updatedAt ? tr('geändert {when}', { when: timeAgo(s.updatedAt) }) : tr('leer')}</td>
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
