import React, { useState, useEffect, useRef } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler, clearPhotoCache } from './lib/api';
import { headerDate } from './lib/format';
import Avatar from './components/Avatar';
import SettingsPage from './pages/SettingsPage';
import TodayTab from './pages/TodayTab';
import WorkoutsTab from './pages/WorkoutsTab';
import BodyTab from './pages/BodyTab';
import FriendsTab from './pages/FriendsTab';
import Dashboard from './pages/Dashboard';

const ACCENT_THEMES = [
  { id: 'lavender', label: 'Lavender', color: '#7c5cff' },
  { id: 'rose', label: 'Rose', color: '#e85d75' },
  { id: 'ocean', label: 'Ocean', color: '#3b82f6' },
  { id: 'mint', label: 'Mint', color: '#10b981' },
  { id: 'sunset', label: 'Sunset', color: '#f59e0b' },
  { id: 'slate', label: 'Slate', color: '#64748b' },
];

const THEME_STORAGE_KEY = 'ff_accent_theme';

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function mix(hex, target, amount) {
  const { r, g, b } = hexToRgb(hex);
  const t = target === 'white' ? 255 : 0;
  const mixChannel = (c) => Math.round(c + (t - c) * amount);
  return `#${[mixChannel(r), mixChannel(g), mixChannel(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function applyAccentTheme(themeId) {
  const theme = ACCENT_THEMES.find((t) => t.id === themeId) || ACCENT_THEMES[0];
  const { r, g, b } = hexToRgb(theme.color);
  const hover = mix(theme.color, 'black', 0.12);
  const bgLeft = mix(theme.color, 'white', 0.02);
  const bgMid = mix(theme.color, 'white', 0.28);
  const bgRight = mix(theme.color, 'white', 0.72);
  const root = document.documentElement;
  root.style.setProperty('--accent', theme.color);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--accent-hover', hover);
  root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.14)`);
  root.style.setProperty('--bg-solid', bgRight);
  root.style.setProperty('--bg-gradient', `linear-gradient(90deg, ${bgLeft} 0%, ${bgMid} 45%, ${bgRight} 100%)`);
  try { localStorage.setItem(THEME_STORAGE_KEY, theme.id); } catch {}
  return theme.id;
}

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (ACCENT_THEMES.some((t) => t.id === stored)) return stored;
  } catch {}
  return ACCENT_THEMES[0].id;
}

const TABS = [
  {
    id: 'today',
    label: 'Today',
    icon: (active) => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {active ? (
          <path className="tab-fill" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        ) : (
          <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z" />
        )}
      </svg>
    ),
  },
  {
    id: 'workouts',
    label: 'Workouts',
    icon: (active) => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {active ? (
          <path className="tab-fill" d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z" />
        ) : (
          <path d="M7.5 4.5l-3 3m0 0l-2 2 1.5 1.5 2-2 9 9-2 2L14.5 21.5l2-2m3-15l-3 3m3-3l2 2-1.5 1.5-2-2-9 9 2 2L9.5 19.5l-2 2" />
        )}
      </svg>
    ),
  },
  {
    id: 'body',
    label: 'Body',
    icon: (active) => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {active ? (
          <path className="tab-fill" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        ) : (
          <path d="M20.8 8.6a4.8 4.8 0 00-8.1-3.5l-.7.7-.7-.7a4.8 4.8 0 00-6.8 6.8l7.5 7.5 7.5-7.5a4.8 4.8 0 001.3-3.3z" />
        )}
      </svg>
    ),
  },
  {
    id: 'friends',
    label: 'Friends',
    icon: (active) => (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {active ? (
          <path className="tab-fill" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        ) : (
          <>
            <circle cx="9" cy="8" r="3" />
            <path d="M2 19v-1a5 5 0 015-5h4a5 5 0 015 5v1" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M16.5 13H18a4 4 0 014 4v2" />
          </>
        )}
      </svg>
    ),
  },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'workouts' | 'body' | 'friends'
  const [loadingUser, setLoadingUser] = useState(Boolean(getToken()));
  const [accentTheme, setAccentTheme] = useState(() => getStoredTheme());
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const menuRef = useRef(null);

  const logout = () => {
    setMenuOpen(false);
    setShowSettings(false);
    setActiveTab('today'); // so the next person to sign in doesn't land on a stale tab
    setToken(null);
    clearPhotoCache();
    setUser(null);
  };

  // Close the profile menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api.get('/me')
      .then((res) => setUser(res.user || res))
      .catch(logout)
      .finally(() => setLoadingUser(false));
  }, []);

  useEffect(() => {
    applyAccentTheme(accentTheme);
  }, [accentTheme]);

  if (loadingUser) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">FitFollow</div>
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  // ---- LANDING / AUTH POSTER ----
  if (!user) {
    return <Dashboard onAuthSuccess={(u) => setUser(u)} />;
  }

  // ---- MAIN APP ----
  return (
    <div className="app">
      <header className="app-header">
        <a href="#today" className="logo" onClick={(e) => { e.preventDefault(); setShowSettings(false); setActiveTab('today'); }}>FitFollow</a>
        <div className="header-right">
          <span className="header-date">{headerDate()}</span>
          <label className="theme-picker" title="Choose accent color">
            <span className="theme-dot" aria-hidden="true" />
            <span className="sr-only">Accent color</span>
            <select
              className="theme-select"
              value={accentTheme}
              onChange={(e) => setAccentTheme(e.target.value)}
              aria-label="Accent color"
            >
              {ACCENT_THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <div className="profile-menu" ref={menuRef}>
            <button
              type="button"
              className="avatar-btn"
              onClick={() => setMenuOpen((o) => !o)}
              title="Account"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar user={user} size={34} />
            </button>
            {menuOpen && (
              <div className="profile-popover" role="menu">
                <div className="profile-popover-head">
                  <div className="row">
                    <Avatar user={user} size={40} />
                    <div className="person-names">
                      <div className="name">{user.displayName || user.username}</div>
                      <div className="handle">@{user.username}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span className={`chip ${user.isPublic ? 'accent' : ''}`}>{user.isPublic ? 'Public account' : 'Private account'}</span>
                  </div>
                </div>
                <button type="button" role="menuitem" className="profile-popover-item" onClick={() => { setMenuOpen(false); setShowSettings(true); }}>
                  Profile &amp; privacy
                </button>
                <button type="button" role="menuitem" className="profile-popover-item danger" onClick={logout}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main stack">
        {showSettings && <SettingsPage user={user} onUserChange={setUser} onBack={() => setShowSettings(false)} />}
        {!showSettings && activeTab === 'today' && <TodayTab user={user} />}
        {!showSettings && activeTab === 'workouts' && <WorkoutsTab />}
        {!showSettings && activeTab === 'body' && <BodyTab />}
        {!showSettings && activeTab === 'friends' && <FriendsTab user={user} onOpenSettings={() => setShowSettings(true)} />}
      </main>

      <nav className="tabbar" aria-label="Main navigation">
        {TABS.map((t) => {
          const active = !showSettings && activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`tab ${active ? 'active' : ''}`}
              onClick={() => { setShowSettings(false); setActiveTab(t.id); }}
              aria-current={active ? 'page' : undefined}
              aria-label={t.label}
            >
              {t.icon(active)}
              <span className="tab-label">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}