import { many, one, query } from '../db/index.js';
import { decrypt } from './crypto.js';
import { getSection, publicBase } from './integrations.js';
import { mailEnabled, renderMail, sendMail } from './mail.js';
import { getSettings } from './settings.js';

/**
 * Notifications: in-app inbox, e-mail digests and webhooks (Slack, Teams, Matrix, Discord, generic JSON).
 * Events: page.create, page.update, page.delete, review.due, run.finish
 */
export const EVENTS = ['page.create', 'page.update', 'page.delete', 'review.due', 'run.finish'];

const TEXT = {
  de: {
    'page.create': '{actor} hat „{title}“ angelegt',
    'page.update': '{actor} hat „{title}“ geändert',
    'page.delete': '{actor} hat „{title}“ gelöscht',
    'review.due': 'Review fällig: „{title}“',
    'run.finish': '{actor} hat „{title}“ ausgeführt ({status})',
    done: 'abgeschlossen',
    aborted: 'abgebrochen',
    someone: 'Jemand',
    subject: '{site}: {n} Neuigkeiten',
    subjectOne: '{site}: {text}',
    heading: 'Neuigkeiten aus dem Wiki',
    intro: 'Änderungen an Seiten und Bereichen, die du beobachtest.',
    footer: 'Benachrichtigungen lassen sich in den Einstellungen unter „Benachrichtigungen“ abbestellen.',
    test: 'Test-Nachricht von {site}',
  },
  en: {
    'page.create': '{actor} created “{title}”',
    'page.update': '{actor} updated “{title}”',
    'page.delete': '{actor} deleted “{title}”',
    'review.due': 'Review due: “{title}”',
    'run.finish': '{actor} ran “{title}” ({status})',
    done: 'completed',
    aborted: 'aborted',
    someone: 'Someone',
    subject: '{site}: {n} updates',
    subjectOne: '{site}: {text}',
    heading: 'News from the wiki',
    intro: 'Changes to pages and spaces you are watching.',
    footer: 'You can unsubscribe in your settings under “Notifications”.',
    test: 'Test message from {site}',
  },
};
const t = (lang, key, vars = {}) => (TEXT[lang]?.[key] ?? TEXT.de[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

export function eventText(lang, kind, data) {
  const status = data.status ? t(lang, data.status) : '';
  return t(lang, kind, { actor: data.actor || t(lang, 'someone'), title: data.title || '', status });
}

// ------------------------------------------------------------------ in-app + recipients

/**
 * Records an event for watchers and fires webhooks. Never throws – notifications must not break saving.
 * page: { id, title, space_id, space_key?, space_name? } (for deletions a snapshot)
 */
export async function notifyPageEvent(kind, page, actor, extra = {}) {
  try {
    const space = page.space_key ? { key: page.space_key, name: page.space_name } : await one('SELECT key, name FROM spaces WHERE id=$1', [page.space_id]);
    const data = { title: page.title, actor: actor?.display_name || null, spaceKey: space?.key, spaceName: space?.name, ...extra };
    const alive = kind !== 'page.delete';
    // watchers of the page or its space who can still read it; for reviews also the authors
    const recipients = await many(
      `SELECT DISTINCT u.id FROM users u
        WHERE u.is_active AND u.id IS DISTINCT FROM $3
          AND space_access($2, u.id) >= 1
          AND (EXISTS (SELECT 1 FROM watches w WHERE w.user_id=u.id AND (w.page_id=$1 OR w.space_id=$2))
               OR ($4 AND u.id IN (SELECT created_by FROM pages WHERE id=$1 UNION SELECT updated_by FROM pages WHERE id=$1)))`,
      [page.id, page.space_id, actor?.id ?? null, kind === 'review.due'],
    );
    for (const r of recipients) {
      // a burst of edits becomes one entry
      if (kind === 'page.update') {
        const bumped = await query(
          `UPDATE notifications SET created_at=now(), actor_id=$3, data=data || jsonb_build_object('count', coalesce((data->>'count')::int,1)+1, 'actor', $4::text), emailed_at=NULL
            WHERE id = (SELECT id FROM notifications WHERE user_id=$1 AND page_id=$2 AND kind='page.update' AND read_at IS NULL
                          AND created_at > now() - interval '1 hour' ORDER BY created_at DESC LIMIT 1)`,
          [r.id, page.id, actor?.id ?? null, data.actor],
        );
        if (bumped.rowCount) continue;
      }
      await query(
        `INSERT INTO notifications (user_id, kind, page_id, actor_id, data) VALUES ($1,$2,$3,$4,$5)`,
        [r.id, kind, alive ? page.id : null, actor?.id ?? null, data],
      );
    }
    await deliverWebhooks(kind, { ...data, pageId: alive ? page.id : null, spaceId: page.space_id });
  } catch (err) {
    console.error('[notify]', err.message);
  }
}

// ------------------------------------------------------------------ webhooks

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function webhookBody(kind, hookKind, { text, url, title, spaceName, event }) {
  switch (hookKind) {
    case 'slack':
      return { text: url ? `${text} – <${url}|${title}>` : text };
    case 'discord':
      return { content: url ? `${text}\n${url}` : text };
    case 'matrix':
      return { text: url ? `${text} – ${url}` : text, html: url ? `${esc(text)} – <a href="${esc(url)}">${esc(title)}</a>` : esc(text), msgtype: 'm.notice' };
    case 'teams':
      return {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              { type: 'TextBlock', text, wrap: true, weight: 'Bolder' },
              ...(spaceName ? [{ type: 'TextBlock', text: spaceName, isSubtle: true, spacing: 'None' }] : []),
            ],
            actions: url ? [{ type: 'Action.OpenUrl', title: title || 'Open', url }] : [],
          },
        }],
      };
    default:
      return { event: kind, text, ...event };
  }
}

