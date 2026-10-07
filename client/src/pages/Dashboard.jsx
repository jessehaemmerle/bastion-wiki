import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PageList from '../components/PageList.jsx';
import { ActivityBars } from '../components/Charts.jsx';
import { Spinner } from '../components/ui.jsx';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { PAGE_TYPES, shortWhen } from '../lib/format.js';
import { getLocale, tr, trn } from '../lib/i18n.js';
import { ExpiryList } from './Expiring.jsx';
import { api } from '../lib/api.js';

const EXAMPLES = ['type:runbook', 'type:host', 'space:infra', 'tag:linux'];

function ChangeLog({ pages }) {
  if (!pages?.length) return <p className="muted small">{tr('Noch keine Änderungen.')}</p>;
  return (
    <ul className="log">
      {pages.map((p) => (
        <li key={p.id}>
          <span className="when" title={new Date(p.updatedAt).toLocaleString(getLocale())}>{shortWhen(p.updatedAt)}</span>
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
  const [expiring, setExpiring] = useState([]);
  useEffect(() => { api.get('/expiring?days=30').then((d) => setExpiring(d.items)).catch(() => {}); }, []);
  useChrome([{ label: tr('Start') }]);

  if (loading && !data) return <Spinner center />;
  const s = data?.stats || {};
  const search = (term) => navigate(`/search?q=${encodeURIComponent(term)}`);

  return (
    <div className="content">
      <form className="start-search" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) search(q.trim()); }}>
        <h1>{tr('Wonach suchst du?')}</h1>
        <label className="big-search">
          <Icon name="search" size={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Hostname, IP-Adresse, Fehlermeldung, Runbook …')} aria-label={tr('Wiki durchsuchen')} />
          <button className="btn primary" type="submit">{tr('Suchen')}</button>
        </label>
        <div className="hints">
          <span>{tr('Filter:')}</span>
          {EXAMPLES.map((ex) => <button type="button" key={ex} onClick={() => setQ(`${ex} `)}>{ex}</button>)}
        </div>
      </form>

      <p className="summary-line">
        {tr('{p} Seiten in {s} Bereichen, {w} davon diese Woche geändert.', { p: s.pages ?? 0, s: spaces.length, w: s.updated_week ?? 0 })}
        {s.overdue > 0 && <> <Link to="/review">{tr(s.overdue === 1 ? '1 Seite muss geprüft werden.' : '{n} Seiten müssen geprüft werden.', { n: s.overdue })}</Link></>}
      </p>

      <div className="start-grid">
        <div>
          <section>
            <div className="section-h"><h2>{tr('Letzte Änderungen')}</h2></div>
            <ChangeLog pages={data?.recent} />
          </section>
          {data?.mine?.length > 0 && (
            <section>
              <div className="section-h"><h2>{tr('Von dir bearbeitet')}</h2></div>
              <ChangeLog pages={data.mine} />
            </section>
          )}
        </div>
        <div>
          {data?.runs?.length > 0 && (
            <section>
              <div className="section-h"><h2>{tr('Laufende Durchläufe')}</h2></div>
              <div className="run-list">
                {data.runs.map((r) => (
                  <Link key={r.id} to={`/runs/${r.id}`} className="run-row running">
                    <Icon name="play" size={15} />
                    <span className="grow ellipsis">{r.title}{r.reason && <span className="faint"> · {r.reason}</span>}</span>
                    <span className="mono small">{r.done}/{r.total}</span>
                    <span className="faint small">{r.startedBy}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {expiring.length > 0 && (
            <section>
              <div className="section-h"><h2>{tr('Fristen, 30 Tage')}</h2><Link to="/expiring">{tr('Alle')}</Link></div>
              <ExpiryList items={expiring.slice(0, 8)} compact />
            </section>
          )}
          {data?.pinned?.length > 0 && (
            <section>
              <div className="section-h"><h2>{tr('Angepinnt')}</h2></div>
              <PageList pages={data.pinned} />
            </section>
          )}
          <section>
            <div className="section-h"><h2>{tr('Zu prüfen')}</h2><Link to="/review">{tr('Alle')}</Link></div>
            <PageList pages={data?.reviewDue} showReview empty={tr('In den nächsten 7 Tagen ist kein Review fällig.')} />
          </section>
          <section>
            <div className="section-h"><h2>{tr('Favoriten')}</h2></div>
            <PageList pages={data?.favorites} empty={tr('Markiere Seiten mit dem Stern, um sie hier abzulegen.')} />
          </section>
          <section>
            <div className="section-h"><h2>{tr('Bereiche')}</h2><Link to="/spaces">{tr('Übersicht')}</Link></div>
            <table className="space-index">
              <tbody>
                {spaces.map((sp) => (
                  <tr key={sp.id}>
                    <td><span className="stripe" style={{ '--sc': sp.color }} /></td>
                    <td><Link to={`/s/${sp.key}`}>{sp.name}</Link><div className="small muted">{sp.description}</div></td>
                    <td className="small muted nowrap" style={{ textAlign: 'right' }}>{trn(sp.pageCount, '1 Seite', '{n} Seiten')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {user.role !== 'viewer' && <Link to="/spaces?new=1" className="btn sm" style={{ marginTop: 10 }}><Icon name="plus" size={14} /> {tr('Bereich anlegen')}</Link>}
          </section>
          <section>
            <div className="section-h"><h2>{tr('Änderungen, 30 Tage')}</h2></div>
            <ActivityBars activity={data?.activity} />
          </section>
        </div>
      </div>
    </div>
  );
}
