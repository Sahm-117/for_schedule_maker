import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface WalkthroughStep {
  targetSelector: string;
  title: string;
  body: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface WalkthroughPopupProps {
  steps: WalkthroughStep[];
  onDone: () => void;
  onSkip: () => void;
}

const arrowSize = 8;

const arrowStyles: Record<string, React.CSSProperties> = {
  top: { bottom: -arrowSize, left: '50%', marginLeft: -arrowSize, borderLeft: `${arrowSize}px solid transparent`, borderRight: `${arrowSize}px solid transparent`, borderTop: `${arrowSize}px solid white` },
  bottom: { top: -arrowSize, left: '50%', marginLeft: -arrowSize, borderLeft: `${arrowSize}px solid transparent`, borderRight: `${arrowSize}px solid transparent`, borderBottom: `${arrowSize}px solid white` },
  left: { right: -arrowSize, top: '50%', marginTop: -arrowSize, borderTop: `${arrowSize}px solid transparent`, borderBottom: `${arrowSize}px solid transparent`, borderLeft: `${arrowSize}px solid white` },
  right: { left: -arrowSize, top: '50%', marginTop: -arrowSize, borderTop: `${arrowSize}px solid transparent`, borderBottom: `${arrowSize}px solid transparent`, borderRight: `${arrowSize}px solid white` },
};

const WalkthroughPopup: React.FC<WalkthroughPopupProps> = ({ steps, onDone, onSkip }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  const step = steps[stepIndex];
  const position = step?.position || 'bottom';
  const isLast = stepIndex === steps.length - 1;

  const computePosition = () => {
    const target = document.querySelector(step.targetSelector);
    const popup = popupRef.current;
    if (!target || !popup) return;

    const targetRect = target.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const gap = 10;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left: number;
    let top: number;

    if (position === 'top') {
      left = targetRect.left + targetRect.width / 2 - popupRect.width / 2;
      top = targetRect.top - popupRect.height - gap;
    } else if (position === 'left') {
      left = targetRect.left - popupRect.width - gap;
      top = targetRect.top + targetRect.height / 2 - popupRect.height / 2;
    } else if (position === 'right') {
      left = targetRect.right + gap;
      top = targetRect.top + targetRect.height / 2 - popupRect.height / 2;
    } else {
      left = targetRect.left + targetRect.width / 2 - popupRect.width / 2;
      top = targetRect.bottom + gap;
    }

    // Keep within viewport
    left = Math.max(12, Math.min(left, viewportW - popupRect.width - 12));
    top = Math.max(12, Math.min(top, viewportH - popupRect.height - 12));

    setStyle({ position: 'fixed', left, top, visibility: 'visible' });
  };

  useEffect(() => {
    if (!step) return;
    const t = setTimeout(computePosition, 10);
    window.addEventListener('resize', computePosition);
    window.addEventListener('scroll', computePosition, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', computePosition);
      window.removeEventListener('scroll', computePosition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, stepIndex]);

  const handlePointerDown = (e: PointerEvent) => {
    if (popupRef.current?.contains(e.target as Node)) return;
    onSkip();
  };

  useEffect(() => {
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!step) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]" style={{ pointerEvents: 'none' }}>
      <div
        ref={popupRef}
        style={{ ...style, pointerEvents: 'auto' }}
        className="w-[320px] rounded-[24px] bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.2)]"
      >
        <div style={arrowStyles[position]} className="absolute h-0 w-0" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{stepIndex + 1} of {steps.length}</p>
        <p className="mt-2 text-[17px] font-bold leading-snug text-gray-900">{step.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.body}</p>
        <div className="mt-5 flex items-center justify-between border-t border-orange-100 pt-4">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-500 hover:bg-orange-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLast) {
                onDone();
              } else {
                setStepIndex((i) => i + 1);
              }
            }}
            className="rounded-2xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WalkthroughPopup;
