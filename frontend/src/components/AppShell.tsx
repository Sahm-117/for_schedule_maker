import React, { useMemo, useState } from 'react';
import SectionTabs, { sectionMatches } from './SectionTabs';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import AppSelect from './AppSelect';
import RejectedChangesNotification from './RejectedChangesNotification';
import NotificationPromptModal from './NotificationPromptModal';
import PWAInstallBanner from './PWAInstallBanner';
import PWAUpdateBanner from './PWAUpdateBanner';
import NeedSupportButton from './NeedSupportButton';
import NotificationBell from './NotificationBell';
import ForcePasswordChangeModal from './ForcePasswordChangeModal';
import ErrorBoundary from './ErrorBoundary';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useTourState } from '../context/TourContext';
import { sortByText } from '../utils/sort';

type NavItem = {
  to: string;
  label: string;
  mobileLabel?: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  sopHidden?: boolean;
  mobileHidden?: boolean;
  mobileMore?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type OpenNavGroups = Record<string, boolean>;

const IconBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="grid h-5 w-5 place-items-center">{children}</span>
);

const ICONS = {
  dashboard: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-18v7h6V2h-6z" /></svg></IconBox>,
  schedule: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></IconBox>,
  approvals: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></IconBox>,
  overview: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 19h16M6 16V8m6 8V5m6 11v-6" /></svg></IconBox>,
  cohorts: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5 5.15 5 3.067 5.865 2 7.2v11.547C3.067 17.412 5.15 16.547 7.5 16.547c1.746 0 3.332.477 4.5 1.253m0-11.547C13.168 5.477 14.754 5 16.5 5c2.35 0 4.433.865 5.5 2.2v11.547c-1.067-1.335-3.15-2.2-5.5-2.2-1.746 0-3.332.477-4.5 1.253" /></svg></IconBox>,
  users: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2a5 5 0 00-10 0v2m10-8a4 4 0 10-8 0 4 4 0 008 0zm6 2a4 4 0 11-8 0 4 4 0 018 0z" /></svg></IconBox>,
  megaphone: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M11 5 6 9H3v6h3l5 4V5Zm0 0h4a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-4" /></svg></IconBox>,
  resources: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" /></svg></IconBox>,
  settings: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M10.325 4.317a1 1 0 0 1 1.9 0 1 1 0 0 0 1.49.617 1 1 0 0 1 1.366.366 1 1 0 0 0 1.324.472 1 1 0 0 1 1.366.366 1 1 0 0 1-.366 1.366 1 1 0 0 0-.472 1.324 1 1 0 0 1 .617 1.49 1 1 0 0 0 0 1.9 1 1 0 0 1-.617 1.49 1 1 0 0 0-.472 1.324 1 1 0 0 1 .366 1.366 1 1 0 0 1-1.366.366 1 1 0 0 0-1.324.472 1 1 0 0 1-1.49.617 1 1 0 0 0-1.9 0 1 1 0 0 1-1.49-.617 1 1 0 0 0-1.324-.472 1 1 0 0 1-1.366-.366 1 1 0 0 1 .366-1.366 1 1 0 0 0 .472-1.324 1 1 0 0 1-.617-1.49 1 1 0 0 0 0-1.9 1 1 0 0 1 .617-1.49 1 1 0 0 0 .472-1.324 1 1 0 0 1-.366-1.366 1 1 0 0 1 1.366-.366 1 1 0 0 0 1.324-.472 1 1 0 0 1 1.49-.617Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg></IconBox>,
  followups: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" /></svg></IconBox>,
  profile: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M20 21a8 8 0 1 0-16 0m8-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg></IconBox>,
  participants: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0m13 13v-2a4 4 0 0 0-3-3.87" /></svg></IconBox>,
  groups: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg></IconBox>,
  attendance: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" /></svg></IconBox>,
  faith: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg></IconBox>,
  prayer: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4.318 6.318a4.5 4.5 0 0 0 0 6.364L12 20.364l7.682-7.682a4.5 4.5 0 0 0-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 0 0-6.364 0Z" /></svg></IconBox>,
  onboarding: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-3 3v-3Z" /></svg></IconBox>,
  hub: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></IconBox>,
  mobilisation: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M18 9v6m3-3h-6M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 20a6 6 0 0 1 12 0v1H3v-1Z" /></svg></IconBox>,
  more: <IconBox><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4.25 10a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm7 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm7 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" /></svg></IconBox>,
  rota: <IconBox><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 9h18M9 4v16M4 20h16a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z" /></svg></IconBox>,
};

