/**
 * Minimal i18n: German source strings are the keys, other languages map them.
 *   tr('Seite löschen')                  → "Delete page" (en)
 *   tr('{n} Seiten', { n: 4 })           → "4 pages"
 * Missing translations fall back to German, so nothing ever renders empty.
 * Server messages are translated with the same dictionary plus regex patterns (locales/en.js → PATTERNS).
 */
import en, { PATTERNS as EN_PATTERNS } from '../locales/en.js';

export const LANGUAGES = [
  { id: 'de', name: 'Deutsch', locale: 'de-DE' },
  { id: 'en', name: 'English', locale: 'en-GB' },
];
const DICTS = { en };
const PATTERNS = { en: EN_PATTERNS };

let current = 'de';

export function detectLanguage() {
  try {
    const stored = localStorage.getItem('bastion.lang');
    if (stored && LANGUAGES.some((l) => l.id === stored)) return stored;
  } catch { /* ignore */ }
  return (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function setLanguage(lang) {
  current = LANGUAGES.some((l) => l.id === lang) ? lang : 'de';
  document.documentElement.lang = current;
  try { localStorage.setItem('bastion.lang', current); } catch { /* ignore */ }
  return current;
}

export const getLanguage = () => current;
export const getLocale = () => LANGUAGES.find((l) => l.id === current)?.locale || 'de-DE';

function interpolate(s, vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
}

export function tr(text, vars) {
  const dict = DICTS[current];
  return interpolate(dict?.[text] ?? text, vars);
}

/** Translate a message coming from the server (exact match or pattern) */
export function trServer(msg) {
  if (!msg || current === 'de') return msg;
  const dict = DICTS[current];
  if (dict?.[msg]) return dict[msg];
  for (const [re, fn] of PATTERNS[current] || []) {
    const m = msg.match(re);
    if (m) return typeof fn === 'function' ? fn(...m.slice(1)) : fn;
  }
  return msg;
}

current = setLanguage(detectLanguage());
