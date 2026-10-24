import { useEffect, useState } from 'react';

// "Now", in milliseconds, for a screen that counts down to one or more moments (a register closing,
// a class day starting). Ticking every second re-draws the whole screen (a hundred attendance rows)
// 3,600 times an hour, so it wakes up only when something is about to change: every second inside
// the last minute before a moment, and otherwise at most every 15 seconds, or sooner if a moment is
// nearer than that.
type Moment = string | number | null | undefined;
const toMs = (moment: Moment): number | null => {
  if (moment === null || moment === undefined) return null;
  const ms = typeof moment === 'number' ? moment : new Date(moment).getTime();
  return Number.isNaN(ms) ? null : ms;
};

export const useDeadlineClock = (...moments: Moment[]): number => {
  const [now, setNow] = useState(() => Date.now());
  const key = moments.map(toMs).join('|');
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      const current = Date.now();
      setNow(current);
      const ahead = key.split('|').map(Number).filter((ms) => Number.isFinite(ms) && ms + 1000 > current).map((ms) => ms - current);
      const nearest = ahead.length ? Math.min(...ahead) : Infinity;
      const delay = nearest <= 65_000 ? 1000 : Math.min(15_000, Math.max(1000, nearest - 65_000));
      timer = window.setTimeout(schedule, delay);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [key]);
  return now;
};

/** "49 min", "1 h 5 min", "42 sec": what is left until the deadline. */
export const countdownLabel = (closesAt: string, now: number): string => {
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return 'Closing…';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
};
