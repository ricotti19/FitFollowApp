import React, { useState, useEffect, useRef } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler, clearPhotoCache } from './lib/api';
import { headerDate } from './lib/format';
import Avatar from './components/Avatar';
import StoriesModal from './components/StoriesModal';
import DmsModal from './components/DmsModal';
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
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [topModal, setTopModal] = useState(null); // null | 'stories' | 'dms'
  const [storyFocusUser, setStoryFocusUser] = useState(null);
  const [feedJump, setFeedJump] = useState(null); // null | { scope: 'friends' | 'discover', ts: number }
  const menuRef = useRef(null);

  const [incomingReqs, setIncomingReqs] = useState([]);
const [dismissedReqIds, setDismissedReqIds] = useState(() => new Set());

useEffect(() => {
  if (!user) { setIncomingReqs([]); return; }
  let live = true;
  const checkRequests = () => {
    api.get('/friends')
      .then((d) => { if (live) setIncomingReqs(d.incoming || []); })
      .catch(() => {});
  };
  checkRequests();
  const id = setInterval(checkRequests, 8000);
  return () => { live = false; clearInterval(id); };
}, [user]);

const visibleReqs = incomingReqs.filter((u) => !dismissedReqIds.has(u.id));


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
        <a href="#today" className="logo" onClick={(e) => { e.preventDefault(); setShowSettings(false); setTopModal(null); setActiveTab('today'); }}>FitFollow</a>
        <div className="header-right">
                 <button
         type="button"
         className="btn small ghost"
         style={{ padding: '5px 10px', fontSize: '0.82rem' }}
          onClick={() => { setFeedJump(null); setStoryFocusUser(null); setTopModal('stories'); }}
       >
         + Story
       </button>
       <button
         type="button"
         className="btn small ghost"
         style={{ padding: '5px 10px', fontSize: '0.82rem' }}
         onClick={() => { setShowSettings(false); setTopModal('dms'); }}

       >
         DMs
       </button>
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
           style={{ width: 46, height: 46 }}
           onClick={() => setMenuOpen((o) => !o)}
           title="Account"
           aria-label="Account menu"
           aria-haspopup="menu"
           aria-expanded={menuOpen}
         >
           <Avatar user={user} size={46} />
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
                  <button
                  type="button"
                  role="menuitem"
                  className="profile-popover-item danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmSignOut(true);
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

         {visibleReqs.length > 0 && (
     <div
       role="status"
       style={{
         position: 'fixed',
         top: 76,
         right: 20,
         zIndex: 950,
         width: 'min(360px, calc(100vw - 32px))',
         background: '#ffffff',
         color: '#14141f',
         border: '2px solid var(--accent)',
         borderRadius: 18,
         padding: '14px 16px',
         boxShadow: '0 14px 36px rgba(20, 20, 31, 0.2)',
         display: 'flex',
         flexDirection: 'column',
         gap: 10,
       }}
     >
       <div className="row spread">
         <strong style={{ fontSize: '0.92rem' }}>
           👋 Friend Request{visibleReqs.length > 1 ? `s (${visibleReqs.length})` : ''}
         </strong>
         <button
           type="button"
           className="btn small ghost"
           style={{ padding: '2px 8px', fontSize: '0.8rem' }}
           aria-label="Dismiss notification"
           onClick={() => setDismissedReqIds((prev) => new Set([...prev, ...visibleReqs.map((u) => u.id)]))}
         >
           ×
         </button>
       </div>
       {visibleReqs.map((u) => (
         <div key={u.id} className="row spread" style={{ gap: 8 }}>
           <div className="row" style={{ gap: 8, minWidth: 0 }}>
             <Avatar user={u} size={34} />
             <div className="person-names" style={{ minWidth: 0 }}>
               <div className="name" style={{ fontSize: '0.9rem' }}>{u.displayName || u.username}</div>
               <div className="handle" style={{ fontSize: '0.78rem' }}>@{u.username}</div>
             </div>
           </div>
           <div className="row" style={{ gap: 6 }}>
             <button
               type="button"
               className="btn small"
               onClick={async () => {
                 await api.post(`/friends/${u.id}/accept`).catch(() => {});
                 setIncomingReqs((prev) => prev.filter((x) => x.id !== u.id));
               }}
             >
               Accept
             </button>
             <button
               type="button"
               className="btn small ghost"
               onClick={() => {
                 setShowSettings(false);
                 setTopModal(null);
                 setActiveTab('friends');
               }}
             >
               View
             </button>
           </div>
         </div>
       ))}
     </div>
   )}

   <aside className="ff-feed-rail" aria-label="Feed view">
     <button
       type="button"
       className={`ff-feed-rail-btn ${activeTab === 'friends' && (!feedJump || feedJump.scope === 'friends') ? 'active' : ''}`}
       onClick={() => {
         setShowSettings(false);
         setTopModal(null);
         setActiveTab('friends');
         setFeedJump({ scope: 'friends', ts: Date.now() });
       }}
     >
       <span className="icon" aria-hidden="true">🏠</span>
       <span>Home</span>
     </button>
          <button
       type="button"
       className={`ff-feed-rail-btn ${activeTab === 'friends' && feedJump?.scope === 'discover' ? 'active' : ''}`}
       onClick={() => {
         setShowSettings(false);
         setTopModal(null);
         setActiveTab('friends');
         setFeedJump({ scope: 'discover', ts: Date.now() });
       }}
     >
       <span className="icon" aria-hidden="true">🧭</span>
       <span>Discover</span>
     </button>

     <button
       type="button"
       className={`ff-feed-rail-btn ${topModal === 'stories' ? 'active' : ''}`}
       onClick={() => {
        setShowSettings(false);
        setFeedJump(null);
        setStoryFocusUser(null);
        setTopModal('stories');
       }}
     >
       <span className="icon" aria-hidden="true">✨</span>
       <span>Stories</span>
     </button>
   </aside>

    <main className="app-main stack">
     {showSettings && <SettingsPage user={user} onUserChange={setUser} onBack={() => setShowSettings(false)} />}
     {!showSettings && topModal === 'dms' && <DmsModal onClose={() => setTopModal(null)} />}
               {!showSettings && topModal === 'stories' && (
       <StoriesModal
         user={user}
         focusUsername={storyFocusUser}
         onClearFocus={() => setStoryFocusUser(null)}
         onClose={() => {
           const returnUser = storyFocusUser;
           setTopModal(null);
           setStoryFocusUser(null);
           if (returnUser) {
             setActiveTab('friends');
             setFeedJump({ scope: 'discover', openUser: returnUser, ts: Date.now() });
           }
         }}
         onOpenProfile={(uname) => {
           setShowSettings(false);
           setTopModal(null);
           setStoryFocusUser(null);
           setActiveTab('friends');
           setFeedJump({ scope: 'discover', openUser: uname, ts: Date.now() });
         }}
       />
     )}
     {!showSettings && !topModal && activeTab === 'today' && <TodayTab user={user} />}
     {!showSettings && !topModal && activeTab === 'workouts' && <WorkoutsTab />}
     {!showSettings && !topModal && activeTab === 'body' && <BodyTab />}
     {!showSettings && activeTab === 'friends' && (
       <div className={topModal ? 'hidden' : ''}>
         <FriendsTab
           user={user}
           onOpenSettings={() => setShowSettings(true)}
           feedJump={feedJump}
           onOpenStories={(uname) => { setStoryFocusUser(uname || null); setTopModal('stories'); }}
         />
       </div>
     )}

   </main>

      <nav className="tabbar" aria-label="Main navigation">
        {TABS.map((t) => {
          const active = !showSettings && !topModal && activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`tab ${active ? 'active' : ''}`}
              onClick={() => { setShowSettings(false); setTopModal(null); setActiveTab(t.id); }}
              aria-current={active ? 'page' : undefined}
              aria-label={t.label}
            >
              {t.icon(active)}
              <span className="tab-label">{t.label}</span>
            </button>
          );
        })}
      </nav>

      {confirmSignOut && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmSignOut(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(20, 20, 31, 0.5)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="stack"
            style={{
              width: 'min(400px, 92vw)',
              background: '#ffffff',
              color: '#14141f',
              border: '2px solid rgba(20, 20, 31, 0.16)',
              borderRadius: 24,
              padding: '26px 28px',
              boxShadow: '0 22px 50px rgba(20, 20, 31, 0.25)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Sign out of FitFollow?</h3>
            <p className="small muted" style={{ margin: 0 }}>
              You will need to sign back in with your email and password to access your workouts and feed.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button type="button" className="btn small ghost" onClick={() => setConfirmSignOut(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn small dark-navy"
                onClick={() => {
                  setConfirmSignOut(false);
                  logout();
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
