import type { Cohort, SupportChecklistItem, Week } from '../types';
import { classDateIso } from './participantApp';
import { addDays, REST_WEEKS, SPARE_WEEKS } from './planner';
import { PROGRAM_DAY_ORDER } from './schedule';

/** The programme week runs Sunday to Saturday; due days follow that order. */
export const DUE_DAYS = PROGRAM_DAY_ORDER;

/** True for a task an admin put on a support's list (taskGroupId is only set by the admin RPC): they can tick it, not change or remove it. */
export const isAdminChecklistTask = (item: Pick<SupportChecklistItem, 'taskGroupId'>): boolean => !!item.taskGroupId;

/**
 * What Home shows first: open before done, the soonest due (overdue first), admin tasks before your own, then the list order.
 * An item just ticked (still in its countdown) keeps its place, so it doesn't jump away under the finger.
 */
export const sortChecklistForHome = <T extends SupportChecklistItem>(items: T[], keepInPlace: ReadonlySet<string> = new Set(), dueOf?: (item: T) => string | null): T[] =>
  [...items].sort((a, b) => {
    const doneA = a.done && !keepInPlace.has(a.id);
    const doneB = b.done && !keepInPlace.has(b.id);
    if (doneA !== doneB) return doneA ? 1 : -1;
    const dateA = (dueOf ? dueOf(a) : a.dueDate) ?? '9999-99-99';
    const dateB = (dueOf ? dueOf(b) : b.dueDate) ?? '9999-99-99';
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    const adminA = isAdminChecklistTask(a) ? 0 : 1;
    const adminB = isAdminChecklistTask(b) ? 0 : 1;
    if (adminA !== adminB) return adminA - adminB;
    const dueA = a.dueDay ? (DUE_DAYS as readonly string[]).indexOf(a.dueDay) : 99;
    const dueB = b.dueDay ? (DUE_DAYS as readonly string[]).indexOf(b.dueDay) : 99;
    if (dueA !== dueB) return dueA - dueB;
    return a.position - b.position;
  });

/** The Sunday-to-Saturday span of a class week, as YYYY-MM-DD (the programme week starts on its class Sunday). */
export const weekSpan = (cohortStart: string, week: Pick<Week, 'weekNumber' | 'classDate'>): { start: string; end: string } => {
  const start = classDateIso(cohortStart, week);
  return { start, end: addDays(start, 6) };
};

/** The class week whose span holds this date, if any. */
export const weekIdForDate = (cohortStart: string, weeks: Week[], iso: string): number | null =>
  weeks.find((w) => { const span = weekSpan(cohortStart, w); return iso >= span.start && iso <= span.end; })?.id ?? null;

export interface RestWeek { number: number; start: string; end: string }

/**
 * The rest weeks that follow a cohort: the next cycle's rest starts the day after this cohort's cycle ends (its end date, or
 * a spare week after its last class), exactly as the Planner lays them out. Each runs Monday to Sunday.
 */
export const restWeeksAfter = (cohort: Pick<Cohort, 'startDate' | 'endDate'>, weeks: Week[]): RestWeek[] => {
  if (!cohort.startDate || weeks.length === 0) return [];
  const start = cohort.startDate.slice(0, 10);
  const last = weeks.map((w) => classDateIso(start, w)).sort().pop() as string;
  const end = cohort.endDate ? cohort.endDate.slice(0, 10) : addDays(last, 7 * SPARE_WEEKS);
  const cycleEnd = end > last ? end : last;
  return Array.from({ length: REST_WEEKS }, (_, i) => {
    const from = addDays(cycleEnd, 1 + 7 * i);
    return { number: i + 1, start: from, end: addDays(from, 6) };
  });
};

/** "Friday" for a YYYY-MM-DD day. */
export const dayNameOfIso = (iso: string): string => PROGRAM_DAY_ORDER[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** "Fri 4 Dec". */
export const formatTaskDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/** "Fri 4 Dec" / "7 Dec" range for a rest-week tab. */
export const formatTaskRange = (start: string, end: string): string => {
  const f = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return `${f(start)} – ${f(end)}`;
};

export type DueTone = 'overdue' | 'today' | 'soon';

/** What to say next to a task about its deadline, and how loud. `dueIso` is the date worked out for a task that only names a weekday. */
export const taskDueText = (item: Pick<SupportChecklistItem, 'dueDate' | 'dueDay' | 'done'>, today: string, dueIso?: string | null): { text: string; tone: DueTone } | null => {
  const date = item.dueDate ?? dueIso ?? null;
  if (date) {
    if (!item.done && date < today) return { text: `Was due ${formatTaskDate(date)}`, tone: 'overdue' };
    if (date === today) return { text: 'Due today', tone: 'today' };
    return { text: `Due ${formatTaskDate(date)}`, tone: 'soon' };
  }
  if (item.dueDay) return { text: `Due ${item.dueDay}`, tone: 'soon' };
  return null;
};

/** Each class week's Sunday, by week id, so a task that only names a weekday can be given a date. */
export const weekStartMap = (cohortStart: string | null, weeks: Week[]): Map<number, string> =>
  new Map(cohortStart ? weeks.map((week) => [week.id, weekSpan(cohortStart, week).start] as [number, string]) : []);

/** The day a task is due: its own date, else its weekday within its class week, else none. */
export const effectiveDue = (item: Pick<SupportChecklistItem, 'dueDate' | 'dueDay' | 'weekId'>, weekStarts: ReadonlyMap<number, string>): string | null => {
  if (item.dueDate) return item.dueDate;
  if (item.dueDay && item.weekId !== null) {
    const start = weekStarts.get(item.weekId);
    const index = (DUE_DAYS as readonly string[]).indexOf(item.dueDay);
    if (start && index >= 0) return addDays(start, index);
  }
  return null;
};

export interface TaskGroups<T> { overdue: T[]; today: T[]; upcoming: T[]; anytime: T[] }

/** Every task by when it is due, whatever week it was made in: overdue, today, upcoming (soonest first), and no deadline. */
export const groupTasksByDue = <T extends SupportChecklistItem>(items: T[], due: (item: T) => string | null, today: string): TaskGroups<T> => {
  const groups: TaskGroups<T> = { overdue: [], today: [], upcoming: [], anytime: [] };
  const byDate = (a: T, b: T) => (due(a) ?? '').localeCompare(due(b) ?? '') || a.position - b.position;
  items.forEach((item) => {
    const date = due(item);
    if (!date) groups.anytime.push(item);
    else if (date < today) groups.overdue.push(item);
    else if (date === today) groups.today.push(item);
    else groups.upcoming.push(item);
  });
  groups.overdue.sort(byDate); groups.today.sort(byDate); groups.upcoming.sort(byDate);
  groups.anytime.sort((a, b) => a.position - b.position);
  return groups;
};

/** The class week on screen as dates, and whether the last class week is already over (the rest weeks have begun). */
export const scheduleWindow = (
  cohortStartDate: string | null | undefined,
  weeks: Week[],
  active: Week | null,
  today: string,
): { start: string | null; span: { start: string; end: string } | null; pastLastWeek: boolean } => {
  const start = cohortStartDate?.slice(0, 10) ?? null;
  if (!start) return { start: null, span: null, pastLastWeek: false };
  const lastEnd = weeks.map((w) => weekSpan(start, w).end).sort().pop() ?? null;
  return { start, span: active ? weekSpan(start, active) : null, pastLastWeek: !!lastEnd && today > lastEnd };
};
