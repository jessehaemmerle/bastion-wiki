import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor from '../components/editor/Editor.jsx';
import Icon from '../components/Icon.jsx';
import { Spinner, TagPill } from '../components/ui.jsx';
import { PropertiesEditor, TagInput } from '../components/PageFields.jsx';
import NotFound from './NotFound.jsx';
import { buildTree } from '../components/PageTree.jsx';
import { api, qs } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome } from '../lib/hooks.js';
import { PAGE_TYPES, timeAgo } from '../lib/format.js';

const draftKey = (id) => `bastion.draft.${id || 'new'}`;

function TemplatePicker({ onPick }) {
  const [templates, setTemplates] = useState(null);
  useEffect(() => { api.get('/templates').then((d) => setTemplates(d.templates)).catch(() => setTemplates([])); }, []);
  if (!templates) return <Spinner center />;
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <span className="eyebrow">Neue Seite</span>
          <h1>Womit möchtest du starten?</h1>
          <p>Vorlagen liefern Struktur und passende Eigenschaften – ideal für einheitliche Ops-Dokumentation.</p>
        </div>
      </div>
      <div className="grid-3">
        <button className="space-card" style={{ '--sc': 'var(--text-faint)', textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => onPick(null)}>
          <span className="space-chip"><Icon name="file" size={16} /></span>
          <h3>Leere Seite</h3>
          <p>Ohne Vorgaben starten.</p>
        </button>
        {templates.map((t, i) => (
          <button key={t.id} className="space-card" style={{ '--sc': `hsl(${(i * 47 + 250) % 360} 70% 58%)`, textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => onPick(t)}>
            <span className="space-chip"><Icon name={t.icon} size={16} /></span>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
            <div className="space-meta"><span>{PAGE_TYPES[t.pageType]?.label || t.pageType}</span>{Object.keys(t.properties).length > 0 && <span>{Object.keys(t.properties).length} Eigenschaften</span>}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PageEdit({ isNew = false }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { spaces, toast, refreshTree, settings } = useApp();
  const [form, setForm] = useState(null);
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);
  const [templateChosen, setTemplateChosen] = useState(!isNew);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [tree, setTree] = useState(null);
  const [showMeta, setShowMeta] = useState(true);
  const formRef = useRef(form);
  formRef.current = form;

  const writable = spaces.filter((s) => ['write', 'admin'].includes(s.access));

  // initial load
  useEffect(() => {
    if (isNew) {
      const spaceKey = params.get('space') || writable[0]?.key || '';
      setForm({
        title: '', content: '', spaceKey, parentId: params.get('parent') ? Number(params.get('parent')) : null,
        pageType: 'doc', icon: '', tags: [], properties: {}, reviewDue: '', summary: '',
      });
      return;
    }
    api.get(`/pages/${id}`).then(({ page }) => {
      if (!['write', 'admin'].includes(page.access)) throw new Error('Keine Schreibrechte für diese Seite');
      setPage(page);
      setForm({
        title: page.title, content: page.content, spaceKey: page.space.key, parentId: page.parentId, pageType: page.pageType,
        icon: page.icon || '', tags: page.tags.map((t) => t.name), properties: page.properties || {}, reviewDue: page.reviewDue || '', summary: '',
      });
      setShowMeta(Object.keys(page.properties || {}).length > 0);
    }).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  // pick default space once spaces are loaded
  useEffect(() => {
    if (isNew && form && !form.spaceKey && writable[0]) setForm((f) => ({ ...f, spaceKey: writable[0].key }));
  }, [isNew, form, writable]);

  // parent options for the selected space
  useEffect(() => {
    if (!form?.spaceKey) return;
    api.get(`/spaces/${form.spaceKey}`).then(setTree).catch(() => setTree(null));
  }, [form?.spaceKey]);

  // offer a saved draft
  useEffect(() => {
    if (!form || draft !== null) return;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey(id)) || 'null');
      if (d && (!page || new Date(d.savedAt) > new Date(page.updatedAt)) && d.form.content !== form.content) setDraft(d);
      else setDraft(false);
    } catch { setDraft(false); }
  }, [form, page, id, draft]);

  // persist drafts + warn before leaving
  useEffect(() => {
    if (!dirty || !form) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey(id), JSON.stringify({ savedAt: new Date().toISOString(), form })); } catch { /* full */ }
    }, 800);
    return () => clearTimeout(t);
  }, [form, dirty, id]);
  useEffect(() => {
    const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const space = spaces.find((s) => s.key === form?.spaceKey);
  useChrome(
    isNew ? [{ label: space?.name || 'Neue Seite', to: space ? `/s/${space.key}` : undefined }, { label: 'Neue Seite' }]
      : [{ label: page?.space.name || '…', to: page ? `/s/${page.space.key}` : undefined }, { label: page?.title || '…', to: page ? `/p/${page.id}` : undefined }, { label: 'Bearbeiten' }],
    form?.spaceKey || null,
    page?.id || null,
  );

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const onContent = useCallback((html) => { setForm((f) => ({ ...f, content: html })); setDirty(true); }, []);

  const onUpload = useMemo(() => (isNew ? undefined : async (files) => {
    try {
      const { attachments } = await api.upload(`/pages/${id}/attachments`, files);
      return attachments;
    } catch (e) { toast(e.message, 'error'); return []; }
  }), [isNew, id, toast]);

  const save = useCallback(async () => {
    const f = formRef.current;
    if (!f.title.trim()) { toast('Bitte einen Titel angeben', 'error'); return; }
    const sp = spaces.find((s) => s.key === f.spaceKey);
    if (isNew && !sp) { toast('Bitte einen Bereich wählen', 'error'); return; }
    setSaving(true);
    const body = {
      title: f.title, content: f.content, pageType: f.pageType, icon: f.icon || null, tags: f.tags,
      properties: f.properties, reviewDue: f.reviewDue || null, summary: f.summary, parentId: f.parentId || null,
    };
    try {
      const res = isNew
        ? await api.post('/pages', { ...body, spaceId: sp.id })
        : await api.put(`/pages/${id}`, { ...body, baseVersion: page.version });
      localStorage.removeItem(draftKey(id));
      setDirty(false);
      toast(isNew ? 'Seite erstellt' : 'Gespeichert');
      refreshTree();
      navigate(`/p/${res.page.id}`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }, [isNew, id, page, spaces, toast, refreshTree, navigate]);

  const pickTemplate = (t) => {
    if (t) {
      const reviewDue = settings.reviewIntervalDays && ['runbook', 'host', 'service', 'network'].includes(t.pageType)
        ? new Date(Date.now() + settings.reviewIntervalDays * 864e5).toISOString().slice(0, 10) : '';
      setForm((f) => ({ ...f, content: t.content, pageType: t.pageType, properties: { ...t.properties }, tags: [...new Set([...f.tags, ...t.tags])], reviewDue }));
      setShowMeta(Object.keys(t.properties).length > 0);
    }
    setTemplateChosen(true);
    setEditorKey((k) => k + 1);
  };

  if (error) return <NotFound message={error.message} />;
  if (!form) return <Spinner center />;
  if (isNew && !writable.length) return <NotFound message="Du hast in keinem Bereich Schreibrechte." />;
  if (!templateChosen) return <TemplatePicker onPick={pickTemplate} />;

  const parentOptions = [];
  if (tree) {
    const walk = (nodes, depth) => nodes.forEach((n) => {
      if (page && n.id === page.id) return;
      parentOptions.push({ id: n.id, label: `${'— '.repeat(depth)}${n.title}` });
      walk(n.children, depth + 1);
    });
    walk(buildTree(tree.pages).roots, 0);
  }

  return (
    <div className="content">
      <div className="editor-shell">
        {draft && (
          <div className="review-banner" style={{ background: 'var(--accent-softer)', borderColor: 'var(--accent-border)' }}>
            <Icon name="history" size={18} />
            <div className="grow">Ungespeicherter Entwurf vom {new Date(draft.savedAt).toLocaleString('de-DE')} gefunden.</div>
            <button className="btn sm" onClick={() => { setForm(draft.form); setEditorKey((k) => k + 1); setDraft(false); setDirty(true); }}>Wiederherstellen</button>
            <button className="btn sm ghost" onClick={() => { localStorage.removeItem(draftKey(id)); setDraft(false); }}>Verwerfen</button>
          </div>
        )}

        <div className="row between wrap">
          <span className="eyebrow">{isNew ? 'Neue Seite' : `Bearbeiten · v${page.version}`}</span>
          <button className="btn ghost sm" onClick={() => setShowMeta((s) => !s)}>
            <Icon name="settings" size={14} /> {showMeta ? 'Details ausblenden' : 'Details & Eigenschaften'}
          </button>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            style={{ width: 56, height: 56, fontSize: 26, textAlign: 'center', padding: 0, flexShrink: 0 }}
            value={form.icon}
            maxLength={4}
            placeholder="📄"
            title="Emoji als Seitensymbol"
            onChange={(e) => set('icon', e.target.value)}
          />
          <input className="title-input" value={form.title} placeholder="Seitentitel" autoFocus={isNew} onChange={(e) => set('title', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.querySelector('.ProseMirror')?.focus(); } }} />
        </div>

        {showMeta && (
          <div className="card pad" style={{ margin: '14px 0 18px' }}>
            <div className="editor-meta" style={{ marginTop: 0 }}>
              {isNew && (
                <div className="field">
                  <label>Bereich</label>
                  <select className="select" value={form.spaceKey} onChange={(e) => { set('spaceKey', e.target.value); set('parentId', null); }}>
                    {writable.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Übergeordnete Seite</label>
                <select className="select" value={form.parentId || ''} onChange={(e) => set('parentId', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Oberste Ebene —</option>
                  {parentOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Seitentyp</label>
                <select className="select" value={form.pageType} onChange={(e) => set('pageType', e.target.value)}>
                  {Object.entries(PAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Nächstes Review</label>
                <input type="date" className="input" value={form.reviewDue || ''} onChange={(e) => set('reviewDue', e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Tags</label>
              <TagInput value={form.tags} onChange={(t) => set('tags', t)} />
            </div>
            <div className="field">
              <label>Eigenschaften <span className="faint">(strukturierte Daten wie Hostname, IP, Owner – durchsuchbar)</span></label>
              <PropertiesEditor value={form.properties} onChange={(p) => set('properties', p)} />
            </div>
          </div>
        )}
        {!showMeta && form.tags.length > 0 && <div className="page-tags" style={{ margin: '10px 0' }}>{form.tags.map((t) => <TagPill key={t} name={t} link={false} />)}</div>}

        <Editor key={editorKey} content={form.content} onChange={onContent} onUpload={onUpload} onSaveShortcut={save} />

        <div className="editor-actions">
          <span className="status">
            <span className={`dot ${dirty ? 'dirty' : 'ok'}`} />
            {dirty ? 'Ungespeicherte Änderungen (Entwurf lokal gesichert)' : page ? `Gespeichert ${timeAgo(page.updatedAt)}` : 'Neu'}
          </span>
          <input className="input sm grow desktop-only" style={{ maxWidth: 360, marginLeft: 'auto' }} placeholder="Änderungsnotiz (optional)" value={form.summary} onChange={(e) => set('summary', e.target.value)} />
          <button className="btn" onClick={() => { if (!dirty || confirm('Änderungen verwerfen?')) { localStorage.removeItem(draftKey(id)); navigate(isNew ? (space ? `/s/${space.key}` : '/') : `/p/${id}`); } }}>Abbrechen</button>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : <Icon name="save" />} Speichern <span className="kbd desktop-only" style={{ background: 'transparent', color: 'inherit', borderColor: 'rgba(255,255,255,.3)' }}>Strg S</span>
          </button>
        </div>
      </div>
    </div>
  );
}
