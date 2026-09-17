import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WelcomeContent } from '../../constants/tours';

// First-login welcome, in the spirit of Apple's "What's New" sheet: app icon,
// a centred title, a short feature list with accent icons and one clear action.
// Bottom sheet on phones, centred card on desktop.

interface WelcomeModalProps {
  content: WelcomeContent;
  onStart: () => void;
  onSkip: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ content, onStart, onSkip }) => {
  const startRef = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState(false);

  const close = (how: 'start' | 'skip') => {
    if (leaving) return;
    setLeaving(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => (how === 'start' ? onStart() : onSkip()), reduce ? 0 : 200);
  };

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => startRef.current?.focus({ preventScroll: true }), 80);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close('skip'); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      className={`fixed inset-0 z-[210] flex items-end justify-center sm:items-center sm:p-6 ${leaving ? 'fof-fade-out' : 'fof-fade-in'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fof-welcome-title"
      data-testid="welcome-modal"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />

      <div className={`relative flex max-h-[92vh] w-full flex-col rounded-t-[28px] bg-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.35)] sm:max-w-[460px] sm:rounded-[28px] ${leaving ? '' : 'fof-sheet-up'}`}>
        <div className="flex-1 overflow-y-auto px-8 pb-4 pt-10 sm:px-10 sm:pt-12">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-[18px] bg-primary text-[28px] font-bold text-white shadow-[0_8px_20px_-8px_rgb(var(--color-primary-rgb)/0.7)]" aria-hidden="true">
            F
          </div>

          <h2 id="fof-welcome-title" className="mt-6 text-balance text-center text-[30px] font-bold leading-[1.1] tracking-[-0.022em] text-gray-900 sm:text-[32px]">
            {content.title}
          </h2>
          <p className="mx-auto mt-2.5 max-w-[320px] text-center text-[15px] leading-snug text-gray-500">
            {content.subtitle}
          </p>

          <ul className="mt-9 space-y-6">
            {content.tiles.map((tile) => (
              <li key={tile.title} className="flex items-start gap-4">
                <svg className="mt-0.5 h-8 w-8 flex-none text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" d={tile.icon} />
                </svg>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-snug text-gray-900">{tile.title}</p>
                  <p className="mt-0.5 text-[15px] leading-snug text-gray-500">{tile.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-10 sm:pb-9">
          <button
            ref={startRef}
            type="button"
            onClick={() => close('start')}
            className="h-[50px] w-full rounded-[14px] bg-primary text-[16px] font-semibold text-white transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 active:scale-[0.99]"
          >
            Show me around
          </button>
          <button
            type="button"
            onClick={() => close('skip')}
            className="mt-2 h-11 w-full rounded-[14px] text-[15px] font-medium text-primary transition hover:bg-gray-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default WelcomeModal;
