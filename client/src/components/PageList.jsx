import { Link } from 'react-router-dom';
import { PageIcon } from './Icon.jsx';
import { PAGE_TYPES, timeAgo, formatDate } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

export default function PageList({ pages, showSpace = true, showReview = false, empty = tr('Keine Seiten.') }) {
  if (!pages?.length) return <p className="muted small" style={{ margin: '8px 0' }}>{empty}</p>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ul className="list">
      {pages.map((p) => (
        <li key={p.id}>
          <Link to={`/p/${p.id}`} className="list-item">
            <span className="li-icon"><PageIcon icon={p.icon} fallback={PAGE_TYPES[p.pageType]?.icon} /></span>
            <div className="grow">
              <div className="li-title">{p.title}</div>
              <div className="li-meta">
                {showSpace && <span className="row" style={{ gap: 5 }}><span className="cable" style={{ '--sc': p.spaceColor }} />{p.spaceName}</span>}
                {showReview && p.reviewDue ? (
                  <span style={{ color: p.reviewDue < today ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 700 }}>
                    {tr(p.reviewDue < today ? 'Überfällig seit {date}' : 'Fällig am {date}', { date: formatDate(p.reviewDue) })}
                  </span>
                ) : (
                  <span>{timeAgo(p.updatedAt)}</span>
                )}
              </div>
            </div>
            {p.pageType !== 'doc' && <span className="tape desktop-only">{PAGE_TYPES[p.pageType]?.label}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
