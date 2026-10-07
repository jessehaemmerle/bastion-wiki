import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Spinner, useCopy } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { tr, trServer } from '../../lib/i18n.js';
import { ROLE_LABELS } from '../../lib/format.js';
import { Field, SaveBar, TestResult, useIntegrations } from './integrationForm.jsx';

const roleOptions = () => [['editor', ROLE_LABELS.editor], ['viewer', ROLE_LABELS.viewer], ['admin', ROLE_LABELS.admin], ['none', tr('Kein Zugang (nur zugeordnete Gruppen)')]];

const groupFields = () => [
  { key: 'adminGroups', label: tr('Gruppen → Administrator'), type: 'textarea', rows: 2, placeholder: 'cn=wiki-admins,ou=groups,dc=corp,dc=local' },
  { key: 'editorGroups', label: tr('Gruppen → Redakteur'), type: 'textarea', rows: 2, placeholder: 'IT-Betrieb' },
  { key: 'viewerGroups', label: tr('Gruppen → Betrachter'), type: 'textarea', rows: 2 },
  { key: 'defaultRole', label: tr('Rolle ohne passende Gruppe'), type: 'select', options: roleOptions() },
  { key: 'syncGroups', label: tr('Wiki-Gruppen mit „externem Namen“ bei jeder Anmeldung abgleichen'), type: 'bool', wide: true },
];

function Policy({ sec }) {
  const fields = [
    {
      key: 'require2fa', label: tr('Zwei-Faktor-Anmeldung vorschreiben'), type: 'select',
      options: [['off', tr('Nein, freiwillig')], ['admins', tr('Für Administratoren')], ['all', tr('Für alle mit Passwort-Anmeldung')]],
      hint: tr('Betroffene müssen 2FA einrichten, bevor sie weiterarbeiten können. SSO-Konten sind ausgenommen (das regelt der Identitätsanbieter).'),
    },
    { key: 'publicUrl', label: tr('Öffentliche Adresse des Wikis'), placeholder: 'https://wiki.example.org', mono: true, hint: tr('Für Links in E-Mails, Webhooks, Git-Export und die OIDC-Rückleitung. Leer = aus der Anfrage ermitteln.') },
    { key: 'localLogin', label: tr('Anmeldeformular für lokale Konten anzeigen'), type: 'bool', hint: tr('Aus: Nur SSO-Button. Administratoren kommen über /login?local=1 weiterhin mit lokalem Konto hinein.') },
    { key: 'allowSharing', label: tr('Freigabelinks erlauben'), type: 'bool' },
    { key: 'maxShareDays', label: tr('Freigabelinks höchstens gültig (Tage)'), type: 'number', min: 1, max: 3650 },
  ];
  return (
    <section className="settings-section">
      <div><h3>{tr('Richtlinien')}</h3><p>{tr('Gelten für alle Anmeldewege.')}</p></div>
      <div>
        <div className="form-grid">{fields.map((f) => <Field key={f.key} f={f} sec={sec} />)}</div>
        <SaveBar sec={sec} />
      </div>
    </section>
  );
}

function Ldap({ sec }) {
  const [username, setUsername] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try {
      const { result: r } = await api.post('/admin/integrations/ldap/test', { config: sec.draft, username });
      setResult(r);
    } catch (e) { setResult({ ok: false, error: e.message }); }
    setBusy(false);
  };
  const fields = [
    { key: 'enabled', label: tr('Anmeldung über LDAP / Active Directory'), type: 'bool', wide: true },
    { key: 'url', label: tr('Server'), placeholder: 'ldaps://dc01.corp.local:636', mono: true, hint: tr('ldaps:// (Port 636) oder ldap:// mit StartTLS.') },
    { key: 'startTls', label: tr('StartTLS verwenden (bei ldap://)'), type: 'bool' },
    { key: 'bindDn', label: tr('Dienstkonto (Bind-DN)'), placeholder: 'CN=svc-wiki,OU=Service,DC=corp,DC=local', mono: true },
    { key: 'bindPassword', label: tr('Passwort des Dienstkontos'), type: 'password' },
    { key: 'baseDn', label: tr('Suchbasis'), placeholder: 'DC=corp,DC=local', mono: true },
    { key: 'userFilter', label: tr('Benutzerfilter'), mono: true, hint: tr('{username} wird durch die Eingabe ersetzt (maskiert). AD: (&(objectClass=user)(sAMAccountName={username}))') },
    { key: 'usernameAttr', label: tr('Attribut Benutzername'), mono: true, placeholder: 'sAMAccountName / uid' },
    { key: 'displayNameAttr', label: tr('Attribut Anzeigename'), mono: true },
    { key: 'emailAttr', label: tr('Attribut E-Mail'), mono: true },
    { key: 'groupAttr', label: tr('Attribut Gruppen'), mono: true, hint: tr('memberOf (AD, OpenLDAP mit memberof-Overlay). Leer lassen, wenn Gruppen gesucht werden.') },
    { key: 'groupBaseDn', label: tr('Gruppensuche: Basis (optional)'), mono: true },
    { key: 'groupFilter', label: tr('Gruppensuche: Filter (optional)'), mono: true, placeholder: '(member={dn})', hint: tr('Für Server ohne memberOf. AD mit verschachtelten Gruppen: (member:1.2.840.113556.1.4.1941:={dn})') },
    { key: 'caCert', label: tr('CA-Zertifikat (PEM, optional)'), type: 'textarea', rows: 3, placeholder: '-----BEGIN CERTIFICATE-----', wide: true, hint: tr('Für interne Zertifizierungsstellen. Die Zertifikatsprüfung bleibt immer aktiv.') },
    ...groupFields(),
  ];
  return (
    <section className="settings-section">
      <div>
        <h3>{tr('LDAP / Active Directory')}</h3>
        <p>{tr('Benutzer melden sich mit ihrem Verzeichniskonto an; das Konto wird beim ersten Login angelegt. Rollen und Gruppen ergeben sich aus den Verzeichnisgruppen (eine pro Zeile, DN oder Name).')}</p>
      </div>
      <div>
        <div className="form-grid">{fields.map((f) => <Field key={f.key} f={f} sec={sec} />)}</div>
        <SaveBar sec={sec}>
          <input className="input" style={{ maxWidth: 200 }} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={tr('Testbenutzer (optional)')} aria-label={tr('Testbenutzer')} />
          <button className="btn" onClick={test} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="radar" size={15} />} {tr('Verbindung testen')}</button>
        </SaveBar>
        {result && (
          <TestResult result={{
            ok: result.ok && result.found !== false,
            children: !result.ok ? trServer(result.error)
              : result.found === false ? tr('Verbindung ok, aber kein Benutzer „{u}“ gefunden.', { u: username })
                : result.found ? (
                  <div className="col" style={{ gap: 4 }}>
                    <div>{tr('Gefunden: {name} ({mail}) → Rolle: {role}', { name: result.displayName || result.username, mail: result.email || '—', role: result.role === 'none' ? tr('kein Zugang') : ROLE_LABELS[result.role] })}</div>
                    <div className="mono tiny break">{result.dn}</div>
                    {result.groups.length > 0 && <div className="tiny">{tr('Gruppen')}: <span className="mono">{result.groups.join(' · ')}</span></div>}
                  </div>
                ) : tr('Verbindung und Dienstkonto in Ordnung.'),
          }} />
        )}
      </div>
    </section>
  );
}

