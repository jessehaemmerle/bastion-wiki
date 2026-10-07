import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { formatDate, timeAgo } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

const STATUS = {
  get pending() { return tr('wartet'); },
  get approved() { return tr('freigegeben'); },
  get rejected() { return tr('abgelehnt'); },
  get withdrawn() { return tr('zurückgezogen'); },
};

function Row({ r, mine }) {
  return (
    <li>
      <Link to={`/p/${r.pageId}`} className="list-item">
        <span className="li-icon"><Icon name="git-pull-request" /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="li-title">{r.pageTitle}</div>
          <div className="li-meta">
            <span className="row" style={{ gap: 6 }}><span className="cable" style={{ '--sc': r.spaceColor }} />{r.spaceName}</span>
            {!mine && <span>{tr('von {name}', { name: r.author })}</span>}
            {r.summary && <span>„{r.summary}“</span>}
            <span title={formatDate(r.updatedAt, true)}>{timeAgo(r.updatedAt)}</span>
            {r.reviewNote && <span>{tr('Anmerkung: {note}', { note: r.reviewNote })}</span>}
          </div>
        </div>
        <span className={`badge ${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : r.status === 'pending' ? 'warning' : ''}`}>{STATUS[r.status]}</span>
      </Link>
    </li>
  );
}

export default function Approvals() {
  const { data, error, loading } = useFetch('/approvals');
  useChrome([{ label: tr('Freigaben') }]);
  if (loading && !data) return <Spinner center />;
  if (error) return <div className="content narrow"><Empty icon="alert-triangle" title={tr('Fehler')}>{error.message}</Empty></div>;
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{tr('Freigaben')}</h1>
          <p>{tr('Änderungsvorschläge an freigabepflichtigen Seiten. Freigeben kann jede andere Person mit Schreibrecht – oder die festgelegte Gruppe.')}</p>
        </div>
      </div>
      <div className="section-title"><h3>{tr('Wartet auf dich')}</h3></div>
      {!data.toReview.length ? <Empty icon="badge-check" title={tr('Nichts zu prüfen')} /> : <ul className="list">{data.toReview.map((r) => <Row key={r.id} r={r} />)}</ul>}
      <div className="section-title"><h3>{tr('Deine Vorschläge')}</h3></div>
      {!data.mine.length ? <p className="faint small">{tr('Keine offenen oder kürzlich entschiedenen Vorschläge.')}</p> : <ul className="list">{data.mine.map((r) => <Row key={r.id} r={r} mine />)}</ul>}
    </div>
  );
}
