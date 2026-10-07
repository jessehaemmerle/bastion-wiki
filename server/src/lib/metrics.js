import { one, pool } from '../db/index.js';
import { gitState } from './gitsync.js';
import { listBackups } from './backup.js';
import { presenceCount } from './presence.js';

/** Prometheus metrics (text exposition format 0.0.4) */
const requests = new Map();  // "method|status" → count
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const histogram = { counts: BUCKETS.map(() => 0), sum: 0, count: 0 };
const started = Date.now();

export function metricsMiddleware(req, res, next) {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const sec = Number(process.hrtime.bigint() - t0) / 1e9;
    const key = `${req.method}|${Math.floor(res.statusCode / 100)}xx`;
    requests.set(key, (requests.get(key) || 0) + 1);
    histogram.sum += sec;
    histogram.count += 1;
    BUCKETS.forEach((b, i) => { if (sec <= b) histogram.counts[i] += 1; });
  });
  next();
}

export async function renderMetrics() {
  const c = await one(`SELECT
      (SELECT count(*) FROM pages)::int AS pages,
      (SELECT count(*) FROM spaces)::int AS spaces,
      (SELECT count(*) FROM users WHERE is_active)::int AS users,
      (SELECT count(*) FROM users WHERE is_active AND totp_enabled)::int AS users_2fa,
      (SELECT count(*) FROM page_revisions)::int AS revisions,
      (SELECT count(*) FROM attachments)::int AS attachments,
      (SELECT coalesce(sum(size_bytes),0) FROM attachments)::bigint AS attachment_bytes,
      (SELECT count(*) FROM pages WHERE review_due < current_date)::int AS overdue,
      (SELECT count(*) FROM sessions WHERE expires_at > now())::int AS sessions,
      (SELECT count(*) FROM runbook_runs WHERE status='running')::int AS runs_running,
      (SELECT count(*) FROM page_links l WHERE l.kind='page' AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.id=l.target_id))::int AS broken_links,
      (SELECT count(*) FROM share_links WHERE expires_at > now())::int AS shares,
      (SELECT count(*) FROM notifications WHERE emailed_at IS NULL)::int AS mail_queue,
      (SELECT count(*) FROM page_revisions WHERE created_at > now() - interval '24 hours')::int AS edits_24h,
      pg_database_size(current_database())::bigint AS db_bytes`);
  const backups = await listBackups();
  const lines = [];
  const gauge = (name, help, value, labels = '') => {
    if (!lines.some((l) => l.startsWith(`# HELP ${name} `))) lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    lines.push(`${name}${labels} ${value}`);
  };
  gauge('bastion_pages', 'Number of pages', c.pages);
  gauge('bastion_spaces', 'Number of spaces', c.spaces);
  gauge('bastion_users_active', 'Active user accounts', c.users);
  gauge('bastion_users_2fa', 'Active accounts with two-factor authentication', c.users_2fa);
  gauge('bastion_revisions', 'Stored page versions', c.revisions);
  gauge('bastion_attachments', 'Number of attachments', c.attachments);
  gauge('bastion_attachment_bytes', 'Total size of attachments in bytes', c.attachment_bytes);
  gauge('bastion_reviews_overdue', 'Pages with an overdue review', c.overdue);
  gauge('bastion_sessions_active', 'Active browser sessions', c.sessions);
  gauge('bastion_runbook_runs_running', 'Runbook runs in progress', c.runs_running);
  gauge('bastion_links_broken', 'Internal links to pages that do not exist', c.broken_links);
  gauge('bastion_share_links_active', 'Share links that have not expired', c.shares);
  gauge('bastion_mail_queue', 'Notifications not yet e-mailed', c.mail_queue);
  gauge('bastion_edits_24h', 'Page edits in the last 24 hours', c.edits_24h);
  gauge('bastion_database_bytes', 'Size of the PostgreSQL database in bytes', c.db_bytes);
  gauge('bastion_editors_active', 'Pages currently open in the editor', presenceCount());
  gauge('bastion_db_pool_total', 'Database connections in the pool', pool.totalCount);
  gauge('bastion_db_pool_waiting', 'Queries waiting for a database connection', pool.waitingCount);
  gauge('bastion_backup_last_timestamp_seconds', 'Time of the newest backup', backups[0] ? Math.floor(new Date(backups[0].createdAt).getTime() / 1000) : 0);
  gauge('bastion_git_sync_last_success_timestamp_seconds', 'Time of the last successful Git sync', gitState.lastOk ? Math.floor(new Date(gitState.lastOk).getTime() / 1000) : 0);
  gauge('bastion_git_sync_error', '1 if the last Git sync failed', gitState.lastError ? 1 : 0);
  gauge('process_resident_memory_bytes', 'Resident memory size in bytes', process.memoryUsage().rss);
  gauge('process_uptime_seconds', 'Seconds since the process started', Math.round((Date.now() - started) / 1000));

  lines.push('# HELP bastion_http_requests_total HTTP requests by method and status class', '# TYPE bastion_http_requests_total counter');
  for (const [k, v] of requests) {
    const [method, status] = k.split('|');
    lines.push(`bastion_http_requests_total{method="${method}",status="${status}"} ${v}`);
  }
  lines.push('# HELP bastion_http_request_duration_seconds Request duration', '# TYPE bastion_http_request_duration_seconds histogram');
  BUCKETS.forEach((b, i) => lines.push(`bastion_http_request_duration_seconds_bucket{le="${b}"} ${histogram.counts[i]}`));
  lines.push(`bastion_http_request_duration_seconds_bucket{le="+Inf"} ${histogram.count}`);
  lines.push(`bastion_http_request_duration_seconds_sum ${histogram.sum.toFixed(6)}`);
  lines.push(`bastion_http_request_duration_seconds_count ${histogram.count}`);
  return `${lines.join('\n')}\n`;
}
