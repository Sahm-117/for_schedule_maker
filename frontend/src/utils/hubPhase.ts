// Day 5+ of the cohort, a hub support reaches My Hub more than Mobilisation,
// so the two swap places (mobile bottom bar in AppShell, quick actions on
// Support Home). Shared here so both places apply the same rule.
export const getHubPhase = (hasHub: boolean, cohortStartDate?: string | null): boolean => {
  if (!hasHub || !cohortStartDate) return false;
  const start = new Date(`${cohortStartDate}T00:00:00Z`);
  return Date.now() >= start.getTime() + 5 * 24 * 60 * 60 * 1000;
};
