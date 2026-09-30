import { useSyncExternalStore } from 'react';
import { participantAppApi, pushSubscriptionsApi } from '../services/api';

export type AppAudience = 'participant' | 'staff';

// What the server knows about this participant's app, which a browser tab can't
// work out itself: whether they have ever opened it from the Home Screen, and how
// often they have put off the automatic Get the app sheet. Kept outside React so
// the shell, the banner and the sheet all read the same thing.

export interface AppServerState {
  installedBefore: boolean;
  sheetDismissed: number;
}

let state: AppServerState | null = null;
let audience: AppAudience = 'participant';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Tells the server what this device is, and keeps what it answers. */
export const recordAppState = async (installed: boolean, device: string, notifications: string, who: AppAudience = 'participant') => {
  audience = who;
  try {
    state = who === 'staff'
      ? await pushSubscriptionsApi.recordAppState(installed, device, notifications)
      : await participantAppApi.recordAppState(installed, device, notifications);
    emit();
  } catch { /* offline or signed out: nothing is lost, it is sent next time */ }
};

/** The automatic sheet was shown / put off. Counted so it can back off. */
const sendSheet = (action: 'shown' | 'dismissed') =>
  (audience === 'staff' ? pushSubscriptionsApi.recordSetupSheet(action) : participantAppApi.recordSetupSheet(action)).catch(() => {});
export const noteSheetShown = () => { void sendSheet('shown'); };
export const noteSheetDismissed = () => {
  if (state) { state = { ...state, sheetDismissed: state.sheetDismissed + 1 }; emit(); }
  void sendSheet('dismissed');
};

export const useAppServerState = (): AppServerState | null =>
  useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state,
  );
