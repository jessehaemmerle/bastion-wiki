import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon, { PageIcon } from '../components/Icon.jsx';
import ContentView from '../components/ContentView.jsx';
import { Confirm, Dropdown, MenuItem, Modal, Spinner, TagPill, useCopy } from '../components/ui.jsx';
import NotFound from './NotFound.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { formatBytes, formatDate, PAGE_TYPES, timeAgo } from '../lib/format.js';
import { buildTree } from '../components/PageTree.jsx';
import { tr } from '../lib/i18n.js';
import Variables from '../components/Variables.jsx';
import { EditorsBanner, References, RunsSection, ShareModal, StartRunModal } from '../components/PageExtras.jsx';

function PropValue({ value }) {
  if (/^https?:\/\/\S+$/.test(value)) return <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>;
  return <span>{value || '—'}</span>;
}

function Toc({ headings }) {
  const [active, setActive] = useState(null);
  useEffect(() => {
    if (!headings.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-70px 0px -70% 0px' },
    );
    headings.forEach((h) => { const el = document.getElementById(h.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [headings]);
  if (!headings.length) return null;
  return (
    <div>
      <h4>{tr('Inhalt')}</h4>
      <ul className="toc">
        {headings.map((h) => (
          <li key={h.id} className={`l${h.level}`}>
            <a href={`#${h.id}`} className={active === h.id ? 'active' : ''} onClick={(e) => {
              e.preventDefault();
              document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              history.replaceState(null, '', `#${h.id}`);
            }}>{h.text}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoveModal({ page, onClose, onMoved }) {
  const { spaces, toast } = useApp();
  const [spaceKey, setSpaceKey] = useState(page.space.key);
  const [parentId, setParentId] = useState(page.parentId || '');
  const [tree, setTree] = useState(null);
  useEffect(() => {
    api.get(`/spaces/${spaceKey}`).then(setTree).catch(() => setTree(null));
  }, [spaceKey]);
  const options = [];
  if (tree) {
    const { roots } = buildTree(tree.pages);
    const walk = (nodes, depth) => nodes.forEach((n) => {
      if (n.id === page.id) return; // skip self + subtree
      options.push({ id: n.id, label: `${'— '.repeat(depth)}${n.title}` });
      walk(n.children, depth + 1);
    });
    walk(roots, 0);
  }
  const writable = spaces.filter((s) => ['write', 'admin'].includes(s.access));
  const move = async () => {
    try {
      await api.post(`/pages/${page.id}/move`, { spaceId: tree.space.id, parentId: parentId ? Number(parentId) : null });
      toast(tr('Seite verschoben'));
      onMoved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={tr('Seite verschieben')} icon="move" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={!tree} onClick={move}>{tr('Verschieben')}</button></>}>
      <div className="field">
        <label>{tr('Bereich')}</label>
        <select className="select" value={spaceKey} onChange={(e) => { setSpaceKey(e.target.value); setParentId(''); }}>
          {writable.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>{tr('Übergeordnete Seite')}</label>
        <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{tr('— Oberste Ebene —')}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <span className="hint">{tr('Unterseiten werden mit verschoben.')}</span>
      </div>
    </Modal>
  );
}

export default function PageView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast, refreshTree, settings } = useApp();
  const { data, error, loading, setData, reload } = useFetch(`/pages/${id}`);
  const [headings, setHeadings] = useState([]);
  const [varNames, setVarNames] = useState([]);
  const [vars, setVars] = useState({});
  const [modal, setModal] = useState(null);
  const [copied, copy] = useCopy();
  const uploadRef = useRef(null);
  const page = data?.page;
  const canWrite = page && ['write', 'admin'].includes(page.access);

  useChrome(
    page
      ? [{ label: page.space.name, to: `/s/${page.space.key}` }, ...page.breadcrumbs.map((b) => ({ label: b.title, to: `/p/${b.id}` })), { label: page.title }]
      : [{ label: '…' }],
    page?.space.key ?? null,
    page?.id ?? null,
  );

  useEffect(() => {
    if (page) document.title = `${page.title} – ${settings.siteName || 'Bastion'}`;
  }, [page, settings.siteName]);

  // "e" to edit
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'e' && canWrite && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        navigate(`/p/${id}/edit`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canWrite, id, navigate]);

  // scroll to hash after render
  useEffect(() => {
    if (page && location.hash) setTimeout(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(), 50);
  }, [page]);

  const onHeadings = useCallback((h) => setHeadings(h), []);
  const onVariables = useCallback((names) => setVarNames((old) => (old.join('|') === names.join('|') ? old : names)), []);

  const toggleTask = useCallback(async (index, checked) => {
    if (!page) return;
    const doc = new DOMParser().parseFromString(page.content, 'text/html');
    const li = doc.querySelectorAll('ul[data-type="taskList"] > li')[index];
    if (!li) return;
    li.setAttribute('data-checked', String(checked));
    const content = doc.body.innerHTML;
    try {
      const res = await api.put(`/pages/${page.id}`, { content, baseVersion: page.version, summary: tr('Checkliste aktualisiert') });
      setData((d) => ({ page: { ...d.page, content, version: res.page.version, updatedAt: res.page.updatedAt } }));
    } catch (e) {
      toast(e.message, 'error');
      reload();
    }
  }, [page, setData, toast, reload]);

  if (loading && !data) return <Spinner center />;
  if (error) return <NotFound message={error.message} />;

  const type = PAGE_TYPES[page.pageType] || PAGE_TYPES.doc;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = page.reviewDue && page.reviewDue < today;
  const props = Object.entries(page.properties || {});
  const readMin = Math.max(1, Math.round(page.wordCount / 200));

  const act = async (fn, msg) => {
    try { await fn(); if (msg) toast(msg); } catch (e) { toast(e.message, 'error'); }
  };
  const toggleWatch = () => act(async () => {
    const { watching } = await api.post(`/pages/${page.id}/watch`);
    setData((d) => ({ page: { ...d.page, watching: { ...d.page.watching, page: watching } } }));
    toast(watching ? tr('Du wirst über Änderungen benachrichtigt') : tr('Seite wird nicht mehr beobachtet'));
  });
  const runnable = ['runbook', 'checklist'].includes(page.pageType);
  const toggleFavorite = () => act(async () => {
    const { isFavorite } = await api.post(`/pages/${page.id}/favorite`);
    setData((d) => ({ page: { ...d.page, isFavorite } }));
  });
  const togglePin = () => act(async () => {
    await api.put(`/pages/${page.id}`, { isPinned: !page.isPinned });
    setData((d) => ({ page: { ...d.page, isPinned: !d.page.isPinned } }));
  }, page.isPinned ? tr('Nicht mehr angepinnt') : tr('Seite angepinnt'));
  const markReviewed = () => act(async () => {
    const { reviewDue } = await api.post(`/pages/${page.id}/reviewed`, { days: settings.reviewIntervalDays || 180 });
    setData((d) => ({ page: { ...d.page, reviewDue } }));
    refreshTree();
  }, tr('Als geprüft markiert'));
  const duplicate = () => act(async () => {
    const res = await api.post(`/pages/${page.id}/duplicate`);
    refreshTree();
    navigate(`/p/${res.page.id}/edit`);
  }, tr('Kopie erstellt'));
  const upload = async (files) => act(async () => {
    await api.upload(`/pages/${page.id}/attachments`, files);
    reload();
  }, tr('Datei hochgeladen'));
  const deleteAttachment = (a) => act(async () => {
    await api.del(`/attachments/${a.id}`);
    setData((d) => ({ page: { ...d.page, attachments: d.page.attachments.filter((x) => x.id !== a.id) } }));
  }, tr('Datei gelöscht'));

  return (
    <div className="content">
      <div className="page-layout">
        <article className="page-main">
          <div className="page-actions">
            <div className="page-kicker">
              {page.pageType !== 'doc' && <span className="tape lg">{type.label}</span>}
              <Link to={`/s/${page.space.key}`} className="row" style={{ gap: 6 }}><span className="cable" style={{ '--sc': page.space.color }} />{page.space.name}</Link>
            </div>
            <div className="page-toolbar">
              {canWrite && runnable && <button className="btn sm" onClick={() => setModal('run')}><Icon name="play" size={14} /> {tr('Ausführen')}</button>}
              {canWrite && <Link to={`/p/${page.id}/edit`} className="btn primary sm" title={tr('Bearbeiten (E)')}><Icon name="pen" size={14} /> {tr('Bearbeiten')}</Link>}
              <button className={`btn sm icon ${page.watching?.page ? 'active' : ''}`} onClick={toggleWatch}
                title={page.watching?.page ? tr('Nicht mehr beobachten') : page.watching?.space ? tr('Bereich wird beobachtet – Seite zusätzlich beobachten') : tr('Beobachten')}
                aria-pressed={Boolean(page.watching?.page)} aria-label={tr('Beobachten')}>
                <Icon name={page.watching?.page || page.watching?.space ? 'bell-ring' : 'bell'} size={15} />
              </button>
              <button className={`btn sm icon ${page.isFavorite ? 'active' : ''}`} onClick={toggleFavorite} title={page.isFavorite ? tr('Favorit entfernen') : tr('Als Favorit markieren')}>
                <Icon name="star" size={15} fill={page.isFavorite ? 'currentColor' : 'none'} />
              </button>
              <Dropdown trigger={({ toggle }) => <button className="btn sm icon" onClick={toggle} aria-label={tr('Weitere Aktionen')}><Icon name="more" size={15} /></button>}>
                <MenuItem icon="history" to={`/p/${page.id}/history`}>{tr('Versionsverlauf')}</MenuItem>
                <MenuItem icon="link" onClick={() => { copy(`${location.origin}/p/${page.id}`); toast(tr('Link kopiert')); }}>{tr('Link kopieren')}</MenuItem>
                {canWrite && <MenuItem icon={page.isPinned ? 'pin-off' : 'pin'} onClick={togglePin}>{page.isPinned ? tr('Nicht mehr anpinnen') : tr('Anpinnen')}</MenuItem>}
                {canWrite && <MenuItem icon="plus" to={`/new?space=${page.space.key}&parent=${page.id}`}>{tr('Unterseite anlegen')}</MenuItem>}
                {canWrite && <MenuItem icon="copy" onClick={duplicate}>{tr('Duplizieren')}</MenuItem>}
                {canWrite && <MenuItem icon="move" onClick={() => setModal('move')}>{tr('Verschieben')}</MenuItem>}
                {canWrite && <MenuItem icon="paperclip" onClick={() => uploadRef.current?.click()}>{tr('Datei anhängen')}</MenuItem>}
                {canWrite && !runnable && <MenuItem icon="play" onClick={() => setModal('run')}>{tr('Als Durchlauf ausführen')}</MenuItem>}
                {canWrite && settings.allowSharing !== false && <MenuItem icon="share" onClick={() => setModal('share')}>{tr('Freigabelink …')}</MenuItem>}
                <div className="menu-sep" />
                <MenuItem icon="download" href={`/api/pages/${page.id}/export?format=md`}>{tr('Als Markdown exportieren')}</MenuItem>
                <MenuItem icon="file-code" href={`/api/pages/${page.id}/export?format=html`}>{tr('Als HTML exportieren')}</MenuItem>
                <MenuItem icon="printer" onClick={() => window.print()}>{tr('Drucken / PDF')}</MenuItem>
                {canWrite && <><div className="menu-sep" /><MenuItem icon="trash" danger onClick={() => setModal('delete')}>{tr('Löschen')}</MenuItem></>}
              </Dropdown>
            </div>
          </div>

          <h1 className="page-title">
            {page.icon && <PageIcon icon={page.icon} size={34} />}
            <span>{page.title}</span>
          </h1>
          <div className="page-meta-line">
            <span title={formatDate(page.updatedAt, true)}>{page.updatedBy ? tr('Geändert {when} von {who}', { when: timeAgo(page.updatedAt), who: page.updatedBy }) : tr('Geändert {when}', { when: timeAgo(page.updatedAt) })}</span>
            <Link to={`/p/${page.id}/history`}>{tr('Version')} <span className="mono">{page.version}</span></Link>
            <span>{tr('{n} Min. Lesezeit', { n: readMin })}</span>
            {page.isPinned && <span><Icon name="pin" size={13} /> {tr('Angepinnt')}</span>}
            {page.reviewDue && !overdue && <span>{tr('Nächstes Review {date}', { date: formatDate(page.reviewDue) })}</span>}
          </div>
          <EditorsBanner editors={page.editors} />
          {page.runs?.running > 0 && (
            <div className="presence-banner run">
              <Icon name="play" size={16} />
              <span>{tr('Ein Durchlauf dieser Seite ist gerade offen.')}</span>
              <Link to={`/p/${page.id}#runs`} onClick={(e) => { e.preventDefault(); document.getElementById('runs')?.scrollIntoView({ behavior: 'smooth' }); }}>{tr('Anzeigen')}</Link>
            </div>
          )}
          {page.tags.length > 0 && <div className="page-tags">{page.tags.map((t) => <TagPill key={t.name} name={t.name} color={t.color} />)}</div>}

          {overdue && (
            <div className="review-banner">
              <Icon name="calendar-clock" size={18} />
              <div className="grow">
                <strong>{tr('Review seit {date} überfällig.', { date: formatDate(page.reviewDue) })}</strong> {tr('Prüfe, ob der Inhalt noch stimmt, und bestätige es.')}
              </div>
              {canWrite && <button className="btn sm" onClick={markReviewed}><Icon name="check" size={14} /> {tr('Als geprüft markieren')}</button>}
            </div>
          )}

          {props.length > 0 && (
            <section className="spec" aria-label={tr('Eigenschaften')}>
              <div className="spec-head">
                <span>{tr('Datenblatt')}</span>
              </div>
              <div className="spec-grid">
                {props.map(([k, v]) => (
                  <div className="spec-item" key={k}>
                    <div className="k">{k}</div>
                    <div className="v">
                      <PropValue value={v} />
                      {v && (
                        <button onClick={() => copy(v, k)} title={tr('Kopieren')} aria-label={`${k} kopieren`}>
                          <Icon name={copied === k ? 'check' : 'copy'} size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Variables names={varNames} pageId={page.id} properties={page.properties} value={vars} onChange={setVars} />
          <ContentView html={page.content} onHeadings={onHeadings} onToggleTask={canWrite ? toggleTask : undefined} onVariables={onVariables} variables={vars} />
          {!page.content?.replace(/<[^>]+>/g, '').trim() && !page.content?.includes('<img') && (
            <div className="faint" style={{ padding: '20px 0' }}>{tr('Diese Seite hat noch keinen Inhalt.')} {canWrite && <Link to={`/p/${page.id}/edit`}>{tr('Seite bearbeiten')}</Link>}</div>
          )}

          {page.children.length > 0 && (
            <>
              <div className="section-title"><h3>{tr('Unterseiten')}</h3></div>
              <div className="children-grid">
                {page.children.map((c) => (
                  <Link key={c.id} to={`/p/${c.id}`} className="child-card">
                    <PageIcon icon={c.icon} fallback={PAGE_TYPES[c.pageType]?.icon} /> <span className="ellipsis">{c.title}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {(page.attachments.length > 0 || canWrite) && (
            <>
              <div className="section-title">
                <h3>{tr('Anhänge')}</h3>
                {canWrite && <button className="btn sm ghost" onClick={() => uploadRef.current?.click()}><Icon name="upload" size={14} /> {tr('Hochladen')}</button>}
              </div>
              <div className="attachments">
                {page.attachments.map((a) => (
                  <div className="attachment" key={a.id}>
                    <Icon name={a.mimeType.startsWith('image/') ? 'file' : 'paperclip'} size={15} />
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="grow ellipsis">{a.filename}</a>
                    <span className="faint tiny mono">{formatBytes(a.size)}</span>
                    <span className="faint tiny desktop-only">{a.uploadedBy}, {timeAgo(a.createdAt)}</span>
                    <a className="btn ghost icon sm" href={`/api/attachments/${a.id}?download`} aria-label={tr('Herunterladen')}><Icon name="download" size={14} /></a>
                    {canWrite && <button className="btn ghost icon sm" onClick={() => deleteAttachment(a)} aria-label={tr('Löschen')}><Icon name="trash" size={14} /></button>}
                  </div>
                ))}
                {!page.attachments.length && <div className="faint small">{tr('Keine Dateien angehängt.')}</div>}
              </div>
            </>
          )}
          <div id="runs"><RunsSection page={page} canWrite={canWrite} onStart={() => setModal('run')} /></div>
          <References page={page} />
          <input ref={uploadRef} type="file" multiple hidden onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
        </article>

        <aside className="aside toc-aside">
          <Toc headings={headings} />
          <div>
            <h4>{tr('Über diese Seite')}</h4>
            <dl className="facts">
              <dt>{tr('Erstellt')}</dt><dd>{formatDate(page.createdAt)}</dd>
              <dt>{tr('von')}</dt><dd>{page.createdBy || tr('unbekannt')}</dd>
              <dt>{tr('Wörter')}</dt><dd>{page.wordCount}</dd>
              <dt>{tr('Seiten-ID')}</dt><dd className="mono">{page.id}</dd>
            </dl>
          </div>
        </aside>
      </div>

      {modal === 'run' && <StartRunModal page={page} onClose={() => setModal(null)} />}
      {modal === 'share' && <ShareModal page={page} onClose={() => setModal(null)} />}
      {modal === 'move' && <MoveModal page={page} onClose={() => setModal(null)} onMoved={() => { refreshTree(); reload(); }} />}
      {modal === 'delete' && (
        <Confirm
          danger
          title={tr('Seite löschen?')}
          message={<>{tr('„{title}“ wird mit allen Versionen und Anhängen gelöscht.', { title: page.title })} {page.children.length > 0 && tr('Unterseiten werden eine Ebene nach oben verschoben.')}</>}
          confirmLabel={tr('Löschen')}
          onClose={() => setModal(null)}
          onConfirm={() => act(async () => {
            await api.del(`/pages/${page.id}`);
            refreshTree();
            navigate(page.parentId ? `/p/${page.parentId}` : `/s/${page.space.key}`);
          }, tr('Seite gelöscht'))}
        />
      )}
    </div>
  );
}
