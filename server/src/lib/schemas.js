import crypto from 'node:crypto';
import { many, one } from '../db/index.js';
import { badRequest, HttpError } from './http.js';

/**
 * Data-sheet schemas: typed fields for the page "data sheet" (properties). Optional per page.
 * Values stay in pages.properties keyed by the field label, so search, inventory and exports keep working.
 */
export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'url', 'ip', 'email', 'bool'];

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/([12]?\d|3[0-2]))?$/;
const IPV6 = /^[0-9a-f:]+(\/\d{1,3})?$/i;

export function cleanFields(input) {
  if (!Array.isArray(input)) throw badRequest('Feld "fields" muss eine Liste sein');
  const labels = new Set();
  return input.slice(0, 60).map((f) => {
    const label = String(f?.label || '').trim().slice(0, 60);
    if (!label) throw badRequest('Jedes Feld braucht eine Bezeichnung');
    if (labels.has(label.toLowerCase())) throw badRequest(`Feld „${label}“ ist doppelt`);
    labels.add(label.toLowerCase());
    const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
    const options = type === 'select' ? [...new Set((Array.isArray(f.options) ? f.options : String(f.options || '').split(/[\n,;]/))
      .map((o) => String(o).trim()).filter(Boolean))].slice(0, 50) : [];
    if (type === 'select' && !options.length) throw badRequest(`Auswahlfeld „${label}“ braucht Optionen`);
    return {
      id: /^[\w-]{4,40}$/.test(f.id || '') ? f.id : crypto.randomBytes(6).toString('hex'),
      label,
      type,
      required: Boolean(f.required),
      options,
      expiry: type === 'date' && Boolean(f.expiry),
      leadDays: Math.min(Math.max(Number(f.leadDays) || 30, 0), 365),
      hint: String(f.hint || '').trim().slice(0, 200),
    };
  });
}

function validDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Checks properties against a schema; returns a list of messages (empty = fine) */
export function checkProperties(schema, props) {
  const errors = [];
  for (const f of schema?.fields || []) {
    const v = String(props?.[f.label] ?? '').trim();
    if (!v) {
      if (f.required) errors.push(`Pflichtfeld „${f.label}“ fehlt`);
      continue;
    }
    const bad = (
      (f.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(v))
      || (f.type === 'date' && !validDate(v))
      || (f.type === 'select' && !f.options.includes(v))
      || (f.type === 'url' && !/^https?:\/\/\S+$/i.test(v))
      || (f.type === 'ip' && !v.split(/[\s,]+/).every((x) => IPV4.test(x) || (x.includes(':') && IPV6.test(x))))
      || (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      || (f.type === 'bool' && !['true', 'false'].includes(v))
    );
    if (bad) errors.push(`„${f.label}“ hat ein ungültiges Format`);
  }
  return errors;
}

export async function loadSchema(id) {
  if (!id) return null;
  const s = await one('SELECT * FROM sheet_schemas WHERE id=$1', [id]);
  if (!s) throw badRequest('Datenblatt-Schema nicht gefunden');
  return s;
}

/** Throws a 400 listing every problem, so the editor can show them all */
export function assertProperties(schema, props) {
  const errors = checkProperties(schema, props);
  if (errors.length) throw new HttpError(400, errors[0], { fields: errors });
}

export const mapSchema = (s) => s && ({
  id: s.id, name: s.name, description: s.description, pageType: s.page_type, fields: s.fields, updatedAt: s.updated_at,
});

/** Free (schema-less) data-sheet keys that name an expiry date, e.g. „Gültig bis“, „Garantie“, „Valid until“ */
export const EXPIRY_KEY = /(gültig|gueltig|ablauf|läuft|laeuft|expir|valid|garantie|gewährleistung|warranty|laufzeit|vertragsende|support|end.of.life|\beol\b|renew|erneuer|wartung bis|maintenance until|frist|deadline)|\sbis$|\suntil$/i;

/** Accepts 2026-10-17, 2026-10-17 12:00, 17.10.2026, 17.10.26 and 2026/10/17 → ISO date or null */
export function parseDate(value) {
  const v = String(value ?? '').trim();
  let m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
  let iso = m && `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if (!iso && (m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?:\s.*)?$/))) {
    iso = `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return iso && validDate(iso) ? iso : null;
}

/**
 * Deadlines the user can see: [{ pageId, title, kind, field, due, daysLeft, leadDays, … }]
 * kind: 'schema' (date field with „Ablauf überwachen“), 'field' (free field such as „Gültig bis“), 'review' (page review date).
 * days = horizon; overdue entries are always included.
 */
export async function expiringFor(userId, days = 60, { reviews = true } = {}) {
  const rows = await many(
    `SELECT p.id, p.title, p.properties, p.page_type, p.space_id, p.review_due::text AS review_due, s.fields,
            sp.key AS space_key, sp.name AS space_name, sp.color AS space_color
       FROM pages p LEFT JOIN sheet_schemas s ON s.id=p.schema_id JOIN spaces sp ON sp.id=p.space_id
      WHERE (p.properties <> '{}'::jsonb OR p.review_due IS NOT NULL) ${userId ? 'AND page_access(p.id, $1) >= 1' : ''}`,
    userId ? [userId] : [],
  );
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  const out = [];
  const add = (r, kind, field, due, leadDays) => {
    const daysLeft = Math.round((new Date(`${due}T00:00:00Z`).getTime() - today) / 864e5);
    if (daysLeft > days) return;
    out.push({
      pageId: r.id, title: r.title, pageType: r.page_type, spaceId: r.space_id, kind, field, due, daysLeft, leadDays,
      spaceKey: r.space_key, spaceName: r.space_name, spaceColor: r.space_color,
    });
  };
  for (const r of rows) {
    const fields = r.fields || [];
    const typed = new Set(fields.map((f) => f.label.toLowerCase()));
    for (const f of fields.filter((x) => x.expiry)) {
      const due = parseDate(r.properties?.[f.label]);
      if (due) add(r, 'schema', f.label, due, f.leadDays);
    }
    // Free fields: only keys the schema does not define (a schema date field without „Ablauf überwachen“ is a deliberate choice)
    for (const [key, value] of Object.entries(r.properties || {})) {
      if (typed.has(key.toLowerCase()) || !EXPIRY_KEY.test(key)) continue;
      const due = parseDate(value);
      if (due) add(r, 'field', key, due, 30);
    }
    if (reviews && r.review_due) add(r, 'review', 'Review', r.review_due.slice(0, 10), 14);
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
}
