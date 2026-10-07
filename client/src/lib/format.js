import { getLanguage, getLocale, tr } from './i18n.js';

const rtfCache = {};
const rtf = () => (rtfCache[getLanguage()] ??= new Intl.RelativeTimeFormat(getLanguage(), { numeric: 'auto' }));
const UNITS = [
  ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
];

export function timeAgo(date) {
  if (!date) return '';
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  for (const [unit, sec] of UNITS) {
    if (Math.abs(diff) >= sec) return rtf().format(Math.round(diff / sec), unit);
  }
  return tr('gerade eben');
}

// "2026-10-07" (date columns) is a calendar day: parse it as local midnight, not UTC
// (new Date('2026-10-07') would show the 6th west of UTC)
const toDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d));

export const formatDate = (d, withTime = false) =>
  d ? toDate(d).toLocaleString(getLocale(), withTime
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

// Labels are getters so they follow the current language
export const PAGE_TYPES = {
  doc: { icon: 'file-text', get label() { return tr('Dokument'); } },
  runbook: { icon: 'book-open', get label() { return tr('Runbook'); } },
  incident: { icon: 'siren', get label() { return tr('Incident'); } },
  host: { icon: 'server', get label() { return tr('Server / Host'); } },
  service: { icon: 'boxes', get label() { return tr('Service'); } },
  network: { icon: 'network', get label() { return tr('Netzwerk'); } },
  change: { icon: 'git-pull-request', get label() { return tr('Change'); } },
  howto: { icon: 'lightbulb', get label() { return tr('How-To'); } },
  checklist: { icon: 'list-checks', get label() { return tr('Checkliste'); } },
};

export const ROLE_LABELS = {
  get admin() { return tr('Administrator'); },
  get editor() { return tr('Redakteur'); },
  get viewer() { return tr('Betrachter'); },
};
export const ACCESS_LABELS = {
  get none() { return tr('Kein Zugriff'); },
  get read() { return tr('Lesen'); },
  get write() { return tr('Schreiben'); },
  get admin() { return tr('Verwalten'); },
};

/** Compact timestamp for log columns: "14:32" today, "gestern", otherwise "12.09." */
export function shortWhen(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now.getTime() - 864e5);
  if (d.toDateString() === y.toDateString()) return tr('gestern');
  return d.toLocaleDateString(getLocale(), d.getFullYear() === now.getFullYear() ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
}
