import React, { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { plannerApi } from '../../services/api';
import { formatPlannerDate, type PlannerPullForward } from '../../utils/planner';

interface PullForwardSheetProps {
  pull: PlannerPullForward | null;
  onClose: () => void;
  today: string;
  onApplied: () => void;
}

type Preview = Awaited<ReturnType<typeof plannerApi.pullForward>>;

/** The mirror of the clash card: classes pushed past an event that no longer stops FOF move back up. */
const PullForwardSheet: React.FC<PullForwardSheetProps> = ({ pull, onClose, today, onApplied }) => {
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setPreview(null);
    setError('');
    if (!pull) return;
    let cancelled = false;
    plannerApi.pullForward(pull.cohort.key, pull.dates, false)
      .then((result) => { if (!cancelled) setPreview(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not work out what moves.'); });
    return () => { cancelled = true; };
  }, [pull]);

  const apply = async () => {
    if (!pull) return;
    setApplying(true);
    try {
      await plannerApi.pullForward(pull.cohort.key, pull.dates, true);
      toast({ message: `${pull.cohort.name}’s classes moved back up.`, tone: 'success' });
      onApplied();
      onClose();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not move the classes.', tone: 'error' });
    } finally {
      setApplying(false);
    }
  };

  if (!pull) return null;
  const endMoved = !!preview && preview.endAfter !== preview.endBefore;

  return (
    <ModalShell
      isOpen={!!pull}
      onClose={onClose}
      title="Fill the free Sunday"
      subtitle={pull.cohort.name}
      footer={(
        <>
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95">Keep current dates</button>
          <button type="button" onClick={() => void apply()} disabled={!preview || applying} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {applying ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Moving…</span>) : 'Apply new dates'}
          </button>
        </>
      )}
    >
      <div className="mb-4 rounded-2xl bg-emerald-100/80 p-3.5 text-sm text-emerald-700">
        <p className="font-semibold">{pull.event.name} no longer stops FOF.</p>
        <p className="mt-1">{pull.cohort.name} still skips that Sunday. The classes can move back up to fill it.</p>
      </div>
      <p className="mb-4 text-sm font-semibold text-gray-700">Preview only — no dates have changed.</p>
      {error ? (
        <p className="rounded-2xl bg-red-100/80 p-3 text-sm text-red-700">{error}</p>
      ) : !preview ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Spinner className="h-4 w-4" />Working out what moves…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <caption className="bg-gray-50 px-3 py-2.5 text-left font-semibold text-gray-900">Proposed class dates</caption>
              <thead className="border-y border-gray-200 text-[11px] text-gray-500"><tr><th scope="col" className="px-3 py-2">Class</th><th scope="col" className="px-3 py-2">Current</th><th scope="col" className="px-3 py-2">Proposed</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {preview.moves.map((move) => <tr key={move.weekNumber}><th scope="row" className="px-3 py-2 font-semibold text-gray-700">{move.weekNumber}</th><td className="px-3 py-2 text-gray-500">{formatPlannerDate(move.from, false, today)}</td><td className="px-3 py-2 font-semibold text-gray-900">{formatPlannerDate(move.to, false, today)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="rounded-2xl bg-gray-50 p-3.5 text-sm text-gray-600">
            <p className="font-semibold text-gray-900">If you apply these dates</p>
            <p className="mt-2">
              End date: {endMoved
                ? <><b className="text-gray-900">moves to {formatPlannerDate(preview.endAfter, false, today)}</b> (was {formatPlannerDate(preview.endBefore, false, today)})</>
                : <><b className="text-gray-900">{formatPlannerDate(preview.endAfter, false, today)}, unchanged</b> ✓</>}
            </p>
            <p className="mt-2">Sundays another event still stops stay skipped. Later cohorts are not moved.</p>
          </div>
          <p className="text-xs text-gray-500">Apply new dates updates the schedule, class reminders and participant app. It is logged and can be undone.</p>
        </div>
      )}
    </ModalShell>
  );
};

export default PullForwardSheet;
