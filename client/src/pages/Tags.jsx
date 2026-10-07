import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PageList from '../components/PageList.jsx';
import { Empty, Spinner, TagPill } from '../components/ui.jsx';
import { qs } from '../lib/api.js';
import { useChrome, useFetch } from '../lib/hooks.js';

export default function Tags() {
  const { data, loading } = useFetch('/tags');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('count');
  useChrome([{ label: 'Tags' }]);
  if (loading) return <Spinner center />;
  const tags = (data?.tags || [])
    .filter((t) => t.name.includes(filter.toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.count - a.count));
  const max = Math.max(1, ...tags.map((t) => t.count));
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <span className="eyebrow">Taxonomie</span>
          <h1>Tags</h1>
          <p>{data?.tags.length} Tags über alle Bereiche, die du sehen darfst.</p>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 20 }}>
        <div className="input-icon grow"><Icon name="filter" /><input className="input" placeholder="Tags filtern …" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
        <div className="segmented">
          <button className={sort === 'count' ? 'active' : ''} onClick={() => setSort('count')}>Häufigkeit</button>
          <button className={sort === 'name' ? 'active' : ''} onClick={() => setSort('name')}>A–Z</button>
        </div>
      </div>
      {tags.length === 0 ? <Empty icon="tags" title="Keine Tags">Tags vergibst du beim Bearbeiten einer Seite.</Empty> : (
        <div className="tag-cloud">
          {tags.map((t) => (
            <span key={t.id} style={{ fontSize: `${0.85 + (t.count / max) * 0.6}em` }}>
              <TagPill name={t.name} color={t.color} count={t.count} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function TagDetail() {
  const { name } = useParams();
  const tag = useFetch(`/tags/${encodeURIComponent(name)}`);
  const pages = useFetch(`/pages${qs({ tag: name, limit: 200 })}`);
  useChrome([{ label: 'Tags', to: '/tags' }, { label: `#${name}` }]);
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <span className="eyebrow">Tag</span>
          <h1 className="mono">#{name}</h1>
          <p>{pages.data?.pages.length ?? '…'} Seiten</p>
        </div>
        <Link className="btn" to={`/search?q=${encodeURIComponent(`tag:${name} `)}`}><Icon name="search" /> Innerhalb suchen</Link>
      </div>
      {tag.data?.related?.length > 0 && (
        <div className="row wrap" style={{ marginBottom: 18 }}>
          <span className="eyebrow plain">Verwandt:</span>
          {tag.data.related.map((t) => <TagPill key={t.name} name={t.name} color={t.color} count={t.count} />)}
        </div>
      )}
      <div className="card">{pages.loading ? <Spinner /> : <PageList pages={pages.data?.pages} />}</div>
    </div>
  );
}
