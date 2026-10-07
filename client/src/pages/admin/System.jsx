import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { tr } from '../../lib/i18n.js';

const TASKS = [
  ['purge-sessions', 'log-out', 'Abgelaufene Sitzungen löschen', 'Entfernt verwaiste Login-Sitzungen aus der Datenbank.'],
  ['purge-tags', 'tags', 'Unbenutzte Tags entfernen', 'Löscht Tags, die keiner Seite mehr zugeordnet sind.'],
  ['purge-orphans', 'paperclip', 'Verwaiste Dateien aufräumen', 'Löscht Dateien im Upload-Verzeichnis ohne Datenbankeintrag.'],
  ['prune-revisions', 'git-branch', 'Alte Versionen kürzen', 'Behält pro Seite nur die letzten 50 Versionen.'],
  ['reindex-links', 'link', 'Link-Index neu aufbauen', 'Liest alle Seiten neu ein für Rückverweise und Link-Prüfung.'],
  ['vacuum', 'database', 'Datenbank optimieren', 'Führt VACUUM ANALYZE aus (kann kurz dauern).'],
];

export default function System() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(null);
  const run = async (task) => {
    if (task === 'prune-revisions' && !confirm(tr('Wirklich alte Versionen löschen? Dies kann nicht rückgängig gemacht werden.'))) return;
    setBusy(task);
    try {
      const { result } = await api.post(`/admin/maintenance/${task}`);
      toast(typeof result === 'number' ? tr('Erledigt – {n} Einträge bereinigt', { n: result }) : tr('Erledigt'));
    } catch (e) { toast(e.message, 'error'); }
    setBusy(null);
  };
  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Wartung')}</h1><p>{tr('Aufräumarbeiten und Datenexport.')}</p></div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><h3>{tr('Wartungsaufgaben')}</h3></div>
          <ul className="list">
            {TASKS.map(([id, icon, title, desc]) => (
              <li key={id} className="list-item">
                <span className="li-icon"><Icon name={icon} /></span>
                <div className="grow"><div className="li-title">{tr(title)}</div><div className="li-meta">{tr(desc)}</div></div>
                <button className="btn sm" disabled={!!busy} onClick={() => run(id)}>{busy === id ? <span className="spinner" /> : tr('Ausführen')}</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="col" style={{ gap: 18 }}>
          <div className="card pad col" style={{ gap: 10 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{tr('JSON-Export')}</h3>
            <p className="small muted" style={{ margin: 0 }}>{tr('Kompletter Export von Bereichen, Seiten, Tags, Gruppen, Rechten und Vorlagen (ohne Passwörter & Tokens).')}</p>
            <div><a className="btn primary" href="/api/admin/export"><Icon name="download" /> {tr('Export herunterladen')}</a></div>
          </div>
          <div className="card pad col" style={{ gap: 10 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{tr('Backup')}</h3>
            <p className="small muted" style={{ margin: 0 }}>{tr('Vollständige Sicherungen mit Wiederherstellung gibt es unter „Sicherung & Export“. Alternativ auf Ebene von Datenbank und Volumes:')} <Link to="/admin/backup">{tr('Zur Sicherung')}</Link></p>
            <pre className="secret-box" style={{ margin: 0, display: 'block', whiteSpace: 'pre-wrap' }}>{`docker compose exec -T db pg_dump -U bastion -Fc bastion > bastion-$(date +%F).dump
docker run --rm -v bastion_uploads:/data -v "$PWD":/backup alpine \\
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
# ${tr('dazu gehört der Schlüssel für Geheimnisse:')} /data/secret.key ${tr('bzw.')} SECRET_KEY`}</pre>
          </div>
        </div>
      </div>
    </>
  );
}
