import { useOutletContext } from 'react-router-dom';

// Both shells (participant and staff) hand their pages a way to open the Help sheet (the same one as the
// profile menu's Help item), for places with nobody to message yet.
export interface ShellOutletContext {
  openHelp: () => void;
}

export const useShellHelp = (): (() => void) | null =>
  useOutletContext<ShellOutletContext | undefined>()?.openHelp ?? null;
