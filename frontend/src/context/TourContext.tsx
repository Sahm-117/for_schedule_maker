import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  /** This launch showed the Welcome, or a newcomer's Start here hint for the first time: other "please do this" sheets wait for the next launch. */
  welcomedThisLaunch: boolean;
  /** A Start here hint is due: the person skips the Welcome, never had it, and has not tapped Got it on this hint. */
  newcomerHint: (key: string) => boolean;
  /** Called when a Start here hint renders; the first time, it makes this a welcome launch. */
  hintFirstShown: (key: string) => void;
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

  // This person's saved tour progress: null while loading. Keys look like 'welcome:v2', 'page:support:home' or
  // 'hint:admin-setup'. `owner` keeps a person switch on a shared device from ever reading the previous person's;
  // `failed`: it could not load, so the Welcome and one-off hints stay away rather than nag.
  const [progress, setProgress] = useState<{ owner: string | null; keys: Set<string>; failed: boolean } | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  // Keys marked before this person's progress has loaded, folded in when it arrives (the server write may land after the read).
  const pendingKeys = useRef<Set<string>>(new Set());
  const ownerRef = useRef<string | null>(null);
  ownerRef.current = user?.id ?? null;

  useEffect(() => {
    setProgress(null);
    setActivePage(null);
    pendingKeys.current = new Set();
    if (!ready) return;
    let cancelled = false;
    const owner = user?.id ?? null;
    tourProgressApi.getSeen()
      .then((keys) => { if (!cancelled) setProgress({ owner, keys: new Set([...keys, ...pendingKeys.current]), failed: false }); })
      // If progress can't load, don't nag with the Welcome on every visit; "?" still works.
      .catch(() => { if (!cancelled) setProgress({ owner, keys: new Set([WELCOME_KEY, ...pendingKeys.current]), failed: true }); });
    return () => { cancelled = true; };
  }, [ready, user?.id]);

  const seen = progress && progress.owner === (user?.id ?? null) ? progress.keys : null;
  const progressFailed = !!progress?.failed;

  const markSeen = useCallback((key: string) => {
    // Only into this person's progress; before it has loaded (or while the previous person's is still held) keep it for later.
    setProgress((prev) => {
      if (prev && prev.owner === ownerRef.current) return { ...prev, keys: new Set(prev.keys).add(key) };
      pendingKeys.current.add(key);
      return prev;
    });
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
  // Not over the Get the app page: one full-screen thing at a time. Full admins and supports get no Welcome or
  // auto-tour: their Home carries one "Start here" hint instead (StartHereHint), and every page keeps its "?" tour.
  // Team members and other staff roles, who land on other pages, keep the Welcome.
  const skipsWelcome = (user?.role === 'ADMIN' && !user.teamMember) || user?.role === 'SUPPORT';
  const welcomeOpen = ready && !!seen && !seen.has(WELCOME_KEY) && !!welcome && !skipsWelcome && location.pathname !== '/me/setup';
  // Whether a Start here hint is due: the person skips the Welcome, never had it (so people already using the app
  // never see one), and has not tapped Got it on this hint. Each hint has its own key, so one role's does not end another's.
  const newcomerHint = useCallback(
    (key: string) => ready && !!seen && !progressFailed && skipsWelcome && !seen.has(WELCOME_KEY) && !seen.has(key),
    [ready, seen, progressFailed, skipsWelcome],
  );

  const startFromWelcome = useCallback(() => {
    if (!welcome) return;
    markSeen(WELCOME_KEY);
    if (location.pathname !== welcome.homePath) navigate(welcome.homePath);
    setActivePage(welcome.homeTour);
  }, [welcome, markSeen, location.pathname, navigate]);

  const busy = ready && (!seen || welcomeOpen || activePage !== null);
  // A launch with the Welcome, or the launch where a newcomer's hint first appears, is a welcome launch: the Get the app
  // sheet waits for the next one (one ask at a time). Later launches with the hint still up do not hold it back.
  const [welcomedLatch, setWelcomedLatch] = useState(false);
  useEffect(() => { if (welcomeOpen) setWelcomedLatch(true); }, [welcomeOpen]);
  // Another person signing in on this tab has not been welcomed yet.
  useEffect(() => { setWelcomedLatch(false); }, [user?.id]);
  const hintFirstShown = useCallback((key: string) => {
    if (seen?.has(`${key}:shown`)) return;
    setWelcomedLatch(true);
    markSeen(`${key}:shown`);
  }, [seen, markSeen]);
  const welcomedThisLaunch = welcomedLatch;

  const value = useMemo<TourContextValue>(
    () => ({ audience, busy, welcomedThisLaunch, newcomerHint, hintFirstShown, hintUnseen, dismissHint, hasTour, hasSeen, startTour }),
    [audience, busy, welcomedThisLaunch, newcomerHint, hintFirstShown, hintUnseen, dismissHint, hasTour, hasSeen, startTour],
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
