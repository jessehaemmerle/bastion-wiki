import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon, { PageIcon } from './Icon.jsx';
import { Modal, Spinner, useCopy } from './ui.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { formatDate, PAGE_TYPES, timeAgo } from '../lib/format.js';
import { tr, trn } from '../lib/i18n.js';

function PageRow({ p, extra }) {
  return (
    <Link to={`/p/${p.id}`} className="ref-row">
      <span className="cable" style={{ '--sc': p.spaceColor }} />
      <PageIcon icon={p.icon} fallback={PAGE_TYPES[p.pageType]?.icon} size={15} />
      <span className="ellipsis grow">{p.title}</span>
      {extra}
      <span className="faint tiny desktop-only">{p.spaceName}</span>
    </Link>
  );
}

/** "Linked from" + inventory references (hosts/services that mention each other) */
export function References({ page }) {
  const [rel, setRel] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.get(`/pages/${page.id}/related`).then((d) => !cancelled && setRel(d)).catch(() => !cancelled && setRel({ mentions: [], objects: [], identifiers: [] }));
    return () => { cancelled = true; };
  }, [page.id, page.version]);

  const backlinks = page.backlinks || [];
  const linked = new Set(backlinks.map((b) => b.id));
  const mentions = (rel?.mentions || []).filter((m) => !linked.has(m.id));
  const objects = rel?.objects || [];
  if (!backlinks.length && !mentions.length && !objects.length) return null;
  return (
    <>
      <div className="section-title"><h3>{tr('Bezüge')}</h3></div>
      <div className="refs">
        {backlinks.length > 0 && (
          <div>
            <div className="eyebrow">{tr('Verlinkt von')}</div>
            {backlinks.map((p) => <PageRow key={p.id} p={p} />)}
          </div>
        )}
        {objects.length > 0 && (
          <div>
            <div className="eyebrow">{tr('Erwähnte Systeme')}</div>
            {objects.map((p) => <PageRow key={p.id} p={p} extra={<span className="badge mono">{PAGE_TYPES[p.pageType]?.label}</span>} />)}
          </div>
        )}
        {mentions.length > 0 && (
          <div>
            <div className="eyebrow" title={rel.identifiers.join(', ')}>{tr('Erwähnt in')}</div>
            {mentions.map((p) => <PageRow key={p.id} p={p} extra={<span className="faint tiny mono ellipsis" style={{ maxWidth: 160 }}>{p.hits.join(', ')}</span>} />)}
          </div>
        )}
      </div>
    </>
  );
}

export const RUN_STATUS = {
  running: { icon: 'play', get label() { return tr('Läuft'); } },
  done: { icon: 'check-circle', get label() { return tr('Abgeschlossen'); } },
  aborted: { icon: 'circle-x', get label() { return tr('Abgebrochen'); } },
};

export function StartRunModal({ page, onClose }) {
  const navigate = useNavigate();
  const { toast } = useApp();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const { run } = await api.post(`/pages/${page.id}/runs`, { reason });
      navigate(`/runs/${run.id}`);
    } catch (err) { toast(err.message, 'error'); setBusy(false); }
  };
  return (
    <Modal title={tr('Durchlauf starten')} icon="play" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={busy} onClick={start}><Icon name="play" size={15} /> {tr('Starten')}</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>{tr('Die Schritte der Seite werden zur Checkliste. Jedes Abhaken wird mit Name und Uhrzeit protokolliert.')}</p>
      <form className="field" onSubmit={start}>
        <label htmlFor="run-reason">{tr('Anlass (optional)')}</label>
        <input id="run-reason" className="input" autoFocus value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)}
          placeholder={tr('z. B. Ticket INC-4711, Wartungsfenster Dienstag')} />
      </form>
    </Modal>
  );
}

