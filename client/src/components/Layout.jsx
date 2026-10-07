import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Avatar, Dropdown, MenuItem } from './ui.jsx';
import PageTree from './PageTree.jsx';
import CommandPalette from './CommandPalette.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { ROLE_LABELS } from '../lib/format.js';

/** Logo: a rack front with one labelled unit */
export function Logo({ size = 26, className = 'logo' }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      <rect width="32" height="32" rx="4.5" fill="#2b3135" />
      <rect x="6" y="7" width="20" height="4" rx=".4" fill="#5c666b" />
      <rect x="6" y="14" width="20" height="4" rx=".4" fill="#f2c200" />
      <rect x="8" y="15.4" width="6" height="1.2" fill="#1d1d1b" />
      <rect x="6" y="21" width="20" height="4" rx=".4" fill="#5c666b" />
    </svg>
  );
}

export default function Layout() {
  const { user, spaces, settings, treeVersion, setPaletteOpen, updatePreferences, logout, online } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [crumbs, setCrumbs] = useState([]);
  const [currentSpace, setCurrentSpace] = useState(null);
  const [activePageId, setActivePageId] = useState(null);
  const [tree, setTree] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const collapsed = Boolean(user?.preferences?.sidebarCollapsed);
  const isDark = document.documentElement.dataset.mode === 'dark';

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        updatePreferences({ sidebarCollapsed: !collapsed });
      } else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen, updatePreferences, collapsed]);

  useEffect(() => setMobileNav(false), [location.pathname]);

  useEffect(() => {
    if (!currentSpace) { setTree(null); return; }
    let cancelled = false;
    api.get(`/spaces/${currentSpace}`).then((d) => !cancelled && setTree(d)).catch(() => !cancelled && setTree(null));
    return () => { cancelled = true; };
  }, [currentSpace, treeVersion]);

  const ctx = {
    setCrumbs: useCallback((c) => setCrumbs(c), []),
    setCurrentSpace: useCallback((k) => setCurrentSpace(k), []),
    setActivePageId: useCallback((id) => setActivePageId(id), []),
  };

  const space = tree?.space;
  const canWriteSpace = space && ['write', 'admin'].includes(space.access);

  return (
    <div className={`shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileNav ? 'mobile-nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar-head">
          <Link to="/" className="brand"><Logo /> <span className="ellipsis">{settings.siteName || 'Bastion'}</span></Link>
          <button className="sidebar-search" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={15} /> Suchen <span className="kbd">Strg K</span>
          </button>
        </div>
        <nav className="sidebar-body">
          <NavLink to="/" end className="nav-item"><Icon name="home" size={16} /> Start</NavLink>
          <NavLink to="/review" className="nav-item"><Icon name="calendar-clock" size={16} /> Zu prüfen</NavLink>
          <NavLink to="/tags" className="nav-item"><Icon name="tags" size={16} /> Tags</NavLink>

          <div className="sidebar-section">
            <div className="sidebar-section-head">
              <Link to="/spaces" style={{ color: 'inherit', textDecoration: 'none' }}>Bereiche</Link>
              {user.role !== 'viewer' && (
                <Link to="/spaces?new=1" className="btn ghost icon sm" title="Bereich anlegen" aria-label="Bereich anlegen"><Icon name="plus" size={14} /></Link>
              )}
            </div>
            {spaces.map((s) => {
              const open = currentSpace === s.key;
              return (
                <div key={s.id}>
                  <Link to={`/s/${s.key}`} className={`nav-item space-row ${open && location.pathname === `/s/${s.key}` ? 'active' : ''}`} style={{ '--sc': s.color }}>
                    <span className="ellipsis" style={{ fontWeight: open ? 700 : 400 }}>{s.name}</span>
                    <span className="count">{s.pageCount}</span>
                  </Link>
                  {open && tree && (
                    <div className="space-tree">
                      <PageTree spaceKey={s.key} pages={tree.pages} canWrite={canWriteSpace} activeId={activePageId} />
                      {canWriteSpace && (
                        <Link to={`/new?space=${s.key}`} className="nav-item small" style={{ color: 'var(--text-muted)' }}>
                          <Icon name="plus" size={14} /> Seite anlegen
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
        <div className="sidebar-foot">
          <Dropdown
            up
            align="left"
            className="grow"
            trigger={({ toggle }) => (
              <button className="who" onClick={toggle} aria-label="Konto-Menü">
                <Avatar name={user.displayName} size={26} />
                <span className="grow ellipsis small" style={{ fontWeight: 700 }}>{user.displayName}</span>
              </button>
            )}
          >
            <div className="menu-label">
              <div style={{ fontWeight: 700 }}>{user.displayName}</div>
              <div className="tiny faint">{user.username}, {ROLE_LABELS[user.role]}</div>
            </div>
            <div className="menu-sep" />
            <MenuItem icon="user-cog" to="/settings">Profil</MenuItem>
            <MenuItem icon="palette" to="/settings/appearance">Darstellung</MenuItem>
            <MenuItem icon="key-round" to="/settings/tokens">API-Tokens</MenuItem>
            {user.role === 'admin' && <MenuItem icon="shield-check" to="/admin">Administration</MenuItem>}
            <div className="menu-sep" />
            <MenuItem icon="log-out" onClick={async () => { await logout(); navigate('/login'); }}>Abmelden</MenuItem>
          </Dropdown>
          <button className="btn ghost icon sm" onClick={() => updatePreferences({ mode: isDark ? 'light' : 'dark' })} title={isDark ? 'Hell' : 'Dunkel'} aria-label="Hell oder dunkel">
            <Icon name={isDark ? 'sun' : 'moon'} size={15} />
          </button>
          <button className="btn ghost icon sm desktop-only" title="Seitenleiste ausblenden (Strg+\)" aria-label="Seitenleiste ausblenden" onClick={() => updatePreferences({ sidebarCollapsed: true })}>
            <Icon name="chevrons-left" size={15} />
          </button>
        </div>
      </aside>
      <div className="mobile-scrim" onClick={() => setMobileNav(false)} />

      <div className="main">
        {!online && <div className="offline-banner"><Icon name="wifi" size={15} /> Keine Verbindung. Bereits geöffnete Seiten bleiben lesbar.</div>}
        {settings.announcement && <div className="announcement"><Icon name="bell" size={15} /> {settings.announcement}</div>}
        <header className="topbar">
          <button className="btn ghost icon mobile-only" onClick={() => setMobileNav(true)} aria-label="Navigation öffnen"><Icon name="menu" /></button>
          {collapsed && (
            <button className="btn ghost icon sm desktop-only" title="Seitenleiste einblenden" aria-label="Seitenleiste einblenden" onClick={() => updatePreferences({ sidebarCollapsed: false })}>
              <Icon name="chevrons-right" size={15} />
            </button>
          )}
          <nav className="crumbs" aria-label="Pfad">
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6, minWidth: 0 }}>
                {i > 0 && <span className="sep">/</span>}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span className="ellipsis">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Suche öffnen">
              <Icon name="search" size={15} /> <span>Suchen</span> <span className="kbd">Strg K</span>
            </button>
            {user.role !== 'viewer' && (
              <Link to={space && canWriteSpace ? `/new?space=${space.key}` : '/new'} className="btn primary sm">
                <Icon name="plus" size={15} /> <span className="desktop-only">Neue Seite</span>
              </Link>
            )}
          </div>
        </header>
        <Outlet context={ctx} />
        {settings.footerText && <footer className="faint small" style={{ padding: '20px 40px' }}>{settings.footerText}</footer>}
      </div>
      <CommandPalette />
    </div>
  );
}
