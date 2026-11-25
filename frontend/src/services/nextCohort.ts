import { followUpContactsApi, participantStageChangesApi, participantsApi } from './api';
import { buildStatusPatch, isOnTeenPath } from '../utils/followUps';
import { isTeenAgeRange } from '../utils/groupingRules';
import type { FollowUpContactUpdate, Participant } from '../types';

// Adjust journey → Next cohort (FLOW_MAP rule 141): the same move as the three-misses rule (119), by hand.
// Only for someone not in a group. They are archived (off this cohort's list and attendance), an adult's sign-up is
// set to "Will join next cohort" (a teen keeps their teen status for their Teen Support), and the journey entry
// keeps the reason, who did it and when.
export const nextCohortApi = {
  async move(participant: Participant, note: string, changedById: string): Promise<void> {
    if (participant.groupId) throw new Error('Take them out of their group first.');
    await participantStageChangesApi.create({ participantId: participant.id, stage: 'NEXT_COHORT', note: note || null, changedById });
    await participantsApi.archive(participant.id);
    const isTeen = isTeenAgeRange(participant.ageRange) || isOnTeenPath(participant);
    if (participant.followUpContactId && !isTeen) {
      await followUpContactsApi.update(participant.followUpContactId, buildStatusPatch('NEXT_COHORT') as FollowUpContactUpdate);
    }
  },
};
