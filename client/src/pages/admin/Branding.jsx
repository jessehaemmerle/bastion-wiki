import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { ModeSwitch, ThemeGrid } from '../../components/ThemePicker.jsx';
import { ColorPicker, Spinner, Switch } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { ACCENTS } from '../../lib/theme.js';
import { LANGUAGES, tr } from '../../lib/i18n.js';

const CSS_EXAMPLE = `/* Beispiel: eigene Schrift & runde Ecken */
:root { --radius-lg: 20px; }
.page-title { letter-spacing: -0.04em; }
[data-theme='rack'][data-mode='light'] { --accent: #c1121c; }`;

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
      toast(tr('Einstellungen gespeichert'));
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };
  const previewMode = s.defaultMode === 'light' ? 'light' : 'dark';

  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Branding & Theming')}</h1><p>{tr('Standard-Look für alle Nutzer. Jede Person kann Theme, Modus und Akzent in ihren Einstellungen individuell überschreiben.')}</p></div>
        <button className="btn primary" onClick={save} disabled={saving}><Icon name="save" /> {tr('Speichern')}</button>
      </div>
      <div className="card pad">
        <section className="settings-section">
          <div><h3>{tr('Identität')}</h3><p>{tr('Name und Untertitel erscheinen in Navigation, Login, Browser-Tab und PWA-Manifest.')}</p></div>
          <div className="form-grid">
            <div className="field"><label>{tr('Name des Wikis')}</label><input className="input" value={s.siteName} maxLength={60} onChange={(e) => set('siteName', e.target.value)} /></div>
            <div className="field"><label>{tr('Untertitel')}</label><input className="input" value={s.tagline} maxLength={160} onChange={(e) => set('tagline', e.target.value)} /></div>
            <div className="field"><label>{tr('Fußzeile')}</label><input className="input" value={s.footerText} maxLength={200} onChange={(e) => set('footerText', e.target.value)} placeholder={tr('z. B. © ACME IT-Betrieb')} /></div>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>{tr('Standard-Theme')}</h3><p>{tr('Gilt für alle, die kein eigenes Theme gewählt haben.')}</p></div>
          <div className="col" style={{ gap: 14 }}>
            <ThemeGrid value={s.defaultTheme} mode={previewMode} onChange={(t) => set('defaultTheme', t)} />
            <div className="row wrap"><span className="label">{tr('Standardmodus')}</span><ModeSwitch value={s.defaultMode} onChange={(m) => set('defaultMode', m)} /></div>
            <div className="row wrap"><span className="label">{tr('Standardsprache')}</span>
              <div className="segmented">
                {LANGUAGES.map((l) => <button key={l.id} type="button" className={(s.defaultLanguage || 'de') === l.id ? 'active' : ''} onClick={() => set('defaultLanguage', l.id)}>{l.name}</button>)}
              </div>
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>{tr('Akzentfarbe')}</h3><p>{tr('Überschreibt die Akzentfarbe aller Themes (z. B. eure CI-Farbe). Leer = Theme-Standard.')}</p></div>
          <div className="col" style={{ gap: 10 }}>
            <ColorPicker value={s.accentColor} colors={ACCENTS} onChange={(c) => set('accentColor', c)} />
            <div className="row">
              <input className="input mono" style={{ maxWidth: 160 }} value={s.accentColor} placeholder="#1f5f99" onChange={(e) => set('accentColor', e.target.value)} />
              {s.accentColor && <button className="btn sm" onClick={() => set('accentColor', '')}>{tr('Zurücksetzen')}</button>}
              {s.accentColor && <span className="btn primary sm" style={{ background: s.accentColor, pointerEvents: 'none' }}>{tr('Vorschau')}</span>}
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>{tr('Eigenes CSS')}</h3><p>{tr('Für tiefgreifendes Theming: alle Design-Tokens sind CSS-Variablen, z. B.')} <code className="mono">--bg</code>, <code className="mono">--surface</code>, <code className="mono">--accent</code>, <code className="mono">--font-sans</code>.</p></div>
          <div className="field">
            <textarea className="textarea code" rows={10} value={s.customCss} onChange={(e) => set('customCss', e.target.value)} placeholder={CSS_EXAMPLE} spellCheck={false} />
            <span className="hint">{tr('Wird nach dem Speichern sofort für alle Nutzer geladen.')}</span>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>{tr('Ankündigung')}</h3><p>{tr('Banner über allen Seiten – z. B. für Wartungsfenster.')}</p></div>
          <div className="field"><input className="input" value={s.announcement} maxLength={500} onChange={(e) => set('announcement', e.target.value)} placeholder={tr('z. B. Wartung am Samstag 22:00–02:00 Uhr')} /></div>
        </section>
        <section className="settings-section">
          <div><h3>{tr('Registrierung & Rollen')}</h3><p>{tr('Selbstregistrierung neuer Konten und deren Standardrolle.')}</p></div>
          <div className="col" style={{ gap: 14 }}>
            <Switch checked={s.allowRegistration} onChange={(v) => set('allowRegistration', v)} label={tr('Selbstregistrierung erlauben')} />
            <div className="row wrap"><span className="label">{tr('Rolle neuer Konten')}</span>
              <div className="segmented">
                <button className={s.defaultRole === 'editor' ? 'active' : ''} onClick={() => set('defaultRole', 'editor')}>{tr('Redakteur')}</button>
                <button className={s.defaultRole === 'viewer' ? 'active' : ''} onClick={() => set('defaultRole', 'viewer')}>{tr('Betrachter')}</button>
              </div>
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div><h3>{tr('Review-Intervall')}</h3><p>{tr('Standardabstand in Tagen, wenn eine Seite als geprüft markiert wird oder aus einer Ops-Vorlage entsteht.')}</p></div>
          <div className="row"><input type="number" min={1} max={3650} className="input" style={{ maxWidth: 140 }} value={s.reviewIntervalDays} onChange={(e) => set('reviewIntervalDays', Number(e.target.value))} /> <span className="muted">{tr('Tage')}</span></div>
        </section>
        <section className="settings-section">
          <div><h3>{tr('Papierkorb')}</h3><p>{tr('So lange bleiben gelöschte Seiten wiederherstellbar, danach werden sie samt Anhängen endgültig entfernt.')}</p></div>
          <div className="row"><input type="number" min={1} max={3650} className="input" style={{ maxWidth: 140 }} value={s.trashDays ?? 30} onChange={(e) => set('trashDays', Number(e.target.value))} aria-label={tr('Aufbewahrung in Tagen')} /> <span className="muted">{tr('Tage')}</span></div>
        </section>
      </div>
    </>
  );
}
