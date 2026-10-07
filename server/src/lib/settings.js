import { many, query } from '../db/index.js';

export const DEFAULT_SETTINGS = {
  siteName: 'Bastion',
  tagline: process.env.DEFAULT_LANGUAGE === 'en' ? 'The knowledge base for your ops team' : 'Die Wissensbasis für dein Ops-Team',
  defaultTheme: 'rack',
  defaultMode: 'system',
  defaultLanguage: process.env.DEFAULT_LANGUAGE === 'en' ? 'en' : 'de',
  accentColor: '',
  allowRegistration: false,
  defaultRole: 'editor',
  reviewIntervalDays: 180,
  announcement: '',
  customCss: '',
  footerText: '',
};

const PUBLIC_KEYS = ['siteName', 'tagline', 'defaultTheme', 'defaultMode', 'defaultLanguage', 'accentColor', 'allowRegistration', 'announcement', 'customCss', 'footerText', 'reviewIntervalDays'];

let cache = null;

export async function getSettings() {
  if (cache) return cache;
  const rows = await many('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  cache = out;
  return out;
}

export async function getPublicSettings() {
  const s = await getSettings();
  return Object.fromEntries(PUBLIC_KEYS.map((k) => [k, s[k]]));
}

export async function updateSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
  cache = null;
  return getSettings();
}
