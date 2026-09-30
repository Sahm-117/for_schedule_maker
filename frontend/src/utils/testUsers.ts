// Test supports (demo or trial accounts) stay out of every "pick a support"
// dropdown, so nobody is assigned to one by mistake. A test account that is
// already chosen stays in the list so its name still shows. Where an admin
// really does need to hand something to a test account, the dropdown has a
// "Show test supports" toggle that passes includeTest.
export const pickableUsers = <T extends { id: string; isTest?: boolean }>(
  users: T[],
  options: { includeTest?: boolean; keepIds?: Array<string | null | undefined> } = {},
): T[] => {
  if (options.includeTest) return users;
  const keep = new Set((options.keepIds ?? []).filter((id): id is string => !!id));
  return users.filter((user) => !user.isTest || keep.has(user.id));
};
