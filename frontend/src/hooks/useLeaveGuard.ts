import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Asks once before the participant leaves a page (in-app links, the page's back
// link, and the phone/browser back button). The app uses BrowserRouter, which
// has no built-in blocker, so:
//  - in-app links and [data-back-link] buttons are caught on click, and
//  - the back button is caught with one extra history entry flagged `fofGuard`:
//    pressing back pops it, we ask, and "leave" steps back past the real entry.
// It only asks once per visit; after that, leaving is free.
type Pending = { kind: 'link'; to: string } | { kind: 'back' } | { kind: 'history' };

export const useLeaveGuard = (active: boolean, fallbackTo: string) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [asking, setAsking] = useState(false);
  const pending = useRef<Pending | null>(null);
  const asked = useRef(false);
  // True while our extra history entry sits on top of this page's real one.
  const guardEntry = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const shouldAsk = () => activeRef.current && !asked.current;
  const ask = (p: Pending) => { asked.current = true; pending.current = p; setAsking(true); };

  // Add the extra entry once per page (not again if we landed back on one).
  useEffect(() => {
    asked.current = false;
    const state = window.history.state as { fofGuard?: boolean } | null;
    if (state?.fofGuard) { guardEntry.current = true; return; }
    if (!active) return;
    window.history.pushState({ ...(state ?? {}), fofGuard: true }, '', window.location.href);
    guardEntry.current = true;
  }, [active, location.pathname]);

  useEffect(() => {
    const onPop = () => {
      if (!guardEntry.current) return;
      guardEntry.current = false;
      // Back popped our extra entry: ask, or keep going to where they meant.
      if (shouldAsk()) ask({ kind: 'history' });
      else window.history.back();
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || !shouldAsk()) {
        // Page back link with our extra entry still on top: step past both.
        if (target?.closest('[data-back-link]') && guardEntry.current) {
          e.preventDefault(); e.stopPropagation();
          guardEntry.current = false;
          window.history.go(-2);
        }
        return;
      }
      if (target.closest('[data-back-link]')) {
        e.preventDefault(); e.stopPropagation();
        ask({ kind: 'back' });
        return;
      }
      const link = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank') return;
      const href = link.getAttribute('href') ?? '';
      if (!href.startsWith('/') || href === window.location.pathname) return;
      e.preventDefault(); e.stopPropagation();
      ask({ kind: 'link', to: href });
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  /** "Stay": close the sheet. Leaving later is free (we only ask once). */
  const stay = useCallback(() => { setAsking(false); pending.current = null; }, []);

  /** "Leave": carry on to wherever they were going. */
  const leave = useCallback(() => {
    const p = pending.current;
    setAsking(false);
    pending.current = null;
    if (!p) return;
    if (p.kind === 'link') { navigate(p.to); return; }
    if (p.kind === 'history') { window.history.back(); return; }
    // The page back link: past our extra entry if it's still there.
    if (guardEntry.current) { guardEntry.current = false; window.history.go(-2); return; }
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1); else navigate(fallbackTo);
  }, [navigate, fallbackTo]);

  return { asking, stay, leave };
};
