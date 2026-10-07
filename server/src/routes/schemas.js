import { Router } from 'express';
import { many, one, query, tx } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { conflict, intParam, notFound, pick } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { cleanFields, expiringFor, mapSchema } from '../lib/schemas.js';

const router = Router();

router.get('/schemas', requireAuth, async (_req, res) => {
  const rows = await many(
    `SELECT s.*, (SELECT count(*) FROM pages p WHERE p.schema_id=s.id)::int AS pages FROM sheet_schemas s ORDER BY s.name`,
  );
  res.json({ schemas: rows.map((s) => ({ ...mapSchema(s), pages: s.pages })) });
});

/** Upcoming and overdue expiry dates (certificates, licences, contracts …) */
router.get('/expiring', requireAuth, async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 60, 0), 3650);
  res.json({ items: await expiringFor(req.user.id, days, { reviews: req.query.reviews !== '0' }), days });
});

const schemaBody = {
  name: { type: 'string', required: true, max: 80 },
  description: { type: 'string', max: 300 },
  pageType: { type: 'string', max: 40, nullable: true },
  fields: { type: 'array', required: true },
};

router.post('/admin/schemas', requireRole('admin'), async (req, res) => {
  const b = pick(req.body, schemaBody);
  if (await one('SELECT 1 FROM sheet_schemas WHERE lower(name)=lower($1)', [b.name])) throw conflict('Ein Schema mit diesem Namen existiert bereits');
  const row = await one(
    'INSERT INTO sheet_schemas (name, description, page_type, fields) VALUES ($1,$2,$3,$4) RETURNING *',
    [b.name, b.description || '', b.pageType || null, JSON.stringify(cleanFields(b.fields))],
  );
  await audit(req, 'admin.schema.create', 'schema', row.id, { name: row.name });
  res.status(201).json({ schema: mapSchema(row) });
});

router.put('/admin/schemas/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  const old = await one('SELECT * FROM sheet_schemas WHERE id=$1', [id]);
  if (!old) throw notFound();
  const b = pick(req.body, schemaBody);
  if (await one('SELECT 1 FROM sheet_schemas WHERE lower(name)=lower($1) AND id<>$2', [b.name, id])) throw conflict('Ein Schema mit diesem Namen existiert bereits');
  const fields = cleanFields(b.fields);
  const row = await tx(async (c) => {
    // renamed fields carry their values along on every page using the schema – all renames in one
    // statement, so swapped labels (A→B, B→A) do not overwrite each other
    const renames = [];
    for (const f of fields) {
      const before = old.fields.find((x) => x.id === f.id);
      if (before && before.label !== f.label) renames.push([before.label, f.label]);
    }
    if (renames.length) {
      await c.query(
        `UPDATE pages SET properties = (properties - $2::text[]) || (
           SELECT coalesce(jsonb_object_agg(r.dst, properties->r.src), '{}'::jsonb)
             FROM unnest($2::text[], $3::text[]) AS r(src, dst) WHERE properties ? r.src)
          WHERE schema_id=$1 AND properties ?| $2::text[]`,
        [id, renames.map((r) => r[0]), renames.map((r) => r[1])],
      );
    }
    const { rows } = await c.query(
      'UPDATE sheet_schemas SET name=$2, description=$3, page_type=$4, fields=$5, updated_at=now() WHERE id=$1 RETURNING *',
      [id, b.name, b.description || '', b.pageType || null, JSON.stringify(fields)],
    );
    return rows[0];
  });
  await audit(req, 'admin.schema.update', 'schema', id, { name: row.name });
  res.json({ schema: mapSchema(row) });
});

router.delete('/admin/schemas/:id', requireRole('admin'), async (req, res) => {
  const id = intParam(req.params.id);
  // pages keep their values as free fields
  await query('DELETE FROM sheet_schemas WHERE id=$1', [id]);
  await audit(req, 'admin.schema.delete', 'schema', id);
  res.json({ ok: true });
});

export default router;
