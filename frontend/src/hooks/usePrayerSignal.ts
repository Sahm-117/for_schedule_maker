import { createContext, useContext } from 'react';
import type { PrayerSignal } from '../types';

// The minute-by-minute answer to "is a corporate prayer open for me, and have I answered it?" (see PrayerSignalProvider).
export interface PrayerSignalValue {
  signal: PrayerSignal | null;
  refresh: () => Promise<void>;
  /** Tell the signal what just happened without waiting for the next check. */
  markAnswered: () => void;
}

export const PrayerSignalContext = createContext<PrayerSignalValue>({ signal: null, refresh: async () => undefined, markAnswered: () => undefined });

export const usePrayerSignal = () => useContext(PrayerSignalContext);
