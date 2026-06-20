export const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export const compareText = (a?: string | null, b?: string | null) =>
  naturalCollator.compare((a || '').trim(), (b || '').trim());

export const sortByText = <T,>(items: T[], getText: (item: T) => string | null | undefined): T[] =>
  [...items].sort((a, b) => compareText(getText(a), getText(b)));
