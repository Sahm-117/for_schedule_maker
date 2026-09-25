import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ParticipantAppProvider, useParticipantApp } from '../../context/ParticipantAppContext';
import { ToastProvider } from '../Toast';
import ErrorBoundary from '../ErrorBoundary';
import CheckInModal from './CheckInModal';
import ClassFeedbackModal from './ClassFeedbackModal';
import DepartmentPromptModal from './DepartmentPromptModal';
import { shouldAskCheckIn } from '../../utils/participantApp';
import { useTourState } from '../../context/TourContext';
import { useParticipantPush } from '../../hooks/useParticipantPush';
import NotificationPromptModal from '../NotificationPromptModal';
import NotificationBlockedModal from '../NotificationBlockedModal';
import ParticipantNotificationBell from './ParticipantNotificationBell';

// Layout for the participant app: sidebar on desktop, floating bar on mobile, the
// same look as the support app. Also asks "are you okay?" when their attendance
// calls for it.

const Icon: React.FC<{ d: string }> = ({ d }) => (
  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={d} />
  </svg>
);

interface NavEntry { to: string; label: string; icon: string; mobileLabel?: string; exact?: boolean; faith?: boolean }

const NAV: NavEntry[] = [
  { to: '/me', label: 'Home', icon: 'M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-18v7h6V2h-6z', exact: true },
  { to: '/me/group', label: 'My Group', icon: 'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20m5-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 9v-1a3 3 0 0 0-2.2-2.9M16.5 5.2a3 3 0 0 1 0 5.6' },
  { to: '/me/journey', label: 'My Journey', mobileLabel: 'Journey', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { to: '/me/faith', label: 'Faith Project', mobileLabel: 'F. Project', icon: 'M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10Z', faith: true },
];

// Under "More" on mobile; listed after the main items on desktop.
const MORE: NavEntry[] = [
  { to: '/me/people', label: 'People', icon: 'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20m5-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 9v-1a3 3 0 0 0-2.2-2.9M16.5 5.2a3 3 0 0 1 0 5.6' },
  { to: '/me/resources', label: 'Resources', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z' },
  { to: '/me/feedback', label: 'Feedback', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { to: '/me/profile', label: 'Profile', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
];

const Dot: React.FC = () => <span className="h-2 w-2 flex-none rounded-full bg-red-500" aria-label="New reply" />;

const isActive = (pathname: string, to: string, exact?: boolean) =>
  exact ? pathname === to : to === '/me/journey'
    ? pathname === to || pathname.startsWith('/me/journey/') || pathname.startsWith('/me/week/')
    : pathname === to || pathname.startsWith(`${to}/`);

const LATER_KEY = 'fof_checkin_later';
const lagosDateKey = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);

// Owned by ShellLayout so the notification prompt can wait until the check-in is done.
const useCheckInState = () => {
  const { home } = useParticipantApp();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(LATER_KEY) === lagosDateKey(); } catch { return false; }
  });
  const decision = useMemo(() => (home ? shouldAskCheckIn(home, new Date()) : null), [home]);
  const later = () => {
    try { localStorage.setItem(LATER_KEY, lagosDateKey()); } catch { /* ignore */ }
    setDismissed(true);
  };
  // Still loading, or a check-in is due and not yet answered or put off.
  const pending = !home || (!!decision?.ask && !dismissed);
  return { decision, dismissed, later, pending };
};

const CheckInPrompt: React.FC<{ checkIn: ReturnType<typeof useCheckInState> }> = ({ checkIn }) => {
  const { home, applyCheckIn } = useParticipantApp();
  // Waits for the Welcome + Home tour on first sign-in.
  const { busy: tourBusy } = useTourState();
  const { decision, dismissed, later } = checkIn;
  if (tourBusy || !home || !decision?.ask || dismissed) return null;

  return (
    <CheckInModal
      home={home}
      misses={{ sunday: decision.misses.sunday, meeting: decision.misses.meeting }}
      onAnswered={(response) => {
        applyCheckIn({ response, sundayMisses: decision.misses.sunday, meetingMisses: decision.misses.meeting, createdAt: new Date().toISOString() });
      }}
      onLater={later}
    />
  );
};

// "Not now" on the class feedback / department prompts lasts for this app
// session only, same as the notification prompt (useParticipantPush).
const useSessionDismiss = (key: string) => {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
  });
  const dismiss = () => {
    try { sessionStorage.setItem(key, '1'); } catch { /* private browsing etc. */ }
    setDismissed(true);
  };
  return { dismissed, dismiss };
};

const ShellLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const { home, reload } = useParticipantApp();
  const faithUnread = !!home?.faithUnread;
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { showPrompt, showBlocked, enable, dismiss, dismissBlocked } = useParticipantPush();
  // Waits for the Welcome + Home tour on first sign-in, same as CheckInPrompt.
  const { busy: tourBusy } = useTourState();
  const checkIn = useCheckInState();
  // Order: check-in, then class feedback, then the department prompt, then notifications.
  const classFeedbackDismiss = useSessionDismiss('fof_classfeedback_dismissed_session');
  const departmentDismiss = useSessionDismiss('fof_department_dismissed_session');
  const classFeedbackPending = !tourBusy && !checkIn.pending && !!home?.classFeedbackDue?.open && !classFeedbackDismiss.dismissed;
  const departmentPending = !tourBusy && !checkIn.pending && !classFeedbackPending && !!home?.departmentPromptDue && !departmentDismiss.dismissed;
  const notifReady = !tourBusy && !checkIn.pending && !classFeedbackPending && !departmentPending;

  if (!user) return null;
  if (user.mustChangePassword) return <Navigate to="/me/welcome" replace />;

  return (
    <div className="app-shell-bg min-h-screen text-gray-900">
      {/* The update prompt is mounted once, app-wide, in App.tsx. */}

      <aside className="surface-card fixed inset-y-4 left-4 z-30 hidden w-72 flex-col overflow-hidden lg:flex">
        <div className="border-b border-orange-100 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-orange-600 text-lg font-bold text-white shadow-lg shadow-orange-200">F</div>
            <div>
              <p className="text-base font-bold text-gray-900">FOF</p>
              <p className="text-xs text-gray-400">Participant</p>
            </div>
          </div>
        </div>
        <nav data-wt="app-nav" className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
          {[...NAV, ...MORE].map((item) => {
            const active = isActive(location.pathname, item.to, item.exact);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${active ? 'bg-primary text-white shadow-md shadow-orange-200' : 'text-gray-600 hover:bg-orange-50 hover:text-gray-900'}`}
              >
                <Icon d={item.icon} />
                <span className="flex-1">{item.label}</span>
                {item.faith && faithUnread && <Dot />}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-orange-100 px-4 py-4">
          <div className="surface-muted flex items-center gap-3 px-4 py-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-sm font-bold text-primary">{user.name.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">Participant</p>
            </div>
            <button type="button" onClick={logout} className="rounded-xl border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-white">
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[19rem]">
        <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-orange-100 px-2.5 py-1 font-semibold text-orange-700">Participant</span>
                {user.cohortName && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">{user.cohortName}</span>}
              </div>
            </div>
            <ParticipantNotificationBell />
            <button type="button" onClick={logout} className="hidden rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-orange-50 sm:block lg:hidden">
              Logout
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-8">
          <ErrorBoundary inline resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <nav data-wt="app-nav" className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-24px)] max-w-[400px] -translate-x-1/2 rounded-[22px] border border-[#eef0f4] bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(17,24,39,0.28)] lg:hidden">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${NAV.length + 1}, minmax(0, 1fr))` }}>
          {NAV.map((item) => {
            const active = isActive(location.pathname, item.to, item.exact);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold tracking-tight ${active ? 'bg-primary text-white' : 'text-gray-500'}`}
              >
                <Icon d={item.icon} />
                <span className="truncate">{item.mobileLabel ?? item.label}</span>
                {item.faith && faithUnread && <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-red-500" aria-label="New reply" />}
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            className={`relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-[10px] font-semibold tracking-tight ${moreOpen || MORE.some((item) => isActive(location.pathname, item.to)) ? 'bg-[#fff8f3] text-[#c2410c]' : 'text-gray-500'}`}
          >
            <svg className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path d="M4.25 10a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm7 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm7 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" /></svg>
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>
      {moreOpen && createPortal(
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 cursor-default" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-[92px] flex w-[168px] flex-col gap-0.5 rounded-2xl border border-[#eef0f4] bg-white p-1.5 shadow-[0_18px_40px_-18px_rgba(17,24,39,0.3)]" style={{ right: 'max(18px, calc(50% - 194px))' }}>
            {MORE.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold ${isActive(location.pathname, item.to) ? 'bg-[#fff8f3] text-[#c2410c]' : 'text-gray-800 hover:bg-gray-50'}`}
              >
                <Icon d={item.icon} />
                {item.label}
              </NavLink>
            ))}
            <button type="button" onClick={() => { setMoreOpen(false); logout(); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-gray-800 hover:bg-gray-50">
              <Icon d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
              Sign out
            </button>
          </div>
        </div>,
        document.body,
      )}

      <CheckInPrompt checkIn={checkIn} />
      {classFeedbackPending && home?.classFeedbackDue && (
        <ClassFeedbackModal
          weekId={home.classFeedbackDue.weekId}
          weekNumber={home.classFeedbackDue.weekNumber}
          onAnswered={() => { classFeedbackDismiss.dismiss(); void reload(); }}
          onLater={classFeedbackDismiss.dismiss}
        />
      )}
      {departmentPending && home && (
        <DepartmentPromptModal
          participantName={home.participant.name}
          onAnswered={() => { departmentDismiss.dismiss(); void reload(); }}
          onLater={departmentDismiss.dismiss}
        />
      )}
      {notifReady && showPrompt && <NotificationPromptModal onEnable={enable} onDismiss={dismiss} />}
      {notifReady && showBlocked && <NotificationBlockedModal onDismiss={dismissBlocked} />}
    </div>
  );
};

const ParticipantShell: React.FC = () => (
  <ParticipantAppProvider>
    <ToastProvider>
      <ShellLayout />
    </ToastProvider>
  </ParticipantAppProvider>
);

export default ParticipantShell;
