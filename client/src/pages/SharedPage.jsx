import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Icon, { PageIcon } from '../components/Icon.jsx';
import ContentView from '../components/ContentView.jsx';
import Variables from '../components/Variables.jsx';
import { Spinner, TagPill } from '../components/ui.jsx';
import { Logo } from '../components/Layout.jsx';
import { api } from '../lib/api.js';
import { formatBytes, formatDate, PAGE_TYPES } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

/** Read-only view for share links – no account, no navigation into the wiki */
export default function SharedPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [varNames, setVarNames] = useState([]);
  const [vars, setVars] = useState({});
  const onVariables = useCallback((n) => setVarNames((o) => (o.join('|') === n.join('|') ? o : n)), []);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.append(meta);
    api.get(`/public/share/${encodeURIComponent(token)}`).then((d) => {
      setData(d);
      document.title = `${d.page.title} – ${d.siteName}`;
    }).catch(setError);
    return () => meta.remove();
  }, [token]);

  if (error) {
    return (
      <main className="shared-page">
        <div className="shared-error">
          <Logo size={34} />
          <h1>{tr('Link nicht verfügbar')}</h1>
          <p className="muted">{tr('Der Freigabelink ist abgelaufen, wurde widerrufen oder ist falsch. Bitte bei der Person nachfragen, die ihn geschickt hat.')}</p>
        </div>
      </main>
    );
  }
  if (!data) return <Spinner center />;
  const { page } = data;
  const props = Object.entries(page.properties || {});
  return (
    <main className="shared-page">
      <header className="shared-head">
        <span className="row" style={{ gap: 8 }}><Logo size={22} /> <strong>{data.siteName}</strong></span>
        <span className="tape">{tr('Freigegebene Seite · nur lesen')}</span>
      </header>
      <article className="shared-body">
        <div className="page-kicker">
          {page.pageType !== 'doc' && <span className="tape lg">{PAGE_TYPES[page.pageType]?.label}</span>}
          <span className="small muted">{page.spaceName}</span>
        </div>
        <h1 className="page-title">{page.icon && <PageIcon icon={page.icon} size={34} />}<span>{page.title}</span></h1>
        <div className="page-meta-line">
          <span>{tr('Stand {date}', { date: formatDate(page.updatedAt, true) })}</span>
          <span>{tr('Link gültig bis {date}', { date: formatDate(data.expiresAt, true) })}</span>
        </div>
        {page.tags.length > 0 && <div className="page-tags">{page.tags.map((t) => <TagPill key={t.name} name={t.name} color={t.color} link={false} />)}</div>}
        {props.length > 0 && (
          <section className="spec" aria-label={tr('Eigenschaften')}>
            <div className="spec-head"><span>{tr('Datenblatt')}</span></div>
            <div className="spec-grid">
              {props.map(([k, v]) => <div className="spec-item" key={k}><div className="k">{k}</div><div className="v">{v || '—'}</div></div>)}
            </div>
          </section>
        )}
        <Variables names={varNames} pageId={`share-${token.slice(0, 12)}`} properties={page.properties} value={vars} onChange={setVars} />
        <ContentView html={page.content} secretMode="hidden" onVariables={onVariables} variables={vars} />
        {page.attachments.length > 0 && (
          <>
            <div className="section-title"><h3>{tr('Anhänge')}</h3></div>
            <div className="attachments">
              {page.attachments.map((a) => (
                <div className="attachment" key={a.id}>
                  <Icon name="paperclip" size={15} />
                  <a href={a.url} target="_blank" rel="noreferrer" className="grow ellipsis">{a.filename}</a>
                  <span className="faint tiny mono">{formatBytes(a.size)}</span>
                  <a className="btn ghost icon sm" href={`${a.url}?download`} aria-label={tr('Herunterladen')}><Icon name="download" size={14} /></a>
                </div>
              ))}
            </div>
          </>
        )}
      </article>
    </main>
  );
}
