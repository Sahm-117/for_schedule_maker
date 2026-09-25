// Sunday class start time: shown in the Saturday/Sunday "See you tomorrow" /
// "Church today" participant nudges (see push-reminders/index.ts). A plain
// HH:mm (24hr) string, same shape as the time half of recapReleaseTimes.ts.

export const DEFAULT_CLASS_START_TIME = '09:30';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const normaliseClassStartTime = (value: unknown): string =>
  typeof value === 'string' && TIME_RE.test(value) ? value : DEFAULT_CLASS_START_TIME;
