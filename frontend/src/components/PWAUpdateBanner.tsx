import React, { useEffect, useState } from 'react';

const PWAUpdateBanner: React.FC = () => {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      // Check for an already-waiting worker on load
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
          }
        });
      });
    });
  }, []);

  const applyUpdate = () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    waitingWorker.addEventListener('statechange', () => {
      if (waitingWorker.state === 'activated') window.location.reload();
    });
    // Fallback reload
    setTimeout(() => window.location.reload(), 1000);
  };

  if (!waitingWorker) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="bg-primary text-white rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <p className="text-sm font-medium">New version available</p>
        </div>
        <button
          onClick={applyUpdate}
          className="flex-shrink-0 px-3 py-1 bg-white text-primary text-xs font-bold rounded-lg hover:bg-gray-100"
        >
          Refresh
        </button>
      </div>
    </div>
  );
};

export default PWAUpdateBanner;
