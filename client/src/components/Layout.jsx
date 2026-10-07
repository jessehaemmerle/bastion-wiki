import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon, { PageIcon } from './Icon.jsx';
import { Avatar, Dropdown, MenuItem } from './ui.jsx';
import PageTree from './PageTree.jsx';
import CommandPalette from './CommandPalette.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.jsx';
import { ROLE_LABELS } from '../lib/format.js';
import { tr } from '../lib/i18n.js';

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
  const { user, spaces, settings, treeVersion, setPaletteOpen, updatePreferences, logout, online, unread } = useApp();
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

  // favourites + recently viewed (refreshed when navigating)
  const [quick, setQuick] = useState({ recent: [], favorites: [], approvals: 0 });
  const [openSections, setOpenSections] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bastion.sidebar.sections') || '{}'); } catch { return {}; }
  });
  const toggleSection = (k) => setOpenSections((o) => {
    const n = { ...o, [k]: !(o[k] ?? true) };
    try { localStorage.setItem('bastion.sidebar.sections', JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  useEffect(() => {
    if (user?.mustEnable2fa) return undefined;
    const t = setTimeout(() => api.get('/me/recent').then(setQuick).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [location.pathname, treeVersion, user?.mustEnable2fa]);

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
      <aside className="sidebar" aria-label={tr('Navigation')}>
        <div className="sidebar-head">
          <Link to="/" className="brand"><Logo /> <span className="ellipsis">{settings.siteName || 'Bastion'}</span></Link>
          <button className="sidebar-search" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={15} /> {tr('Suchen')} <span className="kbd">{tr('Strg K')}</span>
          </button>
        </div>
        <nav className="sidebar-body">
          <NavLink to="/" end className="nav-item"><Icon name="home" size={16} /> {tr('Start')}</NavLink>
          <NavLink to="/review" className="nav-item"><Icon name="calendar-clock" size={16} /> {tr('Zu prüfen')}</NavLink>
          <NavLink to="/tags" className="nav-item"><Icon name="tags" size={16} /> {tr('Tags')}</NavLink>
          <NavLink to="/inventory" className="nav-item"><Icon name="server" size={16} /> {tr('Inventar')}</NavLink>
          <NavLink to="/expiring" className="nav-item"><Icon name="calendar" size={16} /> {tr('Fristen')}</NavLink>
          <NavLink to="/approvals" className="nav-item"><Icon name="badge-check" size={16} /> {tr('Freigaben')}{quick.approvals > 0 && <span className="count nav-badge">{quick.approvals}</span>}</NavLink>
          <div className="sidebar-section quick">
            <button type="button" className="sidebar-section-head toggle" aria-expanded={openSections.tools ?? false} onClick={() => setOpenSections((o) => {
              const n = { ...o, tools: !(o.tools ?? false) };
              try { localStorage.setItem('bastion.sidebar.sections', JSON.stringify(n)); } catch { /* ignore */ }
              return n;
            })}>
              <span>{tr('Werkzeuge')}</span>
              <Icon name="chevron-down" size={14} className={(openSections.tools ?? false) ? '' : 'rot'} />
            </button>
            {(openSections.tools ?? false) && (
              <>
                <NavLink to="/snippets" className="nav-item small"><Icon name="layers" size={15} /> {tr('Bausteine')}</NavLink>
                <Link to="/handbook" className="nav-item small"><Icon name="printer" size={15} /> {tr('Notfallhandbuch')}</Link>
                <NavLink to="/trash" className="nav-item small"><Icon name="trash" size={15} /> {tr('Papierkorb')}</NavLink>
              </>
            )}
          </div>

          {[['favorites', tr('Favoriten'), quick.favorites], ['recent', tr('Zuletzt angesehen'), quick.recent]].map(([key, label, items]) => items.length > 0 && (
            <div className="sidebar-section quick" key={key}>
              <button type="button" className="sidebar-section-head toggle" aria-expanded={openSections[key] ?? true} onClick={() => toggleSection(key)}>
                <span>{label}</span>
                <Icon name="chevron-down" size={14} className={(openSections[key] ?? true) ? '' : 'rot'} />
              </button>
              {(openSections[key] ?? true) && items.slice(0, key === 'recent' ? 6 : 10).map((p) => (
                <NavLink key={p.id} to={`/p/${p.id}`} className="nav-item small quick-item" style={{ '--sc': p.spaceColor }}>
                  <PageIcon icon={p.icon} fallback={key === 'favorites' ? 'star' : 'history'} size={14} />
                  <span className="ellipsis">{p.title}</span>
                </NavLink>
              ))}
            </div>
          ))}

          <div className="sidebar-section">
            <div className="sidebar-section-head">
              <Link to="/spaces" style={{ color: 'inherit', textDecoration: 'none' }}>{tr('Bereiche')}</Link>
              {user.role !== 'viewer' && (
                <Link to="/spaces?new=1" className="btn ghost icon sm" title={tr('Bereich anlegen')} aria-label={tr('Bereich anlegen')}><Icon name="plus" size={14} /></Link>
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
                          <Icon name="plus" size={14} /> {tr('Seite anlegen')}
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
              <button className="who" onClick={toggle} aria-label={tr('Konto-Menü')}>
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
            <MenuItem icon="user-cog" to="/settings">{tr('Profil')}</MenuItem>
            <MenuItem icon="palette" to="/settings/appearance">{tr('Darstellung')}</MenuItem>
            <MenuItem icon="key-round" to="/settings/tokens">{tr('API-Tokens')}</MenuItem>
            {user.role === 'admin' && <MenuItem icon="shield-check" to="/admin">{tr('Administration')}</MenuItem>}
            <div className="menu-sep" />
            <MenuItem icon="log-out" onClick={async () => { await logout(); navigate('/login'); }}>{tr('Abmelden')}</MenuItem>
          </Dropdown>
          <button className="btn ghost icon sm" onClick={() => updatePreferences({ mode: isDark ? 'light' : 'dark' })} title={isDark ? tr('Hell') : tr('Dunkel')} aria-label={tr('Hell oder dunkel')}>
            <Icon name={isDark ? 'sun' : 'moon'} size={15} />
          </button>
          <button className="btn ghost icon sm desktop-only" title={tr('Seitenleiste ausblenden (Strg+\\)')} aria-label={tr('Seitenleiste ausblenden')} onClick={() => updatePreferences({ sidebarCollapsed: true })}>
            <Icon name="chevrons-left" size={15} />
          </button>
        </div>
      </aside>
      <div className="mobile-scrim" onClick={() => setMobileNav(false)} />

      <div className="main">
        {!online && <div className="offline-banner"><Icon name="wifi" size={15} /> {tr('Keine Verbindung. Bereits geöffnete Seiten bleiben lesbar.')}</div>}
        {settings.announcement && <div className="announcement"><Icon name="bell" size={15} /> {settings.announcement}</div>}
        <header className="topbar">
          <button className="btn ghost icon mobile-only" onClick={() => setMobileNav(true)} aria-label={tr('Navigation öffnen')}><Icon name="menu" /></button>
          {collapsed && (
            <button className="btn ghost icon sm desktop-only" title={tr('Seitenleiste einblenden')} aria-label={tr('Seitenleiste einblenden')} onClick={() => updatePreferences({ sidebarCollapsed: false })}>
              <Icon name="chevrons-right" size={15} />
            </button>
          )}
          <nav className="crumbs" aria-label={tr('Pfad')}>
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6, minWidth: 0 }}>
                {i > 0 && <span className="sep">/</span>}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span className="ellipsis">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="topbar-actions">
            <Link to="/notifications" className={`btn ghost icon bell ${unread ? 'has-unread' : ''}`} title={tr('Benachrichtigungen')} aria-label={unread ? tr('{n} ungelesene Benachrichtigungen', { n: unread }) : tr('Benachrichtigungen')}>
              <Icon name={unread ? 'bell-ring' : 'bell'} size={17} />
              {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label={tr('Suche öffnen')}>
              <Icon name="search" size={15} /> <span>{tr('Suchen')}</span> <span className="kbd">{tr('Strg K')}</span>
            </button>
            {user.role !== 'viewer' && (
              <Link to={space && canWriteSpace ? `/new?space=${space.key}` : '/new'} className="btn primary sm">
                <Icon name="plus" size={15} /> <span className="desktop-only">{tr('Neue Seite')}</span>
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
