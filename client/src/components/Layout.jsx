import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Avatar, Dropdown, MenuItem } from './ui.jsx';
import PageTree from './PageTree.jsx';
import CommandPalette from './CommandPalette.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { ROLE_LABELS } from '../lib/format.js';

export function Logo({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.3 7.5 10 4.4-1.7 7.5-5.4 7.5-10v-6z" fill="currentColor" fillOpacity=".18" />
      <path d="m9 10 2.5 2.5L9 15" />
      <path d="M13.5 15H16" />
    </svg>
  );
}

export default function Layout() {
  const app = useApp();
  const { user, spaces, settings, treeVersion, setPaletteOpen, themeState, updatePreferences, logout, online } = app;
  const location = useLocation();
  const navigate = useNavigate();
  const [crumbs, setCrumbs] = useState([]);
  const [currentSpace, setCurrentSpace] = useState(null); // key
  const [activePageId, setActivePageId] = useState(null);
  const [tree, setTree] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const collapsed = Boolean(user?.preferences?.sidebarCollapsed);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        updatePreferences({ sidebarCollapsed: !collapsed });
      } else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {
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
  const toggleMode = () => {
    const effective = document.documentElement.dataset.mode;
    updatePreferences({ mode: effective === 'dark' ? 'light' : 'dark' });
  };

  return (
    <div className={`shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileNav ? 'mobile-nav-open' : ''}`}>
      <div className="backdrop" />

      {/* ---------- rail ---------- */}
      <nav className="rail" aria-label="Bereiche">
        <Link to="/" className="rail-logo" title={settings.siteName}><Logo /></Link>
        <NavLink to="/" end className="rail-btn"><Icon name="dashboard" size={19} /><span className="tip">Dashboard</span></NavLink>
        <NavLink to="/search" className="rail-btn"><Icon name="search" size={19} /><span className="tip">Suche</span></NavLink>
        <NavLink to="/tags" className="rail-btn"><Icon name="tags" size={19} /><span className="tip">Tags</span></NavLink>
        <div className="rail-sep" />
        <div className="rail-scroll">
          {spaces.map((s) => (
            <Link
              key={s.id}
              to={`/s/${s.key}`}
              className={`rail-btn rail-space ${currentSpace === s.key ? 'active' : ''}`}
              style={{ '--sc': s.color }}
            >
              <Icon name={s.icon} size={18} />
              <span className="tip">{s.name}</span>
            </Link>
          ))}
          {user.role !== 'viewer' && (
            <Link to="/spaces?new=1" className="rail-btn" title="Neuer Bereich"><Icon name="plus" size={18} /><span className="tip">Neuer Bereich</span></Link>
          )}
        </div>
        <div className="rail-sep" />
        <button className="rail-btn" onClick={toggleMode} aria-label="Hell/Dunkel umschalten">
          <Icon name={document.documentElement.dataset.mode === 'dark' ? 'sun' : 'moon'} size={19} />
          <span className="tip">{themeState.mode === 'system' ? 'System' : 'Modus wechseln'}</span>
        </button>
        {user.role === 'admin' && (
          <Link to="/admin" className="rail-btn"><Icon name="shield-check" size={19} /><span className="tip">Admin-Panel</span></Link>
        )}
        <Dropdown
          up
          align="left"
          trigger={({ toggle }) => (
            <button className="rail-btn" onClick={toggle} aria-label="Konto"><Avatar name={user.displayName} size={32} /></button>
          )}
        >
          <div className="menu-label">
            <div style={{ fontWeight: 600 }}>{user.displayName}</div>
            <div className="tiny faint mono">@{user.username} · {ROLE_LABELS[user.role]}</div>
          </div>
          <div className="menu-sep" />
          <MenuItem icon="user-cog" to="/settings">Einstellungen</MenuItem>
          <MenuItem icon="palette" to="/settings/appearance">Darstellung</MenuItem>
          <MenuItem icon="key-round" to="/settings/tokens">API-Tokens</MenuItem>
          {user.role === 'admin' && <MenuItem icon="shield-check" to="/admin">Admin-Panel</MenuItem>}
          <div className="menu-sep" />
          <MenuItem icon="log-out" onClick={async () => { await logout(); navigate('/login'); }}>Abmelden</MenuItem>
        </Dropdown>
      </nav>

      {/* ---------- sidebar ---------- */}
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar-head">
          {space ? (
            <Link to={`/s/${space.key}`} className="sidebar-title" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="space-chip" style={{ '--sc': space.color }}><Icon name={space.icon} size={16} /></span>
              <div className="grow">
                <h2 className="ellipsis">{space.name}</h2>
                <div className="tiny faint mono">{space.key} · {tree.pages.length} Seiten</div>
              </div>
            </Link>
          ) : (
            <Link to="/" className="sidebar-title" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="space-chip" style={{ '--sc': 'var(--accent)' }}><Logo size={17} /></span>
              <div className="grow">
                <h2 className="ellipsis">{settings.siteName || 'Bastion'}</h2>
                <div className="tiny faint">{settings.tagline}</div>
              </div>
            </Link>
          )}
          <button className="sidebar-search" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={15} /> Suchen … <span className="kbd">Strg K</span>
          </button>
        </div>
        <div className="sidebar-body">
          {space ? (
            <div className="sidebar-section">
              <div className="sidebar-section-head">
                <span className="eyebrow" style={{ padding: '0 10px 6px' }}>Seiten</span>
                {canWriteSpace && (
                  <Link to={`/new?space=${space.key}`} className="btn ghost icon sm" title="Neue Seite"><Icon name="plus" size={15} /></Link>
                )}
              </div>
              <PageTree spaceKey={space.key} pages={tree.pages} canWrite={canWriteSpace} activeId={activePageId} />
            </div>
          ) : (
            <>
              <div className="sidebar-section">
                <NavLink to="/" end className="nav-item"><Icon name="dashboard" size={16} /> Dashboard</NavLink>
                <NavLink to="/spaces" className="nav-item"><Icon name="grid" size={16} /> Alle Bereiche</NavLink>
                <NavLink to="/search" className="nav-item"><Icon name="search" size={16} /> Erweiterte Suche</NavLink>
                <NavLink to="/tags" className="nav-item"><Icon name="tags" size={16} /> Tags</NavLink>
                <NavLink to="/review" className="nav-item"><Icon name="calendar-clock" size={16} /> Review fällig</NavLink>
              </div>
              <div className="sidebar-section">
                <span className="eyebrow">Bereiche</span>
                {spaces.map((s) => (
                  <Link key={s.id} to={`/s/${s.key}`} className="nav-item">
                    <Icon name={s.icon} size={16} style={{ color: s.color }} /> <span className="ellipsis">{s.name}</span>
                    <span className="count">{s.pageCount}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="sidebar-foot">
          {space && <Link to="/" className="btn ghost sm"><Icon name="arrow-left" size={14} /> Übersicht</Link>}
          <div className="grow" />
          {space && space.access === 'admin' && (
            <Link to={`/s/${space.key}?settings=1`} className="btn ghost icon sm" title="Bereich verwalten"><Icon name="settings" size={15} /></Link>
          )}
          <button className="btn ghost icon sm desktop-only" title="Seitenleiste einklappen (Strg+\)" onClick={() => updatePreferences({ sidebarCollapsed: true })}>
            <Icon name="chevrons-left" size={15} />
          </button>
        </div>
      </aside>
      <div className="mobile-scrim" onClick={() => setMobileNav(false)} />

      {/* ---------- main ---------- */}
      <div className="main">
        {!online && (
          <div className="offline-banner"><Icon name="wifi" size={15} /> Offline – zuletzt besuchte Seiten sind weiterhin lesbar.</div>
        )}
        {settings.announcement && (
          <div className="announcement"><Icon name="bell" size={15} /> {settings.announcement}</div>
        )}
        <header className="topbar">
          <button className="btn ghost icon mobile-only" onClick={() => setMobileNav(true)} aria-label="Menü"><Icon name="menu" /></button>
          {collapsed && (
            <button className="btn ghost icon sm desktop-only" title="Seitenleiste ausklappen" onClick={() => updatePreferences({ sidebarCollapsed: false })}>
              <Icon name="chevrons-right" size={15} />
            </button>
          )}
          <nav className="crumbs" aria-label="Brotkrumen">
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6, minWidth: 0 }}>
                {i > 0 && <span className="sep">/</span>}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span className="ellipsis">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Suche öffnen">
              <Icon name="search" size={15} /> <span>Seiten, Tags, Hosts suchen …</span> <span className="kbd">Strg K</span>
            </button>
            {user.role !== 'viewer' && (
              <Link to={space && canWriteSpace ? `/new?space=${space.key}` : '/new'} className="btn primary sm">
                <Icon name="plus" size={15} /> <span className="desktop-only">Neue Seite</span>
              </Link>
            )}
          </div>
        </header>
        <Outlet context={ctx} />
        {settings.footerText && <footer className="faint small" style={{ textAlign: 'center', padding: 20 }}>{settings.footerText}</footer>}
      </div>
      <CommandPalette />
    </div>
  );
}
