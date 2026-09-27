import type { ManualContent } from '../types';
import class1 from './class1';

// Comic-style readers keyed by the week's class title (lower-cased), so every
// cohort's week with that title gets the same reader. Weeks without one fall
// back to the uploaded PDF.
const MANUALS_BY_TITLE: Record<string, ManualContent> = {
  'new creation realities': class1,
};

export function manualContentForWeek(title: string | null | undefined): ManualContent | null {
  if (!title) return null;
  return MANUALS_BY_TITLE[title.trim().toLowerCase()] ?? null;
}
