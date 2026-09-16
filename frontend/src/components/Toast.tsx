import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Small confirmation that something happened, for actions that save instantly
// (attendance marks, follow-up status changes). One toast at a time: a new one
// replaces the old, so rapid taps don't stack up.

type ToastTone = 'success' | 'error' | 'info';

interface ToastOptions {
  message: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="m5 13 4 4L19 7" />,
  error: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 8v5m0 3h.01" />,
  info: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 16v-4m0-4h.01" />,
};

const ICON_TONE: Record<ToastTone, string> = {
  success: 'bg-emerald-400/20 text-emerald-300',
  error: 'bg-red-400/20 text-red-300',
  info: 'bg-sky-400/20 text-sky-300',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | null>(null);

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) window.clearTimeout(timer.current);
    const id = Date.now();
    setToast({ ...options, id });
    const duration = options.durationMs ?? (options.onAction ? 5000 : 2600);
    timer.current = window.setTimeout(() => setToast((current) => (current?.id === id ? null : current)), duration);
  }, []);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const tone = toast?.tone ?? 'success';

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && createPortal(
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-[140] flex justify-center px-4 bottom-[calc(env(safe-area-inset-bottom,0px)+104px)] lg:bottom-8"
        >
          <div
            key={toast.id}
            className="fof-toast pointer-events-auto flex max-w-[420px] items-center gap-2.5 rounded-2xl bg-[#1f2430] py-2.5 pl-2.5 pr-3 text-[13.5px] font-medium text-white shadow-[0_18px_40px_-12px_rgba(15,23,42,0.45)]"
          >
            <span className={`grid h-6 w-6 flex-none place-items-center rounded-full ${ICON_TONE[tone]}`}>
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">{ICONS[tone]}</svg>
            </span>
            <span className="min-w-0">{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => { toast.onAction?.(); setToast(null); }}
                className="ml-1 flex-none rounded-lg px-2 py-1 text-[13px] font-bold text-[#ffb27d] hover:bg-white/10"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};
