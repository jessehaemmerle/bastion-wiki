import { useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Confirm, Modal, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { formatBytes, formatDate, timeAgo } from '../../lib/format.js';
import { tr, trServer } from '../../lib/i18n.js';
import { Field, SaveBar, useIntegrations } from './integrationForm.jsx';

const KIND = {
  get auto() { return tr('automatisch'); },
  get manual() { return tr('manuell'); },
  get upload() { return tr('hochgeladen'); },
};

function RestoreModal({ source, onClose }) {
  const { toast, setUser } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      let res;
      if (source.file) {
        const fd = new FormData();
        fd.append('confirm', 'RESTORE');
        fd.append('file', source.file);
        const r = await fetch('/api/admin/ops/restore', { method: 'POST', body: fd, credentials: 'same-origin' });
        res = await r.json();
        if (!r.ok) throw new Error(res.error);
      } else {
        res = await api.post('/admin/ops/restore', { name: source.name, confirm: 'RESTORE' });
      }
      alert([tr('Wiederherstellung abgeschlossen. Alle Sitzungen wurden beendet – bitte neu anmelden.'),
        tr('Der vorherige Stand liegt als Sicherung „{name}“ bereit.', { name: res.safetyBackup }), ...(res.warnings || [])].join('\n\n'));
      setUser(null);
      location.href = '/login';
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };
  const word = tr('WIEDERHERSTELLEN');
  return (
    <Modal title={tr('Sicherung wiederherstellen')} icon="archive-restore" onClose={busy ? undefined : onClose}
      footer={<><button className="btn" disabled={busy} onClick={onClose}>{tr('Abbrechen')}</button><button className="btn danger" disabled={busy || text !== word} onClick={run}>{busy ? <span className="spinner" /> : <Icon name="archive-restore" size={15} />} {tr('Wiederherstellen')}</button></>}>
      <div className="col" style={{ gap: 12 }}>
        <div className="review-banner" style={{ margin: 0 }}>
          <Icon name="alert-triangle" size={18} />
          <div>{tr('Ersetzt alle Inhalte, Benutzer, Rechte und Einstellungen durch den Stand von „{name}“. Vorher wird automatisch eine Sicherung des aktuellen Stands angelegt.', { name: source.name || source.file?.name })}</div>
        </div>
        <div className="small muted">{tr('Geheimnisse, 2FA-Schlüssel und gespeicherte Passwörter lassen sich nur entschlüsseln, wenn dieselbe SECRET_KEY bzw. secret.key wie bei der Sicherung verwendet wird.')}</div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="rs-confirm">{tr('Zur Bestätigung „{word}“ eingeben', { word })}</label>
          <input id="rs-confirm" className="input mono" value={text} onChange={(e) => setText(e.target.value)} autoFocus disabled={busy} />
        </div>
      </div>
    </Modal>
  );
}

