import { useCallback, useEffect, useRef, useState } from 'react';
import { practiceApi } from '../services/api';
import { startPolling } from './usePolling';
import type { PracticePulse } from '../types';

const POLL_MS = 4000;
// While Practice is off and the person is not in it, a slower check is plenty.
const IDLE_POLL_MS = 20000;
// Practice is on for everyone, but most supports are doing real work: they only need the
// fast beat while they are inside Practice or in a walkthrough. Otherwise this keeps the
// phone and the database quiet (and still catches a request within about twenty seconds).
const BACKGROUND_POLL_MS = 20000;

// Asks the database one tiny question every few seconds while the app is on
// screen: what is my cohort list, am I in Practice, is anyone asking me to
// practise, who am I walking through with. When the cohort list changes
// (Test mode switched on or off) it tells the caller, so the cohort menu
// updates by itself with no reload.
export const usePracticePulse = (enabled: boolean, onCohortKeyChange: () => void, inPractice = false) => {
  const [pulse, setPulse] = useState<PracticePulse | null>(null);
  const pulseRef = useRef<PracticePulse | null>(null);
  pulseRef.current = pulse;
  const lastKey = useRef<string | null>(null);
  const onChange = useRef(onCohortKeyChange);
  onChange.current = onCohortKeyChange;
  const busy = useRef(false);
  const queued = useRef(false);
  const activeRef = useRef(inPractice);
  activeRef.current = inPractice || !!pulseRef.current?.active || (pulseRef.current?.incoming?.length ?? 0) > 0;

  const refresh = useCallback(async (queueIfBusy = false): Promise<void> => {
    // A beat already on its way may predate whatever just changed: ask again right after it.
    if (busy.current) { if (queueIfBusy) queued.current = true; return; }
    busy.current = true;
    try {
      const next = await practiceApi.pulse(activeRef.current);
      if (lastKey.current !== null && lastKey.current !== next.cohortKey) onChange.current();
      lastKey.current = next.cohortKey;
      // Keep the same object when nothing changed, so nothing re-renders for nothing.
      setPulse((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    } catch { /* offline or signed out: try again on the next beat */ }
    finally {
      busy.current = false;
      if (queued.current) { queued.current = false; void refresh(); }
    }
  }, []);

  const idle = !pulse || (!pulse.member && !pulse.on);
  const fast = inPractice || !!pulse?.active || (pulse?.incoming?.length ?? 0) > 0;
  useEffect(() => {
    if (!enabled) { setPulse(null); lastKey.current = null; return undefined; }
    void refresh();
    const stopPolling = startPolling(() => refresh(), idle ? IDLE_POLL_MS : fast ? POLL_MS : BACKGROUND_POLL_MS, { catchUp: false });
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopPolling(); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, refresh, idle, fast]);

  // The returned refresh is the "something just changed" one: it is never skipped.
  const refreshNow = useCallback(() => refresh(true), [refresh]);
  return { pulse, refresh: refreshNow };
};
