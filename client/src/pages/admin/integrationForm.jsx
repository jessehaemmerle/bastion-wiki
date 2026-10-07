import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Switch } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/context.jsx';
import { tr } from '../../lib/i18n.js';

/**
 * Loads all integration sections once; `section(name)` gives { values, set, save, dirty }.
 * Secret fields come back empty with a "<name>Set" flag; they are only sent when typed.
 */
export function useIntegrations() {
  const { toast, loadSettings } = useApp();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const load = useCallback(() => api.get('/admin/integrations').then((d) => { setData(d); setDraft({}); }), []);
  useEffect(() => { load().catch((e) => toast(e.message, 'error')); }, [load, toast]);

  const section = (name) => {
    const values = { ...(data?.integrations[name] || {}), ...(draft[name] || {}) };
    return {
      values,
      dirty: Boolean(draft[name] && Object.keys(draft[name]).length),
      set: (k, v) => setDraft((d) => ({ ...d, [name]: { ...(d[name] || {}), [k]: v } })),
      draft: draft[name] || {},
      save: async (extra = {}) => {
        try {
          const res = await api.put(`/admin/integrations/${name}`, { ...(draft[name] || {}), ...extra });
          setData((d) => ({ ...d, integrations: { ...d.integrations, [name]: res[name] } }));
          setDraft((d) => ({ ...d, [name]: {} }));
          await loadSettings();
          toast(tr('Gespeichert'));
          return true;
        } catch (e) {
          toast(e.message, 'error');
          return false;
        }
      },
    };
  };
  return { data, section, reload: load };
}

/** One form field driven by a small schema */
export function Field({ f, sec, disabled }) {
  const v = sec.values[f.key];
  const id = `f-${f.key}`;
  if (f.type === 'bool') {
    return (
      <div className={`field ${f.wide ? 'span-2' : ''}`}>
        <Switch checked={v} onChange={(x) => sec.set(f.key, x)} label={f.label} />
        {f.hint && <span className="hint">{f.hint}</span>}
      </div>
    );
  }
  let input;
  if (f.type === 'select') {
    input = (
      <select id={id} className="select" value={v ?? ''} disabled={disabled} onChange={(e) => sec.set(f.key, e.target.value)}>
        {f.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
      </select>
    );
  } else if (f.type === 'textarea') {
    input = <textarea id={id} className="input mono" rows={f.rows || 3} value={v ?? ''} disabled={disabled} placeholder={f.placeholder} spellCheck={false} onChange={(e) => sec.set(f.key, e.target.value)} />;
  } else if (f.type === 'password') {
    const isSet = sec.values[`${f.key}Set`] && !(f.key in sec.draft);
    input = (
      <div className="row" style={{ gap: 6 }}>
        <input id={id} className="input mono grow" type="password" autoComplete="new-password" value={sec.draft[f.key] ?? ''} disabled={disabled}
          placeholder={isSet ? tr('•••••• (gespeichert)') : f.placeholder} title={isSet ? tr('Gespeichert – zum Ändern neu eingeben') : undefined} onChange={(e) => sec.set(f.key, e.target.value)} />
        {sec.values[`${f.key}Set`] && (
          <button type="button" className="btn icon" title={tr('Gespeicherten Wert löschen')} aria-label={tr('Gespeicherten Wert löschen')} onClick={() => sec.set(f.key, '')}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
    );
  } else {
    input = (
      <input id={id} className={`input ${f.mono ? 'mono' : ''}`} type={f.type === 'number' ? 'number' : 'text'} value={v ?? ''} disabled={disabled}
        placeholder={f.placeholder} min={f.min} max={f.max} spellCheck={false}
        onChange={(e) => sec.set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)} />
    );
  }
  return (
    <div className={`field ${f.wide ? 'span-2' : ''}`}>
      <label htmlFor={id}>{f.label}</label>
      {input}
      {f.hint && <span className="hint">{f.hint}</span>}
    </div>
  );
}

export function SaveBar({ sec, children }) {
  return (
    <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
      <button className="btn primary" disabled={!sec.dirty} onClick={() => sec.save()}><Icon name="save" size={15} /> {tr('Speichern')}</button>
      {children}
    </div>
  );
}

/** Result box for connection tests */
export function TestResult({ result }) {
  if (!result) return null;
  return (
    <div className={`test-result ${result.ok ? 'ok' : 'fail'}`} role="status">
      <Icon name={result.ok ? 'check-circle' : 'alert-triangle'} size={16} />
      <div className="grow small">{result.children}</div>
    </div>
  );
}
