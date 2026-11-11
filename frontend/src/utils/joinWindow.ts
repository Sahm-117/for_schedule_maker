// A meeting call can be joined from 10 minutes before it starts until an hour after
// it starts (group meetings have no set length; hub meetings run HUB_MEETING_MINUTES
// and stay joinable to their end), on the meeting's day in Lagos time, or any time
// while the meeting is marked live.
export const JOIN_LEAD_MINUTES = 10;
const JOIN_OPEN_MINUTES = 60;
/** A hub meeting is 75 minutes long, so people know they have time. */
export const HUB_MEETING_MINUTES = 75;

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const lagosNow = (now: Date): { day: string; minutes: number } => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: get('weekday').toUpperCase(), minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
};

const startMinutes = (time: string | null | undefined): number | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

export const isCallJoinable = (
  day: string | null | undefined,
  time: string | null | undefined,
  now: Date = new Date(),
  live = false,
  openMinutes: number = JOIN_OPEN_MINUTES,
): boolean => {
  if (live) return true;
  const start = startMinutes(time);
  if (!day || start === null || !DAY_NAMES.includes(day.toUpperCase())) return false;
  const here = lagosNow(now);
  if (here.day !== day.toUpperCase()) return false;
  return here.minutes >= start - JOIN_LEAD_MINUTES && here.minutes <= start + openMinutes;
};

/** When the Join button opens: "today at 7:50 PM", or "Friday at 7:50 PM" (next week's, once tonight's window has closed). */
export const joinOpensLabel = (day: string | null | undefined, time: string | null | undefined, now: Date = new Date()): string | null => {
  const start = startMinutes(time);
  if (!day || start === null || !DAY_NAMES.includes(day.toUpperCase())) return null;
  const opens = Math.max(0, start - JOIN_LEAD_MINUTES);
  const hour = Math.floor(opens / 60);
  const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${String(opens % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
  const here = lagosNow(now);
  if (here.day === day.toUpperCase()) return here.minutes < opens ? `today at ${clock}` : `next ${day.charAt(0).toUpperCase()}${day.slice(1).toLowerCase()} at ${clock}`;
  return `${day.charAt(0).toUpperCase()}${day.slice(1).toLowerCase()} at ${clock}`;
};

/** The "meeting today" banner stays as long as the call can be joined, so someone arriving late still gets the Join button. */

/** "before" until the start time, "started" for a short while after it, otherwise null (not today, or long gone). */
export const meetingTodayState = (
  day: string | null | undefined,
  time: string | null | undefined,
  now: Date = new Date(),
  openMinutes: number = JOIN_OPEN_MINUTES,
): 'before' | 'started' | null => {
  const start = startMinutes(time);
  if (!day || start === null || !DAY_NAMES.includes(day.toUpperCase())) return null;
  const here = lagosNow(now);
  if (here.day !== day.toUpperCase()) return null;
  if (here.minutes < start) return 'before';
  return here.minutes <= start + openMinutes ? 'started' : null;
};

export const isMeetingTodayAhead = (day: string | null | undefined, time: string | null | undefined, now: Date = new Date()): boolean =>
  meetingTodayState(day, time, now) !== null;

/** "8:00 PM" from "20:00". */
export const meetingClock = (time: string | null | undefined): string => {
  const start = startMinutes(time);
  if (start === null) return '';
  const h = Math.floor(start / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(start % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** "8:00 – 9:15 PM" for a meeting of `minutes` from "20:00"; "11:30 AM – 12:45 PM" when it crosses noon. */
export const meetingRangeLabel = (time: string | null | undefined, minutes: number): string => {
  const start = startMinutes(time);
  if (start === null) return '';
  const end = (start + minutes) % 1440;
  const endLabel = meetingClock(`${Math.floor(end / 60)}:${String(end % 60).padStart(2, '0')}`);
  const startLabel = meetingClock(time);
  const sameHalf = (start < 720) === (end < 720);
  return `${sameHalf ? startLabel.replace(/ [AP]M$/, '') : startLabel} – ${endLabel}`;
};
