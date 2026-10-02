import React, { useEffect, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { plannerApi } from '../../services/api';
import {
  PHASE_LABEL,
  SPARE_WEEKS,
  addDays,
  formatPlannerDate,
  formatPlannerRange,
  isSunday,
  phasesFor,
  weeksLabel,
  type PlannerCohort,
} from '../../utils/planner';

const FIELD = 'w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none';
const LABEL = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

interface CohortSheetProps {
  cohort: PlannerCohort | null;
  /** Opened from "Add cohort": wording for planning the next one. */
  adding?: boolean;
  plan: PlannerCohort[];
  today: string;
  onClose: () => void;
  onSaved: () => void;
  onEditEach: (cohort: PlannerCohort) => void;
}

/** One question: when does this cohort's first class fall? Everything else follows from it. */
const CohortSheet: React.FC<CohortSheetProps> = ({ cohort, adding, plan, today, onClose, onSaved, onEditEach }) => {
  const toast = useToast();
  const [first, setFirst] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (cohort) setFirst(cohort.classDates[0]);
  }, [cohort]);

  if (!cohort) return null;

  const original = cohort.classDates;
  const started = original[0] < today && !cohort.planned;
  const delta = ISO.test(first) ? daysBetween(original[0], first) : 0;
  const dates = original.map((d) => addDays(d, delta));
  const cycleEnd = cohort.planned ? addDays(dates[dates.length - 1], 7 * SPARE_WEEKS) : addDays(cohort.cycleEnd, delta);
  const valid = ISO.test(first) && isSunday(first) && first >= today;
  const changed = delta !== 0;
  const phases = valid ? phasesFor(dates, cycleEnd) : null;
  const missingWeeks = !cohort.planned && cohort.classes.some((k) => k.weekId === null);

  const index = plan.findIndex((c) => c.key === cohort.key);
  const previous = index > 0 ? plan[index - 1] : null;
  const following = index >= 0 ? plan[index + 1] ?? null : null;
  const warnings: string[] = [];
  if (phases && previous && previous.cycleEnd >= phases[0].start) warnings.push(`Rest would start before ${previous.name} finishes (${formatPlannerDate(previous.cycleEnd, false, today)}).`);
  if (phases && following && !following.planned && following.phases[0].start <= cycleEnd) warnings.push(`It would run into ${following.name}, which starts resting ${formatPlannerDate(following.phases[0].start, false, today)}.`);

  const error = !ISO.test(first) ? 'Pick a date' : !isSunday(first) ? 'Classes hold on Sundays. Pick a Sunday.' : first < today ? 'That day has passed.' : '';

  const save = async () => {
    setSaving(true);
    try {
      if (cohort.planned) {
        await plannerApi.setPlannedDates(cohort.name, dates);
      } else {
        await plannerApi.setClassDates(cohort.key, dates.map((date, i) => ({ weekId: cohort.classes[i].weekId as number, date })), true);
      }
      toast({ message: `${cohort.name} now starts ${formatPlannerDate(first, true, today)}.`, tone: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save the start date.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await plannerApi.setPlannedDates(cohort.name, null);
      toast({ message: `${cohort.name} is back to its automatic start.`, tone: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not reset the dates.', tone: 'error' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <ModalShell
      isOpen={!!cohort}
      onClose={onClose}
      title={adding ? `Plan ${cohort.name}` : cohort.name}
      subtitle={cohort.planned ? 'Planned here first. Create it on the Cohorts page when it is time.' : `${weeksLabel(original.length)} of classes`}
      footer={(
        <>
          {cohort.planned && cohort.plannedOverride && (
            <button type="button" onClick={() => void reset()} disabled={saving || resetting} className="mr-auto rounded-2xl px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 active:scale-95 disabled:opacity-60">
              {resetting ? 'Resetting…' : 'Back to automatic'}
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95">Cancel</button>
          {!started && !missingWeeks && (
            <button type="button" onClick={() => void save()} disabled={!valid || !changed || saving || resetting} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
              {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save start date'}
            </button>
          )}
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {started || missingWeeks ? (
          <p className="rounded-2xl bg-gray-50 p-3.5 text-sm text-gray-600">
            {started ? `${cohort.name} has already started, on ${formatPlannerDate(original[0], true, today)}. To move a class that is still to come, edit its date below.` : 'This cohort’s classes aren’t set up yet, so their dates can’t be changed here.'}
          </p>
        ) : (
          <label className="block">
            <span className={LABEL}>First class (a Sunday)</span>
            <input type="date" value={first} min={today} onChange={(e) => setFirst(e.target.value)} className={FIELD} aria-invalid={!!error && changed} />
            {error && first !== original[0] && <span className="mt-1.5 block text-xs font-semibold text-red-700">{error}</span>}
          </label>
        )}

        {phases && (
          <div className="rounded-2xl bg-gray-50 p-3.5 text-sm">
            <p className="font-semibold text-gray-900">{changed ? 'What this makes' : 'The cycle'}</p>
            <dl className="mt-2 space-y-1 text-gray-600">
              {phases.map((phase) => {
                const weeks = phase.kind === 'classes' ? original.length : Math.round((daysBetween(phase.start, phase.end) + 1) / 7);
                return (
                  <div key={phase.kind} className="flex justify-between gap-3">
                    <dt>{PHASE_LABEL[phase.kind]} <span className="text-gray-400">· {weeksLabel(weeks)}</span></dt>
                    <dd className="text-right font-medium text-gray-900">{formatPlannerRange(phase.kind === 'classes' ? dates[0] : phase.start, phase.kind === 'classes' ? dates[dates.length - 1] : phase.end, today)}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="rounded-2xl bg-amber-100/80 p-3 text-xs text-amber-700">
            {warnings.map((w) => <p key={w}>{w}</p>)}
          </div>
        )}
        <button type="button" onClick={() => onEditEach(cohort)} className="self-start text-sm font-semibold text-primary hover:underline">
          Edit each class date…
        </button>
      </div>
    </ModalShell>
  );
};

export default CohortSheet;
