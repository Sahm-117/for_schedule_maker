import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

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

    const checkForUpdates = () => {
      void registration.update().catch(() => {
        // Best-effort only. If the browser declines the check, keep the app usable.
      });
    };

    const intervalId = window.setInterval(checkForUpdates, 60_000);
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
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [registration]);

  // No "Refresh" bar: a new version applies itself. To never reload under
  // someone mid-tap or mid-typing, it waits for a natural break — the next
  // page change, or the app going to the background — then reloads.
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
