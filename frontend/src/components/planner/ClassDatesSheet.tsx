import Glyph from '../Glyph';
import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { useToast } from '../Toast';
import { plannerApi } from '../../services/api';
import { PHASE_LABEL, SPARE_WEEKS, addDays, formatPlannerDate, formatPlannerRange, isSunday, phasesFor, type PlannerCohort } from '../../utils/planner';

const FIELD = 'w-full rounded-2xl border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50 disabled:text-gray-500';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

interface ClassDatesSheetProps {
  cohort: PlannerCohort | null;
  plan: PlannerCohort[];
  today: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Set each class's Sunday for a cohort, with a live preview of its rest, mobilisation, classes and spare week. */
const ClassDatesSheet: React.FC<ClassDatesSheetProps> = ({ cohort, plan, today, onClose, onSaved }) => {
  const toast = useToast();
  const [dates, setDates] = useState<string[]>([]);
  const [shiftLater, setShiftLater] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!cohort) return;
    setDates(cohort.classDates);
    setShiftLater(true);
  }, [cohort]);

  const original = useMemo(() => cohort?.classDates ?? [], [cohort]);
  const locked = original.map((d) => d < today);

  const errors = useMemo(() => dates.map((d, i) => {
    if (locked[i] || d === original[i]) return '';
    if (!ISO.test(d)) return 'Pick a date';
    if (!isSunday(d)) return 'Pick a Sunday';
    if (d < today) return 'That day has passed';
    return '';
  }), [dates, locked, original, today]);

  const orderError = useMemo(() => {
    for (let i = 1; i < dates.length; i += 1) {
      if (ISO.test(dates[i]) && ISO.test(dates[i - 1]) && dates[i] <= dates[i - 1]) return `Class ${i + 1} must come after class ${i}.`;
    }
    return '';
  }, [dates]);

  if (!cohort) return null;

  const valid = dates.length === original.length && dates.every((d) => ISO.test(d));
  const changed = dates.some((d, i) => d !== original[i]);
  const canSave = valid && changed && !orderError && errors.every((e) => !e) && !saving && !resetting;
  const missingWeeks = !cohort.planned && cohort.classes.some((k) => k.weekId === null);

  const change = (index: number, value: string) => {
    setDates((prev) => {
      const next = [...prev];
      const before = prev[index];
      next[index] = value;
      if (shiftLater && ISO.test(value) && ISO.test(before) && value !== before) {
        const delta = daysBetween(before, value);
        for (let j = index + 1; j < next.length; j += 1) {
          if (!locked[j] && ISO.test(next[j])) next[j] = addDays(next[j], delta);
        }
      }
      return next;
    });
  };

  // Same end-date rule as the database: a cycle that was just the spare week keeps a spare week.
  const oldLast = original[original.length - 1];
  const newLast = valid ? dates[dates.length - 1] : oldLast;
  const cycleEnd = cohort.planned || cohort.cycleEnd <= addDays(oldLast, 7 * SPARE_WEEKS)
    ? addDays(newLast, 7 * SPARE_WEEKS)
    : addDays(cohort.cycleEnd, daysBetween(oldLast, newLast));
  const phases = valid && !orderError ? phasesFor(dates, cycleEnd) : null;

  const index = plan.findIndex((c) => c.key === cohort.key);
  const previous = index > 0 ? plan[index - 1] : null;
  const following = index >= 0 ? plan[index + 1] ?? null : null;
  const warnings: string[] = [];
  if (phases && previous && previous.cycleEnd >= phases[0].start) warnings.push(`${cohort.name}’s rest would start before ${previous.name}’s cycle ends (${formatPlannerDate(previous.cycleEnd, false, today)}).`);
  if (phases && following && following.phases[0].start <= cycleEnd) warnings.push(`${cohort.name} would run into ${following.name}’s rest, which starts ${formatPlannerDate(following.phases[0].start, false, today)}.`);

  const save = async () => {
    setSaving(true);
    try {
      if (cohort.planned) {
        await plannerApi.setPlannedDates(cohort.name, dates);
      } else {
        const moved = dates
          .map((date, i) => ({ weekId: cohort.classes[i].weekId as number, date, was: original[i] }))
          .filter((d) => d.date !== d.was)
          .map(({ weekId, date }) => ({ weekId, date }));
        await plannerApi.setClassDates(cohort.key, moved, true);
      }
      toast({ message: `${cohort.name}’s class dates saved.`, tone: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save the class dates.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await plannerApi.setPlannedDates(cohort.name, null);
      toast({ message: `${cohort.name} is back to automatic dates.`, tone: 'success' });
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
      title={`${cohort.name}: class dates`}
      subtitle={cohort.planned ? 'Planned cohort. These dates are saved on the Planner until it’s created.' : 'Every class holds on a Sunday.'}
      footer={
        <>
          {cohort.planned && cohort.plannedOverride && (
            <button type="button" onClick={() => void reset()} disabled={saving || resetting} className="mr-auto inline-flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 active:scale-95 disabled:opacity-60">
              {resetting ? (<><Spinner className="h-3.5 w-3.5" />Resetting…</>) : 'Reset to auto'}
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 active:scale-95">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={!canSave} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Save dates'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {missingWeeks && <p className="rounded-2xl bg-amber-100/80 p-3 text-xs text-amber-700">This cohort’s classes aren’t set up yet, so their dates can’t be changed here.</p>}
        <label className="flex items-center gap-2.5 text-sm text-gray-700">
          <input type="checkbox" checked={shiftLater} onChange={(e) => setShiftLater(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-primary" />
          Shift all later classes too
        </label>
        <ul className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
          {dates.map((date, i) => (
            <li key={i}>
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                  <span>Class {cohort.classes[i]?.weekNumber ?? i + 1}</span>
                  {locked[i] && <span className="normal-case tracking-normal text-gray-400">done</span>}
                </span>
                <input type="date" value={date} disabled={locked[i] || missingWeeks} min={today} onChange={(e) => change(i, e.target.value)} className={FIELD} />
              </label>
              {errors[i] && <p className="mt-1 text-xs font-semibold text-red-700">{errors[i]}</p>}
            </li>
          ))}
        </ul>
        {orderError && <p className="rounded-2xl bg-red-100/80 p-3 text-xs text-red-700">{orderError}</p>}
        {phases && (
          <div className="rounded-2xl bg-gray-50 p-3.5 text-sm">
            <p className="font-semibold text-gray-900">What this makes</p>
            <dl className="mt-2 space-y-1 text-gray-600">
              {phases.map((phase) => (
                <div key={phase.kind} className="flex justify-between gap-3">
                  <dt>{PHASE_LABEL[phase.kind]}</dt>
                  <dd className="font-medium text-gray-900">{formatPlannerRange(phase.start, phase.end, today)}</dd>
                </div>
              ))}
              {!phases.some((p) => p.kind === 'spare') && <div className="flex justify-between gap-3"><dt>{PHASE_LABEL.spare}</dt><dd className="font-medium text-gray-900">Used up</dd></div>}
            </dl>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="rounded-2xl bg-amber-100/80 p-3 text-xs text-amber-700">
            {warnings.map((w) => <p key={w}><Glyph name="warning" className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />{w}</p>)}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

export default ClassDatesSheet;
