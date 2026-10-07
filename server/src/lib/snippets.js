import { many } from '../db/index.js';

/**
 * Snippets: reusable blocks maintained in one place. Pages only carry a reference
 * (<div data-type="snippet" data-snippet-id="7">); the content is inserted when the page is shown or exported.
 */
const REF = /<div[^>]*data-type="snippet"[^>]*><\/div>/g;
// ids beyond the int4 range cannot exist and would make the ANY($1) lookup fail
const idOf = (tag) => {
  const n = Number((tag.match(/data-snippet-id="(\d+)"/) || [])[1]);
  return n > 0 && n <= 2147483647 ? n : null;
};

export function snippetIds(html) {
  return [...new Set((String(html || '').match(REF) || []).map(idOf).filter(Boolean))];
}

/** { id: { name, content, updatedAt } } for the snippets referenced in some HTML */
export async function snippetMap(html) {
  const ids = snippetIds(html);
  if (!ids.length) return {};
  const rows = await many('SELECT id, name, content, updated_at FROM snippets WHERE id = ANY($1)', [ids]);
  return Object.fromEntries(rows.map((r) => [r.id, { name: r.name, content: r.content, updatedAt: r.updated_at }]));
}

/** Replaces references by the snippet content (for exports, share links, the handbook) */
export async function expandSnippets(html) {
  const map = await snippetMap(html);
  return String(html || '').replace(REF, (tag) => {
    const s = map[idOf(tag)];
    return s ? `<div data-type="snippet-content">${s.content}</div>` : '';
  });
}
