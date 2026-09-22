// The FOF programme rules agreed with leadership (Sep 2026), and the functions
// that apply them to a cohort's records. Thresholds are stored in AppSetting
// 'programme_rules' and edited in Settings; these are the defaults.
//
// - Participants: misses add up across the cohort. Any miss = keep an eye on.
//   2+ Sunday misses AND 2+ group-meeting misses = needs attention.
//   Late counts as attended. An unrecorded week is the support's miss, not theirs.
// - Completion: every class run and attended (threshold adjustable). Score 100%
//   with every group meeting attended, 90% otherwise. Below it = retake FOF.
// - Cohort success: enough participants completed (default 75%).
// - Supports: each week they submit the group meeting report and mark attendance.
//   1 unrecorded week = keep an eye on, 2 = needs attention. Their group must be
//   fully onboarded within a week of being assigned.

export interface ProgrammeRules {
  completionAttendancePct: number;
  cohortSuccessPct: number;
  participantRedSundayMisses: number;
  participantRedMeetingMisses: number;
  supportAmberMissedWeeks: number;
  supportRedMissedWeeks: number;
  onboardingMaxDays: number;
}

export const DEFAULT_PROGRAMME_RULES: ProgrammeRules = {
  completionAttendancePct: 100,
  cohortSuccessPct: 75,
  participantRedSundayMisses: 2,
  participantRedMeetingMisses: 2,
  supportAmberMissedWeeks: 1,
  supportRedMissedWeeks: 2,
  onboardingMaxDays: 7,
};

export const COMPLETION_SCORE_ALL_MEETINGS = 100;
export const COMPLETION_SCORE_OTHERWISE = 90;

// Below this share of recorded Sunday marks, a cohort's records are too thin to
// judge anyone fairly, so statuses are withheld rather than guessed.
export const MIN_RECORD_COVERAGE = 0.5;

export const normaliseRules = (value: unknown): ProgrammeRules => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rules = { ...DEFAULT_PROGRAMME_RULES };
  (Object.keys(rules) as Array<keyof ProgrammeRules>).forEach((key) => {
    const n = Number(source[key]);
    if (Number.isFinite(n) && n >= 0) rules[key] = n;
  });
  return rules;
};

export type PersonHealth = 'good' | 'warning' | 'critical';

export const PERSON_HEALTH_LABEL: Record<PersonHealth, string> = {
  good: 'On track',
  warning: 'Keep an eye on',
  critical: 'Needs attention',
};

export interface CohortPeoplePayload {
  participants: Array<{
    id: string;
    fullName: string;
    status: string;
    departments: string[] | null;
    createdAt: string;
    groupId: string | null;
    onboarded: boolean;
  }>;
  sunday: Array<{ participantId: string; weekId: number; status: 'PRESENT' | 'LATE' | 'ABSENT' | string }>;
  meeting: Array<{ participantId: string; weekId: number; status: 'JOINED' | 'EXCUSED' | 'MISSED' | string }>;
  onboarding: Array<{ groupId: string; supportId: string | null; groupCreated: boolean | null; completedAt: string | null; assignedAt: string | null }>;
}

export type CompletionOutcome = 'COMPLETED' | 'RETAKE' | 'RECORDS_MISSING';

export interface ParticipantEvaluation {
  id: string;
  fullName: string;
  groupId: string | null;
  sundayAttended: number;
  sundayMisses: number;
  sundayUnrecorded: number;
  meetingAttended: number;
  meetingMisses: number;
  health: PersonHealth;
  /** Only set once every class has run (the cohort is over). */
  completion: { outcome: CompletionOutcome; score: number | null; attendancePct: number } | null;
}

const ATTENDED_SUNDAY = new Set(['PRESENT', 'LATE']);

export const evaluateParticipants = (
  people: CohortPeoplePayload,
  judgedWeekIds: number[],
  allClassesRun: boolean,
  rules: ProgrammeRules,
): ParticipantEvaluation[] => {
  const judged = new Set(judgedWeekIds);
  const sundayBy = new Map<string, Map<number, string>>();
  people.sunday.forEach((r) => {
    if (!judged.has(r.weekId)) return;
    if (!sundayBy.has(r.participantId)) sundayBy.set(r.participantId, new Map());
    sundayBy.get(r.participantId)!.set(r.weekId, r.status);
  });
  const meetingBy = new Map<string, Map<number, string>>();
  people.meeting.forEach((r) => {
    if (!judged.has(r.weekId)) return;
    if (!meetingBy.has(r.participantId)) meetingBy.set(r.participantId, new Map());
    meetingBy.get(r.participantId)!.set(r.weekId, r.status);
  });

  return people.participants
    .filter((p) => p.status === 'ACTIVE')
    .map((p) => {
      const sunday = [...(sundayBy.get(p.id)?.values() ?? [])];
      const meeting = [...(meetingBy.get(p.id)?.values() ?? [])];
      const sundayAttended = sunday.filter((s) => ATTENDED_SUNDAY.has(s)).length;
      const sundayMisses = sunday.filter((s) => s === 'ABSENT').length;
      const sundayUnrecorded = judged.size - sunday.length;
      const meetingAttended = meeting.filter((s) => s === 'JOINED').length;
      // Excused isn't counted as a miss.
      const meetingMisses = meeting.filter((s) => s === 'MISSED').length;

      const health: PersonHealth =
        sundayMisses >= rules.participantRedSundayMisses && meetingMisses >= rules.participantRedMeetingMisses
          ? 'critical'
          : sundayMisses + meetingMisses >= 1 ? 'warning' : 'good';

      let completion: ParticipantEvaluation['completion'] = null;
      if (allClassesRun && judged.size > 0) {
        const attendancePct = (sundayAttended / judged.size) * 100;
        const bestCasePct = ((sundayAttended + sundayUnrecorded) / judged.size) * 100;
        if (attendancePct >= rules.completionAttendancePct) {
          completion = {
            outcome: 'COMPLETED',
            score: meetingAttended >= judged.size ? COMPLETION_SCORE_ALL_MEETINGS : COMPLETION_SCORE_OTHERWISE,
            attendancePct,
          };
        } else if (bestCasePct >= rules.completionAttendancePct) {
          // Could still have completed; the missing marks decide it.
          completion = { outcome: 'RECORDS_MISSING', score: null, attendancePct };
        } else {
          completion = { outcome: 'RETAKE', score: null, attendancePct };
        }
      }

      return {
        id: p.id,
        fullName: p.fullName,
        groupId: p.groupId,
        sundayAttended,
        sundayMisses,
        sundayUnrecorded,
        meetingAttended,
        meetingMisses,
        health,
        completion,
      };
    });
};

