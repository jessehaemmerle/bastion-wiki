export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Nicht angemeldet') => new HttpError(401, msg);
export const forbidden = (msg = 'Keine Berechtigung') => new HttpError(403, msg);
export const notFound = (msg = 'Nicht gefunden') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Postgres "integer" range – larger values would fail in the query with a 500 */
const INT4_MAX = 2147483647;

/** Parse a positive integer id from a route param or throw 400 */
export function intParam(value, name = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > INT4_MAX) throw badRequest(`Ungültige ${name}`);
  return n;
}

/** Tiny body validator: pick + type-check allowed fields */
export function pick(body, schema, { partial = false } = {}) {
  const out = {};
  for (const [key, rule] of Object.entries(schema)) {
    const v = body?.[key];
    if (v === undefined || v === null || v === '') {
      if (rule.required && !partial) throw badRequest(`Feld "${key}" ist erforderlich`);
      if (v === null && rule.nullable) out[key] = null;
      else if (v === '' && rule.type === 'string' && !rule.required) out[key] = '';
      else if (v === '' && rule.nullable) out[key] = null;
      continue;
    }
    switch (rule.type) {
      case 'string': {
        if (typeof v !== 'string') throw badRequest(`Feld "${key}" muss Text sein`);
        const s = rule.trim === false ? v : v.trim();
        if (rule.max && s.length > rule.max) throw badRequest(`Feld "${key}" ist zu lang (max. ${rule.max})`);
        if (rule.min && s.length < rule.min) throw badRequest(`Feld "${key}" ist zu kurz (min. ${rule.min})`);
        if (rule.pattern && !rule.pattern.test(s)) throw badRequest(`Feld "${key}" hat ein ungültiges Format`);
        if (rule.enum && !rule.enum.includes(s)) throw badRequest(`Feld "${key}" hat einen ungültigen Wert`);
        out[key] = s;
        break;
      }
      case 'int': {
        const n = Number(v);
        if (!Number.isInteger(n) || Math.abs(n) > INT4_MAX) throw badRequest(`Feld "${key}" muss eine Ganzzahl sein`);
        out[key] = n;
        break;
      }
      case 'bool':
        out[key] = Boolean(v);
        break;
      case 'object':
        if (typeof v !== 'object' || Array.isArray(v)) throw badRequest(`Feld "${key}" muss ein Objekt sein`);
        out[key] = v;
        break;
      case 'array':
        if (!Array.isArray(v)) throw badRequest(`Feld "${key}" muss eine Liste sein`);
        out[key] = v;
        break;
      default:
        out[key] = v;
    }
  }
  return out;
}

export function slugify(input) {
  const map = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };
  return (
    String(input)
      .replace(/[äöüßÄÖÜ]/g, (c) => map[c])
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'seite'
  );
}