// Related pages sit under one item and share a tab strip (see SectionTabs):
// Participants (+ Attendance, Faith projects, Onboarding), Groups (+ Allocation,
// Group meetings), Schedule (+ Approvals, Rota, Activity overview).
const adminNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { to: '/schedule', label: 'Schedule', icon: ICONS.schedule },
  { to: '/participants', label: 'Participants', icon: ICONS.participants, adminOnly: true },
  { to: '/groups', label: 'Groups', icon: ICONS.groups, adminOnly: true },
  { to: '/supports', label: 'Supports', icon: ICONS.attendance, adminOnly: true },
  { to: '/cohorts', label: 'Cohorts', icon: ICONS.cohorts, adminOnly: true },
  { to: '/follow-ups', label: 'Follow-ups', icon: ICONS.followups, adminOnly: true },
  { to: '/users', label: 'Users', icon: ICONS.users, adminOnly: true },
  { to: '/announcements', label: 'Announcements', icon: ICONS.megaphone, adminOnly: true },
  { to: '/hub', label: 'Hub', icon: ICONS.hub },
  { to: '/resources', label: 'Resources', icon: ICONS.resources },
  { to: '/settings', label: 'Settings', icon: ICONS.settings },
];

const adminNavGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: ICONS.dashboard },
    ],
  },
  {
    label: 'Programme',
    items: [
      { to: '/schedule', label: 'Schedule', icon: ICONS.schedule },
    ],
  },
  {
    label: 'People & groups',
    items: [
      { to: '/participants', label: 'Participants', icon: ICONS.participants, adminOnly: true },
      { to: '/groups', label: 'Groups', icon: ICONS.groups, adminOnly: true },
      { to: '/supports', label: 'Supports', icon: ICONS.attendance, adminOnly: true },
      { to: '/cohorts', label: 'Cohorts', icon: ICONS.cohorts, adminOnly: true },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { to: '/follow-ups', label: 'Follow-ups', icon: ICONS.followups, adminOnly: true },
      { to: '/hub', label: 'Hub', icon: ICONS.hub },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: ICONS.users, adminOnly: true },
      { to: '/announcements', label: 'Announcements', icon: ICONS.megaphone, adminOnly: true },
      { to: '/resources', label: 'Resources', icon: ICONS.resources },
      { to: '/settings', label: 'Settings', icon: ICONS.settings },
    ],
  },
];

const supportNav: NavItem[] = [
  { to: '/support', label: 'Home', icon: ICONS.dashboard },
  { to: '/support/mobilisation', label: 'Mobilisation', icon: ICONS.mobilisation },
  { to: '/support/schedule', label: 'My Schedule', mobileLabel: 'Schedule', icon: ICONS.schedule },
  { to: '/support/participants', label: 'My Group', mobileLabel: 'Group', icon: ICONS.participants },
  { to: '/support/onboarding', label: 'Onboard', icon: ICONS.onboarding, mobileMore: true },
  { to: '/support/hub', label: 'Hub', icon: ICONS.hub, mobileMore: true },
  { to: '/support/resources', label: 'Resources', icon: ICONS.resources, mobileMore: true },
  { to: '/support/profile', label: 'Profile', icon: ICONS.profile, mobileMore: true },
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

  return pathname === to || pathname.startsWith(`${to}/`) || sectionMatches(pathname, to);
};

