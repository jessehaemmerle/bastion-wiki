import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import ContentView from '../components/ContentView.jsx';
import { Logo } from '../components/Layout.jsx';
import { Spinner, Switch } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { formatDate, PAGE_TYPES } from '../lib/format.js';
import { tr, trn } from '../lib/i18n.js';

const SECRET_REF = /data-secret-id="([A-Za-z0-9_-]{8,64})"/g;

function Setup({ onGenerate }) {
  const { spaces, settings } = useApp();
  const [picked, setPicked] = useState([]);
  const [opts, setOpts] = useState({
    title: tr('Notfallhandbuch'), note: tr('Vertraulich – nur für den internen Gebrauch'), sheets: true, meta: true,
    pageBreaks: true, secrets: false,
  });
  const set = (k, v) => setOpts((o) => ({ ...o, [k]: v }));
  const toggle = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  return (
    <main className="handbook-setup">
      <div className="row between" style={{ marginBottom: 18 }}>
        <Link to="/" className="row" style={{ gap: 8, textDecoration: 'none', color: 'inherit' }}><Logo size={24} /> <strong>{settings.siteName}</strong></Link>
        <Link to="/" className="btn ghost sm"><Icon name="arrow-left" size={14} /> {tr('Zurück zum Wiki')}</Link>
      </div>
      <h1>{tr('Notfallhandbuch')}</h1>
      <p className="muted">{tr('Stellt ausgewählte Bereiche als druckfertiges Dokument zusammen – mit Deckblatt, Inhaltsverzeichnis, Datenblättern und Diagrammen. Über „Als PDF speichern“ im Druckdialog entsteht eine PDF-Datei für den Fall, dass Wiki, Netz oder Strom ausfallen.')}</p>
      <div className="card pad col" style={{ gap: 16 }}>
        <div className="field">
          <label>{tr('Bereiche')}</label>
          <div className="hb-spaces">
            {spaces.map((s) => (
              <label key={s.id} className={`hb-space ${picked.includes(s.key) ? 'on' : ''}`}>
                <input type="checkbox" checked={picked.includes(s.key)} onChange={() => toggle(s.key)} />
                <span className="cable" style={{ '--sc': s.color }} /> <span className="grow">{s.name}</span> <span className="faint tiny mono">{s.pageCount}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <div className="field"><label htmlFor="hb-title">{tr('Titel')}</label><input id="hb-title" className="input" value={opts.title} onChange={(e) => set('title', e.target.value)} /></div>
          <div className="field"><label htmlFor="hb-note">{tr('Vermerk auf dem Deckblatt')}</label><input id="hb-note" className="input" value={opts.note} onChange={(e) => set('note', e.target.value)} /></div>
        </div>
        <div className="col" style={{ gap: 10 }}>
          <Switch checked={opts.sheets} onChange={(v) => set('sheets', v)} label={tr('Datenblätter mit ausgeben')} />
          <Switch checked={opts.meta} onChange={(v) => set('meta', v)} label={tr('Stand, Version und Tags je Seite')} />
          <Switch checked={opts.pageBreaks} onChange={(v) => set('pageBreaks', v)} label={tr('Jede Seite auf einem neuen Blatt beginnen')} />
          <Switch checked={opts.secrets} onChange={(v) => set('secrets', v)} label={tr('Geheimnisse im Klartext einfügen')} />
          {opts.secrets && (
            <div className="error-box small">{tr('Nur Geheimnisse aus Bereichen mit Schreibrecht werden eingefügt, jedes einzelne wird im Audit-Log vermerkt. Das Ergebnis wie ein Passwort behandeln: ausgedruckt im Tresor, nicht als Datei verschicken.')}</div>
          )}
        </div>
        <div><button className="btn primary" disabled={!picked.length} onClick={() => onGenerate(picked, opts)}><Icon name="file-text" size={15} /> {tr('Vorschau erzeugen')}</button></div>
      </div>
    </main>
  );
}

function Document({ data, opts, secretValues, onBack }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.title = opts.title;
    // diagrams render asynchronously – printing waits for them
    const t = setInterval(() => {
      const pending = [...document.querySelectorAll('.handbook .diagram-canvas')].filter((c) => !c.querySelector('svg') && !c.classList.contains('error'));
      if (!pending.length) { setReady(true); clearInterval(t); }
    }, 300);
    return () => clearInterval(t);
  }, [opts.title]);
  const pages = data.spaces.reduce((n, s) => n + s.pages.length, 0);
  return (
    <>
      <div className="handbook-bar no-print">
        <button className="btn ghost sm" onClick={onBack}><Icon name="arrow-left" size={14} /> {tr('Einstellungen')}</button>
        <span className="small muted">{trn(pages, '1 Seite', '{n} Seiten')}</span>
        <div className="grow" />
        <span className="small faint desktop-only">{tr('Im Druckdialog „Als PDF speichern“ wählen.')}</span>
        <button className="btn primary" disabled={!ready} onClick={() => window.print()}>{ready ? <Icon name="printer" size={15} /> : <span className="spinner" />} {tr('Als PDF speichern / drucken')}</button>
      </div>
      <article className={`handbook ${opts.pageBreaks ? 'breaks' : ''}`}>
        <section className="hb-cover">
          <div className="row" style={{ gap: 10 }}><Logo size={36} /> <strong style={{ fontSize: 20 }}>{data.siteName}</strong></div>
          <h1>{opts.title}</h1>
          <p className="hb-spaces-line">{data.spaces.map((s) => s.name).join(' · ')}</p>
          <dl className="hb-facts">
            <dt>{tr('Erstellt')}</dt><dd>{formatDate(data.generatedAt, true)}</dd>
            <dt>{tr('von')}</dt><dd>{data.generatedBy}</dd>
            <dt>{tr('Umfang')}</dt><dd>{trn(pages, '1 Seite', '{n} Seiten')}</dd>
          </dl>
          {opts.note && <p className="hb-note">{opts.note}</p>}
          <p className="hb-hint">{tr('Stand des Ausdrucks – die aktuelle Fassung steht im Wiki.')}</p>
        </section>
        <nav className="hb-toc" aria-label={tr('Inhaltsverzeichnis')}>
          <h2>{tr('Inhalt')}</h2>
          {data.spaces.map((s, si) => (
            <div key={s.key}>
              <div className="hb-toc-space">{si + 1}. {s.name}</div>
              <ol>
                {s.pages.map((p) => (
                  <li key={p.id} style={{ paddingLeft: p.depth * 16 }}>
                    <a href={`#hb-${p.id}`}><span className="mono">{si + 1}.{p.number}</span> {p.title}</a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>
        {data.spaces.map((s, si) => (
          <section key={s.key} className="hb-space-section">
            <h2 className="hb-space-title" style={{ '--sc': s.color }}>{si + 1}. {s.name}</h2>
            {s.description && <p className="muted">{s.description}</p>}
            {s.pages.map((p) => {
              const props = Object.entries(p.properties || {}).filter(([, v]) => v);
              return (
                <section key={p.id} id={`hb-${p.id}`} className={`hb-page depth-${Math.min(p.depth, 3)}`}>
                  <h2 className="hb-page-title"><span className="mono">{si + 1}.{p.number}</span> {p.title}</h2>
                  {opts.meta && (
                    <div className="hb-meta">
                      {p.pageType !== 'doc' && <span>{PAGE_TYPES[p.pageType]?.label}</span>}
                      <span>{tr('Stand {date}', { date: formatDate(p.updatedAt) })}</span>
                      <span>{tr('Version {n}', { n: p.version })}</span>
                      {p.updatedBy && <span>{p.updatedBy}</span>}
                      {p.tags.length > 0 && <span>{p.tags.map((t) => `#${t}`).join(' ')}</span>}
                    </div>
                  )}
                  {opts.sheets && props.length > 0 && (
                    <table className="hb-sheet"><tbody>{props.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
                  )}
                  <ContentView html={p.content} secretMode={opts.secrets ? 'values' : 'hidden'} secretValues={secretValues} />
                </section>
              );
            })}
          </section>
        ))}
      </article>
    </>
  );
}

export default function Handbook() {
  const { toast } = useApp();
  const [state, setState] = useState(null); // { data, opts, secretValues }
  const [busy, setBusy] = useState(false);
  const generate = async (spaces, opts) => {
    setBusy(true);
    try {
      const data = await api.get(`/handbook?spaces=${encodeURIComponent(spaces.join(','))}`);
      let secretValues = {};
      if (opts.secrets) {
        const ids = [...new Set(data.spaces.flatMap((s) => s.pages.flatMap((p) => [...p.content.matchAll(SECRET_REF)].map((m) => m[1]))))];
        if (ids.length) secretValues = (await api.post('/secrets/reveal-batch', { ids, purpose: 'handbook' })).values;
      }
      setState({ data, opts, secretValues });
      window.scrollTo(0, 0);
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const doc = useMemo(() => state && <Document {...state} onBack={() => setState(null)} />, [state]);
  if (busy) return <Spinner center />;
  return doc || <Setup onGenerate={generate} />;
}
