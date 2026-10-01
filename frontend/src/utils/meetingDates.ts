const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// The next few times a weekly meeting happens, in Lagos time (UTC+1, no
// daylight saving). `day` is the stored upper-case weekday, `time` is HH:MM.
export const nextOccurrences = (day: string | null | undefined, time: string | null | undefined, count = 2, now: Date = new Date()): string[] => {
  const dayIndex = day ? DAYS.indexOf(day.toUpperCase()) : -1;
  const match = time ? /^(\d{1,2}):(\d{2})/.exec(time) : null;
  if (dayIndex < 0 || !match) return [];
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const lagosNow = new Date(now.getTime() + 60 * 60 * 1000); // read with the UTC getters
  const out: string[] = [];
  for (let i = 0; i < 21 && out.length < count; i += 1) {
    const candidate = new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate() + i, hours, minutes));
    if (candidate.getUTCDay() !== dayIndex || candidate.getTime() <= lagosNow.getTime()) continue;
    out.push(candidate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }));
  }
  return out;
};
