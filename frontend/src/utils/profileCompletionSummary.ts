import type { Participant, ProfileCompletion } from '../types';
import { isTeenAgeRange } from './groupingRules';
import { TEEN_STATUSES } from './followUps';

export type CompletionScope = 'all' | 'adults' | 'teens';

export interface CompletionGroup {
  people: number;
  complete: number;
  /** Average of everyone's percent, 0 to 100. */
  average: number;
}

export interface CompletionSummary {
  inGroup: CompletionGroup;
  noGroup: CompletionGroup;
  everyone: CompletionGroup;
}

const emptyGroup = (): CompletionGroup => ({ people: 0, complete: 0, average: 0 });

/** A teen by age range, by being on the teen path, or by being in a teen group (same rule as the Participants page). */
export const isTeenParticipant = (p: Participant, teenGroupIds: Set<string>): boolean =>
  isTeenAgeRange(p.ageRange)
  || (!!p.followUpStatus && (TEEN_STATUSES as string[]).includes(p.followUpStatus))
  || (!!p.groupId && teenGroupIds.has(p.groupId));

const roll = (percents: number[]): CompletionGroup => {
  if (percents.length === 0) return emptyGroup();
  const total = percents.reduce((sum, v) => sum + v, 0);
  return {
    people: percents.length,
    complete: percents.filter((v) => v >= 100).length,
    average: Math.round(total / percents.length),
  };
};

/**
 * How complete profiles are, split by whether the person is in a group. Counts the people given (the caller leaves
 * out archived and test accounts). Someone with no score yet counts as 0%, which is what the Participants list shows.
 */
export function summariseCompletion(
  participants: Participant[],
  completionById: Map<string, ProfileCompletion>,
  teenGroupIds: Set<string>,
  scope: CompletionScope,
): CompletionSummary {
  const picked = participants.filter((p) => {
    if (scope === 'all') return true;
    const teen = isTeenParticipant(p, teenGroupIds);
    return scope === 'teens' ? teen : !teen;
  });
  const scoreOf = (p: Participant) => completionById.get(p.id)?.percent ?? 0;
  return {
    inGroup: roll(picked.filter((p) => !!p.groupId).map(scoreOf)),
    noGroup: roll(picked.filter((p) => !p.groupId).map(scoreOf)),
    everyone: roll(picked.map(scoreOf)),
  };
}

export const percentOf = (complete: number, people: number): number => (people ? Math.round((100 * complete) / people) : 0);
