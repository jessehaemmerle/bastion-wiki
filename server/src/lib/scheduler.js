import { checkReviews, sendDigests } from './notify.js';
import { createBackup, pruneBackups } from './backup.js';
import { syncGit } from './gitsync.js';
import { getSection } from './integrations.js';
import { query } from '../db/index.js';

/** Background jobs: mail digests, review reminders, nightly backups, Git sync, cleanup */
const running = new Set();
const state = { lastBackupDay: null, lastGit: 0 };

async function once(name, fn) {
  if (running.has(name)) return;
  running.add(name);
  try {
    await fn();
  } catch (err) {
    console.error(`[jobs] ${name}:`, err.message);
  } finally {
    running.delete(name);
  }
}

async function minutely() {
  await once('mail', sendDigests);

  const backup = await getSection('backup');
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (backup.enabled && now.getHours() === Number(backup.hour) && state.lastBackupDay !== day) {
    state.lastBackupDay = day;
    await once('backup', async () => {
      const b = await createBackup('auto');
      await pruneBackups(Number(backup.keep) || 7);
      console.log(`[jobs] Sicherung erstellt: ${b.name}`);
    });
  }

  const git = await getSection('git');
  const every = Math.max(5, Number(git.intervalMinutes) || 60) * 60 * 1000;
  if (git.enabled && git.remote && Date.now() - state.lastGit >= every) {
    state.lastGit = Date.now();
    await once('git', () => syncGit());
  }
}

async function hourly() {
  await once('reviews', checkReviews);
  await once('cleanup', async () => {
    await query('DELETE FROM sessions WHERE expires_at < now()');
    await query("DELETE FROM notifications WHERE created_at < now() - interval '90 days'");
    await query("DELETE FROM share_links WHERE expires_at < now() - interval '30 days'");
  });
}

export function startScheduler() {
  setTimeout(() => { hourly(); }, 20 * 1000).unref();
  setInterval(() => { minutely(); }, 60 * 1000).unref();
  setInterval(() => { hourly(); }, 60 * 60 * 1000).unref();
}
