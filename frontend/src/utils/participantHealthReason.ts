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

/**
 * What stands behind each person's "Keep an eye on" / "Needs attention": the weeks they missed.
 * Same counting as `evaluateParticipants`, so the lists always add up to the numbers behind the status.
 */
export const buildMissDetails = (
  people: CohortPeoplePayload,
  weeks: Array<{ id: number; weekNumber: number; classDate?: string | null }>,
  judgedWeekNumbers: number[],
): Map<string, MissDetail> => {
  const judged = weeks.filter((w) => judgedWeekNumbers.includes(w.weekNumber)).sort((a, b) => a.weekNumber - b.weekNumber);
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

  const out = new Map<string, MissDetail>();
  people.participants.forEach((p) => {
    const detail: MissDetail = { sunday: [], meeting: [], unmarked: [] };
    const joinedOn = String(p.createdAt ?? '').slice(0, 10);
    judged.forEach((w) => {
      const sunday = sundayBy.get(p.id)?.get(w.id);
      // A week before they were added is not "no mark": they were not enrolled yet.
      const beforeJoining = !!w.classDate && !!joinedOn && w.classDate.slice(0, 10) < joinedOn;
      if (!sunday) { if (!beforeJoining) detail.unmarked.push(w.weekNumber); }
      else if (sundayMarkMissed(sunday)) detail.sunday.push({ weekNumber: w.weekNumber, how: SUNDAY_HOW[sunday.status] ?? 'Absent' });
      if (meetingBy.get(p.id)?.get(w.id) === 'MISSED') detail.meeting.push(w.weekNumber);
    });
    out.set(p.id, detail);
  });
  return out;
};
