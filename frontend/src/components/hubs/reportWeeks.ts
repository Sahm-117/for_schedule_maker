import type { Cohort, Week } from '../../types';
import { getIdealWeekNumberForCohort } from '../../utils/weekFocus';
import { cohortMode } from '../dashboard/healthModel';

/** The weeks whose hub meeting reports can exist: every week that has started, the current one included, oldest first. */
export const hubReportWeeks = (cohort: Cohort | null | undefined, weeks: Week[]): Week[] => {
  if (!cohort || weeks.length === 0) return [];
  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const mode = cohortMode(cohort);
  if (mode === 'upcoming') return [];
  if (mode === 'completed') return sorted;
  const current = getIdealWeekNumberForCohort(cohort, new Date(), weeks);
  return sorted.filter((w) => w.weekNumber <= current);
};
