import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { tourProgressApi } from '../services/api';
import { PAGE_TOURS, WELCOME, WELCOME_KEY, pageTourKey, tourAudienceFor, type TourAudience } from '../constants/tours';
import WelcomeModal from '../components/tour/WelcomeModal';
import TourSpotlight from '../components/tour/TourSpotlight';

// V2 welcome + per-page product tours. Loads which tours this person has seen
// (saved per account), shows the Welcome modal once, and runs a page's tour when
// its "?" is tapped. Other first-login popups wait on `busy`.

interface TourContextValue {
  audience: TourAudience | null;
  /** True while progress loads, the Welcome modal is open or a tour is running. */
  busy: boolean;
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
  const [activePage, setActivePage] = useState<string | null>(null);

  useEffect(() => {
    setSeen(null);
    setActivePage(null);
    if (!ready) return;
    let cancelled = false;
    tourProgressApi.getSeen()
      .then((keys) => { if (!cancelled) setSeen(new Set(keys)); })
      // If progress can't load, don't nag with the Welcome on every visit; "?" still works.
      .catch(() => { if (!cancelled) setSeen(new Set([WELCOME_KEY])); });
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

  const welcome = audience ? WELCOME[audience] : null;
  const welcomeOpen = ready && !!seen && !seen.has(WELCOME_KEY) && !!welcome;

  const startFromWelcome = useCallback(() => {
    if (!welcome) return;
    markSeen(WELCOME_KEY);
    if (location.pathname !== welcome.homePath) navigate(welcome.homePath);
    setActivePage(welcome.homeTour);
  }, [welcome, markSeen, location.pathname, navigate]);

  const busy = ready && (seen === null || welcomeOpen || activePage !== null);

  const value = useMemo<TourContextValue>(
    () => ({ audience, busy, hasTour, hasSeen, startTour }),
    [audience, busy, hasTour, hasSeen, startTour],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {welcomeOpen && welcome && (
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
