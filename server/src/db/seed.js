import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, query, tx } from './index.js';
import { hashPassword } from '../lib/auth.js';
import { htmlToText } from '../lib/sanitize.js';

const task = (text, checked = false) => `<li data-type="taskItem" data-checked="${checked}"><p>${text}</p></li>`;
const tasks = (...items) => `<ul data-type="taskList">${items.join('')}</ul>`;
const callout = (variant, html) => `<div data-type="callout" data-variant="${variant}">${html}</div>`;
const code = (lang, src) => `<pre><code class="language-${lang}">${src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
const table = (head, ...rows) =>
  `<table><tbody><tr>${head.map((h) => `<th><p>${h}</p></th>`).join('')}</tr>${rows
    .map((r) => `<tr>${r.map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

export const BUILTIN_TEMPLATES = [
  {
    name: 'Runbook',
    description: 'Schritt-für-Schritt-Anleitung für wiederkehrende Betriebsaufgaben',
    icon: 'book-open',
    page_type: 'runbook',
    tags: ['runbook'],
    properties: { Service: '', Verantwortlich: '', Dauer: '~15 min', Risiko: 'niedrig' },
    content: `<h2>Zweck</h2><p>Wofür ist dieses Runbook und wann wird es ausgeführt?</p>
${callout('warning', '<p><strong>Voraussetzungen:</strong> Zugriff auf … / Wartungsfenster angekündigt / Backup vorhanden.</p>')}
<h2>Schritte</h2>
<ol><li><p>Verbindung zum Host herstellen</p></li></ol>
${code('bash', 'ssh admin@host.example.com')}
<ol start="2"><li><p>Status prüfen</p></li></ol>
${code('bash', 'systemctl status mein-dienst')}
<h2>Verifikation</h2>${tasks(task('Dienst läuft'), task('Monitoring ist grün'), task('Ticket aktualisiert'))}
<h2>Rollback</h2><p>Was tun, wenn etwas schiefgeht?</p>`,
  },
  {
    name: 'Incident Postmortem',
    description: 'Blameless Postmortem mit Timeline, Root Cause und Maßnahmen',
    icon: 'siren',
    page_type: 'incident',
    tags: ['incident', 'postmortem'],
    properties: { Schweregrad: 'SEV-2', Status: 'gelöst', Beginn: '', Ende: '', 'Incident Commander': '', 'Betroffene Dienste': '' },
    content: `${callout('info', '<p>Dieses Postmortem ist <strong>blameless</strong>: Wir suchen Ursachen in Systemen und Prozessen, nicht bei Personen.</p>')}
<h2>Zusammenfassung</h2><p>Was ist passiert, in zwei bis drei Sätzen?</p>
<h2>Auswirkung</h2><p>Welche Nutzer/Dienste waren wie lange betroffen?</p>
<h2>Timeline</h2>${table(['Zeit (UTC)', 'Ereignis'], ['00:00', 'Alarm ausgelöst'], ['00:05', 'On-Call bestätigt'], ['00:30', 'Mitigation ausgerollt'])}
<h2>Root Cause</h2><p>Technische Ursache …</p>
<h2>Was lief gut / schlecht</h2><ul><li><p>Gut: …</p></li><li><p>Schlecht: …</p></li></ul>
<h2>Maßnahmen</h2>${tasks(task('Monitoring-Lücke schließen'), task('Runbook aktualisieren'))}`,
  },
  {
    name: 'Server / Host',
    description: 'Steckbrief eines Servers mit Hardware, Netzwerk und Diensten',
    icon: 'server',
    page_type: 'host',
    tags: ['server'],
    properties: { Hostname: 'srv-app-01', 'IP-Adresse': '10.0.10.21', Betriebssystem: 'Debian 12', Umgebung: 'Produktion', Standort: 'RZ1 / Rack A3', Verantwortlich: '', Wartungsfenster: 'Di 22:00–23:00' },
    content: `<h2>Übersicht</h2><p>Wofür wird dieser Host verwendet?</p>
<h2>Hardware / VM</h2>${table(['Komponente', 'Wert'], ['CPU', '4 vCPU'], ['RAM', '16 GB'], ['Disk', '100 GB SSD'])}
<h2>Netzwerk</h2>${table(['Interface', 'IP', 'VLAN'], ['eth0', '10.0.10.21/24', '10'])}
<h2>Dienste</h2>${table(['Dienst', 'Port', 'Hinweis'], ['nginx', '443/tcp', 'Reverse Proxy'], ['node_exporter', '9100/tcp', 'Monitoring'])}
<h2>Zugang</h2>${callout('danger', '<p>Zugangsdaten gehören in den Passwort-Manager – <strong>niemals</strong> ins Wiki.</p>')}
${code('bash', 'ssh -J bastion.example.com admin@srv-app-01')}
<h2>Backup</h2><p>Was wird wie oft wohin gesichert?</p>`,
  },
  {
    name: 'Change Request',
    description: 'Geplante Änderung mit Risikoabschätzung, Plan und Rollback',
    icon: 'git-pull-request',
    page_type: 'change',
    tags: ['change'],
    properties: { 'Change-ID': 'CHG-0000', Status: 'geplant', Termin: '', Risiko: 'mittel', Genehmigt: 'nein' },
    content: `<h2>Beschreibung</h2><p>Was soll geändert werden und warum?</p>
<h2>Risiko & Auswirkung</h2><p>Welche Systeme sind betroffen? Ist Downtime nötig?</p>
<h2>Durchführungsplan</h2>${tasks(task('Stakeholder informieren'), task('Backup/Snapshot erstellen'), task('Änderung durchführen'), task('Tests durchführen'))}
<h2>Rollback-Plan</h2><p>…</p><h2>Ergebnis</h2><p>…</p>`,
  },
  {
    name: 'Service-Dokumentation',
    description: 'Architektur, Abhängigkeiten und Betrieb eines Dienstes',
    icon: 'boxes',
    page_type: 'service',
    tags: ['service'],
    properties: { Service: '', Team: '', SLA: '99,9 %', Repository: '', Dashboard: '', 'On-Call': '' },
    content: `<h2>Überblick</h2><p>Was macht der Dienst?</p><h2>Architektur</h2><p>Komponenten und Datenfluss …</p>
<h2>Abhängigkeiten</h2><ul><li><p>Datenbank: …</p></li><li><p>Externe APIs: …</p></li></ul>
<h2>Deployment</h2>${code('bash', 'docker compose pull && docker compose up -d')}
<h2>Monitoring & Alerts</h2>${table(['Alert', 'Bedeutung', 'Runbook'], ['HighErrorRate', '5xx > 2 %', '…'])}
<h2>Bekannte Probleme</h2><p>…</p>`,
  },
  {
    name: 'Netzwerk-Segment',
    description: 'VLAN/Subnetz mit IP-Plan, Gateways und Firewall-Regeln',
    icon: 'network',
    page_type: 'network',
    tags: ['netzwerk'],
    properties: { VLAN: '10', Subnetz: '10.0.10.0/24', Gateway: '10.0.10.1', DHCP: 'nein', Zone: 'DMZ' },
    content: `<h2>Zweck</h2><p>Welche Systeme leben in diesem Segment?</p>
<h2>IP-Plan</h2>${table(['Bereich', 'Verwendung'], ['10.0.10.1', 'Gateway'], ['10.0.10.10–49', 'Server (statisch)'], ['10.0.10.200–250', 'Reserve'])}
<h2>Firewall-Regeln</h2>${table(['Quelle', 'Ziel', 'Port', 'Aktion'], ['any', '10.0.10.0/24', '443/tcp', 'allow'])}`,
  },
  {
    name: 'Checkliste',
    description: 'Einfache abhakbare Checkliste, z. B. für Onboarding oder Audits',
    icon: 'list-checks',
    page_type: 'checklist',
    tags: ['checkliste'],
    properties: {},
    content: `<h2>Checkliste</h2>${tasks(task('Erster Punkt'), task('Zweiter Punkt'), task('Dritter Punkt'))}`,
  },
];

async function seedTemplates() {
  const { n } = await one('SELECT count(*)::int AS n FROM templates');
  if (n > 0) return;
  let i = 0;
  for (const t of BUILTIN_TEMPLATES) {
    await query(
      `INSERT INTO templates (name, description, icon, page_type, content, properties, tags, sort_order, is_builtin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [t.name, t.description, t.icon, t.page_type, t.content, t.properties, t.tags, i++],
    );
  }
  console.log(`[seed] ${BUILTIN_TEMPLATES.length} Vorlagen angelegt`);
}

