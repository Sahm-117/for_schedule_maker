import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

const PWAInstallBanner: React.FC = () => {
  const { canInstall, install, dismiss, isIOSDevice } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Install FOF Ops</p>
            {isIOSDevice ? (
              <p className="text-xs text-gray-500 mt-0.5">
                Tap <strong>Share</strong> <span className="inline-block">⎙</span> then <strong>Add to Home Screen</strong>
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-0.5">Add to your home screen for the best experience</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isIOSDevice && (
              <button
                onClick={install}
                className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-dark"
              >
                Install
              </button>
            )}
            <button
              onClick={dismiss}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallBanner;
