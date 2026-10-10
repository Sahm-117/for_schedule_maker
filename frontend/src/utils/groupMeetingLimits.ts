// Back-office limits on when a group's call can be set (Settings > Group call limits). The same rules are checked by the
// database (group_meeting_limits_guard) for supports; admins are not held to them.

export interface GroupMeetingLimits {
  /** Allowed days, as the group stores them: 'WEDNESDAY'. */
  days: string[];
  /** Earliest start, 'HH:MM' (24 hour). */
  earliestStart: string;
  /** The call must be over by this time, 'HH:MM'. */
  latestEnd: string;
  /** Allowed lengths in minutes. */
  durations: number[];
}

export const DEFAULT_GROUP_MEETING_LIMITS: GroupMeetingLimits = {
  days: ['WEDNESDAY', 'FRIDAY', 'SATURDAY'],
  earliestStart: '17:00',
  latestEnd: '21:00',
  durations: [45, 60],
};

export const MEETING_DAYS: Array<{ value: string; label: string }> = [
  { value: 'MONDAY', label: 'Monday' }, { value: 'TUESDAY', label: 'Tuesday' }, { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' }, { value: 'FRIDAY', label: 'Friday' }, { value: 'SATURDAY', label: 'Saturday' }, { value: 'SUNDAY', label: 'Sunday' },
];

/** Lengths an admin can allow. */
export const MEETING_DURATION_CHOICES = [30, 45, 60, 75, 90, 120];

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

export const formatDuration = (mins: number): string => (mins < 60 ? `${mins} minutes` : mins === 60 ? '1 hour' : mins % 60 === 0 ? `${mins / 60} hours` : `${Math.floor(mins / 60)} h ${mins % 60} min`);

const dayLabel = (value: string) => MEETING_DAYS.find((d) => d.value === value)?.label ?? value;

/** Accepts whatever is stored and returns usable limits (the defaults for anything missing or unusable). */
export const normalizeMeetingLimits = (raw: unknown): GroupMeetingLimits => {
  const r = (raw ?? {}) as Partial<GroupMeetingLimits>;
  const days = Array.isArray(r.days) ? MEETING_DAYS.map((d) => d.value).filter((d) => r.days!.includes(d)) : [];
  const durations = Array.isArray(r.durations) ? [...new Set(r.durations.map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b) : [];
  const ok = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const limits: GroupMeetingLimits = {
    days: days.length ? days : DEFAULT_GROUP_MEETING_LIMITS.days,
    earliestStart: ok(r.earliestStart) ? r.earliestStart : DEFAULT_GROUP_MEETING_LIMITS.earliestStart,
    latestEnd: ok(r.latestEnd) ? r.latestEnd : DEFAULT_GROUP_MEETING_LIMITS.latestEnd,
    durations: durations.length ? durations : DEFAULT_GROUP_MEETING_LIMITS.durations,
  };
  // A window too short for even the shortest allowed length would leave nothing to pick: fall back.
  return toMinutes(limits.earliestStart) + limits.durations[0] > toMinutes(limits.latestEnd) ? DEFAULT_GROUP_MEETING_LIMITS : limits;
};

/** Start times (15-minute steps) a support can pick: from the earliest start to the latest one that still ends in time for the shortest allowed length. */
export const startTimeOptions = (limits: GroupMeetingLimits): Array<{ value: string; label: string }> => {
  const out: Array<{ value: string; label: string }> = [];
  const last = toMinutes(limits.latestEnd) - limits.durations[0];
  for (let t = toMinutes(limits.earliestStart); t <= last; t += 15) out.push({ value: fromMinutes(t), label: formatClock(fromMinutes(t)) });
  return out;
};

/** A sentence for the "Meeting time rules" hint. */
export const describeMeetingLimits = (limits: GroupMeetingLimits): string =>
  `Group calls can be on ${limits.days.map(dayLabel).join(', ')}, starting at ${formatClock(limits.earliestStart)} or later and finishing by ${formatClock(limits.latestEnd)}, for ${limits.durations.map(formatDuration).join(' or ')}.`;

/** null when the slot fits the limits (or is not a full slot yet), otherwise what to tell the person. */
export const meetingSlotProblem = (slot: { meetingDay: string | null; meetingTime: string | null; meetingDurationMins: number | null }, limits: GroupMeetingLimits): string | null => {
  if (slot.meetingDay && !limits.days.includes(slot.meetingDay)) return `Group calls can only be on ${limits.days.map(dayLabel).join(', ')}.`;
  if (slot.meetingDurationMins && !limits.durations.includes(slot.meetingDurationMins)) return `Group calls can only run for ${limits.durations.map(formatDuration).join(' or ')}.`;
  if (slot.meetingTime) {
    const start = toMinutes(slot.meetingTime);
    const length = slot.meetingDurationMins ?? limits.durations[0];
    if (start < toMinutes(limits.earliestStart) || start + length > toMinutes(limits.latestEnd)) {
      return `Group calls must start at ${formatClock(limits.earliestStart)} or later and finish by ${formatClock(limits.latestEnd)}.`;
    }
  }
  return null;
};
