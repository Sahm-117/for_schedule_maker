import { useEffect, useState } from 'react';
import { classDateIso, type ClassWeek } from './participantApp';
import { meetingRecordingApi } from '../services/api';

// When a group's (or hub's) weekly meeting can be recorded: from 10 minutes before its set start time
// until midnight (Lagos) at the end of that day. The meeting for week N is the first meeting day on or
// after that week's class date (the class Sunday, or the day it was moved to). Mirrors fof_meeting_window() in the database, which
// enforces it (20261018110000_meeting_recording_window.sql); admins and practice cohorts are not held
// to it. Meetings have no set length.

export const MEETING_OPENS_BEFORE_MINUTES = 10;
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MINUTE_MS = 60000;
const LAGOS_OFFSET_MS = 60 * MINUTE_MS; // Lagos is UTC+1 all year.

export type MeetingWindowState =
  | { state: 'open'; closesAt: Date | null }
  | { state: 'not_set' }
  | { state: 'before'; opensAt: Date }
  | { state: 'after'; closedAt: Date };

/** A Lagos date (YYYY-MM-DD) and clock time (HH:MM) as a real moment. */
const lagosMoment = (dateIso: string, time = '00:00') => {
  const [y, m, d] = dateIso.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, min) - LAGOS_OFFSET_MS);
};

export const meetingWindow = (
  meetingDay: string | null | undefined,
  meetingTime: string | null | undefined,
  week: ClassWeek | null | undefined,
  cohortStartDate: string | null | undefined,
): { opensAt: Date; closesAt: Date } | null => {
  const dayIndex = meetingDay ? DAYS.indexOf(meetingDay.toUpperCase()) : -1;
  if (dayIndex < 0 || !meetingTime || !/^\d{1,2}:\d{2}/.test(meetingTime) || !week || !cohortStartDate) return null;
  const classIso = classDateIso(cohortStartDate, week);
  const classDay = new Date(`${classIso}T00:00:00Z`).getUTCDay();
  const meetingDate = new Date(Date.parse(`${classIso}T00:00:00Z`) + ((dayIndex - classDay + 7) % 7) * 1440 * MINUTE_MS).toISOString().slice(0, 10);
  const start = lagosMoment(meetingDate, meetingTime.slice(0, 5));
  const nextDay = new Date(lagosMoment(meetingDate).getTime() + LAGOS_OFFSET_MS + 1440 * MINUTE_MS).toISOString().slice(0, 10);
  return { opensAt: new Date(start.getTime() - MEETING_OPENS_BEFORE_MINUTES * MINUTE_MS), closesAt: lagosMoment(nextDay) };
};

/** Whether someone may record now. `unrestricted` is for admins and practice cohorts. */
export const meetingWindowState = (
  meetingDay: string | null | undefined,
  meetingTime: string | null | undefined,
  week: ClassWeek | null | undefined,
  cohortStartDate: string | null | undefined,
  now: Date,
  unrestricted = false,
): MeetingWindowState => {
  if (unrestricted) return { state: 'open', closesAt: null };
  if (!meetingDay || !meetingTime) return { state: 'not_set' };
  const window = meetingWindow(meetingDay, meetingTime, week, cohortStartDate);
  // A time is set but the week or cohort is not known yet (still loading): do not block; the database still checks.
  if (!window) return { state: 'open', closesAt: null };
  if (now < window.opensAt) return { state: 'before', opensAt: window.opensAt };
  if (now >= window.closesAt) return { state: 'after', closedAt: window.closesAt };
  return { state: 'open', closesAt: window.closesAt };
};

/** "Sat 17 Oct, 3:50 pm" in Lagos time. */
export const formatLagosMoment = (date: Date) =>
  date.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/** The database's refusal, in plain words; anything else is returned as it is. */
export const friendlyMeetingError = (message: string): string => {
  if (message.includes('MEETING_TIME_NOT_SET')) return 'Set your meeting day and time first.';
  const closed = /MEETING_WINDOW_CLOSED: (\S+)\|(\S+)/.exec(message);
  if (closed) {
    const opens = lagosMoment(closed[1].slice(0, 10), closed[1].slice(11, 16));
    return Date.now() < opens.getTime()
      ? `Recording opens ${formatLagosMoment(opens)}.`
      : 'Recording for this meeting has closed. Ask an admin if something needs changing.';
  }
  return message;
};

/** The current time, refreshed every 30 seconds, so a "not open yet" notice opens by itself. */
export const useMinuteClock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};

/**
 * The window state with an admin's opening applied: while an admin has opened recording for this hub or
 * group and week (meeting_recording_opening), it is open whatever the clock says. Checked once a minute,
 * and only while the normal window is closed. Not available (e.g. not applied yet): the normal state stands.
 */
export const useRecordingOpening = (
  target: { hubId?: string | null; groupId?: string | null },
  weekId: number | null | undefined,
  base: MeetingWindowState,
  clock: Date,
): MeetingWindowState => {
  const [until, setUntil] = useState<Date | null>(null);
  const targetId = target.hubId ?? target.groupId ?? null;
  const minute = Math.floor(clock.getTime() / 60000);
  const closed = base.state !== 'open';
  useEffect(() => {
    if (!closed || !targetId || weekId == null) { setUntil(null); return undefined; }
    let cancelled = false;
    meetingRecordingApi.getOpening({ hubId: target.hubId ?? null, groupId: target.groupId ?? null }, weekId)
      .then((value) => { if (!cancelled) setUntil(value ? new Date(value) : null); })
      .catch(() => { if (!cancelled) setUntil(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed, targetId, weekId, minute]);
  return until && until.getTime() > clock.getTime() ? { state: 'open', closesAt: until } : base;
};
