import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { ModeSwitch, ThemeGrid } from '../../components/ThemePicker.jsx';
import { ColorPicker, Spinner, Switch } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { ACCENTS } from '../../lib/theme.js';

const CSS_EXAMPLE = `/* Beispiel: eigene Schrift & runde Ecken */
:root { --radius-lg: 20px; }
.page-title { letter-spacing: -0.04em; }
[data-theme='aurora'][data-mode='dark'] { --bg: #070910; }`;

export default function Branding() {
  const { toast, loadSettings } = useApp();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/admin/settings').then((d) => setS(d.settings)); }, []);
  if (!s) return <Spinner center />;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      const { settings } = await api.put('/admin/settings', s);
      setS(settings);
      await loadSettings();
      toast('Einstellungen gespeichert');
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };
  const previewMode = s.defaultMode === 'light' ? 'light' : 'dark';

  return (
    <>
      <div className="page-head">
        <div><span className="eyebrow">System</span><h1>Branding & Theming</h1><p>Standard-Look für alle Nutzer. Jede Person kann Theme, Modus und Akzent in ihren Einstellungen individuell überschreiben.</p></div>
        <button className="btn primary" onClick={save} disabled={saving}><Icon name="save" /> Speichern</button>
      </div>
      <div className="card pad">
        <section className="settings-section">
          <div><h3>Identität</h3><p>Name und Untertitel erscheinen in Navigation, Login, Browser-Tab und PWA-Manifest.</p></div>
          <div className="form-grid">
            <div className="field"><label>Name des Wikis</label><input className="input" value={s.siteName} maxLength={60} onChange={(e) => set('siteName', e.target.value)} /></div>
            <div className="field"><label>Untertitel</label><input className="input" value={s.tagline} maxLength={160} onChange={(e) => set('tagline', e.target.value)} /></div>
            <div className="field"><label>Fußzeile</label><input className="input" value={s.footerText} maxLength={200} onChange={(e) => set('footerText', e.target.value)} placeholder="z. B. © ACME IT-Betrieb" /></div>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>Standard-Theme</h3><p>Gilt für alle, die kein eigenes Theme gewählt haben.</p></div>
          <div className="col" style={{ gap: 14 }}>
            <ThemeGrid value={s.defaultTheme} mode={previewMode} onChange={(t) => set('defaultTheme', t)} />
            <div className="row wrap"><span className="label">Standardmodus</span><ModeSwitch value={s.defaultMode} onChange={(m) => set('defaultMode', m)} /></div>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>Akzentfarbe</h3><p>Überschreibt die Akzentfarbe aller Themes (z. B. eure CI-Farbe). Leer = Theme-Standard.</p></div>
          <div className="col" style={{ gap: 10 }}>
            <ColorPicker value={s.accentColor} colors={ACCENTS} onChange={(c) => set('accentColor', c)} />
            <div className="row">
              <input className="input mono" style={{ maxWidth: 160 }} value={s.accentColor} placeholder="#7c5cff" onChange={(e) => set('accentColor', e.target.value)} />
              {s.accentColor && <button className="btn sm" onClick={() => set('accentColor', '')}>Zurücksetzen</button>}
              {s.accentColor && <span className="btn primary sm" style={{ background: s.accentColor, pointerEvents: 'none' }}>Vorschau</span>}
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>Eigenes CSS</h3><p>Für tiefgreifendes Theming: alle Design-Tokens sind CSS-Variablen (<code className="mono">--bg</code>, <code className="mono">--surface</code>, <code className="mono">--accent</code>, <code className="mono">--font-display</code> …).</p></div>
          <div className="field">
            <textarea className="textarea code" rows={10} value={s.customCss} onChange={(e) => set('customCss', e.target.value)} placeholder={CSS_EXAMPLE} spellCheck={false} />
            <span className="hint">Wird nach dem Speichern sofort für alle Nutzer geladen.</span>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>Ankündigung</h3><p>Banner über allen Seiten – z. B. für Wartungsfenster.</p></div>
          <div className="field"><input className="input" value={s.announcement} maxLength={500} onChange={(e) => set('announcement', e.target.value)} placeholder="z. B. Wartung am Samstag 22:00–02:00 Uhr" /></div>
        </section>
        <section className="settings-section">
          <div><h3>Registrierung & Rollen</h3><p>Selbstregistrierung neuer Konten und deren Standardrolle.</p></div>
          <div className="col" style={{ gap: 14 }}>
            <Switch checked={s.allowRegistration} onChange={(v) => set('allowRegistration', v)} label="Selbstregistrierung erlauben" />
            <div className="row wrap"><span className="label">Rolle neuer Konten</span>
              <div className="segmented">
                <button className={s.defaultRole === 'editor' ? 'active' : ''} onClick={() => set('defaultRole', 'editor')}>Redakteur</button>
                <button className={s.defaultRole === 'viewer' ? 'active' : ''} onClick={() => set('defaultRole', 'viewer')}>Betrachter</button>
              </div>
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>Review-Intervall</h3><p>Standardabstand in Tagen, wenn eine Seite als geprüft markiert wird oder aus einer Ops-Vorlage entsteht.</p></div>
          <div className="row"><input type="number" min={1} max={3650} className="input" style={{ maxWidth: 140 }} value={s.reviewIntervalDays} onChange={(e) => set('reviewIntervalDays', Number(e.target.value))} /> <span className="muted">Tage</span></div>
        </section>
      </div>
    </>
  );
}
