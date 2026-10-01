// A meeting call can be joined from 10 minutes before it starts until it ends
// (60 minutes when no length is set), on the meeting's day in Lagos time, or any
// time while the meeting is marked live.
export const JOIN_LEAD_MINUTES = 10;

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
  durationMins: number | null | undefined,
  now: Date = new Date(),
  live = false,
): boolean => {
  if (live) return true;
  const start = startMinutes(time);
  if (!day || start === null || !DAY_NAMES.includes(day.toUpperCase())) return false;
  const here = lagosNow(now);
  if (here.day !== day.toUpperCase()) return false;
  return here.minutes >= start - JOIN_LEAD_MINUTES && here.minutes <= start + (durationMins || 60);
};
