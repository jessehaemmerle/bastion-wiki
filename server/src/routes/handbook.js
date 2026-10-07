import { Router } from 'express';
import { many } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { badRequest } from '../lib/http.js';
import { loadSpace } from '../lib/permissions.js';
import { getSettings } from '../lib/settings.js';
import { expandSnippets } from '../lib/snippets.js';
import { audit } from '../lib/audit.js';

/**
 * Emergency handbook: whole spaces (optionally one subtree) in reading order,
 * ready for a print layout that the browser saves as PDF.
 */
const router = Router();

router.get('/handbook', requireAuth, async (req, res) => {
  const keys = String(req.query.spaces || '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 30);
  if (!keys.length) throw badRequest('Bitte mindestens einen Bereich wählen');
  const rootId = Number(req.query.root) || null;
  const out = [];
  let total = 0;
  for (const key of keys) {
    const space = await loadSpace(req.user, key);
    const pages = await many(
      `SELECT p.id, p.parent_id, p.title, p.icon, p.page_type, p.properties, p.content, p.version, p.updated_at, p.review_due,
              p.sort_order, u.display_name AS updated_by,
              (SELECT coalesce(array_agg(t.name ORDER BY t.name), '{}') FROM page_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.page_id=p.id) AS tags
         FROM pages p LEFT JOIN users u ON u.id=p.updated_by
        WHERE p.space_id=$1 AND page_access(p.id, $2) >= 1 ORDER BY p.sort_order, p.title`,
      [space.id, req.user.id],
    );
    const byParent = new Map();
    const ids = new Set(pages.map((p) => p.id));
    for (const p of pages) {
      const parent = p.parent_id && ids.has(p.parent_id) ? p.parent_id : 0;
      (byParent.get(parent) || byParent.set(parent, []).get(parent)).push(p);
    }
    const ordered = [];
    const walk = (parent, depth, number) => (byParent.get(parent) || []).forEach((p, i) => {
      const n = [...number, i + 1];
      ordered.push({ ...p, depth, number: n.join('.') });
      walk(p.id, depth + 1, n);
    });
    if (rootId && ids.has(rootId)) {
      const root = pages.find((p) => p.id === rootId);
      ordered.push({ ...root, depth: 0, number: '1' });
      walk(root.id, 1, [1]);
    } else {
      walk(0, 0, []);
    }
    for (const p of ordered) p.content = await expandSnippets(p.content);
    total += ordered.length;
    out.push({
      key: space.key, name: space.name, description: space.description, color: space.color,
      pages: ordered.map((p) => ({
        id: p.id, title: p.title, icon: p.icon, pageType: p.page_type, properties: p.properties, content: p.content,
        version: p.version, updatedAt: p.updated_at, updatedBy: p.updated_by, reviewDue: p.review_due, tags: p.tags,
        depth: p.depth, number: p.number,
      })),
    });
  }
  const settings = await getSettings();
  await audit(req, 'handbook.export', 'system', null, { spaces: keys, pages: total });
  res.json({ siteName: settings.siteName, generatedAt: new Date().toISOString(), generatedBy: req.user.display_name, spaces: out });
});

export default router;