function Backups({ sec }) {
  const { toast } = useApp();
  const { data, reload } = useFetch('/admin/ops/backups');
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState(null);
  const [del, setDel] = useState(null);
  const fileRef = useRef(null);
  const create = async () => {
    setBusy(true);
    try {
      const { backup } = await api.post('/admin/ops/backups');
      toast(tr('Sicherung erstellt ({size})', { size: formatBytes(backup.size) }));
      reload();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const fields = [
    { key: 'enabled', label: tr('Täglich automatisch sichern'), type: 'bool', wide: true },
    { key: 'hour', label: tr('Uhrzeit (Stunde, Serverzeit)'), type: 'number', min: 0, max: 23 },
    { key: 'keep', label: tr('Automatische Sicherungen behalten'), type: 'number', min: 1, max: 365 },
  ];
  return (
    <section className="settings-section">
      <div>
        <h3>{tr('Sicherungen')}</h3>
        <p>{tr('Komplette Sicherung als .tar.gz: alle Tabellen (inkl. Benutzer, Versionen, Audit-Log), alle Dateien und eine lesbare Markdown-Kopie. Gespeichert im Daten-Volume unter backups/ – zusätzlich extern ablegen!')}</p>
      </div>
      <div className="col" style={{ gap: 14 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" onClick={create} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="archive" size={15} />} {tr('Jetzt sichern')}</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> {tr('Sicherung hochladen & wiederherstellen …')}</button>
          <input ref={fileRef} type="file" accept=".gz,.tgz,application/gzip" hidden onChange={(e) => { if (e.target.files[0]) setRestore({ file: e.target.files[0] }); e.target.value = ''; }} />
        </div>
        {!data ? <Spinner /> : (
          <div className="table-wrap card">
            <table className="data">
              <thead><tr><th>{tr('Sicherung')}</th><th>{tr('Art')}</th><th>{tr('Größe')}</th><th>{tr('Erstellt')}</th><th /></tr></thead>
              <tbody>
                {!data.backups.length && <tr><td colSpan={5} className="faint small">{tr('Noch keine Sicherungen.')}</td></tr>}
                {data.backups.map((b) => (
                  <tr key={b.name}>
                    <td className="mono small">{b.name}</td>
                    <td className="small">{KIND[b.kind]}</td>
                    <td className="mono small">{formatBytes(b.size)}</td>
                    <td className="small" title={formatDate(b.createdAt, true)}>{timeAgo(b.createdAt)}</td>
                    <td className="actions">
                      <a className="btn ghost icon sm" href={`/api/admin/ops/backups/${encodeURIComponent(b.name)}`} aria-label={tr('Herunterladen')}><Icon name="download" size={14} /></a>
                      <button className="btn ghost sm" onClick={() => setRestore({ name: b.name })}>{tr('Wiederherstellen')}</button>
                      <button className="btn ghost icon sm" onClick={() => setDel(b)} aria-label={tr('Löschen')}><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-grid">{fields.map((f) => <Field key={f.key} f={f} sec={sec} />)}</div>
        <SaveBar sec={sec} />
      </div>
      {restore && <RestoreModal source={restore} onClose={() => setRestore(null)} />}
      {del && <Confirm danger title={tr('Sicherung löschen?')} message={del.name} confirmLabel={tr('Löschen')} onClose={() => setDel(null)}
        onConfirm={async () => { await api.del(`/admin/ops/backups/${encodeURIComponent(del.name)}`); reload(); }} />}
    </section>
  );
}

function Git({ sec }) {
  const { toast } = useApp();
  const { data, setData } = useFetch('/admin/ops/git');
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      if (sec.dirty && !(await sec.save())) { setBusy(false); return; }
      const r = await api.post('/admin/ops/git/sync');
      setData((d) => ({ ...d, state: r.state }));
      if (r.error) toast(trServer(r.error), 'error');
      else toast(r.result?.changed ? tr('{n} Dateien übertragen', { n: r.result.files }) : tr('Keine Änderungen'));
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };
  const fields = [
    { key: 'enabled', label: tr('Regelmäßig synchronisieren'), type: 'bool', wide: true },
    { key: 'remote', label: tr('Repository-URL'), type: 'password', placeholder: 'https://user:token@git.example.org/ops/wiki-export.git', hint: tr('HTTPS mit Zugangstoken in der URL. Wird verschlüsselt gespeichert.') },
    { key: 'branch', label: tr('Branch'), mono: true },
    { key: 'intervalMinutes', label: tr('Intervall (Minuten)'), type: 'number', min: 5, max: 10080 },
    { key: 'authorName', label: tr('Commit-Autor'), placeholder: 'Bastion' },
    { key: 'authorEmail', label: tr('Commit-E-Mail'), mono: true },
  ];
  const st = data?.state;
  return (
    <section className="settings-section">
      <div>
        <h3>{tr('Git-Export')}</h3>
        <p>{tr('Spiegelt alle Seiten als Markdown-Ordnerstruktur in ein Git-Repository – lesbar auch, wenn das Wiki ausgefallen ist. Das Wiki ist die Quelle: Änderungen im Repository werden beim nächsten Abgleich überschrieben.')}</p>
      </div>
      <div className="col" style={{ gap: 14 }}>
        {data && !data.available && <div className="error-box">{tr('Das Programm „git“ ist auf dem Server nicht installiert.')}</div>}
        <div className="form-grid">{fields.map((f) => <Field key={f.key} f={f} sec={sec} />)}</div>
        <SaveBar sec={sec}>
          <button className="btn" onClick={sync} disabled={busy || !(sec.values.remoteSet || sec.draft.remote)}>{busy ? <span className="spinner" /> : <Icon name="git-commit" size={15} />} {tr('Jetzt synchronisieren')}</button>
        </SaveBar>
        {st && (st.lastRun || st.lastError) && (
          <dl className="kv small">
            <dt>{tr('Letzter Lauf')}</dt><dd>{st.lastRun ? formatDate(st.lastRun, true) : '—'}</dd>
            <dt>{tr('Letzter Erfolg')}</dt><dd>{st.lastOk ? formatDate(st.lastOk, true) : '—'}{st.lastCommit && <span className="mono"> · {st.lastCommit}</span>}</dd>
            {st.lastError && <><dt>{tr('Fehler')}</dt><dd className="mono" style={{ color: 'var(--danger)' }}>{st.lastError}</dd></>}
          </dl>
        )}
      </div>
    </section>
  );
}

function KeyAndMetrics({ meta }) {
  return (
    <section className="settings-section">
      <div><h3>{tr('Schlüssel & Monitoring')}</h3><p>{tr('Hinweise für Betrieb und Überwachung.')}</p></div>
      <div className="col" style={{ gap: 14 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{tr('Verschlüsselungsschlüssel')}</div>
          <div className="small">{meta.keySource === 'env'
            ? tr('Aus der Umgebungsvariable SECRET_KEY. Diesen Wert sicher (z. B. im Passwort-Tresor) aufbewahren.')
            : tr('Automatisch erzeugt in {file}. Diese Datei gehört zu jeder Sicherung dazu – ohne sie sind Geheimnisse und 2FA-Schlüssel verloren.', { file: meta.keyFile })}</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{tr('Prometheus')}</div>
          <div className="small">{tr('Metriken unter /metrics – mit einem Admin-API-Token oder dem Token aus METRICS_TOKEN abrufen:')}</div>
          <pre className="secret-box" style={{ display: 'block', margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{`- job_name: bastion
  metrics_path: /metrics
  authorization:
    credentials: <METRICS_TOKEN>
  static_configs:
    - targets: ['${location.host}']`}</pre>
        </div>
      </div>
    </section>
  );
}

export default function Backup() {
  const { data, section } = useIntegrations();
  if (!data) return <Spinner center />;
  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Sicherung & Export')}</h1><p>{tr('Backups mit Wiederherstellung, Git-Spiegel und Hinweise zum Betrieb.')}</p></div>
      </div>
      <div className="card pad">
        <Backups sec={section('backup')} />
        <Git sec={section('git')} />
        <KeyAndMetrics meta={data.meta} />
      </div>
    </>
  );
}
