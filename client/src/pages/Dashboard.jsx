import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PageList from '../components/PageList.jsx';
import { ActivityBars } from '../components/Charts.jsx';
import { Spinner } from '../components/ui.jsx';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { PAGE_TYPES, shortWhen } from '../lib/format.js';

const EXAMPLES = ['type:runbook', 'type:host', 'space:infra', 'tag:linux'];

function ChangeLog({ pages }) {
  if (!pages?.length) return <p className="muted small">Noch keine Änderungen.</p>;
  return (
    <ul className="log">
      {pages.map((p) => (
        <li key={p.id}>
          <span className="when" title={new Date(p.updatedAt).toLocaleString('de-DE')}>{shortWhen(p.updatedAt)}</span>
          <div className="what">
            <Link to={`/p/${p.id}`}>{p.title}</Link>
            <div className="where">
              <span className="cable" style={{ '--sc': p.spaceColor }} /> {p.spaceName}
              {p.updatedBy && <span className="faint">{p.updatedBy}</span>}
            </div>
          </div>
          {p.pageType !== 'doc' ? <span className="tape">{PAGE_TYPES[p.pageType]?.label}</span> : <span />}
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const { user, spaces } = useApp();
  const navigate = useNavigate();
  const { data, loading } = useFetch('/dashboard');
  const [q, setQ] = useState('');
  useChrome([{ label: 'Start' }]);

  if (loading && !data) return <Spinner center />;
  const s = data?.stats || {};
  const search = (term) => navigate(`/search?q=${encodeURIComponent(term)}`);

  return (
    <div className="content">
      <form className="start-search" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) search(q.trim()); }}>
        <h1>Wonach suchst du?</h1>
        <label className="big-search">
          <Icon name="search" size={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hostname, IP-Adresse, Fehlermeldung, Runbook …" aria-label="Wiki durchsuchen" />
          <button className="btn primary" type="submit">Suchen</button>
        </label>
        <div className="hints">
          <span>Filter:</span>
          {EXAMPLES.map((ex) => <button type="button" key={ex} onClick={() => setQ(`${ex} `)}>{ex}</button>)}
        </div>
      </form>

      <p className="summary-line">
        <strong>{s.pages ?? 0}</strong> Seiten in <strong>{spaces.length}</strong> Bereichen, <strong>{s.updated_week ?? 0}</strong> davon diese Woche geändert.
        {s.overdue > 0 && <> <Link to="/review">{s.overdue} {s.overdue === 1 ? 'Seite muss' : 'Seiten müssen'} geprüft werden.</Link></>}
      </p>

      <div className="start-grid">
        <div>
          <section>
            <div className="section-h"><h2>Letzte Änderungen</h2></div>
            <ChangeLog pages={data?.recent} />
          </section>
          {data?.mine?.length > 0 && (
            <section>
              <div className="section-h"><h2>Von dir bearbeitet</h2></div>
              <ChangeLog pages={data.mine} />
            </section>
          )}
        </div>
        <div>
          {data?.pinned?.length > 0 && (
            <section>
              <div className="section-h"><h2>Angepinnt</h2></div>
              <PageList pages={data.pinned} />
            </section>
          )}
          <section>
            <div className="section-h"><h2>Zu prüfen</h2><Link to="/review">Alle</Link></div>
            <PageList pages={data?.reviewDue} showReview empty="In den nächsten 7 Tagen ist kein Review fällig." />
          </section>
          <section>
            <div className="section-h"><h2>Favoriten</h2></div>
            <PageList pages={data?.favorites} empty="Markiere Seiten mit dem Stern, um sie hier abzulegen." />
          </section>
          <section>
            <div className="section-h"><h2>Bereiche</h2><Link to="/spaces">Übersicht</Link></div>
            <table className="space-index">
              <tbody>
                {spaces.map((sp) => (
                  <tr key={sp.id}>
                    <td><span className="stripe" style={{ '--sc': sp.color }} /></td>
                    <td><Link to={`/s/${sp.key}`}>{sp.name}</Link><div className="small muted">{sp.description}</div></td>
                    <td className="small muted nowrap" style={{ textAlign: 'right' }}>{sp.pageCount} Seiten</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {user.role !== 'viewer' && <Link to="/spaces?new=1" className="btn sm" style={{ marginTop: 10 }}><Icon name="plus" size={14} /> Bereich anlegen</Link>}
          </section>
          <section>
            <div className="section-h"><h2>Änderungen, 30 Tage</h2></div>
            <ActivityBars activity={data?.activity} />
          </section>
        </div>
      </div>
    </div>
  );
}
