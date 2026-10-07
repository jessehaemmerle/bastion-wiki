import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Spinner } from '../../components/ui.jsx';
import { useFetch } from '../../lib/hooks.js';
import { formatBytes, formatDate, formatDuration, timeAgo } from '../../lib/format.js';

export function AuditAction({ action }) {
  const [ns, ...rest] = action.split('.');
  return <span className="audit-action"><span className="ns">{ns}.</span>{rest.join('.')}</span>;
}

export default function Overview() {
  const { data, loading } = useFetch('/admin/overview');
  if (loading || !data) return <Spinner center />;
  const { counts: c, system: s } = data;
  const maxEdits = Math.max(1, ...data.activity.map((a) => a.edits));
  const maxPages = Math.max(1, ...data.topSpaces.map((x) => x.pages));
  const maxEditor = Math.max(1, ...data.topEditors.map((x) => x.edits));
  const days = [];
  const m = new Map(data.activity.map((a) => [a.day, a.edits]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ d, n: m.get(d) || 0 });
  }

  const tiles = [
    ['users', 'Benutzer', `${c.active_users}/${c.users}`, '/admin/users'],
    ['user-cog', 'Gruppen', c.groups, '/admin/groups'],
    ['grid', 'Bereiche', c.spaces, '/admin/spaces'],
    ['files', 'Seiten', c.pages],
    ['git-branch', 'Versionen', c.revisions],
    ['tags', 'Tags', c.tags, '/admin/tags'],
    ['paperclip', 'Anhänge', `${c.attachments} · ${formatBytes(c.attachment_bytes)}`],
    ['laptop', 'Aktive Sitzungen', c.sessions],
  ];

  return (
    <>
      <div className="page-head">
        <div><span className="eyebrow">Admin</span><h1>System-Übersicht</h1><p>Zustand, Nutzung und letzte Aktivitäten auf einen Blick.</p></div>
      </div>
      <div className="stats">
        {tiles.map(([icon, label, value, to]) => {
          const body = (<><Icon name={icon} className="stat-icon" /><span className="stat-value">{value}</span><span className="stat-label">{label}</span></>);
          return to ? <Link key={label} to={to} className="stat" style={{ color: 'inherit', textDecoration: 'none' }}>{body}</Link> : <div key={label} className="stat">{body}</div>;
        })}
        <div className={`stat ${c.overdue ? 'warn' : ''}`}><Icon name="calendar-clock" className="stat-icon" /><span className="stat-value">{c.overdue}</span><span className="stat-label">Reviews überfällig</span></div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><h3>Bearbeitungen · 30 Tage</h3><span className="mono tiny faint">max {maxEdits}/Tag</span></div>
          <div className="card-body"><div className="sparkbars" style={{ height: 120 }}>
            {days.map((x) => <span key={x.d} title={`${formatDate(x.d)}: ${x.n}`} style={{ height: `${Math.max(4, (x.n / maxEdits) * 100)}%`, opacity: x.n ? 0.9 : 0.2 }} />)}
          </div></div>
        </div>
        <div className="card">
          <div className="card-header"><h3>System</h3><span className="badge success">gesund</span></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Datenbank</dt><dd>{s.dbVersion} · {formatBytes(s.dbSize)}</dd>
              <dt>Runtime</dt><dd className="mono">Node {s.node}</dd>
              <dt>Plattform</dt><dd>{s.platform}</dd>
              <dt>Uptime</dt><dd>{formatDuration(s.uptimeSec)}</dd>
              <dt>Speicher</dt><dd>{s.memoryMb} MB RSS</dd>
            </dl>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Größte Bereiche</h3></div>
          <div className="card-body bar-list">
            {data.topSpaces.map((x) => (
              <div className="bar-row" key={x.name}><span className="ellipsis">{x.name}</span><div className="bar"><span style={{ width: `${(x.pages / maxPages) * 100}%`, '--c': x.color }} /></div><span className="mono small">{x.pages}</span></div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Aktivste Autor:innen · 30 Tage</h3></div>
          <div className="card-body bar-list">
            {!data.topEditors.length && <span className="faint small">Keine Aktivität.</span>}
            {data.topEditors.map((x) => (
              <div className="bar-row" key={x.name}><span className="ellipsis">{x.name}</span><div className="bar"><span style={{ width: `${(x.edits / maxEditor) * 100}%` }} /></div><span className="mono small">{x.edits}</span></div>
            ))}
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-header"><h3>Letzte Ereignisse</h3><Link to="/admin/audit" className="small">Audit-Log</Link></div>
        <div className="table-wrap">
          <table className="data">
            <tbody>
              {data.recentAudit.map((a) => (
                <tr key={a.id}><td><AuditAction action={a.action} /></td><td className="small">{a.user || 'System'}</td><td className="small faint ellipsis" style={{ maxWidth: 360 }}>{a.details?.title || a.details?.name || a.details?.username || ''}</td><td className="small faint nowrap">{timeAgo(a.createdAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
