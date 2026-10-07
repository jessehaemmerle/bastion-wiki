import { Link } from 'react-router-dom';
import { ActivityBars, BarList } from '../../components/Charts.jsx';
import { Spinner } from '../../components/ui.jsx';
import { useFetch } from '../../lib/hooks.js';
import { formatBytes, formatDuration, shortWhen } from '../../lib/format.js';
import { tr } from '../../lib/i18n.js';

export function AuditAction({ action }) {
  const [ns, ...rest] = action.split('.');
  return <span className="audit-action"><span className="ns">{ns}.</span>{rest.join('.')}</span>;
}

export default function Overview() {
  const { data, loading } = useFetch('/admin/overview');
  if (loading || !data) return <Spinner center />;
  const { counts: c, system: s } = data;
  const rows = [
    [tr('Aktive Benutzer'), tr('{a} von {b}', { a: c.active_users, b: c.users }), '/admin/users'],
    [tr('Gruppen'), c.groups, '/admin/groups'],
    [tr('Bereiche'), c.spaces, '/admin/spaces'],
    [tr('Seiten'), c.pages],
    [tr('Gespeicherte Versionen'), c.revisions],
    [tr('Tags'), c.tags, '/admin/tags'],
    [tr('Anhänge'), `${c.attachments} (${formatBytes(c.attachment_bytes)})`],
    [tr('Angemeldete Sitzungen'), c.sessions],
  ];

  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Systemstatus')}</h1><p>{tr('Bestand, Auslastung und die letzten Ereignisse.')}</p></div>
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section>
          <div className="section-h"><h2>{tr('Bestand')}</h2></div>
          <table className="status-table">
            <tbody>
              {rows.map(([label, value, to]) => (
                <tr key={label}><th>{label}</th><td>{to ? <Link to={to}>{value}</Link> : value}</td></tr>
              ))}
              <tr className={c.overdue ? 'warn' : ''}><th>{tr('Reviews überfällig')}</th><td><Link to="/review">{c.overdue}</Link></td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <div className="section-h"><h2>{tr('Server')}</h2></div>
          <table className="status-table">
            <tbody>
              <tr><th>{tr('Datenbank')}</th><td>{s.dbVersion}, {formatBytes(s.dbSize)}</td></tr>
              <tr><th>{tr('Node.js')}</th><td className="mono">{s.node}</td></tr>
              <tr><th>{tr('Betriebssystem')}</th><td>{s.platform}</td></tr>
              <tr><th>{tr('Laufzeit seit Start')}</th><td>{formatDuration(s.uptimeSec)}</td></tr>
              <tr><th>{tr('Arbeitsspeicher')}</th><td>{s.memoryMb} MB</td></tr>
            </tbody>
          </table>
        </section>
        <section>
          <div className="section-h"><h2>{tr('Änderungen, 30 Tage')}</h2></div>
          <ActivityBars activity={data.activity} height={80} />
        </section>
        <section>
          <div className="section-h"><h2>{tr('Seiten pro Bereich')}</h2></div>
          <BarList rows={data.topSpaces.map((x) => ({ label: x.name, value: x.pages, color: x.color }))} />
          <div className="section-h" style={{ marginTop: 24 }}><h2>{tr('Meiste Änderungen, 30 Tage')}</h2></div>
          {data.topEditors.length ? <BarList rows={data.topEditors.map((x) => ({ label: x.name, value: x.edits }))} /> : <p className="muted small">{tr('Keine Änderungen.')}</p>}
        </section>
      </div>
      <section style={{ marginTop: 28 }}>
        <div className="section-h"><h2>{tr('Letzte Ereignisse')}</h2><Link to="/admin/audit">{tr('Audit-Log')}</Link></div>
        <div className="table-wrap">
          <table className="data">
            <tbody>
              {data.recentAudit.map((a) => (
                <tr key={a.id}>
                  <td className="mono small nowrap">{shortWhen(a.createdAt)}</td>
                  <td><AuditAction action={a.action} /></td>
                  <td className="small">{a.user || tr('System')}</td>
                  <td className="small muted ellipsis" style={{ maxWidth: 360 }}>{a.details?.title || a.details?.name || a.details?.username || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
