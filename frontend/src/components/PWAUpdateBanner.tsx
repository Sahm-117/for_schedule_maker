import React, { useEffect, useState } from 'react';
import { startPolling } from '../hooks/usePolling';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

// An update found this soon after the app opens (or comes back to the front) is applied straight away, so the first
// screen people see after a release is the new one, with no hard refresh needed.
const FRESH_OPEN_MS = 20_000;
let wokeAt = Date.now();
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wokeAt = Date.now(); });
}
const isTyping = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

const PWAUpdateBanner: React.FC = () => {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered: (workerRegistration) => {
      setRegistration(workerRegistration ?? null);
    },
  });

  useEffect(() => {
    if (!registration) return undefined;

    // Focus and visibilitychange fire together on return; one check is enough.
    let lastCheck = 0;
    const checkForUpdates = () => {
      if (Date.now() - lastCheck < 10_000) return;
      lastCheck = Date.now();
      void registration.update().catch(() => {
        // Best-effort only. If the browser declines the check, keep the app usable.
      });
    };

    const stopPolling = startPolling(checkForUpdates, 120_000, { sundaySlow: true });
    const handleFocus = () => checkForUpdates();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Trigger one immediate check after registration is known.
    checkForUpdates();

    return () => {
      stopPolling();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [registration]);

  // No "Refresh" bar: a new version applies itself. Found within moments of opening (or returning to) the app, it
  // applies at once. Otherwise, to never reload under someone mid-tap or mid-typing, it waits for a natural break —
  // the next page change, or the app going to the background — then reloads.
  const { pathname } = useLocation();
  const [seenPath, setSeenPath] = useState(pathname);
  useEffect(() => {
    if (!needRefresh) return undefined;
    let applied = false;
    const apply = async () => {
      if (applied) return;
      applied = true;
      await updateServiceWorker(true);
      window.location.reload();
    };
    if (document.visibilityState === 'hidden') { void apply(); return undefined; }
    // Just opened or just back in the app, and not mid-typing: show the new version now rather than after a page change.
    if (Date.now() - wokeAt < FRESH_OPEN_MS && !isTyping()) { void apply(); return undefined; }
    const handleHidden = () => { if (document.visibilityState === 'hidden') void apply(); };
    document.addEventListener('visibilitychange', handleHidden);
    return () => document.removeEventListener('visibilitychange', handleHidden);
  }, [needRefresh, updateServiceWorker]);

  useEffect(() => {
    if (pathname === seenPath) return;
    setSeenPath(pathname);
    if (needRefresh) {
      void updateServiceWorker(true).then(() => window.location.reload());
    }
  }, [pathname, seenPath, needRefresh, updateServiceWorker]);

  return null;
};

export default PWAUpdateBanner;
