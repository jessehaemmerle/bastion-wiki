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
      <h4>Inhalt</h4>
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
      toast('Seite verschoben');
      onMoved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title="Seite verschieben" icon="move" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" disabled={!tree} onClick={move}>Verschieben</button></>}>
      <div className="field">
        <label>Bereich</label>
        <select className="select" value={spaceKey} onChange={(e) => { setSpaceKey(e.target.value); setParentId(''); }}>
          {writable.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Übergeordnete Seite</label>
        <select className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">— Oberste Ebene —</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <span className="hint">Unterseiten werden mit verschoben.</span>
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

  const toggleTask = useCallback(async (index, checked) => {
    if (!page) return;
    const doc = new DOMParser().parseFromString(page.content, 'text/html');
    const li = doc.querySelectorAll('ul[data-type="taskList"] > li')[index];
    if (!li) return;
    li.setAttribute('data-checked', String(checked));
    const content = doc.body.innerHTML;
    try {
      const res = await api.put(`/pages/${page.id}`, { content, baseVersion: page.version, summary: 'Checkliste aktualisiert' });
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
  const toggleFavorite = () => act(async () => {
    const { isFavorite } = await api.post(`/pages/${page.id}/favorite`);
    setData((d) => ({ page: { ...d.page, isFavorite } }));
  });
  const togglePin = () => act(async () => {
    await api.put(`/pages/${page.id}`, { isPinned: !page.isPinned });
    setData((d) => ({ page: { ...d.page, isPinned: !d.page.isPinned } }));
  }, page.isPinned ? 'Nicht mehr angepinnt' : 'Seite angepinnt');
  const markReviewed = () => act(async () => {
    const { reviewDue } = await api.post(`/pages/${page.id}/reviewed`, { days: settings.reviewIntervalDays || 180 });
    setData((d) => ({ page: { ...d.page, reviewDue } }));
    refreshTree();
  }, 'Als geprüft markiert');
  const duplicate = () => act(async () => {
    const res = await api.post(`/pages/${page.id}/duplicate`);
    refreshTree();
    navigate(`/p/${res.page.id}/edit`);
  }, 'Kopie erstellt');
  const upload = async (files) => act(async () => {
    await api.upload(`/pages/${page.id}/attachments`, files);
    reload();
  }, 'Datei hochgeladen');
  const deleteAttachment = (a) => act(async () => {
    await api.del(`/attachments/${a.id}`);
    setData((d) => ({ page: { ...d.page, attachments: d.page.attachments.filter((x) => x.id !== a.id) } }));
  }, 'Datei gelöscht');

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
              {canWrite && <Link to={`/p/${page.id}/edit`} className="btn primary sm" title="Bearbeiten (E)"><Icon name="pen" size={14} /> Bearbeiten</Link>}
              <button className={`btn sm icon ${page.isFavorite ? 'active' : ''}`} onClick={toggleFavorite} title={page.isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren'}>
                <Icon name="star" size={15} fill={page.isFavorite ? 'currentColor' : 'none'} />
              </button>
              <Dropdown trigger={({ toggle }) => <button className="btn sm icon" onClick={toggle} aria-label="Weitere Aktionen"><Icon name="more" size={15} /></button>}>
                <MenuItem icon="history" to={`/p/${page.id}/history`}>Versionsverlauf</MenuItem>
                <MenuItem icon="link" onClick={() => { copy(`${location.origin}/p/${page.id}`); toast('Link kopiert'); }}>Link kopieren</MenuItem>
                {canWrite && <MenuItem icon={page.isPinned ? 'pin-off' : 'pin'} onClick={togglePin}>{page.isPinned ? 'Nicht mehr anpinnen' : 'Anpinnen'}</MenuItem>}
                {canWrite && <MenuItem icon="plus" to={`/new?space=${page.space.key}&parent=${page.id}`}>Unterseite anlegen</MenuItem>}
                {canWrite && <MenuItem icon="copy" onClick={duplicate}>Duplizieren</MenuItem>}
                {canWrite && <MenuItem icon="move" onClick={() => setModal('move')}>Verschieben</MenuItem>}
                {canWrite && <MenuItem icon="paperclip" onClick={() => uploadRef.current?.click()}>Datei anhängen</MenuItem>}
                <div className="menu-sep" />
                <MenuItem icon="download" href={`/api/pages/${page.id}/export?format=md`}>Als Markdown exportieren</MenuItem>
                <MenuItem icon="file-code" href={`/api/pages/${page.id}/export?format=html`}>Als HTML exportieren</MenuItem>
                <MenuItem icon="printer" onClick={() => window.print()}>Drucken / PDF</MenuItem>
                {canWrite && <><div className="menu-sep" /><MenuItem icon="trash" danger onClick={() => setModal('delete')}>Löschen</MenuItem></>}
              </Dropdown>
            </div>
          </div>

          <h1 className="page-title">
            {page.icon && <PageIcon icon={page.icon} size={34} />}
            <span>{page.title}</span>
          </h1>
          <div className="page-meta-line">
            <span title={formatDate(page.updatedAt, true)}>Geändert {timeAgo(page.updatedAt)}{page.updatedBy ? ` von ${page.updatedBy}` : ''}</span>
            <Link to={`/p/${page.id}/history`}>Version <span className="mono">{page.version}</span></Link>
            <span>{readMin} Min. Lesezeit</span>
            {page.isPinned && <span><Icon name="pin" size={13} /> Angepinnt</span>}
            {page.reviewDue && !overdue && <span>Nächstes Review {formatDate(page.reviewDue)}</span>}
          </div>
          {page.tags.length > 0 && <div className="page-tags">{page.tags.map((t) => <TagPill key={t.name} name={t.name} color={t.color} />)}</div>}

          {overdue && (
            <div className="review-banner">
              <Icon name="calendar-clock" size={18} />
              <div className="grow">
                <strong>Review seit {formatDate(page.reviewDue)} überfällig.</strong> Prüfe, ob der Inhalt noch stimmt, und bestätige es.
              </div>
              {canWrite && <button className="btn sm" onClick={markReviewed}><Icon name="check" size={14} /> Als geprüft markieren</button>}
            </div>
          )}

          {props.length > 0 && (
            <section className="spec" aria-label="Eigenschaften">
              <div className="spec-head">
                <span>Datenblatt</span>
              </div>
              <div className="spec-grid">
                {props.map(([k, v]) => (
                  <div className="spec-item" key={k}>
                    <div className="k">{k}</div>
                    <div className="v">
                      <PropValue value={v} />
                      {v && (
                        <button onClick={() => copy(v, k)} title="Kopieren" aria-label={`${k} kopieren`}>
                          <Icon name={copied === k ? 'check' : 'copy'} size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <ContentView html={page.content} onHeadings={onHeadings} onToggleTask={canWrite ? toggleTask : undefined} />
          {!page.content?.replace(/<[^>]+>/g, '').trim() && !page.content?.includes('<img') && (
            <div className="faint" style={{ padding: '20px 0' }}>Diese Seite hat noch keinen Inhalt. {canWrite && <Link to={`/p/${page.id}/edit`}>Seite bearbeiten</Link>}</div>
          )}

          {page.children.length > 0 && (
            <>
              <div className="section-title"><h3>Unterseiten</h3></div>
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
                <h3>Anhänge</h3>
                {canWrite && <button className="btn sm ghost" onClick={() => uploadRef.current?.click()}><Icon name="upload" size={14} /> Hochladen</button>}
              </div>
              <div className="attachments">
                {page.attachments.map((a) => (
                  <div className="attachment" key={a.id}>
                    <Icon name={a.mimeType.startsWith('image/') ? 'file' : 'paperclip'} size={15} />
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="grow ellipsis">{a.filename}</a>
                    <span className="faint tiny mono">{formatBytes(a.size)}</span>
                    <span className="faint tiny desktop-only">{a.uploadedBy}, {timeAgo(a.createdAt)}</span>
                    <a className="btn ghost icon sm" href={`/api/attachments/${a.id}?download`} aria-label="Herunterladen"><Icon name="download" size={14} /></a>
                    {canWrite && <button className="btn ghost icon sm" onClick={() => deleteAttachment(a)} aria-label="Löschen"><Icon name="trash" size={14} /></button>}
                  </div>
                ))}
                {!page.attachments.length && <div className="faint small">Keine Dateien angehängt.</div>}
              </div>
            </>
          )}
          <input ref={uploadRef} type="file" multiple hidden onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
        </article>

        <aside className="aside toc-aside">
          <Toc headings={headings} />
          <div>
            <h4>Über diese Seite</h4>
            <dl className="facts">
              <dt>Erstellt</dt><dd>{formatDate(page.createdAt)}</dd>
              <dt>von</dt><dd>{page.createdBy || 'unbekannt'}</dd>
              <dt>Wörter</dt><dd>{page.wordCount}</dd>
              <dt>Seiten-ID</dt><dd className="mono">{page.id}</dd>
            </dl>
          </div>
        </aside>
      </div>

      {modal === 'move' && <MoveModal page={page} onClose={() => setModal(null)} onMoved={() => { refreshTree(); reload(); }} />}
      {modal === 'delete' && (
        <Confirm
          danger
          title="Seite löschen?"
          message={<>„{page.title}“ wird mit allen Versionen und Anhängen gelöscht. {page.children.length > 0 && 'Unterseiten werden eine Ebene nach oben verschoben.'}</>}
          confirmLabel="Löschen"
          onClose={() => setModal(null)}
          onConfirm={() => act(async () => {
            await api.del(`/pages/${page.id}`);
            refreshTree();
            navigate(page.parentId ? `/p/${page.parentId}` : `/s/${page.space.key}`);
          }, 'Seite gelöscht')}
        />
      )}
    </div>
  );
}
