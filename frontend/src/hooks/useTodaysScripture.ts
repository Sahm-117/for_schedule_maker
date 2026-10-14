import { useEffect, useState } from 'react';
import { scripturesApi, settingsApi } from '../services/api';
import { scriptureDayIndex, scriptureForDay, scripturePosition } from '../utils/participantApp';

// Today's Inspirational Scripture for the signed-in person's cohort, worked out the same way as the
// card on their Home (first-day setting, the day opens at 3 pm Lagos). Null when scriptures are switched off,
// it is not that day yet, or it could not be loaded. Loaded once per use.
export const useTodaysScripture = (cohortStartDate: string | null | undefined, enabled = true): { dayNumber: number; imageUrl: string } | null => {
  const [today, setToday] = useState<{ dayNumber: number; imageUrl: string } | null>(null);

  useEffect(() => {
    if (!enabled || !cohortStartDate) { setToday(null); return undefined; }
    let cancelled = false;
    Promise.all([settingsApi.getScripturesEnabled(), settingsApi.getScriptureStartDay(), scripturesApi.getAll()])
      .then(([on, startDay, { scriptures }]) => {
        if (cancelled) return;
        if (!on) { setToday(null); return; }
        const all = scriptures.map((s) => ({ dayNumber: s.dayNumber, imageUrl: s.imageUrl }));
        const position = scripturePosition(scriptureDayIndex(cohortStartDate, new Date()), startDay, all.length);
        const found = position ? scriptureForDay(all, position) : null;
        setToday(found ? { dayNumber: found.dayNumber, imageUrl: found.imageUrl } : null);
      })
      .catch(() => { if (!cancelled) setToday(null); });
    return () => { cancelled = true; };
  }, [cohortStartDate, enabled]);

  return today;
};
