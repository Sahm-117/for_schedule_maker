import { useCallback, useEffect, useState } from 'react';

const SKIP_ALL_KEY = 'fof_walkthrough_skip_all';
const PAGE_KEYS = ['fof_walkthrough_home', 'fof_walkthrough_schedule', 'fof_walkthrough_followups', 'fof_walkthrough_profile'];

const pageKey = (key: string) => `fof_walkthrough_${key}`;

export function isWalkthroughDismissed(): boolean {
  if (localStorage.getItem(SKIP_ALL_KEY)) return true;
  return PAGE_KEYS.some((k) => localStorage.getItem(k));
}

export function useWalkthrough(page: string) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(SKIP_ALL_KEY)) return;
    if (localStorage.getItem(pageKey(page))) return;
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, [page]);

  const done = useCallback(() => {
    localStorage.setItem(pageKey(page), '1');
    setShow(false);
  }, [page]);

  const skipAll = useCallback(() => {
    localStorage.setItem(SKIP_ALL_KEY, '1');
    setShow(false);
  }, []);

  const reopen = useCallback(() => {
    localStorage.removeItem(pageKey(page));
    setShow(true);
  }, [page]);

  return { show, done, skipAll, reopen };
}
