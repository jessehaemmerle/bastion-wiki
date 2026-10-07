import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon, { PageIcon } from '../components/Icon.jsx';
import { Empty, Snippet, Spinner, TagPill } from '../components/ui.jsx';
import { api, qs } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome } from '../lib/hooks.js';
import { PAGE_TYPES, timeAgo } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const { spaces } = useApp();
  const [q, setQ] = useState(params.get('q') || '');
  const [space, setSpace] = useState(params.get('space') || '');
  const [type, setType] = useState(params.get('type') || '');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  useChrome([{ label: tr('Suche') }]);

  useEffect(() => {
    const t = setTimeout(async () => {
      setParams(Object.fromEntries(Object.entries({ q, space, type }).filter(([, v]) => v)), { replace: true });
      if (!q.trim() && !space && !type) { setRes(null); return; }
      setLoading(true);
      try { setRes(await api.get(`/search${qs({ q, space, type, limit: 50 })}`)); } catch { setRes(null); }
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, space, type]);

  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{tr('Suche')}</h1>
          <p>{tr('Volltext über Titel, Inhalte und Eigenschaften (z. B. IP-Adressen oder Hostnamen). Filter:')} <code className="mono">tag:</code> <code className="mono">space:</code> <code className="mono">type:</code> <code className="mono">#tag</code> <code className="mono">"…"</code></p>
        </div>
      </div>
      <div className="search-hero">
        <div className="input-icon grow">
          <Icon name="search" size={18} />
          <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('z. B. nginx reload tag:runbook')} />
        </div>
      </div>
      <div className="filters">
        <select className="select sm" style={{ width: 'auto' }} value={space} onChange={(e) => setSpace(e.target.value)}>
          <option value="">{tr('Alle Bereiche')}</option>
          {spaces.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
        </select>
        <select className="select sm" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{tr('Alle Typen')}</option>
          {Object.entries(PAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {res && <span className="faint small" style={{ alignSelf: 'center', marginLeft: 'auto' }}>{tr('{n} Treffer in {ms} ms', { n: res.total, ms: res.tookMs })}</span>}
        {loading && <Spinner />}
      </div>

      {res?.tags?.length > 0 && (
        <div className="row wrap" style={{ marginBottom: 14 }}>
          <span className="eyebrow plain">{tr('Tags:')}</span>
          {res.tags.map((t) => <TagPill key={t.name} name={t.name} color={t.color} count={t.count} />)}
        </div>
      )}
      {res?.spaces?.length > 0 && (
        <div className="row wrap" style={{ marginBottom: 14 }}>
          <span className="eyebrow plain">{tr('Bereiche:')}</span>
          {res.spaces.map((s) => <Link key={s.id} to={`/s/${s.key}`} className="btn sm"><Icon name={s.icon} size={14} style={{ color: s.color }} /> {s.name}</Link>)}
        </div>
      )}

      {!res && !loading && <Empty icon="search" title={tr('Wonach suchst du?')}>{tr('Die Schnellsuche öffnest du überall mit Strg+K.')}</Empty>}
      {res && res.pages.length === 0 && !loading && <Empty icon="radar" title={tr('Keine Treffer')}>{tr('Versuche andere Begriffe oder entferne Filter.')}</Empty>}
      {res?.pages.map((p) => (
        <Link key={p.id} to={`/p/${p.id}`} className="result">
          <div className="row small faint">
            <PageIcon icon={p.icon} fallback={PAGE_TYPES[p.pageType]?.icon} size={14} />
            <span className="cable" style={{ '--sc': p.spaceColor }} /><span>{p.spaceName}</span>{p.pageType !== 'doc' && <span className="tape">{PAGE_TYPES[p.pageType]?.label}</span>}<span>geändert {timeAgo(p.updatedAt)}</span>
          </div>
          <h4>{p.title}</h4>
          {p.snippet && <Snippet text={p.snippet} className="small muted" />}
          {p.tags.length > 0 && <div className="row wrap" style={{ marginTop: 8, gap: 4 }}>{p.tags.map((t) => <TagPill key={t} name={t} link={false} />)}</div>}
        </Link>
      ))}
    </div>
  );
}
