import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import RejectedChangesNotification from './RejectedChangesNotification';
import NotificationPromptModal from './NotificationPromptModal';
import PWAInstallBanner from './PWAInstallBanner';
import PWAUpdateBanner from './PWAUpdateBanner';
import { usePushNotifications } from '../hooks/usePushNotifications';

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  sopHidden?: boolean;
};

const IconBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="grid h-5 w-5 place-items-center">{children}</span>
);

const ICONS = {
  dashboard: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-18v7h6V2h-6z" /></svg></IconBox>,
  schedule: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></IconBox>,
  approvals: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></IconBox>,
  overview: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 19h16M6 16V8m6 8V5m6 11v-6" /></svg></IconBox>,
  users: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2a5 5 0 00-10 0v2m10-8a4 4 0 10-8 0 4 4 0 008 0zm6 2a4 4 0 11-8 0 4 4 0 018 0z" /></svg></IconBox>,
  megaphone: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M11 5 6 9H3v6h3l5 4V5Zm0 0h4a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-4" /></svg></IconBox>,
  resources: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" /></svg></IconBox>,
  settings: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10.325 4.317a1 1 0 0 1 1.9 0 1 1 0 0 0 1.49.617 1 1 0 0 1 1.366.366 1 1 0 0 0 1.324.472 1 1 0 0 1 1.366.366 1 1 0 0 1-.366 1.366 1 1 0 0 0-.472 1.324 1 1 0 0 1 .617 1.49 1 1 0 0 0 0 1.9 1 1 0 0 1-.617 1.49 1 1 0 0 0-.472 1.324 1 1 0 0 1 .366 1.366 1 1 0 0 1-1.366.366 1 1 0 0 0-1.324.472 1 1 0 0 1-1.49.617 1 1 0 0 0-1.9 0 1 1 0 0 1-1.49-.617 1 1 0 0 0-1.324-.472 1 1 0 0 1-1.366-.366 1 1 0 0 1 .366-1.366 1 1 0 0 0 .472-1.324 1 1 0 0 1-.617-1.49 1 1 0 0 0 0-1.9 1 1 0 0 1 .617-1.49 1 1 0 0 0 .472-1.324 1 1 0 0 1-.366-1.366 1 1 0 0 1 1.366-.366 1 1 0 0 0 1.324-.472 1 1 0 0 1 1.49-.617Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg></IconBox>,
  profile: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M20 21a8 8 0 1 0-16 0m8-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg></IconBox>,
};

const adminNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { to: '/schedule', label: 'Schedule', icon: ICONS.schedule },
  { to: '/approvals', label: 'Approvals', icon: ICONS.approvals },
  { to: '/activity-overview', label: 'Activity Overview', icon: ICONS.overview, adminOnly: true },
  { to: '/users', label: 'Users', icon: ICONS.users, adminOnly: true },
  { to: '/announcements', label: 'Announcements', icon: ICONS.megaphone, adminOnly: true },
  { to: '/resources', label: 'Resources', icon: ICONS.resources },
  { to: '/settings', label: 'Settings', icon: ICONS.settings },
];

const supportNav: NavItem[] = [
  { to: '/support', label: 'Home', icon: ICONS.dashboard },
  { to: '/support/schedule', label: 'My Schedule', icon: ICONS.schedule },
  { to: '/support/resources', label: 'Resources', icon: ICONS.resources },
  { to: '/support/profile', label: 'Profile', icon: ICONS.profile },
];

const MobileBadge: React.FC<{ count: number }> = ({ count }) => {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
      {count > 9 ? '9+' : count}
    </span>
  );
};

const isNavActive = (pathname: string, to: string) => {
  if (to === '/support' || to === '/dashboard') {
    return pathname === to;
  }

  return pathname === to || pathname.startsWith(`${to}/`);
};