const canShowNavItem = (item: NavItem, isAdmin: boolean, isSopPreparer: boolean) => {
  if (item.adminOnly && !isAdmin) return false;
  if (item.sopHidden && isSopPreparer) return false;
  return true;
};

const NavDot: React.FC = () => (
  <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
);

const NavItemLink: React.FC<{
  item: NavItem;
  active: boolean;
  globalPendingCount: number;
  newResourceCount: number;
  hasNewHubActivity: boolean;
  onClick?: () => void;
}> = ({ item, active, globalPendingCount, newResourceCount, hasNewHubActivity, onClick }) => (
  <NavLink
    key={item.to}
    to={item.to}
    end={item.to === '/support' || item.to === '/dashboard'}
    onClick={onClick}
    className={({ isActive }) => `nav-pill ${active || isActive ? 'nav-pill-active' : ''}`}
  >
    {item.icon}
    <span>{item.label}</span>
    {item.to === '/schedule' && <MobileBadge count={globalPendingCount} />}
    {item.to.includes('hub') && hasNewHubActivity && <NavDot />}
  </NavLink>
);

const NavGroupSection: React.FC<{
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  locationPathname: string;
  globalPendingCount: number;
  newResourceCount: number;
  hasNewHubActivity: boolean;
  onItemClick?: () => void;
}> = ({
  group,
  open,
  onToggle,
  locationPathname,
  globalPendingCount,
  newResourceCount,
  hasNewHubActivity,
  onItemClick,
}) => (
  <div className="space-y-1.5">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 hover:bg-orange-50/70 hover:text-gray-600"
      aria-expanded={open}
    >
      <span className="min-w-0 flex-1 truncate">{group.label}</span>
      <svg
        className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m9 5 7 7-7 7" />
      </svg>
    </button>
    {open && (
      <div className="space-y-1">
        {group.items.map((item) => (
          <NavItemLink
            key={item.to}
            item={item}
            active={isNavActive(locationPathname, item.to)}
            globalPendingCount={globalPendingCount}
            newResourceCount={newResourceCount}
            hasNewHubActivity={hasNewHubActivity}
            onClick={onItemClick}
          />
        ))}
      </div>
    )}
  </div>
);

