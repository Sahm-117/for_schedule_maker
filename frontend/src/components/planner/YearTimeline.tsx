import React from 'react';
import {
  cohortSegments,
  formatPlannerDate,
  formatPlannerRange,
  weeksLabel,
  yearPercent,
  type PlannerClash,
  type PlannerCohort,
  type PlannerEvent,
} from '../../utils/planner';
import type { PublicHoliday } from '../../types';
import { EXTENSION_STRIPES, KIND_BAR, segmentTip, useTip } from './PlannerBits';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LABEL_COL = 96;
const TRACK = 640;

/** Two weeks or more of the cohort's cycle fall in the year. */
export const runsInYear = (c: PlannerCohort, year: number) => {
  const start = c.phases[0].start > `${year}-01-01` ? c.phases[0].start : `${year}-01-01`;
  const end = c.cycleEnd < `${year}-12-31` ? c.cycleEnd : `${year}-12-31`;
  return Date.parse(end) - Date.parse(start) >= 13 * 86400000;
};

interface YearTimelineProps {
  year: number;
  plan: PlannerCohort[];
  events: PlannerEvent[];
  holidays: PublicHoliday[];
  clashes: PlannerClash[];
  today: string;
  onOpenCohort: (cohort: PlannerCohort) => void;
  onOpenEvent: (event: PlannerEvent) => void;
  onOpenClash: (clash: PlannerClash) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}

