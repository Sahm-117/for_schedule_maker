// Post-class feedback timings: when supports and participants get asked about
// a week's class, and which week the department prompt opens from. Mirrors
// class_feedback_release_at() in
// supabase/migrations/20260925080000_class_feedback_department_prompt.sql
// exactly, same day-counted-from-class-Sunday vocabulary as recapReleaseTimes.ts.

import { RECAP_DAY_OPTIONS, recapReleaseAt } from './recapReleaseTimes';

export const CLASS_FEEDBACK_DAY_OPTIONS = RECAP_DAY_OPTIONS;

export interface ClassFeedbackTimes {
  supportDay: string;
  supportTime: string;
  participantDay: string;
  participantTime: string;
  /** Week number the department prompt opens from. Null = off. */
  departmentWeek: number | null;
}

export const DEFAULT_CLASS_FEEDBACK_TIMES: ClassFeedbackTimes = {
  supportDay: 'SUNDAY',
  supportTime: '12:00',
  participantDay: 'SUNDAY',
  participantTime: '12:00',
  departmentWeek: null,
};

const DAY_ORDER = CLASS_FEEDBACK_DAY_OPTIONS.map((d) => d.value);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const normaliseClassFeedbackTimes = (value: unknown): ClassFeedbackTimes => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const day = (v: unknown, fallback: string) =>
    typeof v === 'string' && DAY_ORDER.includes(v.toUpperCase()) ? v.toUpperCase() : fallback;
  const time = (v: unknown, fallback: string) => (typeof v === 'string' && TIME_RE.test(v) ? v : fallback);
  const week = Number(source.departmentWeek);
  return {
    supportDay: day(source.supportDay, DEFAULT_CLASS_FEEDBACK_TIMES.supportDay),
    supportTime: time(source.supportTime, DEFAULT_CLASS_FEEDBACK_TIMES.supportTime),
    participantDay: day(source.participantDay, DEFAULT_CLASS_FEEDBACK_TIMES.participantDay),
    participantTime: time(source.participantTime, DEFAULT_CLASS_FEEDBACK_TIMES.participantTime),
    departmentWeek: Number.isFinite(week) && week >= 1 ? Math.floor(week) : null,
  };
};

/** The moment (as a real Date/instant) a week's class feedback opens for one audience. */
export const classFeedbackReleaseAt = (
  cohortStartDate: string | null | undefined,
  weekNumber: number,
  day: string,
  time: string,
): Date | null => recapReleaseAt(cohortStartDate, weekNumber, day, time);
