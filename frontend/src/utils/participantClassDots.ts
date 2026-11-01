import { sundayMarkAttended, sundayMarkMissed, type CohortPeoplePayload } from './programmeRules';
import { walkPersonWeeks } from './participantHealthReason';

export type ClassDotState = 'attended' | 'absent' | 'excused' | 'none';

export interface ClassDot {
  weekNumber: number;
  state: ClassDotState;
  /** "Present", "Late", "Left early", "Absent", "Excused" or "No mark", for the hover text. */
  label: string;
}

export interface ClassRecord {
  /** One dot per finished class week, oldest first. */
  dots: ClassDot[];
  /** Classes attended (Present, Late, Left early) out of `counted`. */
  attended: number;
  /** The "M" in "N of M": finished classes minus Excused ones, as the programme's completion maths has it (`evaluateParticipants`). A week this person has no mark for still counts; a week nobody was marked in is not a finished class here and is already dropped. */
  counted: number;
  missedLast: boolean;
  /** The last two finished classes were both Absent. */
  missedTwo: boolean;
}

const HOW: Record<string, string> = { PRESENT: 'Present', LATE: 'Late', LEFT_EARLY: 'Left early', ABSENT: 'Absent', EXCUSED: 'Excused' };

/**
 * Each person's run of finished classes, from the cohort-wide class records the page already holds (`cohort_people`).
 * Walks the weeks with `walkPersonWeeks`, the same walk as `buildMissDetails`. Marks are counted as the programme counts them
 * (`sundayMarkAttended` / `sundayMarkMissed`). A real mark is always shown, even from before the person was added; only an
 * unmarked week before they joined is "no mark" (and still counts toward M, like `evaluateParticipants`).
 */
export const buildClassRecords = (
  people: CohortPeoplePayload,
  weeks: Array<{ id: number; weekNumber: number; classDate?: string | null }>,
  judgedWeekNumbers: number[],
): Map<string, ClassRecord> => {
  // A class whose register hasn't been taken yet (no marks for anyone, e.g. today's class before it is marked) is not
  // a finished class here: counting it would show everyone as "no mark" and hide "missed last class" / "2 in a row".
  const out = new Map<string, ClassRecord>();
  walkPersonWeeks(people, weeks, judgedWeekNumbers, { skipUnmarkedWeeks: true }).forEach((personWeeks, id) => {
    if (personWeeks.length === 0) return;
    const dots: ClassDot[] = personWeeks.map((w) => {
      const status = w.status;
      if (!status) return { weekNumber: w.weekNumber, state: 'none', label: 'No mark' };
      if (sundayMarkAttended({ status })) return { weekNumber: w.weekNumber, state: 'attended', label: HOW[status] ?? 'Present' };
      if (sundayMarkMissed({ status })) return { weekNumber: w.weekNumber, state: 'absent', label: 'Absent' };
      if (status === 'EXCUSED') return { weekNumber: w.weekNumber, state: 'excused', label: 'Excused' };
      return { weekNumber: w.weekNumber, state: 'none', label: 'No mark' };
    });
    const attended = dots.filter((d) => d.state === 'attended').length;
    const counted = Math.max(dots.length - dots.filter((d) => d.state === 'excused').length, 0);
    const last = dots[dots.length - 1];
    const before = dots[dots.length - 2];
    out.set(id, {
      dots,
      attended,
      counted,
      missedLast: last?.state === 'absent',
      missedTwo: last?.state === 'absent' && before?.state === 'absent',
    });
  });
  return out;
};
