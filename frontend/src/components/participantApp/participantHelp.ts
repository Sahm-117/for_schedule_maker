import { useOutletContext } from 'react-router-dom';

// The participant shell hands its pages a way to open the Help sheet (the same one as the
// profile menu's Help item), for places with no support to message yet.
export interface ParticipantOutletContext {
  openHelp: () => void;
}

export const useParticipantHelp = (): (() => void) | null =>
  useOutletContext<ParticipantOutletContext | undefined>()?.openHelp ?? null;