export function RunsSection({ page, canWrite, onStart }) {
  const [runs, setRuns] = useState(null);
  useEffect(() => {
    if (!page.runs?.total) { setRuns([]); return undefined; }
    let cancelled = false;
    api.get(`/pages/${page.id}/runs`).then((d) => !cancelled && setRuns(d.runs)).catch(() => !cancelled && setRuns([]));
    return () => { cancelled = true; };
  }, [page.id, page.runs?.total]);
  if (!runs || (!runs.length && !['runbook', 'checklist'].includes(page.pageType))) return null;
  return (
    <>
      <div className="section-title">
        <h3>{tr('Durchläufe')}</h3>
        {canWrite && <button className="btn sm ghost" onClick={onStart}><Icon name="play" size={14} /> {tr('Durchlauf starten')}</button>}
      </div>
      {!runs.length && <div className="faint small" style={{ padding: '8px 0' }}>{tr('Noch nie ausgeführt. Ein Durchlauf protokolliert, wer welchen Schritt wann erledigt hat.')}</div>}
      <div className="run-list">
        {runs.slice(0, 8).map((r) => (
          <Link key={r.id} to={`/runs/${r.id}`} className={`run-row ${r.status}`}>
            <Icon name={RUN_STATUS[r.status].icon} size={15} />
            <span className="grow ellipsis">{r.reason || RUN_STATUS[r.status].label}</span>
            <span className="mono small">{r.progress.done}/{r.progress.total}</span>
            <span className="faint small desktop-only">{r.startedBy}</span>
            <span className="faint small" title={formatDate(r.startedAt, true)}>{timeAgo(r.startedAt)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function ShareModal({ page, onClose }) {
  const { toast, settings } = useApp();
  const [shares, setShares] = useState(null);
  const [days, setDays] = useState(7);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, copy] = useCopy();
  const load = () => api.get(`/pages/${page.id}/shares`).then((d) => setShares(d.shares)).catch((e) => toast(e.message, 'error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page.id]);
  const create = async (e) => {
    e.preventDefault();
    try {
      const { share } = await api.post(`/pages/${page.id}/shares`, { days: Number(days), note });
      setCreated(`${location.origin}${share.path}`);
      setNote('');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
  const revoke = async (s) => {
    try { await api.del(`/shares/${s.id}`); load(); toast(tr('Freigabe widerrufen')); } catch (err) { toast(err.message, 'error'); }
  };
  const options = [1, 7, 30, 90, 365].filter((d) => d <= (settings.maxShareDays || 90));
  return (
    <Modal title={tr('Freigabelink')} icon="share" size="lg" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{tr('Wer den Link kennt, kann diese eine Seite samt Anhängen ohne Konto lesen – bis zum Ablaufdatum. Geheimnis-Blöcke bleiben verborgen, Unterseiten sind nicht enthalten.')}</p>
      {created ? (
        <div className="col" style={{ gap: 8 }}>
          <div className="small"><strong>{tr('Link erstellt.')}</strong> {tr('Er wird nur jetzt vollständig angezeigt.')}</div>
          <div className="secret-box"><span className="grow mono small break">{created}</span><button className="btn sm" onClick={() => copy(created)}><Icon name={copied ? 'check' : 'copy'} size={14} /></button></div>
          <div><button className="btn sm ghost" onClick={() => setCreated(null)}>{tr('Weiteren Link erstellen')}</button></div>
        </div>
      ) : (
        <form className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }} onSubmit={create}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="sh-days">{tr('Gültig für')}</label>
            <select id="sh-days" className="select" value={days} onChange={(e) => setDays(e.target.value)}>
              {options.map((d) => <option key={d} value={d}>{trn(d, '1 Tag', '{n} Tage')}</option>)}
            </select>
          </div>
          <div className="field grow" style={{ margin: 0 }}>
            <label htmlFor="sh-note">{tr('Notiz (für wen?)')}</label>
            <input id="sh-note" className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={tr('z. B. Dienstleister Netzwerk')} />
          </div>
          <button className="btn primary"><Icon name="link" size={15} /> {tr('Link erstellen')}</button>
        </form>
      )}
      <div className="section-title" style={{ marginTop: 22 }}><h3>{tr('Bestehende Freigaben')}</h3></div>
      {!shares ? <Spinner /> : !shares.length ? <div className="faint small">{tr('Keine Freigaben.')}</div> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{tr('Link')}</th><th>{tr('Notiz')}</th><th>{tr('Läuft ab')}</th><th>{tr('Aufrufe')}</th><th /></tr></thead>
            <tbody>
              {shares.map((s) => (
                <tr key={s.id} className={s.expired ? 'faint' : ''}>
                  <td className="mono small">{s.prefix}…</td>
                  <td className="small">{s.note || '—'}<div className="tiny faint">{s.createdBy}</div></td>
                  <td className="small">{s.expired ? tr('abgelaufen') : formatDate(s.expiresAt)}</td>
                  <td className="mono small">{s.views}{s.lastViewAt && <div className="tiny faint">{timeAgo(s.lastViewAt)}</div>}</td>
                  <td className="actions"><button className="btn ghost sm" onClick={() => revoke(s)}>{tr('Widerrufen')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Banner when somebody else has the page open in the editor */
export function EditorsBanner({ editors, editing }) {
  if (!editors?.length) return null;
  const names = editors.map((e) => e.name).join(', ');
  return (
    <div className="presence-banner" role="status">
      <Icon name="pen" size={16} />
      <span>{editing
        ? tr('{names} bearbeitet diese Seite gerade ebenfalls. Speichert nacheinander, sonst gewinnt die erste Änderung.', { names })
        : tr('{names} bearbeitet diese Seite gerade.', { names })}</span>
    </div>
  );
}
