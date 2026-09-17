import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Opening a page from the nav used to keep the scroll position of the page you
 * left, so a long list dropped you halfway down the new screen. Every route
 * change now starts at the top.
 *
 * The one exception is a link that names a section (`/supports#cover`): that
 * navigation is asking for a specific part of the page, and the page scrolls
 * itself there. Query-string changes (tab switches, filters) are not route
 * changes for this purpose — they keep you where you are.
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
