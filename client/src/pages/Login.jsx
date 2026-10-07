import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { Logo } from '../components/Layout.jsx';
import { LANGUAGES, tr } from '../lib/i18n.js';

export default function Login({ register = false }) {
  const { user, setUser, settings, lang, changeLanguage } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', email: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = params.get('next') || '/';

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

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
    <main className="auth-page">
      <form className="auth-box" onSubmit={submit}>
        <div className="brand"><Logo /> {settings.siteName || 'Bastion'}</div>
        <h1>{register ? tr('Konto erstellen') : tr('Anmelden')}</h1>
        {settings.tagline && <p className="sub">{tr(settings.tagline)}</p>}
        <div className="auth-card">
          {error && <div className="error-box" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="u">{register ? tr('Benutzername') : tr('Benutzername oder E-Mail')}</label>
            <input id="u" className="input" autoComplete="username" value={form.username} onChange={set('username')} required autoFocus />
          </div>
          {register && (
            <>
              <div className="field">
                <label htmlFor="d">{tr('Anzeigename')}</label>
                <input id="d" className="input" value={form.displayName} onChange={set('displayName')} />
              </div>
              <div className="field">
                <label htmlFor="e">{tr('E-Mail')}</label>
                <input id="e" type="email" className="input" value={form.email} onChange={set('email')} />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="p">{tr('Passwort')}</label>
            <input id="p" type="password" className="input" autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} required minLength={register ? 8 : undefined} />
            {register && <span className="hint">{tr('Mindestens 8 Zeichen.')}</span>}
          </div>
          <button className="btn primary lg" disabled={busy}>
            {busy && <span className="spinner" />} {register ? tr('Konto erstellen') : tr('Anmelden')}
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Sprache / Language" style={{ alignSelf: 'flex-start' }}>
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" className={lang === l.id ? 'active' : ''} onClick={() => changeLanguage(l.id)}>{l.name}</button>
          ))}
        </div>
        {settings.allowRegistration && (
          <p className="small muted" style={{ margin: 0 }}>
            {register ? <>{tr('Bereits registriert?')} <Link to="/login">{tr('Anmelden')}</Link></> : <>{tr('Noch kein Konto?')} <Link to="/register">{tr('Konto erstellen')}</Link></>}
          </p>
        )}
      </form>
    </main>
  );
}
