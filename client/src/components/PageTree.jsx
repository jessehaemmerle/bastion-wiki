import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon, { PageIcon } from './Icon.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { PAGE_TYPES } from '../lib/format.js';

const loadExpanded = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(`bastion.tree.${key}`) || '[]')); } catch { return new Set(); }
};

export function buildTree(pages) {
  const byId = new Map(pages.map((p) => [p.id, { ...p, children: [] }]));
  const roots = [];
  for (const p of byId.values()) {
    const parent = p.parentId && byId.get(p.parentId);
    (parent ? parent.children : roots).push(p);
  }
  const sort = (list) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return { roots, byId };
}

export default function PageTree({ spaceKey, pages, canWrite, activeId }) {
  const navigate = useNavigate();
  const { toast, refreshTree } = useApp();
  const [expanded, setExpanded] = useState(() => loadExpanded(spaceKey));
  const [drag, setDrag] = useState(null); // { id }
  const [drop, setDrop] = useState(null); // { id, pos: before|after|inside }
  const { roots, byId } = useMemo(() => buildTree(pages), [pages]);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => setExpanded(loadExpanded(spaceKey)), [spaceKey]);

  // reveal the active page
  useEffect(() => {
    if (!activeId || !byId.has(activeId)) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let cur = byId.get(activeId);
      let changed = false;
      while (cur?.parentId) {
        if (!next.has(cur.parentId)) { next.add(cur.parentId); changed = true; }
        cur = byId.get(cur.parentId);
      }
      return changed ? next : prev;
    });
  }, [activeId, byId]);

  useEffect(() => {
    try { localStorage.setItem(`bastion.tree.${spaceKey}`, JSON.stringify([...expanded])); } catch { /* ignore */ }
  }, [expanded, spaceKey]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const isDescendant = (nodeId, ancestorId) => {
    let cur = byId.get(nodeId);
    while (cur) {
      if (cur.id === ancestorId) return true;
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }
    return false;
  };

  const onDrop = async () => {
    if (!drag || !drop || drag.id === drop.id || isDescendant(drop.id, drag.id)) return reset();
    const target = byId.get(drop.id);
    let parentId;
    let position;
    if (drop.pos === 'inside') {
      parentId = target.id;
      position = target.children.filter((c) => c.id !== drag.id).length;
      setExpanded((p) => new Set(p).add(target.id));
    } else {
      parentId = target.parentId || null;
      const siblings = (parentId ? byId.get(parentId).children : roots).filter((c) => c.id !== drag.id);
      const idx = siblings.findIndex((s) => s.id === target.id);
      position = drop.pos === 'before' ? idx : idx + 1;
    }
    reset();
    try {
      await api.post(`/pages/${drag.id}/move`, { parentId, position });
      refreshTree();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const reset = () => { setDrag(null); setDrop(null); };

  const renderNode = (node) => {
    const open = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const overdue = node.reviewDue && node.reviewDue < today;
    const dropCls = drop?.id === node.id ? `drop-${drop.pos}` : '';
    return (
      <li key={node.id}>
        <div
          className={`tree-row ${activeId === node.id ? 'active' : ''} ${dropCls}`}
          draggable={canWrite}
          onDragStart={(e) => { setDrag({ id: node.id }); e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={reset}
          onDragOver={(e) => {
            if (!drag || drag.id === node.id) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            const pos = y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside';
            if (drop?.id !== node.id || drop.pos !== pos) setDrop({ id: node.id, pos });
          }}
          onDrop={(e) => { e.preventDefault(); onDrop(); }}
        >
          <button className={`tree-toggle ${open ? 'open' : ''}`} onClick={() => toggle(node.id)} style={{ visibility: hasChildren ? 'visible' : 'hidden' }} aria-label="Aufklappen">
            <Icon name="chevron-right" size={14} />
          </button>
          <Link to={`/p/${node.id}`} className="tree-link" title={node.title}>
            <PageIcon icon={node.icon} fallback={PAGE_TYPES[node.pageType]?.icon} size={15} />
            <span>{node.title}</span>
          </Link>
          {overdue && <span className="tree-dot" title="Review überfällig" />}
          {canWrite && (
            <button className="tree-add" title="Unterseite anlegen" onClick={() => navigate(`/new?space=${spaceKey}&parent=${node.id}`)}>
              <Icon name="plus" size={14} />
            </button>
          )}
        </div>
        {hasChildren && open && <ul className="tree">{node.children.map(renderNode)}</ul>}
      </li>
    );
  };

  if (!roots.length) return <div className="faint small" style={{ padding: '6px 12px' }}>Noch keine Seiten.</div>;
  return <ul className="tree">{roots.map(renderNode)}</ul>;
}
