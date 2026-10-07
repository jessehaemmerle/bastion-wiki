import { many, one, query, tx } from '../db/index.js';
import { conflict, forbidden, notFound } from './http.js';
import { LEVEL, pageAccess } from './permissions.js';
import { notifyPageEvent, notifyUsers } from './notify.js';
import { normalizeTags, writePage } from '../routes/pages.js';

/**
 * Approval workflow (four-eyes principle), optional per page:
 * content changes become a change request; somebody else with write access
 * (or a member of the page's approver group) approves or rejects it.
 */
const SELECT = `SELECT cr.*, a.display_name AS author_name, r.display_name AS reviewer_name
  FROM change_requests cr LEFT JOIN users a ON a.id=cr.author_id LEFT JOIN users r ON r.id=cr.reviewer_id`;

export async function canReview(user, page, request) {
  if (!user || !request || request.author_id === user.id) return false;
  if ((await pageAccess(user, page.id)) < LEVEL.write) return false;
  if (!page.approver_group_id || user.role === 'admin') return true;
  return Boolean(await one('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2', [page.approver_group_id, user.id]));
}

async function approversOf(page, authorId) {
  return (await many(
    `SELECT u.id FROM users u
      WHERE u.is_active AND u.id <> $2 AND page_access($1, u.id) >= 2
        AND CASE WHEN $3::int IS NOT NULL
                 THEN u.role = 'admin' OR u.id IN (SELECT user_id FROM group_members WHERE group_id = $3)
                 ELSE u.role = 'admin' OR space_access($4, u.id) >= 3
                      OR EXISTS (SELECT 1 FROM watches w WHERE w.user_id=u.id AND (w.page_id=$1 OR w.space_id=$4)) END`,
    [page.id, authorId, page.approver_group_id, page.space_id],
  )).map((r) => r.id);
}

/** Creates the change request (or updates the author's open one) */
export async function submitChangeRequest(page, fields, user) {
  const open = await one(`${SELECT} WHERE cr.page_id=$1 AND cr.status='pending'`, [page.id]);
  if (open && open.author_id !== user.id) {
    throw conflict(`Es gibt bereits einen offenen Änderungsvorschlag von ${open.author_name || 'jemand anderem'}`);
  }
  const values = [
    fields.title ?? open?.title ?? page.title,
    fields.content ?? open?.content ?? page.content,
    JSON.stringify(fields.properties ?? open?.properties ?? page.properties),
    fields.tags ? normalizeTags(fields.tags) : open?.tags ?? null,
    fields.schemaId !== undefined ? fields.schemaId : open ? open.schema_id : page.schema_id,
    fields.summary ?? open?.summary ?? '',
  ];
  let row;
  if (open) {
    row = await one(
      `UPDATE change_requests SET title=$2, content=$3, properties=$4, tags=$5, schema_id=$6, summary=$7, updated_at=now()
        WHERE id=$1 AND status='pending' RETURNING *`,
      [open.id, ...values],
    );
    if (!row) throw conflict('Der Änderungsvorschlag ist bereits erledigt');
  } else {
    row = await one(
      `INSERT INTO change_requests (page_id, base_version, title, content, properties, tags, schema_id, summary, author_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [page.id, page.version, ...values, user.id],
    );
    await notifyUsers(await approversOf(page, user.id), 'approval.request', page, user, { requestId: row.id, summary: values[5] });
  }
  return row;
}

/** Summary of the open request for the page view */
export async function pendingFor(page, user) {
  if (!page.approval_required) return null;
  const r = await one(`${SELECT} WHERE cr.page_id=$1 AND cr.status='pending'`, [page.id]);
  if (!r) return null;
  return {
    id: r.id, author: r.author_name, authorId: r.author_id, summary: r.summary, createdAt: r.created_at, updatedAt: r.updated_at,
    baseVersion: r.base_version, mine: r.author_id === user.id, canReview: await canReview(user, page, r),
  };
}

export async function loadRequest(id) {
  const r = await one(`${SELECT} WHERE cr.id=$1`, [id]);
  if (!r) throw notFound('Änderungsvorschlag nicht gefunden');
  return r;
}

export const mapRequest = (r) => ({
  id: r.id, pageId: r.page_id, baseVersion: r.base_version, title: r.title, content: r.content, properties: r.properties,
  tags: r.tags, schemaId: r.schema_id, summary: r.summary, status: r.status, author: r.author_name, authorId: r.author_id,
  reviewer: r.reviewer_name, reviewNote: r.review_note, createdAt: r.created_at, updatedAt: r.updated_at, decidedAt: r.decided_at,
});

export async function decide(request, page, reviewer, approve, note = '') {
  if (request.status !== 'pending') throw conflict('Der Änderungsvorschlag ist bereits erledigt');
  if (!(await canReview(reviewer, page, request))) throw forbidden('Du darfst diesen Änderungsvorschlag nicht freigeben (Vier-Augen-Prinzip)');
  let updated = null;
  await tx(async (c) => {
    // re-check under a lock: a parallel decision (or withdrawal) must not apply the request twice
    const { rows: [locked] } = await c.query('SELECT * FROM change_requests WHERE id=$1 FOR UPDATE', [request.id]);
    if (!locked || locked.status !== 'pending') throw conflict('Der Änderungsvorschlag ist bereits erledigt');
    request = { ...request, ...locked };
    if (approve) {
      const { rows: [current] } = await c.query('SELECT * FROM pages WHERE id=$1 FOR UPDATE', [page.id]);
      const author = (await c.query('SELECT * FROM users WHERE id=$1', [request.author_id])).rows[0] || reviewer;
      const summary = [request.summary, `freigegeben von ${reviewer.display_name}`].filter(Boolean).join(' – ');
      ({ page: updated } = await writePage(c, current, {
        title: request.title, content: request.content, properties: request.properties, schemaId: request.schema_id,
        ...(request.tags ? { tags: request.tags } : {}),
      }, author, summary));
    }
    await c.query(
      `UPDATE change_requests SET status=$2, reviewer_id=$3, review_note=$4, decided_at=now(), updated_at=now() WHERE id=$1`,
      [request.id, approve ? 'approved' : 'rejected', reviewer.id, note],
    );
  });
  await notifyUsers([request.author_id], 'approval.decision', page, reviewer, { status: approve ? 'approved' : 'rejected', note, requestId: request.id });
  if (approve && updated) notifyPageEvent('page.update', updated, reviewer, { version: updated.version, summary: request.summary, skipUsers: [request.author_id] });
  return updated;
}

export async function withdraw(request, user) {
  if (request.author_id !== user.id) throw forbidden();
  if (request.status !== 'pending') throw conflict('Der Änderungsvorschlag ist bereits erledigt');
  const { rowCount } = await query(`UPDATE change_requests SET status='withdrawn', decided_at=now(), updated_at=now() WHERE id=$1 AND status='pending'`, [request.id]);
  if (!rowCount) throw conflict('Der Änderungsvorschlag ist bereits erledigt');
}
