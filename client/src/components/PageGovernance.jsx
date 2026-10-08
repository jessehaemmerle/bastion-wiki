import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import ContentView from './ContentView.jsx';
import { Avatar, Modal, Spinner, Switch } from './ui.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { diffLines, htmlToLines } from '../lib/diff.js';
import { timeAgo } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

// ------------------------------------------------------------------ page permissions

function PrincipalPicker({ onPick, exclude }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ users: [], groups: [] });
  useEffect(() => {
    const t = setTimeout(() => api.get(`/directory?q=${encodeURIComponent(q)}`).then(setRes).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);
  const items = [
    ...res.groups.map((g) => ({ type: 'group', id: g.id, name: g.name, meta: tr('Gruppe · {n} Mitglieder', { n: g.members }) })),
    ...res.users.map((u) => ({ type: 'user', id: u.id, name: u.displayName, meta: `@${u.username}` })),
  ].filter((i) => !exclude.has(`${i.type}:${i.id}`));
  return (
    <div className="picker">
      <div className="input-icon"><Icon name="search" size={15} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Person oder Gruppe suchen …')} aria-label={tr('Person oder Gruppe suchen')} /></div>
      <div className="picker-list">
        {items.slice(0, 8).map((i) => (
          <button key={`${i.type}:${i.id}`} type="button" onClick={() => onPick(i)}>
            <Icon name={i.type === 'group' ? 'users' : 'user'} size={15} /> <span className="grow ellipsis">{i.name}</span> <span className="faint tiny">{i.meta}</span>
          </button>
        ))}
        {!items.length && <div className="faint small" style={{ padding: 8 }}>{tr('Keine Treffer')}</div>}
      </div>
    </div>
  );
}

export function PermissionsModal({ page, onClose, onSaved }) {
  const { toast, user } = useApp();
  const [data, setData] = useState(null);
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/pages/${page.id}/permissions`).then((d) => {
      setData(d);
      setEntries(d.entries.map((e) => ({ type: e.principalType, id: e.principalId, name: e.name, level: e.level })));
    }).catch((e) => { toast(e.message, 'error'); onClose(); });
    // load once per page: onClose is a new function on every parent render and would reset the edited list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);
  const exclude = useMemo(() => new Set(entries.map((e) => `${e.type}:${e.id}`)), [entries]);
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/pages/${page.id}/permissions`, { entries: entries.map((e) => ({ principalType: e.type, principalId: e.id, level: e.level })) });
      toast(entries.length ? tr('Seite ist jetzt eingeschränkt') : tr('Einschränkung aufgehoben'));
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  const restricted = entries.length > 0;
  return (
    <Modal title={tr('Berechtigungen der Seite')} icon="lock" size="lg" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={busy || !data} onClick={save}>{tr('Speichern')}</button></>}>
      {!data ? <Spinner /> : (
        <div className="col" style={{ gap: 14 }}>
          <p className="muted" style={{ margin: 0 }}>{tr('Ohne Einschränkung gelten die Rechte des Bereichs. Mit Einschränkung sehen diese Seite und ihre Unterseiten nur die hier eingetragenen Personen und Gruppen – Verwalter des Bereichs behalten immer Zugriff. Mehr als der Bereich erlaubt, lässt sich nicht vergeben.')}</p>
          {data.inherited.length > 0 && (
            <div className="review-banner" style={{ margin: 0 }}>
              <Icon name="lock" size={16} />
              <div className="small">{tr('Zusätzlich eingeschränkt durch übergeordnete Seiten:')} {data.inherited.map((i, n) => (
                <span key={i.pageId}>{n > 0 && ', '}<Link to={`/p/${i.pageId}`}>{i.title}</Link> ({i.entries.map((e) => e.name).join(', ')})</span>
              ))}</div>
            </div>
          )}
          <div className="segmented" role="group" aria-label={tr('Zugriff')}>
            <button type="button" className={!restricted ? 'active' : ''} onClick={() => setEntries([])}><Icon name="users" size={14} /> {tr('Wie der Bereich')}</button>
            <button type="button" className={restricted ? 'active' : ''} onClick={() => !restricted && setEntries([{ type: 'user', id: user.id, name: user.displayName, level: 'write' }])}><Icon name="lock" size={14} /> {tr('Eingeschränkt')}</button>
          </div>
          {restricted && (
            <>
              <div className="perm-list">
                {entries.map((e) => (
                  <div key={`${e.type}:${e.id}`} className="perm-row">
                    <Icon name={e.type === 'group' ? 'users' : 'user'} size={15} />
                    <span className="grow ellipsis">{e.name}{e.type === 'user' && e.id === user.id && <span className="faint"> ({tr('du')})</span>}</span>
                    <select className="select sm" value={e.level} aria-label={tr('Recht für {name}', { name: e.name })}
                      onChange={(ev) => setEntries((x) => x.map((y) => (y === e ? { ...y, level: ev.target.value } : y)))}>
                      <option value="read">{tr('Lesen')}</option>
                      <option value="write">{tr('Schreiben')}</option>
                    </select>
                    <button type="button" className="btn ghost icon sm" aria-label={tr('Entfernen')} onClick={() => setEntries((x) => x.filter((y) => y !== e))}><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>
              <PrincipalPicker exclude={exclude} onPick={(i) => setEntries((x) => [...x, { type: i.type, id: i.id, name: i.name, level: 'read' }])} />
              {!data.isSpaceAdmin && <div className="small faint">{tr('Du bleibst automatisch mit Schreibrecht eingetragen.')}</div>}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ approval workflow

export function ApprovalSettingsModal({ page, onClose, onSaved }) {
  const { toast } = useApp();
  const [required, setRequired] = useState(page.approval.required);
  const [groupId, setGroupId] = useState(page.approval.group?.id || '');
  const [groups, setGroups] = useState([]);
  useEffect(() => { api.get('/directory?q=').then((d) => setGroups(d.groups)).catch(() => {}); }, []);
  const save = async () => {
    try {
      await api.put(`/pages/${page.id}/approval`, { required, approverGroupId: groupId ? Number(groupId) : null });
      toast(required ? tr('Freigabepflicht aktiviert') : tr('Freigabepflicht aufgehoben'));
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={tr('Freigabe-Workflow')} icon="badge-check" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" onClick={save}>{tr('Speichern')}</button></>}>
      <div className="col" style={{ gap: 14 }}>
        <p className="muted" style={{ margin: 0 }}>{tr('Mit Freigabepflicht werden Änderungen an Inhalt, Titel, Datenblatt und Tags erst sichtbar, wenn eine zweite Person sie freigibt (Vier-Augen-Prinzip). Bis dahin sehen alle die freigegebene Fassung.')}</p>
        <Switch checked={required} onChange={setRequired} label={tr('Änderungen dieser Seite brauchen eine Freigabe')} />
        {required && (
          <div className="field">
            <label htmlFor="ap-group">{tr('Wer darf freigeben?')}</label>
            <select id="ap-group" className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">{tr('Alle mit Schreibrecht (außer der Person, die geändert hat)')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{tr('Nur Gruppe {name}', { name: g.name })}</option>)}
            </select>
            <span className="hint">{tr('Ausschalten oder lockern dürfen nur Verwalter des Bereichs.')}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Diff({ before, after }) {
  const lines = useMemo(() => diffLines(htmlToLines(before), htmlToLines(after)), [before, after]);
  const stats = { add: lines.filter((d) => d.type === 'add').length, del: lines.filter((d) => d.type === 'del').length };
  return (
    <>
      <div className="mono small" style={{ marginBottom: 6 }}><span style={{ color: 'var(--success)' }}>+{stats.add}</span> <span style={{ color: 'var(--danger)' }}>−{stats.del}</span></div>
      <div className="diff">{lines.map((d, i) => <div key={i} className={d.type}>{d.t || ' '}</div>)}</div>
    </>
  );
}

export function ChangeRequestModal({ page, onClose, onDone }) {
  const { toast } = useApp();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('diff');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/pages/${page.id}/change-request`).then(setData).catch((e) => toast(e.message, 'error')); }, [page.id, toast]);
  const act = async (action) => {
    setBusy(true);
    try {
      await api.post(`/change-requests/${data.request.id}/${action}`, { note, ...(action === 'approve' ? { seen: data.request.updatedAt } : {}) });
      toast({ approve: tr('Änderung freigegeben'), reject: tr('Änderung abgelehnt'), withdraw: tr('Vorschlag zurückgezogen') }[action]);
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
      // the author changed the request meanwhile: show the new state before anyone can approve it
      if (e.status === 409) api.get(`/pages/${page.id}/change-request`).then(setData).catch(() => {});
    }
  };
  const r = data?.request;
  const propChanges = r ? [...new Set([...Object.keys(data.current.properties || {}), ...Object.keys(r.properties || {})])]
    .filter((k) => (data.current.properties?.[k] || '') !== (r.properties?.[k] || '')) : [];
  return (
    <Modal title={tr('Änderungsvorschlag')} icon="git-pull-request" size="xl" onClose={onClose}
      footer={r && (
        <>
          {data.mine && <button className="btn" disabled={busy} onClick={() => act('withdraw')}>{tr('Zurückziehen')}</button>}
          {data.canReview && <button className="btn danger" disabled={busy} onClick={() => act('reject')}><Icon name="x" size={15} /> {tr('Ablehnen')}</button>}
          {data.canReview && <button className="btn primary" disabled={busy} onClick={() => act('approve')}><Icon name="check" size={15} /> {tr('Freigeben')}</button>}
          {!data.mine && !data.canReview && <button className="btn" onClick={onClose}>{tr('Schließen')}</button>}
        </>
      )}>
      {!data ? <Spinner /> : !r ? <p className="muted">{tr('Kein offener Änderungsvorschlag.')}</p> : (
        <div className="col" style={{ gap: 12 }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <Avatar name={r.author || '?'} size={26} />
            <div className="grow">
              <strong>{r.author}</strong> <span className="faint small">{timeAgo(r.updatedAt)} · {tr('auf Basis von Version {n}', { n: r.baseVersion })}</span>
              {r.summary && <div className="small">„{r.summary}“</div>}
            </div>
            <div className="segmented">
              <button className={mode === 'diff' ? 'active' : ''} onClick={() => setMode('diff')}>{tr('Änderungen')}</button>
              <button className={mode === 'view' ? 'active' : ''} onClick={() => setMode('view')}>{tr('Neue Fassung')}</button>
            </div>
          </div>
          {r.baseVersion !== data.current.version && <div className="error-box">{tr('Die Seite hat sich seit dem Vorschlag geändert (jetzt Version {n}). Beim Freigeben wird die neue Fassung übernommen.', { n: data.current.version })}</div>}
          {r.title !== data.current.title && <div className="small"><strong>{tr('Titel')}:</strong> <del>{data.current.title}</del> → <ins>{r.title}</ins></div>}
          {propChanges.length > 0 && (
            <div className="small">
              <strong>{tr('Datenblatt')}:</strong>
              <ul className="small" style={{ margin: '4px 0 0' }}>
                {propChanges.map((k) => <li key={k}><span className="mono">{k}</span>: <del>{data.current.properties?.[k] || '—'}</del> → <ins>{r.properties?.[k] || '—'}</ins></li>)}
              </ul>
            </div>
          )}
          <div className="cr-body">{mode === 'diff' ? <Diff before={data.current.content} after={r.content} /> : <ContentView html={r.content} />}</div>
          {data.canReview && (
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="cr-note">{tr('Anmerkung (optional, geht an {name})', { name: r.author })}</label>
              <input id="cr-note" className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          {!data.canReview && !data.mine && <div className="small faint">{tr('Freigeben dürfen andere Personen mit Schreibrecht{group}.', { group: page.approval.group ? tr(' aus der Gruppe {name}', { name: page.approval.group.name }) : '' })}</div>}
        </div>
      )}
    </Modal>
  );
}

/** Banner on the page while a change waits for approval */
export function PendingBanner({ page, onOpen }) {
  const p = page.approval?.pending;
  if (!p) return null;
  return (
    <div className="presence-banner approval" role="status">
      <Icon name="git-pull-request" size={16} />
      <span>{p.mine
        ? tr('Dein Änderungsvorschlag wartet auf Freigabe (seit {when}).', { when: timeAgo(p.updatedAt) })
        : tr('Änderungsvorschlag von {name} wartet auf Freigabe (seit {when}).', { name: p.author, when: timeAgo(p.updatedAt) })}</span>
      <button type="button" className="btn sm" onClick={onOpen}>{p.canReview ? tr('Prüfen') : tr('Ansehen')}</button>
    </div>
  );
}
