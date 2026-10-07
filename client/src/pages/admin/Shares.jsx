import { Link } from 'react-router-dom';
import { Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { formatDate, timeAgo } from '../../lib/format.js';
import { tr } from '../../lib/i18n.js';

export default function Shares() {
  const { toast, settings } = useApp();
  const { data, reload, loading } = useFetch('/admin/shares');
  const revoke = async (s) => {
    try { await api.del(`/shares/${s.id}`); toast(tr('Freigabe widerrufen')); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  if (loading && !data) return <Spinner center />;
  const active = data.shares.filter((s) => !s.expired).length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr('Freigabelinks')}</h1>
          <p>{settings.allowSharing === false
            ? tr('Freigabelinks sind derzeit deaktiviert (Anmeldung & Sicherheit). Bestehende Links funktionieren nicht.')
            : tr('{n} aktive Links. Seiten lassen sich über „Freigabelink …“ im Seitenmenü teilen.', { n: active })}</p>
        </div>
      </div>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>{tr('Seite')}</th><th>{tr('Notiz')}</th><th>{tr('Erstellt von')}</th><th>{tr('Läuft ab')}</th><th>{tr('Aufrufe')}</th><th /></tr></thead>
          <tbody>
            {!data.shares.length && <tr><td colSpan={6} className="faint small">{tr('Keine Freigaben.')}</td></tr>}
            {data.shares.map((s) => (
              <tr key={s.id} className={s.expired ? 'faint' : ''}>
                <td><Link to={`/p/${s.pageId}`}><strong>{s.pageTitle}</strong></Link><div className="mono tiny faint">{s.prefix}…</div></td>
                <td className="small">{s.note || '—'}</td>
                <td className="small">{s.createdBy}<div className="tiny faint">{timeAgo(s.createdAt)}</div></td>
                <td className="small">{s.expired ? <span className="badge">{tr('abgelaufen')}</span> : formatDate(s.expiresAt, true)}</td>
                <td className="mono small">{s.views}{s.lastViewAt && <div className="tiny faint">{timeAgo(s.lastViewAt)}</div>}</td>
                <td className="actions">{!s.expired && <button className="btn ghost sm" onClick={() => revoke(s)}>{tr('Widerrufen')}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
