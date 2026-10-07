/**
 * Built-in templates and demo content in German and English.
 * Templates are seeded in both languages (the template picker shows the UI language);
 * demo content follows DEFAULT_LANGUAGE.
 */
const task = (text, checked = false) => `<li data-type="taskItem" data-checked="${checked}"><p>${text}</p></li>`;
const tasks = (...items) => `<ul data-type="taskList">${items.join('')}</ul>`;
const callout = (variant, html) => `<div data-type="callout" data-variant="${variant}">${html}</div>`;
export const code = (lang, src) => `<pre><code class="language-${lang}">${src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
const table = (head, ...rows) =>
  `<table><tbody><tr>${head.map((h) => `<th><p>${h}</p></th>`).join('')}</tr>${rows
    .map((r) => `<tr>${r.map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

// ------------------------------------------------------------------ templates
const TEMPLATES = {
  de: [
    {
      name: 'Runbook', icon: 'book-open', page_type: 'runbook', tags: ['runbook'],
      description: 'Schritt-für-Schritt-Anleitung für wiederkehrende Betriebsaufgaben',
      properties: { Service: '', Verantwortlich: '', Dauer: '~15 min', Risiko: 'niedrig' },
      content: `<h2>Zweck</h2><p>Wofür ist dieses Runbook und wann wird es ausgeführt?</p>
${callout('warning', '<p><strong>Voraussetzungen:</strong> Zugriff auf … / Wartungsfenster angekündigt / Backup vorhanden.</p>')}
<h2>Schritte</h2><ol><li><p>Verbindung zum Host herstellen</p></li></ol>
${code('bash', 'ssh admin@{{Host}}')}
<ol start="2"><li><p>Status prüfen</p></li></ol>
${code('bash', 'systemctl status {{Service}}')}
<h2>Verifikation</h2>${tasks(task('Dienst läuft'), task('Monitoring ist grün'), task('Ticket aktualisiert'))}
<h2>Rollback</h2><p>Was tun, wenn etwas schiefgeht?</p>`,
    },
    {
      name: 'Incident Postmortem', icon: 'siren', page_type: 'incident', tags: ['incident', 'postmortem'],
      description: 'Blameless Postmortem mit Timeline, Root Cause und Maßnahmen',
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
      name: 'Server / Host', icon: 'server', page_type: 'host', tags: ['server'],
      description: 'Steckbrief eines Servers mit Hardware, Netzwerk und Diensten',
      properties: { Hostname: 'srv-app-01', 'IP-Adresse': '10.0.10.21', Betriebssystem: 'Debian 12', Umgebung: 'Produktion', Standort: 'RZ1 / Rack A3', Verantwortlich: '', Wartungsfenster: 'Di 22:00–23:00' },
      content: `<h2>Übersicht</h2><p>Wofür wird dieser Host verwendet?</p>
<h2>Hardware / VM</h2>${table(['Komponente', 'Wert'], ['CPU', '4 vCPU'], ['RAM', '16 GB'], ['Disk', '100 GB SSD'])}
<h2>Netzwerk</h2>${table(['Interface', 'IP', 'VLAN'], ['eth0', '10.0.10.21/24', '10'])}
<h2>Dienste</h2>${table(['Dienst', 'Port', 'Hinweis'], ['nginx', '443/tcp', 'Reverse Proxy'], ['node_exporter', '9100/tcp', 'Monitoring'])}
<h2>Zugang</h2>${callout('info', '<p>Passwörter und Schlüssel als <strong>Geheimnis-Block</strong> ablegen (<code>/</code> → Geheimnis): verschlüsselt, nicht durchsuchbar, Anzeigen wird protokolliert.</p>')}
${code('bash', 'ssh -J bastion.example.com admin@{{Hostname}}')}
<h2>Backup</h2><p>Was wird wie oft wohin gesichert?</p>`,
    },
    {
      name: 'Change Request', icon: 'git-pull-request', page_type: 'change', tags: ['change'],
      description: 'Geplante Änderung mit Risikoabschätzung, Plan und Rollback',
      properties: { 'Change-ID': 'CHG-0000', Status: 'geplant', Termin: '', Risiko: 'mittel', Genehmigt: 'nein' },
      content: `<h2>Beschreibung</h2><p>Was soll geändert werden und warum?</p>
<h2>Risiko & Auswirkung</h2><p>Welche Systeme sind betroffen? Ist Downtime nötig?</p>
<h2>Durchführungsplan</h2>${tasks(task('Stakeholder informieren'), task('Backup/Snapshot erstellen'), task('Änderung durchführen'), task('Tests durchführen'))}
<h2>Rollback-Plan</h2><p>…</p><h2>Ergebnis</h2><p>…</p>`,
    },
    {
      name: 'Service-Dokumentation', icon: 'boxes', page_type: 'service', tags: ['service'],
      description: 'Architektur, Abhängigkeiten und Betrieb eines Dienstes',
      properties: { Service: '', Team: '', SLA: '99,9 %', Repository: '', Dashboard: '', 'On-Call': '' },
      content: `<h2>Überblick</h2><p>Was macht der Dienst?</p><h2>Architektur</h2><p>Komponenten und Datenfluss …</p>
<h2>Abhängigkeiten</h2><ul><li><p>Datenbank: …</p></li><li><p>Externe APIs: …</p></li></ul>
<h2>Deployment</h2>${code('bash', 'docker compose pull && docker compose up -d')}
<h2>Monitoring & Alerts</h2>${table(['Alert', 'Bedeutung', 'Runbook'], ['HighErrorRate', '5xx > 2 %', '…'])}
<h2>Bekannte Probleme</h2><p>…</p>`,
    },
    {
      name: 'Netzwerk-Segment', icon: 'network', page_type: 'network', tags: ['netzwerk'],
      description: 'VLAN/Subnetz mit IP-Plan, Gateways und Firewall-Regeln',
      properties: { VLAN: '10', Subnetz: '10.0.10.0/24', Gateway: '10.0.10.1', DHCP: 'nein', Zone: 'DMZ' },
      content: `<h2>Zweck</h2><p>Welche Systeme leben in diesem Segment?</p>
<h2>IP-Plan</h2>${table(['Bereich', 'Verwendung'], ['10.0.10.1', 'Gateway'], ['10.0.10.10–49', 'Server (statisch)'], ['10.0.10.200–250', 'Reserve'])}
<h2>Firewall-Regeln</h2>${table(['Quelle', 'Ziel', 'Port', 'Aktion'], ['any', '10.0.10.0/24', '443/tcp', 'allow'])}`,
    },
    {
      name: 'Checkliste', icon: 'list-checks', page_type: 'checklist', tags: ['checkliste'],
      description: 'Einfache abhakbare Checkliste, z. B. für Onboarding oder Audits',
      properties: {},
      content: `<h2>Checkliste</h2>${tasks(task('Erster Punkt'), task('Zweiter Punkt'), task('Dritter Punkt'))}`,
    },
  ],
  en: [
    {
      name: 'Runbook', icon: 'book-open', page_type: 'runbook', tags: ['runbook'],
      description: 'Step-by-step instructions for recurring operational tasks',
      properties: { Service: '', Owner: '', Duration: '~15 min', Risk: 'low' },
      content: `<h2>Purpose</h2><p>What is this runbook for and when is it run?</p>
${callout('warning', '<p><strong>Prerequisites:</strong> access to … / maintenance window announced / backup available.</p>')}
<h2>Steps</h2><ol><li><p>Connect to the host</p></li></ol>
${code('bash', 'ssh admin@{{Host}}')}
<ol start="2"><li><p>Check the status</p></li></ol>
${code('bash', 'systemctl status {{Service}}')}
<h2>Verification</h2>${tasks(task('Service is running'), task('Monitoring is green'), task('Ticket updated'))}
<h2>Rollback</h2><p>What to do if something goes wrong?</p>`,
    },
    {
      name: 'Incident postmortem', icon: 'siren', page_type: 'incident', tags: ['incident', 'postmortem'],
      description: 'Blameless postmortem with timeline, root cause and actions',
      properties: { Severity: 'SEV-2', Status: 'resolved', Start: '', End: '', 'Incident commander': '', 'Affected services': '' },
      content: `${callout('info', '<p>This postmortem is <strong>blameless</strong>: we look for causes in systems and processes, not in people.</p>')}
<h2>Summary</h2><p>What happened, in two or three sentences?</p>
<h2>Impact</h2><p>Which users/services were affected and for how long?</p>
<h2>Timeline</h2>${table(['Time (UTC)', 'Event'], ['00:00', 'Alert fired'], ['00:05', 'On-call acknowledged'], ['00:30', 'Mitigation rolled out'])}
<h2>Root cause</h2><p>Technical cause …</p>
<h2>What went well / badly</h2><ul><li><p>Well: …</p></li><li><p>Badly: …</p></li></ul>
<h2>Actions</h2>${tasks(task('Close the monitoring gap'), task('Update the runbook'))}`,
    },
    {
      name: 'Server / host', icon: 'server', page_type: 'host', tags: ['server'],
      description: 'Server fact sheet with hardware, network and services',
      properties: { Hostname: 'srv-app-01', 'IP address': '10.0.10.21', 'Operating system': 'Debian 12', Environment: 'Production', Location: 'DC1 / Rack A3', Owner: '', 'Maintenance window': 'Tue 22:00–23:00' },
      content: `<h2>Overview</h2><p>What is this host used for?</p>
<h2>Hardware / VM</h2>${table(['Component', 'Value'], ['CPU', '4 vCPU'], ['RAM', '16 GB'], ['Disk', '100 GB SSD'])}
<h2>Network</h2>${table(['Interface', 'IP', 'VLAN'], ['eth0', '10.0.10.21/24', '10'])}
<h2>Services</h2>${table(['Service', 'Port', 'Note'], ['nginx', '443/tcp', 'Reverse proxy'], ['node_exporter', '9100/tcp', 'Monitoring'])}
<h2>Access</h2>${callout('info', '<p>Store passwords and keys as a <strong>secret block</strong> (<code>/</code> → Secret): encrypted, not searchable, every reveal is logged.</p>')}
${code('bash', 'ssh -J bastion.example.com admin@{{Hostname}}')}
<h2>Backup</h2><p>What is backed up, how often and where to?</p>`,
    },
    {
      name: 'Change request', icon: 'git-pull-request', page_type: 'change', tags: ['change'],
      description: 'Planned change with risk assessment, plan and rollback',
      properties: { 'Change ID': 'CHG-0000', Status: 'planned', Date: '', Risk: 'medium', Approved: 'no' },
      content: `<h2>Description</h2><p>What will be changed and why?</p>
<h2>Risk & impact</h2><p>Which systems are affected? Is downtime required?</p>
<h2>Implementation plan</h2>${tasks(task('Inform stakeholders'), task('Create backup/snapshot'), task('Carry out the change'), task('Run tests'))}
<h2>Rollback plan</h2><p>…</p><h2>Outcome</h2><p>…</p>`,
    },
    {
      name: 'Service documentation', icon: 'boxes', page_type: 'service', tags: ['service'],
      description: 'Architecture, dependencies and operation of a service',
      properties: { Service: '', Team: '', SLA: '99.9 %', Repository: '', Dashboard: '', 'On-call': '' },
      content: `<h2>Overview</h2><p>What does the service do?</p><h2>Architecture</h2><p>Components and data flow …</p>
<h2>Dependencies</h2><ul><li><p>Database: …</p></li><li><p>External APIs: …</p></li></ul>
<h2>Deployment</h2>${code('bash', 'docker compose pull && docker compose up -d')}
<h2>Monitoring & alerts</h2>${table(['Alert', 'Meaning', 'Runbook'], ['HighErrorRate', '5xx > 2 %', '…'])}
<h2>Known issues</h2><p>…</p>`,
    },
    {
      name: 'Network segment', icon: 'network', page_type: 'network', tags: ['network'],
      description: 'VLAN/subnet with IP plan, gateways and firewall rules',
      properties: { VLAN: '10', Subnet: '10.0.10.0/24', Gateway: '10.0.10.1', DHCP: 'no', Zone: 'DMZ' },
      content: `<h2>Purpose</h2><p>Which systems live in this segment?</p>
<h2>IP plan</h2>${table(['Range', 'Use'], ['10.0.10.1', 'Gateway'], ['10.0.10.10–49', 'Servers (static)'], ['10.0.10.200–250', 'Reserved'])}
<h2>Firewall rules</h2>${table(['Source', 'Destination', 'Port', 'Action'], ['any', '10.0.10.0/24', '443/tcp', 'allow'])}`,
    },
    {
      name: 'Checklist', icon: 'list-checks', page_type: 'checklist', tags: ['checklist'],
      description: 'Simple checklist to tick off, e.g. for onboarding or audits',
      properties: {},
      content: `<h2>Checklist</h2>${tasks(task('First item'), task('Second item'), task('Third item'))}`,
    },
  ],
};
export const templatesFor = (lang) => TEMPLATES[lang] || TEMPLATES.de;

// ------------------------------------------------------------------ demo content
export function demoFor(lang) {
  const T = templatesFor(lang);
  const overdue = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  if (lang === 'en') {
    return {
      summary: 'Sample content',
      spaces: [
        { key: 'infra', name: 'Infrastructure', description: 'Servers, network, storage and virtualisation', icon: 'server', color: '#0ea5e9' },
        { key: 'ops', name: 'Operations & runbooks', description: 'Runbooks, on-call and recurring tasks', icon: 'terminal', color: '#22c55e' },
        { key: 'security', name: 'Security', description: 'Hardening, certificates, access and audits', icon: 'shield', color: '#ef4444' },
        { key: 'incidents', name: 'Incidents', description: 'Postmortems and outage reports', icon: 'siren', color: '#f59e0b' },
      ],
      pages: [
        { space: 'infra', key: 'intro', title: 'How this wiki works', type: 'doc', tags: ['intro'], pinned: true, html: `
<p>This page briefly explains how the wiki is organised. Delete it once you have your own content.</p>
${callout('tip', '<p>Press <kbd>Ctrl</kbd> + <kbd>K</kbd> for the <strong>command palette</strong> and system-wide search. Filters such as <code>tag:linux</code>, <code>space:ops</code> or <code>type:runbook</code> work right in the search box.</p>')}
<h2>Structure</h2>
<ul>
<li><p><strong>Spaces</strong> with their own permissions for teams and groups</p></li>
<li><p><strong>Templates</strong> for runbooks, postmortems, server fact sheets and changes</p></li>
<li><p><strong>Properties</strong> (hostname, IP, owner …) – searchable like the text</p></li>
<li><p><strong>Review dates</strong> so documentation does not go stale</p></li>
<li><p><strong>Version history</strong> with diff and restore</p></li>
<li><p><strong>REST API</strong> with personal tokens for automation</p></li>
</ul>
<h2>API example</h2>
${code('bash', 'curl -H "Authorization: Bearer bst_…" \\\n     "https://wiki.example.com/api/search?q=nginx%20tag:runbook"')}` },
        { space: 'infra', key: 'net', title: 'Network', type: 'doc', tags: ['network'], html: `<p>Overview of all network segments.</p>
${table(['VLAN', 'Subnet', 'Purpose'], ['10', '10.0.10.0/24', 'Servers'], ['20', '10.0.20.0/24', 'Clients'], ['99', '10.0.99.0/24', 'Management'])}` },
        { space: 'infra', parent: 'net', title: 'VLAN 10 – servers', type: 'network', tags: ['network', 'vlan'], html: T[5].content, props: T[5].properties },
        { space: 'infra', title: 'srv-web-01', type: 'host', tags: ['server', 'linux', 'nginx'], html: T[2].content, reviewDue: overdue,
          props: { Hostname: 'srv-web-01', 'IP address': '10.0.10.11', 'Operating system': 'Debian 12', Environment: 'Production', Location: 'DC1 / Rack A1', Owner: 'Web team' } },
        { space: 'ops', title: 'Renew certificate (Let\'s Encrypt)', type: 'runbook', tags: ['runbook', 'tls', 'nginx'], props: { Service: 'nginx', Duration: '~5 min', Risk: 'low' }, html: `
<h2>Purpose</h2><p>Manual renewal in case the automatic renewal fails.</p>
${callout('warning', '<p>Check beforehand that port 80 is reachable from outside.</p>')}
<h2>Steps</h2>
${code('bash', 'sudo certbot renew --dry-run\nsudo certbot renew\nsudo systemctl reload nginx')}
<h2>Verification</h2>
${code('bash', 'echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates')}
${tasks(task('Expiry date > 60 days'), task('Monitoring check green'))}` },
        { space: 'ops', title: 'Disk full – first aid', type: 'runbook', tags: ['runbook', 'linux', 'storage'], props: { Risk: 'medium' }, pinned: true, html: `
<h2>Diagnosis</h2>
${code('bash', 'df -h\nsudo du -xh / --max-depth=2 2>/dev/null | sort -h | tail -20\nsudo journalctl --disk-usage')}
<h2>Quick fix</h2>
${code('bash', 'sudo journalctl --vacuum-time=7d\nsudo apt-get clean\ndocker system prune -f')}
${callout('danger', '<p>Never delete files in <code>/var/lib/postgresql</code>!</p>')}` },
        { space: 'ops', title: 'On-call handover', type: 'checklist', tags: ['on-call'], html: `<p>Checklist for the weekly handover.</p>
${tasks(task('Open incidents discussed', true), task('Planned changes for the week reviewed'), task('Alert noise reviewed'), task('Pager forwarding switched'))}` },
        { space: 'security', title: 'SSH hardening', type: 'howto', tags: ['security', 'linux', 'ssh'], html: `
<p>Recommended baseline for <code>/etc/ssh/sshd_config</code>:</p>
${code('ini', 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nAllowGroups ssh-users\nMaxAuthTries 3')}
${code('bash', 'sudo sshd -t && sudo systemctl reload ssh')}` },
        { space: 'incidents', title: '2026-09-12 – Database cluster outage', type: 'incident', tags: ['incident', 'postmortem', 'postgres'], html: T[1].content,
          props: { Severity: 'SEV-1', Status: 'resolved', Start: '2026-09-12 03:12', End: '2026-09-12 04:40', 'Affected services': 'API, web shop' } },
      ],
    };
  }
  return {
    summary: 'Beispielinhalt',
    spaces: [
      { key: 'infra', name: 'Infrastruktur', description: 'Server, Netzwerk, Storage und Virtualisierung', icon: 'server', color: '#0ea5e9' },
      { key: 'ops', name: 'Betrieb & Runbooks', description: 'Runbooks, On-Call und wiederkehrende Aufgaben', icon: 'terminal', color: '#22c55e' },
      { key: 'security', name: 'Security', description: 'Härtung, Zertifikate, Zugänge und Audits', icon: 'shield', color: '#ef4444' },
      { key: 'incidents', name: 'Incidents', description: 'Postmortems und Störungsberichte', icon: 'siren', color: '#f59e0b' },
    ],
    pages: [
      { space: 'infra', key: 'intro', title: 'So funktioniert dieses Wiki', type: 'doc', tags: ['intro'], pinned: true, html: `
<p>Diese Seite erklärt kurz, wie das Wiki aufgebaut ist. Du kannst sie löschen, sobald ihr eigene Inhalte habt.</p>
${callout('tip', '<p>Drücke <kbd>Strg</kbd> + <kbd>K</kbd> für die <strong>Befehlspalette</strong> und systemweite Suche. Filter wie <code>tag:linux</code>, <code>space:ops</code> oder <code>type:runbook</code> funktionieren direkt im Suchfeld.</p>')}
<h2>Aufbau</h2>
<ul>
<li><p><strong>Bereiche</strong> mit eigenen Berechtigungen für Teams und Gruppen</p></li>
<li><p><strong>Vorlagen</strong> für Runbooks, Postmortems, Server-Steckbriefe und Changes</p></li>
<li><p><strong>Eigenschaften</strong> (Hostname, IP, Owner …) – durchsuchbar wie der Text</p></li>
<li><p><strong>Review-Termine</strong>, damit Doku nicht veraltet</p></li>
<li><p><strong>Versionshistorie</strong> mit Diff und Wiederherstellung</p></li>
<li><p><strong>REST-API</strong> mit persönlichen Tokens für Automatisierung</p></li>
</ul>
<h2>API-Beispiel</h2>
${code('bash', 'curl -H "Authorization: Bearer bst_…" \\\n     "https://wiki.example.com/api/search?q=nginx%20tag:runbook"')}` },
      { space: 'infra', key: 'net', title: 'Netzwerk', type: 'doc', tags: ['netzwerk'], html: `<p>Übersicht über alle Netzsegmente.</p>
${table(['VLAN', 'Subnetz', 'Zweck'], ['10', '10.0.10.0/24', 'Server'], ['20', '10.0.20.0/24', 'Clients'], ['99', '10.0.99.0/24', 'Management'])}` },
      { space: 'infra', parent: 'net', title: 'VLAN 10 – Server', type: 'network', tags: ['netzwerk', 'vlan'], html: T[5].content, props: T[5].properties },
      { space: 'infra', title: 'srv-web-01', type: 'host', tags: ['server', 'linux', 'nginx'], html: T[2].content, reviewDue: overdue,
        props: { Hostname: 'srv-web-01', 'IP-Adresse': '10.0.10.11', Betriebssystem: 'Debian 12', Umgebung: 'Produktion', Standort: 'RZ1 / Rack A1', Verantwortlich: 'Team Web' } },
      { space: 'ops', title: 'Zertifikat erneuern (Let\'s Encrypt)', type: 'runbook', tags: ['runbook', 'tls', 'nginx'], props: { Service: 'nginx', Dauer: '~5 min', Risiko: 'niedrig' }, html: `
<h2>Zweck</h2><p>Manuelle Erneuerung, falls der automatische Renew fehlschlägt.</p>
${callout('warning', '<p>Vorher prüfen, ob Port 80 von außen erreichbar ist.</p>')}
<h2>Schritte</h2>
${code('bash', 'sudo certbot renew --dry-run\nsudo certbot renew\nsudo systemctl reload nginx')}
<h2>Verifikation</h2>
${code('bash', 'echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates')}
${tasks(task('Ablaufdatum > 60 Tage'), task('Monitoring-Check grün'))}` },
      { space: 'ops', title: 'Festplatte voll – Erste Hilfe', type: 'runbook', tags: ['runbook', 'linux', 'storage'], props: { Risiko: 'mittel' }, pinned: true, html: `
<h2>Diagnose</h2>
${code('bash', 'df -h\nsudo du -xh / --max-depth=2 2>/dev/null | sort -h | tail -20\nsudo journalctl --disk-usage')}
<h2>Schnelle Abhilfe</h2>
${code('bash', 'sudo journalctl --vacuum-time=7d\nsudo apt-get clean\ndocker system prune -f')}
${callout('danger', '<p>Niemals Dateien in <code>/var/lib/postgresql</code> löschen!</p>')}` },
      { space: 'ops', title: 'On-Call Übergabe', type: 'checklist', tags: ['on-call'], html: `<p>Checkliste für die wöchentliche Übergabe.</p>
${tasks(task('Offene Incidents besprochen', true), task('Geplante Changes der Woche geprüft'), task('Alert-Rauschen reviewt'), task('Pager-Weiterleitung umgestellt'))}` },
      { space: 'security', title: 'SSH-Härtung', type: 'howto', tags: ['security', 'linux', 'ssh'], html: `
<p>Empfohlene Basiskonfiguration für <code>/etc/ssh/sshd_config</code>:</p>
${code('ini', 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nAllowGroups ssh-users\nMaxAuthTries 3')}
${code('bash', 'sudo sshd -t && sudo systemctl reload ssh')}` },
      { space: 'incidents', title: '2026-09-12 – Ausfall Datenbank-Cluster', type: 'incident', tags: ['incident', 'postmortem', 'postgres'], html: T[1].content,
        props: { Schweregrad: 'SEV-1', Status: 'gelöst', Beginn: '2026-09-12 03:12', Ende: '2026-09-12 04:40', 'Betroffene Dienste': 'API, Webshop' } },
    ],
  };
}
