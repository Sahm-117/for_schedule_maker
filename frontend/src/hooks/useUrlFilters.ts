import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FilterValues } from '../components/filters/FilterBar';

/**
 * Filter choices kept in the address (comma separated, one parameter per filter group), so a link such as
 * `?hub=abc` or `?kind=HUB_LEAD,OPERATIONAL` opens the page already filtered and a reload keeps the filters.
 * A single old-style value (`?hub=abc`) reads as one choice.
 */
export const useUrlFilters = (keys: string[]): [FilterValues, (next: FilterValues) => void] => {
  const [searchParams, setSearchParams] = useSearchParams();
  const keyList = keys.join('|');
  const value = useMemo<FilterValues>(
    () => Object.fromEntries(keyList.split('|').filter(Boolean).map((key) => [key, (searchParams.get(key) ?? '').split(',').filter(Boolean)])),
    [searchParams, keyList],
  );
  const set = useCallback((next: FilterValues) => {
    const params = new URLSearchParams(searchParams);
    keyList.split('|').filter(Boolean).forEach((key) => {
      const list = next[key] ?? [];
      if (list.length > 0) params.set(key, list.join(',')); else params.delete(key);
    });
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, keyList]);
  return [value, set];
};
