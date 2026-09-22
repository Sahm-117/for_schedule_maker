import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Opening a page from the nav used to keep the scroll position of the page you
 * left, so a long list dropped you halfway down the new screen. Every route
 * change now starts at the top.
 *
 * Routes may opt into a named section by handling their own hash after load.
 * Query-string changes (tab switches, filters) are not route changes for this
 * purpose — they keep you where you are.
 */
const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
