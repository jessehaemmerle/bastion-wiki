import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Spinner, Switch } from '../../components/ui.jsx';
import { TagInput } from '../../components/PageFields.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { formatBytes, formatDate } from '../../lib/format.js';
import { tr, trServer } from '../../lib/i18n.js';

/** How to get the data out of each system – shown next to the upload form */
const SOURCES = [
  {
    id: 'confluence-zip', name: 'Confluence', kind: 'file', accept: '.zip', icon: 'globe',
    howto: () => tr('In Confluence: Bereich öffnen → Bereichseinstellungen → Inhaltswerkzeuge → Exportieren → „HTML“ → „Vollständiger Export“. Die heruntergeladene ZIP-Datei hier hochladen.'),
    note: () => tr('Bereichsstruktur, Seitenhierarchie, Code-Makros, Info-Panels, Aufgabenlisten und Anhänge werden übernommen.'),
  },
  {
    id: 'wikijs-api', name: 'Wiki.js', variant: () => tr('Direkt per API'), kind: 'api', icon: 'zap',
    fields: [['url', () => tr('Adresse des Wikis'), 'https://wiki.example.com'], ['token', () => tr('API-Schlüssel'), '']],
    howto: () => tr('In Wiki.js: Administration → API-Zugang → API aktivieren und einen Schlüssel mit Lesezugriff erstellen.'),
    note: () => tr('Seiten, Pfade, Tags und referenzierte Dateien werden direkt abgerufen.'),
  },
  {
    id: 'wikijs-zip', name: 'Wiki.js', variant: () => tr('Export-Archiv'), kind: 'file', accept: '.zip', icon: 'folder',
    howto: () => tr('Den Inhalt des Git-Repositories bzw. des Ordners der „Lokales Dateisystem“-Speicherung (Administration → Speicher) als ZIP packen und hochladen.'),
    note: () => tr('Markdown- und HTML-Seiten samt Kopfzeilen (Titel, Tags, Datum) und Bildern im Archiv.'),
  },
  {
    id: 'bookstack-api', name: 'BookStack', variant: () => tr('Direkt per API'), kind: 'api', icon: 'zap',
    fields: [['url', () => tr('Adresse von BookStack'), 'https://docs.example.com'], ['tokenId', () => tr('Token-ID'), ''], ['tokenSecret', () => tr('Token-Secret'), '']],
    howto: () => tr('In BookStack: Profil → API-Tokens → Token erstellen. Das Konto braucht die Berechtigung „Auf System-API zugreifen“.'),
    note: () => tr('Bücher, Kapitel, Seiten, Tags, Bilder und Anhänge.'),
  },
  {
    id: 'bookstack-zip', name: 'BookStack', variant: () => tr('Portable ZIP'), kind: 'file', accept: '.zip', icon: 'book-open',
    howto: () => tr('In BookStack (ab v24.11): Buch öffnen → Exportieren → „Portable ZIP“.'),
    note: () => tr('Ein Buch pro Datei, inklusive Bildern und Anhängen.'),
  },
  {
    id: 'mediawiki-xml', name: 'MediaWiki', kind: 'file', accept: '.xml,.zip', extra: true, icon: 'file-code',
    howto: () => tr('Spezial:Exportieren aufrufen (oder dumpBackup.php --current) und die XML-Datei hochladen. Bilder optional als ZIP des images-Ordners dazugeben.'),
    note: () => tr('Wikitext wird umgewandelt: Überschriften, Listen, Tabellen, Code, Links und Kategorien (als Tags). Vorlagen werden entfernt.'),
  },
  {
    id: 'dokuwiki-zip', name: 'DokuWiki', kind: 'file', accept: '.zip', icon: 'file-text',
    howto: () => tr('Den Ordner data/ der DokuWiki-Installation (mindestens pages/ und media/) als ZIP packen.'),
    note: () => tr('Namensräume werden zur Seitenhierarchie, start-Seiten zu Bereichsseiten.'),
  },
  {
    id: 'notion-zip', name: 'Notion', kind: 'file', accept: '.zip', icon: 'files',
    howto: () => tr('In Notion: ⋯ → Exportieren → „Markdown & CSV“, Unterseiten einschließen.'),
    note: () => tr('Seitenhierarchie und Bilder. Datenbanken (CSV) werden übersprungen.'),
  },
  {
    id: 'markdown-zip', name: 'Markdown / HTML', kind: 'file', accept: '.zip', icon: 'code',
    howto: () => tr('Ein ZIP mit .md- oder .html-Dateien, z. B. ein Obsidian-Vault, MkDocs-docs-Ordner oder GitHub-/GitLab-Wiki.'),
    note: () => tr('Ordner werden zur Hierarchie, index.md/README.md zur Ordnerseite. [[Wikilinks]], Callouts und Front Matter werden erkannt.'),
  },
];

