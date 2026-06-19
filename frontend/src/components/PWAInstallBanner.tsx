import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

const APP_NAME = 'FOF IKD Ops';
const APP_SHORT_NAME = 'FOF Ops';
const APP_ICON_SRC = '/icon-192.png';

const PWAInstallBanner: React.FC = () => {
  const { canInstall, install, dismiss, isIOSDevice, isAndroidDevice, isInstalling, isStandalone, hasNativePrompt } = usePWAInstall();

  if (!canInstall || isStandalone) return null;

  const isTopInfobar = isAndroidDevice && !isIOSDevice;

  return (
    <div className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 ${isTopInfobar ? 'top-3' : 'bottom-20 px-4 lg:bottom-6'}`}>
      <div className={`pointer-events-auto w-full overflow-hidden border bg-white ring-1 ring-black/5 ${isTopInfobar ? 'max-w-xl rounded-[20px] border-slate-200 shadow-[0_18px_40px_rgba(15,23,42,0.18)]' : 'max-w-md rounded-[28px] border-orange-100 shadow-[0_24px_70px_rgba(15,23,42,0.18)]'}`}>
        <div className={`flex gap-3 ${isTopInfobar ? 'items-center px-3 py-3' : 'items-start px-4 py-4'}`}>
          <div className={`grid flex-shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-orange-100 ${isTopInfobar ? 'h-10 w-10 rounded-xl' : 'h-12 w-12 rounded-2xl'}`}>
            <img src={APP_ICON_SRC} alt="" className="h-full w-full object-cover" />
          </div>

          <div className="min-w-0 flex-1">
            {isTopInfobar ? (
              <p className="truncate text-lg font-semibold text-gray-950">Install {APP_SHORT_NAME}</p>
            ) : (
              <>
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  {isIOSDevice ? 'Install app' : `Install ${APP_SHORT_NAME}`}
                </p>
                <p className="mt-1 truncate text-xl font-semibold text-gray-950">{APP_NAME}</p>
              </>
            )}

            {isIOSDevice ? (
              <p className="mt-3 text-sm leading-5 text-gray-600">
                Tap <span className="font-semibold text-gray-900">Share</span> then <span className="font-semibold text-gray-900">Add to Home Screen</span>.
              </p>
            ) : isTopInfobar && !hasNativePrompt ? (
              <p className="mt-2 text-sm leading-5 text-gray-600">
                Open the browser menu and tap <span className="font-semibold text-gray-900">Install app</span> or <span className="font-semibold text-gray-900">Add to Home screen</span>.
              </p>
            ) : !isTopInfobar ? (
              <p className="mt-3 text-sm leading-5 text-gray-600">
                Install the app for a faster, full-screen experience and easier access from your home screen.
              </p>
            ) : null
            }

            {isTopInfobar && (
              <div className="mt-2 flex items-center justify-end gap-2">
                {hasNativePrompt ? (
                  <button
                    type="button"
                    onClick={() => { void install(); }}
                    disabled={isInstalling}
                    className="rounded-full px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isInstalling ? 'Opening...' : 'Install'}
                  </button>
                ) : (
                  <span className="rounded-full bg-orange-50 px-3 py-1.5 text-sm font-semibold text-primary">
                    Use browser menu
                  </span>
                )}
              </div>
            )}

            <div className={`${isTopInfobar ? 'hidden' : 'mt-4 flex items-center justify-end gap-3'}`}>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full px-3 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              >
                {isIOSDevice ? 'Dismiss' : 'Cancel'}
              </button>
              {!isIOSDevice && (
                <button
                  type="button"
                  onClick={() => { void install(); }}
                  disabled={isInstalling}
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isInstalling ? 'Opening…' : 'Install'}
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Dismiss install prompt"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallBanner;
