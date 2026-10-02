import React from 'react';
import {
  cohortWeeks,
  extensionWeeks,
  formatPlannerDate,
  formatPlannerRange,
  weeksLabel,
  type PlannerCohort,
  type PlannerEvent,
} from '../../utils/planner';
import { EXTENSION_STRIPES, KIND_BAR, useTip, weekTip } from './PlannerBits';

const SURFACE = 'rounded-[22px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)]';

const statusPill = (cohort: PlannerCohort, today: string) => {
  if (cohort.planned) return { label: 'Planned', className: 'bg-neutral-100 text-neutral-600' };
  if (cohort.status === 'COMPLETED' || cohort.status === 'ARCHIVED' || cohort.cycleEnd < today) return { label: 'Completed', className: 'bg-emerald-100/80 text-emerald-700' };
  if (cohort.phases[0].start <= today) return { label: 'Running', className: 'bg-sky-100/80 text-sky-700' };
  return { label: 'Coming up', className: 'bg-amber-100/80 text-amber-700' };
};

interface CohortCardProps {
  cohort: PlannerCohort;
  events: PlannerEvent[];
  today: string;
  onOpen: () => void;
}

/** One cohort: its name, how long the classes take, and every week of the cycle as a cell. */
const CohortCard: React.FC<CohortCardProps> = ({ cohort, events, today, onOpen }) => {
  const { bind, layer } = useTip();
  const weeks = cohortWeeks(cohort, events);
  const gaps = weeks.filter((w) => w.kind === 'gap');
  const extra = extensionWeeks(cohort);
  const pill = statusPill(cohort, today);
  const classWeeks = cohort.classDates.length;
  const spareUsed = !cohort.phases.some((p) => p.kind === 'spare');
  const last = cohort.classDates[classWeeks - 1];

  return (
    <li className={`${SURFACE} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-bold leading-tight text-gray-900">{cohort.name}</p>
          <p className="mt-0.5 text-[13px] text-gray-500">
            <span className="font-semibold text-gray-700">{weeksLabel(classWeeks)} of classes</span>
          </p>
          <p className="text-[13px] text-gray-500">{formatPlannerRange(cohort.classDates[0], last, today)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.className}`}>{pill.label}</span>
          <button type="button" onClick={onOpen} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">
            Dates
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-[3px]" role="list" aria-label={`${cohort.name}, week by week`}>
        {weeks.map((week) => (
          <button
            key={week.start}
            type="button"
            role="listitem"
            aria-label={weekTip(cohort, week, today).join('. ')}
            {...bind(weekTip(cohort, week, today))}
            className={`flex h-8 min-w-0 flex-1 items-center justify-center rounded-md text-[10px] font-bold ${KIND_BAR[week.kind]} ${cohort.planned ? 'opacity-60' : ''}`}
            style={week.extension && week.kind !== 'gap' ? EXTENSION_STRIPES : undefined}
          >
            {week.classNumber ?? ''}
          </button>
        ))}
      </div>

      {(gaps.length > 0 || spareUsed || extra > 0) && (
        <ul className="mt-3 space-y-1 text-[13px]">
          {gaps.length > 0 && (
            <li className="text-red-700">
              {weeksLabel(gaps.length)} paused for{' '}
              {[...new Set(gaps.map((g) => g.event?.name ?? 'a church event'))].join(', ')}
              {' '}({gaps.map((g) => formatPlannerDate(g.end, false, today)).join(', ')})
            </li>
          )}
          {spareUsed && (gaps.length > 0 || extra > 0) && <li className="text-gray-600">Spare week used up.</li>}
          {extra > 0 && (
            <li className="font-semibold text-amber-700">
              Ends {formatPlannerDate(cohort.cycleEnd, true, today)}, {weeksLabel(extra)} later than usual.
            </li>
          )}
        </ul>
      )}
      {layer}
    </li>
  );
};

export default CohortCard;
