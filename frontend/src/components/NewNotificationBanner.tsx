import React from 'react';
import { useAppData } from '../context/AppDataContext';

// Shown when a notification arrives live. Pages load their own data, so the
// simplest reliable way to catch up is a full refresh, offered not forced.
const NewNotificationBanner: React.FC = () => {
  const { liveNotificationTitle, dismissLiveNotification } = useAppData();

  if (!liveNotificationTitle) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto" role="status">
      <div className="bg-primary text-white rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          <p className="truncate text-sm font-medium">{liveNotificationTitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-white text-primary text-xs font-bold rounded-lg hover:bg-gray-100"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={dismissLiveNotification}
            aria-label="Dismiss"
            className="text-white/80 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewNotificationBanner;
