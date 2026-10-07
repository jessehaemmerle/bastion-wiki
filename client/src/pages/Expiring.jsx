import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { formatDate, PAGE_TYPES } from '../lib/format.js';
import { tr, trn } from '../lib/i18n.js';

/** Remaining time as a short, sortable label */
export function DaysLeft({ days, lead, review = false }) {
  const cls = days < 0 ? 'danger' : days <= lead ? 'warning' : '';
  const text = days < 0 && review ? trn(-days, 'seit 1 Tag überfällig', 'seit {n} Tagen überfällig')
    : days < 0 ? trn(-days, 'seit 1 Tag abgelaufen', 'seit {n} Tagen abgelaufen') : days === 0 ? tr('heute') : trn(days, 'in 1 Tag', 'in {n} Tagen');
  return <span className={`badge ${cls}`}>{text}</span>;
}

export function ExpiryList({ items, compact = false }) {
  return (
    <div className={compact ? 'expiry-list compact' : 'card table-wrap'}>
      <table className="data">
        {!compact && <thead><tr><th>{tr('Seite')}</th><th>{tr('Feld')}</th><th>{tr('Datum')}</th><th>{tr('Restzeit')}</th></tr></thead>}
        <tbody>
          {items.map((it) => (
            <tr key={`${it.pageId}-${it.kind}-${it.field}`} className={it.daysLeft < 0 ? 'overdue' : ''}>
              <td>
                <Link to={`/p/${it.pageId}`} className="row" style={{ gap: 8, fontWeight: 700 }}>
                  <Icon name={PAGE_TYPES[it.pageType]?.icon || 'file-text'} size={15} /> <span className="ellipsis">{it.title}</span>
                </Link>
                {!compact && <div className="tiny faint row" style={{ gap: 6 }}><span className="cable" style={{ '--sc': it.spaceColor }} />{it.spaceName}</div>}
              </td>
              <td className="small">{it.kind === 'review' ? tr('Review fällig') : it.field}</td>
              {!compact && <td className="small mono">{formatDate(it.due)}</td>}
              <td className="nowrap"><DaysLeft days={it.daysLeft} lead={it.leadDays} review={it.kind === 'review'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const KINDS = [
  { key: 'all', get label() { return tr('Alle'); } },
  { key: 'dates', get label() { return tr('Ablaufdaten'); } },
  { key: 'review', get label() { return tr('Reviews'); } },
];

export default function Expiring() {
  const [days, setDays] = useState(90);
  const [kind, setKind] = useState('all');
  const { data, error, loading, reload } = useFetch(`/expiring?days=${days}`);
  useChrome([{ label: tr('Fristen') }]);
  const all = data?.items || [];
  const items = all.filter((i) => kind === 'all' || (kind === 'review' ? i.kind === 'review' : i.kind !== 'review'));
  const count = (k) => all.filter((i) => k === 'all' || (k === 'review' ? i.kind === 'review' : i.kind !== 'review')).length;
  const overdue = items.filter((i) => i.daysLeft < 0).length;
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{tr('Fristen')}</h1>
          <p>{tr('Ablaufdaten aus Datenblättern (Zertifikate, Lizenzen, Verträge, Garantien) und fällige Reviews. Abgelaufenes steht immer oben.')}</p>
        </div>
        <div className="segmented" role="group" aria-label={tr('Zeitraum')}>
          {[30, 90, 365].map((d) => <button key={d} type="button" className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{trn(d, '1 Tag', '{n} Tage')}</button>)}
        </div>
      </div>
      {all.length > 0 && (
        <div className="segmented" role="group" aria-label={tr('Art')} style={{ marginBottom: 14 }}>
          {KINDS.map((k) => (
            <button key={k.key} type="button" className={kind === k.key ? 'active' : ''} onClick={() => setKind(k.key)}>
              {k.label} <span className="faint mono">{count(k.key)}</span>
            </button>
          ))}
        </div>
      )}
      {loading && !data ? <Spinner /> : error ? (
        <Empty icon="alert-triangle" title={tr('Fristen konnten nicht geladen werden')}>
          {error.message} <button type="button" className="btn sm" onClick={reload}>{tr('Erneut versuchen')}</button>
        </Empty>
      ) : !items.length ? (
        <Empty icon="calendar-clock" title={tr('Nichts läuft in diesem Zeitraum ab')}>
          {tr('Erfasst werden Datumsfelder mit „Ablauf überwachen“ im Datenblatt-Schema, freie Datenblattfelder wie „Gültig bis“, „Garantie bis“ oder „Laufzeit bis“ sowie Review-Termine von Seiten.')}
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
