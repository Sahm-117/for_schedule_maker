// Derives the Rota grid (duty × week) from data the app has already loaded.
//
// weeksApi.getAll joins ActivityLabel(Label(*)) and mapWeekRow flattens it onto
// activity.labels, so every cell state below is computed from useAppData().weeks
// with no extra network calls.

import type { Activity, Label, User, Week } from '../types';
import { DUTY_KEYWORDS, ROTA_DUTIES, normaliseDescription, type RotaDuty } from '../config/rotaDuties';

/** Rota assigns ownership via the per-group support labels, not arbitrary labels. */
export const isGroupSupportLabel = (label: Pick<Label, 'name'>): boolean =>
  /^group\s+\d+\s+support$/i.test((label.name || '').trim());

export type RotaCellState =
  /** No activity that week matches the duty — nothing to assign. */
  | 'empty'
  /** Activities exist but none carry a group label — silent this week. */
  | 'unassigned'
  /** Every matching activity carries the same single group label. */
  | 'assigned'
  /** Some matching activities carry the label, others carry none. */
  | 'partial'
  /** Matching activities carry two or more different group labels. */
  | 'mixed';

export interface RotaCell {
  dutyId: string;
  weekId: number;
  weekNumber: number;
  state: RotaCellState;
  activityIds: number[];
  /** Group labels present, with how many of the matching activities carry each. */
  groupLabels: Array<{ label: Label; count: number }>;
  /** The single assigned label, when state is 'assigned'. */
  assignedLabelId: string | null;
  /**
   * Non-group labels on matching activities. Applying a duty replaces ALL labels
   * on those activities, so these would be destroyed — surfaced as a warning.
   * Empty in production today; this keeps it visible if that changes.
   */
  foreignLabels: Label[];
  /** Activities carrying no group label. */
  unassignedCount: number;
}

const activitiesOfWeek = (week: Week): Activity[] =>
  (week.days || []).flatMap((day) => day.activities || []);

export const buildRotaCell = (duty: RotaDuty, week: Week): RotaCell => {
  const matching = activitiesOfWeek(week).filter((activity) =>
    duty.match(normaliseDescription(activity.description))
  );

  const groupCounts = new Map<string, { label: Label; count: number }>();
  const foreign = new Map<string, Label>();
  let unassignedCount = 0;

  for (const activity of matching) {
    const labels = activity.labels || [];
    const groupLabels = labels.filter(isGroupSupportLabel);

    if (groupLabels.length === 0) unassignedCount++;

    for (const label of groupLabels) {
      const existing = groupCounts.get(label.id);
      if (existing) existing.count++;
      else groupCounts.set(label.id, { label, count: 1 });
    }
    for (const label of labels.filter((l) => !isGroupSupportLabel(l))) {
      foreign.set(label.id, label);
    }
  }

  const groupLabels = [...groupCounts.values()].sort((a, b) => b.count - a.count);

  let state: RotaCellState;
  if (matching.length === 0) state = 'empty';
  else if (groupLabels.length === 0) state = 'unassigned';
  else if (groupLabels.length > 1) state = 'mixed';
  else if (unassignedCount > 0) state = 'partial';
  else state = 'assigned';

  return {
    dutyId: duty.id,
    weekId: week.id,
    weekNumber: week.weekNumber,
    state,
    activityIds: matching.map((a) => a.id),
    groupLabels,
    assignedLabelId: state === 'assigned' || state === 'partial' ? groupLabels[0].label.id : null,
    foreignLabels: [...foreign.values()],
    unassignedCount,
  };
};

export const cellKey = (dutyId: string, weekId: number) => `${dutyId}:${weekId}`;

export const buildRotaGrid = (weeks: Week[]): Map<string, RotaCell> => {
  const grid = new Map<string, RotaCell>();
  for (const duty of ROTA_DUTIES) {
    for (const week of weeks) {
      grid.set(cellKey(duty.id, week.id), buildRotaCell(duty, week));
    }
  }
  return grid;
};

export interface UnmatchedGroup {
  description: string;
  count: number;
  weekNumbers: number[];
}

/**
 * Activities that look like a duty but match no duty exactly — messy variants
 * such as "Prayer Watch Post ( Whatsapp)" or the
 * "Prayer Watch Lead: Telegram 1... 2... 3..." rows.
 *
 * Shown read-only so they are visible and fixable in the Schedule, never
 * auto-tagged: guessing which duty a malformed description belongs to is exactly
 * how a bulk write goes wrong.
 */
export const findUnmatchedActivities = (weeks: Week[]): UnmatchedGroup[] => {
  const groups = new Map<string, { count: number; weekNumbers: Set<number> }>();

  for (const week of weeks) {
    for (const activity of activitiesOfWeek(week)) {
      const raw = activity.description || '';
      if (!DUTY_KEYWORDS.test(raw)) continue;
      const normalised = normaliseDescription(raw);
      if (ROTA_DUTIES.some((duty) => duty.match(normalised))) continue;

      const existing = groups.get(raw);
      if (existing) {
        existing.count++;
        existing.weekNumbers.add(week.weekNumber);
      } else {
        groups.set(raw, { count: 1, weekNumbers: new Set([week.weekNumber]) });
      }
    }
  }

  return [...groups.entries()]
    .map(([description, { count, weekNumbers }]) => ({
      description,
      count,
      weekNumbers: [...weekNumbers].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.count - a.count);
};

/** labelId -> users holding it, so the UI can warn about shared/unowned labels. */
export type LabelOwners = Map<string, User[]>;

export const describeOwners = (owners: User[] | undefined): string => {
  if (!owners || owners.length === 0) return 'No user assigned — nobody will be notified';
  if (owners.length === 1) return owners[0].name;
  return `Shared — ${owners.length} people will be notified: ${owners.map((o) => o.name).join(', ')}`;
};
