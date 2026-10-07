export const THEMES = [
  { id: 'rack', name: 'Rack', desc: 'Lichtgrau, Anthrazit, Signalblau', dark: ['#24292c', '#2b3135', '#7fb0e0', '#f2c200'], light: ['#fafaf8', '#e6e8e5', '#1f5f99', '#f2c200'] },
  { id: 'leitstand', name: 'Leitstand', desc: 'Gedämpftes Grün wie im Kontrollraum', dark: ['#1f2620', '#263027', '#8cc196', '#e89b4a'], light: ['#f4f5f0', '#dfe2d8', '#3d6b45', '#d9822b'] },
  { id: 'blueprint', name: 'Blueprint', desc: 'Lichtpause: Preußischblau auf Weiß', dark: ['#12345a', '#163c66', '#ffffff', '#ffcf70'], light: ['#f5f8fb', '#e2e9f1', '#0f4c8a', '#c2410c'] },
  { id: 'vt220', name: 'VT220', desc: 'Bernstein-Terminal, alles in Mono', dark: ['#1d160a', '#241b0d', '#ffb000', '#ffd98a'], light: ['#fbf7ef', '#efe7d6', '#9a5b00', '#33260f'] },
  { id: 'nord', name: 'Nord', desc: 'Die bekannte Nord-Palette', dark: ['#2e3440', '#3b4252', '#88c0d0', '#ebcb8b'], light: ['#eceff4', '#e1e5ec', '#5e81ac', '#d08770'] },
  { id: 'solarized', name: 'Solarized', desc: 'Ethan Schoonovers Klassiker', dark: ['#002b36', '#073642', '#2aa198', '#b58900'], light: ['#fdf6e3', '#f2ead3', '#268bd2', '#b58900'] },
];

// RAL signal / traffic colours
export const ACCENTS = ['#1f5f99', '#0e518d', '#007577', '#2f7d45', '#4d6f39', '#9a5b00', '#c1121c', '#8e1f3f', '#5b5b9a', '#383e42'];

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;

export function resolveTheme(settings = {}, prefs = {}) {
  const theme = THEMES.some((t) => t.id === prefs.theme) ? prefs.theme
    : THEMES.some((t) => t.id === settings.defaultTheme) ? settings.defaultTheme : 'rack';
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
