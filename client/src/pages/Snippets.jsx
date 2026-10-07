import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ContentView from '../components/ContentView.jsx';
import { Confirm, Empty, Spinner } from '../components/ui.jsx';
import NotFound from './NotFound.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { timeAgo } from '../lib/format.js';
import { tr, trn } from '../lib/i18n.js';

const Editor = lazy(() => import('../components/editor/Editor.jsx'));

export function SnippetList() {
  const [q, setQ] = useState('');
  const { data, loading } = useFetch(`/snippets?q=${encodeURIComponent(q)}`);
  useChrome([{ label: tr('Bausteine') }]);
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{tr('Bausteine')}</h1>
          <p>{tr('Wiederverwendbare Textblöcke – zum Beispiel Wartungshinweise, Eskalationswege oder Standardbefehle. Einmal gepflegt, überall aktuell. Einfügen im Editor mit „/“ → Baustein.')}</p>
        </div>
        {data?.canEdit && <Link to="/snippets/new" className="btn primary"><Icon name="plus" size={15} /> {tr('Neuer Baustein')}</Link>}
      </div>
      <div className="input-icon" style={{ maxWidth: 420, marginBottom: 14 }}>
        <Icon name="search" size={15} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Bausteine durchsuchen …')} aria-label={tr('Bausteine durchsuchen')} />
      </div>
      {loading && !data ? <Spinner /> : !data.snippets.length ? (
        <Empty icon="layers" title={tr('Noch keine Bausteine')}>{tr('Lege den ersten Baustein an und füge ihn auf beliebig vielen Seiten ein.')}</Empty>
      ) : (
        <ul className="list card" style={{ padding: '0 16px' }}>
          {data.snippets.map((s) => (
            <li key={s.id}>
              <Link to={`/snippets/${s.id}`} className="list-item">
                <span className="li-icon"><Icon name="layers" /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="li-title">{s.name}</div>
                  <div className="li-meta">{s.description && <span>{s.description}</span>}<span>{tr('geändert {when}', { when: timeAgo(s.updatedAt) })}</span></div>
                </div>
                <span className="badge mono">{trn(s.usage, '1 Seite', '{n} Seiten')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SnippetEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const { toast } = useApp();
  const [data, setData] = useState(isNew ? { snippet: { name: '', description: '', content: '' }, pages: [], canEdit: true } : null);
  const [form, setForm] = useState(isNew ? { name: '', description: '', content: '' } : null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(isNew);
  const [del, setDel] = useState(false);
  const [saving, setSaving] = useState(false);
  useChrome([{ label: tr('Bausteine'), to: '/snippets' }, { label: isNew ? tr('Neuer Baustein') : data?.snippet.name || '…' }]);
  useEffect(() => {
    if (isNew) return;
    api.get(`/snippets/${id}`).then((d) => { setData(d); setForm({ name: d.snippet.name, description: d.snippet.description, content: d.snippet.content }); }).catch(setError);
  }, [id, isNew]);
  if (error) return <NotFound message={error.message} />;
  if (!data) return <Spinner center />;
  const save = async () => {
    if (!form.name.trim()) { toast(tr('Bitte einen Namen angeben'), 'error'); return; }
    setSaving(true);
    try {
      const { snippet } = isNew ? await api.post('/snippets', form) : await api.put(`/snippets/${id}`, form);
      toast(tr('Baustein gespeichert'));
      setEditing(false);
      if (isNew) navigate(`/snippets/${snippet.id}`, { replace: true });
      else setData((d) => ({ ...d, snippet }));
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };
  const s = data.snippet;
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <span className="eyebrow"><Icon name="layers" size={14} /> {tr('Baustein')}</span>
          {editing ? (
            <input className="title-input" value={form.name} autoFocus={isNew} placeholder={tr('Name des Bausteins')} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          ) : <h1>{s.name}</h1>}
          {!editing && !isNew && <p>{s.description} <span className="faint small">{tr('Version {n}, geändert {when} von {who}', { n: s.version, when: timeAgo(s.updatedAt), who: s.updatedBy || '—' })}</span></p>}
        </div>
        {data.canEdit && !editing && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" onClick={() => setEditing(true)}><Icon name="pen" size={15} /> {tr('Bearbeiten')}</button>
            <button className="btn danger" onClick={() => setDel(true)}><Icon name="trash" size={15} /></button>
          </div>
        )}
      </div>
      {editing ? (
        <>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="sn-desc">{tr('Beschreibung (optional)')}</label>
            <input id="sn-desc" className="input" value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {data.pages.length > 1 && <div className="presence-banner"><Icon name="info" size={16} /><span>{trn(data.pages.length, 'Änderungen erscheinen sofort auf 1 Seite.', 'Änderungen erscheinen sofort auf {n} Seiten.')}</span></div>}
          <Suspense fallback={<Spinner />}>
            <Editor content={form.content} onChange={(html) => setForm((f) => ({ ...f, content: html }))} onSaveShortcut={save} allowSecrets={false} allowSnippets={false} />
          </Suspense>
          <div className="editor-actions">
            <button className="btn" onClick={() => (isNew ? navigate('/snippets') : setEditing(false))}>{tr('Abbrechen')}</button>
            <button className="btn primary" onClick={save} disabled={saving}><Icon name="save" /> {tr('Speichern')}</button>
          </div>
        </>
      ) : (
        <>
          <div className="card pad snippet-show"><ContentView html={s.content} /></div>
          <div className="section-title"><h3>{tr('Verwendet auf')}</h3></div>
          {!data.pages.length ? <p className="faint small">{tr('Noch auf keiner Seite eingefügt.')}</p> : (
            <div className="children-grid">
              {data.pages.map((p) => <Link key={p.id} to={`/p/${p.id}`} className="child-card"><Icon name="file-text" size={15} /> <span className="ellipsis">{p.title}</span> <span className="faint tiny">{p.spaceName}</span></Link>)}
            </div>
          )}
        </>
      )}
      {del && (
        <Confirm danger title={tr('Baustein löschen?')} confirmLabel={tr('Löschen')} onClose={() => setDel(false)}
          message={data.pages.length ? trn(data.pages.length, 'Er wird noch auf 1 Seite verwendet – dort erscheint dann ein Hinweis.', 'Er wird noch auf {n} Seiten verwendet – dort erscheint dann ein Hinweis.') : tr('Der Baustein wird nirgends verwendet.')}
          onConfirm={async () => { await api.del(`/snippets/${id}`); toast(tr('Baustein gelöscht')); navigate('/snippets'); }} />
      )}
    </div>
  );
}
