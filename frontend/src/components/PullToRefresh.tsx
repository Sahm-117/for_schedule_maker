import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isInStandaloneMode } from '../hooks/usePWAInstall';

/**
 * Pull-to-refresh for the installed app (home-screen PWA only — a normal
 * browser tab keeps its own). Mounted once in App, so it covers every page.
 *
 *   tiny pull  → springs back, nothing happens
 *   short pull → let go: 3-second countdown with Cancel, then refresh
 *   long pull  → let go: refresh straight away
 *
 * Only starts when the page is at the very top and the finger isn't inside a
 * pop-up, slide-over or a scrolled inner list. The pulled-down area is painted
 * in the user's accent colour; text flips dark/white (and the colour deepens
 * if needed) so it always reaches 4.5:1 contrast. Refreshing also switches to
 * a waiting new app version if there is one — the update banner stays as is.
 */

const T1 = 70;           // countdown point (px pulled)
const T2 = 200;          // instant point
const MAX = 230;
const RESISTANCE = 0.5;  // finger travel → pull distance
const HOLD_COUNTDOWN = 124;
const HOLD_REFRESHING = 76;
const COUNTDOWN_MS = 3000;
const CIRC = 113.1;      // 2π × r(18)

type Phase = 'idle' | 'pulling' | 'counting' | 'refreshing';
type RGB = [number, number, number];

const DARK: RGB = [17, 24, 39];
const LIGHT: RGB = [255, 255, 255];

const luminance = (rgb: RGB) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const readAccent = (): RGB => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-rgb').trim();
  const parts = raw.split(/[\s,]+/).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? (parts as RGB) : [255, 145, 77];
};

/** Pale tint on a small pull, full accent from the countdown point on — with readable text on top. */
const paint = (accent: RGB, pull: number) => {
  const mix = 0.18 + 0.82 * Math.min(1, Math.max(0, pull / T1));
  let bg = accent.map((c) => Math.round(c * mix + 255 * (1 - mix))) as RGB;
  while (Math.max(contrast(LIGHT, bg), contrast(DARK, bg)) < 4.5) {
    bg = bg.map((c) => Math.round(c * 0.95)) as RGB;
  }
  const on = contrast(LIGHT, bg) >= contrast(DARK, bg) ? LIGHT : DARK;
  return { background: `rgb(${bg.join(' ')})`, color: `rgb(${on.join(' ')})` };
};

/** True when the touch started somewhere a pull-down shouldn't hijack. */
const isBlockedTarget = (target: EventTarget | null) => {
  if (window.scrollY > 0 || document.body.style.overflow === 'hidden') return true;
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (style.position === 'fixed') return true; // pop-ups, slide-overs, bottom nav
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
};

const refreshApp = async () => {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (reg?.waiting) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    window.setTimeout(() => window.location.reload(), 3000); // fallback if the switch stalls
    return;
  }
  window.location.reload();
};

const Bolt = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" />
  </svg>
);

const PullToRefresh: React.FC = () => {
  const [enabled] = useState(() => typeof window !== 'undefined' && isInStandaloneMode());
  const [phase, setPhase] = useState<Phase>('idle');
  const [pull, setPull] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(3);
  const [ringLeft, setRingLeft] = useState(1);

  const phaseRef = useRef<Phase>('idle');
  const pullRef = useRef(0);
  const startY = useRef<number | null>(null);
  const accent = useRef<RGB>([255, 145, 77]);
  const rafRef = useRef<number | null>(null);

  const go = (next: Phase) => { phaseRef.current = next; setPhase(next); };
  const move = (px: number, withAnimation: boolean) => { pullRef.current = px; setAnimate(withAnimation); setPull(px); };

  const startRefresh = () => {
    go('refreshing');
    move(HOLD_REFRESHING, true);
    void refreshApp();
  };

  const startCountdown = () => {
    go('counting');
    move(HOLD_COUNTDOWN, true);
    const t0 = performance.now();
    const tick = () => {
      if (phaseRef.current !== 'counting') return;
      const left = Math.max(0, COUNTDOWN_MS - (performance.now() - t0));
      setRingLeft(left / COUNTDOWN_MS);
      setSecondsLeft(Math.ceil(left / 1000));
      if (left <= 0) { startRefresh(); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const cancelCountdown = () => {
    if (phaseRef.current !== 'counting') return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    go('idle');
    move(0, true);
  };

  useEffect(() => {
    if (!enabled) return undefined;

    const onStart = (e: TouchEvent) => {
      if (phaseRef.current !== 'idle' || e.touches.length !== 1 || isBlockedTarget(e.target)) return;
      startY.current = e.touches[0].clientY;
      accent.current = readAccent();
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (phaseRef.current === 'idle') {
        if (dy <= 0 || window.scrollY > 0) { startY.current = null; return; } // scrolling up, not a pull
        go('pulling');
      }
      if (phaseRef.current !== 'pulling') return;
      e.preventDefault(); // stop the page bouncing while we pull
      move(Math.min(MAX, Math.max(0, dy * RESISTANCE)), false);
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (phaseRef.current !== 'pulling') return;
      const px = pullRef.current;
      if (px >= T2) startRefresh();
      else if (px >= T1) startCountdown();
      else { go('idle'); move(0, true); }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // Handlers only touch refs and state setters, so binding them once is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  if (!enabled || (phase === 'idle' && pull === 0)) return null;

  const colours = paint(accent.current, phase === 'pulling' ? pull : T1);
  const easing = animate ? 'height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none';

  let ringOffset = CIRC;
  let centre: React.ReactNode = null;
  let label = 'Keep pulling';
  if (phase === 'pulling') {
    if (pull >= T2) { ringOffset = 0; centre = <Bolt />; label = 'Let go to refresh now'; }
    else if (pull >= T1) { ringOffset = 0; centre = '3'; label = 'Let go to refresh in 3s'; }
    else ringOffset = CIRC * (1 - pull / T1);
  } else if (phase === 'counting') {
    ringOffset = CIRC * (1 - ringLeft);
    centre = secondsLeft || '';
    label = `Refreshing in ${secondsLeft}…`;
  } else if (phase === 'refreshing') {
    ringOffset = CIRC * 0.7;
    label = 'Refreshing…';
  }

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex items-end justify-center overflow-hidden shadow-[0_8px_24px_-12px_rgba(17,24,39,0.35)]"
      style={{ height: `calc(env(safe-area-inset-top, 0px) + ${pull}px)`, transition: easing, ...colours }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-1.5 pb-2.5">
        <div className="relative h-11 w-11">
          <svg
            viewBox="0 0 44 44"
            className={`h-11 w-11 -rotate-90 ${phase === 'refreshing' ? 'animate-spin' : ''}`}
            style={{ transition: 'none' }}
            aria-hidden="true"
          >
            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth="4" />
            <circle
              cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={ringOffset} style={{ transition: 'none' }}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-[17px] font-bold tabular-nums">{centre}</span>
        </div>
        <p className={`whitespace-nowrap text-[12.5px] ${pull >= T2 && phase === 'pulling' ? 'font-bold' : 'font-semibold'}`}>{label}</p>
        {phase === 'counting' && (
          <button
            type="button"
            onClick={cancelCountdown}
            className="pointer-events-auto mt-0.5 rounded-full bg-white px-4 py-1.5 text-[12.5px] font-semibold text-gray-900 shadow-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PullToRefresh;