function Oidc({ sec, redirectUri }) {
  const [result, setResult] = useState(null);
  const [copied, copy] = useCopy();
  const test = async () => {
    try {
      const { result: r } = await api.post('/admin/integrations/oidc/test', { config: sec.draft });
      setResult(r);
    } catch (e) { setResult({ ok: false, error: e.message }); }
  };
  const fields = [
    { key: 'enabled', label: tr('Anmeldung über OpenID Connect (SSO)'), type: 'bool', wide: true },
    { key: 'issuer', label: tr('Issuer-URL'), placeholder: 'https://login.microsoftonline.com/<tenant>/v2.0', mono: true, hint: tr('Keycloak: https://sso.example.org/realms/<realm> · Authentik: https://auth.example.org/application/o/<slug>/') },
    { key: 'clientId', label: tr('Client-ID'), mono: true },
    { key: 'clientSecret', label: tr('Client-Secret'), type: 'password' },
    { key: 'scopes', label: tr('Scopes'), mono: true },
    { key: 'buttonLabel', label: tr('Beschriftung des Buttons'), placeholder: 'Microsoft 365' },
    { key: 'usernameClaim', label: tr('Claim für Benutzername'), mono: true },
    { key: 'groupsClaim', label: tr('Claim für Gruppen'), mono: true, hint: tr('Entra ID liefert Gruppen-IDs, Keycloak benötigt einen „groups“-Mapper.') },
    { key: 'autoCreate', label: tr('Konten beim ersten Login automatisch anlegen'), type: 'bool' },
    ...groupFields(),
  ];
  return (
    <section className="settings-section">
      <div>
        <h3>{tr('OpenID Connect')}</h3>
        <p>{tr('Single Sign-on mit Entra ID, Keycloak, Authentik, Okta, Google … Auf der Anmeldeseite erscheint ein zusätzlicher Button.')}</p>
      </div>
      <div>
        <div className="field">
          <label>{tr('Redirect-URI (beim Identitätsanbieter eintragen)')}</label>
          <div className="secret-box"><span className="grow mono small break">{redirectUri}</span><button className="btn sm" onClick={() => copy(redirectUri)}><Icon name={copied ? 'check' : 'copy'} size={14} /></button></div>
        </div>
        <div className="form-grid">{fields.map((f) => <Field key={f.key} f={f} sec={sec} />)}</div>
        <SaveBar sec={sec}><button className="btn" onClick={test}><Icon name="radar" size={15} /> {tr('Discovery testen')}</button></SaveBar>
        {result && <TestResult result={{ ok: result.ok, children: result.ok ? tr('Anbieter erreichbar: {issuer}', { issuer: result.issuer }) : trServer(result.error) }} />}
      </div>
    </section>
  );
}

export default function Auth() {
  const { data, error, section } = useIntegrations();
  if (error) return <div className="error-box" role="alert">{error.message}</div>;
  if (!data) return <Spinner center />;
  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Anmeldung & Sicherheit')}</h1><p>{tr('Verzeichnisdienst, Single Sign-on und Richtlinien für Zwei-Faktor-Anmeldung und Freigabelinks.')}</p></div>
      </div>
      <div className="card pad">
        <Policy sec={section('security')} />
        <Ldap sec={section('ldap')} />
        <Oidc sec={section('oidc')} redirectUri={data.meta.oidcRedirectUri} />
      </div>
    </>
  );
}
