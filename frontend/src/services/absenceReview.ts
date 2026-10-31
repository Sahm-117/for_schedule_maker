import { supabase } from '../lib/supabase';
import { getSessionToken } from './supabase-api';

// Missed classes (FLOW_MAP rule 119): who missed class 1 and class 2 before class 3, and who moved to the next cohort
// automatically after also missing class 3, with undo for three days. Admins only; the database refuses everyone else.

export type AbsenceReviewPerson = {
  participantId: string;
  fullName: string;
  ageRange: string | null;
  groupName: string | null;
  supportName: string | null;
  isTeen: boolean;
};

export type AbsenceReviewMoveRow = { id: string; participantId: string; fullName: string; groupName: string | null; movedAt: string; undoUntil?: string };

export type AbsenceReviewState = {
  open: boolean;
  cohortId?: string;
  cohortName?: string;
  saturday?: string | null;
  /** When anyone also absent from class 3 moves automatically (class 3's day, 4 pm Lagos). */
  moveAt?: string | null;
  done?: { at: string; by: string | null; automatic?: boolean; moved: number; kept: number } | null;
  people?: AbsenceReviewPerson[];
  undoable?: AbsenceReviewMoveRow[];
};

const fail = (message: string): never => {
  if (message.includes('SESSION_EXPIRED')) throw new Error('SESSION_EXPIRED');
  if (message.includes('NOT_ALLOWED')) throw new Error('Only admins can see missed classes.');
  throw new Error(message.replace(/^.*?ERROR:\s*/, '') || 'Something went wrong. Please try again.');
};

export const absenceReviewApi = {
  async state(): Promise<AbsenceReviewState> {
    const { data, error } = await supabase.rpc('absence_review_state', { p_token: getSessionToken() });
    if (error) fail(error.message);
    return (data ?? { open: false }) as AbsenceReviewState;
  },
  async undo(moveId: string): Promise<void> {
    const { error } = await supabase.rpc('absence_review_undo', { p_token: getSessionToken(), p_move_id: moveId });
    if (error) fail(error.message);
  },
};
