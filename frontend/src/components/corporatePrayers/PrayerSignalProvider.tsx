import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prayerSlotApi } from '../../services/api';
import type { PrayerSignal } from '../../types';
import { usePolling } from '../../hooks/usePolling';
import { useAuth } from '../../hooks/useAuth';
import { PrayerSignalContext } from '../../hooks/usePrayerSignal';
import LivePrayerPopup from './LivePrayerPopup';
import DailyPrayerTakeover from './DailyPrayerTakeover';

// One minute-by-minute check for the whole signed-in app. It is a single tiny call (visible tabs only, jittered, never
// stacked: FLOW_MAP rule 51), read by the Home card and the two prayer screens (live and daily), so it is one poll however many
// places show it.

// A support working in Practice passes the Practice cohort, so they receive Practice prayers there.
const PrayerSignalProvider: React.FC<{ audience: 'participant' | 'staff'; cohortId?: string | null; children: React.ReactNode }> = ({ audience, cohortId = null, children }) => {
  const { user } = useAuth();
  const [signal, setSignal] = useState<PrayerSignal | null>(null);
  // Admins who do not also support are not counted in prayers, so they are not asked.
  const roles = (user?.roles ?? []) as string[];
  const enabled = audience === 'participant' || (!!user && (user.role === 'SUPPORT' || roles.includes('SUPPORT')));

  // Answers can arrive out of order, or from a check that started before the person tapped Amen. The newest one wins, and
  // anything that began before "answered" is ignored so the pop-up cannot flicker back.
  const issued = useRef(0);
  const applied = useRef(0);
  const ignoreUpTo = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++issued.current;
    try {
      const next = await prayerSlotApi.signal(cohortId);
      if (mine <= ignoreUpTo.current || mine < applied.current) return;
      applied.current = mine;
      setSignal(next);
    } catch { /* keep the last answer; the next check tries again */ }
  }, [cohortId]);

  useEffect(() => { if (enabled) void refresh(); }, [enabled, refresh]);
  // Never slowed on Sunday mornings (rule 124): this check opens the "prayer is live" pop-up.
  usePolling(refresh, enabled ? 60000 : null);

  const markAnswered = useCallback(() => {
    ignoreUpTo.current = issued.current;
    setSignal((prev) => (prev && prev.open ? { ...prev, open: { ...prev.open, checkedIn: true, amen: true } } : prev));
  }, []);

  // A prayer someone asked to open (Home card or push). The screens draw themselves over everything.
  const [started, setStarted] = useState<string | null>(null);
  const start = useCallback((sessionId: string) => { setStarted(sessionId); void refresh(); }, [refresh]);
  const clearStarted = useCallback(() => setStarted(null), []);
  const [liveActive, setLiveActive] = useState(false);

  const value = useMemo(() => ({ signal, refresh, markAnswered, start, started, clearStarted, liveActive, setLiveActive }),
    [signal, refresh, markAnswered, start, started, clearStarted, liveActive]);
  return (
    <PrayerSignalContext.Provider value={value}>
      {children}
      {enabled && <LivePrayerPopup />}
      {enabled && <DailyPrayerTakeover />}
    </PrayerSignalContext.Provider>
  );
};

export default PrayerSignalProvider;