const AppShell: React.FC = () => {
  const { user, isAdmin, isSopPreparer, logout, userLabels } = useAuth();
  const {
    cohorts,
    activeCohort,
    setActiveCohort,
    rejectedChanges,
    unreadCount,
    refreshRejectedChanges,
    globalPendingChanges,
    newResourceCount,
    hasNewHubActivity,
  } = useAppData();
  const { showPrompt, enable, dismiss } = usePushNotifications(user?.id);
  const [open, setOpen] = useState(false);
  const [openNavGroups, setOpenNavGroups] = useState<OpenNavGroups>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isSupport = user?.role === 'SUPPORT';
  // First-login order: password change, Welcome + Home tour, then the notification prompt.
  const { busy: tourBusy } = useTourState();
  const navItems = useMemo(() => {
    if (isSupport) return supportNav;
    return adminNav.filter((item) => canShowNavItem(item, isAdmin, isSopPreparer));
  }, [isAdmin, isSopPreparer, isSupport]);
  const navGroups = useMemo(() => {
    if (isSupport) return [];
    return adminNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canShowNavItem(item, isAdmin, isSopPreparer)),
      }))
      .filter((group) => group.items.length > 0);
  }, [isAdmin, isSopPreparer, isSupport]);
  const isNavGroupOpen = (label: string) => openNavGroups[label] ?? true;
  const toggleNavGroup = (label: string) => {
    setOpenNavGroups((current) => ({
      ...current,
      [label]: !(current[label] ?? true),
    }));
  };
  const mobileNavItems = useMemo(() => {
    if (isSupport) return supportNav.filter((item) => !item.mobileHidden && !item.mobileMore);
    const mobileAdminRoutes = new Set(['/dashboard', '/schedule', '/participants', '/supports', '/hub']);
    return navItems.filter((item) => mobileAdminRoutes.has(item.to));
  }, [isSupport, navItems]);
  const mobileMoreItems = useMemo(
    () => (isSupport ? supportNav.filter((item) => item.mobileMore) : []),
    [isSupport]
  );
  const moreActive = mobileMoreItems.some((item) => isNavActive(location.pathname, item.to));

  const supportLabel = userLabels[0]?.name || 'Support';
  const currentLabel = isAdmin ? 'Admin' : isSopPreparer ? 'SOP Preparer' : supportLabel;
  const formatDateLabel = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };
  const cohortOptions = sortByText(cohorts, (cohort) => cohort.name).map((cohort) => ({
    value: cohort.id,
    label: cohort.name,
    meta: cohort.startDate && cohort.endDate
      ? `${formatDateLabel(cohort.startDate)} to ${formatDateLabel(cohort.endDate)}`
      : 'No dates set',
  }));

  return (
    <div className="app-shell-bg min-h-screen text-gray-900">
      <PWAUpdateBanner />
      {!tourBusy && showPrompt && <NotificationPromptModal onEnable={enable} onDismiss={dismiss} />}
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
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate(isSupport ? '/support' : '/dashboard')}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(isSupport ? '/support' : '/dashboard'); } }}
            className="flex items-center gap-3 text-left cursor-pointer"
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-orange-600 text-lg font-bold text-white shadow-lg shadow-orange-200">
              F
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">FOF IKD Ops</p>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); window.location.reload(); }}
                className="text-xs text-gray-400 hover:text-primary transition-colors"
              >
                ↻ Refresh
              </button>
            </div>
          </div>
        </div>

        <nav data-wt="app-nav" className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
          {isSupport ? (
            <div className="space-y-2">
              {navItems.map((item) => (
                <NavItemLink
                  key={item.to}
                  item={item}
                  active={isNavActive(location.pathname, item.to)}
                  globalPendingCount={globalPendingChanges.length}
                  newResourceCount={newResourceCount}
                  hasNewHubActivity={hasNewHubActivity}
                />
              ))}
            </div>
          ) : navGroups.map((group) => (
            <NavGroupSection
              key={group.label}
              group={group}
              open={isNavGroupOpen(group.label)}
              onToggle={() => toggleNavGroup(group.label)}
              locationPathname={location.pathname}
              globalPendingCount={globalPendingChanges.length}
              newResourceCount={newResourceCount}
              hasNewHubActivity={hasNewHubActivity}
            />
          ))}
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
              <button
                type="button"
                onClick={() => { window.location.reload(); setOpen(false); }}
                className="text-xs text-gray-400 hover:text-primary transition-colors"
              >
                ↻ Refresh
              </button>
            </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-gray-400 hover:bg-orange-50 hover:text-gray-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {cohortOptions.length > 0 && (
                <div className="mb-4 rounded-3xl border border-orange-100 bg-orange-50/45 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Active Cohort</p>
                  <AppSelect
                    value={activeCohort?.id || ''}
                    onChange={(cohortId) => {
                      void setActiveCohort(cohortId);
                      setOpen(false);
                    }}
                    options={cohortOptions}
                    placeholder="Choose cohort"
                    compact
                  />
                </div>
              )}
              {isSupport ? (
                <div className="space-y-2">
                  {navItems.map((item) => (
                    <NavItemLink
                      key={item.to}
                      item={item}
                      active={isNavActive(location.pathname, item.to)}
                      globalPendingCount={globalPendingChanges.length}
                      newResourceCount={newResourceCount}
                      onClick={() => setOpen(false)}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {navGroups.map((group) => (
                    <NavGroupSection
                      key={group.label}
                      group={group}
                      open={isNavGroupOpen(group.label)}
                      onToggle={() => toggleNavGroup(group.label)}
                      locationPathname={location.pathname}
                      globalPendingCount={globalPendingChanges.length}
                      newResourceCount={newResourceCount}
                      onItemClick={() => setOpen(false)}
                    />
                  ))}
                </div>
              )}
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
                {activeCohort && (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                    {activeCohort.name}
                  </span>
                )}
              </div>
            </div>

            {/* Bell is visible at every width — Support users are mobile-heavy
                and rely on this in-app feed when push doesn't reach them. */}
            <NotificationBell />

            <div className="hidden items-center gap-3 sm:flex">
              {cohortOptions.length > 0 && (
                <div className="w-64">
                  <AppSelect
                    value={activeCohort?.id || ''}
                    onChange={(cohortId) => {
                      void setActiveCohort(cohortId);
                    }}
                    options={cohortOptions}
                    placeholder="Choose cohort"
                    compact
                  />
                </div>
              )}
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
          {/* Route-level boundary: a single page crash shows a contained error
              (nav/shell survive) and auto-recovers when the route changes. */}
          <ErrorBoundary inline resetKey={location.pathname}>
            {!isSupport && (
              <SectionTabs pathname={location.pathname} isAdmin={isAdmin} pendingApprovals={globalPendingChanges.length} />
            )}
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Blocks the app until a reset password is replaced by the person's own. */}
        <ForcePasswordChangeModal />
      </div>

      <nav data-wt="app-nav" className={isSupport
        ? 'fixed bottom-4 left-1/2 z-30 w-[calc(100%-24px)] max-w-[400px] -translate-x-1/2 rounded-[22px] border border-[#eef0f4] bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(17,24,39,0.28)] lg:hidden'
        : 'fixed inset-x-0 bottom-0 z-30 border-t border-orange-100 bg-white/95 px-2 py-2 backdrop-blur lg:hidden'}
      >
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(mobileNavItems.length + (mobileMoreItems.length > 0 ? 1 : 0), 1), 5)}, minmax(0, 1fr))` }}>
          {mobileNavItems.map((item) => {
            const active = isNavActive(location.pathname, item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={isSupport
                  ? `relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold tracking-tight ${active ? 'bg-primary text-white' : 'text-gray-500'}`
                  : `relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium ${active ? 'bg-orange-50 text-primary' : 'text-gray-500'}`}
              >
                {item.icon}
                <span className="truncate">{item.mobileLabel ?? item.label}</span>
                {item.to === '/schedule' && globalPendingChanges.length > 0 && (
                  <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-primary" />
                )}
                {item.to.includes('hub') && hasNewHubActivity && (
                  <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </NavLink>
            );
          })}
          {mobileMoreItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-expanded={moreOpen}
              className={`relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold tracking-tight ${moreActive || moreOpen ? 'bg-[#fff8f3] text-[#c2410c]' : 'text-gray-500'}`}
            >
              {ICONS.more}
              <span className="truncate">More</span>
              {hasNewHubActivity && (
                <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          )}
        </div>
      </nav>

      {moreOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 cursor-default" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute bottom-[92px] flex w-[168px] flex-col gap-0.5 rounded-2xl border border-[#eef0f4] bg-white p-1.5 shadow-[0_18px_40px_-18px_rgba(17,24,39,0.3)]"
            style={{ right: 'max(18px, calc(50% - 194px))' }}
          >
            {mobileMoreItems.map((item) => {
              const active = isNavActive(location.pathname, item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${active ? 'bg-[#fff8f3] text-[#c2410c]' : 'text-gray-800 hover:bg-gray-50'}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.to.includes('hub') && hasNewHubActivity && <NavDot />}
                </NavLink>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      <PWAInstallBanner />
      <NeedSupportButton />
    </div>
  );
};

export default AppShell;
