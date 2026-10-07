import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ContentView from '../components/ContentView.jsx';
import { Confirm, Spinner } from '../components/ui.jsx';
import NotFound from './NotFound.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { formatDate, formatDuration } from '../lib/format.js';
import { getLocale, tr } from '../lib/i18n.js';
import { RUN_STATUS } from '../components/PageExtras.jsx';

const clock = (d) => new Date(d).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });

function logText(e, steps) {
  const step = e.step != null ? `${e.step + 1}. ${steps[e.step]?.text || ''}` : '';
  switch (e.type) {
    case 'start': return tr('Durchlauf gestartet');
    case 'check': return tr('Erledigt: {step}', { step });
    case 'uncheck': return tr('Zurückgenommen: {step}', { step });
    case 'step-note': return tr('Notiz zu {step}: {text}', { step, text: e.text });
    case 'comment': return e.text;
    case 'done': return tr('Durchlauf abgeschlossen');
    case 'aborted': return tr('Durchlauf abgebrochen');
    default: return e.text || e.type;
  }
}

function markdownProtocol(run, pageUrl) {
  const lines = [
    `# ${tr('Protokoll')}: ${run.title}`,
    '',
    `- ${tr('Status')}: ${RUN_STATUS[run.status].label}`,
    `- ${tr('Gestartet')}: ${formatDate(run.startedAt, true)} (${run.startedBy || '—'})`,
    run.finishedAt ? `- ${tr('Beendet')}: ${formatDate(run.finishedAt, true)}` : null,
    run.reason ? `- ${tr('Anlass')}: ${run.reason}` : null,
    `- ${tr('Runbook')}: ${pageUrl} (${tr('Version')} ${run.pageVersion})`,
    '',
    `## ${tr('Schritte')}`,
    '',
  ].filter((l) => l !== null);
  let section = null;
  run.steps.forEach((s, i) => {
    if (s.section && s.section !== section) { section = s.section; lines.push('', `### ${section}`, ''); }
    lines.push(`- [${s.done ? 'x' : ' '}] ${i + 1}. ${s.text}${s.done ? ` — ${s.doneBy}, ${clock(s.doneAt)}` : ''}`);
    if (s.note) lines.push(`  > ${s.note.replace(/\n/g, '\n  > ')}`);
  });
  lines.push('', `## ${tr('Verlauf')}`, '');
  run.log.forEach((e) => lines.push(`- ${formatDate(e.at, true)} · ${e.by || '—'} · ${logText(e, run.steps)}`));
  if (run.summary) lines.push('', `## ${tr('Ergebnis')}`, '', run.summary);
  return `${lines.join('\n')}\n`;
}

function StepNote({ step, index, disabled, onSave }) {
  const [open, setOpen] = useState(Boolean(step.note));
  const [text, setText] = useState(step.note || '');
  useEffect(() => { setText(step.note || ''); }, [step.note]);
  if (!open) {
    return disabled ? null : <button type="button" className="link-btn tiny" onClick={() => setOpen(true)}>{tr('Notiz')}</button>;
  }
  return (
    <textarea className="input step-note" rows={2} value={text} disabled={disabled} placeholder={tr('Ausgabe, Abweichung, Ticketnummer …')}
      aria-label={tr('Notiz zu Schritt {n}', { n: index + 1 })}
      onChange={(e) => setText(e.target.value)} onBlur={() => text !== (step.note || '') && onSave(text)} />
  );
}

