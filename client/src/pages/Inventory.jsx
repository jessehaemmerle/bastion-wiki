import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon, { PageIcon } from '../components/Icon.jsx';
import { Empty, Spinner, TagPill } from '../components/ui.jsx';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { formatDate, PAGE_TYPES, timeAgo } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

const TYPES = ['host', 'service', 'network'];
const TYPE_LABEL = {
  get host() { return tr('Server & Hosts'); },
  get service() { return tr('Services'); },
  get network() { return tr('Netzwerke'); },
};

/** Columns = the data-sheet fields used most often for this type */
function columnsFor(items, max = 6) {
  const freq = new Map();
  for (const it of items) for (const k of Object.keys(it.properties || {})) freq.set(k, (freq.get(k) || 0) + 1);
  return [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([k]) => k);
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function Inventory() {
  const { type: rawType } = useParams();
  const type = TYPES.includes(rawType) ? rawType : 'host';
  const navigate = useNavigate();
  const { spaces } = useApp();
  const [q, setQ] = useState('');
  const [space, setSpace] = useState('');
  const [sort, setSort] = useState({ key: 'title', dir: 1 });
  const { data, loading } = useFetch(`/inventory?type=${type}${space ? `&space=${encodeURIComponent(space)}` : ''}`);
  useChrome([{ label: tr('Inventar') }, { label: TYPE_LABEL[type] }]);

  const items = useMemo(() => data?.items || [], [data]);
  const columns = useMemo(() => columnsFor(items), [items]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? items.filter((it) => [it.title, it.spaceName, ...it.tags, ...Object.values(it.properties || {})].join(' ').toLowerCase().includes(needle))
      : items;
    const get = (it) => (sort.key === 'title' ? it.title : sort.key === 'updated' ? it.updatedAt : it.properties?.[sort.key] || '');
    return [...list].sort((a, b) => String(get(a)).localeCompare(String(get(b)), undefined, { numeric: true }) * sort.dir);
  }, [items, q, sort]);

  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));
  const th = (key, label) => (
    <th aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="th-sort" onClick={() => sortBy(key)}>{label}{sort.key === key && <span aria-hidden="true">{sort.dir > 0 ? ' ▲' : ' ▼'}</span>}</button>
    </th>
  );
  const exportCsv = () => {
    const head = [tr('Name'), tr('Bereich'), ...columns, tr('Tags'), tr('Geändert'), 'URL'];
    const lines = [head.map(csvCell).join(';'), ...rows.map((r) => [
      r.title, r.spaceName, ...columns.map((c) => r.properties?.[c]), r.tags.join(' '), r.updatedAt, `${location.origin}/p/${r.id}`,
    ].map(csvCell).join(';'))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `inventar-${type}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const writable = spaces.filter((s) => ['write', 'admin'].includes(s.access));

  return (
    <div className="content wide">
      <div className="page-head">
        <div>
          <h1>{tr('Inventar')}</h1>
          <p>{tr('Alle Seiten vom Typ Host, Service und Netzwerk mit ihrem Datenblatt. Bezüge zeigt jede Seite unter „Erwähnt in“.')}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={exportCsv} disabled={!rows.length}><Icon name="download" size={15} /> CSV</button>
          {writable.length > 0 && <Link className="btn primary" to={`/new?space=${space || writable[0].key}`}><Icon name="plus" size={15} /> {tr('Neue Seite')}</Link>}
        </div>
      </div>
      <div className="tabs">
        {TYPES.map((t) => (
          <button key={t} className={`tab ${t === type ? 'active' : ''}`} onClick={() => navigate(`/inventory/${t}`)}>
            <Icon name={PAGE_TYPES[t].icon} size={15} /> {TYPE_LABEL[t]} <span className="count mono">{data?.counts?.[t] ?? ''}</span>
          </button>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <div className="input-icon grow" style={{ maxWidth: 380 }}>
          <Icon name="filter" size={15} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Filtern nach Name, IP, Tag …')} aria-label={tr('Filtern')} />
        </div>
        <select className="select" style={{ width: 'auto' }} value={space} onChange={(e) => setSpace(e.target.value)} aria-label={tr('Bereich')}>
          <option value="">{tr('Alle Bereiche')}</option>
          {spaces.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
        </select>
        <span className="small faint">{tr('{n} Einträge', { n: rows.length })}</span>
      </div>
      {loading && !data ? <Spinner /> : !items.length ? (
        <Empty icon={PAGE_TYPES[type].icon} title={tr('Noch keine Einträge')}>
          {tr('Lege eine Seite mit dem Seitentyp „{type}“ an (z. B. mit der passenden Vorlage) und fülle das Datenblatt aus.', { type: PAGE_TYPES[type].label })}
        </Empty>
      ) : (
        <div className="card table-wrap">
          <table className="data inventory">
            <thead>
              <tr>
                {th('title', tr('Name'))}
                {columns.map((c) => <Fragment key={c}>{th(c, c)}</Fragment>)}
                <th>{tr('Tags')}</th>
                {th('updated', tr('Geändert'))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/p/${r.id}`} className="row" style={{ gap: 8, fontWeight: 700 }}>
                      <PageIcon icon={r.icon} fallback={PAGE_TYPES[type].icon} size={15} /> {r.title}
                    </Link>
                    <div className="tiny faint row" style={{ gap: 6 }}><span className="cable" style={{ '--sc': r.spaceColor }} />{r.spaceName}{r.backlinks > 0 && <span>· {tr('{n} Verweise', { n: r.backlinks })}</span>}</div>
                  </td>
                  {columns.map((c) => <td key={c} className="mono small">{r.properties?.[c] || <span className="faint">—</span>}</td>)}
                  <td><div className="row wrap" style={{ gap: 4 }}>{r.tags.slice(0, 4).map((t) => <TagPill key={t} name={t} />)}</div></td>
                  <td className="small" title={formatDate(r.updatedAt, true)}>
                    {timeAgo(r.updatedAt)}
                    {r.reviewDue && r.reviewDue < new Date().toISOString().slice(0, 10) && <div><span className="badge warning">{tr('Review fällig')}</span></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
