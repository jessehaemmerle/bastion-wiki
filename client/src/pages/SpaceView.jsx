import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon, { PageIcon } from '../components/Icon.jsx';
import { PermissionsModal, SpaceFormModal } from '../components/SpaceForms.jsx';
import { Confirm, Dropdown, Empty, MenuItem, Spinner, TagPill } from '../components/ui.jsx';
import NotFound from './NotFound.jsx';
import { api, qs } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { ACCESS_LABELS, PAGE_TYPES, timeAgo } from '../lib/format.js';

export default function SpaceView() {
  const { key } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { treeVersion, refreshTree, toast, loadSpaces } = useApp();
  const { data, error, loading } = useFetch(`/spaces/${key}`, [treeVersion]);
  const [type, setType] = useState('');
  const [modal, setModal] = useState(null);
  const pagesQuery = useFetch(`/pages${qs({ space: key, type, limit: 100 })}`, [treeVersion]);
  useChrome([{ label: 'Bereiche', to: '/spaces' }, { label: data?.space?.name || key }], key);

  useEffect(() => {
    if (params.get('settings') && data?.space?.access === 'admin') {
      setModal('edit');
      setParams({}, { replace: true });
    }
  }, [params, data, setParams]);

  const types = useMemo(() => {
    const m = new Map();
    for (const p of data?.pages || []) m.set(p.pageType, (m.get(p.pageType) || 0) + 1);
    return [...m.entries()];
  }, [data]);

  if (loading && !data) return <Spinner center />;
  if (error) return <NotFound message={error.message} />;
  const { space, stats } = data;
  const canWrite = ['write', 'admin'].includes(space.access);
  const isAdmin = space.access === 'admin';
  const roots = data.pages.filter((p) => !p.parentId);

  return (
    <div className="content">
      <section className="hero" style={{ '--accent': space.color, '--accent-2': space.color }}>
        <div className="row between" style={{ position: 'relative', zIndex: 1, alignItems: 'flex-start' }}>
          <span className="space-chip" style={{ '--sc': space.color, width: 52, height: 52, borderRadius: 14 }}><Icon name={space.icon} size={24} /></span>
          <div className="row">
            <span className="badge mono">{space.key}</span>
            <span className="badge">{ACCESS_LABELS[space.access]}</span>
            {isAdmin && (
              <Dropdown trigger={({ toggle }) => <button className="btn icon sm" onClick={toggle} aria-label="Bereich verwalten"><Icon name="more" /></button>}>
                <MenuItem icon="edit" onClick={() => setModal('edit')}>Bearbeiten</MenuItem>
                <MenuItem icon="shield" onClick={() => setModal('perms')}>Berechtigungen</MenuItem>
                <div className="menu-sep" />
                <MenuItem icon="trash" danger onClick={() => setModal('delete')}>Bereich löschen</MenuItem>
              </Dropdown>
            )}
          </div>
        </div>
        <h1>{space.name}</h1>
        <p>{space.description}</p>
        <div className="hero-actions">
          {canWrite && <Link to={`/new?space=${space.key}`} className="btn primary"><Icon name="plus" /> Neue Seite</Link>}
          <Link to={`/search?q=${encodeURIComponent(`space:${space.key} `)}`} className="btn"><Icon name="search" /> In Bereich suchen</Link>
        </div>
      </section>

      <div className="stats">
        <div className="stat"><span className="stat-value">{stats.pages}</span><span className="stat-label">Seiten</span></div>
        <div className="stat"><span className="stat-value">{stats.contributors}</span><span className="stat-label">Mitwirkende</span></div>
        <div className={`stat ${stats.overdue ? 'warn' : ''}`}><span className="stat-value">{stats.overdue}</span><span className="stat-label">Reviews überfällig</span></div>
        <div className="stat"><span className="stat-value">{types.length}</span><span className="stat-label">Seitentypen</span></div>
      </div>

      {roots.length > 0 && (
        <>
          <div className="section-title"><span className="eyebrow">Struktur</span></div>
          <div className="children-grid" style={{ marginBottom: 28 }}>
            {roots.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} className="child-card">
                <PageIcon icon={p.icon} fallback={PAGE_TYPES[p.pageType]?.icon} />
                <span className="ellipsis">{p.title}</span>
                <span className="faint tiny mono" style={{ marginLeft: 'auto' }}>{data.pages.filter((c) => c.parentId === p.id).length || ''}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Alle Seiten</h3>
          <div className="filters" style={{ margin: 0 }}>
            <button className={`btn sm ${!type ? 'active' : ''}`} onClick={() => setType('')}>Alle</button>
            {types.map(([t, n]) => (
              <button key={t} className={`btn sm ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
                <Icon name={PAGE_TYPES[t]?.icon} size={13} /> {PAGE_TYPES[t]?.label || t} <span className="faint">{n}</span>
              </button>
            ))}
          </div>
        </div>
        {data.pages.length === 0 ? (
          <Empty icon="file-text" title="Leerer Bereich" action={canWrite && <Link to={`/new?space=${space.key}`} className="btn primary"><Icon name="plus" /> Erste Seite anlegen</Link>}>
            Hier gibt es noch keine Seiten.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Titel</th><th>Typ</th><th>Tags</th><th>Geändert</th></tr></thead>
              <tbody>
                {(pagesQuery.data?.pages || []).map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/p/${p.id}`)}>
                    <td><div className="row"><PageIcon icon={p.icon} fallback={PAGE_TYPES[p.pageType]?.icon} /><Link to={`/p/${p.id}`} style={{ color: 'var(--text)', fontWeight: 550 }}>{p.title}</Link></div></td>
                    <td><span className="badge mono">{PAGE_TYPES[p.pageType]?.label}</span></td>
                    <td><div className="row wrap" style={{ gap: 4 }}>{p.tags.slice(0, 3).map((t) => <TagPill key={t} name={t} />)}</div></td>
                    <td className="nowrap faint small">{timeAgo(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === 'edit' && <SpaceFormModal space={space} onClose={() => setModal(null)} onSaved={(s) => { refreshTree(); if (s.key !== key) navigate(`/s/${s.key}`); }} />}
      {modal === 'perms' && <PermissionsModal space={space} onClose={() => setModal(null)} />}
      {modal === 'delete' && (
        <Confirm
          danger
          title="Bereich löschen?"
          message={`Alle ${stats.pages} Seiten inklusive Versionen und Anhängen werden unwiderruflich gelöscht.`}
          requireText={space.key}
          confirmLabel="Endgültig löschen"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            try {
              await api.del(`/spaces/${space.id}`, { confirm: space.key });
              toast('Bereich gelöscht');
              loadSpaces();
              navigate('/spaces');
            } catch (e) { toast(e.message, 'error'); }
          }}
        />
      )}
    </div>
  );
}
