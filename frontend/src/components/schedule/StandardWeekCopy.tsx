import React, { useMemo, useState } from 'react';
import { activitiesApi } from '../../services/api';
import type { Activity, Week } from '../../types';
import Spinner from '../Spinner';

// "Copy a standard week into every week": takes chosen activities from the week on screen (recap, check-ins,
// group meeting and the like) and adds each to the same day of the weeks chosen, one activity at a time through
// the same create call the single Cross-Week form uses, so it only ever touches the weeks listed here (the
// cohort's own). An activity the target day already has (same description) is left alone, never doubled.

const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const QUICK_PICKS: Array<{ key: string; label: string; test: RegExp }> = [
  { key: 'recap', label: 'Recap', test: /recap/i },
  { key: 'checkin', label: 'Check-ins', test: /check[\s-]?ins?/i },
  { key: 'group', label: 'Group meeting', test: /group\s+meeting/i },
];

/** The description as one short plain line (descriptions can carry light markup and lists). */
const plain = (text: string): string => {
  const line = (text || '').split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').replace(/[*_`#>]/g, '').trim()).find(Boolean) ?? '';
  return line.length > 70 ? `${line.slice(0, 67)}…` : line;
};
const norm = (text: string): string => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();

interface SourceActivity extends Activity { dayName: string }

interface WeekPlan {
  week: Week;
  toAdd: SourceActivity[];
  already: SourceActivity[];
  noDay: SourceActivity[];
}

interface Props {
  weeks: Week[];
  currentWeek: Week;
  onClose: () => void;
  onSave: () => void;
}

