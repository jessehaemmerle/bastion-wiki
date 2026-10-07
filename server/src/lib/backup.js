import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as tar from 'tar';
import { config } from '../config.js';
import { many, one, pool, query } from '../db/index.js';
import { exportTree } from './markdown.js';
import { tryDecrypt } from './crypto.js';
import { clearIntegrationCache } from './integrations.js';
import { ensureLinkIndex } from './links.js';

/**
 * Full backups as .tar.gz: every table as JSON (incl. users, versions, audit log),
 * all uploaded files and a readable Markdown copy. Restores replace the whole database.
 * The encryption key (SECRET_KEY / secret.key) is NOT part of the backup – keep it separately.
 */
export const backupDir = path.join(config.dataDir, 'backups');
const uploadDir = path.join(config.dataDir, 'uploads');

// parents before children (foreign keys)
const TABLES = [
  'users', 'groups', 'group_members', 'spaces', 'space_permissions', 'sheet_schemas', 'pages', 'page_revisions', 'favorites',
  'tags', 'page_tags', 'attachments', 'templates', 'settings', 'audit_log', 'api_tokens', 'import_jobs',
  'page_secrets', 'runbook_runs', 'page_links', 'link_checks', 'watches', 'notifications', 'webhooks',
  'share_links', 'page_views', 'snippets', 'page_permissions', 'page_trash', 'comments',
  'change_requests', 'expiry_notified',
];

