import { useSyncExternalStore } from 'react';
import { participantAppApi } from '../services/api';

// What the server knows about this participant's app, which a browser tab can't
// work out itself: whether they have ever opened it from the Home Screen, and how
// often they have put off the automatic Get the app sheet. Kept outside React so
// the shell, the banner and the sheet all read the same thing.

export interface AppServerState {
  installedBefore: boolean;
  sheetDismissed: number;
}

let state: AppServerState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Tells the server what this device is, and keeps what it answers. */
export const recordAppState = async (installed: boolean, device: string, notifications: string) => {
  try {
    state = await participantAppApi.recordAppState(installed, device, notifications);
    emit();
  } catch { /* offline or signed out: nothing is lost, it is sent next time */ }
};

/** The automatic sheet was shown / put off. Counted so it can back off. */
export const noteSheetShown = () => { participantAppApi.recordSetupSheet('shown').catch(() => {}); };
export const noteSheetDismissed = () => {
  if (state) { state = { ...state, sheetDismissed: state.sheetDismissed + 1 }; emit(); }
  participantAppApi.recordSetupSheet('dismissed').catch(() => {});
};

export const useAppServerState = (): AppServerState | null =>
  useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state,
  );
