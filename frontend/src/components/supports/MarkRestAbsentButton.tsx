import React, { useState } from 'react';
import ConfirmationModal from '../ConfirmationModal';

// Quiet link under the "not marked" list that marks everyone left as Absent.
// Deliberately low-key and behind a confirm, so it isn't hit by accident.
const MarkRestAbsentButton: React.FC<{ count: number; sessionTitle: string; onConfirm: () => Promise<void> }> = ({ count, sessionTitle, onConfirm }) => {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  if (count === 0) return null;

  const run = async () => {
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      setRunning(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="pt-2 text-center">
        <button type="button" onClick={() => setConfirming(true)} className="text-xs font-semibold text-red-600 underline underline-offset-2 hover:text-red-700">
          Mark all {count} not marked as absent…
        </button>
      </div>
      <ConfirmationModal
        isOpen={confirming}
        onClose={() => { if (!running) setConfirming(false); }}
        onConfirm={() => { void run(); }}
        title={`Mark ${count} as absent?`}
        message={`Everyone still not marked for "${sessionTitle}" will be marked Absent. You can still change anyone afterwards.`}
        confirmText={`Mark ${count} absent`}
        type="danger"
        confirmLoading={running}
      />
    </>
  );
};

export default MarkRestAbsentButton;
