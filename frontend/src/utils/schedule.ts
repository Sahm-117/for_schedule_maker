import type { Day } from '../types';

export const PROGRAM_DAY_ORDER = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type ProgramDayName = (typeof PROGRAM_DAY_ORDER)[number];

export const getProgramDayIndex = (dayName: string): number => PROGRAM_DAY_ORDER.indexOf(dayName as ProgramDayName);

export const getCurrentProgramDayName = (): ProgramDayName =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()) as ProgramDayName;

export const sortDaysInProgramOrder = <T extends Pick<Day, 'dayName'>>(days: T[]): T[] =>
  [...days].sort((a, b) => getProgramDayIndex(a.dayName) - getProgramDayIndex(b.dayName));

export const getTodayAndUpcomingDayNames = (): string[] => {
  const today = getCurrentProgramDayName();
  const startIndex = getProgramDayIndex(today);
  return startIndex >= 0 ? PROGRAM_DAY_ORDER.slice(startIndex) as string[] : [...PROGRAM_DAY_ORDER];
};

export const isPastProgramDay = (dayName: string): boolean => {
  const todayIndex = getProgramDayIndex(getCurrentProgramDayName());
  const dayIndex = getProgramDayIndex(dayName);
  return dayIndex >= 0 && todayIndex >= 0 && dayIndex < todayIndex;
};
