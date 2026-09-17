import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TourStep } from '../../constants/tours';

// Spotlight product tour: dims and softly blurs the page, cuts a glowing hole
// around each step's element and glides it between steps. The card sits beside
// the element on desktop and docks as a bottom sheet on phones. Steps whose
// element is not on screen show as a centred card instead.

interface TourSpotlightProps {
  steps: TourStep[];
  onClose: () => void;
}

interface Box { top: number; left: number; width: number; height: number }

const PAD = 8;
const RADIUS = 18;
const GAP = 16;
const MOBILE_MAX = 640;
const FIND_TIMEOUT_MS = 1800;

const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => window.innerWidth < MOBILE_MAX;

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
};

// Fixed things (menus, bottom bars) are already on screen; scrolling the page won't move them.
const isPinned = (el: HTMLElement) => {
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    if (window.getComputedStyle(node).position === 'fixed') return true;
  }
  return false;
};

const findTarget = (selector?: string): HTMLElement | null => {
  if (!selector) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return all.find(isVisible) ?? null;
};

const roundedRectPath = (b: Box) => {
  const r = Math.max(0, Math.min(RADIUS, b.width / 2, b.height / 2));
  const x = b.left; const y = b.top; const w = b.width; const h = b.height;
  return `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
};

const TourSpotlight: React.FC<TourSpotlightProps> = ({ steps, onClose }) => {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [searching, setSearching] = useState(true);
  const [hole, setHole] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [cardPos, setCardPos] = useState<React.CSSProperties>({ opacity: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  // Optional steps whose element never showed up are skipped and left out of the count.
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  const direction = useRef<1 | -1>(1);
  const [sheetAtTop, setSheetAtTop] = useState(false);

  const step = steps[index];
  const mobile = viewport.w < MOBILE_MAX;
  const remainingAfter = steps.slice(index + 1).some((_, i) => !skipped.has(index + 1 + i));
  const isLast = !remainingAfter;
  const shownTotal = steps.length - skipped.size;
  const shownIndex = index - Array.from(skipped).filter((i) => i < index).length;

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, reduceMotion() ? 0 : 200);
  }, [closing, onClose]);

  const next = useCallback(() => {
    if (isLast) { close(); return; }
    direction.current = 1;
    setIndex((i) => i + 1);
  }, [isLast, close]);
  const back = useCallback(() => {
    direction.current = -1;
    setIndex((i) => {
      let j = i - 1;
      while (j > 0 && skipped.has(j)) j -= 1;
      return Math.max(0, j);
    });
  }, [skipped]);

  // Find this step's element (pages may still be loading), then bring it into view.
  useEffect(() => {
    let timer = 0;
    const startedAt = Date.now();
    setSearching(true);
    const look = () => {
      const el = findTarget(step?.target);
      if (!el && step?.target && Date.now() - startedAt < FIND_TIMEOUT_MS) {
        timer = window.setTimeout(look, 100);
        return;
      }
      if (!el && step?.optional) {
        setSkipped((prev) => new Set(prev).add(index));
        const nextIndex = index + direction.current;
        if (nextIndex >= steps.length) { onClose(); return; }
        if (nextIndex < 0) { direction.current = 1; setIndex(index + 1); return; }
        setIndex(nextIndex);
        return;
      }
      if (el) {
        const r = el.getBoundingClientRect();
        const sheet = isMobile() ? (cardRef.current?.offsetHeight ?? 240) + 28 : 0;
        const topLimit = 84;
        const bottomLimit = window.innerHeight - sheet - 16;
        const fits = isPinned(el) || (r.top >= topLimit && r.bottom <= bottomLimit);
        if (!fits) {
          const room = bottomLimit - topLimit;
          const offset = r.height < room ? topLimit + (room - r.height) / 2 : topLimit;
          window.scrollTo({ top: Math.max(0, r.top + window.scrollY - offset), behavior: reduceMotion() ? 'auto' : 'smooth' });
        }
      }
      setTarget(el);
      setSearching(false);
    };
    look();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Keep the hole glued to the element while the page scrolls or resizes.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      if (!target || !target.isConnected) { setHole(null); return; }
      const r = target.getBoundingClientRect();
      setHole({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const ro = typeof ResizeObserver !== 'undefined' && target ? new ResizeObserver(schedule) : null;
    if (ro && target) ro.observe(target);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
    };
  }, [target]);

  // Place the card next to the hole (desktop) or dock it (phone).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || searching) return;
    if (mobile) {
      // Dock at the top when the highlight sits where the sheet would cover it (e.g. the bottom menu).
      // Whichever position covers less of the highlight.
      const ch = card.offsetHeight;
      const coverBottom = hole ? Math.max(0, hole.top + hole.height - (viewport.h - ch - 24)) : 0;
      const coverTop = hole ? Math.max(0, ch + 24 - hole.top) : 0;
      setSheetAtTop(coverBottom > coverTop);
      setCardPos({ opacity: 1 });
      return;
    }
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const vw = viewport.w;
    const vh = viewport.h;
    const clampX = (x: number) => Math.max(16, Math.min(x, vw - cw - 16));
    const clampY = (y: number) => Math.max(16, Math.min(y, vh - ch - 16));
    if (!hole) {
      setCardPos({ left: (vw - cw) / 2, top: (vh - ch) / 2, opacity: 1 });
      return;
    }
    const cx = hole.left + hole.width / 2;
    const cy = hole.top + hole.height / 2;
    if (hole.top + hole.height + GAP + ch <= vh - 16) {
      setCardPos({ left: clampX(cx - cw / 2), top: hole.top + hole.height + GAP, opacity: 1 });
    } else if (hole.top - GAP - ch >= 16) {
      setCardPos({ left: clampX(cx - cw / 2), top: hole.top - GAP - ch, opacity: 1 });
    } else if (hole.left + hole.width + GAP + cw <= vw - 16) {
      setCardPos({ left: hole.left + hole.width + GAP, top: clampY(cy - ch / 2), opacity: 1 });
    } else if (hole.left - GAP - cw >= 16) {
      setCardPos({ left: hole.left - GAP - cw, top: clampY(cy - ch / 2), opacity: 1 });
    } else {
      // Element fills the screen: float the card in the lower corner over it.
      setCardPos({ left: vw - cw - 24, top: vh - ch - 24, opacity: 1 });
    }
  }, [hole, viewport, mobile, searching, index]);

  // Keyboard: Esc skips, arrows move, Tab stays inside the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
      if (e.key === 'Tab' && cardRef.current) {
        const focusables = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!cardRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, next, back]);

  useEffect(() => {
    if (searching) return;
    cardRef.current?.querySelector<HTMLButtonElement>('[data-tour-primary]')?.focus({ preventScroll: true });
  }, [searching, index]);

  if (!step) return null;

  // With no element, collapse the hole to a point in the middle so the dim still glides.
  const shown: Box = hole ?? { top: viewport.h / 2, left: viewport.w / 2, width: 0, height: 0 };
  const clipPath = `path(evenodd, 'M0 0 H${viewport.w} V${viewport.h} H0 Z ${roundedRectPath(shown)}')`;
  const glide = 'top 420ms cubic-bezier(0.22,1,0.36,1), left 420ms cubic-bezier(0.22,1,0.36,1), width 420ms cubic-bezier(0.22,1,0.36,1), height 420ms cubic-bezier(0.22,1,0.36,1)';

  return createPortal(
    <div
      className={`fixed inset-0 z-[220] ${closing ? 'fof-fade-out' : 'fof-fade-in'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fof-tour-title"
      data-testid="tour-spotlight"
    >
      {/* Soft blur outside the hole */}
      <div
        className="absolute inset-0 backdrop-blur-[2px] motion-safe:transition-[clip-path] motion-safe:duration-[420ms]"
        style={{ clipPath, WebkitClipPath: clipPath }}
        aria-hidden="true"
      />
      {/* The dim + glowing hole. Clicks on the backdrop do nothing, so no accidental skips. */}
      <div className="absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute"
        style={{
          top: shown.top,
          left: shown.left,
          width: shown.width,
          height: shown.height,
          borderRadius: RADIUS,
          boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
          transition: reduceMotion() ? 'none' : glide,
        }}
        aria-hidden="true"
      >
        {hole && (
          <span
            key={index}
            className="fof-tour-ring absolute inset-0 rounded-[18px]"
            style={{ boxShadow: '0 0 0 2px rgba(255,255,255,0.95), 0 0 0 6px rgb(var(--color-primary-rgb) / 0.45), 0 0 40px 6px rgb(var(--color-primary-rgb) / 0.35)' }}
          />
        )}
      </div>

      {/* Card */}
      <div
        ref={cardRef}
        className={mobile
          ? `fof-sheet-up fixed inset-x-3 rounded-[26px] bg-white p-5 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.5)] ${sheetAtTop ? 'top-3' : 'bottom-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]'}`
          : 'fixed w-[360px] rounded-[26px] bg-white p-6 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.5),0_2px_8px_-2px_rgba(15,23,42,0.12)]'}
        style={mobile
          ? { opacity: searching ? 0 : 1, transition: 'opacity 200ms' }
          : { ...cardPos, ...(searching ? { opacity: 0 } : null), transition: reduceMotion() ? 'opacity 150ms' : 'top 420ms cubic-bezier(0.22,1,0.36,1), left 420ms cubic-bezier(0.22,1,0.36,1), opacity 200ms' }}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-primary">
            {shownIndex + 1} of {shownTotal}
          </span>
          <div className="flex flex-1 items-center gap-1" aria-hidden="true">
            {steps.map((_, i) => (skipped.has(i) ? null : (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-primary' : i < index ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-gray-200'}`}
              />
            )))}
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            Skip tour
          </button>
        </div>

        <div key={index} className="fof-step-in">
          <h3 id="fof-tour-title" className="mt-4 text-[18px] font-bold leading-snug tracking-tight text-gray-900">{step.title}</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">{step.body}</p>
        </div>

        <div className="mt-5 flex items-center gap-2">
          {shownIndex > 0 && (
            <button
              type="button"
              onClick={back}
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            >
              Back
            </button>
          )}
          <button
            type="button"
            data-tour-primary
            onClick={next}
            className="group ml-auto inline-flex items-center gap-1.5 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgb(var(--color-primary-rgb)/0.9)] transition hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 active:scale-[0.98]"
          >
            {isLast ? 'Done' : 'Next'}
            {isLast ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="m5 13 4 4L19 7" /></svg>
            ) : (
              <svg className="h-4 w-4 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M5 12h14m-6-6 6 6-6 6" /></svg>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TourSpotlight;
