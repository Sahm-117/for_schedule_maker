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

const chunk = <T,>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

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
    plannerApi.pushBack(weekId, clash.event.id, false)
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not work out what moves.'));
  }, [clash, weekId]);

  const apply = async () => {
    if (!clash || weekId === null) return;
    setApplying(true);
    try {
      await plannerApi.pushBack(weekId, clash.event.id, true);
      toast({ message: `${clash.cohort.name}’s classes moved back a week.`, tone: 'success' });
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
      title={`No FOF on ${when}: ${clash.cohort.name}’s class ${clash.cls.weekNumber}`}
      subtitle={`${clash.event.name}. ${weekId === null ? '' : 'Push the classes back?'}`}
      footer={weekId === null ? (
        <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95">Close</button>
      ) : (
        <>
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95">Not now</button>
          <button type="button" onClick={() => void apply()} disabled={!preview || applying} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {applying ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Moving…</span>) : 'Push back'}
          </button>
        </>
      )}
    >
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
          <div className="rounded-2xl bg-gray-50 p-3.5 text-sm">
            <p className="font-semibold text-gray-900">What moves</p>
            <div className="mt-2 space-y-1 text-gray-600">
              {chunk(preview.moves, 3).map((row) => (
                <p key={row[0].weekNumber}>
                  {row.map((m, i) => (
                    <React.Fragment key={m.weekNumber}>
                      {i > 0 && ' · '}
                      {i === 0 ? 'Class ' : ''}{m.weekNumber} → <b className="text-gray-900">{formatPlannerDate(m.to, false, today)}</b>
                    </React.Fragment>
                  ))}
                </p>
              ))}
              <p>
                Spare week: {preview.spareWeeksBefore > 0
                  ? <><b className="text-gray-900">used</b> ({preview.spareWeeksAfter} left)</>
                  : <b className="text-gray-900">already used</b>}
              </p>
              <p>
                End date: {endMoved
                  ? <><b className="text-amber-700">moves to {formatPlannerDate(preview.endAfter, false, today)}</b> (was {formatPlannerDate(preview.endBefore, false, today)})</>
                  : <><b className="text-gray-900">{formatPlannerDate(preview.endAfter, false, today)}, unchanged</b> ✓</>}
              </p>
              <p>
                {preview.laterCohorts.length === 0
                  ? <>Later cohorts: <b className="text-gray-900">unchanged</b> ✓</>
                  : preview.laterCohorts.map((later) => (
                    <span key={later.cohortId} className="block">
                      <b className="text-amber-700">{later.name} moves back {later.shiftDays / 7} week{later.shiftDays === 7 ? '' : 's'}</b> (first class {formatPlannerDate(later.firstClassAfter, false, today)})
                    </span>
                  ))}
              </p>
              {endMoved && <p>Planned cohorts after it move back too.</p>}
            </div>
          </div>
          {!endMoved && preview.spareWeeksAfter === 0 && (
            <div className="rounded-2xl bg-amber-100/80 p-3 text-xs text-amber-700">
              If another Sunday is lost after this, the end date moves{nextCohortName ? ` and ${nextCohortName}’s rest, mobilisation and classes move back a week` : ''}. You’ll see that before it’s applied.
            </div>
          )}
          {(endMoved || warning) && (
            <div className="rounded-2xl bg-amber-100/80 p-3 text-xs text-amber-700">
              {endMoved && <p>This pushes into the next cycle{preview.laterCohorts.length ? '' : ' (the planned cohorts after it start a week later)'}.</p>}
              {warning && <p className={endMoved ? 'mt-1' : ''}>{warning}</p>}
            </div>
          )}
          <p className="text-xs text-gray-500">Schedule, class reminders and the participant app update by themselves.</p>
        </div>
      )}
    </ModalShell>
  );
};

export default PushBackSheet;
