import { query } from '../db/index.js';

export async function audit(req, action, entityType, entityId, details = {}) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req?.user?.id ?? null, action, entityType ?? null, entityId != null ? String(entityId) : null, details, req?.ip ?? null],
    );
  } catch (err) {
    console.error('[audit] failed to write entry', err.message);
  }
}
