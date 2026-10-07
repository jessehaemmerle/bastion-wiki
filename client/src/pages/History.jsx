import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ContentView from '../components/ContentView.jsx';
import { Avatar, Confirm, Spinner } from '../components/ui.jsx';
import NotFound from './NotFound.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { diffLines, htmlToLines } from '../lib/diff.js';
import { formatDate, timeAgo } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

export default function History() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast, refreshTree } = useApp();
  const pageQ = useFetch(`/pages/${id}`);
  const revQ = useFetch(`/pages/${id}/revisions`);
  const [selected, setSelected] = useState(null);
  const [compare, setCompare] = useState(null);
  const [mode, setMode] = useState('diff');
  const [revs, setRevs] = useState({});
  const [restore, setRestore] = useState(null);
  const page = pageQ.data?.page;
  const revisions = revQ.data?.revisions || [];

  useChrome(
    page ? [{ label: page.space.name, to: `/s/${page.space.key}` }, { label: page.title, to: `/p/${page.id}` }, { label: tr('Versionen') }] : [{ label: '…' }],
    page?.space.key ?? null, page?.id ?? null,
  );

  useEffect(() => {
    if (revisions.length && selected == null) {
      setSelected(revisions[0].version);
      setCompare(revisions[1]?.version ?? null);
    }
  }, [revisions, selected]);

  useEffect(() => {
    for (const v of [selected, compare]) {
      if (v != null && !revs[v]) {
        api.get(`/pages/${id}/revisions/${v}`).then(({ revision }) => setRevs((r) => ({ ...r, [v]: revision }))).catch(() => {});
      }
    }
  }, [selected, compare, id, revs]);

  const diff = useMemo(() => {
    const a = revs[compare];
    const b = revs[selected];
    if (!b) return null;
    const before = a ? [`# ${a.title}`, ...htmlToLines(a.content), ...Object.entries(a.properties || {}).map(([k, v]) => `${k}: ${v}`)] : [];
    const after = [`# ${b.title}`, ...htmlToLines(b.content), ...Object.entries(b.properties || {}).map(([k, v]) => `${k}: ${v}`)];
    return diffLines(before, after);
  }, [revs, selected, compare]);

  if (pageQ.error) return <NotFound message={pageQ.error.message} />;
  if (!page || revQ.loading) return <Spinner center />;
  const canWrite = ['write', 'admin'].includes(page.access);
  const stats = diff ? { add: diff.filter((d) => d.type === 'add').length, del: diff.filter((d) => d.type === 'del').length } : null;

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>{page.title}</h1>
          <p>{tr('{n} Versionen gespeichert, aktuell ist Version {v}.', { n: revisions.length, v: page.version })}</p>
        </div>
        <Link to={`/p/${page.id}`} className="btn"><Icon name="arrow-left" /> {tr('Zur Seite')}</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 20, alignItems: 'start' }} className="history-grid">
        <div className="card" style={{ position: 'sticky', top: 'calc(var(--topbar-h) + 16px)' }}>
          <ul className="list" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {revisions.map((r) => (
              <li key={r.version}>
                <button
                  className="list-item"
                  style={{ all: 'unset', boxSizing: 'border-box', display: 'flex', gap: 12, width: '100%', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: selected === r.version ? 'var(--accent-soft)' : undefined }}
                  onClick={() => { setSelected(r.version); setCompare(revisions.find((x) => x.version < r.version)?.version ?? null); }}
                >
                  <Avatar name={r.author || '?'} size={28} />
                  <div className="grow">
                    <div className="row between"><strong className="mono">v{r.version}</strong><span className="faint tiny">{timeAgo(r.createdAt)}</span></div>
                    <div className="small muted ellipsis">{r.summary || tr('Keine Notiz')}</div>
                    <div className="tiny faint">{r.author || tr('Unbekannt')}, {formatDate(r.createdAt, true)}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="row wrap">
              <div className="segmented">
                <button className={mode === 'diff' ? 'active' : ''} onClick={() => setMode('diff')}><Icon name="git-branch" size={14} /> {tr('Änderungen')}</button>
                <button className={mode === 'view' ? 'active' : ''} onClick={() => setMode('view')}><Icon name="eye" size={14} /> {tr('Ansicht')}</button>
              </div>
              {mode === 'diff' && (
                <span className="small muted row">
                  {tr('v{n} vergleichen mit', { n: selected })}
                  <select className="select sm" style={{ width: 110 }} value={compare ?? ''} onChange={(e) => setCompare(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{tr('(leer)')}</option>
                    {revisions.filter((r) => r.version !== selected).map((r) => <option key={r.version} value={r.version}>v{r.version}</option>)}
                  </select>
                </span>
              )}
              {stats && mode === 'diff' && <span className="mono small"><span style={{ color: 'var(--success)' }}>+{stats.add}</span> <span style={{ color: 'var(--danger)' }}>−{stats.del}</span></span>}
            </div>
            {canWrite && selected !== page.version && (
              <button className="btn sm" onClick={() => setRestore(selected)}><Icon name="undo" size={14} /> {tr('v{n} wiederherstellen', { n: selected })}</button>
            )}
          </div>
          <div className="card-body">
            {!revs[selected] ? <Spinner /> : mode === 'diff' ? (
              <div className="diff">
                {diff.map((d, i) => <div key={i} className={d.type}>{d.t || ' '}</div>)}
              </div>
            ) : (
              <>
                <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>{revs[selected].title}</h2>
                <ContentView html={revs[selected].content} />
              </>
            )}
          </div>
        </div>
      </div>
      {restore != null && (
        <Confirm
          title={tr('Version {n} wiederherstellen?', { n: restore })}
          message={tr('Der Inhalt dieser Version wird als neue Version gespeichert. Es geht nichts verloren.')}
          confirmLabel={tr('Wiederherstellen')}
          onClose={() => setRestore(null)}
          onConfirm={async () => {
            try {
              const res = await api.post(`/pages/${id}/revisions/${restore}/restore`);
              // pages with approval workflow: the restore becomes a change request (202 { pending: true })
              toast(res?.pending ? tr('Änderungsvorschlag eingereicht – wartet auf Freigabe') : tr('Version {n} wiederhergestellt', { n: restore }));
              refreshTree();
              navigate(`/p/${id}`);
            } catch (e) { toast(e.message, 'error'); }
          }}
        />
      )}
    </div>
  );
}
