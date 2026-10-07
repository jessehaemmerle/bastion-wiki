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
          <span className="eyebrow">Übersicht</span>
          <h1>Bereiche</h1>
          <p>Bereiche trennen Wissen nach Team, System oder Thema – jeder mit eigenen Berechtigungen.</p>
        </div>
        {user.role !== 'viewer' && <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> Neuer Bereich</button>}
      </div>
      {spaces.length === 0 ? (
        <Empty icon="grid" title="Noch keine Bereiche">Lege den ersten Bereich an, z. B. „Infrastruktur“ oder „Runbooks“.</Empty>
      ) : (
        <div className="grid-3">
          {spaces.map((s) => (
            <Link key={s.id} to={`/s/${s.key}`} className="space-card" style={{ '--sc': s.color }}>
              <span className="space-key">{s.key}</span>
              <span className="space-chip"><Icon name={s.icon} size={16} /></span>
              <h3>{s.name}</h3>
              <p>{s.description || 'Keine Beschreibung'}</p>
              <div className="space-meta">
                <span>{s.pageCount} Seiten</span>
                <span>{s.updatedAt ? timeAgo(s.updatedAt) : '—'}</span>
                <span>{ACCESS_LABELS[s.access]}</span>
              </div>
            </Link>
          ))}
          {user.role !== 'viewer' && (
            <button className="space-card new" onClick={() => setCreating(true)}>
              <Icon name="plus" size={24} />
              <span>Neuer Bereich</span>
            </button>
          )}
        </div>
      )}
      {creating && <SpaceFormModal onClose={() => setCreating(false)} onSaved={(s) => { loadSpaces(); navigate(`/s/${s.key}`); }} />}
    </div>
  );
}
