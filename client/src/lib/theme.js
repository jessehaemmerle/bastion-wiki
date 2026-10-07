export const THEMES = [
  { id: 'aurora', name: 'Aurora', desc: 'Violett & Cyan', dark: ['#0a0d14', '#131826', '#8b6cff', '#22d3ee'], light: ['#f6f6fb', '#ffffff', '#6d4aff', '#0891b2'] },
  { id: 'phosphor', name: 'Phosphor', desc: 'Terminal-Grün, Monospace', dark: ['#050906', '#0c140f', '#39ff88', '#ffb02e'], light: ['#f3f1e7', '#fbfaf4', '#0f8a45', '#b26b00'] },
  { id: 'nord', name: 'Nord', desc: 'Arktisch & ruhig', dark: ['#242933', '#2e3440', '#88c0d0', '#b48ead'], light: ['#eceff4', '#f8f9fb', '#5e81ac', '#b48ead'] },
  { id: 'solarized', name: 'Solarized', desc: 'Der Klassiker', dark: ['#00212b', '#002b36', '#2aa198', '#b58900'], light: ['#fdf6e3', '#fffbef', '#268bd2', '#cb4b16'] },
  { id: 'ember', name: 'Ember', desc: 'Warm & glühend', dark: ['#100b09', '#1c1410', '#ff7a45', '#ffcc4d'], light: ['#fdf8f4', '#ffffff', '#e8572a', '#c78a00'] },
  { id: 'graphite', name: 'Graphite', desc: 'Neutral & sachlich', dark: ['#111113', '#1b1b1e', '#3b82f6', '#a1a1aa'], light: ['#fafafa', '#ffffff', '#2563eb', '#71717a'] },
];

export const ACCENTS = ['#8b6cff', '#3b82f6', '#06b6d4', '#10b981', '#39ff88', '#84cc16', '#f59e0b', '#ff7a45', '#ef4444', '#ec4899', '#a855f7'];

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;

export function resolveTheme(settings = {}, prefs = {}) {
  const theme = THEMES.some((t) => t.id === prefs.theme) ? prefs.theme
    : THEMES.some((t) => t.id === settings.defaultTheme) ? settings.defaultTheme : 'aurora';
  const mode = prefs.mode || settings.defaultMode || 'system';
  const accent = prefs.accent || settings.accentColor || '';
  return { theme, mode, accent, density: prefs.density || 'comfortable', font: prefs.font || 'sans' };
}

export function applyTheme({ theme, mode, accent, font }) {
  const root = document.documentElement;
  const effective = mode === 'system' ? (media?.matches ? 'light' : 'dark') : mode;
  root.dataset.theme = theme;
  root.dataset.mode = effective;
  root.dataset.font = font || 'sans';
  if (accent) root.style.setProperty('--accent', accent);
  else root.style.removeProperty('--accent');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0b0f17');
  try {
    localStorage.setItem('bastion.theme', JSON.stringify({ theme, mode, accent }));
  } catch { /* storage unavailable */ }
  return effective;
}

export function onSystemModeChange(cb) {
  media?.addEventListener('change', cb);
  return () => media?.removeEventListener('change', cb);
}