export default function RunView() {
  const { id } = useParams();
  const { toast } = useApp();
  const { data, error, loading, setData, reload } = useFetch(`/runs/${id}`);
  const [comment, setComment] = useState('');
  const [summary, setSummary] = useState(null);
  const [finish, setFinish] = useState(null);
  const [showPage, setShowPage] = useState(false);
  const [now, setNow] = useState(Date.now());
  const run = data?.run;
  const page = data?.page;
  const live = run?.status === 'running';
  const canWrite = page?.access === 'write';

  useChrome(run ? [{ label: page.title, to: `/p/${page.id}` }, { label: tr('Durchlauf #{n}', { n: run.id }) }] : [{ label: '…' }], null, page?.id ?? null);

  // others may tick steps at the same time: refresh while the run is open
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 10000);
    const c = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(t); clearInterval(c); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const sections = useMemo(() => {
    const out = [];
    (run?.steps || []).forEach((s, i) => {
      const last = out[out.length - 1];
      if (!last || last.title !== s.section) out.push({ title: s.section, items: [] });
      out[out.length - 1].items.push([s, i]);
    });
    return out;
  }, [run?.steps]);

  if (loading && !data) return <Spinner center />;
  if (error) return <NotFound message={error.message} />;

  const patch = async (body) => {
    try {
      const { run: r } = await api.patch(`/runs/${run.id}`, body);
      setData((d) => ({ ...d, run: r }));
      return r;
    } catch (e) { toast(e.message, 'error'); reload(); return null; }
  };
  // optimistic: the box flips at once, the server answer then carries name and time
  const toggleStep = (i, done) => {
    setData((d) => ({ ...d, run: { ...d.run, steps: d.run.steps.map((x, j) => (j === i ? { ...x, done } : x)) } }));
    patch({ step: i, done });
  };
  const elapsed = Math.round(((run.finishedAt ? new Date(run.finishedAt).getTime() : now) - new Date(run.startedAt).getTime()) / 1000);
  const pct = run.progress.total ? Math.round((run.progress.done / run.progress.total) * 100) : 0;
  const exportMd = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([markdownProtocol(run, `${location.origin}/p/${page.id}`)], { type: 'text/markdown' }));
    a.download = `protokoll-${run.id}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="content">
      <div className="run-layout">
        <div className="run-main">
          <div className="page-kicker">
            <span className={`tape lg run-status ${run.status}`}><Icon name={RUN_STATUS[run.status].icon} size={13} /> {RUN_STATUS[run.status].label}</span>
            <span className="mono small faint">#{run.id}</span>
          </div>
          <h1 className="page-title"><span>{run.title}</span></h1>
          <div className="page-meta-line">
            <span>{tr('Gestartet {when} von {who}', { when: formatDate(run.startedAt, true), who: run.startedBy || '—' })}</span>
            <span><Icon name="timer" size={13} /> {formatDuration(elapsed)}</span>
            <Link to={`/p/${page.id}`}>{tr('Runbook, Version {n}', { n: run.pageVersion })}</Link>
            {page.version !== run.pageVersion && <span className="badge warning">{tr('Seite wurde seitdem geändert')}</span>}
          </div>
          {run.reason && <div className="run-reason"><span className="eyebrow">{tr('Anlass')}</span> {run.reason}</div>}

          <div className="run-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={tr('Fortschritt')}>
            <div className="bar"><span style={{ width: `${pct}%` }} /></div>
            <span className="mono small">{run.progress.done}/{run.progress.total}</span>
          </div>

          <ol className="run-steps">
            {sections.map((sec, si) => (
              <Fragment key={si}>
                {sec.title && <li className="run-section" aria-hidden="true">{sec.title}</li>}
                {sec.items.map(([s, i]) => (
                  <li key={i} className={`run-step ${s.done ? 'done' : ''}`}>
                    <label className="run-check">
                      <input type="checkbox" checked={s.done} disabled={!live || !canWrite} onChange={(e) => toggleStep(i, e.target.checked)} />
                      <span className="num mono">{i + 1}</span>
                      <span className="text">{s.text}</span>
                    </label>
                    <div className="run-step-meta">
                      {s.done && <span className="tiny faint">{s.doneBy}, {clock(s.doneAt)}</span>}
                      <StepNote step={s} index={i} disabled={!live || !canWrite} onSave={(note) => patch({ step: i, note })} />
                    </div>
                  </li>
                ))}
              </Fragment>
            ))}
          </ol>

          {live && canWrite && (
            <div className="run-actions">
              <button className="btn primary" onClick={() => { setSummary(''); setFinish('done'); }}><Icon name="check" size={15} /> {tr('Abschließen')}</button>
              <button className="btn danger" onClick={() => { setSummary(''); setFinish('aborted'); }}><Icon name="stop" size={15} /> {tr('Abbrechen')}</button>
              {run.progress.done < run.progress.total && <span className="small faint">{tr('{n} Schritte offen', { n: run.progress.total - run.progress.done })}</span>}
            </div>
          )}
          {!live && (
            <div className="card pad" style={{ marginTop: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{tr('Ergebnis')}</div>
              {canWrite ? (
                <textarea className="input" rows={3} defaultValue={run.summary} placeholder={tr('Kurzfazit, Abweichungen, Folgeaufgaben …')}
                  onBlur={(e) => e.target.value !== run.summary && patch({ summary: e.target.value })} />
              ) : <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{run.summary || '—'}</div>}
            </div>
          )}

          <div className="section-title">
            <h3>{tr('Runbook-Inhalt')}</h3>
            <button className="btn sm ghost" onClick={() => setShowPage((v) => !v)}>{showPage ? tr('Ausblenden') : tr('Einblenden')}</button>
          </div>
          {showPage && <ContentView html={page.content} />}
        </div>

        <aside className="run-aside">
          <div className="row between">
            <h4>{tr('Verlauf')}</h4>
            <button className="btn ghost sm" onClick={exportMd}><Icon name="download" size={14} /> {tr('Protokoll (.md)')}</button>
          </div>
          {live && canWrite && (
            <form className="run-comment" onSubmit={async (e) => { e.preventDefault(); if (comment.trim() && await patch({ comment })) setComment(''); }}>
              <input className="input sm" value={comment} maxLength={2000} placeholder={tr('Eintrag hinzufügen …')} aria-label={tr('Eintrag hinzufügen')} onChange={(e) => setComment(e.target.value)} />
              <button className="btn sm" disabled={!comment.trim()}><Icon name="send" size={14} /></button>
            </form>
          )}
          <ol className="run-log">
            {[...run.log].reverse().map((e, i) => (
              <li key={i} className={e.type}>
                <time className="mono tiny" dateTime={e.at} title={formatDate(e.at, true)}>{clock(e.at)}</time>
                <div><span className="small">{logText(e, run.steps)}</span><div className="tiny faint">{e.by}</div></div>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {finish && (
        <Confirm
          danger={finish === 'aborted'}
          title={finish === 'done' ? tr('Durchlauf abschließen?') : tr('Durchlauf abbrechen?')}
          confirmLabel={finish === 'done' ? tr('Abschließen') : tr('Durchlauf abbrechen')}
          message={(
            <div className="col" style={{ gap: 10 }}>
              {finish === 'done' && run.progress.done < run.progress.total && <div>{tr('{n} Schritte sind noch nicht abgehakt.', { n: run.progress.total - run.progress.done })}</div>}
              <textarea className="input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={tr('Kurzfazit, Abweichungen, Folgeaufgaben …')} aria-label={tr('Ergebnis')} />
            </div>
          )}
          onClose={() => setFinish(null)}
          onConfirm={async () => { await patch({ status: finish, summary }); }}
        />
      )}
    </div>
  );
}
