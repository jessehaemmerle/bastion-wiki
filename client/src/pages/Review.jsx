import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import PageList from '../components/PageList.jsx';
import { Spinner } from '../components/ui.jsx';
import { qs } from '../lib/api.js';
import { useChrome, useFetch } from '../lib/hooks.js';
import { tr } from '../lib/i18n.js';

export default function Review() {
  const [scope, setScope] = useState('overdue');
  const { data, loading } = useFetch(`/pages${qs({ review: scope, sort: 'review', limit: 200 })}`);
  useChrome([{ label: tr('Review fällig') }]);
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{tr('Zu prüfen')}</h1>
          <p>{tr('Seiten, deren Review-Termin erreicht ist. Öffne sie, prüfe den Inhalt und markiere sie als geprüft.')}</p>
        </div>
      </div>
      <div className="segmented" style={{ marginBottom: 16 }}>
        <button className={scope === 'overdue' ? 'active' : ''} onClick={() => setScope('overdue')}><Icon name="alert-triangle" size={14} /> {tr('Überfällig')}</button>
        <button className={scope === 'soon' ? 'active' : ''} onClick={() => setScope('soon')}><Icon name="calendar-clock" size={14} /> {tr('Nächste 30 Tage')}</button>
      </div>
      <div className="card">{loading ? <Spinner /> : <PageList pages={data?.pages} showReview empty={tr('Keine Seite wartet auf ein Review.')} />}</div>
    </div>
  );
}