async function seedAdmin() {
  const { n } = await one('SELECT count(*)::int AS n FROM users');
  if (n > 0) return null;
  const generated = !config.admin.password;
  const password = config.admin.password || crypto.randomBytes(12).toString('base64url');
  const user = await one(
    `INSERT INTO users (username, email, display_name, password_hash, role) VALUES ($1,$2,$3,$4,'admin') RETURNING *`,
    [config.admin.username, config.admin.email, 'Administrator', await hashPassword(password)],
  );
  const line = '='.repeat(64);
  console.log(`\n${line}\n  Bastion: Administrator angelegt\n  Benutzer: ${config.admin.username}\n  Passwort: ${generated ? password : '(aus ADMIN_PASSWORD)'}\n${line}\n`);
  return user;
}

async function seedDemo(admin) {
  const { n } = await one('SELECT count(*)::int AS n FROM spaces');
  if (n > 0 || !config.seedDemo) return;

  await tx(async (c) => {
    const mkSpace = async (key, name, description, icon, color, order) => {
      const { rows } = await c.query(
        `INSERT INTO spaces (key, name, description, icon, color, sort_order, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [key, name, description, icon, color, order, admin?.id ?? null],
      );
      return rows[0].id;
    };
    const tagIds = {};
    const mkPage = async (spaceId, parentId, title, slug, type, html, tags = [], props = {}, extra = {}) => {
      const { rows } = await c.query(
        `INSERT INTO pages (space_id, parent_id, title, slug, icon, content, content_text, page_type, properties, review_due, is_pinned, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id`,
        [spaceId, parentId, title, slug, extra.icon ?? null, html, htmlToText(html), type, props, extra.reviewDue ?? null, Boolean(extra.pinned), admin?.id ?? null],
      );
      const id = rows[0].id;
      await c.query(
        `INSERT INTO page_revisions (page_id, version, title, content, properties, summary, author_id) VALUES ($1,1,$2,$3,$4,'Beispielinhalt',$5)`,
        [id, title, html, props, admin?.id ?? null],
      );
      for (const t of tags) {
        if (!tagIds[t]) {
          const r = await c.query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [t]);
          tagIds[t] = r.rows[0].id;
        }
        await c.query('INSERT INTO page_tags VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, tagIds[t]]);
      }
      return id;
    };

    const infra = await mkSpace('infra', 'Infrastruktur', 'Server, Netzwerk, Storage und Virtualisierung', 'server', '#0ea5e9', 0);
    const ops = await mkSpace('ops', 'Betrieb & Runbooks', 'Runbooks, On-Call und wiederkehrende Aufgaben', 'terminal', '#22c55e', 1);
    const sec = await mkSpace('security', 'Security', 'Härtung, Zertifikate, Zugänge und Audits', 'shield', '#ef4444', 2);
    const inc = await mkSpace('incidents', 'Incidents', 'Postmortems und Störungsberichte', 'siren', '#f59e0b', 3);

    await mkPage(infra, null, 'Willkommen bei Bastion', 'willkommen', 'doc', `
<p>Bastion ist eure Wissensbasis für den IT-Betrieb. Ein paar Tipps für den Einstieg:</p>
${callout('tip', '<p>Drücke <kbd>Strg</kbd> + <kbd>K</kbd> für die <strong>Befehlspalette</strong> und systemweite Suche. Filter wie <code>tag:linux</code>, <code>space:ops</code> oder <code>type:runbook</code> funktionieren direkt im Suchfeld.</p>')}
<h2>Was kann Bastion?</h2>
<ul>
<li><p><strong>Bereiche</strong> mit eigenen Berechtigungen für Teams und Gruppen</p></li>
<li><p><strong>Vorlagen</strong> für Runbooks, Postmortems, Server-Steckbriefe und Changes</p></li>
<li><p><strong>Eigenschaften</strong> (Hostname, IP, Owner …) – durchsuchbar wie der Text</p></li>
<li><p><strong>Review-Termine</strong>, damit Doku nicht veraltet</p></li>
<li><p><strong>Versionshistorie</strong> mit Diff und Wiederherstellung</p></li>
<li><p><strong>REST-API</strong> mit persönlichen Tokens für Automatisierung</p></li>
</ul>
<h2>API-Beispiel</h2>
${code('bash', `curl -H "Authorization: Bearer bst_…" \\\n     "https://wiki.example.com/api/search?q=nginx%20tag:runbook"`)}`,
    ['intro'], {}, { pinned: true, icon: '👋' });

    const net = await mkPage(infra, null, 'Netzwerk', 'netzwerk', 'doc', `<p>Übersicht über alle Netzsegmente.</p>
${table(['VLAN', 'Subnetz', 'Zweck'], ['10', '10.0.10.0/24', 'Server'], ['20', '10.0.20.0/24', 'Clients'], ['99', '10.0.99.0/24', 'Management'])}`, ['netzwerk'], {}, { icon: '🌐' });
    await mkPage(infra, net, 'VLAN 10 – Server', 'vlan-10-server', 'network', BUILTIN_TEMPLATES[5].content, ['netzwerk', 'vlan'], BUILTIN_TEMPLATES[5].properties);
    await mkPage(infra, null, 'srv-web-01', 'srv-web-01', 'host', BUILTIN_TEMPLATES[2].content, ['server', 'linux', 'nginx'],
      { Hostname: 'srv-web-01', 'IP-Adresse': '10.0.10.11', Betriebssystem: 'Debian 12', Umgebung: 'Produktion', Standort: 'RZ1 / Rack A1', Verantwortlich: 'Team Web' },
      { reviewDue: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10) });

    await mkPage(ops, null, 'Zertifikat erneuern (Let\'s Encrypt)', 'zertifikat-erneuern', 'runbook', `
<h2>Zweck</h2><p>Manuelle Erneuerung, falls der automatische Renew fehlschlägt.</p>
${callout('warning', '<p>Vorher prüfen, ob Port 80 von außen erreichbar ist.</p>')}
<h2>Schritte</h2>
${code('bash', 'sudo certbot renew --dry-run\nsudo certbot renew\nsudo systemctl reload nginx')}
<h2>Verifikation</h2>
${code('bash', 'echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates')}
${tasks(task('Ablaufdatum > 60 Tage'), task('Monitoring-Check grün'))}`, ['runbook', 'tls', 'nginx'], { Service: 'nginx', Dauer: '~5 min', Risiko: 'niedrig' }, { icon: '🔐' });

    await mkPage(ops, null, 'Festplatte voll – Erste Hilfe', 'festplatte-voll', 'runbook', `
<h2>Diagnose</h2>
${code('bash', 'df -h\nsudo du -xh / --max-depth=2 2>/dev/null | sort -h | tail -20\nsudo journalctl --disk-usage')}
<h2>Schnelle Abhilfe</h2>
${code('bash', 'sudo journalctl --vacuum-time=7d\nsudo apt-get clean\ndocker system prune -f')}
${callout('danger', '<p>Niemals Dateien in <code>/var/lib/postgresql</code> löschen!</p>')}`, ['runbook', 'linux', 'storage'], { Risiko: 'mittel' }, { pinned: true, icon: '💾' });

    await mkPage(ops, null, 'On-Call Übergabe', 'on-call', 'checklist', `<p>Checkliste für die wöchentliche Übergabe.</p>
${tasks(task('Offene Incidents besprochen', true), task('Geplante Changes der Woche geprüft'), task('Alert-Rauschen reviewt'), task('Pager-Weiterleitung umgestellt'))}`, ['on-call'], {}, { icon: '📟' });

    await mkPage(sec, null, 'SSH-Härtung', 'ssh-haertung', 'howto', `
<p>Empfohlene Basiskonfiguration für <code>/etc/ssh/sshd_config</code>:</p>
${code('ini', 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nAllowGroups ssh-users\nMaxAuthTries 3')}
${code('bash', 'sudo sshd -t && sudo systemctl reload ssh')}`, ['security', 'linux', 'ssh'], {}, { icon: '🛡️' });

    await mkPage(inc, null, '2026-09-12 – Ausfall Datenbank-Cluster', '2026-09-12-db-ausfall', 'incident', BUILTIN_TEMPLATES[1].content, ['incident', 'postmortem', 'postgres'],
      { Schweregrad: 'SEV-1', Status: 'gelöst', Beginn: '2026-09-12 03:12', Ende: '2026-09-12 04:40', 'Betroffene Dienste': 'API, Webshop' });
  });
  console.log('[seed] Beispielinhalte angelegt');
}

export async function bootstrap() {
  const admin = await seedAdmin();
  await seedTemplates();
  await seedDemo(admin || (await one(`SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1`)));
}
