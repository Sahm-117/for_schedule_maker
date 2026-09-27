import { useEffect, useState } from 'react';
import type { ManualContent } from '../types';

// Comic-style readers keyed by the week's class title (lower-cased), so every
// cohort's week with that title gets the same reader. Weeks without one fall
// back to the uploaded PDF. Each manual (with its illustrations) loads on demand.
const MANUALS_BY_TITLE: Record<string, () => Promise<{ default: ManualContent }>> = {
  'introductory class': () => import('./intro'),
  'new creation realities': () => import('./class1'),
  "integrity of god's word": () => import('./class2'),
  'the holy spirit': () => import('./class3'),
  'what is faith?': () => import('./class4'),
  'praise & worship': () => import('./class5'),
  'prayer': () => import('./class6'),
  'love': () => import('./class7'),
};

const titleKey = (title: string) => title.trim().toLowerCase().replace(/[‘’]/g, "'");

function loaderFor(title: string | null | undefined) {
  return title ? MANUALS_BY_TITLE[titleKey(title)] ?? null : null;
}

export function hasManualForWeek(title: string | null | undefined): boolean {
  return !!loaderFor(title);
}

export async function loadManualForWeek(title: string | null | undefined): Promise<ManualContent | null> {
  const load = loaderFor(title);
  return load ? (await load()).default : null;
}

/** The reader for a week's class, or null while loading / when there isn't one. */
export function useManualContent(title: string | null | undefined): ManualContent | null {
  const [loaded, setLoaded] = useState<{ title: string; content: ManualContent | null } | null>(null);
  useEffect(() => {
    if (!title || !hasManualForWeek(title)) return;
    let cancelled = false;
    loadManualForWeek(title)
      .then((content) => { if (!cancelled) setLoaded({ title, content }); })
      .catch(() => { if (!cancelled) setLoaded({ title, content: null }); });
    return () => { cancelled = true; };
  }, [title]);
  return title && loaded?.title === title ? loaded.content : null;
}
