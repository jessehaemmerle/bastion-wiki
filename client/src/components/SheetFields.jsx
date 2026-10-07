import Icon from './Icon.jsx';
import { formatDate } from '../lib/format.js';
import { tr, trn } from '../lib/i18n.js';

export const FIELD_TYPES = {
  get text() { return tr('Text'); },
  get number() { return tr('Zahl'); },
  get date() { return tr('Datum'); },
  get select() { return tr('Auswahl'); },
  get url() { return tr('Link (URL)'); },
  get ip() { return tr('IP-Adresse / Netz'); },
  get email() { return tr('E-Mail'); },
  get bool() { return tr('Ja / Nein'); },
};

export const daysUntil = (iso) => {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - today) / 864e5);
};

/** Badge for expiry dates: overdue / within reminder window / fine */
export function ExpiryBadge({ date, leadDays = 30 }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const d = daysUntil(date);
  if (d < 0) return <span className="badge danger">{trn(-d, 'seit 1 Tag abgelaufen', 'seit {n} Tagen abgelaufen')}</span>;
  if (d === 0) return <span className="badge danger">{tr('läuft heute ab')}</span>;
  if (d <= leadDays) return <span className="badge warning">{trn(d, 'noch 1 Tag', 'noch {n} Tage')}</span>;
  return null;
}

/** Read-only rendering of one data-sheet value according to its field type */
export function FieldValue({ field, value }) {
  if (!value) return <span>—</span>;
  switch (field?.type) {
    case 'date':
      return <span className="row" style={{ gap: 6 }}>{formatDate(value)} {field.expiry && <ExpiryBadge date={value} leadDays={field.leadDays} />}</span>;
    case 'bool':
      return <span>{value === 'true' ? tr('Ja') : tr('Nein')}</span>;
    case 'url':
      return <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>;
    case 'email':
      return <a href={`mailto:${value}`}>{value}</a>;
    default:
      if (/^https?:\/\/\S+$/.test(value)) return <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>;
      return <span>{value}</span>;
  }
}

function FieldInput({ field, value, onChange, error }) {
  const id = `sf-${field.id}`;
  const common = { id, 'aria-invalid': error ? 'true' : undefined, 'aria-required': field.required ? 'true' : undefined };
  let input;
  switch (field.type) {
    case 'select':
      input = (
        <select {...common} className="select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case 'bool':
      input = (
        <div className="segmented" role="group" aria-labelledby={`${id}-l`}>
          {[['', '—'], ['true', tr('Ja')], ['false', tr('Nein')]].map(([v, l]) => (
            <button key={v} type="button" className={(value || '') === v ? 'active' : ''} onClick={() => onChange(v)}>{l}</button>
          ))}
        </div>
      );
      break;
    case 'date':
      input = <input {...common} type="date" className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'number':
      input = <input {...common} inputMode="decimal" className="input mono" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      input = (
        <input {...common} type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
          className={`input ${['ip', 'url'].includes(field.type) ? 'mono' : ''}`} value={value || ''} spellCheck={false}
          placeholder={field.type === 'ip' ? '10.0.0.1 / 10.0.0.0/24' : field.type === 'url' ? 'https://' : undefined}
          onChange={(e) => onChange(e.target.value)} />
      );
  }
  return (
    <div className={`field sheet-field ${error ? 'invalid' : ''}`}>
      <label htmlFor={id} id={`${id}-l`}>
        {field.label}{field.required && <span className="req" aria-hidden="true"> *</span>}
        {field.expiry && <span className="faint" title={tr('Erinnerung {n} Tage vorher', { n: field.leadDays })}> <Icon name="bell" size={12} /></span>}
      </label>
      {input}
      {(error || field.hint) && <span className="hint">{error || field.hint}</span>}
    </div>
  );
}

/** Client-side check mirroring the server (lib/schemas.js) for instant feedback */
export function checkSheet(schema, props) {
  const errors = {};
  for (const f of schema?.fields || []) {
    const v = String(props?.[f.label] ?? '').trim();
    if (!v) { if (f.required) errors[f.label] = tr('Pflichtfeld'); continue; }
    const bad = (f.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(v)) || (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v))
      || (f.type === 'url' && !/^https?:\/\/\S+$/i.test(v)) || (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      || (f.type === 'select' && !f.options.includes(v));
    if (bad) errors[f.label] = tr('Ungültiges Format');
  }
  return errors;
}

/** Typed inputs for the schema's fields; free fields are edited separately */
export function SchemaFieldsEditor({ schema, value, onChange, errors = {} }) {
  if (!schema) return null;
  return (
    <div className="sheet-grid">
      {schema.fields.map((f) => (
        <FieldInput key={f.id} field={f} value={value[f.label]} error={errors[f.label]} onChange={(v) => onChange({ ...value, [f.label]: v })} />
      ))}
    </div>
  );
}

/** Properties that are not part of the schema (shown in the free editor) */
export function splitProps(schema, props) {
  const labels = new Set((schema?.fields || []).map((f) => f.label));
  const typed = {};
  const free = {};
  for (const [k, v] of Object.entries(props || {})) (labels.has(k) ? typed : free)[k] = v;
  return { typed, free };
}
