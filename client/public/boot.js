// Applies the last known theme before React mounts to avoid a flash of the wrong colors.
(function () {
  try {
    var t = JSON.parse(localStorage.getItem('bastion.theme') || '{}');
    var root = document.documentElement;
    var mode = t.mode || 'system';
    if (mode === 'system') mode = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var themes = ['rack', 'leitstand', 'blueprint', 'vt220', 'nord', 'solarized'];
    root.dataset.theme = themes.indexOf(t.theme) >= 0 ? t.theme : 'rack';
    root.dataset.mode = mode;
    if (t.accent) root.style.setProperty('--accent', t.accent);
  } catch (e) { /* ignore */ }
})();
