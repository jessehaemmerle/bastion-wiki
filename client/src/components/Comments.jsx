import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Avatar, Spinner } from './ui.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { formatDate, timeAgo } from '../lib/format.js';
import { tr, trn } from '../lib/i18n.js';

/** Comment text with @mentions and links, rendered as plain React nodes (no HTML) */
function Body({ text }) {
  const parts = String(text).split(/((?:^|(?<=\s))@[a-zA-Z0-9._-]{2,40}|https?:\/\/\S+)/g);
  return (
    <div className="comment-body">
      {parts.map((p, i) => {
        if (/^@[a-zA-Z0-9._-]{2,40}$/.test(p)) return <span key={i} className="mention">{p}</span>;
        if (/^https?:\/\/\S+$/.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow">{p}</a>;
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}

/** Textarea with @mention suggestions (only people who can read the page) */
function Composer({ pageId, initial = '', placeholder, submitLabel, onSubmit, onCancel, autoFocus }) {
  const [text, setText] = useState(initial);
  const [suggest, setSuggest] = useState(null); // { start, query, users, active }
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const seq = useRef(0); // late answers must not reopen a closed list
  const close = () => { seq.current += 1; setSuggest(null); };
  const lookup = async (value, caret) => {
    const n = ++seq.current;
    const m = value.slice(0, caret).match(/(?:^|\s)@([a-zA-Z0-9._-]{0,40})$/);
    if (!m) { setSuggest(null); return; }
    try {
      const { users } = await api.get(`/pages/${pageId}/mentionable?q=${encodeURIComponent(m[1])}`);
      if (n === seq.current) setSuggest(users.length ? { start: caret - m[1].length - 1, query: m[1], users, active: 0 } : null);
    } catch { setSuggest(null); }
  };
  const pick = (u) => {
    const caret = ref.current.selectionStart;
    const next = `${text.slice(0, suggest.start)}@${u.username} ${text.slice(caret)}`;
    setText(next);
    close();
    requestAnimationFrame(() => {
      const pos = suggest.start + u.username.length + 2;
      ref.current.focus();
      ref.current.setSelectionRange(pos, pos);
    });
  };
  const submit = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      close();
      await onSubmit(text.trim());
      setText('');
    } finally { setBusy(false); }
  };
  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-field">
        <textarea ref={ref} className="input" rows={text.split('\n').length > 2 ? 4 : 2} value={text} placeholder={placeholder} autoFocus={autoFocus}
          aria-label={placeholder}
          onChange={(e) => { setText(e.target.value); lookup(e.target.value, e.target.selectionStart); }}
          onBlur={() => setTimeout(close, 150)}
          onKeyDown={(e) => {
            if (suggest) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSuggest((s) => ({ ...s, active: Math.min(s.active + 1, s.users.length - 1) })); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSuggest((s) => ({ ...s, active: Math.max(s.active - 1, 0) })); return; }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggest.users[suggest.active]); return; }
            }
            if (e.key === 'Escape') close();
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e);
          }} />
        {suggest && (
          <div className="suggest mention-suggest" role="listbox">
            {suggest.users.map((u, i) => (
              <button key={u.id} type="button" role="option" aria-selected={i === suggest.active} className={i === suggest.active ? 'active' : ''}
                onMouseDown={(e) => { e.preventDefault(); pick(u); }}>
                <Avatar name={u.displayName} size={20} /> <span>{u.displayName}</span> <span className="faint tiny mono">@{u.username}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn primary sm" disabled={busy || !text.trim()}>{busy && <span className="spinner" />} {submitLabel}</button>
        {onCancel && <button type="button" className="btn ghost sm" onClick={onCancel}>{tr('Abbrechen')}</button>}
        <span className="faint tiny desktop-only">{tr('@Name erwähnt jemanden · Strg+Enter sendet')}</span>
      </div>
    </form>
  );
}

function Comment({ c, pageId, me, canModerate, onChange, children, onReply, canResolve }) {
  const [editing, setEditing] = useState(false);
  const { toast } = useApp();
  const act = async (fn) => { try { await fn(); onChange(); } catch (e) { toast(e.message, 'error'); } };
  return (
    <article className={`comment ${c.resolvedAt ? 'resolved' : ''}`} id={`comment-${c.id}`}>
      <Avatar name={c.author || '?'} size={28} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="comment-head">
          <strong>{c.author || tr('Gelöschter Benutzer')}</strong>
          <span className="faint small" title={formatDate(c.createdAt, true)}>{timeAgo(c.createdAt)}{c.editedAt && ` · ${tr('bearbeitet')}`}</span>
          {c.resolvedAt && <span className="badge success">{tr('Erledigt')}</span>}
        </div>
        {editing ? (
          <Composer pageId={pageId} initial={c.body} submitLabel={tr('Speichern')} autoFocus onCancel={() => setEditing(false)}
            onSubmit={(body) => act(async () => { await api.patch(`/comments/${c.id}`, { body }); setEditing(false); })} />
        ) : <Body text={c.body} />}
        {!editing && (
          <div className="comment-actions">
            {onReply && <button type="button" className="link-btn" onClick={onReply}>{tr('Antworten')}</button>}
            {!c.parentId && (canResolve || c.authorId === me.id) && (
              <button type="button" className="link-btn" onClick={() => act(() => api.patch(`/comments/${c.id}`, { resolved: !c.resolvedAt }))}>
                {c.resolvedAt ? tr('Wieder öffnen') : tr('Als erledigt markieren')}
              </button>
            )}
            {c.authorId === me.id && <button type="button" className="link-btn" onClick={() => setEditing(true)}>{tr('Bearbeiten')}</button>}
            {(c.authorId === me.id || canModerate) && (
              <button type="button" className="link-btn danger" onClick={() => confirm(tr('Kommentar löschen?')) && act(() => api.del(`/comments/${c.id}`))}>{tr('Löschen')}</button>
            )}
          </div>
        )}
        {children}
      </div>
    </article>
  );
}

export default function Comments({ page, onCount }) {
  const { user, toast } = useApp();
  const [data, setData] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const load = () => api.get(`/pages/${page.id}/comments`).then((d) => {
    setData(d);
    onCount?.(d.comments.filter((c) => !c.parentId && !c.resolvedAt).length);
  }).catch(() => setData({ comments: [] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page.id]);
  useEffect(() => {
    if (data && location.hash.startsWith('#comment-')) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [data]);
  const post = async (body, parentId = null) => {
    try {
      await api.post(`/pages/${page.id}/comments`, { body, parentId });
      setReplyTo(null);
      await load();
    } catch (e) { toast(e.message, 'error'); throw e; }
  };
  if (!data) return <Spinner />;
  const threads = data.comments.filter((c) => !c.parentId);
  const replies = (id) => data.comments.filter((c) => c.parentId === id);
  const resolved = threads.filter((t) => t.resolvedAt);
  const visible = threads.filter((t) => !t.resolvedAt || showResolved);
  return (
    <section className="comments" id="comments" aria-label={tr('Kommentare')}>
      <div className="section-title">
        <h3>{tr('Kommentare')} {threads.length > 0 && <span className="faint mono small">{threads.length - resolved.length}</span>}</h3>
        {resolved.length > 0 && (
          <button className="btn sm ghost" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? tr('Erledigte ausblenden') : trn(resolved.length, '1 erledigte anzeigen', '{n} erledigte anzeigen')}
          </button>
        )}
      </div>
      {visible.map((t) => (
        <Comment key={t.id} c={t} pageId={page.id} me={user} canModerate={data.canModerate} canResolve={data.canResolve} onChange={load}
          onReply={() => setReplyTo(replyTo === t.id ? null : t.id)}>
          {replies(t.id).map((r) => <Comment key={r.id} c={r} pageId={page.id} me={user} canModerate={data.canModerate} onChange={load} />)}
          {replyTo === t.id && <Composer pageId={page.id} placeholder={tr('Antworten …')} submitLabel={tr('Antworten')} autoFocus onCancel={() => setReplyTo(null)} onSubmit={(b) => post(b, t.id)} />}
        </Comment>
      ))}
      {!threads.length && <p className="faint small">{tr('Noch keine Kommentare. Fragen, Hinweise oder Ergänzungen zur Seite gehören hierher.')}</p>}
      <Composer pageId={page.id} placeholder={tr('Kommentar schreiben … (@Name erwähnt jemanden)')} submitLabel={tr('Kommentieren')} onSubmit={(b) => post(b)} />
    </section>
  );
}
