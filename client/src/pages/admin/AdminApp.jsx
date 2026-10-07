import { Link, NavLink, Route, Routes } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Logo } from '../../components/Layout.jsx';
import { useApp } from '../../lib/context.jsx';
import Overview from './Overview.jsx';
import Users from './Users.jsx';
import Groups from './Groups.jsx';
import AdminSpaces from './AdminSpaces.jsx';
import Templates from './Templates.jsx';
import AdminTags from './AdminTags.jsx';
import Branding from './Branding.jsx';
import Audit from './Audit.jsx';
import System from './System.jsx';

const NAV = [
  ['Übersicht', [['', 'gauge', 'Systemstatus']]],
  ['Zugriff', [['users', 'users', 'Benutzer'], ['groups', 'user-cog', 'Gruppen'], ['spaces', 'shield', 'Bereiche & Rechte']]],
  ['Inhalte', [['templates', 'layers', 'Vorlagen'], ['tags', 'tags', 'Tags']]],
  ['System', [['branding', 'palette', 'Branding & Theming'], ['audit', 'scroll', 'Audit-Log'], ['system', 'server-cog', 'Wartung & Export']]],
];

export default function AdminApp() {
  const { settings, user, updatePreferences } = useApp();
  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="Administration">
        <Link to="/admin" className="admin-brand">
          <Logo />
          <div>
            <strong>{settings.siteName}</strong>
            <span className="tape">Administration</span>
          </div>
        </Link>
        {NAV.map(([group, items]) => (
          <div key={group}>
            <div className="group">{group}</div>
            {items.map(([path, icon, label]) => (
              <NavLink key={path} to={`/admin${path ? `/${path}` : ''}`} end={!path} className="nav-item">
                <Icon name={icon} size={16} /> {label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="grow" />
        <Link to="/" className="nav-item"><Icon name="arrow-left" size={16} /> Zurück zum Wiki</Link>
      </nav>
      <div className="admin-main">
        <header className="admin-top">
          <span className="status">System erreichbar</span>
          <div className="grow" />
          <button className="btn ghost icon sm" onClick={() => updatePreferences({ mode: document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark' })} aria-label="Hell oder dunkel">
            <Icon name={document.documentElement.dataset.mode === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
          <span className="small muted">{user.displayName}</span>
        </header>
        <main className="admin-content">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="users" element={<Users />} />
            <Route path="groups" element={<Groups />} />
            <Route path="spaces" element={<AdminSpaces />} />
            <Route path="templates" element={<Templates />} />
            <Route path="tags" element={<AdminTags />} />
            <Route path="branding" element={<Branding />} />
            <Route path="audit" element={<Audit />} />
            <Route path="system" element={<System />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
