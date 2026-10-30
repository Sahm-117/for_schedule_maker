import { supabase } from '../lib/supabase';
import { getSessionToken } from './supabase-api';

// Two-absence review before class 3 (FLOW_MAP rule 119): who missed class 1 and class 2, moving them to the next
// cohort, and undoing a move the same day. Admins only; the database refuses everyone else.

export type AbsenceReviewPerson = {
  participantId: string;
  fullName: string;
  ageRange: string | null;
  groupName: string | null;
  supportName: string | null;
  isTeen: boolean;
};

export type AbsenceReviewMoveRow = { id: string; participantId: string; fullName: string; groupName: string | null; movedAt: string };

export type AbsenceReviewState = {
  open: boolean;
  cohortId?: string;
  cohortName?: string;
  saturday?: string | null;
  done?: { at: string; by: string | null; moved: number; kept: number } | null;
  people?: AbsenceReviewPerson[];
  undoable?: AbsenceReviewMoveRow[];
};

export type AbsenceReviewResult = { moved: string[]; skipped: Array<{ name: string; reason: string }> };

const fail = (message: string): never => {
  if (message.includes('SESSION_EXPIRED')) throw new Error('SESSION_EXPIRED');
  if (message.includes('NOT_ALLOWED')) throw new Error('Only admins can run the two-absence review.');
  throw new Error(message.replace(/^.*?ERROR:\s*/, '') || 'Something went wrong. Please try again.');
};

export const absenceReviewApi = {
  async state(): Promise<AbsenceReviewState> {
    const { data, error } = await supabase.rpc('absence_review_state', { p_token: getSessionToken() });
    if (error) fail(error.message);
    return (data ?? { open: false }) as AbsenceReviewState;
  },
  async move(participantIds: string[]): Promise<AbsenceReviewResult> {
    const { data, error } = await supabase.rpc('absence_review_move', { p_token: getSessionToken(), p_participant_ids: participantIds });
    if (error) fail(error.message);
    return data as AbsenceReviewResult;
  },
  async undo(moveId: string): Promise<void> {
    const { error } = await supabase.rpc('absence_review_undo', { p_token: getSessionToken(), p_move_id: moveId });
    if (error) fail(error.message);
  },
};
