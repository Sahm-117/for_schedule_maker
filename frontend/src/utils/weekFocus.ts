import type { Cohort, Week } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const getIdealWeekForCohort = (cohort: Pick<Cohort, 'startDate'> | null | undefined, weeks: Week[]) => {
  if (weeks.length === 0) return null;

  const sortedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const start = parseLocalDate(cohort?.startDate);
  if (!start) return sortedWeeks[0];

  const today = new Date();
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.floor((todayLocal.getTime() - start.getTime()) / MS_PER_DAY);
  const idealWeekNumber = Math.max(1, Math.floor(diffDays / 7) + 1);

  const exact = sortedWeeks.find((week) => week.weekNumber === idealWeekNumber);
  if (exact) return exact;

  if (idealWeekNumber <= sortedWeeks[0].weekNumber) return sortedWeeks[0];
  return sortedWeeks[sortedWeeks.length - 1];
};
