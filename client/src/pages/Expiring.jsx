import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { formatDate, PAGE_TYPES } from '../lib/format.js';
import { tr, trn } from '../lib/i18n.js';

/** Remaining time as a short, sortable label */
export function DaysLeft({ days, lead }) {
  const cls = days < 0 ? 'danger' : days <= lead ? 'warning' : '';
  const text = days < 0 ? trn(-days, 'seit 1 Tag abgelaufen', 'seit {n} Tagen abgelaufen') : days === 0 ? tr('heute') : trn(days, 'in 1 Tag', 'in {n} Tagen');
  return <span className={`badge ${cls}`}>{text}</span>;
}

export function ExpiryList({ items, compact = false }) {
  return (
    <div className={compact ? 'expiry-list compact' : 'card table-wrap'}>
      <table className="data">
        {!compact && <thead><tr><th>{tr('Seite')}</th><th>{tr('Feld')}</th><th>{tr('Datum')}</th><th>{tr('Restzeit')}</th></tr></thead>}
        <tbody>
          {items.map((it) => (
            <tr key={`${it.pageId}-${it.field}`} className={it.daysLeft < 0 ? 'overdue' : ''}>
              <td>
                <Link to={`/p/${it.pageId}`} className="row" style={{ gap: 8, fontWeight: 700 }}>
                  <Icon name={PAGE_TYPES[it.pageType]?.icon || 'file-text'} size={15} /> <span className="ellipsis">{it.title}</span>
                </Link>
                {!compact && <div className="tiny faint row" style={{ gap: 6 }}><span className="cable" style={{ '--sc': it.spaceColor }} />{it.spaceName}</div>}
              </td>
              <td className="small">{it.field}</td>
              {!compact && <td className="small mono">{formatDate(it.due)}</td>}
              <td className="nowrap"><DaysLeft days={it.daysLeft} lead={it.leadDays} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Expiring() {
  const [days, setDays] = useState(90);
  const { data, loading } = useFetch(`/expiring?days=${days}`);
  useChrome([{ label: tr('Fristen') }]);
  const items = data?.items || [];
  const overdue = items.filter((i) => i.daysLeft < 0).length;
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{tr('Fristen')}</h1>
          <p>{tr('Ablaufdaten aus Datenblättern: Zertifikate, Lizenzen, Verträge, Garantien. Erinnerungen gehen an alle, die die Seite beobachten oder bearbeitet haben.')}</p>
        </div>
        <div className="segmented" role="group" aria-label={tr('Zeitraum')}>
          {[30, 90, 365].map((d) => <button key={d} type="button" className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{trn(d, '1 Tag', '{n} Tage')}</button>)}
        </div>
      </div>
      {loading && !data ? <Spinner /> : !items.length ? (
        <Empty icon="calendar-clock" title={tr('Nichts läuft in diesem Zeitraum ab')}>
          {tr('Ablaufdaten kommen aus Datumsfeldern mit „Ablauf überwachen“ in einem Datenblatt-Schema (Administration → Datenblätter).')}
        </Empty>
      ) : (
        <>
          {overdue > 0 && <div className="review-banner"><Icon name="alert-triangle" size={18} /><strong>{trn(overdue, '1 Frist ist abgelaufen.', '{n} Fristen sind abgelaufen.')}</strong></div>}
          <ExpiryList items={items} />
        </>
      )}
    </div>
  );
}
