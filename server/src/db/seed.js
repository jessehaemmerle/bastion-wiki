import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, query, tx } from './index.js';
import { hashPassword } from '../lib/auth.js';
import { htmlToText } from '../lib/sanitize.js';
import { slugify } from '../lib/http.js';
import { demoFor, templatesFor } from './seed-content.js';

/** Built-in templates exist once per language; missing languages are added on upgrade. */
async function seedTemplates() {
  for (const lang of ['de', 'en']) {
    const { n } = await one('SELECT count(*)::int AS n FROM templates WHERE is_builtin AND language=$1', [lang]);
    if (n > 0) continue;
    let i = 0;
    for (const t of templatesFor(lang)) {
      await query(
        `INSERT INTO templates (name, description, icon, page_type, content, properties, tags, sort_order, is_builtin, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)`,
        [t.name, t.description, t.icon, t.page_type, t.content, t.properties, t.tags, i++, lang],
      );
    }
    console.log(`[seed] ${templatesFor(lang).length} Vorlagen (${lang}) angelegt`);
  }
}

async function seedAdmin() {
  const { n } = await one('SELECT count(*)::int AS n FROM users');
  if (n > 0) return null;
  const generated = !config.admin.password;
  const password = config.admin.password || crypto.randomBytes(12).toString('base64url');
  const user = await one(
    `INSERT INTO users (username, email, display_name, password_hash, role) VALUES ($1,$2,$3,$4,'admin') RETURNING *`,
    [config.admin.username, config.admin.email, 'Administrator', await hashPassword(password)],
  );
  const line = '='.repeat(64);
  console.log(`\n${line}\n  Bastion: Administrator angelegt\n  Benutzer: ${config.admin.username}\n  Passwort: ${generated ? password : '(aus ADMIN_PASSWORD)'}\n${line}\n`);
  return user;
}

async function seedDemo(admin) {
  const { n } = await one('SELECT count(*)::int AS n FROM spaces');
  if (n > 0 || !config.seedDemo) return;
  const demo = demoFor(config.language);

  await tx(async (c) => {
    const spaceIds = {};
    let order = 0;
    for (const sp of demo.spaces) {
      const { rows } = await c.query(
        `INSERT INTO spaces (key, name, description, icon, color, sort_order, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [sp.key, sp.name, sp.description, sp.icon, sp.color, order++, admin?.id ?? null],
      );
      spaceIds[sp.key] = rows[0].id;
    }
    const tagIds = {};
    const pageIds = {};
    for (const p of demo.pages) {
      const props = p.props || {};
      const { rows } = await c.query(
        `INSERT INTO pages (space_id, parent_id, title, slug, content, content_text, page_type, properties, review_due, is_pinned, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id`,
        [spaceIds[p.space], p.parent ? pageIds[p.parent] : null, p.title, slugify(p.title), p.html, htmlToText(p.html), p.type, props,
          p.reviewDue ?? null, Boolean(p.pinned), admin?.id ?? null],
      );
      const id = rows[0].id;
      if (p.key) pageIds[p.key] = id;
      await c.query(
        `INSERT INTO page_revisions (page_id, version, title, content, properties, summary, author_id) VALUES ($1,1,$2,$3,$4,$5,$6)`,
        [id, p.title, p.html, props, demo.summary, admin?.id ?? null],
      );
      for (const t of p.tags || []) {
        if (!tagIds[t]) {
          const r = await c.query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [t]);
          tagIds[t] = r.rows[0].id;
        }
        await c.query('INSERT INTO page_tags VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, tagIds[t]]);
      }
    }
  });
  console.log(`[seed] Beispielinhalte (${config.language}) angelegt`);
}

export async function bootstrap() {
  const admin = await seedAdmin();
  await seedTemplates();
  await seedDemo(admin || (await one(`SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1`)));
}
