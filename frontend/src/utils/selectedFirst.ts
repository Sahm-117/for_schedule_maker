// Stable partition: selected items float to the top, unselected items stay below.
// Callers pass an already name-sorted (A–Z) list — order within each partition
// is preserved, so both the selected and unselected groups stay A–Z.
export function selectedFirst<T>(items: T[], isSelected: (item: T) => boolean): T[] {
  const selected: T[] = [];
  const unselected: T[] = [];
  for (const item of items) {
    (isSelected(item) ? selected : unselected).push(item);
  }
  return [...selected, ...unselected];
}
