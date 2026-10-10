// Back-office limits on when a group's call can be set (Settings > Group call limits). The same rules are checked by the
// database (group_meeting_limits_guard) for supports; admins are not held to them.

export interface DayWindow {
  /** Earliest start, 'HH:MM' (24 hour). */
  earliestStart: string;
  /** Latest start, 'HH:MM'. */
  latestStart: string;
}

export interface GroupMeetingLimits extends DayWindow {
  /** Allowed days, as the group stores them: 'WEDNESDAY'. */
  days: string[];
  /** Own earliest/latest start for a day; a day without an entry uses the top-level window. */
  dayTimes: Record<string, DayWindow>;
}

export const DEFAULT_GROUP_MEETING_LIMITS: GroupMeetingLimits = {
  days: ['WEDNESDAY', 'FRIDAY', 'SATURDAY'],
  earliestStart: '17:00',
  latestStart: '21:00',
  dayTimes: {},
};

export const MEETING_DAYS: Array<{ value: string; label: string }> = [
  { value: 'MONDAY', label: 'Monday' }, { value: 'TUESDAY', label: 'Tuesday' }, { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' }, { value: 'FRIDAY', label: 'Friday' }, { value: 'SATURDAY', label: 'Saturday' }, { value: 'SUNDAY', label: 'Sunday' },
];

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const pad = (n: number) => String(n).padStart(2, '0');
export const fromMinutes = (total: number): string => `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;

export const formatClock = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m || 0)} ${ampm}`;
};

const dayLabel = (value: string) => MEETING_DAYS.find((d) => d.value === value)?.label ?? value;

const isClock = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** A window with both times valid and the start not after the latest start, otherwise null. */
const toWindow = (raw: unknown, legacyEnd?: unknown): DayWindow | null => {
  const r = (raw ?? {}) as { earliestStart?: unknown; latestStart?: unknown };
  const latest = isClock(r.latestStart) ? r.latestStart : legacyEnd;
  return isClock(r.earliestStart) && isClock(latest) && toMinutes(r.earliestStart) <= toMinutes(latest) ? { earliestStart: r.earliestStart, latestStart: latest } : null;
};

/** Accepts whatever is stored and returns usable limits (the defaults for anything missing or unusable). A row saved before
 *  call lengths were dropped has a "latestEnd": it is read as the latest start. */
export const normalizeMeetingLimits = (raw: unknown): GroupMeetingLimits => {
  const r = (raw ?? {}) as Partial<GroupMeetingLimits> & { latestEnd?: unknown };
  const days = Array.isArray(r.days) ? MEETING_DAYS.map((d) => d.value).filter((d) => r.days!.includes(d)) : [];
  const base = toWindow(r, r.latestEnd) ?? { earliestStart: DEFAULT_GROUP_MEETING_LIMITS.earliestStart, latestStart: DEFAULT_GROUP_MEETING_LIMITS.latestStart };
  const dayTimes: Record<string, DayWindow> = {};
  const rawDayTimes = (r.dayTimes && typeof r.dayTimes === 'object' ? r.dayTimes : {}) as Record<string, unknown>;
  for (const d of MEETING_DAYS) {
    const w = toWindow(rawDayTimes[d.value]);
    if (w) dayTimes[d.value] = w;
  }
  return { days: days.length ? days : DEFAULT_GROUP_MEETING_LIMITS.days, ...base, dayTimes };
};

/** The earliest and latest start for one day. */
export const windowForDay = (limits: GroupMeetingLimits, day: string | null | undefined): DayWindow =>
  (day ? limits.dayTimes[day] : undefined) ?? { earliestStart: limits.earliestStart, latestStart: limits.latestStart };

/** Start times (15-minute steps) a support can pick on a day. */
export const startTimeOptions = (limits: GroupMeetingLimits, day: string | null | undefined): Array<{ value: string; label: string }> => {
  const w = windowForDay(limits, day);
  const out: Array<{ value: string; label: string }> = [];
  for (let t = toMinutes(w.earliestStart); t <= toMinutes(w.latestStart); t += 15) out.push({ value: fromMinutes(t), label: formatClock(fromMinutes(t)) });
  return out;
};

const sameWindow = (a: DayWindow, b: DayWindow) => a.earliestStart === b.earliestStart && a.latestStart === b.latestStart;

/** A sentence for the "Meeting time rules" hint and the Settings summary: days sharing the same times are grouped. */
export const describeMeetingLimits = (limits: GroupMeetingLimits): string => {
  const groups: Array<{ w: DayWindow; days: string[] }> = [];
  for (const d of limits.days) {
    const w = windowForDay(limits, d);
    const g = groups.find((x) => sameWindow(x.w, w));
    if (g) g.days.push(d); else groups.push({ w, days: [d] });
  }
  const parts = groups.map((g) => `${g.days.map(dayLabel).join(', ')}, starting between ${formatClock(g.w.earliestStart)} and ${formatClock(g.w.latestStart)}`);
  return `Group calls can be on ${parts.join('; ')}.`;
};

/** null when the slot fits the limits (or is not a full slot yet), otherwise what to tell the person. */
export const meetingSlotProblem = (slot: { meetingDay: string | null; meetingTime: string | null }, limits: GroupMeetingLimits): string | null => {
  if (slot.meetingDay && !limits.days.includes(slot.meetingDay)) return `Group calls can only be on ${limits.days.map(dayLabel).join(', ')}.`;
  if (slot.meetingTime) {
    const w = windowForDay(limits, slot.meetingDay);
    const start = toMinutes(slot.meetingTime);
    if (start < toMinutes(w.earliestStart) || start > toMinutes(w.latestStart)) {
      return `${slot.meetingDay ? `${dayLabel(slot.meetingDay)} calls` : 'Group calls'} must start between ${formatClock(w.earliestStart)} and ${formatClock(w.latestStart)}.`;
    }
  }
  return null;
};