/** Server labels are "<source label>: <file or URL>" – rebuild them in the UI language */
function jobLabel(job) {
  const s = SOURCES.find((x) => x.id === job.source);
  const detail = String(job.label || '').split(': ').slice(1).join(': ');
  return s ? `${s.name}${s.variant ? ` (${s.variant()})` : ''}${detail ? `: ${detail}` : ''}` : job.label;
}

const STATUS_LABEL = {
  analyzing: () => tr('Wird analysiert'), ready: () => tr('Bereit'), running: () => tr('Läuft'), done: () => tr('Abgeschlossen'),
  failed: () => tr('Fehlgeschlagen'), discarded: () => tr('Verworfen'),
};

function Progress({ value, total }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="bar-row" style={{ gridTemplateColumns: '1fr 48px' }}>
        <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%`, '--c': 'var(--accent)' }} /></div>
        <span>{pct} %</span>
      </div>
    </div>
  );
}

function Preview({ job }) {
  const p = job.preview || {};
  const [showAll, setShowAll] = useState(false);
  const tree = showAll ? p.tree || [] : (p.tree || []).slice(0, 40);
  return (
    <>
      <table className="status-table" style={{ maxWidth: 520 }}>
        <tbody>
          <tr><th>{tr('Seiten')}</th><td>{p.pages}</td></tr>
          <tr><th>{tr('Dateien und Bilder')}</th><td>{p.files} ({formatBytes(p.bytes)})</td></tr>
          <tr><th>{tr('Tags')}</th><td>{p.tags}</td></tr>
          {p.groups?.length > 0 && <tr><th>{tr('Gruppen (Bereiche/Bücher)')}</th><td>{p.groups.map((g) => g.name).join(', ')}</td></tr>}
          {job.warnings?.length > 0 && <tr className="warn"><th>{tr('Hinweise')}</th><td>{job.warnings.length}</td></tr>}
        </tbody>
      </table>
      <div className="section-h" style={{ marginTop: 24 }}><h2>{tr('Seitenstruktur')}</h2></div>
      <ul className="tree" style={{ fontSize: 14 }}>
        {tree.map((n, i) => (
          <li key={i} style={{ paddingLeft: n.depth * 18, display: 'flex', gap: 8, alignItems: 'center', minHeight: 26 }}>
            <Icon name={n.empty ? 'folder' : 'file-text'} size={14} className="faint" />
            <span>{n.title}</span>
            {n.files > 0 && <span className="small faint">{tr('{n} Dateien', { n: n.files })}</span>}
          </li>
        ))}
      </ul>
      {(p.tree?.length > 40 && !showAll) && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setShowAll(true)}>{tr('Alle anzeigen')}</button>}
      {p.truncated && showAll && <p className="small muted">{tr('Vorschau auf {n} Einträge gekürzt.', { n: p.tree.length })}</p>}
    </>
  );
}

function Warnings({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <details style={{ marginTop: 20 }}>
      <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>{tr('{n} Hinweise anzeigen', { n: warnings.length })}</summary>
      <ul className="small muted" style={{ marginTop: 8, paddingLeft: 18, maxHeight: 280, overflowY: 'auto' }}>
        {warnings.map((w, i) => <li key={i}>{trServer(w)}</li>)}
      </ul>
    </details>
  );
}

function RunForm({ job, onStarted }) {
  const { spaces, toast } = useApp();
  const groups = job.preview?.groups || [];
  const [mode, setMode] = useState(groups.length > 1 ? 'perGroup' : 'new');
  const [spaceId, setSpaceId] = useState(spaces[0]?.id || '');
  const [parentPageId, setParentPageId] = useState('');
  const [pages, setPages] = useState([]);
  const [name, setName] = useState(groups[0]?.name || '');
  const [access, setAccess] = useState('read');
  const [conflict, setConflict] = useState('skip');
  const [dates, setDates] = useState(true);
  const [tags, setTags] = useState(['import']);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'existing' || !spaceId) return;
    const s = spaces.find((x) => x.id === Number(spaceId));
    if (s) api.get(`/spaces/${s.key}`).then((d) => setPages(d.pages)).catch(() => setPages([]));
  }, [mode, spaceId, spaces]);

  const start = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/imports/${job.id}/run`, {
        spaceMode: mode,
        spaceId: mode === 'existing' ? Number(spaceId) : undefined,
        parentPageId: mode === 'existing' && parentPageId ? Number(parentPageId) : null,
        newSpaceName: mode === 'new' ? name : undefined,
        defaultAccess: access,
        onConflict: conflict,
        preserveDates: dates,
        extraTags: tags,
      });
      onStarted();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  };

  return (
    <div className="col" style={{ gap: 18, maxWidth: 640 }}>
      <div className="field">
        <label>{tr('Ziel')}</label>
        <div className="segmented">
          <button className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>{tr('Neuer Bereich')}</button>
          {groups.length > 0 && <button className={mode === 'perGroup' ? 'active' : ''} onClick={() => setMode('perGroup')}>{tr('Ein Bereich je Gruppe')}</button>}
          <button className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>{tr('Bestehender Bereich')}</button>
        </div>
        {mode === 'perGroup' && <span className="hint">{tr('Es werden {n} Bereiche angelegt: {names}.', { n: groups.length, names: groups.map((g) => g.name).join(', ') })}</span>}
      </div>
      {mode === 'new' && (
        <div className="field">
          <label htmlFor="imp-name">{tr('Name des neuen Bereichs')}</label>
          <input id="imp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('z. B. Altes Wiki')} />
        </div>
      )}
      {mode === 'existing' && (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="imp-space">{tr('Bereich')}</label>
            <select id="imp-space" className="select" value={spaceId} onChange={(e) => { setSpaceId(e.target.value); setParentPageId(''); }}>
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="imp-parent">{tr('Unter Seite einordnen')}</label>
            <select id="imp-parent" className="select" value={parentPageId} onChange={(e) => setParentPageId(e.target.value)}>
              <option value="">{tr('— Oberste Ebene —')}</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        </div>
      )}
      {mode !== 'existing' && (
        <div className="field">
          <label>{tr('Zugriff auf neue Bereiche')}</label>
          <div className="segmented">
            {[['none', tr('Kein Zugriff')], ['read', tr('Lesen')], ['write', tr('Schreiben')]].map(([v, l]) => (
              <button key={v} className={access === v ? 'active' : ''} onClick={() => setAccess(v)}>{l}</button>
            ))}
          </div>
          <span className="hint">{tr('Gilt für alle angemeldeten Personen. Feinere Rechte lassen sich danach vergeben.')}</span>
        </div>
      )}
      <div className="field">
        <label>{tr('Wenn eine Seite mit gleichem Titel schon existiert')}</label>
        <div className="segmented">
          <button className={conflict === 'skip' ? 'active' : ''} onClick={() => setConflict('skip')}>{tr('Überspringen')}</button>
          <button className={conflict === 'update' ? 'active' : ''} onClick={() => setConflict('update')}>{tr('Als neue Version speichern')}</button>
          <button className={conflict === 'duplicate' ? 'active' : ''} onClick={() => setConflict('duplicate')}>{tr('Zusätzlich anlegen')}</button>
        </div>
      </div>
      <Switch checked={dates} onChange={setDates} label={tr('Erstellungs- und Änderungsdatum übernehmen')} />
      <div className="field">
        <label>{tr('Tags für alle importierten Seiten')}</label>
        <TagInput value={tags} onChange={setTags} />
      </div>
      <div className="row">
        <button className="btn primary lg" onClick={start} disabled={busy || (mode === 'existing' && !spaceId)}>
          {busy ? <span className="spinner" /> : <Icon name="download" />} {tr('{n} Seiten importieren', { n: job.preview?.pages })}
        </button>
        <button className="btn ghost" onClick={async () => { await api.del(`/admin/imports/${job.id}`); onStarted(); }}>{tr('Verwerfen')}</button>
      </div>
    </div>
  );
}

