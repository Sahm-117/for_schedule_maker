import { createContext, useContext } from 'react';
import type { PrayerSignal } from '../types';

// The minute-by-minute answer to "is a corporate prayer open for me, and have I answered it?" (see PrayerSignalProvider).
export interface PrayerSignalValue {
  signal: PrayerSignal | null;
  refresh: () => Promise<void>;
  /** Tell the signal what just happened without waiting for the next check. */
  markAnswered: () => void;
  /** Open this prayer now (a tap on Home, or a push that opened the prayer page). The screen draws itself over everything. */
  start: (sessionId: string) => void;
  /** The prayer someone asked to open, until its screen is done with. */
  started: string | null;
  clearStarted: () => void;
  /** The live (Telegram) screen wants the screen right now; the daily prayer waits behind it. */
  liveActive: boolean;
  setLiveActive: (active: boolean) => void;
}

export const PrayerSignalContext = createContext<PrayerSignalValue>({
  signal: null, refresh: async () => undefined, markAnswered: () => undefined, start: () => undefined, started: null, clearStarted: () => undefined,
  liveActive: false, setLiveActive: () => undefined,
});

export const usePrayerSignal = () => useContext(PrayerSignalContext);
