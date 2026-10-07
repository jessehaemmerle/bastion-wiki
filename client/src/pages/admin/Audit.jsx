import { Fragment, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Spinner } from '../../components/ui.jsx';
import { qs } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { formatDate } from '../../lib/format.js';
import { AuditAction } from './Overview.jsx';

const PAGE = 50;
const ACTIONS = [['', 'Alle Aktionen'], ['auth', 'Anmeldung'], ['page', 'Seiten'], ['space', 'Bereiche'], ['admin', 'Administration'], ['token', 'API-Tokens'], ['attachment', 'Anhänge'], ['tag', 'Tags'], ['template', 'Vorlagen']];

export default function Audit() {
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(null);
  const { data, loading } = useFetch(`/admin/audit${qs({ action, q, offset, limit: PAGE })}`);
  return (
    <>
      <div className="page-head">
        <div><h1>Audit-Log</h1><p>Lückenlose Nachverfolgung sicherheitsrelevanter Ereignisse und Änderungen.</p></div>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="row wrap">
            <select className="select sm" style={{ width: 'auto' }} value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }}>
              {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="input-icon"><Icon name="search" /><input className="input sm" placeholder="Details durchsuchen …" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} /></div>
          </div>
          <span className="faint small">{data?.total ?? 0} Einträge</span>
        </div>
        {loading && !data ? <Spinner /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Zeitpunkt</th><th>Aktion</th><th>Benutzer</th><th>Objekt</th><th>IP</th><th /></tr></thead>
              <tbody>
                {data.entries.map((e) => (
                  <Fragment key={e.id}>
                    <tr onClick={() => setOpen(open === e.id ? null : e.id)} style={{ cursor: 'pointer' }}>
                      <td className="small nowrap mono">{formatDate(e.createdAt, true)}</td>
                      <td><AuditAction action={e.action} /></td>
                      <td className="small">{e.user || <span className="faint">System</span>}</td>
                      <td className="small faint">{e.entityType ? `${e.entityType} #${e.entityId}` : '—'} {e.details?.title || e.details?.name || e.details?.username ? <span style={{ color: 'var(--text)' }}>{e.details.title || e.details.name || e.details.username}</span> : null}</td>
                      <td className="mono tiny faint">{e.ip}</td>
                      <td className="actions"><Icon name={open === e.id ? 'chevron-down' : 'chevron-right'} size={14} /></td>
                    </tr>
                    {open === e.id && (
                      <tr><td colSpan={6}><pre className="secret-box" style={{ margin: 0, display: 'block', whiteSpace: 'pre-wrap' }}>{JSON.stringify(e.details, null, 2)}</pre></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row between" style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <button className="btn sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}><Icon name="arrow-left" size={14} /> Neuer</button>
          <span className="faint small mono">{offset + 1}–{Math.min(offset + PAGE, data?.total || 0)}</span>
          <button className="btn sm" disabled={!data || offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Älter <Icon name="arrow-right" size={14} /></button>
        </div>
      </div>
    </>
  );
}
