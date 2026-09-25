// Recap release times: when supports and participants get a week's recap.
// Mirrors recap_release_at() in
// supabase/migrations/20260925060000_recap_release_times.sql exactly, so the
// admin week editor shows the same moment the database actually uses.
//
// Days are counted 0..6 from the week's class Sunday (SUNDAY = that Sunday
// itself, MONDAY = the day after, ... SATURDAY = 6 days after). Africa/Lagos
// has a fixed UTC+1 offset year-round (no DST), so a Lagos wall-clock moment
// converts to UTC by simply appending "+01:00".

export interface RecapReleaseTimes {
  supportDay: string;
  supportTime: string;
  participantDay: string;
  participantTime: string;
}

export const DEFAULT_RECAP_RELEASE_TIMES: RecapReleaseTimes = {
  supportDay: 'SUNDAY',
  supportTime: '16:00',
  participantDay: 'MONDAY',
  participantTime: '18:00',
};

export const RECAP_DAY_OPTIONS = [
  { value: 'SUNDAY', label: 'Sunday' },
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
];

const DAY_ORDER = RECAP_DAY_OPTIONS.map((d) => d.value);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const normaliseRecapReleaseTimes = (value: unknown): RecapReleaseTimes => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const day = (v: unknown, fallback: string) =>
    typeof v === 'string' && DAY_ORDER.includes(v.toUpperCase()) ? v.toUpperCase() : fallback;
  const time = (v: unknown, fallback: string) => (typeof v === 'string' && TIME_RE.test(v) ? v : fallback);
  return {
    supportDay: day(source.supportDay, DEFAULT_RECAP_RELEASE_TIMES.supportDay),
    supportTime: time(source.supportTime, DEFAULT_RECAP_RELEASE_TIMES.supportTime),
    participantDay: day(source.participantDay, DEFAULT_RECAP_RELEASE_TIMES.participantDay),
    participantTime: time(source.participantTime, DEFAULT_RECAP_RELEASE_TIMES.participantTime),
  };
};

/**
 * The moment (as a real Date/instant) a week's recap releases for one
 * audience, given the cohort's class-Sunday start date. Returns null when the
 * cohort has no start date, matching recap_release_at()'s NULL handling.
 */
export const recapReleaseAt = (
  cohortStartDate: string | null | undefined,
  weekNumber: number,
  day: string,
  time: string,
): Date | null => {
  if (!cohortStartDate) return null;
  const startIso = cohortStartDate.slice(0, 10);
  const start = new Date(`${startIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const offset = Math.max(0, DAY_ORDER.indexOf(day.toUpperCase()));
  const targetDate = new Date(start.getTime() + ((weekNumber - 1) * 7 + offset) * 86400000);
  const targetIso = targetDate.toISOString().slice(0, 10);
  const safeTime = TIME_RE.test(time) ? time : '00:00';
  return new Date(`${targetIso}T${safeTime}:00+01:00`);
};

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sun 27 Sep, 4:00 PM", read in Africa/Lagos (fixed UTC+1). */
export const formatRecapReleaseAt = (date: Date | null): string => {
  if (!date) return 'Not set';
  const lagos = new Date(date.getTime() + 60 * 60 * 1000);
  const weekday = WEEKDAY_SHORT[lagos.getUTCDay()];
  const day = lagos.getUTCDate();
  const month = MONTH_SHORT[lagos.getUTCMonth()];
  const hours24 = lagos.getUTCHours();
  const minutes = String(lagos.getUTCMinutes()).padStart(2, '0');
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${weekday} ${day} ${month}, ${hours12}:${minutes} ${ampm}`;
};
