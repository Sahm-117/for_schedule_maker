import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { tourProgressApi } from '../services/api';
import { PAGE_TOURS, WELCOME, WELCOME_KEY, pageTourKey, tourAudienceFor, type TourAudience } from '../constants/tours';
import WelcomeModal from '../components/tour/WelcomeModal';
import TourSpotlight from '../components/tour/TourSpotlight';
import WelcomeGuideModal from '../components/participantApp/WelcomeGuideModal';

// V2 welcome + per-page product tours. Loads which tours this person has seen
// (saved per account), shows the Welcome modal once, and runs a page's tour when
// its "?" is tapped. Other first-login popups wait on `busy`.

interface TourContextValue {
  audience: TourAudience | null;
  /** True while progress loads, the Welcome modal is open or a tour is running. */
  busy: boolean;
  /** The Welcome was shown in this launch: other "please do this" sheets wait for the next launch. */
  welcomedThisLaunch: boolean;
  /** A one-off hint (e.g. 'hint:admin-setup') the person has not dismissed yet; false while progress loads. */
  hintUnseen: (key: string) => boolean;
  /** Dismiss a one-off hint for good (saved per account, like tours). */
  dismissHint: (key: string) => void;
  hasTour: (pageId: string) => boolean;
  hasSeen: (pageId: string) => boolean;
  startTour: (pageId: string) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const audience = user ? tourAudienceFor(user.role) : null;
  const ready = !!user && !user.mustChangePassword;

  // null while loading. Keys look like 'welcome:v2' or 'page:support:home'.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  // Progress could not load: one-off hints stay hidden rather than nag someone who may have dismissed them.
  const [progressFailed, setProgressFailed] = useState(false);
  const [activePage, setActivePage] = useState<string | null>(null);

  useEffect(() => {
    setSeen(null);
    setProgressFailed(false);
    setActivePage(null);
    if (!ready) return;
    let cancelled = false;
    tourProgressApi.getSeen()
      .then((keys) => { if (!cancelled) setSeen(new Set(keys)); })
      // If progress can't load, don't nag with the Welcome on every visit; "?" still works.
      .catch(() => { if (!cancelled) { setSeen(new Set([WELCOME_KEY])); setProgressFailed(true); } });
    return () => { cancelled = true; };
  }, [ready, user?.id]);

  const markSeen = useCallback((key: string) => {
    setSeen((prev) => new Set(prev ?? []).add(key));
    tourProgressApi.markSeen(key).catch(() => { /* seen state is a nicety; never block on it */ });
  }, []);

  const hasTour = useCallback((pageId: string) => (PAGE_TOURS[pageId]?.length ?? 0) > 0, []);
  const hasSeen = useCallback((pageId: string) => !seen || seen.has(pageTourKey(pageId)), [seen]);
  const startTour = useCallback((pageId: string) => {
    if (PAGE_TOURS[pageId]?.length) setActivePage(pageId);
  }, []);

  const endTour = useCallback(() => {
    if (activePage) markSeen(pageTourKey(activePage));
    setActivePage(null);
  }, [activePage, markSeen]);

  const hintUnseen = useCallback((key: string) => !!seen && !progressFailed && !seen.has(key), [seen, progressFailed]);
  const dismissHint = useCallback((key: string) => markSeen(key), [markSeen]);

  const welcome = audience ? WELCOME[audience] : null;
  // Not over the Get the app page: one full-screen thing at a time. Full admins (not team members or other staff
  // roles, who land elsewhere) get no Welcome or auto-tour: the Dashboard's setup checklist carries one
  // "Start here" hint instead, and every page keeps its "?" tour.
  const skipsWelcome = user?.role === 'ADMIN' && !user.teamMember;
  const welcomeOpen = ready && !!seen && !seen.has(WELCOME_KEY) && !!welcome && !skipsWelcome && location.pathname !== '/me/setup';

  const startFromWelcome = useCallback(() => {
    if (!welcome) return;
    markSeen(WELCOME_KEY);
    if (location.pathname !== welcome.homePath) navigate(welcome.homePath);
    setActivePage(welcome.homeTour);
  }, [welcome, markSeen, location.pathname, navigate]);

  const busy = ready && (seen === null || welcomeOpen || activePage !== null);
  const [welcomedThisLaunch, setWelcomedThisLaunch] = useState(false);
  useEffect(() => { if (welcomeOpen) setWelcomedThisLaunch(true); }, [welcomeOpen]);
  // Another person signing in on this tab has not seen a Welcome yet.
  useEffect(() => { setWelcomedThisLaunch(false); }, [user?.id]);

  const value = useMemo<TourContextValue>(
    () => ({ audience, busy, welcomedThisLaunch, hintUnseen, dismissHint, hasTour, hasSeen, startTour }),
    [audience, busy, welcomedThisLaunch, hintUnseen, dismissHint, hasTour, hasSeen, startTour],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {/* Participants get the visual guide instead of the Welcome modal + Home tour. */}
      {welcomeOpen && audience === 'participant' && (
        <WelcomeGuideModal
          onClose={() => markSeen(WELCOME_KEY)}
          startAtTour={!!(location.state as { fromAppSetup?: boolean } | null)?.fromAppSetup}
        />
      )}
      {welcomeOpen && welcome && audience !== 'participant' && (
        <WelcomeModal
          content={welcome}
          onStart={startFromWelcome}
          onSkip={() => markSeen(WELCOME_KEY)}
        />
      )}
      {activePage && (
        <TourSpotlight key={activePage} steps={PAGE_TOURS[activePage]} onClose={endTour} />
      )}
    </TourContext.Provider>
  );
};

export const useTourState = (): TourContextValue => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTourState must be used within TourProvider');
  return ctx;
};
