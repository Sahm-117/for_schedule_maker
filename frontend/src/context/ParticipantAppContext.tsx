import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { participantAppApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { ParticipantHome, ParticipantReflection } from '../types';

// The signed-in participant's data, loaded once for the whole participant app and
// refreshed when they come back to the tab.

interface ParticipantAppContextValue {
  home: ParticipantHome | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  /** Put a just-saved reflection into the loaded data without a refetch. */
  applyReflection: (reflection: ParticipantReflection) => void;
  applyCheckIn: (checkIn: NonNullable<ParticipantHome['lastCheckIn']>) => void;
}

const ParticipantAppContext = createContext<ParticipantAppContextValue | undefined>(undefined);

export const useParticipantApp = () => {
  const context = useContext(ParticipantAppContext);
  if (!context) throw new Error('useParticipantApp must be used within ParticipantAppProvider');
  return context;
};

export const ParticipantAppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useAuth();
  const [home, setHome] = useState<ParticipantHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setHome(await participantAppApi.getHome());
      setError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'SESSION_EXPIRED') { logout(); return; }
      setError(message || 'Could not load your FOF space. Please try again.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reload();
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // While a Sunday register is open, poll so the countdown/status stays live
  // and catches the close (or being marked) without needing a manual refresh.
  useEffect(() => {
    if (!home?.openWindow) return undefined;
    const timer = window.setInterval(() => { void reload(); }, 20000);
    return () => window.clearInterval(timer);
  }, [home?.openWindow, reload]);

  // Unconditional slow poll so groupMeetingLive (the "your group meeting is
  // on now" banner + nav dot) goes stale at most a minute behind, even if the
  // tab is left open in the foreground without a visibilitychange.
  useEffect(() => {
    const timer = window.setInterval(() => { void reload(); }, 60000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const applyReflection = (reflection: ParticipantReflection) => {
    setHome((prev) => prev && ({
      ...prev,
      reflections: [...prev.reflections.filter((r) => r.weekId !== reflection.weekId), reflection],
    }));
  };

  const applyCheckIn = (checkIn: NonNullable<ParticipantHome['lastCheckIn']>) => {
    setHome((prev) => prev && ({ ...prev, lastCheckIn: checkIn }));
  };

  return (
    <ParticipantAppContext.Provider value={{ home, loading, error, reload, applyReflection, applyCheckIn }}>
      {children}
    </ParticipantAppContext.Provider>
  );
};
