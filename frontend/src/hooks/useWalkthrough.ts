import { useCallback, useEffect, useState } from 'react';

const SKIP_ALL_KEY = 'fof_walkthrough_skip_all';

const pageKey = (key: string) => `fof_walkthrough_${key}`;

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
