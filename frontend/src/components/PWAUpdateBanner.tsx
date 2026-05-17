import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const PWAUpdateBanner: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="bg-primary text-white rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <p className="text-sm font-medium">New version available</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={async () => { await updateServiceWorker(true); window.location.reload(); }}
            className="px-3 py-1 bg-white text-primary text-xs font-bold rounded-lg hover:bg-gray-100"
          >
            Refresh
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            className="p-1 text-white/70 hover:text-white"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAUpdateBanner;
