import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { applyTheme, onSystemModeChange, resolveTheme } from './theme.js';
import Icon from '../components/Icon.jsx';
import { getLanguage, setLanguage } from './i18n.js';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [settings, setSettings] = useState({});
  const [spaces, setSpaces] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [treeVersion, setTreeVersion] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [lang, setLangState] = useState(getLanguage());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [unread, setUnread] = useState(0);
  const toastId = useRef(0);

  const toast = useCallback((message, type = 'success') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3200);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const { settings } = await api.get('/settings/public');
      setSettings(settings);
    } catch { /* offline */ }
    setSettingsLoaded(true);
  }, []);

  const loadSpaces = useCallback(async () => {
    try {
      const { spaces } = await api.get('/spaces');
      setSpaces(spaces);
    } catch { /* ignore */ }
  }, []);

  const refreshTree = useCallback(() => {
    setTreeVersion((v) => v + 1);
    loadSpaces();
  }, [loadSpaces]);

  useEffect(() => {
    loadSettings();
    api.get('/me').then(({ user }) => setUser(user)).catch(() => setUser(null));
    const onUnauth = () => setUser(null);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('bastion:unauthorized', onUnauth);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('bastion:unauthorized', onUnauth);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [loadSettings]);

  useEffect(() => {
    if (user) loadSpaces();
  }, [user, loadSpaces]);

  // unread notifications: poll while the tab is visible
  const refreshUnread = useCallback(() => {
    api.get('/notifications/unread').then((d) => setUnread(d.unread)).catch(() => {});
  }, []);
  const loggedIn = Boolean(user) && !user?.mustEnable2fa;
  useEffect(() => {
    if (!loggedIn) return undefined;
    refreshUnread();
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshUnread(); }, 60000);
    const onVis = () => document.visibilityState === 'visible' && refreshUnread();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [loggedIn, refreshUnread]);

  // theme
  const themeState = useMemo(() => resolveTheme(settings, user?.preferences || {}), [settings, user]);
  useEffect(() => {
    applyTheme(themeState);
    return onSystemModeChange(() => applyTheme(themeState));
  }, [themeState]);

  // admin-provided custom CSS
  useEffect(() => {
    let el = document.getElementById('bastion-custom-css');
    if (!settings.customCss) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('style');
      el.id = 'bastion-custom-css';
      document.head.appendChild(el);
    }
    el.textContent = settings.customCss;
  }, [settings.customCss]);

  useEffect(() => {
    document.title = settings.siteName || 'Bastion';
  }, [settings.siteName]);

  // language: user preference > last choice on this device > admin default > browser.
  // Children render only once the language is settled, so nothing re-mounts while someone types.
  const applyLanguage = useCallback((l) => setLangState(setLanguage(l)), []);
  let storedLang = null;
  try { storedLang = localStorage.getItem('bastion.lang.manual'); } catch { /* ignore */ }
  const wantedLang = user?.preferences?.language || storedLang || settings.defaultLanguage || lang;
  const ready = settingsLoaded && user !== undefined;
  useEffect(() => {
    if (ready && wantedLang !== lang) applyLanguage(wantedLang);
  }, [ready, wantedLang, lang, applyLanguage]);
  const settled = ready && wantedLang === lang;

  const updatePreferences = useCallback(async (patch) => {
    // optimistic
    setUser((u) => (u ? { ...u, preferences: { ...u.preferences, ...patch } } : u));
    try {
      const { user } = await api.patch('/me', { preferences: patch });
      setUser(user);
    } catch (e) {
      toast(e.message, 'error');
    }
  }, [toast]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    navigator.serviceWorker?.controller?.postMessage('clear-api-cache');
    setUser(null);
    setSpaces([]);
  }, []);

  const changeLanguage = useCallback((l) => {
    try { localStorage.setItem('bastion.lang.manual', l); } catch { /* ignore */ }
    applyLanguage(l);
    if (user) updatePreferences({ language: l });
  }, [applyLanguage, updatePreferences, user]);

  const value = {
    lang, changeLanguage,
    user, setUser, settings, setSettings, loadSettings, spaces, loadSpaces, refreshTree, treeVersion,
    toast, paletteOpen, setPaletteOpen, themeState, updatePreferences, logout, online, unread, setUnread, refreshUnread,
  };

  return (
    <AppContext.Provider value={value}>
      {settled ? <Fragment key={lang}>{children}</Fragment> : <div className="loading-screen"><div className="spinner" /></div>}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <Icon name={t.type === 'error' ? 'alert-triangle' : 'check-circle'} size={18} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
