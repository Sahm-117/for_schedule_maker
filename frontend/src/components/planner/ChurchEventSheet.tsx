import React, { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import ConfirmationModal from '../ConfirmationModal';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { plannerApi } from '../../services/api';
import type { ChurchEvent } from '../../types';
import { classesHitBy, formatPlannerDate, type PlannerCohort } from '../../utils/planner';

const FIELD = 'w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none';
const LABEL = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500';

interface ChurchEventSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The event being edited, or null to add one. */
  event: ChurchEvent | null;
  plan: PlannerCohort[];
  today: string;
  onSaved: () => void;
}

/** Add or edit a church event, warning straight away if a Stops-FOF event lands on a class. */
const ChurchEventSheet: React.FC<ChurchEventSheetProps> = ({ isOpen, onClose, event, plan, today, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stopsFof, setStopsFof] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(event?.name ?? '');
    setStartDate(event?.startDate ?? '');
    setEndDate(event?.endDate ?? '');
    setStopsFof(event?.stopsFof ?? false);
  }, [isOpen, event]);

  const end = endDate || startDate;
  const hits = stopsFof && startDate && end >= startDate
    ? classesHitBy(plan, startDate, end).filter(({ cls }) => cls.date >= today)
    : [];
  const canSave = name.trim() !== '' && !!startDate && end >= startDate && !saving;

  const save = async () => {
    setSaving(true);
    try {
      await plannerApi.saveEvent({ id: event?.id ?? null, name: name.trim(), startDate, endDate: end, stopsFof });
      toast({ message: event ? 'Event updated.' : 'Event added.', tone: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save the event.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setDeleting(true);
    try {
      await plannerApi.deleteEvent(event.id);
      toast({ message: 'Event deleted.', tone: 'success' });
      setConfirmDelete(false);
      onSaved();
      onClose();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not delete the event.', tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={event ? 'Edit church event' : 'Add a church event'}
        footer={
          <>
            {event && (
              <button type="button" onClick={() => setConfirmDelete(true)} className="mr-auto rounded-2xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 active:scale-95">Delete</button>
            )}
            <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={!canSave} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
              {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save event'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className={LABEL}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Church anniversary" className={FIELD} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>From</span>
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value); }} className={FIELD} />
            </label>
            <label className="block">
              <span className={LABEL}>To</span>
              <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={FIELD} />
            </label>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={stopsFof}
            onClick={() => setStopsFof((v) => !v)}
            className={`flex items-center justify-between gap-3 rounded-2xl p-3.5 text-left ${stopsFof ? 'bg-red-100/80' : 'bg-gray-50'}`}
          >
            <span>
              <span className={`block text-sm font-semibold ${stopsFof ? 'text-red-700' : 'text-gray-900'}`}>Stops FOF</span>
              <span className={`block text-xs ${stopsFof ? 'text-red-700' : 'text-gray-500'}`}>No FOF class can hold on these Sundays</span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${stopsFof ? 'bg-red-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${stopsFof ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
          </button>
          <p className="text-xs text-gray-500">Leave it off for events where FOF still holds. They show on the timeline but don’t clash.</p>
          {hits.length > 0 && (
            <div className="rounded-2xl bg-amber-100/80 p-3 text-xs text-amber-700">
              ⚠️ This falls on {hits.map(({ cohort, cls }) => `${cohort.name}’s class ${cls.weekNumber} (${formatPlannerDate(cls.date, true, today)})`).join(', ')}.
              {' '}You’ll choose how to adjust after saving.
            </div>
          )}
        </div>
      </ModalShell>
      <ConfirmationModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this event?"
        message={`“${event?.name ?? ''}” comes off the Planner. Classes already pushed back stay where they are.`}
        confirmText="Delete"
        type="danger"
        confirmLoading={deleting}
      />
    </>
  );
};

export default ChurchEventSheet;
