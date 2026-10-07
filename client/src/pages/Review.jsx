import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import PageList from '../components/PageList.jsx';
import { Spinner } from '../components/ui.jsx';
import { qs } from '../lib/api.js';
import { useChrome, useFetch } from '../lib/hooks.js';

export default function Review() {
  const [scope, setScope] = useState('overdue');
  const { data, loading } = useFetch(`/pages${qs({ review: scope, sort: 'review', limit: 200 })}`);
  useChrome([{ label: 'Review fällig' }]);
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <span className="eyebrow">Dokumentations-Hygiene</span>
          <h1>Reviews</h1>
          <p>Veraltete Doku ist gefährlicher als keine. Hier siehst du Seiten, deren Review-Termin erreicht ist.</p>
        </div>
      </div>
      <div className="segmented" style={{ marginBottom: 16 }}>
        <button className={scope === 'overdue' ? 'active' : ''} onClick={() => setScope('overdue')}><Icon name="alert-triangle" size={14} /> Überfällig</button>
        <button className={scope === 'soon' ? 'active' : ''} onClick={() => setScope('soon')}><Icon name="calendar-clock" size={14} /> Nächste 30 Tage</button>
      </div>
      <div className="card">{loading ? <Spinner /> : <PageList pages={data?.pages} showReview empty="Nichts zu tun – alles aktuell. 🎉" />}</div>
    </div>
  );
}
