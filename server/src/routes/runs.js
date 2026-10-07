import { Router } from 'express';
import * as cheerio from 'cheerio';
import { many, one, query } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest, conflict, intParam, notFound, pick } from '../lib/http.js';
import { LEVEL, loadPage } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import { notifyPageEvent } from '../lib/notify.js';

/**
 * Runbook runs: execute a page step by step and keep a protocol
 * (who ticked what when, notes, outcome). Steps come from the page at start time:
 * checklist items and numbered list items; without those, the h2/h3 sections.
 */
const router = Router();
router.use(requireAuth);

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export function extractSteps(html) {
  const $ = cheerio.load(`<div id="root">${html || ''}</div>`, null, false);
  const steps = [];
  let section = '';
  $('#root').find('h1,h2,h3,h4,li').each((_i, el) => {
    const node = $(el);
    if (/^h\d$/.test(el.tagName)) {
      section = clip(node.text(), 160);
      return;
    }
    const list = node.parent();
    const isTask = list.attr('data-type') === 'taskList';
    const isOrdered = el.parent?.tagName === 'ol';
    if (!isTask && !isOrdered) return;
    const copy = node.clone();
    copy.find('ul,ol').remove();
    copy.find('label').remove();
    const text = clip(copy.text(), 500);
    if (text) steps.push({ text, section, done: false, doneAt: null, doneBy: null, note: '' });
  });
  if (!steps.length) {
    $('#root').find('h2,h3').each((_i, el) => {
      const text = clip($(el).text(), 300);
      if (text) steps.push({ text, section: '', done: false, doneAt: null, doneBy: null, note: '' });
    });
  }
  return steps.slice(0, 300);
}

function mapRun(r) {
  return {
    id: r.id, pageId: r.page_id, pageVersion: r.page_version, title: r.title, reason: r.reason, status: r.status,
    steps: r.steps, log: r.log, summary: r.summary, startedBy: r.started_by_name, startedAt: r.started_at,
    finishedAt: r.finished_at, updatedAt: r.updated_at,
    progress: { done: r.steps.filter((s) => s.done).length, total: r.steps.length },
  };
}

const RUN_SELECT = `SELECT r.*, u.display_name AS started_by_name FROM runbook_runs r LEFT JOIN users u ON u.id=r.started_by`;

async function loadRun(user, id, min = LEVEL.read) {
  const run = await one(`${RUN_SELECT} WHERE r.id=$1`, [id]);
  if (!run) throw notFound('Durchlauf nicht gefunden');
  const page = await loadPage(user, run.page_id, min);
  return { run, page };
}

router.get('/pages/:id/runs', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id));
  const rows = await many(`${RUN_SELECT} WHERE r.page_id=$1 ORDER BY r.started_at DESC LIMIT 100`, [page.id]);
  res.json({ runs: rows.map(mapRun) });
});