async function postHook(hook, body) {
  let status;
  try {
    const res = await fetch(decrypt(hook.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Bastion-Wiki' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    status = res.ok ? `${res.status}` : `HTTP ${res.status}`;
  } catch (err) {
    status = err.cause?.code || err.message;
  }
  await query('UPDATE webhooks SET last_status=$2, last_at=now() WHERE id=$1', [hook.id, status]);
  return status;
}

export async function deliverWebhooks(kind, data) {
  const hooks = await many(
    `SELECT * FROM webhooks WHERE is_active AND $1 = ANY(events) AND (cardinality(space_ids)=0 OR $2 = ANY(space_ids))`,
    [kind, data.spaceId ?? 0],
  );
  if (!hooks.length) return;
  const settings = await getSettings();
  const base = await publicBase();
  const lang = settings.defaultLanguage || 'de';
  const url = data.pageId && base ? `${base}/p/${data.pageId}` : null;
  const text = eventText(lang, kind, data);
  const event = { page: data.pageId ? { id: data.pageId, title: data.title, url } : { title: data.title }, space: { key: data.spaceKey, name: data.spaceName }, actor: data.actor, at: new Date().toISOString(), ...(data.status ? { status: data.status } : {}) };
  await Promise.all(hooks.map((h) => postHook(h, webhookBody(kind, h.kind, { text, url, title: data.title, spaceName: data.spaceName, event }))));
}

export async function testWebhook(hook) {
  const settings = await getSettings();
  const base = await publicBase();
  const text = t(settings.defaultLanguage, 'test', { site: settings.siteName });
  return postHook(hook, webhookBody('test', hook.kind, { text, url: base || null, title: settings.siteName, spaceName: '', event: {} }));
}

// ------------------------------------------------------------------ periodic jobs

/** Sends pending notifications as one digest mail per user */
export async function sendDigests() {
  const smtp = await getSection('smtp');
  if (!(await mailEnabled())) {
    await query(`UPDATE notifications SET emailed_at=now() WHERE emailed_at IS NULL AND created_at < now() - interval '1 hour'`);
    return 0;
  }
  const wait = Math.max(0, Number(smtp.digestMinutes) || 0);
  // already read in the app → no mail needed
  await query('UPDATE notifications SET emailed_at=now() WHERE emailed_at IS NULL AND read_at IS NOT NULL');
  const rows = await many(
    `SELECT n.*, u.email, u.preferences, u.display_name FROM notifications n JOIN users u ON u.id=n.user_id
      WHERE n.emailed_at IS NULL AND n.created_at < now() - make_interval(mins => $1)
      ORDER BY n.user_id, n.created_at`,
    [wait],
  );
  if (!rows.length) return 0;
  const settings = await getSettings();
  const base = await publicBase();
  const byUser = new Map();
  for (const r of rows) (byUser.get(r.user_id) || byUser.set(r.user_id, []).get(r.user_id)).push(r);
  let sent = 0;
  for (const [userId, list] of byUser) {
    const u = list[0];
    const ids = list.map((n) => n.id);
    const wants = u.email && u.preferences?.emailNotifications !== false;
    if (wants) {
      const lang = u.preferences?.language || settings.defaultLanguage || 'de';
      const items = list.map((n) => ({
        title: eventText(lang, n.kind, n.data),
        meta: [n.data.spaceName, new Date(n.created_at).toLocaleString(lang === 'en' ? 'en-GB' : 'de-DE')].filter(Boolean).join(' · '),
        url: n.page_id && base ? `${base}/p/${n.page_id}` : base || '',
      }));
      const mail = renderMail({ siteName: settings.siteName, heading: t(lang, 'heading'), intro: t(lang, 'intro'), items, footer: t(lang, 'footer') });
      const subject = items.length === 1
        ? t(lang, 'subjectOne', { site: settings.siteName, text: items[0].title })
        : t(lang, 'subject', { site: settings.siteName, n: items.length });
      try {
        await sendMail({ to: u.email, subject, ...mail });
        sent++;
      } catch (err) {
        console.error(`[mail] an Benutzer ${userId} fehlgeschlagen:`, err.message);
        continue; // retry next round
      }
    }
    await query('UPDATE notifications SET emailed_at=now() WHERE id = ANY($1)', [ids]);
  }
  return sent;
}

/** Due reviews → one notification per due date */
export async function checkReviews() {
  const pages = await many(
    `SELECT p.id, p.title, p.space_id, s.key AS space_key, s.name AS space_name FROM pages p JOIN spaces s ON s.id=p.space_id
      WHERE p.review_due <= current_date AND (p.review_notified IS NULL OR p.review_notified < p.review_due)
      LIMIT 500`,
  );
  for (const p of pages) {
    await notifyPageEvent('review.due', p, null);
    await query('UPDATE pages SET review_notified=current_date WHERE id=$1', [p.id]);
  }
  return pages.length;
}
