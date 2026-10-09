import { useEffect, useRef } from 'react';

// One shared way to poll, so many open tabs don't hammer a small database:
//  - nothing runs while the tab is hidden;
//  - when the tab comes back and a poll is overdue, it runs once (after a short random delay);
//  - a poll is skipped while the previous one is still running;
//  - each wait is jittered, so people who opened the app at the same moment drift apart.

interface PollingOptions {
  /** How far each wait may stray from the interval, as a fraction (0.2 = ±20%). */
  jitter?: number;
  /** Run once when the tab returns to view after a missed poll. Turn off if the caller already refreshes on visibility. */
  catchUp?: boolean;
}

export const jittered = (ms: number, jitter = 0.2) => Math.max(250, Math.round(ms * (1 + (Math.random() * 2 - 1) * jitter)));

/**
 * Start polling and return the function that stops it. For code that already lives inside an
 * effect (a channel set-up, say); everywhere else use `usePolling`.
 */
export const startPolling = (fn: () => unknown, intervalMs: number, options: PollingOptions = {}): (() => void) => {
  const { jitter = 0.2, catchUp = true } = options;
  let stopped = false;
  let inFlight = false;
  let lastRun = Date.now();
  let timer: number | undefined;
  let catchUpTimer: number | undefined;

  const run = async () => {
    if (inFlight || stopped) return;
    inFlight = true;
    lastRun = Date.now();
    try { await fn(); } catch { /* the caller decides what a failed poll means */ } finally { inFlight = false; }
  };
  const schedule = () => {
    timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void run();
      schedule();
    }, jittered(intervalMs, jitter));
  };
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || !catchUp) return;
    if (Date.now() - lastRun < intervalMs) return;
    window.clearTimeout(catchUpTimer);
    catchUpTimer = window.setTimeout(() => { void run(); }, Math.round(Math.random() * 1500));
  };

  schedule();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.clearTimeout(catchUpTimer);
    document.removeEventListener('visibilitychange', onVisible);
  };
};

/** Call `fn` every `intervalMs` while the tab is visible. Pass `null` to switch polling off. */
export const usePolling = (fn: () => unknown, intervalMs: number | null, options: PollingOptions = {}) => {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const { jitter, catchUp } = options;

  useEffect(() => {
    if (intervalMs == null) return undefined;
    return startPolling(() => fnRef.current(), intervalMs, { jitter, catchUp });
  }, [intervalMs, jitter, catchUp]);
};