/** The whole year on one track: each cohort a bar of segments, church events as pills, no-FOF dates as red bands. */
const YearTimeline: React.FC<YearTimelineProps> = ({ year, plan, events, holidays, clashes, today, onOpenCohort, onOpenEvent, onOpenClash, scrollRef }) => {
  const { bind, layer } = useTip();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const inYear = plan.filter((c) => runsInYear(c, year));
  const yearEvents = events.filter((e) => e.startDate <= yearEnd && e.endDate >= yearStart);
  const todayInYear = today.startsWith(String(year));

  const span = (start: string, end: string) => {
    const left = yearPercent(start < yearStart ? yearStart : start, year);
    const right = end > yearEnd ? 100 : yearPercent(end, year) + 100 / 365;
    return { left, width: Math.max(0.4, right - left) };
  };

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <div style={{ minWidth: `${LABEL_COL + TRACK}px`, paddingRight: 150 }}>
        <div className="grid grid-cols-12 text-center text-[11px] font-semibold text-gray-400" style={{ marginLeft: LABEL_COL }}>
          {MONTHS.map((m) => <span key={m}>{m}</span>)}
        </div>
        <div className="relative mt-2">
          <div className="pointer-events-none absolute inset-y-0 right-0 grid grid-cols-12" style={{ left: LABEL_COL }} aria-hidden="true">
            {MONTHS.map((m) => <span key={m} className="border-l border-gray-100" />)}
          </div>
          {/* Dates when FOF stops, running down through every cohort. */}
          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_COL }} aria-hidden="true">
            {yearEvents.filter((e) => e.stopsFof).map((e) => {
              const { left, width } = span(e.startDate, e.endDate);
              return <span key={e.id} className="absolute inset-y-0 bg-red-500/10" style={{ left: `${left}%`, width: `${width}%` }} />;
            })}
            {todayInYear && <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-primary" style={{ left: `${yearPercent(today, year)}%` }} />}
          </div>

          {inYear.length === 0 && <p className="py-6 text-sm text-gray-500" style={{ paddingLeft: LABEL_COL }}>Nothing planned in {year}.</p>}
          {inYear.map((cohort) => (
            <div key={cohort.key} className="relative flex h-12 items-center">
              <button
                type="button"
                onClick={() => onOpenCohort(cohort)}
                aria-label={`${cohort.name}: open dates`}
                className="sticky left-0 z-10 flex shrink-0 flex-col justify-center self-stretch bg-white pr-2 text-left"
                style={{ width: LABEL_COL }}
              >
                <span className="block truncate text-[13px] font-semibold text-gray-900">{cohort.name}</span>
                <span className="block text-[11px] text-gray-400">{weeksLabel(cohort.classDates.length)}</span>
              </button>
              <div className="relative h-7 flex-1">
                {cohortSegments(cohort, events).map((seg) => {
                  if (seg.end < yearStart || seg.start > yearEnd) return null;
                  const { left, width } = span(seg.start, seg.end);
                  const wide = (width / 100) * TRACK >= 22;
                  const lines = segmentTip(cohort, seg, today);
                  return (
                    <button
                      key={`${seg.kind}-${seg.start}`}
                      type="button"
                      aria-label={lines.join('. ')}
                      {...bind(lines)}
                      className={`absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md text-[11px] font-bold ${KIND_BAR[seg.kind]} ${cohort.planned && seg.kind !== 'gap' ? 'opacity-60' : ''}`}
                      style={{ left: `${left}%`, width: `calc(${width}% - 2px)`, ...(seg.extension && seg.kind !== 'gap' ? EXTENSION_STRIPES : {}) }}
                    >
                      {wide && (seg.kind === 'gap' ? '' : seg.weeks)}
                    </button>
                  );
                })}
                {clashes.filter((cl) => cl.cohort.key === cohort.key && cl.cls.date.startsWith(String(year))).map((cl) => (
                  <button
                    key={`${cl.event.id}-${cl.cls.date}`}
                    type="button"
                    onClick={() => onOpenClash(cl)}
                    aria-label={`Clash: ${cl.event.name} on class ${cl.cls.weekNumber}. Open to adjust.`}
                    className="absolute -top-2.5 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center"
                    style={{ left: `${yearPercent(cl.cls.date, year)}%` }}
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-50 motion-reduce:hidden" aria-hidden="true" />
                    <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">!</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="relative flex min-h-[40px] items-start border-t border-gray-100 py-1">
            <span className="sticky left-0 z-10 shrink-0 self-stretch bg-white pr-2 pt-1 text-[13px] font-semibold text-gray-500" style={{ width: LABEL_COL }}>Church events</span>
            <div className="relative flex-1" style={{ height: `${Math.max(1, Math.min(yearEvents.length, 3)) * 26}px` }}>
              {yearEvents.map((event, index) => {
                const at = yearPercent(event.startDate < yearStart ? yearStart : event.startDate, year);
                const range = event.endDate === event.startDate ? formatPlannerDate(event.startDate, false, yearStart) : formatPlannerRange(event.startDate, event.endDate, yearStart);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpenEvent(event)}
                    aria-label={`${event.name}, ${range}, ${event.stopsFof ? 'no FOF' : 'FOF runs'}: edit`}
                    title={`${event.name} · ${range} · ${event.stopsFof ? 'No FOF' : 'FOF still runs'}`}
                    className={`absolute inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2 text-[11px] font-semibold ${event.stopsFof ? 'bg-red-100/80 text-red-700' : 'bg-violet-100/80 text-violet-700'}`}
                    style={{ top: `${(index % 3) * 26}px`, left: `${at}%` }}
                  >
                    <span className={`h-2 w-2 rounded-full ${event.stopsFof ? 'bg-red-500' : 'bg-violet-400'}`} aria-hidden="true" />
                    {event.name}
                  </button>
                );
              })}
            </div>
          </div>

          {holidays.length > 0 && (
            <div className="relative flex h-6 items-center border-t border-gray-100">
              <span className="sticky left-0 z-10 shrink-0 self-stretch bg-white pr-2 pt-1 text-[12px] font-semibold text-gray-400" style={{ width: LABEL_COL }}>Holidays</span>
              <div className="relative h-full flex-1">
                {holidays.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    aria-label={`${formatPlannerDate(h.date, true, yearStart)}, ${h.name}`}
                    {...bind([h.name + (h.isEstimate ? ' (estimate)' : ''), `${formatPlannerDate(h.date, true, yearStart)} · doesn’t stop FOF`])}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400"
                    style={{ left: `${yearPercent(h.date, year)}%` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {layer}
    </div>
  );
};

export default YearTimeline;
