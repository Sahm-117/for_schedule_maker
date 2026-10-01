import { useCallback, useEffect, useRef, useState } from 'react';
import { practiceApi } from '../services/api';
import type { PracticePulse } from '../types';

const POLL_MS = 4000;
// While Practice is off and the person is not in it, a slower check is plenty.
const IDLE_POLL_MS = 20000;

// Asks the database one tiny question every few seconds while the app is on
// screen: what is my cohort list, am I in Practice, is anyone asking me to
// practise, who am I walking through with. When the cohort list changes
// (Test mode switched on or off) it tells the caller, so the cohort menu
// updates by itself with no reload.
export const usePracticePulse = (enabled: boolean, onCohortKeyChange: () => void) => {
  const [pulse, setPulse] = useState<PracticePulse | null>(null);
  const lastKey = useRef<string | null>(null);
  const onChange = useRef(onCohortKeyChange);
  onChange.current = onCohortKeyChange;
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const next = await practiceApi.pulse();
      if (lastKey.current !== null && lastKey.current !== next.cohortKey) onChange.current();
      lastKey.current = next.cohortKey;
      // Keep the same object when nothing changed, so nothing re-renders for nothing.
      setPulse((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    } catch { /* offline or signed out: try again on the next beat */ }
    finally { busy.current = false; }
  }, []);

  const idle = !pulse || (!pulse.member && !pulse.on);
  useEffect(() => {
    if (!enabled) { setPulse(null); lastKey.current = null; return undefined; }
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, idle ? IDLE_POLL_MS : POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, refresh, idle]);

  return { pulse, refresh };
};
