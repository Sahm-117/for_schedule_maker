import type { Group, OnboardingProgress, OnboardingProgressParticipant, SupportOnboardingStep } from '../types';

// One rule for "is this group ready", used by the support's own steps (My Group, Home), the admin
// Groups cards, the Supports page and the dashboard warning.
//
// A participant is ready once they have finished their steps, or once they have been to class
// (present, late or left early) and finished their profile: after the first class only the profile
// is still asked of them. A support's own steps are ticked by the app from what it can see; an admin
// can mark one done by hand (SupportOnboardingOverride).

export const participantIsReady = (p: Pick<OnboardingProgressParticipant, 'completed' | 'hasAttended' | 'profileComplete'>) =>
  !!p.completed || (!!p.hasAttended && !!p.profileComplete);

/** A participant's own step counts as done once they have attended class, except the profile. */
export const participantStepDone = (
  p: OnboardingProgressParticipant,
  key: 'introPosted' | 'venueMapAcknowledged' | 'introGuideRead' | 'profileComplete' | 'readyConfirmed',
) => !!p.completed || !!p[key] || (key !== 'profileComplete' && !!p.hasAttended);

export interface SupportOnboardingStepState {
  key: SupportOnboardingStep;
  label: string;
  done: boolean;
  /** Done because an admin marked it, not because the app saw it. */
  byAdmin: boolean;
  note: string | null;
}

type MeetingFields = Pick<Group, 'id' | 'meetingDay' | 'meetingTime' | 'callLink'>;

/** The three steps for one group, from its onboarding progress and its meeting details. */
export const supportOnboardingSteps = (
  group: MeetingFields,
  progress: OnboardingProgress,
): { steps: SupportOnboardingStepState[]; readyCount: number; total: number } => {
  const row = progress.groups.find((g) => g.groupId === group.id) ?? null;
  const overrides = new Set(row?.overrides ?? []);
  const people = progress.participants.filter((p) => p.groupId === group.id);
  const readyCount = people.filter(participantIsReady).length;
  const detected: Record<SupportOnboardingStep, boolean> = {
    INTRO: !!row?.supportIntroPosted,
    READY: people.length > 0 && readyCount === people.length,
    MEETING: !!group.callLink?.trim() && !!group.meetingDay && !!group.meetingTime,
  };
  const step = (key: SupportOnboardingStep, label: string, note: string | null): SupportOnboardingStepState => ({
    key, label, note, done: detected[key] || overrides.has(key), byAdmin: !detected[key] && overrides.has(key),
  });
  return {
    readyCount,
    total: people.length,
    steps: [
      step('INTRO', 'Introduce yourself', 'Your group can’t introduce themselves until you have.'),
      step('READY', 'Ensure your participants complete their onboarding steps', people.length > 0 ? `${readyCount} of ${people.length} ready` : null),
      step('MEETING', 'Set meeting time and call link', null),
    ],
  };
};

export interface OnboardingReadiness {
  /** Participants who count as ready. */
  readyIds: Set<string>;
  /** Per group: all three of the support's steps done (seen by the app or marked by an admin). */
  groupDone: Map<string, boolean>;
}

/** Readiness for a whole cohort, from cohort_onboarding_progress and the groups' meeting details. */
export const buildOnboardingReadiness = (progress: OnboardingProgress, groups: MeetingFields[]): OnboardingReadiness => ({
  readyIds: new Set(progress.participants.filter(participantIsReady).map((p) => p.participantId)),
  groupDone: new Map(groups.map((g) => [g.id, supportOnboardingSteps(g, progress).steps.every((s) => s.done)])),
});