function JobView({ id, onReset }) {
  const [job, setJob] = useState(null);
  const [tick, setTick] = useState(0);
  const { loadSpaces } = useApp();
  useEffect(() => {
    let timer;
    let alive = true;
    const poll = async () => {
      try {
        const { job: j } = await api.get(`/admin/imports/${id}`);
        if (!alive) return;
        setJob(j);
        if (['analyzing', 'running'].includes(j.status)) timer = setTimeout(poll, 800);
        if (j.status === 'done') loadSpaces();
      } catch { timer = setTimeout(poll, 2000); }
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [id, tick, loadSpaces]);

  if (!job) return <Spinner />;
  return (
    <section>
      <div className="section-h"><h2>{jobLabel(job)}</h2><span className="small muted">{STATUS_LABEL[job.status]?.()}</span></div>
      {job.status === 'analyzing' && (
        <div className="col">
          <p className="muted">{tr('Die Quelle wird gelesen und umgewandelt. Bei API-Importen kann das je nach Umfang einige Minuten dauern.')}</p>
          {job.total > 0 ? <Progress value={job.progress} total={job.total} /> : <Spinner />}
        </div>
      )}
      {job.status === 'ready' && (
        <div className="grid-2" style={{ alignItems: 'start', marginTop: 12 }}>
          <div>
            <Preview job={job} />
            <Warnings warnings={job.warnings} />
          </div>
          <div>
            <div className="section-h"><h2>{tr('Import-Optionen')}</h2></div>
            <RunForm job={job} onStarted={() => { setJob({ ...job, status: 'running', progress: 0 }); setTick((t) => t + 1); }} />
          </div>
        </div>
      )}
      {job.status === 'running' && (
        <div className="col" style={{ maxWidth: 520 }}>
          <p className="muted">{tr('Seiten und Anhänge werden geschrieben, anschließend werden Links umgestellt.')}</p>
          <Progress value={job.progress} total={job.total} />
        </div>
      )}
      {job.status === 'done' && (
        <div className="col" style={{ gap: 14 }}>
          <table className="status-table" style={{ maxWidth: 520 }}>
            <tbody>
              <tr><th>{tr('Neu angelegt')}</th><td>{job.result.created}</td></tr>
              <tr><th>{tr('Als neue Version gespeichert')}</th><td>{job.result.updated}</td></tr>
              <tr><th>{tr('Übersprungen')}</th><td>{job.result.skipped}</td></tr>
              <tr><th>{tr('Anhänge')}</th><td>{job.result.attachments}</td></tr>
              {job.result.failed > 0 && <tr className="warn"><th>{tr('Fehlgeschlagen')}</th><td>{job.result.failed}</td></tr>}
            </tbody>
          </table>
          <div className="row wrap">
            {job.result.spaces?.map((s) => <Link key={s.id} to={`/s/${s.key}`} className="btn"><Icon name="folder" size={15} /> {s.name}</Link>)}
            {job.result.firstPageId && <Link to={`/p/${job.result.firstPageId}`} className="btn">{tr('Erste importierte Seite')}</Link>}
            <button className="btn primary" onClick={onReset}>{tr('Weiteren Import starten')}</button>
          </div>
          <Warnings warnings={job.warnings} />
        </div>
      )}
      {['failed', 'discarded'].includes(job.status) && (
        <div className="col">
          <div className="error-box" role="alert">{trServer(job.error) || tr('Der Import wurde verworfen.')}</div>
          <div><button className="btn" onClick={onReset}>{tr('Zurück')}</button></div>
          <Warnings warnings={job.warnings} />
        </div>
      )}
    </section>
  );
}

function SourceForm({ source, onCreated, onBack }) {
  const { toast } = useApp();
  const [file, setFile] = useState(null);
  const [extra, setExtra] = useState(null);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('source', source.id);
      if (file) fd.append('file', file);
      if (extra) fd.append('extra', extra);
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      const res = await fetch('/api/admin/imports', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onCreated(data.job.id);
    } catch (err) {
      toast(err.message, 'error');
    }
    setBusy(false);
  };

  return (
    <form className="grid-2" style={{ alignItems: 'start' }} onSubmit={submit}>
      <div className="col" style={{ gap: 16 }}>
        <div className="section-h"><h2>{source.name}{source.variant ? `: ${source.variant()}` : ''}</h2></div>
        {source.kind === 'file' ? (
          <>
            <div className="field">
              <label htmlFor="imp-file">{tr('Exportdatei')}</label>
              <input id="imp-file" type="file" className="input" style={{ paddingTop: 6 }} accept={source.accept} required onChange={(e) => setFile(e.target.files[0] || null)} />
              {file && <span className="hint">{file.name}, {formatBytes(file.size)}</span>}
            </div>
            {source.extra && (
              <div className="field">
                <label htmlFor="imp-extra">{tr('Bilder (optional, ZIP des images-Ordners)')}</label>
                <input id="imp-extra" type="file" className="input" style={{ paddingTop: 6 }} accept=".zip" onChange={(e) => setExtra(e.target.files[0] || null)} />
              </div>
            )}
          </>
        ) : (
          source.fields.map(([key, label, placeholder]) => (
            <div className="field" key={key}>
              <label htmlFor={`imp-${key}`}>{label()}</label>
              <input id={`imp-${key}`} className="input" required type={/secret|token/i.test(key) ? 'password' : 'text'} autoComplete="off"
                placeholder={placeholder} value={fields[key] || ''} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} />
            </div>
          ))
        )}
        <div className="row">
          <button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="search" />} {tr('Analysieren')}</button>
          <button type="button" className="btn ghost" onClick={onBack}>{tr('Andere Quelle wählen')}</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>{tr('Die Analyse zeigt zuerst eine Vorschau. Es wird nichts geschrieben, bevor du den Import bestätigst.')}</p>
      </div>
      <div className="col" style={{ gap: 12 }}>
        <div className="section-h"><h2>{tr('So kommst du an die Daten')}</h2></div>
        <p style={{ margin: 0 }}>{source.howto()}</p>
        <p className="muted" style={{ margin: 0 }}>{source.note()}</p>
        {source.kind === 'api' && <p className="small muted" style={{ margin: 0 }}>{tr('Zugangsdaten werden nur für diesen Abruf verwendet und nicht gespeichert.')}</p>}
      </div>
    </form>
  );
}

