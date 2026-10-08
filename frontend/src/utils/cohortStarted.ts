import { lagosTodayIso } from './participantApp';

// True from the cohort's start date (Lagos time) onwards. A cohort with no start
// date set has not started. Used to retire things that only matter before the
// cohort begins, such as the open follow-ups load ring beside each support.
export const cohortHasStarted = (
  cohort: { startDate?: string | null } | null | undefined,
  now: Date = new Date(),
): boolean => {
  const start = cohort?.startDate?.slice(0, 10);
  return !!start && lagosTodayIso(now) >= start;
};
