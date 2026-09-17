import type { DepartmentReferral, JourneyStage, ParticipantStageChange } from '../types';

// A participant's journey: Registered -> Onboarded -> Active -> Completed ->
// Referred -> Integrated. Each stage is reached from records where possible;
// a manual "Move journey stage" covers the rest and wins when it's the newest
// thing that happened, so a mistaken stage can also be moved back.

export const JOURNEY_STAGES: Array<{ stage: JourneyStage; label: string }> = [
  { stage: 'REGISTERED', label: 'Registered' },
  { stage: 'ONBOARDED', label: 'Onboarded' },
  { stage: 'ACTIVE', label: 'Active' },
  { stage: 'COMPLETED', label: 'Completed' },
  { stage: 'REFERRED', label: 'Referred' },
  { stage: 'INTEGRATED', label: 'Integrated' },
];

export interface JourneyEvidence {
  registeredAt: string | null;
  onboardedAt: string | null;
  onboardedBy?: string | null;
  firstAttendedAt: string | null;
  completedAt: string | null;
  referrals: DepartmentReferral[];
  changes: ParticipantStageChange[];
}

export interface JourneyStep {
  stage: JourneyStage;
  label: string;
  reached: boolean;
  current: boolean;
  at: string | null;
  detail: string;
}

const time = (value: string | null | undefined) => (value ? new Date(value).getTime() : null);

export const buildJourney = (evidence: JourneyEvidence, formatDate: (value: string) => string): JourneyStep[] => {
  const referred = evidence.referrals.length
    ? evidence.referrals.reduce((min, r) => (r.loggedAt < min.loggedAt ? r : min))
    : null;
  const joined = evidence.referrals.filter((r) => r.status === 'JOINED' && r.joinedAt)
    .sort((a, b) => (a.joinedAt! < b.joinedAt! ? -1 : 1))[0] ?? null;

  // A department choice only counts as a referral once they've completed FOF;
  // before that it's just interest (often captured at registration).
  const completed = !!evidence.completedAt;
  const fromRecords: Record<JourneyStage, { at: string | null; detail: string }> = {
    REGISTERED: { at: evidence.registeredAt, detail: 'Registration' },
    ONBOARDED: { at: evidence.onboardedAt, detail: evidence.onboardedBy ? `Onboarding finished by ${evidence.onboardedBy}` : 'Onboarding finished' },
    ACTIVE: { at: evidence.firstAttendedAt, detail: 'First class or meeting attended' },
    COMPLETED: { at: evidence.completedAt, detail: 'Met the completion rule' },
    REFERRED: { at: completed ? referred?.loggedAt ?? null : null, detail: referred ? `${referred.department} logged` : '' },
    INTEGRATED: { at: completed ? joined?.joinedAt ?? null : null, detail: joined ? `Joined ${joined.department}` : '' },
  };

  const order = JOURNEY_STAGES.map((s) => s.stage);
  let furthest = -1;
  let newestRecord = 0;
  order.forEach((stage, index) => {
    const at = time(fromRecords[stage].at);
    if (at !== null) {
      furthest = index;
      newestRecord = Math.max(newestRecord, at);
    }
  });

  const latestChange = [...evidence.changes].sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1))[0] ?? null;
  const manualWins = latestChange !== null && (time(latestChange.changedAt) ?? 0) >= newestRecord;
  const currentIndex = manualWins ? order.indexOf(latestChange!.stage) : furthest;

  return JOURNEY_STAGES.map(({ stage, label }, index) => {
    const reached = index <= currentIndex;
    const record = fromRecords[stage];
    const manual = evidence.changes.filter((c) => c.stage === stage).sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1))[0];
    let at: string | null = null;
    let detail = 'Not reached';
    if (reached) {
      if (record.at) {
        at = record.at;
        detail = record.detail;
      } else if (manual) {
        at = manual.changedAt;
        detail = `Moved here by ${manual.changedByName || 'an admin'}${manual.note ? `: ${manual.note}` : ''}`;
      } else if (manualWins) {
        detail = 'Passed when moved further along';
      } else {
        detail = 'Not recorded';
      }
    } else if (record.at && manualWins) {
      detail = `Moved back by ${latestChange!.changedByName || 'an admin'}`;
    } else if (stage === 'REFERRED' && referred && !completed) {
      detail = `Chose ${evidence.referrals.map((r) => r.department).join(', ')} · referred once they complete`;
    }
    return {
      stage,
      label,
      reached,
      current: index === currentIndex,
      at,
      detail: at ? `${detail} · ${formatDate(at)}` : detail,
    };
  });
};

const DAY_MS = 86400000;

/** "Waiting 12 days", "Joined after 9 days", or "Didn't join". */
export const referralTimeline = (referral: DepartmentReferral, now = new Date()): string => {
  const logged = new Date(referral.loggedAt).getTime();
  if (referral.status === 'JOINED' && referral.joinedAt) {
    const days = Math.max(0, Math.round((new Date(referral.joinedAt).getTime() - logged) / DAY_MS));
    return `Joined after ${days} day${days === 1 ? '' : 's'}`;
  }
  if (referral.status === 'NOT_JOINED') return 'Didn’t join';
  const days = Math.max(0, Math.floor((now.getTime() - logged) / DAY_MS));
  return days === 0 ? 'Logged today, waiting to join' : `Waiting ${days} day${days === 1 ? '' : 's'} to join`;
};