export default function Import() {
  const [source, setSource] = useState(null);
  const [jobId, setJobId] = useState(null);
  const history = useFetch('/admin/imports', [jobId]);
  const reset = () => { setJobId(null); setSource(null); history.reload(); };
  const grouped = useMemo(() => SOURCES, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr('Import')}</h1>
          <p>{tr('Inhalte aus einem anderen Wiki übernehmen. Seitenhierarchie, Bilder, Anhänge, Tags und interne Links bleiben erhalten.')}</p>
        </div>
      </div>

      {jobId ? <JobView id={jobId} onReset={reset} />
        : source ? <SourceForm source={source} onBack={() => setSource(null)} onCreated={setJobId} />
          : (
            <section>
              <div className="section-h"><h2>{tr('Quelle wählen')}</h2></div>
              <div className="choice-list">
                {grouped.map((s) => (
                  <button key={s.id} className="choice" onClick={() => setSource(s)}>
                    <Icon name={s.icon} size={18} />
                    <strong>{s.name}{s.variant ? <span className="muted" style={{ fontWeight: 400, gridColumn: 'auto', display: 'inline', marginLeft: 6 }}>{s.variant()}</span> : null}</strong>
                    <span>{s.note()}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

      {!jobId && history.data?.jobs?.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <div className="section-h"><h2>{tr('Bisherige Importe')}</h2></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{tr('Quelle')}</th><th>{tr('Status')}</th><th>{tr('Ergebnis')}</th><th>{tr('Von')}</th><th>{tr('Gestartet')}</th></tr></thead>
              <tbody>
                {history.data.jobs.map((j) => (
                  <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => setJobId(j.id)}>
                    <td className="ellipsis" style={{ maxWidth: 380 }}>{jobLabel(j)}</td>
                    <td>{STATUS_LABEL[j.status]?.()}</td>
                    <td className="small">{j.status === 'done' ? tr('{c} neu, {u} aktualisiert, {s} übersprungen', { c: j.result.created, u: j.result.updated, s: j.result.skipped }) : j.error ? <span className="muted">{trServer(j.error)}</span> : ''}</td>
                    <td className="small">{j.createdBy}</td>
                    <td className="small nowrap">{formatDate(j.createdAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
