import { Link } from 'react-router-dom';
import { PageIcon } from './Icon.jsx';
import { PAGE_TYPES, timeAgo, formatDate } from '../lib/format.js';

export default function PageList({ pages, showSpace = true, showReview = false, empty = 'Keine Seiten.' }) {
  if (!pages?.length) return <div className="faint small" style={{ padding: '14px 18px' }}>{empty}</div>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ul className="list">
      {pages.map((p) => (
        <li key={p.id}>
          <Link to={`/p/${p.id}`} className="list-item" style={{ '--sc': p.spaceColor }}>
            <span className="li-icon"><PageIcon icon={p.icon} fallback={PAGE_TYPES[p.pageType]?.icon} /></span>
            <div className="grow">
              <div className="li-title">{p.title}</div>
              <div className="li-meta">
                {showSpace && <span>{p.spaceName}</span>}
                {showReview && p.reviewDue ? (
                  <span style={{ color: p.reviewDue < today ? 'var(--danger)' : 'var(--warning)' }}>
                    Review {p.reviewDue < today ? 'überfällig seit' : 'fällig am'} {formatDate(p.reviewDue)}
                  </span>
                ) : (
                  <span>{timeAgo(p.updatedAt)}{p.updatedBy ? ` · ${p.updatedBy}` : ''}</span>
                )}
              </div>
            </div>
            {p.pageType !== 'doc' && <span className="badge mono desktop-only">{PAGE_TYPES[p.pageType]?.label}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
