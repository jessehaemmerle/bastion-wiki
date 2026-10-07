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
import { getLanguage, getLocale, tr } from '../lib/i18n.js';
import { EditorsBanner } from '../components/PageExtras.jsx';
import { checkSheet, SchemaFieldsEditor, splitProps } from '../components/SheetFields.jsx';

const draftKey = (id) => `bastion.draft.${id || 'new'}`;

function TemplatePicker({ onPick }) {
  const [templates, setTemplates] = useState(null);
  useEffect(() => { api.get(`/templates?lang=${getLanguage()}`).then((d) => setTemplates(d.templates)).catch(() => setTemplates([])); }, []);
  if (!templates) return <Spinner center />;
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{tr('Neue Seite')}</h1>
          <p>{tr('Wähle eine Vorlage. Sie legt Gliederung, Seitentyp und Datenblatt-Felder fest.')}</p>
        </div>
      </div>
      <div className="choice-list">
        <button className="choice" onClick={() => onPick(null)}>
          <Icon name="file" size={18} />
          <strong>{tr('Leere Seite')}</strong>
          <span>{tr('Ohne Struktur beginnen.')}</span>
        </button>
        {templates.map((t) => (
          <button key={t.id} className="choice" onClick={() => onPick(t)}>
            <Icon name={t.icon} size={18} />
            <strong>{t.name}</strong>
            <span>{t.description}</span>
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
  const [editors, setEditors] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [sheetErrors, setSheetErrors] = useState({});
  const [pending, setPending] = useState(null); // open change request of somebody else
  const [ownRequest, setOwnRequest] = useState(false);
  const [bypass, setBypass] = useState(false);
  const { user } = useApp();
  useEffect(() => { api.get('/schemas').then((d) => setSchemas(d.schemas)).catch(() => {}); }, []);
  const formRef = useRef(form);
  formRef.current = form;

  const writable = spaces.filter((s) => ['write', 'admin'].includes(s.access));

  // initial load
  useEffect(() => {
    if (isNew) {
      const spaceKey = params.get('space') || writable[0]?.key || '';
      setForm({
        title: '', content: '', spaceKey, parentId: params.get('parent') ? Number(params.get('parent')) : null,
        pageType: 'doc', icon: '', tags: [], properties: {}, reviewDue: '', summary: '', schemaId: null,
      });
      return;
    }
    api.get(`/pages/${id}`).then(async ({ page }) => {
      if (!['write', 'admin'].includes(page.access)) throw new Error(tr('Keine Schreibrechte für diese Seite'));
      setPage(page);
      let base = {
        title: page.title, content: page.content, spaceKey: page.space.key, parentId: page.parentId, pageType: page.pageType,
        icon: page.icon || '', tags: page.tags.map((t) => t.name), properties: page.properties || {}, reviewDue: page.reviewDue || '', summary: '',
        schemaId: page.schemaId || null,
      };
      // approval workflow: continue the own open proposal, or wait for somebody else's
      if (page.approval?.pending) {
        if (page.approval.pending.mine) {
          const { request } = await api.get(`/pages/${page.id}/change-request`);
          if (request) {
            base = { ...base, title: request.title, content: request.content, properties: request.properties || {}, schemaId: request.schemaId ?? base.schemaId, summary: request.summary, ...(request.tags ? { tags: request.tags } : {}) };
            setOwnRequest(true);
          }
        } else setPending(page.approval.pending);
      }
      setForm(base);
      setShowMeta(Object.keys(base.properties || {}).length > 0 || Boolean(base.schemaId));
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
      // offer the draft if it differs in anything that is saved (not only the text: a changed title or data sheet counts too)
      const pick = (x) => JSON.stringify([x.title, x.content, x.properties, x.tags, x.schemaId ?? null]);
      if (d?.form && (!page || new Date(d.savedAt) > new Date(page.updatedAt)) && pick(d.form) !== pick(form)) setDraft(d);
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

  // tell others we are editing (heartbeat) and learn who else is
  useEffect(() => {
    if (isNew || !id) return undefined;
    let stopped = false;
    const beat = () => api.post(`/pages/${id}/presence`).then((d) => !stopped && setEditors(d.editors)).catch(() => {});
    beat();
    const t = setInterval(beat, 20000);
    return () => {
      stopped = true;
      clearInterval(t);
      api.del(`/pages/${id}/presence`).catch(() => {});
    };
  }, [id, isNew]);

  const space = spaces.find((s) => s.key === form?.spaceKey);
  useChrome(
    isNew ? [{ label: space?.name || tr('Neue Seite'), to: space ? `/s/${space.key}` : undefined }, { label: tr('Neue Seite') }]
      : [{ label: page?.space.name || '…', to: page ? `/s/${page.space.key}` : undefined }, { label: page?.title || '…', to: page ? `/p/${page.id}` : undefined }, { label: tr('Bearbeiten') }],
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

  const savingRef = useRef(false); // Ctrl+S (incl. key repeat) must not start a second save while one is running
  const save = useCallback(async () => {
    const f = formRef.current;
    if (savingRef.current || !f) return;
    if (!f.title.trim()) { toast(tr('Bitte einen Titel angeben'), 'error'); return; }
    const sp = spaces.find((s) => s.key === f.spaceKey);
    if (isNew && !sp) { toast(tr('Bitte einen Bereich wählen'), 'error'); return; }
    savingRef.current = true;
    setSaving(true);
    const schema = schemas.find((x) => x.id === f.schemaId);
    const errs = checkSheet(schema, f.properties);
    setSheetErrors(errs);
    if (Object.keys(errs).length) {
      setShowMeta(true);
      toast(tr('Datenblatt unvollständig: {fields}', { fields: Object.keys(errs).join(', ') }), 'error');
      savingRef.current = false;
      setSaving(false);
      return;
    }
    const props = Object.fromEntries(Object.entries(f.properties).filter(([k, v]) => k.trim() && (v !== '' || !schema?.fields.some((x) => x.label === k))));
    const body = {
      title: f.title, content: f.content, pageType: f.pageType, icon: f.icon || null, tags: f.tags,
      properties: props, reviewDue: f.reviewDue || null, summary: f.summary, parentId: f.parentId || null, schemaId: f.schemaId || null,
    };
    try {
      const res = isNew
        ? await api.post('/pages', { ...body, spaceId: sp.id })
        : await api.put(`/pages/${id}`, { ...body, ...(ownRequest ? {} : { baseVersion: page.version }), ...(bypass ? { bypassApproval: true } : {}) });
      localStorage.removeItem(draftKey(id));
      setDirty(false);
      toast(res.pending ? tr('Änderungsvorschlag eingereicht – wartet auf Freigabe') : isNew ? tr('Seite erstellt') : tr('Gespeichert'));
      refreshTree();
      navigate(`/p/${res.page.id}`);
    } catch (e) {
      // conflict: the server asks to reload. Stamp the draft now, so it is still offered after the reload
      // (otherwise it looks older than the other person's save and is silently dropped)
      if (e.status === 409) {
        try { localStorage.setItem(draftKey(id), JSON.stringify({ savedAt: new Date().toISOString(), form: f })); } catch { /* full */ }
      }
      const fields = e.data?.details?.fields;
      toast(fields?.length > 1 ? `${e.message} (+${fields.length - 1})` : e.message, 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [isNew, id, page, spaces, toast, refreshTree, navigate, schemas, ownRequest, bypass]);

  const pickTemplate = (t) => {
    if (t) {
      const reviewDue = settings.reviewIntervalDays && ['runbook', 'host', 'service', 'network'].includes(t.pageType)
        ? new Date(Date.now() + settings.reviewIntervalDays * 864e5).toISOString().slice(0, 10) : '';
      setForm((f) => ({ ...f, content: t.content, pageType: t.pageType, properties: { ...t.properties }, tags: [...new Set([...f.tags, ...t.tags])], reviewDue, schemaId: t.schemaId || null }));
      setShowMeta(Object.keys(t.properties).length > 0 || Boolean(t.schemaId));
    }
    setTemplateChosen(true);
    setEditorKey((k) => k + 1);
  };

  if (error) return <NotFound message={error.message} />;
  if (!form) return <Spinner center />;
  if (isNew && !writable.length) return <NotFound message={tr('Du hast in keinem Bereich Schreibrechte.')} />;
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
            <div className="grow">{tr('Ungespeicherter Entwurf vom {date} gefunden.', { date: new Date(draft.savedAt).toLocaleString(getLocale()) })}</div>
            <button className="btn sm" onClick={() => { setForm(draft.form); setEditorKey((k) => k + 1); setDraft(false); setDirty(true); }}>{tr('Wiederherstellen')}</button>
            <button className="btn sm ghost" onClick={() => { localStorage.removeItem(draftKey(id)); setDraft(false); }}>{tr('Verwerfen')}</button>
          </div>
        )}

        <EditorsBanner editors={editors} editing />
        {page?.approval?.required && !pending && (
          <div className="presence-banner approval" role="status">
            <Icon name="badge-check" size={16} />
            <span>{ownRequest
              ? tr('Du bearbeitest deinen offenen Änderungsvorschlag. Speichern aktualisiert ihn.')
              : tr('Diese Seite ist freigabepflichtig: Speichern reicht einen Änderungsvorschlag ein, der erst nach Freigabe sichtbar wird.')}</span>
            {user.role === 'admin' && <label className="row small" style={{ gap: 6, marginLeft: 'auto' }}><input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} /> {tr('Ohne Freigabe veröffentlichen')}</label>}
          </div>
        )}
        {pending && (
          <div className="error-box" role="alert">
            {tr('{name} hat einen Änderungsvorschlag eingereicht, der noch auf Freigabe wartet. Weitere Änderungen sind erst danach möglich.', { name: pending.author })}
          </div>
        )}
        <div className="row between wrap">
          <span className="eyebrow">{isNew ? tr('Neue Seite') : tr('Version {n} bearbeiten', { n: page.version })}</span>
          <button className="btn ghost sm" onClick={() => setShowMeta((s) => !s)}>
            <Icon name="settings" size={14} /> {showMeta ? tr('Details ausblenden') : tr('Details & Eigenschaften')}
          </button>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <input
            className="input"
            style={{ width: 56, height: 56, fontSize: 26, textAlign: 'center', padding: 0, flexShrink: 0 }}
            value={form.icon}
            maxLength={4}
            placeholder="–" aria-label={tr('Seitensymbol (Emoji)')}
            title={tr('Emoji als Seitensymbol')}
            onChange={(e) => set('icon', e.target.value)}
          />
          <input className="title-input" value={form.title} placeholder={tr('Seitentitel')} autoFocus={isNew} onChange={(e) => set('title', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.querySelector('.ProseMirror')?.focus(); } }} />
        </div>

        {showMeta && (
          <div className="card pad" style={{ margin: '14px 0 18px' }}>
            <div className="editor-meta" style={{ marginTop: 0 }}>
              {isNew && (
                <div className="field">
                  <label>{tr('Bereich')}</label>
                  <select className="select" value={form.spaceKey} onChange={(e) => { set('spaceKey', e.target.value); set('parentId', null); }}>
                    {writable.map((s) => <option key={s.id} value={s.key}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="field">
                <label>{tr('Übergeordnete Seite')}</label>
                <select className="select" value={form.parentId || ''} onChange={(e) => set('parentId', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{tr('— Oberste Ebene —')}</option>
                  {parentOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{tr('Seitentyp')}</label>
                <select className="select" value={form.pageType} onChange={(e) => set('pageType', e.target.value)}>
                  {Object.entries(PAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{tr('Nächstes Review')}</label>
                <input type="date" className="input" value={form.reviewDue || ''} onChange={(e) => set('reviewDue', e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>{tr('Tags')}</label>
              <TagInput value={form.tags} onChange={(t) => set('tags', t)} />
            </div>
            <div className="field">
              <label htmlFor="pe-schema">{tr('Datenblatt')}</label>
              <select id="pe-schema" className="select" style={{ maxWidth: 360 }} value={form.schemaId || ''}
                onChange={(e) => { set('schemaId', e.target.value ? Number(e.target.value) : null); setSheetErrors({}); }}>
                <option value="">{tr('Freie Felder (ohne Schema)')}</option>
                {schemas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <span className="hint">{tr('Ein Schema gibt Felder mit Typ, Pflichtangaben und Ablaufdaten vor. Optional – freie Felder gehen immer zusätzlich.')}</span>
            </div>
            {(() => {
              const schema = schemas.find((x) => x.id === form.schemaId);
              const { typed, free } = splitProps(schema, form.properties);
              return (
                <>
                  {schema && (
                    <SchemaFieldsEditor schema={schema} value={typed} errors={sheetErrors}
                      onChange={(t) => set('properties', { ...t, ...free })} />
                  )}
                  <div className="field" style={{ marginTop: schema ? 14 : 0 }}>
                    <label>{schema ? tr('Weitere Felder') : tr('Eigenschaften')} <span className="faint">{tr('(strukturierte Daten wie Hostname, IP, Owner – durchsuchbar)')}</span></label>
                    <PropertiesEditor value={free} onChange={(p) => set('properties', { ...typed, ...p })} />
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {!showMeta && form.tags.length > 0 && <div className="page-tags" style={{ margin: '10px 0' }}>{form.tags.map((t) => <TagPill key={t} name={t} link={false} />)}</div>}

        <Editor key={editorKey} content={form.content} onChange={onContent} onUpload={onUpload} onSaveShortcut={save}
          secretContext={{ spaceId: space?.id ?? page?.spaceId, pageId: page?.id }} />

        <div className="editor-actions">
          <span className="status">
            <span className={`dot ${dirty ? 'dirty' : 'ok'}`} />
            {dirty ? tr('Ungespeicherte Änderungen (Entwurf lokal gesichert)') : page ? tr('Gespeichert {when}', { when: timeAgo(page.updatedAt) }) : tr('Neu')}
          </span>
          <input className="input sm grow desktop-only" style={{ maxWidth: 360, marginLeft: 'auto' }} placeholder={tr('Änderungsnotiz (optional)')} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
          <button className="btn" onClick={() => { if (!dirty || confirm(tr('Änderungen verwerfen?'))) { localStorage.removeItem(draftKey(id)); navigate(isNew ? (space ? `/s/${space.key}` : '/') : `/p/${id}`); } }}>{tr('Abbrechen')}</button>
          <button className="btn primary" onClick={save} disabled={saving || Boolean(pending)}>
            {saving ? <span className="spinner" /> : <Icon name="save" />} {page?.approval?.required && !bypass ? tr('Zur Freigabe einreichen') : tr('Speichern')} <span className="kbd desktop-only" style={{ background: 'transparent', color: 'inherit', borderColor: 'rgba(255,255,255,.3)' }}>{tr('Strg S')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
