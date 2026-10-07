import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ModeSwitch, ThemeGrid } from '../components/ThemePicker.jsx';
import { Avatar, ColorPicker, Confirm, Modal, Spinner, useCopy } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { useChrome, useFetch } from '../lib/hooks.js';
import { ACCENTS } from '../lib/theme.js';
import { formatDate, ROLE_LABELS, timeAgo } from '../lib/format.js';
import { LANGUAGES, tr } from '../lib/i18n.js';

function Profile() {
  const { user, setUser, toast } = useApp();
  const [f, setF] = useState({ displayName: user.displayName, email: user.email || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const { user: u } = await api.patch('/me', { displayName: f.displayName, email: f.email || null });
      setUser(u);
      toast(tr('Profil gespeichert'));
    } catch (err) { toast(err.message, 'error'); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast(tr('Passwörter stimmen nicht überein'), 'error');
    try {
      await api.post('/me/password', pw);
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast(tr('Passwort geändert – andere Sitzungen wurden abgemeldet'));
    } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <form className="card pad col" style={{ gap: 14 }} onSubmit={saveProfile}>
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={f.displayName || user.username} size={56} />
          <div>
            <div style={{ fontWeight: 650, fontSize: 18 }}>{user.displayName}</div>
            <div className="muted small">{user.username}, {ROLE_LABELS[user.role]}</div>
          </div>
        </div>
        <div className="form-grid">
          <div className="field"><label>{tr('Anzeigename')}</label><input className="input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required /></div>
          <div className="field"><label>{tr('E-Mail')}</label><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        </div>
        <div><button className="btn primary"><Icon name="save" /> {tr('Speichern')}</button></div>
      </form>
      <form className="card pad col" style={{ gap: 14 }} onSubmit={savePw}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{tr('Passwort ändern')}</h3>
        <div className="form-grid">
          <div className="field"><label>{tr('Aktuelles Passwort')}</label><input type="password" className="input" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></div>
          <div className="field"><label>{tr('Neues Passwort')}</label><input type="password" className="input" autoComplete="new-password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></div>
          <div className="field"><label>{tr('Wiederholen')}</label><input type="password" className="input" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></div>
        </div>
        <div><button className="btn"><Icon name="key-round" /> {tr('Passwort ändern')}</button></div>
      </form>
    </div>
  );
}

function Appearance() {
  const { themeState, updatePreferences, lang, changeLanguage } = useApp();
  const mode = themeState.mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : themeState.mode;
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="card pad col" style={{ gap: 14 }}>
        <div className="row between wrap">
          <div><h3 style={{ margin: 0 }}>{tr('Sprache')}</h3><div className="small faint">{tr('Sprache der Oberfläche. Inhalte bleiben, wie sie geschrieben wurden.')}</div></div>
          <div className="segmented" role="group" aria-label="Sprache / Language">
            {LANGUAGES.map((l) => (
              <button key={l.id} type="button" className={lang === l.id ? 'active' : ''} onClick={() => changeLanguage(l.id)}>{l.name}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="card pad col" style={{ gap: 14 }}>
        <div className="row between wrap">
          <div><h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{tr('Modus')}</h3><div className="small faint">{tr('Hell, dunkel oder automatisch nach Systemeinstellung.')}</div></div>
          <ModeSwitch value={themeState.mode} onChange={(m) => updatePreferences({ mode: m })} />
        </div>
      </div>
      <div className="card pad col" style={{ gap: 14 }}>
        <div><h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{tr('Theme')}</h3><div className="small faint">{tr('Jedes Theme bringt eine helle und eine dunkle Variante mit.')}</div></div>
        <ThemeGrid value={themeState.theme} mode={mode} onChange={(t) => updatePreferences({ theme: t })} />
      </div>
      <div className="card pad col" style={{ gap: 14 }}>
        <div className="row between wrap">
          <div><h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{tr('Akzentfarbe')}</h3><div className="small faint">{tr('Überschreibt die Akzentfarbe des Themes.')}</div></div>
          {themeState.accent && <button className="btn sm" onClick={() => updatePreferences({ accent: '' })}><Icon name="undo" size={14} /> {tr('Theme-Standard')}</button>}
        </div>
        <ColorPicker value={themeState.accent} colors={ACCENTS} onChange={(c) => updatePreferences({ accent: c })} />
      </div>
      <div className="card pad col" style={{ gap: 14 }}>
        <div className="row between wrap">
          <div><h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>{tr('Schrift für Inhalte')}</h3><div className="small faint">{tr('Wirkt auf Fließtext der Seiten.')}</div></div>
          <div className="segmented">
            {[['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']].map(([f, l]) => (
              <button key={f} className={themeState.font === f ? 'active' : ''} onClick={() => updatePreferences({ font: f })}>{l}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tokens() {
  const { toast } = useApp();
  const { data, reload, loading } = useFetch('/me/tokens');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState(90);
  const [secret, setSecret] = useState(null);
  const [del, setDel] = useState(null);
  const [copied, copy] = useCopy();
  const create = async () => {
    try {
      const { token } = await api.post('/me/tokens', { name, expiresInDays: Number(days) });
      setSecret(token.secret);
      setCreating(false);
      setName('');
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="card">
        <div className="card-header">
          <div><h3>{tr('Persönliche API-Tokens')}</h3><div className="small faint">{tr('Für Skripte, CI/CD oder Monitoring – mit deinen Rechten.')}</div></div>
          <button className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> {tr('Token erstellen')}</button>
        </div>
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>{tr('Name')}</th><th>{tr('Präfix')}</th><th>{tr('Zuletzt genutzt')}</th><th>{tr('Läuft ab')}</th><th /></tr></thead>
              <tbody>
                {!data.tokens.length && <tr><td colSpan={5} className="faint">{tr('Noch keine Tokens.')}</td></tr>}
                {data.tokens.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td className="mono small">{t.token_prefix}…</td>
                    <td className="small">{t.last_used_at ? timeAgo(t.last_used_at) : 'nie'}</td>
                    <td className="small">{t.expires_at ? formatDate(t.expires_at) : 'nie'}</td>
                    <td className="actions"><button className="btn ghost icon sm" onClick={() => setDel(t)}><Icon name="trash" size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card pad">
        <div className="eyebrow" style={{ marginBottom: 10 }}>{tr('Beispiel')}</div>
        <pre className="secret-box" style={{ display: 'block', margin: 0, whiteSpace: 'pre-wrap' }}>{`# ${tr('Seiten durchsuchen')}
curl -H "Authorization: Bearer $BASTION_TOKEN" \\
  "${location.origin}/api/search?q=tag:runbook%20nginx"

# ${tr('Seite anlegen')}
curl -X POST -H "Authorization: Bearer $BASTION_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"spaceId":1,"title":"${tr('Neue Seite')}","content":"<p>${tr('Hallo')}</p>","tags":["auto"]}' \\
  ${location.origin}/api/pages`}</pre>
      </div>
      {creating && (
        <Modal title={tr('API-Token erstellen')} icon="key-round" onClose={() => setCreating(false)}
          footer={<><button className="btn" onClick={() => setCreating(false)}>{tr('Abbrechen')}</button><button className="btn primary" disabled={!name} onClick={create}>{tr('Erstellen')}</button></>}>
          <div className="field"><label>{tr('Name')}</label><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('z. B. Ansible Inventory Sync')} /></div>
          <div className="field">
            <label>{tr('Gültigkeit')}</label>
            <select className="select" value={days} onChange={(e) => setDays(e.target.value)}>
              <option value={30}>{tr('30 Tage')}</option><option value={90}>{tr('90 Tage')}</option><option value={365}>{tr('1 Jahr')}</option><option value={0}>{tr('Unbegrenzt')}</option>
            </select>
          </div>
        </Modal>
      )}
      {secret && (
        <Modal title={tr('Token erstellt')} icon="check-circle" onClose={() => setSecret(null)} footer={<button className="btn primary" onClick={() => setSecret(null)}>{tr('Fertig')}</button>}>
          <div className="muted">{tr('Kopiere den Token jetzt – er wird nicht noch einmal angezeigt.')}</div>
          <div className="secret-box"><span className="grow">{secret}</span><button className="btn sm" onClick={() => copy(secret)}><Icon name={copied ? 'check' : 'copy'} size={14} /></button></div>
        </Modal>
      )}
      {del && (
        <Confirm danger title={tr('Token widerrufen?')} message={`„${del.name}“ funktioniert danach nicht mehr.`} confirmLabel={tr('Widerrufen')} onClose={() => setDel(null)}
          onConfirm={async () => { await api.del(`/me/tokens/${del.id}`); toast(tr('Token widerrufen')); reload(); }} />
      )}
    </div>
  );
}

function Sessions() {
  const { toast } = useApp();
  const { data, reload, loading } = useFetch('/me/sessions');
  if (loading) return <Spinner />;
  return (
    <div className="card">
      <div className="card-header">
        <h3>{tr('Aktive Sitzungen')}</h3>
        <button className="btn sm danger" onClick={async () => { await api.del('/me/sessions'); toast(tr('Andere Sitzungen beendet')); reload(); }}>
          <Icon name="log-out" size={14} /> {tr('Alle anderen abmelden')}
        </button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>{tr('Gerät')}</th><th>{tr('IP')}</th><th>{tr('Angemeldet')}</th><th>{tr('Läuft ab')}</th></tr></thead>
          <tbody>
            {data.sessions.map((s) => (
              <tr key={s.id}>
                <td className="small"><div className="row"><Icon name="laptop" size={15} /> <span className="ellipsis" style={{ maxWidth: 380 }}>{s.userAgent || tr('Unbekannt')}</span> {s.current && <span className="badge accent">{tr('Diese Sitzung')}</span>}</div></td>
                <td className="mono small">{s.ip}</td>
                <td className="small">{timeAgo(s.createdAt)}</td>
                <td className="small">{formatDate(s.expiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS = [
  ['profile', 'user', 'Profil'],
  ['appearance', 'palette', 'Darstellung'],
  ['tokens', 'key-round', 'API-Tokens'],
  ['sessions', 'laptop', 'Sitzungen'],
];

export default function UserSettings() {
  const { tab = 'profile' } = useParams();
  const navigate = useNavigate();
  useChrome([{ label: tr('Einstellungen') }]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);
  return (
    <div className="content narrow">
      <div className="page-head"><div><h1>{tr('Einstellungen')}</h1></div></div>
      <div className="tabs">
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => navigate(`/settings/${id}`)}><Icon name={icon} size={15} /> {tr(label)}</button>
        ))}
      </div>
      {tab === 'profile' && <Profile />}
      {tab === 'appearance' && <Appearance />}
      {tab === 'tokens' && <Tokens />}
      {tab === 'sessions' && <Sessions />}
    </div>
  );
}
