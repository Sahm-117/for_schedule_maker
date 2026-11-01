import { sundayMarkMissed, type CohortPeoplePayload } from './programmeRules';

export interface MissDetail {
  /** Classes that count as missed, and how. */
  sunday: Array<{ weekNumber: number; how: string }>;
  /** Group meetings marked Missed (Excused ones are not misses). */
  meeting: number[];
  /** Weeks gone by with no class mark at all. These do not count as misses. */
  unmarked: number[];
}

const SUNDAY_HOW: Record<string, string> = {
  ABSENT: 'Absent',
};

/** One person's standing in one judged week: their class mark (null = none), whether the week came before they were added, and their group-meeting mark. */
export interface PersonWeek {
  weekNumber: number;
  status: string | null;
  lateExcused?: boolean;
  /** The class date is before the day they were added, so they were not enrolled yet. */
  beforeJoining: boolean;
  meeting: string | null;
}

/**
 * The one walk over each person's judged weeks, oldest first, that the "why" lists and the class dots both read.
 * `skipUnmarkedWeeks` leaves out a week nobody has a class mark for (e.g. today's class before the register is taken).
 */
export const walkPersonWeeks = (
  people: CohortPeoplePayload,
  weeks: Array<{ id: number; weekNumber: number; classDate?: string | null }>,
  judgedWeekNumbers: number[],
  options: { skipUnmarkedWeeks?: boolean } = {},
): Map<string, PersonWeek[]> => {
  const markedWeekIds = new Set(people.sunday.map((r) => r.weekId));
  const judged = weeks
    // For the class dots (skipUnmarkedWeeks) a week counts when its register has marks, even if it isn't in the judged
    // list (e.g. a class week with no date set, like Cohort 10's week 1), and a week nobody was marked in is left out.
    .filter((w) => (options.skipUnmarkedWeeks
      ? markedWeekIds.has(w.id)
      : judgedWeekNumbers.includes(w.weekNumber)))
    .sort((a, b) => a.weekNumber - b.weekNumber);
  const sundayBy = new Map<string, Map<number, { status: string; lateExcused?: boolean }>>();
  people.sunday.forEach((r) => {
    if (!sundayBy.has(r.participantId)) sundayBy.set(r.participantId, new Map());
    sundayBy.get(r.participantId)!.set(r.weekId, { status: r.status, lateExcused: r.lateExcused });
  });
  const meetingBy = new Map<string, Map<number, string>>();
  people.meeting.forEach((r) => {
    if (!meetingBy.has(r.participantId)) meetingBy.set(r.participantId, new Map());
    meetingBy.get(r.participantId)!.set(r.weekId, r.status);
  });

  const out = new Map<string, PersonWeek[]>();
  people.participants.forEach((p) => {
    const joinedOn = String(p.createdAt ?? '').slice(0, 10);
    out.set(p.id, judged.map((w) => {
      const sunday = sundayBy.get(p.id)?.get(w.id);
      return {
        weekNumber: w.weekNumber,
        status: sunday?.status ?? null,
        lateExcused: sunday?.lateExcused,
        beforeJoining: !!w.classDate && !!joinedOn && w.classDate.slice(0, 10) < joinedOn,
        meeting: meetingBy.get(p.id)?.get(w.id) ?? null,
      };
    }));
  });
  return out;
};

/**
 * What stands behind each person's "Keep an eye on" / "Needs attention": the weeks they missed.
 * Same counting as `evaluateParticipants`, so the lists always add up to the numbers behind the status.
 */
export const buildMissDetails = (
  people: CohortPeoplePayload,
  weeks: Array<{ id: number; weekNumber: number; classDate?: string | null }>,
  judgedWeekNumbers: number[],
): Map<string, MissDetail> => {
  const out = new Map<string, MissDetail>();
  walkPersonWeeks(people, weeks, judgedWeekNumbers).forEach((personWeeks, id) => {
    const detail: MissDetail = { sunday: [], meeting: [], unmarked: [] };
    personWeeks.forEach((w) => {
      // A week before they were added is not "no mark": they were not enrolled yet.
      if (w.status === null) { if (!w.beforeJoining) detail.unmarked.push(w.weekNumber); }
      else if (sundayMarkMissed({ status: w.status })) detail.sunday.push({ weekNumber: w.weekNumber, how: SUNDAY_HOW[w.status] ?? 'Absent' });
      if (w.meeting === 'MISSED') detail.meeting.push(w.weekNumber);
    });
    out.set(id, detail);
  });
  return out;
};