router.post('/pages/:id/runs', async (req, res) => {
  const page = await loadPage(req.user, intParam(req.params.id), LEVEL.write);
  const { reason } = pick(req.body, { reason: { type: 'string', max: 300 } });
  const steps = extractSteps(page.content);
  if (!steps.length) throw badRequest('Die Seite enthält keine Schritte (Checkliste, nummerierte Liste oder Abschnitte)');
  const log = [{ at: new Date().toISOString(), by: req.user.display_name, type: 'start' }];
  const row = await one(
    `INSERT INTO runbook_runs (page_id, page_version, title, reason, steps, log, started_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [page.id, page.version, page.title, reason || '', JSON.stringify(steps), JSON.stringify(log), req.user.id],
  );
  await audit(req, 'run.start', 'page', page.id, { run: row.id, title: page.title });
  const run = await one(`${RUN_SELECT} WHERE r.id=$1`, [row.id]);
  res.status(201).json({ run: mapRun(run) });
});

router.get('/runs/:id', async (req, res) => {
  const { run, page } = await loadRun(req.user, intParam(req.params.id));
  res.json({
    run: mapRun(run),
    page: { id: page.id, title: page.title, content: page.content, version: page.version, access: page.access >= LEVEL.write ? 'write' : 'read' },
  });
});

router.patch('/runs/:id', async (req, res) => {
  const { run, page } = await loadRun(req.user, intParam(req.params.id), LEVEL.write);
  const b = pick(req.body, {
    step: { type: 'int' },
    done: { type: 'bool' },
    note: { type: 'string', max: 2000, trim: false },
    comment: { type: 'string', max: 2000 },
    status: { type: 'string', enum: ['done', 'aborted'] },
    summary: { type: 'string', max: 5000, trim: false },
  }, { partial: true });
  const now = new Date().toISOString();
  const by = req.user.display_name;
  const isRunning = run.status === 'running';
  if (!isRunning && (b.step !== undefined || b.comment || b.status)) throw conflict('Der Durchlauf ist bereits beendet');

  if (b.step !== undefined) {
    if (b.step < 0 || b.step >= run.steps.length) throw badRequest('Ungültiger Schritt');
    const patch = {};
    const log = [];
    if (b.done !== undefined) {
      Object.assign(patch, b.done ? { done: true, doneAt: now, doneBy: by } : { done: false, doneAt: null, doneBy: null });
      log.push({ at: now, by, type: b.done ? 'check' : 'uncheck', step: b.step });
    }
    if (b.note !== undefined) {
      patch.note = b.note;
      if (b.note.trim()) log.push({ at: now, by, type: 'step-note', step: b.step, text: b.note.trim().slice(0, 300) });
    }
    await query(
      `UPDATE runbook_runs SET steps = jsonb_set(steps, ARRAY[$2::text], (steps->$2::int) || $3::jsonb),
              log = log || $4::jsonb, updated_at=now() WHERE id=$1`,
      [run.id, b.step, JSON.stringify(patch), JSON.stringify(log)],
    );
  }
  if (b.comment) {
    await query(`UPDATE runbook_runs SET log = log || $2::jsonb, updated_at=now() WHERE id=$1`,
      [run.id, JSON.stringify([{ at: now, by, type: 'comment', text: b.comment }])]);
  }
  if (b.summary !== undefined) {
    await query('UPDATE runbook_runs SET summary=$2, updated_at=now() WHERE id=$1', [run.id, b.summary]);
  }
  if (b.status) {
    // only a running run can be finished – a concurrent "done"/"aborted" must not overwrite the outcome
    const { rowCount } = await query(
      `UPDATE runbook_runs SET status=$2, finished_at=now(), log = log || $3::jsonb, updated_at=now() WHERE id=$1 AND status='running'`,
      [run.id, b.status, JSON.stringify([{ at: now, by, type: b.status }])],
    );
    if (!rowCount) throw conflict('Der Durchlauf ist bereits beendet');
    await audit(req, `run.${b.status === 'done' ? 'finish' : 'abort'}`, 'page', page.id, { run: run.id });
    notifyPageEvent('run.finish', page, req.user, { status: b.status, runId: run.id });
  }
  const fresh = await one(`${RUN_SELECT} WHERE r.id=$1`, [run.id]);
  res.json({ run: mapRun(fresh) });
});

router.delete('/runs/:id', async (req, res) => {
  const { run, page } = await loadRun(req.user, intParam(req.params.id), LEVEL.admin);
  await query('DELETE FROM runbook_runs WHERE id=$1', [run.id]);
  await audit(req, 'run.delete', 'page', page.id, { run: run.id });
  res.json({ ok: true });
});

/** Recent and running runs across all readable pages (dashboard) */
router.get('/runs', async (req, res) => {
  const rows = await many(
    `${RUN_SELECT} JOIN pages p ON p.id=r.page_id
      WHERE page_access(p.id,$1) >= 1 AND ($2 = '' OR r.status = $2)
      ORDER BY r.status='running' DESC, r.started_at DESC LIMIT 30`,
    [req.user.id, String(req.query.status || '')],
  );
  res.json({ runs: rows.map(mapRun) });
});

export default router;
