import { createContext, useContext } from 'react';

interface PracticeEntryValue {
  /** Initial cohort and pulse reads have settled. */
  ready: boolean;
  /** Practice is switched on and this person is in it. */
  on: boolean;
  /** A real cohort has started, so Practice leaves the quick actions and lives under More. */
  started: boolean;
  /** Switch to the Practice cohort (if needed) and open the Practice pop-up. */
  open: () => Promise<void>;
  /** Retry the reads needed to enter Practice. */
  retry: () => Promise<void>;
}

const PracticeEntryContext = createContext<PracticeEntryValue>({ ready: false, on: false, started: false, open: async () => {}, retry: async () => {} });

export const PracticeEntryProvider = PracticeEntryContext.Provider;
export const usePracticeEntry = () => useContext(PracticeEntryContext);
