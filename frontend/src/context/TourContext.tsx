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
  /** This launch was the person's first visit (the Welcome, or for those who skip it, the Start here hint): other "please do this" sheets wait for the next launch. */
  welcomedThisLaunch: boolean;
  /** A one-off hint (e.g. 'hint:admin-setup') the person has not dismissed yet; false while progress loads or after it failed. */
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
  // Whose progress `seen` holds, so a person switch never reads the previous person's.
  const [seenFor, setSeenFor] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);

  useEffect(() => {
    setSeen(null);
    setSeenFor(null);
    setProgressFailed(false);
    setActivePage(null);
    if (!ready) return;
    let cancelled = false;
    const owner = user?.id ?? null;
    tourProgressApi.getSeen()
      .then((keys) => { if (!cancelled) { setSeen(new Set(keys)); setSeenFor(owner); } })
      // If progress can't load, don't nag with the Welcome on every visit; "?" still works.
      .catch(() => { if (!cancelled) { setSeen(new Set([WELCOME_KEY])); setSeenFor(owner); setProgressFailed(true); } });
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

  const progressLoaded = !!seen && seenFor === (user?.id ?? null);
  const hintUnseen = useCallback((key: string) => progressLoaded && !progressFailed && !seen!.has(key), [progressLoaded, progressFailed, seen]);
  const dismissHint = useCallback((key: string) => markSeen(key), [markSeen]);

  const welcome = audience ? WELCOME[audience] : null;
  // Not over the Get the app page: one full-screen thing at a time. Full admins and supports get no Welcome or
  // auto-tour: their Home carries one "Start here" hint instead (StartHereHint), and every page keeps its "?" tour.
  // Team members and other staff roles, who land on other pages, keep the Welcome.
  const skipsWelcome = (user?.role === 'ADMIN' && !user.teamMember) || user?.role === 'SUPPORT';
  // Their first visit: the saved progress (theirs, loaded) has no Welcome yet.
  const firstVisit = ready && progressLoaded && !seen!.has(WELCOME_KEY);
  const welcomeOpen = firstVisit && !!welcome && !skipsWelcome && location.pathname !== '/me/setup';

  const startFromWelcome = useCallback(() => {
    if (!welcome) return;
    markSeen(WELCOME_KEY);
    if (location.pathname !== welcome.homePath) navigate(welcome.homePath);
    setActivePage(welcome.homeTour);
  }, [welcome, markSeen, location.pathname, navigate]);

  const busy = ready && (!progressLoaded || welcomeOpen || activePage !== null);
  const [welcomedLatch, setWelcomedLatch] = useState(false);
  useEffect(() => { if (welcomeOpen) setWelcomedLatch(true); }, [welcomeOpen]);
  // Someone who skips the Welcome still has a first visit: it counts the same way (so the Get the app sheet waits
  // for the next launch, and their Start here hint shows) and the Welcome is recorded as seen, so the next
  // launch is not a first visit again. Counted in the same render, not after an effect, so nothing slips in.
  const firstVisitNoWelcome = firstVisit && skipsWelcome;
  useEffect(() => {
    if (!firstVisitNoWelcome) return;
    setWelcomedLatch(true);
    markSeen(WELCOME_KEY);
  }, [firstVisitNoWelcome, markSeen]);
  // Another person signing in on this tab has not seen a Welcome yet.
  useEffect(() => { setWelcomedLatch(false); }, [user?.id]);
  const welcomedThisLaunch = welcomedLatch || firstVisitNoWelcome;

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
