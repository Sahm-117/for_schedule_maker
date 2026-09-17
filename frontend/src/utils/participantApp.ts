// Timing and derived values for the participant app. FOF runs on Lagos time
// (UTC+1, no daylight saving), so every "which day / which week" question is
// answered in Lagos time regardless of the device's zone.

import type { FaithProjectStatus, ParticipantHome, ParticipantHomeWeek, ParticipantReflection } from '../types';
import { normaliseRules, type PersonHealth } from './programmeRules';

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds since 1970 as a Lagos wall-clock reading (use the UTC getters). */
const lagosClock = (now: Date) => new Date(now.getTime() + LAGOS_OFFSET_MS);

/** Whole days from the cohort's start date to today (Lagos). Day 0 is the start date. */
export const daysIntoCohort = (startDate: string | null | undefined, now: Date): number | null => {
  if (!startDate) return null;
  const start = Date.UTC(Number(startDate.slice(0, 4)), Number(startDate.slice(5, 7)) - 1, Number(startDate.slice(8, 10)));
  const clock = lagosClock(now);
  const today = Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate());
  return Math.floor((today - start) / DAY_MS);
};

/** 0 before the cohort starts; week 1 is the first seven days. Matches daily-checks. */
export const currentWeekNumber = (startDate: string | null | undefined, now: Date): number => {
  const days = daysIntoCohort(startDate, now);
  if (days === null || days < 0) return 0;
  return Math.floor(days / 7) + 1;
};

/** The date (Lagos) of a given day of a week, 0 = the week's Sunday. */
export const weekDayDate = (startDate: string, weekNumber: number, dayOffset: number) => {
  const start = Date.UTC(Number(startDate.slice(0, 4)), Number(startDate.slice(5, 7)) - 1, Number(startDate.slice(8, 10)));
  return new Date(start + ((weekNumber - 1) * 7 + dayOffset) * DAY_MS);
};

export const formatTime = (hhmm: string | null | undefined) => {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const titleCaseDay = (value: string | null | undefined) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '';

/** "Tue 14:32" style label in Lagos time, for when something happened. */
export const shortMoment = (iso: string) => {
  const clock = lagosClock(new Date(iso));
  const day = DAY_NAMES[clock.getUTCDay()].slice(0, 3);
  const date = clock.getUTCDate();
  const month = clock.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const time = `${String(clock.getUTCHours()).padStart(2, '0')}:${String(clock.getUTCMinutes()).padStart(2, '0')}`;
  return `${day} ${date} ${month}, ${time}`;
};

export const platformLabel = (platform: string | null | undefined) =>
  platform === 'GOOGLE_MEET' ? 'Google Meet' : platform === 'WHATSAPP' ? 'WhatsApp call' : 'Group call';

export const FAITH_PROJECT_PARTICIPANT_LABEL: Record<FaithProjectStatus, string> = {
  NOT_DRAFTED: 'Not started',
  AWAITING_DRAFT: 'In progress',
  NEEDS_REFINEMENT: 'In review',
  UNDER_REFINEMENT: 'In review',
  APPROVED: 'Approved',
};

/** Misses so far, counted the same way as the programme rules (recorded misses only). */
export const participantMisses = (home: ParticipantHome, now: Date) => {
  const week = currentWeekNumber(home.cohort?.startDate, now);
  const judged = new Set(home.weeks.filter((w) => w.weekNumber < week).map((w) => w.id));
  const rules = normaliseRules(home.rules);
  const sunday = home.sunday.filter((r) => judged.has(r.weekId) && r.status === 'ABSENT').length;
  const meeting = home.meeting.filter((r) => judged.has(r.weekId) && r.status === 'MISSED').length;
  const health: PersonHealth =
    sunday >= rules.participantRedSundayMisses && meeting >= rules.participantRedMeetingMisses
      ? 'critical'
      : sunday + meeting >= 1 ? 'warning' : 'good';
  return { sunday, meeting, health };
};

const CHECK_IN_QUIET_DAYS = 7;

/**
 * Whether to show the "are you okay?" popup: only for keep-an-eye-on / needs-attention,
 * and not again for a week after they answered unless they have missed more since.
 */
export const shouldAskCheckIn = (home: ParticipantHome, now: Date) => {
  const misses = participantMisses(home, now);
  if (misses.health === 'good') return { ask: false, misses };
  const last = home.lastCheckIn;
  if (last) {
    const recent = now.getTime() - new Date(last.createdAt).getTime() < CHECK_IN_QUIET_DAYS * DAY_MS;
    const missedMore = misses.sunday > last.sundayMisses || misses.meeting > last.meetingMisses;
    if (recent && !missedMore) return { ask: false, misses };
  }
  return { ask: true, misses };
};

/** The scripture for today: day N of the cohort opens at 2:00 PM, and the set loops. */
export const scriptureDayIndex = (startDate: string | null | undefined, now: Date): number | null => {
  const days = daysIntoCohort(startDate, now);
  if (days === null) return null;
  const opened = lagosClock(now).getUTCHours() >= 14 ? days + 1 : days;
  return opened >= 1 ? opened : null;
};

export const scriptureForDay = (scriptures: ParticipantHome['scriptures'], day: number) => {
  if (scriptures.length === 0 || day < 1) return null;
  return scriptures[(day - 1) % scriptures.length];
};

export const reflectionFor = (reflections: ParticipantReflection[], weekId: number) =>
  reflections.find((r) => r.weekId === weekId) ?? null;

/** A saved reflection can be changed for seven days after it was first written. */
export const reflectionEditable = (reflection: ParticipantReflection | null, now: Date) =>
  !reflection || now.getTime() - new Date(reflection.createdAt).getTime() < 7 * DAY_MS;

/** Recap has something to read once released. */
export const recapHasContent = (week: ParticipantHomeWeek) =>
  !!(week.recapSummary?.trim() || week.recapDocumentUrl);

/**
 * "You wrote this in week N": an earlier goal (at least one week back), rotating
 * daily so it doesn't show the same entry every visit.
 */
export const pickCallback = (home: ParticipantHome, currentWeek: number, now: Date) => {
  const weekNumberById = new Map(home.weeks.map((w) => [w.id, w.weekNumber]));
  const earlier = home.reflections
    .filter((r) => r.goal?.trim() && (weekNumberById.get(r.weekId) ?? 0) < currentWeek)
    .sort((a, b) => (weekNumberById.get(a.weekId) ?? 0) - (weekNumberById.get(b.weekId) ?? 0));
  if (earlier.length === 0) return null;
  const pick = earlier[Math.floor(now.getTime() / DAY_MS) % earlier.length];
  return {
    weekNumber: weekNumberById.get(pick.weekId) ?? 0,
    text: pick.goal!.trim(),
    prompt: pick.goalDoneAt
      ? 'You kept that one. Worth remembering as you write this week’s.'
      : 'Is it still worth doing? This could be the week.',
  };
};
