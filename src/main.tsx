/**
 * SonicSentinel — Root Application Entry
 *
 * ROLE-BASED ROUTING:
 *   - user  → User Dashboard (upload audio, detections, alerts, etc.)
 *   - admin → Admin Dashboard (platform management)
 *
 * SECURITY:
 *   - Role is read from /auth/me (server-authoritative, never from localStorage).
 *   - Admin dashboard is only rendered when user.role === 'admin'.
 *   - Normal users receive the user dashboard regardless of any URL manipulation.
 *   - All admin API calls are additionally protected server-side (HTTP 403 if non-admin).
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, ChevronDown, Loader2, LogOut, MoreHorizontal,
  Moon, PanelLeftClose, PanelLeftOpen, Search, Sun,
  CheckCircle2, AlertTriangle, Info, X, Shield, Activity,
  Sliders, User as UserIcon
} from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { authApi, type User } from './api/auth';
import { Logo } from './brand';
import { LandingPage } from './landing';
import { AuthCard } from './auth/AuthCard';
import { Overview, Analyze, SettingsPage, Generic, nav, type Page } from './pages';
import { LiveMonitorPage } from './live';
import { AdminDashboard } from './admin/AdminDashboard';
import { api } from './api/client';

/* ---- Toast Notification Host ---- */
let toastSeq = 0;
function ToastHost() {
  const [toasts, setToasts] = useState<{ id: number; type: string; message: string }[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const id = ++toastSeq;
      setToasts(t => [...t, { id, type: d?.type ?? 'info', message: d?.message ?? '' }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
    };
    window.addEventListener('sonic:toast', onToast);
    return () => window.removeEventListener('sonic:toast', onToast);
  }, []);

  return (
    <div className="toast-host">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            className={`toast toast-${t.type}`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald" />
            ) : t.type === 'alert' || t.type === 'error' ? (
              <AlertTriangle size={16} className="text-crimson" />
            ) : (
              <Info size={16} className="text-cyan" />
            )}
            <span>{t.message}</span>
            <button onClick={() => setToasts(x => x.filter(i => i.id !== t.id))} aria-label="Dismiss toast">
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---- User App Shell (role=user only) ---- */
function UserApp({
  user,
  onUserChange,
  onLogout
}: {
  user: User;
  onUserChange: (u: User) => void;
  onLogout: () => void;
}) {
  const [page, setPage] = useState<Page>('Dashboard');
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [light, setLight] = useState(() => localStorage.getItem('ss:light') === 'on');
  const [unread, setUnread] = useState(0);
  const [currentTime, setCurrentTime] = useState('');

  // Poll alerts count
  useEffect(() => {
    const poll = () => {
      api.get('/alerts')
        .then(r => {
          const un = (r.data || []).filter((a: any) => !a.read).length;
          setUnread(un);
        })
        .catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => clearInterval(iv);
  }, []);

  // Live top-bar clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
        '  ' +
        now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    };
    updateTime();
    const iv = setInterval(updateTime, 1000);
    return () => clearInterval(iv);
  }, []);

  const toggleLight = () => {
    setLight(v => {
      localStorage.setItem('ss:light', v ? 'off' : 'on');
      return !v;
    });
  };

  // Keyboard shortcut: Cmd+K opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('.top-search-input') as HTMLInputElement | null;
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Mobile drawer keyboard & resize UX
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    const onResize = () => {
      if (window.innerWidth > 960) setMenu(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [menu]);

  const renderCurrentView = () => {
    switch (page) {
      case 'Dashboard':
        return <Overview onNavigate={setPage} />;
      case 'Upload Audio':
        return <Analyze onGoLive={() => setPage('Live Monitoring')} />;
      case 'Live Monitoring':
        return <LiveMonitorPage />;
      case 'Settings':
      case 'Profile':
        return <SettingsPage user={user} onUserChange={onUserChange} onLogout={onLogout} />;
      default:
        return <Generic page={page} onNavigate={setPage} />;
    }
  };

  return (
    <main className={`${light ? 'light' : ''} ${collapsed ? 'rail-collapsed' : ''}`}>
      {/* Mobile Drawer Scrim */}
      <div
        className={`nav-scrim ${menu ? 'show' : ''}`}
        onClick={() => setMenu(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className={`${menu ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand-row">
          <Logo />
          <button
            className="collapse-toggle-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Workspace Tag */}
        <div className="workspace-badge" onClick={() => setPage('Dashboard')}>
          <span>WORKSPACE</span>
          <b>Sentinel Operations</b>
        </div>

        {/* Nav Links — user nav only, no admin links */}
        <nav className="sidebar-nav">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => {
                setPage(name);
                setMenu(false);
              }}
              className={`nav-item-btn ${page === name ? 'active' : ''}`}
            >
              <Icon size={18} className="nav-icon" />
              <span className="nav-label">{name}</span>
              {name === 'Alerts' && unread > 0 && (
                <i className="nav-counter-badge">{unread}</i>
              )}
            </button>
          ))}
        </nav>

        {/* Account Row */}
        <div className="sidebar-account-row" onClick={() => setPage('Settings')}>
          <div className="avatar-chip">
            {(user.name || 'U').slice(0, 2).toUpperCase()}
          </div>
          <div className="account-text">
            <b>{user.name}</b>
            <p>{user.email}</p>
          </div>
          <button className="account-menu-trigger" onClick={(e) => { e.stopPropagation(); onLogout(); }} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Shell */}
      <div className="app-shell">
        {/* Top Header Bar */}
        <header className="app-top-header">
          <button
            className="mobile-toggle-btn"
            aria-label="Toggle menu"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          {/* Search bar */}
          <div className="top-search-box">
            <Search size={16} className="search-icon" />
            <input
              className="top-search-input"
              placeholder="Search detections, alerts, or telemetry..."
            />
            <kbd className="search-kbd">⌘ K</kbd>
          </div>

          {/* Right Header */}
          <div className="top-header-right">
            {/* System Online Badge */}
            <div className="system-status-indicator">
              <span className="pulse-dot green" />
              <span>System Online</span>
            </div>

            {/* Live Clock */}
            <div className="header-clock-pill">
              {currentTime}
            </div>

            {/* Theme Toggle */}
            <button
              className="header-icon-btn"
              onClick={toggleLight}
              title={light ? 'Switch to Dark mode' : 'Switch to Light mode'}
            >
              {light ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* Notifications Bell */}
            <button
              className="header-icon-btn bell-btn"
              onClick={() => setPage('Alerts')}
              title="Alert notifications"
            >
              <Bell size={17} />
              {unread > 0 && <span className="bell-badge-dot" />}
            </button>

            {/* User Role indicator — shows USER role clearly */}
            <div
              className="header-avatar-circle"
              onClick={() => setPage('Settings')}
              title={`Logged in as ${user.name} (${user.role})`}
            >
              {(user.name || 'U').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Viewport Content */}
        <div className="app-main-content">
          {/*
            No AnimatePresence here on purpose. With mode="wait" the incoming
            page is not mounted until the outgoing one has finished its exit,
            and an exit only finishes while requestAnimationFrame is running.
            In a hidden or throttled tab rAF does not run, so navigation
            silently froze on the previous page. Rendering the keyed motion
            div directly makes the swap immediate and leaves the fade as pure
            decoration that can never block the view.
          */}
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {renderCurrentView()}
          </motion.div>
        </div>
      </div>

      <ToastHost />
    </main>
  );
}

/* ---- Root Component — Role-Based Routing ---- */
function Root() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [activeUser, setActiveUser] = useState<User | null>(user);

  if (loading) {
    return (
      <div className="auth-fullscreen-loader">
        <Logo large />
        <Loader2 className="spin mt-4 text-cyan" size={32} />
        <p className="muted mt-2">Connecting to SonicSentinel Neural Mesh...</p>
      </div>
    );
  }

  const currentUser = activeUser ?? user;

  if (currentUser) {
    const handleLogout = async () => {
      await authApi.logout();
      setActiveUser(null);
      window.location.reload();
    };

    // SECURITY: Role-based routing — server-verified role from /auth/me
    if (currentUser.role === 'admin') {
      // Admin users always go to the Admin Dashboard
      return (
        <AdminDashboard
          user={currentUser}
          onLogout={handleLogout}
        />
      );
    }

    // Normal users (role=user) go to the User Dashboard
    return (
      <UserApp
        user={currentUser}
        onUserChange={setActiveUser}
        onLogout={handleLogout}
      />
    );
  }

  // Standalone Auth Screen
  if (view === 'auth') {
    return (
      <div className="auth-page-wrapper">
        <div className="auth-page-container">
          <AuthCard
            initialMode={authInitialMode}
            onCancel={() => setView('landing')}
          />
        </div>
      </div>
    );
  }

  // Cinematic Landing Page
  return (
    <LandingPage
      onStart={(mode) => {
        setAuthInitialMode(mode);
        setView('auth');
      }}
    />
  );
}

/* ---- Error Boundary ---- */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('SonicSentinel React Error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-wrapper">
          <div className="error-boundary-card">
            <Logo large />
            <h3>Neural Interface Desynchronized</h3>
            <p>{this.state.error?.message || 'An unexpected rendering error occurred.'}</p>
            <button
              className="primary-glow-btn compact"
              onClick={() => window.location.reload()}
            >
              Restart Console
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
