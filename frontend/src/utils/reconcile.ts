// Reconcile a freshly-fetched list into existing state by id, WITHOUT replacing
// the whole array wholesale.
//
// Why: silent realtime refreshes refetch the full list and call setState with a
// brand-new array of brand-new objects. Even when nothing actually changed,
// every row gets a new object reference, so the entire list re-renders — seen
// by the user as a flash / scroll-jump ("the page reloads itself").
//
// reconcileById keeps the reference of any row whose contents are unchanged, so
// React (with keyed / memoised rows) only re-renders the rows that genuinely
// changed. New rows are added, removed rows drop out, and the incoming order is
// preserved (callers sort `next` before passing it in).

const shallowEqual = <T extends Record<string, unknown>>(a: T, b: T): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

export const reconcileById = <T extends { id: string }>(prev: T[], next: T[]): T[] => {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  let changed = prev.length !== next.length;
  const merged = next.map((incoming, idx) => {
    const existing = prevById.get(incoming.id);
    // Unchanged row → reuse the old reference so this row doesn't re-render.
    if (existing && shallowEqual(existing as Record<string, unknown>, incoming as Record<string, unknown>)) {
      if (existing !== prev[idx]) changed = true; // reordered/inserted
      return existing;
    }
    changed = true;
    return incoming;
  });
  // If nothing changed at all (same ids, same order, same contents), return the
  // original array so the parent's state reference is stable too (no re-render).
  return changed ? merged : prev;
};
