// Duty definitions for the Rota page.
//
// A "duty" is a recurring job (e.g. posting the daily scripture) that one support
// person owns for a whole week. Rota assigns it by writing that person's
// "Group N Support" label onto every activity that week matching the duty — the
// same labels push-reminders already reads.
//
// Phase 1 keeps these in front-end config: no schema change, and the duty set is
// small and stable. Moving them into tables is a later phase.
//
// MATCHING RULES — these are deliberately strict:
//   * Match against a NORMALISED description and anchor with ^...$.
//   * Never substring/ilike. An earlier go-live script used PostgREST `ilike` with
//     wildcards, over-matched, and had to be redone by filtering in JS instead.
//   * Descriptions in production are messy (case, trailing spaces, hyphen
//     spacing). Fold only variants that are unambiguously the same duty; leave
//     anything doubtful UNMATCHED so it surfaces in the unmatched panel rather
//     than being silently retagged.

import type { Activity } from '../types';

export interface RotaDuty {
  id: string;
  name: string;
  /** Shown under the duty name in the row header, e.g. "daily · 2:00 PM". */
  subLabel?: string;
  /** Strict, anchored test against the normalised description. */
  match: (description: string) => boolean;
}

/**
 * Collapse the incidental differences seen in production: casing, leading and
 * trailing space, runs of whitespace, and spacing around hyphens (there are real
 * pairs like "Post - 21days" / "Post- 21days").
 */
export const normaliseDescription = (description: string | null | undefined): string =>
  (description || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-');

/** Loose keyword test used ONLY to populate the unmatched panel. */
export const DUTY_KEYWORDS = /inspirational|prayer\s*watch|focus\s*person/i;

export const ROTA_DUTIES: RotaDuty[] = [
  {
    id: 'inspirational-scriptures',
    name: 'Inspirational Scriptures',
    subLabel: 'daily · 2:00 PM',
    // Folds "Inspirational post" / "Inspirational Post" (both 2:00 PM, same duty).
    match: (d) => /^inspirational (scriptures?|post)$/.test(d),
  },
  {
    id: 'post-focus-person-telegram',
    name: 'Post Focus Person (Telegram)',
    subLabel: 'twice daily · 5:45 AM & 8:45 PM',
    match: (d) => /^post focus person \(telegram\)$/.test(d),
  },
  {
    id: 'prayer-watch-post-whatsapp',
    name: 'Prayer Watch Post (WhatsApp)',
    subLabel: 'twice daily · 5:45 AM & 8:45 PM',
    match: (d) => /^prayer watch post \(whatsapp\)$/.test(d),
  },
  {
    id: 'prayer-watch-post-telegram',
    name: 'Prayer Watch Post (Telegram)',
    subLabel: 'twice daily · 5:45 AM & 8:45 PM',
    match: (d) => /^prayer watch post \(telegram\)$/.test(d),
  },
  {
    id: 'prayer-watch-lead',
    name: 'Prayer Watch Lead',
    subLabel: 'daily · 8:50 PM',
    // Trailing colon only. The "Prayer Watch Lead: Telegram 1... 2... 3..."
    // variants are intentionally NOT matched: those name three separate slots
    // inside one activity's text, and a label applies to the whole activity, so
    // they cannot be assigned to three people this way.
    match: (d) => /^prayer watch lead:?$/.test(d),
  },
];

export const findDutyForDescription = (description: string | null | undefined): RotaDuty | null => {
  const normalised = normaliseDescription(description);
  return ROTA_DUTIES.find((duty) => duty.match(normalised)) || null;
};

export interface DutyOverlap {
  description: string;
  dutyIds: string[];
}

/**
 * Duties must be mutually exclusive. Rota writes labels with a delete-then-insert
 * bulk call, so if one description matched two duties, assigning one would wipe
 * the other's assignment. Production currently has zero overlaps; this keeps that
 * true rather than assuming it.
 */
export const findDutyOverlaps = (activities: Pick<Activity, 'description'>[]): DutyOverlap[] => {
  const seen = new Map<string, string[]>();

  for (const activity of activities) {
    const normalised = normaliseDescription(activity.description);
    if (seen.has(normalised)) continue;
    const matched = ROTA_DUTIES.filter((duty) => duty.match(normalised)).map((duty) => duty.id);
    if (matched.length > 1) seen.set(normalised, matched);
  }

  return [...seen.entries()].map(([description, dutyIds]) => ({ description, dutyIds }));
};
