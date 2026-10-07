import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './lib/context.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Spaces from './pages/Spaces.jsx';
import SpaceView from './pages/SpaceView.jsx';
import PageView from './pages/PageView.jsx';
import History from './pages/History.jsx';
import Search from './pages/Search.jsx';
import Tags, { TagDetail } from './pages/Tags.jsx';
import Review from './pages/Review.jsx';
import UserSettings from './pages/UserSettings.jsx';
import NotFound from './pages/NotFound.jsx';
import Inventory from './pages/Inventory.jsx';
import RunView from './pages/RunView.jsx';
import Notifications from './pages/Notifications.jsx';
import SharedPage from './pages/SharedPage.jsx';

// The editor and admin panel are big – load them on demand
const PageEdit = lazy(() => import('./pages/PageEdit.jsx'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp.jsx'));

function RequireAuth({ children, role }) {
  const { user } = useApp();
  const location = useLocation();
  if (user === undefined) return <Spinner center />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  // security policy: set up two-factor authentication first
  if (user.mustEnable2fa && location.pathname !== '/settings/security') return <Navigate to="/settings/security" replace />;
  if (role === 'admin' && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner center />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Login register />} />
        <Route path="/share/:token" element={<SharedPage />} />
        <Route path="/admin/*" element={<RequireAuth role="admin"><AdminApp /></RequireAuth>} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="spaces" element={<Spaces />} />
          <Route path="s/:key" element={<SpaceView />} />
          <Route path="p/:id" element={<PageView />} />
          <Route path="p/:id/edit" element={<Suspense fallback={<Spinner center />}><PageEdit /></Suspense>} />
          <Route path="p/:id/history" element={<History />} />
          <Route path="new" element={<Suspense fallback={<Spinner center />}><PageEdit isNew /></Suspense>} />
          <Route path="search" element={<Search />} />
          <Route path="tags" element={<Tags />} />
          <Route path="tags/:name" element={<TagDetail />} />
          <Route path="review" element={<Review />} />
          <Route path="inventory/:type?" element={<Inventory />} />
          <Route path="runs/:id" element={<RunView />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings/:tab?" element={<UserSettings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
