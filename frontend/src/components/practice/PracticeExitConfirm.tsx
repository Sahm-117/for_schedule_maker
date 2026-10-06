import React from 'react';
import ConfirmationModal from '../ConfirmationModal';

// The "are you sure?" shown before anyone leaves practice from a top bar.
// leave = practice participant back to own account, end = end a walkthrough, return = support back to the real cohort.
export type PracticeExitKind = 'leave' | 'end' | 'return';

const COPY: Record<PracticeExitKind, { title: string; message: string; confirmText: string }> = {
  leave: { title: 'Leave practice?', message: 'You will go back to your own account. Your practice progress is kept.', confirmText: 'Back to my account' },
  end: { title: 'End the walkthrough?', message: 'This ends the walkthrough for both of you.', confirmText: 'End walkthrough' },
  return: { title: 'Leave practice?', message: 'You will go back to your real cohort.', confirmText: 'Back to my cohort' },
};

const PracticeExitConfirm: React.FC<{
  kind: PracticeExitKind | null;
  onClose: () => void;
  onConfirm: (kind: PracticeExitKind) => void;
}> = ({ kind, onClose, onConfirm }) => {
  const copy = COPY[kind ?? 'end'];
  return (
    <ConfirmationModal
      isOpen={kind !== null}
      onClose={onClose}
      onConfirm={() => { if (kind) onConfirm(kind); }}
      title={copy.title}
      message={copy.message}
      confirmText={copy.confirmText}
      cancelText="Stay in practice"
      type="warning"
    />
  );
};

export default PracticeExitConfirm;