/** Share of expected Sunday marks that were actually recorded. */
export const sundayRecordCoverage = (evaluations: ParticipantEvaluation[], judgedWeeks: number) => {
  const expected = evaluations.length * judgedWeeks;
  if (!expected) return null;
  const recorded = evaluations.reduce((sum, e) => sum + (judgedWeeks - e.sundayUnrecorded), 0);
  return recorded / expected;
};

export interface SupportWeekRecord {
  weekNumber: number;
  reportSubmitted: boolean;
  meetingMarked: boolean;
  recorded: boolean;
}

export interface SupportEvaluation {
  supportId: string;
  groupId: string;
  members: number;
  weeks: SupportWeekRecord[];
  missedWeeks: number[];
  health: PersonHealth;
  onboarding: {
    assignedAt: string | null;
    completedAt: string | null;
    allOnboarded: boolean;
    days: number | null;
    late: boolean;
  };
}

const DAY_MS = 86400000;

export const evaluateSupports = (
  people: CohortPeoplePayload,
  groups: Array<{ id: string; supportId: string | null }>,
  meetingReports: Array<{ weekId: number; groupId: string }>,
  judgedWeeks: Array<{ id: number; weekNumber: number }>,
  rules: ProgrammeRules,
  now = new Date(),
): SupportEvaluation[] => {
  const activeMembers = new Map<string, string[]>();
  people.participants.forEach((p) => {
    if (p.status !== 'ACTIVE' || !p.groupId) return;
    activeMembers.set(p.groupId, [...(activeMembers.get(p.groupId) ?? []), p.id]);
  });
  const meetingKeys = new Set(people.meeting.map((r) => `${r.participantId}:${r.weekId}`));
  const reportKeys = new Set(meetingReports.map((r) => `${r.groupId}:${r.weekId}`));
  const onboardingBy = new Map(people.onboarding.map((o) => [o.groupId, o]));
  const onboardedIds = new Set(people.participants.filter((p) => p.onboarded).map((p) => p.id));

  return groups
    .filter((g) => g.supportId && (activeMembers.get(g.id)?.length ?? 0) > 0)
    .map((g) => {
      const members = activeMembers.get(g.id) ?? [];
      // A week counts as recorded when the meeting report is in and every
      // member has a meeting attendance mark.
      const weeks = [...judgedWeeks].sort((a, b) => a.weekNumber - b.weekNumber).map((w) => {
        const reportSubmitted = reportKeys.has(`${g.id}:${w.id}`);
        const meetingMarked = members.every((m) => meetingKeys.has(`${m}:${w.id}`));
        return { weekNumber: w.weekNumber, reportSubmitted, meetingMarked, recorded: reportSubmitted && meetingMarked };
      });
      const missedWeeks = weeks.filter((w) => !w.recorded).map((w) => w.weekNumber);

      const o = onboardingBy.get(g.id);
      const allOnboarded = members.every((m) => onboardedIds.has(m));
      const start = o?.assignedAt ? new Date(o.assignedAt).getTime() : null;
      const end = o?.completedAt ? new Date(o.completedAt).getTime() : null;
      const days = start !== null ? Math.max(0, ((end ?? now.getTime()) - start) / DAY_MS) : null;
      const late = days !== null && days > rules.onboardingMaxDays;

      const health: PersonHealth = missedWeeks.length >= rules.supportRedMissedWeeks
        ? 'critical'
        : missedWeeks.length >= rules.supportAmberMissedWeeks || late ? 'warning' : 'good';

      return {
        supportId: g.supportId as string,
        groupId: g.id,
        members: members.length,
        weeks,
        missedWeeks,
        health,
        onboarding: {
          assignedAt: o?.assignedAt ?? null,
          completedAt: o?.completedAt ?? null,
          allOnboarded,
          days: days === null ? null : Math.round(days * 10) / 10,
          late,
        },
      };
    });
};
