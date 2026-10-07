const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
const UNITS = [
  ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
];

export function timeAgo(date) {
  if (!date) return '';
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  for (const [unit, sec] of UNITS) {
    if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return 'gerade eben';
}

export const formatDate = (d, withTime = false) =>
  d ? new Date(d).toLocaleString('de-DE', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }) : '–';

export function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function formatDuration(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

/** Stable color for tags without an explicit color */
export function tagHue(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Search snippets come with \u0002…\u0003 markers around hits → [{ text, hit }] */
export function snippetParts(s) {
  return String(s || '').split(/(\u0002[^\u0003]*\u0003)/).filter(Boolean).map((part) =>
    part.startsWith('\u0002') ? { text: part.slice(1, -1), hit: true } : { text: part, hit: false });
}

export const PAGE_TYPES = {
  doc: { label: 'Dokument', icon: 'file-text' },
  runbook: { label: 'Runbook', icon: 'book-open' },
  incident: { label: 'Incident', icon: 'siren' },
  host: { label: 'Server / Host', icon: 'server' },
  service: { label: 'Service', icon: 'boxes' },
  network: { label: 'Netzwerk', icon: 'network' },
  change: { label: 'Change', icon: 'git-pull-request' },
  howto: { label: 'How-To', icon: 'lightbulb' },
  checklist: { label: 'Checkliste', icon: 'list-checks' },
};

export const ROLE_LABELS = { admin: 'Administrator', editor: 'Redakteur', viewer: 'Betrachter' };
export const ACCESS_LABELS = { none: 'Kein Zugriff', read: 'Lesen', write: 'Schreiben', admin: 'Verwalten' };

/** Compact timestamp for log columns: "14:32" today, "gestern", otherwise "12.09." */
export function shortWhen(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now.getTime() - 864e5);
  if (d.toDateString() === y.toDateString()) return 'gestern';
  return d.toLocaleDateString('de-DE', d.getFullYear() === now.getFullYear() ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
}
