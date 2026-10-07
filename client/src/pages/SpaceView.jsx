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
import { tr, trn } from '../lib/i18n.js';

export default function SpaceView() {
  const { key } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { treeVersion, refreshTree, toast, loadSpaces } = useApp();
  const { data, error, loading } = useFetch(`/spaces/${key}`, [treeVersion]);
  const [type, setType] = useState('');
  const [modal, setModal] = useState(null);
  const pagesQuery = useFetch(`/pages${qs({ space: key, type, limit: 100 })}`, [treeVersion]);
  useChrome([{ label: tr('Bereiche'), to: '/spaces' }, { label: data?.space?.name || key }], key);

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
      <header className="page-head" style={{ borderLeft: `6px solid ${space.color}`, paddingLeft: 16 }}>
        <div>
          <h1>{space.name}</h1>
          {space.description && <p>{space.description}</p>}
          <p className="small" style={{ marginTop: 6 }}>
            {`${trn(stats.pages, '1 Seite', '{n} Seiten')}, ${trn(stats.contributors, '1 Mitwirkende Person', '{n} Mitwirkende')}, ${tr('Zugriff: {a}', { a: ACCESS_LABELS[space.access] })}`}
            {stats.overdue > 0 && <>, <strong style={{ color: 'var(--text)' }}>{tr('{n} Reviews überfällig', { n: stats.overdue })}</strong></>}
          </p>
        </div>
        <div className="row">
          <Link to={`/search?q=${encodeURIComponent(`space:${space.key} `)}`} className="btn"><Icon name="search" size={15} /> {tr('Im Bereich suchen')}</Link>
          {canWrite && <Link to={`/new?space=${space.key}`} className="btn primary"><Icon name="plus" size={15} /> {tr('Neue Seite')}</Link>}
          {isAdmin && (
            <Dropdown trigger={({ toggle }) => <button className="btn icon" onClick={toggle} aria-label={tr('Bereich verwalten')}><Icon name="settings" size={16} /></button>}>
              <MenuItem icon="edit" onClick={() => setModal('edit')}>{tr('Bereich bearbeiten')}</MenuItem>
              <MenuItem icon="shield" onClick={() => setModal('perms')}>{tr('Berechtigungen')}</MenuItem>
              <div className="menu-sep" />
              <MenuItem icon="trash" danger onClick={() => setModal('delete')}>{tr('Bereich löschen')}</MenuItem>
            </Dropdown>
          )}
        </div>
      </header>

      {roots.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 8 }}><h3>{tr('Oberste Ebene')}</h3></div>
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
          <h3>{tr('Alle Seiten')}</h3>
          <div className="filters" style={{ margin: 0 }}>
            <button className={`btn sm ${!type ? 'active' : ''}`} onClick={() => setType('')}>{tr('Alle')}</button>
            {types.map(([t, n]) => (
              <button key={t} className={`btn sm ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
                <Icon name={PAGE_TYPES[t]?.icon} size={13} /> {PAGE_TYPES[t]?.label || t} <span className="faint">{n}</span>
              </button>
            ))}
          </div>
        </div>
        {data.pages.length === 0 ? (
          <Empty icon="file-text" title={tr('Leerer Bereich')} action={canWrite && <Link to={`/new?space=${space.key}`} className="btn primary"><Icon name="plus" /> {tr('Erste Seite anlegen')}</Link>}>
            {tr('Hier gibt es noch keine Seiten.')}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{tr('Titel')}</th><th>{tr('Typ')}</th><th>{tr('Tags')}</th><th>{tr('Geändert')}</th></tr></thead>
              <tbody>
                {(pagesQuery.data?.pages || []).map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/p/${p.id}`)}>
                    <td><div className="row"><PageIcon icon={p.icon} fallback={PAGE_TYPES[p.pageType]?.icon} /><Link to={`/p/${p.id}`} style={{ color: 'var(--text)', fontWeight: 550 }}>{p.title}</Link></div></td>
                    <td><span className="tape">{PAGE_TYPES[p.pageType]?.label}</span></td>
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
          title={tr('Bereich löschen?')}
          message={tr('Alle {n} Seiten inklusive Versionen und Anhängen werden unwiderruflich gelöscht.', { n: stats.pages })}
          requireText={space.key}
          confirmLabel={tr('Endgültig löschen')}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            try {
              await api.del(`/spaces/${space.id}`, { confirm: space.key });
              toast(tr('Bereich gelöscht'));
              loadSpaces();
              navigate('/spaces');
            } catch (e) { toast(e.message, 'error'); }
          }}
        />
      )}
    </div>
  );
}
