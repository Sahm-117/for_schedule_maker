import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { absenceReviewApi, type AbsenceReviewState } from '../../services/absenceReview';

// Missed classes (FLOW_MAP rule 119), on the admin Dashboard and Participants page. From the Saturday before class 3
// it lists everyone marked Absent for class 1 and class 2: anyone also absent from class 3 moves to the next cohort
// automatically at 4 pm on class 3's day. Afterwards it lists who moved, each with Undo for three days.

const dayLabel = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+01:00` : iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
};

const Overlay: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }> = ({ title, onClose, children, footer }) => createPortal(
  <div className="fixed inset-0 z-[80] flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white sm:max-w-2xl sm:rounded-3xl">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100">&times;</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
    </div>
  </div>,
  document.body,
);

const AbsenceReviewCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const toast = useToast();
  const [state, setState] = useState<AbsenceReviewState | null>(null);
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setState(await absenceReviewApi.state()); } catch { setState(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const people = state?.people ?? [];
  const undoable = state?.undoable ?? [];
  const warning = !!state?.open && people.length > 0;
  if (!warning && undoable.length === 0) return null;

  const undo = async (id: string, name: string) => {
    setUndoing(id);
    try {
      await absenceReviewApi.undo(id);
      toast({ message: `${name} is back in their group` });
      void load();
    } catch (e) {
      toast({ tone: 'error', message: (e as Error).message });
    } finally { setUndoing(null); }
  };
  const undoUntil = undoable.map((m) => m.undoUntil).filter(Boolean).sort()[0];

  return (
    <>
      {warning ? (
        <div className={`surface-card flex flex-wrap items-center gap-3 border-l-4 border-l-amber-500 p-4 ${className}`}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{people.length} {people.length === 1 ? 'person' : 'people'} missed class 1 and class 2{state?.cohortName ? ` · ${state.cohortName}` : ''}</p>
            <p className="mt-0.5 text-[13px] text-gray-500">Anyone also absent from class 3 moves to the next cohort automatically{state?.moveAt ? ` on ${dayLabel(state.moveAt)} at 4 pm` : ''}. They and their supports are told the day before. Late, left early and excused don't count as missed.</p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">See who</button>
        </div>
      ) : (
        <div className={`surface-card flex flex-wrap items-center gap-3 p-4 ${className}`}>
          <p className="min-w-0 flex-1 text-sm text-gray-700"><span className="font-semibold text-gray-900">{undoable.length} moved to the next cohort</span> after missing class 1, class 2 and class 3.{undoUntil ? ` You can undo until ${dayLabel(undoUntil)}.` : ''}</p>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50">See who</button>
        </div>
      )}

      {open && (
        <Overlay
          title={warning ? 'Missed class 1 and class 2' : 'Moved to the next cohort'}
          onClose={() => setOpen(false)}
          footer={<button type="button" onClick={() => setOpen(false)} className="inline-flex h-11 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">Done</button>}
        >
          {warning ? (
            <>
              <p className="mb-3 text-[13px] text-gray-500">Nobody moves today. If they're also absent from class 3, they move automatically{state?.moveAt ? ` at 4 pm on ${dayLabel(state.moveAt)}` : ''}, and you can undo any move for three days.</p>
              <div className="grid gap-2">
                {people.map((p) => (
                  <div key={p.participantId} className="rounded-2xl border border-gray-200 px-3.5 py-3">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900">{p.fullName}{p.isTeen && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Teen</span>}</span>
                    <span className="block text-[13px] text-gray-500">{[p.groupName, p.supportName && `Support: ${p.supportName}`].filter(Boolean).join(' · ')}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mb-3 text-[13px] text-gray-500">They left their groups and were archived. Adults are set to join the next cohort; teens keep their teen status for their Teen Support. Undo puts someone back in their group.</p>
              <div className="grid gap-2">
                {undoable.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 px-3.5 py-2.5">
                    <span className="min-w-0 flex-1 text-sm"><span className="font-semibold text-gray-900">{m.fullName}</span>{m.groupName && <span className="text-gray-500"> · was in {m.groupName}</span>}</span>
                    <button type="button" disabled={undoing === m.id} onClick={() => void undo(m.id, m.fullName)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60">{undoing === m.id && <Spinner className="h-3 w-3" />}Undo</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </Overlay>
      )}
    </>
  );
};

export default AbsenceReviewCard;
