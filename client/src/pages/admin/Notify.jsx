import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Confirm, Modal, Spinner, Switch } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { useFetch } from '../../lib/hooks.js';
import { timeAgo } from '../../lib/format.js';
import { tr } from '../../lib/i18n.js';
import { Field, SaveBar, TestResult, useIntegrations } from './integrationForm.jsx';

const KINDS = {
  slack: { label: 'Slack / Mattermost', hint: 'https://hooks.slack.com/services/…' },
  teams: { label: 'Microsoft Teams (Workflows)', hint: 'https://prod-…logic.azure.com/workflows/…' },
  matrix: { label: 'Matrix (Hookshot)', hint: 'https://hookshot.example.org/webhook/…' },
  discord: { label: 'Discord', hint: 'https://discord.com/api/webhooks/…' },
  generic: { label: 'JSON (generisch)', hint: 'https://automation.example.org/hooks/wiki' },
};
const EVENT_LABEL = {
  get 'page.create'() { return tr('Seite angelegt'); },
  get 'page.update'() { return tr('Seite geändert'); },
  get 'page.delete'() { return tr('Seite gelöscht'); },
  get 'review.due'() { return tr('Review fällig'); },
  get 'run.finish'() { return tr('Durchlauf beendet'); },
  get 'comment.create'() { return tr('Kommentar'); },
  get 'expiry.due'() { return tr('Frist läuft ab'); },
  get 'approval.request'() { return tr('Freigabe angefragt'); },
  get 'approval.decision'() { return tr('Freigabe entschieden'); },
};

function Smtp({ sec }) {
  const { user } = useApp();
  const [to, setTo] = useState(user.email || '');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const fields = [
    { key: 'enabled', label: tr('E-Mail-Benachrichtigungen versenden'), type: 'bool', wide: true },
    { key: 'host', label: tr('SMTP-Server'), placeholder: 'smtp.example.org', mono: true },
    { key: 'port', label: tr('Port'), type: 'number', min: 1, max: 65535, hint: tr('587 mit STARTTLS, 465 mit TLS, 25 intern.') },
    { key: 'secure', label: tr('Direkt über TLS verbinden (Port 465)'), type: 'bool' },
    { key: 'user', label: tr('Benutzer'), mono: true },
    { key: 'password', label: tr('Passwort'), type: 'password' },
    { key: 'from', label: tr('Absender'), placeholder: 'Wiki <wiki@example.org>' },
    { key: 'digestMinutes', label: tr('Bündeln (Minuten)'), type: 'number', min: 0, max: 1440, hint: tr('Änderungen werden gesammelt und als eine Mail verschickt. Bereits im Wiki gelesene Meldungen werden nicht gemailt.') },
  ];
  const test = async () => {
    setBusy(true);
    try {
      if (sec.dirty) await sec.save();
      const { result: r } = await api.post('/admin/integrations/smtp/test', { to });
      setResult(r);
    } catch (e) { setResult({ ok: false, error: e.message }); }
    setBusy(false);
  };
  return (
    <section className="settings-section">
      <div><h3>{tr('E-Mail')}</h3><p>{tr('Benachrichtigungen über beobachtete Seiten und fällige Reviews. Jede Person kann E-Mails in ihren Einstellungen abbestellen.')}</p></div>
      <div>
        <div className="form-grid">{fields.map((f) => <Field key={f.key} f={f} sec={sec} />)}</div>
        <SaveBar sec={sec}>
          <input className="input" style={{ maxWidth: 240 }} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="admin@example.org" aria-label={tr('Empfänger der Testmail')} />
          <button className="btn" onClick={test} disabled={busy || !to}>{busy ? <span className="spinner" /> : <Icon name="send" size={15} />} {tr('Testmail senden')}</button>
        </SaveBar>
        {result && <TestResult result={{ ok: result.ok, children: result.ok ? tr('Testmail an {to} verschickt.', { to }) : result.error }} />}
      </div>
    </section>
  );
}

