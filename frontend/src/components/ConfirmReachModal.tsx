import React, { useEffect, useState } from 'react';
import ModalShell from './followups/ModalShell';
import Spinner from './Spinner';

interface ConfirmReachModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** What will happen, in plain words. */
  message: string;
  /** Exactly who it will reach; the count is shown and the names open on request. Confirm stays off when empty. */
  names: string[];
  /** Singular and plural for the count, e.g. ['person', 'people']. */
  noun?: [string, string];
  confirmText: string;
  busy?: boolean;
}

// The confirm step for any action that messages or changes people: how many, who (collapsible), then Confirm.
// Unlike ConfirmationModal it stays open while the action runs, so the button can show it is sending.
const ConfirmReachModal: React.FC<ConfirmReachModalProps> = ({ isOpen, onClose, onConfirm, title, message, names, noun = ['person', 'people'], confirmText, busy = false }) => {
  const [showNames, setShowNames] = useState(false);
  useEffect(() => { if (isOpen) setShowNames(false); }, [isOpen]);
  const count = names.length;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (!busy) onClose(); }}
      title={title}
      stacked
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95 disabled:opacity-60">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy || count === 0} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {busy ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Working…</span>) : confirmText}
          </button>
        </>
      )}
    >
      <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">{message}</p>
      <p className="mt-4 text-sm font-semibold text-gray-900">
        {count === 0 ? `No ${noun[1]} to reach.` : `This reaches ${count} ${count === 1 ? noun[0] : noun[1]}.`}
      </p>
      {count > 0 && (
        <>
          <button type="button" onClick={() => setShowNames((v) => !v)} aria-expanded={showNames} className="mt-1 text-xs font-semibold text-primary-dark hover:underline">
            {showNames ? 'Hide who' : 'Show who'}
          </button>
          {showNames && (
            <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {names.map((name, i) => <li key={`${name}-${i}`}>{name}</li>)}
            </ul>
          )}
        </>
      )}
    </ModalShell>
  );
};

export default ConfirmReachModal;
