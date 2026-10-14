import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Opening a page from the nav used to keep the scroll position of the page you
 * left, so a long list dropped you halfway down the new screen. Every route
 * change now starts at the top.
 *
 * Going BACK (the phone's back, the browser's back, or a page's back link) is
 * different: it returns you to where you were on that page, not the top. The
 * position of the page you leave is remembered just before you leave it, and put
 * back once the page has loaded enough to reach it.
 *
 * Routes may opt into a named section by handling their own hash after load.
 * Query-string changes (tab switches, filters) are not route changes for this
 * purpose — they keep you where you are.
 */

// Where each visited history entry was scrolled to when it was left (by its router key).
const positions = new Map<string, number>();
const MAX_POSITIONS = 100;
const rememberPosition = (key: string, y: number) => {
  positions.delete(key);
  positions.set(key, y);
  // Keep only the most recent pages, so a long session does not grow this without end.
  while (positions.size > MAX_POSITIONS) positions.delete(positions.keys().next().value as string);
};

const ScrollToTop: React.FC = () => {
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();
  const keyRef = useRef(key);
  keyRef.current = key;

  // The browser restores scroll by itself too, and loses to async content: we do it instead.
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    try { window.history.scrollRestoration = 'manual'; } catch { /* not supported: ours still runs */ }
    return () => { try { window.history.scrollRestoration = previous; } catch { /* ignore */ } };
  }, []);

  // Remember the page being left, at the moment of leaving (before the next page replaces it).
  useEffect(() => {
    const remember = () => { rememberPosition(keyRef.current, window.scrollY); };
    const { pushState, replaceState } = window.history;
    window.history.pushState = function patchedPush(this: History, ...args: Parameters<History['pushState']>) { remember(); return pushState.apply(this, args); };
    window.history.replaceState = function patchedReplace(this: History, ...args: Parameters<History['replaceState']>) {
      // A replace on the same page (filters, tabs) is not leaving it, but the latest position is still right.
      remember();
      return replaceState.apply(this, args);
    };
    window.addEventListener('popstate', remember);
    return () => {
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
      window.removeEventListener('popstate', remember);
    };
  }, []);

  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    const pathChanged = previousPath.current !== pathname;
    previousPath.current = pathname;
    if (hash) return undefined;
    const saved = navigationType === 'POP' ? positions.get(key) : undefined;
    if (saved === undefined || saved <= 0) {
      // A new page (or the first load) starts at the top. Going back to a page that was at the top, or a
      // query-string-only step (tabs, filters), is left where it is.
      if (pathChanged) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return undefined;
    }

    // Back: return to the saved spot. The page may still be loading its list, so keep trying for a few
    // seconds until it is tall enough, and stop the moment the person scrolls themselves.
    let tries = 0;
    let timer: number | undefined;
    let stopped = false;
    const stop = () => { stopped = true; if (timer !== undefined) window.clearTimeout(timer); };
    const attempt = () => {
      if (stopped) return;
      window.scrollTo({ top: saved, left: 0, behavior: 'auto' });
      if (Math.abs(window.scrollY - saved) > 2 && tries < 50) {
        tries += 1;
        timer = window.setTimeout(attempt, 100);
      }
    };
    attempt();
    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    window.addEventListener('keydown', stop, { once: true });
    return () => {
      stop();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [key, pathname, hash, navigationType]);

  return null;
};

export default ScrollToTop;
