import React from 'react';
import { createPortal } from 'react-dom';

// Groups → "+ New group": build every group with the engine, or make one by hand.

interface NewGroupChooserProps {
  isOpen: boolean;
  onClose: () => void;
  onEngine: () => void;
  onManual: () => void;
  /** People in the cohort with no group yet — shown so the choice is informed. */
  ungroupedCount: number;
}

const OPTION = 'flex w-full items-start gap-3.5 rounded-[22px] bg-white p-4 text-left shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)] transition hover:shadow-[0_1px_2px_rgba(17,24,39,0.06),0_12px_28px_-12px_rgba(17,24,39,0.22)] active:scale-[0.99]';

const NewGroupChooser: React.FC<NewGroupChooserProps> = ({ isOpen, onClose, onEngine, onManual, ungroupedCount }) => {
  if (!isOpen) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="New group">
      <button type="button" className="absolute inset-0 bg-slate-900/45" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full rounded-t-[28px] bg-[#f6f7f9] p-5 shadow-2xl sm:m-4 sm:max-w-md sm:rounded-[28px]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 sm:hidden" />
        <h2 className="text-base font-bold text-gray-900">New group</h2>
        <p className="mt-0.5 text-xs text-gray-500">{ungroupedCount} {ungroupedCount === 1 ? 'person is' : 'people are'} not in a group yet.</p>
        <div className="mt-4 flex flex-col gap-3">
          <button type="button" onClick={onEngine} className={OPTION}>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100/80 text-violet-700">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900">Build with engine</span>
              <span className="mt-0.5 block text-xs text-gray-500">Groups everyone by your rules — size, gender, age — and picks a support for each. You review before anything is saved.</span>
            </span>
          </button>
          <button type="button" onClick={onManual} className={OPTION}>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900">Create manually</span>
              <span className="mt-0.5 block text-xs text-gray-500">Make one group, name it and choose its support yourself.</span>
            </span>
          </button>
        </div>
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-2xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-700 active:scale-95">Cancel</button>
      </div>
    </div>,
    document.body
  );
};

export default NewGroupChooser;
