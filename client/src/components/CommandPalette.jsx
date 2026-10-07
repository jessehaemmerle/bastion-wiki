import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Icon, { PageIcon } from './Icon.jsx';
import { Snippet } from './ui.jsx';
import { api, qs } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { PAGE_TYPES } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

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
    if (term.length < 2 && !/^(tag|space|type):/.test(term)) { setResults(null); setLoading(false); return; }
    setLoading(true);
    let cancelled = false; // a slower answer for an older query must not overwrite the current one
    const t = setTimeout(async () => {
      let res = null;
      try { res = await api.get(`/search${qs({ q: term, limit: 8 })}`); } catch { /* keep null */ }
      if (cancelled) return;
      setResults(res);
      setLoading(false);
    }, 160);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, paletteOpen]);

  const close = () => setPaletteOpen(false);
  const go = (to) => { close(); navigate(to); };

  const commands = useMemo(() => {
    const list = [
      { id: 'home', title: tr('Startseite öffnen'), icon: 'dashboard', run: () => go('/') },
      { id: 'search', title: tr('Erweiterte Suche'), icon: 'search', run: () => go(`/search${qs({ q })}`) },
      { id: 'tags', title: tr('Alle Tags anzeigen'), icon: 'tags', run: () => go('/tags') },
      { id: 'review', title: tr('Seiten mit fälligem Review'), icon: 'calendar-clock', run: () => go('/review') },
      { id: 'mode', title: tr('Hell/Dunkel umschalten'), icon: 'moon', run: () => { close(); updatePreferences({ mode: document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark' }); } },
      { id: 'appearance', title: tr('Theme & Darstellung'), icon: 'palette', run: () => go('/settings/appearance') },
      { id: 'tokens', title: tr('API-Tokens verwalten'), icon: 'key-round', run: () => go('/settings/tokens') },
    ];
    if (user?.role !== 'viewer') list.unshift({ id: 'new', title: tr('Neue Seite erstellen'), icon: 'plus', run: () => go('/new') });
    if (user?.role === 'admin') list.push({ id: 'admin', title: tr('Administration öffnen'), icon: 'shield-check', run: () => go('/admin') });
    for (const s of spaces) list.push({ id: `space-${s.id}`, title: tr('Bereich: {name}', { name: s.name }), icon: s.icon, color: s.color, run: () => go(`/s/${s.key}`) });
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
  const groupLabel = { page: tr('Seiten'), space: tr('Bereiche'), tag: tr('Tags'), command: q ? tr('Befehle') : tr('Schnellzugriff') };

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label={tr('Befehlspalette')}>
        <div className="palette-input">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={tr('Suchen oder Befehl eingeben …  (tag:  space:  type:)')}
            aria-label={tr('Suche')}
          />
          {loading ? <div className="spinner" /> : <span className="kbd">{tr('Esc')}</span>}
        </div>
        <div className="palette-results" ref={listRef}>
          {results && !results.pages.length && !results.spaces.length && !results.tags.length && (
            <div className="faint small" style={{ padding: '14px 12px' }}>{tr('Keine Treffer für „{q}“.', { q })}</div>
          )}
          {items.map((it, i) => {
            const header = it.type !== lastType && groupLabel[it.type];
            lastType = it.type;
            return (
              <div key={it.key}>
                {header && <div className="palette-group">{header}</div>}
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
                        <div className="pi-title">{it.data.title} <span className="faint small" style={{ fontWeight: 400, marginLeft: 6 }}>{it.data.spaceName}</span></div>
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
                      <div className="pi-title">{tr('Alle Ergebnisse für „{q}“ anzeigen', { q })}</div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑↓</span> {tr('navigieren')}</span>
          <span><span className="kbd">↵</span> {tr('öffnen')}</span>
          <span><span className="kbd">{tr('tag:')}</span> <span className="kbd">{tr('space:')}</span> <span className="kbd">{tr('type:')}</span> {tr('filtern')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
