import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { formatDate, PAGE_TYPES, timeAgo } from '../../lib/format.js';
import { tr } from '../../lib/i18n.js';

export default function Links() {
  const { toast } = useApp();
  const { data, error, reload, loading } = useFetch('/admin/ops/links');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('broken');
  const check = async () => {
    setBusy(true);
    try {
      const { checked } = await api.post('/admin/ops/links/check');
      toast(tr('{n} externe Links geprüft', { n: checked }));
      reload();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  if (loading && !data) return <Spinner center />;
  if (error) return <div className="error-box" role="alert">{error.message}</div>;
  const { stats, broken, external, unlinked } = data;
  const tabs = [
    ['broken', 'unlink', tr('Tote interne Links'), broken.length],
    ['external', 'globe', tr('Externe Fehler'), external.length],
    ['unlinked', 'link-off', tr('Ohne eingehende Links'), unlinked.length],
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr('Link-Prüfung')}</h1>
          <p>{tr('{i} interne Links, {f} Dateilinks und {e} externe Adressen im Index. Externe Links zuletzt geprüft: {when}.', {
            i: stats.internal, f: stats.files, e: stats.external, when: stats.last_check ? timeAgo(stats.last_check) : tr('nie'),
          })}</p>
        </div>
        <button className="btn primary" onClick={check} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="radar" size={15} />} {tr('Externe Links prüfen')}</button>
      </div>
      <div className="tabs">
        {tabs.map(([id, icon, label, n]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon name={icon} size={15} /> {label} <span className="count mono">{n}</span></button>
        ))}
      </div>
      <div className="card table-wrap">
        {tab === 'broken' && (
          <table className="data">
            <thead><tr><th>{tr('Seite')}</th><th>{tr('Link')}</th><th>{tr('Ziel')}</th></tr></thead>
            <tbody>
              {!broken.length && <tr><td colSpan={3} className="faint small">{tr('Keine toten Links. Sehr gut.')}</td></tr>}
              {broken.map((b, i) => (
                <tr key={i}>
                  <td><Link to={`/p/${b.sourceId}`}><strong>{b.sourceTitle}</strong></Link></td>
                  <td className="small">{b.label || '—'}</td>
                  <td className="mono small">{b.href} <span className="badge danger">{b.kind === 'page' ? tr('Seite fehlt') : tr('Datei fehlt')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'external' && (
          <table className="data">
            <thead><tr><th>{tr('Adresse')}</th><th>{tr('Ergebnis')}</th><th>{tr('Verwendet auf')}</th><th>{tr('Geprüft')}</th></tr></thead>
            <tbody>
              {!external.length && <tr><td colSpan={4} className="faint small">{stats.checked ? tr('Alle geprüften externen Links antworten.') : tr('Noch nicht geprüft.')}</td></tr>}
              {external.map((e) => (
                <tr key={e.href}>
                  <td className="mono small break"><a href={e.href} target="_blank" rel="noopener noreferrer nofollow">{e.href}</a></td>
                  <td><span className="badge danger mono">{e.status ? `HTTP ${e.status}` : e.error || tr('nicht erreichbar')}</span></td>
                  <td className="small">{e.pages.map((p, i) => <span key={p.id}>{i > 0 && ', '}<Link to={`/p/${p.id}`}>{p.title}</Link></span>)}</td>
                  <td className="small" title={formatDate(e.checkedAt, true)}>{timeAgo(e.checkedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'unlinked' && (
          <table className="data">
            <thead><tr><th>{tr('Seite')}</th><th>{tr('Bereich')}</th><th>{tr('Unterseiten')}</th><th>{tr('Geändert')}</th></tr></thead>
            <tbody>
              {unlinked.map((u) => (
                <tr key={u.id}>
                  <td><Link to={`/p/${u.id}`}><strong>{u.title}</strong></Link> {u.pageType !== 'doc' && <span className="badge mono">{PAGE_TYPES[u.pageType]?.label}</span>}</td>
                  <td className="small">{u.spaceName}</td>
                  <td className="mono small">{u.children || '—'}</td>
                  <td className="small" title={formatDate(u.updatedAt, true)}>{timeAgo(u.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {tab === 'unlinked' && <p className="small faint">{tr('Diese Seiten sind nur über den Seitenbaum oder die Suche erreichbar. Älteste zuerst – gute Kandidaten zum Verlinken, Zusammenführen oder Löschen.')}</p>}
    </>
  );
}
