import React, { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { plannerApi } from '../../services/api';
import type { PushBackResult } from '../../types';
import { formatPlannerDate, type PlannerClash } from '../../utils/planner';

interface PushBackSheetProps {
  clash: PlannerClash | null;
  onClose: () => void;
  today: string;
  /** The cohort after this one on the Planner (for the "if another Sunday is lost" note). */
  nextCohortName: string | null;
  /** A warning when the move would leave fewer than 3 cohorts starting in a year, or null. */
  yearWarning: (result: PushBackResult) => string | null;
  onApplied: () => void;
}

/** The clash card: shows "What moves" (a preview from the database) before anything changes. */
const PushBackSheet: React.FC<PushBackSheetProps> = ({ clash, onClose, today, nextCohortName, yearWarning, onApplied }) => {
  const toast = useToast();
  const [preview, setPreview] = useState<PushBackResult | null>(null);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const weekId = clash?.cls.weekId ?? null;

  useEffect(() => {
    setPreview(null);
    setError('');
    if (!clash || weekId === null) return;
    let cancelled = false;
    plannerApi.pushBack(weekId, clash.event.id, false)
      .then((result) => { if (!cancelled) setPreview(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not work out what moves.'); });
    return () => { cancelled = true; };
  }, [clash, weekId]);

  const apply = async () => {
    if (!clash || weekId === null) return;
    setApplying(true);
    try {
      await plannerApi.pushBack(weekId, clash.event.id, true);
      toast({ message: `${clash.cohort.name}’s schedule updated.`, tone: 'success' });
      onApplied();
      onClose();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not move the classes.', tone: 'error' });
    } finally {
      setApplying(false);
    }
  };

  if (!clash) return null;
  const when = formatPlannerDate(clash.cls.date, true, today);
  const endMoved = !!preview && preview.endAfter !== preview.endBefore;
  const warning = preview ? yearWarning(preview) : null;

  return (
    <ModalShell
      isOpen={!!clash}
      onClose={onClose}
      title="Resolve a Sunday clash"
      subtitle={`${clash.cohort.name} · Class ${clash.cls.weekNumber} · ${when}`}
      footer={weekId === null ? (
        <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95">Close</button>
      ) : (
        <>
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95">Keep current dates</button>
          <button type="button" onClick={() => void apply()} disabled={!preview || applying} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {applying ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Moving…</span>) : 'Apply new dates'}
          </button>
        </>
      )}
    >
      <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-3.5 text-sm text-red-800">
        <p className="font-semibold">Class {clash.cls.weekNumber} and {clash.event.name} fall on {when}.</p>
        <p className="mt-1">This event blocks Sunday classes. Class {clash.cls.weekNumber} is still on the schedule.</p>
      </div>
      <p className="mb-4 text-sm font-semibold text-gray-700">Preview only — no dates have changed.</p>
      {weekId === null ? (
        <p className="text-sm text-gray-600">
          {clash.cohort.name} is only planned so far. Once it’s created on the Cohorts page, you can push this class back from here.
        </p>
      ) : error ? (
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
          <div className="rounded-2xl bg-gray-50 p-3.5 text-sm">
            <p className="font-semibold text-gray-900">If you apply these dates</p>
            <div className="mt-2 space-y-2 text-gray-600">
              <p>
                Spare weeks: {preview.spareWeeksBefore > 0
                  ? <><b className="text-gray-900">{preview.spareWeeksBefore} available → {preview.spareWeeksAfter} available</b></>
                  : <b className="text-gray-900">none available</b>}
              </p>
              <p>
                End date: {endMoved
                  ? <><b className="text-amber-700">moves to {formatPlannerDate(preview.endAfter, false, today)}</b> (was {formatPlannerDate(preview.endBefore, false, today)})</>
                  : <><b className="text-gray-900">{formatPlannerDate(preview.endAfter, false, today)}, unchanged</b> ✓</>}
              </p>
              <p>
                {preview.laterCohorts.length === 0
                  ? <>Existing later cohorts: <b className="text-gray-900">unchanged</b> ✓</>
                  : preview.laterCohorts.map((later) => (
                    <span key={later.cohortId} className="block">
                      <b className="text-amber-700">{later.name} moves back {later.shiftDays / 7} week{later.shiftDays === 7 ? '' : 's'}</b> (first class {formatPlannerDate(later.firstClassAfter, false, today)})
                    </span>
                  ))}
              </p>
              {endMoved && <p>Future planned cohorts are recalculated from the new end date.</p>}
            </div>
          </div>
          {!endMoved && preview.spareWeeksAfter === 0 && (
            <div className="rounded-2xl bg-amber-100/80 p-3 text-xs text-amber-700">
              After this change, no spare week remains. A further delay may extend this cohort{nextCohortName ? ` and affect ${nextCohortName}` : ''}.
            </div>
          )}
          {(endMoved || warning) && (
            <div className="rounded-2xl bg-amber-100/80 p-3 text-xs text-amber-700">
              {endMoved && <p>This extends the cohort. Review the new end date and any later cohort changes above.</p>}
              {warning && <p className={endMoved ? 'mt-1' : ''}>{warning}</p>}
            </div>
          )}
          <p className="text-xs text-gray-500">Apply new dates updates the schedule, class reminders and participant app. Keep current dates closes this preview without changing anything.</p>
        </div>
      )}
    </ModalShell>
  );
};

export default PushBackSheet;
