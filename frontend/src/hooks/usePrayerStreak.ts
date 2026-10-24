import { useCallback, useEffect, useState } from 'react';
import { prayerStreakApi } from '../services/api';
import type { PrayerStreak } from '../types';

// The prayer streak for the signed-in participant or support: null until it loads, and `available: false` when prayers have not
// started for them (or they are a teen). A failed load stays quiet: the streak is a bonus, never something that blocks a page.
export const usePrayerStreak = () => {
  const [streak, setStreak] = useState<PrayerStreak | null>(null);
  const reload = useCallback(async () => {
    try { setStreak(await prayerStreakApi.get()); } catch { /* keep what we had */ }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { streak, reload };
};
