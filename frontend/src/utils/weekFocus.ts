import type { Cohort, Week } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

// Returns the most recent Sunday-10am boundary on or before `now`, as a local Date.
const lastSunday10am = (now: Date): Date => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - dayOfWeek); // rewind to Sunday of this week
  d.setHours(10, 0, 0, 0);
  // If we haven't reached this Sunday's 10am yet, step back one week
  if (d.getTime() > now.getTime()) {
    d.setDate(d.getDate() - 7);
  }
  return d;
};

// Computes the ideal week number for a cohort at a given point in time,
// treating each program week as unlocking at Sunday 10am local.
export const getIdealWeekNumberForCohort = (
  cohort: Pick<Cohort, 'startDate'> | null | undefined,
  now: Date,
): number => {
  const start = parseLocalDate(cohort?.startDate);
  if (!start) return 1;
  const anchor = lastSunday10am(now);
  const diffDays = Math.floor((anchor.getTime() - start.getTime()) / MS_PER_DAY);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
};

export const getIdealWeekForCohort = (cohort: Pick<Cohort, 'startDate'> | null | undefined, weeks: Week[]) => {
  if (weeks.length === 0) return null;

  const sortedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const start = parseLocalDate(cohort?.startDate);
  if (!start) return sortedWeeks[0];

  const idealWeekNumber = getIdealWeekNumberForCohort(cohort, new Date());

  const exact = sortedWeeks.find((week) => week.weekNumber === idealWeekNumber);
  if (exact) return exact;

  if (idealWeekNumber <= sortedWeeks[0].weekNumber) return sortedWeeks[0];
  return sortedWeeks[sortedWeeks.length - 1];
};