const NAME = /^(auto|manual|upload)-[0-9TZ-]+\.tar\.gz$/;
// milliseconds included: a safety backup right before a restore must not overwrite the one being restored
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function columnsOf(table) {
  return many(
    `SELECT column_name, data_type, is_generated FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );
}

export async function createBackup(kind = 'manual') {
  await fs.mkdir(backupDir, { recursive: true });
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'bastion-backup-'));
  try {
    await fs.mkdir(path.join(work, 'db'));
    const counts = {};
    for (const t of TABLES) {
      const rows = await many(`SELECT * FROM ${t} ORDER BY 1`); // parents first (e.g. comment threads)
      // generated columns cannot be inserted back
      const generated = (await columnsOf(t)).filter((c) => c.is_generated === 'ALWAYS').map((c) => c.column_name);
      for (const r of rows) for (const g of generated) delete r[g];
      counts[t] = rows.length;
      await fs.writeFile(path.join(work, 'db', `${t}.json`), JSON.stringify(rows));
    }
    const migration = await one('SELECT max(name) AS name FROM schema_migrations');
    await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify({
      format: 'bastion-backup', version: 1, createdAt: new Date().toISOString(), schema: migration?.name, counts,
    }, null, 2));
    await fs.writeFile(path.join(work, 'README.txt'), [
      'Bastion backup',
      '',
      'db/        all tables as JSON – restore in Administration → Backup',
      'uploads/   attached files',
      'markdown/  readable copy of all pages',
      '',
      'Secret blocks, TOTP seeds and stored passwords are encrypted with SECRET_KEY / secret.key.',
      'Without that key they cannot be decrypted after a restore.',
    ].join('\n'));
    await exportTree(path.join(work, 'markdown'));
    if (existsSync(uploadDir)) await fs.symlink(uploadDir, path.join(work, 'uploads'));
    let name = `${kind}-${stamp()}.tar.gz`;
    for (let i = 2; existsSync(path.join(backupDir, name)); i++) name = `${kind}-${stamp()}-${i}.tar.gz`;
    await tar.c({ gzip: true, file: path.join(backupDir, name), cwd: work, follow: true, portable: true }, ['.']);
    const stat = await fs.stat(path.join(backupDir, name));
    return { name, size: stat.size, counts };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

export async function listBackups() {
  if (!existsSync(backupDir)) return [];
  const files = (await fs.readdir(backupDir)).filter((f) => NAME.test(f));
  const out = [];
  for (const f of files) {
    const st = await fs.stat(path.join(backupDir, f));
    out.push({ name: f, size: st.size, createdAt: st.mtime, kind: f.split('-')[0] });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function backupPath(name) {
  if (!NAME.test(String(name))) return null;
  const p = path.join(backupDir, name);
  return existsSync(p) ? p : null;
}

export const backupStream = (name) => createReadStream(backupPath(name));

export async function pruneBackups(keep) {
  const autos = (await listBackups()).filter((b) => b.kind === 'auto');
  for (const b of autos.slice(Math.max(1, keep))) await fs.rm(path.join(backupDir, b.name), { force: true });
}

/** Restores a backup archive. Replaces ALL data. Returns warnings. */
export async function restoreBackup(file) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'bastion-restore-'));
  const warnings = [];
  try {
    await tar.x({ file, cwd: work, strict: true, filter: (p, entry) => !p.includes('..') && ['File', 'Directory'].includes(entry.type) });
    const manifest = JSON.parse(await fs.readFile(path.join(work, 'manifest.json'), 'utf8').catch(() => 'null'));
    if (manifest?.format !== 'bastion-backup') throw new Error('Keine gültige Bastion-Sicherung');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`TRUNCATE ${[...TABLES, 'sessions'].join(', ')} RESTART IDENTITY CASCADE`);
      for (const t of TABLES) {
        const f = path.join(work, 'db', `${t}.json`);
        if (!existsSync(f)) continue;
        const rows = JSON.parse(await fs.readFile(f, 'utf8'));
        if (!rows.length) continue;
        const cols = (await columnsOf(t)).filter((c) => c.is_generated !== 'ALWAYS');
        const known = new Map(cols.map((c) => [c.column_name, c.data_type]));
        for (const row of rows) {
          // pages reference each other: parents are set in a second pass
          const r = t === 'pages' ? { ...row, parent_id: null } : row;
          const keys = Object.keys(r).filter((k) => known.has(k));
          const vals = keys.map((k) => (known.get(k) === 'jsonb' && r[k] !== null ? JSON.stringify(r[k]) : r[k]));
          await client.query(
            `INSERT INTO ${t} (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map((_k, i) => `$${i + 1}`).join(',')})`,
            vals,
          );
        }
        if (t === 'pages') {
          for (const row of rows.filter((x) => x.parent_id)) {
            await client.query('UPDATE pages SET parent_id=$2 WHERE id=$1', [row.id, row.parent_id]);
          }
        }
        if (['integer', 'bigint'].includes(known.get('id'))) {
          await client.query(
            `SELECT setval(pg_get_serial_sequence($1,'id'), coalesce((SELECT max(id) FROM ${t}), 1), (SELECT max(id) FROM ${t}) IS NOT NULL)
              WHERE pg_get_serial_sequence($1,'id') IS NOT NULL`,
            [t],
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // files: add what the backup has (orphans can be cleaned up in maintenance)
    const src = path.join(work, 'uploads');
    if (existsSync(src)) {
      await fs.mkdir(uploadDir, { recursive: true });
      for (const f of await fs.readdir(src)) {
        if (/^[a-f0-9]{32}$/.test(f)) await fs.copyFile(path.join(src, f), path.join(uploadDir, f));
      }
    }
    clearIntegrationCache();
    await ensureLinkIndex();
    const sample = await one('SELECT ciphertext FROM page_secrets LIMIT 1');
    if (sample && !tryDecrypt(sample.ciphertext)) {
      warnings.push('Geheimnisse konnten mit dem aktuellen Schlüssel nicht entschlüsselt werden – SECRET_KEY bzw. secret.key der Quellinstallation verwenden');
    }
    await query("INSERT INTO audit_log (action, entity_type, details) VALUES ('admin.restore', 'system', $1)", [{ createdAt: manifest.createdAt, schema: manifest.schema }]);
    return { manifest, warnings };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
