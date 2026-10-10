import type { OnboardingProgressParticipant } from '../types';

// How far along a group's onboarding is, for the card on the Groups page. A group is onboarded when
// every member has finished; it is overdue when it is not and more than the programme's allowance
// (7 days by default, `onboardingMaxDays`) has passed since its support was assigned.

export type OnboardingChip = 'not_started' | 'in_progress' | 'overdue' | 'onboarded';

export const ONBOARDING_CHIP_LABEL: Record<OnboardingChip, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  overdue: 'Overdue',
  onboarded: 'Onboarded',
};

/** The five steps a participant does themselves, in order. Same words as the step pills and the Supports page. */
export const ONBOARDING_STEPS: Array<{ key: 'introPosted' | 'venueMapAcknowledged' | 'introGuideRead' | 'profileComplete' | 'readyConfirmed'; label: string }> = [
  { key: 'introPosted', label: 'Intro' },
  { key: 'venueMapAcknowledged', label: 'Map' },
  { key: 'introGuideRead', label: 'Guide' },
  { key: 'profileComplete', label: 'Profile' },
  { key: 'readyConfirmed', label: 'Ready' },
];

export interface GroupOnboardingSummary {
  chip: OnboardingChip;
  members: number;
  onboarded: number;
  /** For each step, in order: how many members are past it. */
  stepCounts: number[];
  /** Whole days since the support was assigned (null when that date is not known). */
  daysSinceAssigned: number | null;
  /** The step with the most people still to do (earliest on a tie); null when nobody is waiting. */
  waitingOn: { label: string; people: number } | null;
}

const DAY_MS = 86400000;

/**
 * `progress` holds the onboarding flags of members by participant id; a member with no row counts as
 * having done nothing. Returns null for a group with no members (nothing to measure).
 */
export const summarizeGroupOnboarding = (
  memberIds: string[],
  progress: Map<string, OnboardingProgressParticipant>,
  assignedAt: string | null,
  maxDays: number,
  now = new Date(),
): GroupOnboardingSummary | null => {
  if (memberIds.length === 0) return null;
  const rows = memberIds.map((id) => progress.get(id));
  // A step counts for a member who has done it or has finished onboarding altogether.
  const stepCounts = ONBOARDING_STEPS.map((step) => rows.filter((row) => row && (row.completed || row[step.key])).length);
  const onboarded = rows.filter((row) => row && (row.completed || ONBOARDING_STEPS.every((step) => row[step.key]))).length;
  const assignedMs = assignedAt ? new Date(assignedAt).getTime() : NaN;
  const daysSinceAssigned = Number.isNaN(assignedMs) ? null : Math.max(0, Math.floor((now.getTime() - assignedMs) / DAY_MS));

  let chip: OnboardingChip;
  if (onboarded === memberIds.length) chip = 'onboarded';
  else if (daysSinceAssigned !== null && daysSinceAssigned > maxDays) chip = 'overdue';
  else if (stepCounts.every((count) => count === 0)) chip = 'not_started';
  else chip = 'in_progress';

  let waitingOn: GroupOnboardingSummary['waitingOn'] = null;
  if (chip !== 'onboarded') {
    ONBOARDING_STEPS.forEach((step, index) => {
      const people = memberIds.length - stepCounts[index];
      if (people > 0 && (!waitingOn || people > waitingOn.people)) waitingOn = { label: step.label, people };
    });
  }
  return { chip, members: memberIds.length, onboarded, stepCounts, daysSinceAssigned, waitingOn };
};
