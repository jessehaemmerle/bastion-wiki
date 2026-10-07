import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { formatDate, timeAgo } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

const ICON = { 'page.create': 'plus', 'page.update': 'pen', 'page.delete': 'trash', 'review.due': 'calendar-clock', 'run.finish': 'play' };

export function notificationText(n) {
  const v = { actor: n.data.actor || tr('Jemand'), title: n.title || n.data.title || '' };
  switch (n.kind) {
    case 'page.create': return tr('{actor} hat „{title}“ angelegt', v);
    case 'page.update': return n.data.count > 1
      ? tr('„{title}“ wurde {n}-mal geändert, zuletzt von {actor}', { ...v, n: n.data.count })
      : tr('{actor} hat „{title}“ geändert', v);
    case 'page.delete': return tr('{actor} hat „{title}“ gelöscht', v);
    case 'review.due': return tr('Review fällig: „{title}“', v);
    case 'run.finish': return n.data.status === 'aborted'
      ? tr('{actor} hat einen Durchlauf von „{title}“ abgebrochen', v)
      : tr('{actor} hat „{title}“ ausgeführt', v);
    default: return v.title;
  }
}

export default function Notifications() {
  const { setUnread, toast } = useApp();
  const navigate = useNavigate();
  const { data, loading, setData } = useFetch('/notifications?limit=100');
  useChrome([{ label: tr('Benachrichtigungen') }]);

  const markAll = async () => {
    try {
      await api.post('/notifications/read');
      setData((d) => ({ ...d, unread: 0, notifications: d.notifications.map((n) => ({ ...n, read: true })) }));
      setUnread(0);
    } catch (e) { toast(e.message, 'error'); }
  };
  const open = async (n) => {
    if (!n.read) {
      api.post('/notifications/read', { ids: [n.id] }).catch(() => {});
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.kind === 'run.finish' && n.data.runId) navigate(`/runs/${n.data.runId}`);
    else if (n.pageId) navigate(`/p/${n.pageId}`);
    else setData((d) => ({ ...d, notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)) }));
  };

  if (loading && !data) return <Spinner center />;
  const list = data?.notifications || [];
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{tr('Benachrichtigungen')}</h1>
          <p>{tr('Änderungen an Seiten und Bereichen, die du beobachtest, und fällige Reviews.')} <Link to="/settings/notifications">{tr('Einstellungen')}</Link></p>
        </div>
        {data?.unread > 0 && <button className="btn" onClick={markAll}><Icon name="check" size={15} /> {tr('Alle als gelesen markieren')}</button>}
      </div>
      {!list.length ? (
        <Empty icon="bell" title={tr('Keine Benachrichtigungen')}>
          {tr('Beobachte Seiten oder ganze Bereiche über das Glocken-Symbol, um hier über Änderungen informiert zu werden.')}
        </Empty>
      ) : (
        <ul className="inbox">
          {list.map((n) => (
            <li key={n.id}>
              <button type="button" className={`inbox-item ${n.read ? '' : 'unread'}`} onClick={() => open(n)}>
                <span className="inbox-icon"><Icon name={ICON[n.kind] || 'bell'} size={15} /></span>
                <span className="grow">
                  <span className="inbox-text">{notificationText(n)}</span>
                  <span className="inbox-meta">
                    {n.data.spaceName && <span>{n.data.spaceName}</span>}
                    {n.data.summary && <span>„{n.data.summary}“</span>}
                    <span title={formatDate(n.createdAt, true)}>{timeAgo(n.createdAt)}</span>
                  </span>
                </span>
                {!n.read && <span className="dot-unread" aria-label={tr('Ungelesen')} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