const AppShell: React.FC = () => {
  const { user, isAdmin, isSopPreparer, logout } = useAuth();
  const {
    rejectedChanges,
    unreadCount,
    refreshRejectedChanges,
    globalPendingChanges,
    realtimeHealthy,
    digestCursor,
    newResourceCount,
  } = useAppData();
  const { showPrompt, enable, dismiss } = usePushNotifications(user?.id);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isSupport = user?.role === 'SUPPORT';
  const navItems = useMemo(() => {
    if (isSupport) return supportNav;
    return adminNav.filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.sopHidden && isSopPreparer) return false;
      return true;
    });
  }, [isAdmin, isSopPreparer, isSupport]);
  const mobileNavItems = useMemo(() => {
    if (isSupport) return supportNav;
    const mobileAdminRoutes = new Set(['/dashboard', '/schedule', '/approvals', '/resources']);
    return navItems.filter((item) => mobileAdminRoutes.has(item.to));
  }, [isSupport, navItems]);

  const currentLabel = isAdmin ? 'Admin' : isSopPreparer ? 'SOP Preparer' : 'Support';

  const detailTone = realtimeHealthy
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="app-shell-bg min-h-screen text-gray-900">
      <PWAUpdateBanner />
      {showPrompt && <NotificationPromptModal onEnable={enable} onDismiss={dismiss} />}
      {isSopPreparer && unreadCount > 0 && (
        <RejectedChangesNotification
          rejectedChanges={rejectedChanges}
          unreadCount={unreadCount}
          onUpdate={() => {
            void refreshRejectedChanges();
          }}
        />
      )}

      <aside className="surface-card fixed inset-y-4 left-4 z-30 hidden w-72 flex-col overflow-hidden lg:flex">
        <div className="border-b border-orange-100 px-6 py-6">
          <button type="button" onClick={() => navigate(isSupport ? '/support' : '/dashboard')} className="flex items-center gap-3 text-left">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-orange-600 text-lg font-bold text-white shadow-lg shadow-orange-200">
              F
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">FOF IKD Ops</p>
              <p className="text-xs text-gray-500">{isSupport ? 'Support workspace' : 'Operations console'}</p>
            </div>
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
          {navItems.map((item) => {
            const active = isNavActive(location.pathname, item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-pill ${active || isActive ? 'nav-pill-active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.to.includes('approvals') && <MobileBadge count={globalPendingChanges.length} />}
                {item.to.includes('resources') && <MobileBadge count={newResourceCount} />}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-orange-100 px-4 py-4">
          <div className="surface-muted flex items-center gap-3 px-4 py-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-sm font-bold text-primary">
              {user?.name?.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{currentLabel}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-white"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/45" onClick={() => setOpen(false)} />
          <div className="surface-card relative m-4 flex w-80 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-orange-100 px-5 py-5">
              <div>
                <p className="text-base font-bold text-gray-900">FOF IKD Ops</p>
                <p className="text-xs text-gray-500">{isSupport ? 'Support workspace' : 'Operations console'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-gray-400 hover:bg-orange-50 hover:text-gray-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {navItems.map((item) => {
                const active = isNavActive(location.pathname, item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={`nav-pill ${active ? 'nav-pill-active' : ''}`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.to.includes('approvals') && <MobileBadge count={globalPendingChanges.length} />}
                    {item.to.includes('resources') && <MobileBadge count={newResourceCount} />}
                  </NavLink>
                );
              })}
            </nav>
            <div className="border-t border-orange-100 px-4 py-4">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center justify-center rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-orange-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-[19rem]">
        <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button type="button" onClick={() => setOpen(true)} className="rounded-2xl border border-orange-100 bg-white p-2 text-gray-500 lg:hidden">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user?.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-orange-100 px-2.5 py-1 font-semibold text-orange-700">{currentLabel}</span>
                {!isSupport && (
                  <span className={`rounded-full border px-2.5 py-1 ${detailTone}`}>
                    {realtimeHealthy ? 'Live sync' : 'Polling fallback'}
                  </span>
                )}
                {isAdmin && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                    Pending approvals: {globalPendingChanges.length}
                  </span>
                )}
                {digestCursor && !isSupport && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                    {digestCursor.completed ? 'Digest completed' : `Digest: Week ${digestCursor.weekNumber} • ${digestCursor.dayName}`}
                  </span>
                )}
              </div>
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              <button
                type="button"
                onClick={() => navigate(isSupport ? '/support/resources' : '/resources')}
                className="surface-muted flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700"
              >
                {ICONS.resources}
                Resources
                <MobileBadge count={newResourceCount} />
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-orange-50"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-orange-100 bg-white/95 px-2 py-2 backdrop-blur lg:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(mobileNavItems.length, 1), 5)}, minmax(0, 1fr))` }}>
          {mobileNavItems.map((item) => {
            const active = isNavActive(location.pathname, item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium ${active ? 'bg-orange-50 text-primary' : 'text-gray-500'}`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
                {item.to.includes('approvals') && globalPendingChanges.length > 0 && (
                  <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-primary" />
                )}
                {item.to.includes('resources') && newResourceCount > 0 && (
                  <span className="absolute right-2 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                    {newResourceCount > 9 ? '9+' : newResourceCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <PWAInstallBanner />
    </div>
  );
};

export default AppShell;
