import type { Cohort, SupportChecklistItem, Week } from '../types';
import { classDateIso } from './participantApp';
import { addDays, REST_WEEKS, SPARE_WEEKS } from './planner';
import { PROGRAM_DAY_ORDER } from './schedule';

/** The programme week runs Sunday to Saturday; due days follow that order. */
export const DUE_DAYS = PROGRAM_DAY_ORDER;

/** True for a task an admin put on a support's list (taskGroupId is only set by the admin RPC): they can tick it, not change or remove it. */
export const isAdminChecklistTask = (item: Pick<SupportChecklistItem, 'taskGroupId'>): boolean => !!item.taskGroupId;

/**
 * What Home shows first: open before done, admin tasks first, the soonest due day, then the list order.
 * An item just ticked (still in its countdown) keeps its place, so it doesn't jump away under the finger.
 */
export const sortChecklistForHome = <T extends SupportChecklistItem>(items: T[], keepInPlace: ReadonlySet<string> = new Set()): T[] =>
  [...items].sort((a, b) => {
    const doneA = a.done && !keepInPlace.has(a.id);
    const doneB = b.done && !keepInPlace.has(b.id);
    if (doneA !== doneB) return doneA ? 1 : -1;
    const adminA = isAdminChecklistTask(a) ? 0 : 1;
    const adminB = isAdminChecklistTask(b) ? 0 : 1;
    if (adminA !== adminB) return adminA - adminB;
    const dateA = a.dueDate ?? '9999-99-99';
    const dateB = b.dueDate ?? '9999-99-99';
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
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

/** What to say next to a task about its deadline, and how loud: a date task by its date, a class-week task by its weekday. */
export const taskDueText = (item: Pick<SupportChecklistItem, 'dueDate' | 'dueDay' | 'done'>, today: string): { text: string; tone: DueTone } | null => {
  if (item.dueDate) {
    if (!item.done && item.dueDate < today) return { text: `Was due ${formatTaskDate(item.dueDate)}`, tone: 'overdue' };
    if (item.dueDate === today) return { text: 'Due today', tone: 'today' };
    return { text: `Due ${formatTaskDate(item.dueDate)}`, tone: 'soon' };
  }
  if (item.dueDay) return { text: `Due ${item.dueDay}`, tone: 'soon' };
  return null;
};

/** Which weekday of the class week a task sits on: its date's weekday when that falls inside the week, else its due day, else none. */
export const taskDayName = (item: Pick<SupportChecklistItem, 'dueDate' | 'dueDay'>, span: { start: string; end: string } | null): string | null => {
  if (item.dueDate) return span && item.dueDate >= span.start && item.dueDate <= span.end ? dayNameOfIso(item.dueDate) : null;
  return item.dueDay ?? null;
};

/**
 * What Home lists: this class week's tasks, plus tasks that have only a date when it falls in this week, or, once the last
 * class week is over (the rest weeks), every date task that is still open or still to come.
 */
export const tasksForHome = (
  items: SupportChecklistItem[],
  weekId: number | null,
  span: { start: string; end: string } | null,
  pastLastWeek: boolean,
  today: string,
): SupportChecklistItem[] => items.filter((item) => {
  if (item.weekId !== null) return item.weekId === weekId;
  if (!item.dueDate) return false;
  if (span && item.dueDate >= span.start && item.dueDate <= span.end) return true;
  return pastLastWeek && (!item.done || item.dueDate >= today);
});
