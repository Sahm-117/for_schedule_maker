import React, { useState } from 'react';
import { createPortal } from 'react-dom';

interface NotInterestedPopupProps {
  contactName: string;
  existingNotes?: string | null;
  onSave: (subReason: string, notes: string) => void;
  onCancel: () => void;
}

const REASONS = [
  { value: 'NOT_A_TCN_MEMBER', label: 'Not a TCN member' },
  { value: 'NOT_A_GOOD_TIME', label: 'Not a good time' },
  { value: 'NOT_INTERESTED', label: 'Just not interested' },
];

const NotInterestedPopup: React.FC<NotInterestedPopupProps> = ({ contactName, existingNotes, onSave, onCancel }) => {
  const [selected, setSelected] = useState('');
  const [notes, setNotes] = useState(existingNotes || '');

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/35" onClick={onCancel} />
      <div className="relative mb-20 w-[90vw] max-w-[340px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Why are they not interested?</p>
        <p className="mb-5 truncate text-center text-sm font-semibold text-gray-900">{contactName}</p>

        <div className="space-y-2">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setSelected(r.value)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                selected === r.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-orange-100 bg-white text-gray-700 hover:bg-orange-50'
              }`}
            >
              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                selected === r.value ? 'border-primary bg-primary' : 'border-gray-300'
              }`}>
                {selected === r.value && (
                  <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="m5 13 4 4L19 7" />
                  </svg>
                )}
              </span>
              {r.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to give context."
            className="mt-1.5 min-h-[80px] w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => onSave(selected, notes.trim())}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NotInterestedPopup;
