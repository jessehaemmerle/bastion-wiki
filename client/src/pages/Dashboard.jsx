import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PageList from '../components/PageList.jsx';
import { Spinner } from '../components/ui.jsx';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { formatDate, timeAgo } from '../lib/format.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Nachtschicht';
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Guten Tag';
  if (h < 22) return 'Guten Abend';
  return 'Späte Schicht';
}

function ActivityBars({ activity }) {
  const days = [];
  const map = new Map((activity || []).map((a) => [a.day, a.edits]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ d, n: map.get(d) || 0 });
  }
  const max = Math.max(1, ...days.map((x) => x.n));
  return (
    <div className="sparkbars" aria-label="Bearbeitungen der letzten 30 Tage">
      {days.map((x) => (
        <span key={x.d} title={`${formatDate(x.d)}: ${x.n} Änderungen`} style={{ height: `${Math.max(6, (x.n / max) * 100)}%`, opacity: x.n ? 0.9 : 0.25 }} />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user, spaces, settings } = useApp();
  const { data, loading } = useFetch('/dashboard');
  useChrome([{ label: 'Dashboard' }]);

  if (loading && !data) return <Spinner center />;
  const s = data?.stats || {};
  const totalEdits = (data?.activity || []).reduce((a, b) => a + b.edits, 0);

  return (
    <div className="content">
      <section className="hero">
        <div className="terminal-line"><b>{user.username}@{(settings.siteName || 'bastion').toLowerCase()}</b>:~$ status --overview<span className="cursor" /></div>
        <h1>{greeting()}, {user.displayName.split(' ')[0]}.</h1>
        <p>
          {s.overdue
            ? `${s.overdue} ${s.overdue === 1 ? 'Seite wartet' : 'Seiten warten'} auf ein Review. `
            : 'Alle Reviews sind erledigt – die Doku ist frisch. '}
          {s.updated_week ? `${s.updated_week} Seiten wurden diese Woche aktualisiert.` : ''}
        </p>
        <div className="hero-actions">
          {user.role !== 'viewer' && <Link to="/new" className="btn primary"><Icon name="plus" /> Neue Seite</Link>}
          <Link to="/search" className="btn"><Icon name="search" /> Suchen</Link>
          {s.overdue > 0 && <Link to="/review" className="btn"><Icon name="calendar-clock" /> Reviews ansehen</Link>}
        </div>
      </section>

      <div className="stats">
        <div className="stat"><Icon name="files" className="stat-icon" /><span className="stat-value">{s.pages ?? 0}</span><span className="stat-label">Seiten</span></div>
        <div className="stat"><Icon name="grid" className="stat-icon" /><span className="stat-value">{spaces.length}</span><span className="stat-label">Bereiche</span></div>
        <div className="stat"><Icon name="tags" className="stat-icon" /><span className="stat-value">{s.tags ?? 0}</span><span className="stat-label">Tags</span></div>
        <div className={`stat ${s.overdue ? 'warn' : ''}`}><Icon name="calendar-clock" className="stat-icon" /><span className="stat-value">{s.overdue ?? 0}</span><span className="stat-label">Reviews überfällig</span></div>
        <div className="stat" style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <div className="row between"><span className="stat-label">Aktivität (30 Tage)</span><span className="mono tiny faint">{totalEdits} Änderungen</span></div>
          <ActivityBars activity={data?.activity} />
        </div>
      </div>

      <div className="grid-2">
        {data?.pinned?.length > 0 && (
          <div className="card">
            <div className="card-header"><h3 className="row"><Icon name="pin" /> Angepinnt</h3></div>
            <PageList pages={data.pinned} />
          </div>
        )}
        <div className="card">
          <div className="card-header"><h3 className="row"><Icon name="activity" /> Zuletzt geändert</h3><Link to="/search?q=&sort=updated" className="small">Alle</Link></div>
          <PageList pages={data?.recent} />
        </div>
        <div className="card">
          <div className="card-header"><h3 className="row"><Icon name="star" /> Favoriten</h3></div>
          <PageList pages={data?.favorites} empty="Markiere Seiten mit dem Stern, um sie hier zu sehen." />
        </div>
        <div className="card">
          <div className="card-header"><h3 className="row"><Icon name="calendar-clock" /> Review fällig</h3><Link to="/review" className="small">Alle</Link></div>
          <PageList pages={data?.reviewDue} showReview empty="Keine Reviews in den nächsten 7 Tagen. 🎉" />
        </div>
        {data?.mine?.length > 0 && (
          <div className="card">
            <div className="card-header"><h3 className="row"><Icon name="pen" /> Deine letzten Änderungen</h3></div>
            <PageList pages={data.mine} />
          </div>
        )}
      </div>

      <div className="section-title" style={{ marginTop: 32 }}>
        <span className="eyebrow">Bereiche</span>
        <Link to="/spaces" className="small">Alle Bereiche</Link>
      </div>
      <div className="grid-3">
        {spaces.slice(0, 8).map((sp) => (
          <Link key={sp.id} to={`/s/${sp.key}`} className="space-card" style={{ '--sc': sp.color }}>
            <span className="space-key">{sp.key}</span>
            <span className="space-chip"><Icon name={sp.icon} size={16} /></span>
            <h3>{sp.name}</h3>
            <p>{sp.description || 'Keine Beschreibung'}</p>
            <div className="space-meta"><span>{sp.pageCount} Seiten</span><span>{sp.updatedAt ? timeAgo(sp.updatedAt) : '—'}</span></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
