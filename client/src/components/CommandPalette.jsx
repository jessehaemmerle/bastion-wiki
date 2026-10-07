import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Icon, { PageIcon } from './Icon.jsx';
import { Snippet } from './ui.jsx';
import { api, qs } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { PAGE_TYPES } from '../lib/format.js';

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, spaces, user, updatePreferences } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (paletteOpen) {
      setQ('');
      setResults(null);
      setActive(0);
    }
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    const term = q.trim();
    if (term.length < 2 && !/^(tag|space|type):/.test(term)) { setResults(null); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        setResults(await api.get(`/search${qs({ q: term, limit: 8 })}`));
      } catch { setResults(null); }
      setLoading(false);
    }, 160);
    return () => clearTimeout(t);
  }, [q, paletteOpen]);

  const close = () => setPaletteOpen(false);
  const go = (to) => { close(); navigate(to); };

  const commands = useMemo(() => {
    const list = [
      { id: 'home', title: 'Dashboard öffnen', icon: 'dashboard', run: () => go('/') },
      { id: 'search', title: 'Erweiterte Suche', icon: 'search', run: () => go(`/search${qs({ q })}`) },
      { id: 'tags', title: 'Alle Tags anzeigen', icon: 'tags', run: () => go('/tags') },
      { id: 'review', title: 'Seiten mit fälligem Review', icon: 'calendar-clock', run: () => go('/review') },
      { id: 'mode', title: 'Hell/Dunkel umschalten', icon: 'moon', run: () => { close(); updatePreferences({ mode: document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark' }); } },
      { id: 'appearance', title: 'Theme & Darstellung', icon: 'palette', run: () => go('/settings/appearance') },
      { id: 'tokens', title: 'API-Tokens verwalten', icon: 'key-round', run: () => go('/settings/tokens') },
    ];
    if (user?.role !== 'viewer') list.unshift({ id: 'new', title: 'Neue Seite erstellen', icon: 'plus', run: () => go('/new') });
    if (user?.role === 'admin') list.push({ id: 'admin', title: 'Admin-Panel öffnen', icon: 'shield-check', run: () => go('/admin') });
    for (const s of spaces) list.push({ id: `space-${s.id}`, title: `Bereich: ${s.name}`, icon: s.icon, color: s.color, run: () => go(`/s/${s.key}`) });
    const term = q.trim().toLowerCase();
    return term ? list.filter((c) => c.title.toLowerCase().includes(term)).slice(0, 5) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, spaces, user]);

  const items = useMemo(() => {
    const out = [];
    if (results) {
      results.pages.forEach((p) => out.push({ type: 'page', key: `p${p.id}`, data: p, run: () => go(`/p/${p.id}`) }));
      results.spaces.forEach((s) => out.push({ type: 'space', key: `s${s.id}`, data: s, run: () => go(`/s/${s.key}`) }));
      results.tags.forEach((t) => out.push({ type: 'tag', key: `t${t.name}`, data: t, run: () => go(`/tags/${encodeURIComponent(t.name)}`) }));
    }
    commands.forEach((c) => out.push({ type: 'command', key: c.id, data: c, run: c.run }));
    if (q.trim()) out.push({ type: 'all', key: 'all', run: () => go(`/search${qs({ q: q.trim() })}`) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, commands, q]);

  useEffect(() => setActive(0), [items.length]);
  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!paletteOpen) return null;

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
    else if (e.key === 'Escape') close();
  };

  let lastType = null;
  const groupLabel = { page: 'Seiten', space: 'Bereiche', tag: 'Tags', command: q ? 'Befehle' : 'Schnellzugriff' };

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Befehlspalette">
        <div className="palette-input">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Suchen oder Befehl eingeben …  (tag:  space:  type:)"
            aria-label="Suche"
          />
          {loading ? <div className="spinner" /> : <span className="kbd">Esc</span>}
        </div>
        <div className="palette-results" ref={listRef}>
          {results && !results.pages.length && !results.spaces.length && !results.tags.length && (
            <div className="faint small" style={{ padding: '14px 12px' }}>Keine Treffer für „{q}“.</div>
          )}
          {items.map((it, i) => {
            const header = it.type !== lastType && groupLabel[it.type];
            lastType = it.type;
            return (
              <div key={it.key}>
                {header && <div className="palette-group eyebrow">{header}</div>}
                <div
                  className={`palette-item ${i === active ? 'active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => it.run()}
                >
                  {it.type === 'page' && (
                    <>
                      <span className="pi-icon" style={{ color: i === active ? undefined : it.data.spaceColor }}>
                        <PageIcon icon={it.data.icon} fallback={PAGE_TYPES[it.data.pageType]?.icon} />
                      </span>
                      <div className="grow">
                        <div className="pi-title">{it.data.title} <span className="faint tiny mono">· {it.data.spaceName}</span></div>
                        {it.data.snippet && <Snippet className="pi-snippet" text={it.data.snippet} />}
                      </div>
                    </>
                  )}
                  {it.type === 'space' && (
                    <>
                      <span className="pi-icon" style={{ color: it.data.color }}><Icon name={it.data.icon} /></span>
                      <div className="pi-title">{it.data.name}</div>
                    </>
                  )}
                  {it.type === 'tag' && (
                    <>
                      <span className="pi-icon"><Icon name="hash" /></span>
                      <div className="pi-title mono">{it.data.name} <span className="faint tiny">({it.data.count})</span></div>
                    </>
                  )}
                  {it.type === 'command' && (
                    <>
                      <span className="pi-icon" style={it.data.color ? { color: it.data.color } : undefined}><Icon name={it.data.icon} /></span>
                      <div className="pi-title">{it.data.title}</div>
                    </>
                  )}
                  {it.type === 'all' && (
                    <>
                      <span className="pi-icon"><Icon name="arrow-right" /></span>
                      <div className="pi-title">Alle Ergebnisse für „{q}“ anzeigen</div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑↓</span> navigieren</span>
          <span><span className="kbd">↵</span> öffnen</span>
          <span><span className="kbd">tag:</span> <span className="kbd">space:</span> <span className="kbd">type:</span> filtern</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
