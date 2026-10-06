import type { SupportChecklistItem } from '../types';
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
    const dueA = a.dueDay ? (DUE_DAYS as readonly string[]).indexOf(a.dueDay) : 99;
    const dueB = b.dueDay ? (DUE_DAYS as readonly string[]).indexOf(b.dueDay) : 99;
    if (dueA !== dueB) return dueA - dueB;
    return a.position - b.position;
  });
