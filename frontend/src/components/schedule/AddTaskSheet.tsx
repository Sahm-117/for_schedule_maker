import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Spinner from '../Spinner';
import { addDays } from '../../utils/planner';
import { formatTaskDate } from '../../utils/checklist';

interface AddTaskSheetProps {
  /** Today in Lagos, YYYY-MM-DD. */
  today: string;
  /** The date picked when it opens (a rest week's last day, say). */
  defaultDate?: string | null;
  /** A task with no deadline is allowed (not for a rest-week task, which needs a date). */
  allowNoDeadline: boolean;
  /** Extra one-tap dates (the last day of each rest week). */
  quickPicks?: Array<{ label: string; date: string }>;
  onAdd: (label: string, dueDate: string | null) => Promise<void>;
  onClose: () => void;
}

const chip = (on: boolean) => `min-h-[40px] rounded-full border px-3.5 text-[13px] font-semibold ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700'}`;

/** A support's own task: what to do, and by when. Only they see it. */
const AddTaskSheet: React.FC<AddTaskSheetProps> = ({ today, defaultDate = null, allowNoDeadline, quickPicks = [], onAdd, onClose }) => {
  const [label, setLabel] = useState('');
  const [date, setDate] = useState<string | null>(defaultDate ?? (allowNoDeadline ? null : today));
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tomorrow = addDays(today, 1);
  const quick = [{ label: 'Today', date: today }, { label: 'Tomorrow', date: tomorrow }, ...quickPicks];
  const isQuick = date !== null && quick.some((q) => q.date === date);
  const canSave = label.trim().length >= 2 && (allowNoDeadline || !!date) && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await onAdd(label.trim(), date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Please try again.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} />
      <div className="relative w-full max-w-[420px] rounded-t-[28px] bg-white px-5 pb-6 pt-3 shadow-[0_28px_80px_rgba(15,23,42,0.25)] sm:rounded-[28px]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add a task">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 sm:hidden" />
        <h2 className="text-xl font-extrabold text-gray-900">Add a task</h2>
        <p className="mt-1 text-[13px] text-gray-500">Only you will see this on your list.</p>

        <label htmlFor="new-task-label" className="mt-4 block text-[12.5px] font-bold text-gray-700">What needs doing?</label>
        <input
          id="new-task-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
          maxLength={140}
          autoFocus
          placeholder="e.g. Call two people from my group"
          className="mt-1.5 min-h-[48px] w-full rounded-2xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />

        <p className="mt-4 text-[12.5px] font-bold text-gray-700">Deadline</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {quick.map((q) => (
            <button key={q.label} type="button" aria-pressed={!picking && date === q.date} onClick={() => { setDate(q.date); setPicking(false); }} className={chip(!picking && date === q.date)}>{q.label}</button>
          ))}
          <button type="button" aria-pressed={picking || (!!date && !isQuick)} onClick={() => setPicking(true)} className={chip(picking || (!!date && !isQuick))}>
            {date && !isQuick && !picking ? formatTaskDate(date) : 'Pick a date…'}
          </button>
          {allowNoDeadline && (
            <button type="button" aria-pressed={!picking && date === null} onClick={() => { setDate(null); setPicking(false); }} className={chip(!picking && date === null)}>No deadline</button>
          )}
        </div>
        {picking && (
          <input
            type="date"
            aria-label="Deadline date"
            value={date ?? ''}
            min={today}
            onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
            className="mt-3 min-h-[48px] w-full rounded-2xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        )}

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl bg-gray-100 py-3.5 text-[15px] font-bold text-gray-700">Cancel</button>
          <button type="button" onClick={() => { void save(); }} disabled={!canSave} className="flex-[2] rounded-2xl bg-primary py-3.5 text-[15px] font-extrabold text-white disabled:opacity-50">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Adding…</span>) : 'Add task'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AddTaskSheet;
