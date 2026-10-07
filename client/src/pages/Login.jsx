import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { Logo } from '../components/Layout.jsx';
import { LANGUAGES, tr, trServer } from '../lib/i18n.js';
import Icon from '../components/Icon.jsx';

export default function Login({ register = false }) {
  const { user, setUser, settings, lang, changeLanguage } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', email: '', displayName: '' });
  const [error, setError] = useState(() => (params.get('sso_error') ? trServer(params.get('sso_error')) : ''));
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const next = params.get('next') || '/';
  const auth = settings.auth || {};
  const showLocal = register || auth.localLogin !== false || params.get('local') === '1';

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (challenge) {
        const { user } = await api.post('/auth/login/totp', { challenge, code });
        setUser(user);
        return;
      }
      const res = await api.post(register ? '/auth/register' : '/auth/login', form);
      if (res.totpRequired) {
        setChallenge(res.challenge);
        setCode('');
        return;
      }
      setUser(res.user);
    } catch (err) {
      if (challenge && err.status === 401 && /abgelaufen|expired/i.test(err.message)) setChallenge(null);
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
        <h1>{challenge ? tr('Zwei-Faktor-Anmeldung') : register ? tr('Konto erstellen') : tr('Anmelden')}</h1>
        {settings.tagline && <p className="sub">{tr(settings.tagline)}</p>}
        {challenge ? (
          <div className="auth-card">
            {error && <div className="error-box" role="alert">{error}</div>}
            <div className="row" style={{ gap: 10 }}>
              <Icon name="smartphone" size={20} />
              <div className="small">{useRecovery ? tr('Gib einen deiner Wiederherstellungscodes ein. Jeder Code funktioniert nur einmal.') : tr('Gib den 6-stelligen Code aus deiner Authenticator-App ein.')}</div>
            </div>
            <div className="field">
              <label htmlFor="otp">{useRecovery ? tr('Wiederherstellungscode') : tr('Bestätigungscode')}</label>
              <input id="otp" className="input mono" autoFocus autoComplete="one-time-code" inputMode={useRecovery ? 'text' : 'numeric'}
                pattern={useRecovery ? undefined : '[0-9 ]{6,7}'} maxLength={useRecovery ? 20 : 7} value={code}
                placeholder={useRecovery ? 'xxxx-xxxx-xxxx' : '123456'} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <button className="btn primary lg" disabled={busy}>{busy && <span className="spinner" />} {tr('Bestätigen')}</button>
            <div className="row between small">
              <button type="button" className="link-btn" onClick={() => { setUseRecovery((v) => !v); setCode(''); }}>
                {useRecovery ? tr('Code aus der App verwenden') : tr('Wiederherstellungscode verwenden')}
              </button>
              <button type="button" className="link-btn" onClick={() => { setChallenge(null); setError(''); }}>{tr('Zurück')}</button>
            </div>
          </div>
        ) : (
          <div className="auth-card">
            {error && <div className="error-box" role="alert">{error}</div>}
            {!register && auth.oidc && (
              <>
                <a className="btn lg sso-btn" href={`/api/auth/oidc/start?next=${encodeURIComponent(next)}`}>
                  <Icon name="key-round" /> {tr('Anmelden mit {name}', { name: auth.oidc.label })}
                </a>
                {showLocal && <div className="or-sep"><span>{tr('oder')}</span></div>}
              </>
            )}
            {showLocal && (
              <>
                <div className="field">
                  <label htmlFor="u">{register ? tr('Benutzername') : tr('Benutzername oder E-Mail')}</label>
                  <input id="u" className="input" autoComplete="username" value={form.username} onChange={set('username')} required autoFocus={!auth.oidc} />
                  {!register && auth.ldap && <span className="hint">{tr('Mit deinem Verzeichniskonto (Active Directory / LDAP) oder einem lokalen Konto.')}</span>}
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
                <button className={`btn lg ${auth.oidc && !register ? '' : 'primary'}`} disabled={busy}>
                  {busy && <span className="spinner" />} {register ? tr('Konto erstellen') : tr('Anmelden')}
                </button>
              </>
            )}
            {!showLocal && (
              <Link to={`/login?local=1&next=${encodeURIComponent(next)}`} className="small muted" style={{ textAlign: 'center' }}>{tr('Mit lokalem Konto anmelden')}</Link>
            )}
          </div>
        )}
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