const StandardWeekCopy: React.FC<Props> = ({ weeks, currentWeek, onClose, onSave }) => {
  const otherWeeks = useMemo(() => weeks.filter((w) => w.id !== currentWeek.id).sort((a, b) => a.weekNumber - b.weekNumber), [weeks, currentWeek.id]);
  const sourceActivities = useMemo<SourceActivity[]>(
    () => [...currentWeek.days]
      .sort((a, b) => dayOrder.indexOf(a.dayName) - dayOrder.indexOf(b.dayName))
      .flatMap((day) => day.activities.map((activity) => ({ ...activity, dayName: day.dayName }))),
    [currentWeek]
  );

  const [pickedIds, setPickedIds] = useState<number[]>(() =>
    sourceActivities.filter((a) => QUICK_PICKS.some((q) => q.test.test(a.description))).map((a) => a.id)
  );
  const [targetIds, setTargetIds] = useState<number[]>(() => otherWeeks.map((w) => w.id));
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(0);

  const picked = sourceActivities.filter((a) => pickedIds.includes(a.id));

  const plans = useMemo<WeekPlan[]>(() => otherWeeks.filter((w) => targetIds.includes(w.id)).map((week) => {
    const plan: WeekPlan = { week, toAdd: [], already: [], noDay: [] };
    const seen = new Set<string>();
    picked.forEach((src) => {
      const day = week.days.find((d) => d.dayName === src.dayName);
      if (!day) { plan.noDay.push(src); return; }
      const key = `${day.id}|${norm(src.description)}`;
      if (seen.has(key) || day.activities.some((a) => norm(a.description) === norm(src.description))) { plan.already.push(src); return; }
      seen.add(key);
      plan.toAdd.push(src);
    });
    return plan;
  }), [otherWeeks, targetIds, picked]);

  const totalToAdd = plans.reduce((n, p) => n + p.toAdd.length, 0);
  const weeksTouched = plans.filter((p) => p.toAdd.length > 0).length;

  const toggle = (list: number[], set: (next: number[]) => void, id: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const quickState = (test: RegExp) => {
    const matching = sourceActivities.filter((a) => test.test(a.description));
    return { matching, on: matching.length > 0 && matching.every((a) => pickedIds.includes(a.id)) };
  };
  const toggleQuick = (test: RegExp) => {
    const { matching, on } = quickState(test);
    const ids = matching.map((a) => a.id);
    setPickedIds(on ? pickedIds.filter((id) => !ids.includes(id)) : [...new Set([...pickedIds, ...ids])]);
  };

  const run = async () => {
    if (saving || totalToAdd === 0) return;
    setSaving(true);
    setError('');
    setProgress(0);
    const failures: string[] = [];
    let done = 0;
    for (const plan of plans) {
      for (const src of plan.toAdd) {
        const day = plan.week.days.find((d) => d.dayName === src.dayName);
        if (!day) continue;
        try {
          await activitiesApi.create({
            dayId: day.id,
            time: src.time,
            description: src.description,
            period: src.period,
            labelIds: (src.labels ?? []).map((l) => l.id),
          });
          done += 1;
        } catch (e) {
          failures.push(`Week ${plan.week.weekNumber}, ${src.dayName}, ${plain(src.description)}: ${e instanceof Error ? e.message : 'failed'}`);
        }
        setProgress(done + failures.length);
      }
    }
    setSaving(false);
    setAdded(done);
    if (failures.length === 0) {
      onSave();
      onClose();
      return;
    }
    setError(`${failures.length} could not be added:\n${failures.join('\n')}`);
  };

  const failedOnce = error !== '';

  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="standard-week-copy">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-5">
        {step === 'pick' ? (
          <>
            <p className="text-sm text-gray-600">
              Copy chosen activities from <b>Week {currentWeek.weekNumber}</b> into the same day of other weeks. Anything a week already has is left alone.
            </p>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">What to copy</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {QUICK_PICKS.map((q) => {
                  const { matching, on } = quickState(q.test);
                  return (
                    <button
                      key={q.key}
                      type="button"
                      onClick={() => toggleQuick(q.test)}
                      disabled={matching.length === 0}
                      title={matching.length === 0 ? `No ${q.label.toLowerCase()} activity in Week ${currentWeek.weekNumber}` : undefined}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${on ? 'bg-primary text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      {q.label} ({matching.length})
                    </button>
                  );
                })}
              </div>
              {sourceActivities.length === 0 ? (
                <p className="rounded-md border border-gray-200 p-3 text-sm text-gray-500">Week {currentWeek.weekNumber} has no activities to copy.</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                  {sourceActivities.map((a) => (
                    <label key={a.id} className="flex items-start gap-2 rounded p-1.5 text-sm hover:bg-gray-50">
                      <input type="checkbox" checked={pickedIds.includes(a.id)} onChange={() => toggle(pickedIds, setPickedIds, a.id)} className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary" />
                      <span className="min-w-0">
                        <span className="font-medium text-gray-900">{plain(a.description) || 'Untitled activity'}</span>
                        <span className="text-gray-500"> · {a.dayName} {a.time}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-700">Copy into</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{targetIds.length} / {otherWeeks.length} weeks</span>
                  <button type="button" onClick={() => setTargetIds(otherWeeks.map((w) => w.id))} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">Every week</button>
                  <button type="button" onClick={() => setTargetIds([])} disabled={targetIds.length === 0} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-4">
                {otherWeeks.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 rounded p-2 hover:bg-gray-50">
                    <input type="checkbox" checked={targetIds.includes(w.id)} onChange={() => toggle(targetIds, setTargetIds, w.id)} className="rounded border-gray-300 text-primary focus:ring-primary" />
                    <span className="text-sm">Week {w.weekNumber}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800" data-testid="standard-week-summary">
              {totalToAdd === 0
                ? 'Nothing to add: every chosen week already has these.'
                : `This adds ${totalToAdd} ${totalToAdd === 1 ? 'activity' : 'activities'} across ${weeksTouched} ${weeksTouched === 1 ? 'week' : 'weeks'}. Nothing is changed or removed in the weeks.`}
            </div>
            <div className="space-y-2">
              {plans.map((p) => (
                <div key={p.week.id} className="rounded-md border border-gray-200 p-3">
                  <p className="text-sm font-semibold text-gray-900">Week {p.week.weekNumber}</p>
                  {p.toAdd.map((a) => (
                    <p key={`a${a.id}`} className="mt-1 text-sm text-emerald-700">+ {plain(a.description)} <span className="text-gray-500">· {a.dayName} {a.time}</span></p>
                  ))}
                  {p.already.map((a) => (
                    <p key={`e${a.id}`} className="mt-1 text-sm text-gray-500">Already there: {plain(a.description)} <span>· {a.dayName}</span></p>
                  ))}
                  {p.noDay.map((a) => (
                    <p key={`n${a.id}`} className="mt-1 text-sm text-amber-700">Skipped, no {a.dayName} in this week: {plain(a.description)}</p>
                  ))}
                  {p.toAdd.length + p.already.length + p.noDay.length === 0 && <p className="mt-1 text-sm text-gray-500">Nothing chosen.</p>}
                </div>
              ))}
            </div>
            {saving && <p className="text-xs text-gray-500">Adding {progress} of {totalToAdd}…</p>}
            {failedOnce && (
              <div className="whitespace-pre-line rounded bg-red-50 p-2 text-sm text-red-600">
                {added > 0 ? `${added} added. ` : ''}{error}
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-end gap-2">
          {step === 'pick' ? (
            <>
              <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={picked.length === 0 || targetIds.length === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark disabled:opacity-50"
              >
                Review
              </button>
            </>
          ) : failedOnce ? (
            <button type="button" onClick={() => { if (added > 0) onSave(); else onClose(); }} className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark">Close</button>
          ) : (
            <>
              <button type="button" onClick={() => setStep('pick')} disabled={saving} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Back</button>
              <button
                type="button"
                onClick={() => { void run(); }}
                disabled={saving || totalToAdd === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Copying…</span>) : `Copy ${totalToAdd} ${totalToAdd === 1 ? 'activity' : 'activities'}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StandardWeekCopy;
