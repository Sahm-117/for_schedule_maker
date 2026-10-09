import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { participantAppApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { usePolling } from '../hooks/usePolling';
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
  /** Put a just-asked manual question into that week without a refetch. */
  applyManualQuestion: (weekId: number, question: import('../types').ParticipantManualQuestion) => void;
  /** Put a just-saved manual note into that week without a refetch. */
  applyManualNote: (weekId: number, body: string) => void;
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

  // Several things can ask for a reload at once (coming back to the tab, the poll, a save).
  // `loadSeq` makes the newest request win, and `mutationSeq` drops a response that started
  // before a local save so it can't wipe what was just saved. Background polls never replace
  // the page with an error once something has loaded: they keep the last good data.
  const homeRef = useRef<ParticipantHome | null>(null);
  homeRef.current = home;
  const loadSeq = useRef(0);
  const mutationSeq = useRef(0);
  const inFlight = useRef(0);
  const lastStartedAt = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++loadSeq.current;
    const mutationAtStart = mutationSeq.current;
    inFlight.current += 1;
    lastStartedAt.current = Date.now();
    try {
      const next = await participantAppApi.getHome();
      if (seq === loadSeq.current && mutationAtStart === mutationSeq.current) {
        setHome(next);
        setError('');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'SESSION_EXPIRED') { logout(); return; }
      if (seq === loadSeq.current && !homeRef.current) setError(message || 'Could not load your FOF space. Please try again.');
    } finally {
      inFlight.current -= 1;
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reload();
    // Coming back to the tab refreshes straight away, unless a load has only just started
    // (focus and visibility changes can fire together).
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastStartedAt.current > 5000) void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // Keep the page live: every 20s while a Sunday register is open or the group meeting is on
  // (countdown, being marked, "Now praying for"), otherwise once a minute so the "meeting is
  // on now" banner is never long stale. Only while the tab is in view, and never stacked.
  const pollEvery = home?.openWindow || home?.groupMeetingLive ? 20000 : 60000;
  usePolling(() => { if (inFlight.current === 0) return reload(); }, pollEvery, { catchUp: false });

  const applyReflection = (reflection: ParticipantReflection) => {
    mutationSeq.current += 1;
    setHome((prev) => prev && ({
      ...prev,
      reflections: [...prev.reflections.filter((r) => r.weekId !== reflection.weekId), reflection],
    }));
  };

  const applyCheckIn = (checkIn: NonNullable<ParticipantHome['lastCheckIn']>) => {
    mutationSeq.current += 1;
    setHome((prev) => prev && ({ ...prev, lastCheckIn: checkIn }));
  };

  const applyManualQuestion = (weekId: number, question: import('../types').ParticipantManualQuestion) => {
    mutationSeq.current += 1;
    setHome((prev) => prev && ({
      ...prev,
      weeks: prev.weeks.map((w) => (w.id === weekId ? { ...w, manualQuestions: [...w.manualQuestions, question] } : w)),
    }));
  };

  const applyManualNote = (weekId: number, body: string) => {
    mutationSeq.current += 1;
    setHome((prev) => prev && ({
      ...prev,
      weeks: prev.weeks.map((w) => (w.id === weekId ? { ...w, manualNote: body } : w)),
    }));
  };

  return (
    <ParticipantAppContext.Provider value={{ home, loading, error, reload, applyReflection, applyCheckIn, applyManualQuestion, applyManualNote }}>
      {children}
    </ParticipantAppContext.Provider>
  );
};
