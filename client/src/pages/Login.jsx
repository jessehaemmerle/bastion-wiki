import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { Logo } from '../components/Layout.jsx';

export default function Login({ register = false }) {
  const { user, setUser, settings } = useApp();
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
        <h1>{register ? 'Konto erstellen' : 'Anmelden'}</h1>
        {settings.tagline && <p className="sub">{settings.tagline}</p>}
        <div className="auth-card">
          {error && <div className="error-box" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="u">{register ? 'Benutzername' : 'Benutzername oder E-Mail'}</label>
            <input id="u" className="input" autoComplete="username" value={form.username} onChange={set('username')} required autoFocus />
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
            <input id="p" type="password" className="input" autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} required minLength={register ? 8 : undefined} />
            {register && <span className="hint">Mindestens 8 Zeichen.</span>}
          </div>
          <button className="btn primary lg" disabled={busy}>
            {busy && <span className="spinner" />} {register ? 'Konto erstellen' : 'Anmelden'}
          </button>
        </div>
        {settings.allowRegistration && (
          <p className="small muted" style={{ margin: 0 }}>
            {register ? <>Bereits registriert? <Link to="/login">Anmelden</Link></> : <>Noch kein Konto? <Link to="/register">Konto erstellen</Link></>}
          </p>
        )}
      </form>
    </main>
  );
}
