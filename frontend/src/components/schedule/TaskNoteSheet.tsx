import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface TaskNoteSheetProps {
  taskLabel: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}

// Shown when a support ticks a task an admin set. The note is optional: Done
// works with the box empty. It is there in case they need to add context.
const TaskNoteSheet: React.FC<TaskNoteSheetProps> = ({ taskLabel, onSave, onCancel }) => {
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/35" onClick={onCancel} />
      <div className="relative mb-20 w-[90vw] max-w-[360px] rounded-[28px] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:mb-0" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Any notes?">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Any notes?</p>
        <p className="mb-4 line-clamp-2 text-center text-sm font-semibold text-gray-900">{taskLabel}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add context if it helps. You can leave this empty."
          maxLength={500}
          className="min-h-[96px] w-full rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-orange-300"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
          <button type="button" onClick={() => onSave(note.trim())} className="rounded-2xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark">Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TaskNoteSheet;
