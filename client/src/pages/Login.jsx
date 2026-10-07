import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { Logo } from '../components/Layout.jsx';
import Icon from '../components/Icon.jsx';

const LINES = [
  ['$', 'ssh wiki.bastion.local'],
  ['>', 'Lade Runbooks, Hosts & Postmortems …'],
  ['✓', 'Suche indexiert'],
  ['✓', 'Dokumentation ist aktuell'],
];

export default function Login({ register = false }) {
  const { user, setUser, settings } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', email: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(1);
  const next = params.get('next') || '/';

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  useEffect(() => {
    const t = setInterval(() => setShown((n) => (n >= LINES.length ? n : n + 1)), 650);
    return () => clearInterval(t);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api.post(register ? '/auth/register' : '/auth/login', form);
      setUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="auth-page">
      <div className="backdrop" />
      <section className="auth-art">
        <div className="row" style={{ gap: 12 }}>
          <span className="rail-logo" style={{ margin: 0 }}><Logo /></span>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{settings.siteName || 'Bastion'}</strong>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Wissen für den Betrieb</div>
          <h1>Runbooks, Hosts &amp; Incidents – <em>an einem Ort.</em></h1>
          <p className="muted" style={{ maxWidth: 460, fontSize: 16 }}>{settings.tagline}</p>
        </div>
        <div className="auth-terminal" aria-hidden="true">
          {LINES.slice(0, shown).map(([p, t], i) => (
            <div key={i}><span className={p === '✓' ? 'ok' : 'p'}>{p}</span> {t}</div>
          ))}
          <span className="cursor" />
        </div>
      </section>
      <section className="auth-form">
        <form className="auth-box" onSubmit={submit}>
          <div>
            <div className="eyebrow">{register ? 'Konto erstellen' : 'Anmeldung'}</div>
            <h2 style={{ marginTop: 8 }}>{register ? 'Willkommen an Bord' : 'Willkommen zurück'}</h2>
          </div>
          {error && <div className="error-box">{error}</div>}
          <div className="field">
            <label htmlFor="u">{register ? 'Benutzername' : 'Benutzername oder E-Mail'}</label>
            <div className="input-icon"><Icon name="user" /><input id="u" className="input" autoComplete="username" value={form.username} onChange={set('username')} required autoFocus /></div>
          </div>
          {register && (
            <>
              <div className="field">
                <label htmlFor="d">Anzeigename</label>
                <input id="d" className="input" value={form.displayName} onChange={set('displayName')} />
              </div>
              <div className="field">
                <label htmlFor="e">E-Mail</label>
                <input id="e" type="email" className="input" value={form.email} onChange={set('email')} />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="p">Passwort</label>
            <div className="input-icon"><Icon name="lock" /><input id="p" type="password" className="input" autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} required minLength={register ? 8 : undefined} /></div>
          </div>
          <button className="btn primary lg" disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name={register ? 'user-plus' : 'log-in'} />} {register ? 'Registrieren' : 'Anmelden'}
          </button>
          {settings.allowRegistration && (
            <div className="small muted" style={{ textAlign: 'center' }}>
              {register ? <>Schon ein Konto? <Link to="/login">Anmelden</Link></> : <>Noch kein Konto? <Link to="/register">Registrieren</Link></>}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
