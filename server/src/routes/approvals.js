import { Router } from 'express';
import { many, one, query } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, forbidden, intParam, notFound, pick } from '../lib/http.js';
import { LEVEL, loadPage } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { canReview, decide, loadRequest, mapRequest, withdraw } from '../lib/approvals.js';

const router = Router();

/** Turn the workflow on/off for a page. Switching it off (or changing approvers) needs space admin rights. */
router.put('/pages/:id/approval', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const b = pick(req.body, { required: { type: 'bool' }, approverGroupId: { type: 'int', nullable: true } });
  const required = req.body?.required === true;
  const groupId = b.approverGroupId ?? null;
  const loosens = (page.approval_required && !required) || (page.approval_required && groupId !== page.approver_group_id);
  if (loosens && page.access < LEVEL.admin) throw forbidden('Nur Verwalter des Bereichs können die Freigabepflicht lockern');
  if (groupId && !(await one('SELECT 1 FROM groups WHERE id=$1', [groupId]))) throw notFound('Gruppe nicht gefunden');
  await query('UPDATE pages SET approval_required=$2, approver_group_id=$3 WHERE id=$1', [page.id, required, required ? groupId : null]);
  if (!required) await query(`UPDATE change_requests SET status='withdrawn', decided_at=now() WHERE page_id=$1 AND status='pending'`, [page.id]);
  await audit(req, 'page.approval', 'page', page.id, { required, groupId });
  res.json({ required, approverGroupId: required ? groupId : null });
});

/** Open request incl. what it would replace (for the diff) */
router.get('/pages/:id/change-request', requireAuth, async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const r = await one(`SELECT id FROM change_requests WHERE page_id=$1 AND status='pending'`, [page.id]);
  if (!r) return res.json({ request: null });
  const request = await loadRequest(r.id);
  res.json({
    request: mapRequest(request),
    current: { title: page.title, content: page.content, properties: page.properties, version: page.version },
    canReview: await canReview(req.user, page, request),
    mine: request.author_id === req.user.id,
  });
});

router.post('/change-requests/:id/:action', requireAuth, async (req, res) => {
  const request = await loadRequest(intParam(req.params.id));
  const page = await loadPage(req.user, request.page_id);
  const { note, seen } = pick(req.body, { note: { type: 'string', max: 1000 }, seen: { type: 'string', max: 40 } });
  const action = req.params.action;
  if (action === 'approve' || action === 'reject') {
    // approving needs the state the reviewer looked at, so later edits by the author are never approved unseen
    if (action === 'approve' && !seen) throw badRequest('Feld "seen" ist erforderlich');
    const updated = await decide(request, page, req.user, action === 'approve', note || '', seen);
    await audit(req, `page.change_${action === 'approve' ? 'approved' : 'rejected'}`, 'page', page.id, { request: request.id });
    return res.json({ ok: true, version: updated?.version });
  }
  if (action === 'withdraw') {
    await withdraw(request, req.user);
    await audit(req, 'page.change_withdrawn', 'page', page.id, { request: request.id });
    return res.json({ ok: true });
  }
  throw notFound();
});

/** Inbox for reviewers + own requests */
router.get('/approvals', requireAuth, async (req, res) => {
  const rows = await many(
    `SELECT cr.*, a.display_name AS author_name, r.display_name AS reviewer_name, p.title AS page_title, p.space_id,
            p.approver_group_id, s.name AS space_name, s.color AS space_color
       FROM change_requests cr JOIN pages p ON p.id=cr.page_id JOIN spaces s ON s.id=p.space_id
       LEFT JOIN users a ON a.id=cr.author_id LEFT JOIN users r ON r.id=cr.reviewer_id
      WHERE page_access(p.id, $1) >= 1 AND (cr.status='pending' OR (cr.author_id=$1 AND cr.decided_at > now() - interval '30 days'))
      ORDER BY cr.status='pending' DESC, cr.updated_at DESC LIMIT 200`,
    [req.user.id],
  );
  const toReview = [];
  const mine = [];
  for (const r of rows) {
    const item = { ...mapRequest(r), content: undefined, pageTitle: r.page_title, spaceName: r.space_name, spaceColor: r.space_color };
    if (r.author_id === req.user.id) mine.push(item);
    else if (r.status === 'pending' && await canReview(req.user, { id: r.page_id, approver_group_id: r.approver_group_id }, r)) toReview.push(item);
  }
  res.json({ toReview, mine });
});

export default router;