function HookModal({ hook, events, onClose, onSaved }) {
  const { spaces, toast } = useApp();
  const [f, setF] = useState(hook ? { ...hook, url: '' } : { name: '', kind: 'slack', url: '', events: [...events], spaceIds: [], isActive: true });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k, v) => set(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v]);
  const save = async () => {
    try {
      const body = { name: f.name, kind: f.kind, events: f.events, spaceIds: f.spaceIds, isActive: f.isActive, ...(f.url ? { url: f.url } : {}) };
      if (hook) await api.put(`/admin/ops/webhooks/${hook.id}`, body);
      else await api.post('/admin/ops/webhooks', body);
      onSaved();
      onClose();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={hook ? tr('Webhook bearbeiten') : tr('Webhook anlegen')} icon="webhook" size="lg" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{tr('Abbrechen')}</button><button className="btn primary" disabled={!f.name || (!hook && !f.url)} onClick={save}>{tr('Speichern')}</button></>}>
      <div className="form-grid">
        <div className="field"><label htmlFor="wh-name">{tr('Name')}</label><input id="wh-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={tr('z. B. #ops-wiki')} autoFocus /></div>
        <div className="field">
          <label htmlFor="wh-kind">{tr('Ziel')}</label>
          <select id="wh-kind" className="select" value={f.kind} onChange={(e) => set('kind', e.target.value)}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </select>
        </div>
        <div className="field span-2">
          <label htmlFor="wh-url">{tr('Webhook-URL')}</label>
          <input id="wh-url" className="input mono" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder={hook ? tr('•••••• gespeichert ({host}) – zum Ändern neu eingeben', { host: hook.host }) : KINDS[f.kind].hint} />
          <span className="hint">{tr('Wird verschlüsselt gespeichert, da die URL meist ein Token enthält.')}</span>
        </div>
      </div>
      <div className="field">
        <label>{tr('Ereignisse')}</label>
        <div className="row wrap" style={{ gap: 14 }}>
          {events.map((e) => (
            <label key={e} className="row small" style={{ gap: 6 }}><input type="checkbox" checked={f.events.includes(e)} onChange={() => toggle('events', e)} /> {EVENT_LABEL[e]}</label>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{tr('Bereiche')} <span className="faint">{tr('(keine Auswahl = alle)')}</span></label>
        <div className="row wrap" style={{ gap: 14 }}>
          {spaces.map((s) => (
            <label key={s.id} className="row small" style={{ gap: 6 }}><input type="checkbox" checked={f.spaceIds.includes(s.id)} onChange={() => toggle('spaceIds', s.id)} /> {s.name}</label>
          ))}
        </div>
      </div>
      <Switch checked={f.isActive} onChange={(v) => set('isActive', v)} label={tr('Aktiv')} />
    </Modal>
  );
}

function Webhooks() {
  const { toast } = useApp();
  const { data, reload } = useFetch('/admin/ops/webhooks');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const test = async (h) => {
    try {
      const r = await api.post(`/admin/ops/webhooks/${h.id}/test`);
      toast(r.ok ? tr('Testnachricht zugestellt ({status})', { status: r.status }) : tr('Zustellung fehlgeschlagen: {status}', { status: r.status }), r.ok ? 'success' : 'error');
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <section className="settings-section">
      <div><h3>{tr('Webhooks')}</h3><p>{tr('Meldet Änderungen in Chat-Kanäle oder an eigene Automatisierung. Teams: „Workflows“-Webhook verwenden.')}</p></div>
      <div>
        {!data ? <Spinner /> : (
          <div className="table-wrap card">
            <table className="data">
              <thead><tr><th>{tr('Name')}</th><th>{tr('Ziel')}</th><th>{tr('Ereignisse')}</th><th>{tr('Zuletzt')}</th><th /></tr></thead>
              <tbody>
                {!data.webhooks.length && <tr><td colSpan={5} className="faint small">{tr('Noch keine Webhooks.')}</td></tr>}
                {data.webhooks.map((h) => (
                  <tr key={h.id} className={h.isActive ? '' : 'faint'}>
                    <td><strong>{h.name}</strong><div className="tiny faint mono">{h.host}</div></td>
                    <td className="small">{tr(KINDS[h.kind]?.label || h.kind)}</td>
                    <td className="small">{h.events.map((e) => EVENT_LABEL[e]).join(', ')}</td>
                    <td className="small">{h.lastAt ? <><span className={`badge ${/^2\d\d$/.test(h.lastStatus) ? 'success' : 'danger'}`}>{h.lastStatus}</span> <span className="faint">{timeAgo(h.lastAt)}</span></> : '—'}</td>
                    <td className="actions">
                      <button className="btn ghost sm" onClick={() => test(h)}><Icon name="send" size={14} /> {tr('Test')}</button>
                      <button className="btn ghost icon sm" onClick={() => setEdit(h)} aria-label={tr('Bearbeiten')}><Icon name="pen" size={14} /></button>
                      <button className="btn ghost icon sm" onClick={() => setDel(h)} aria-label={tr('Löschen')}><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 12 }}><button className="btn" onClick={() => setEdit('new')}><Icon name="plus" size={15} /> {tr('Webhook anlegen')}</button></div>
      </div>
      {edit && <HookModal hook={edit === 'new' ? null : edit} events={data?.events || []} onClose={() => setEdit(null)} onSaved={reload} />}
      {del && <Confirm danger title={tr('Webhook löschen?')} message={del.name} confirmLabel={tr('Löschen')} onClose={() => setDel(null)}
        onConfirm={async () => { await api.del(`/admin/ops/webhooks/${del.id}`); reload(); }} />}
    </section>
  );
}

export default function Notify() {
  const { data, section } = useIntegrations();
  if (!data) return <Spinner center />;
  return (
    <>
      <div className="page-head">
        <div><h1>{tr('Benachrichtigungen')}</h1><p>{tr('Wer Seiten oder Bereiche beobachtet, erfährt von Änderungen – im Wiki, per E-Mail und in Chat-Kanälen.')}</p></div>
      </div>
      <div className="card pad">
        <Smtp sec={section('smtp')} />
        <Webhooks />
      </div>
    </>
  );
}
