import React from 'react';
import {
  addDays,
  cohortSegments,
  cohortOverlapsPeriod,
  formatPlannerDate,
  formatPlannerRange,
  periodPercent,
  weeksLabel,
  stoppedSundays,
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
  start: string;
  end: string;
  view: 'year' | 'quarter';
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

/** Year and quarter scales share the same cohort, event and clash track. */
const YearTimeline: React.FC<YearTimelineProps> = ({ start, end, view, plan, events, holidays, clashes, today, onOpenCohort, onOpenEvent, onOpenClash, scrollRef }) => {
  const { bind, layer } = useTip();
  const year = Number(start.slice(0, 4));
  const inPeriod = plan.filter((c) => view === 'year' ? runsInYear(c, year) : cohortOverlapsPeriod(c, start, end));
  const periodEvents = events.filter((e) => e.startDate <= end && e.endDate >= start);
  const todayInPeriod = today >= start && today <= end;
  const tickCount = view === 'year' ? 12 : 3;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const date = new Date(Date.UTC(year, Number(start.slice(5, 7)) - 1 + i, 1)).toISOString().slice(0, 10);
    return { date, label: MONTHS[Number(date.slice(5, 7)) - 1] };
  });
  // Put nearby event labels on different rows instead of letting them overlap.
  const laneEnds: number[] = [];
  const eventRows = [...periodEvents].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((event) => {
    const at = periodPercent(event.startDate < start ? start : event.startDate, start, end);
    const leftPx = (at / 100) * TRACK;
    let lane = laneEnds.findIndex((right) => right <= leftPx);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = leftPx + 158;
    return { event, at, lane };
  });

  const span = (from: string, through: string) => {
    const left = periodPercent(from < start ? start : from, start, end);
    const right = periodPercent(addDays(through > end ? end : through, 1), start, end);
    return { left, width: Math.max(0.4, right - left) };
  };

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <div style={{ minWidth: `${LABEL_COL + TRACK + 150}px`, paddingRight: 150 }}>
        <div className="relative h-4 text-[11px] font-semibold text-gray-400" style={{ marginLeft: LABEL_COL }}>
          {ticks.map((tick) => <span key={tick.date} className="absolute" style={{ left: `${periodPercent(tick.date, start, end)}%` }}>{tick.label}</span>)}
        </div>
        <div className="relative mt-2">
          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_COL }} aria-hidden="true">
            {ticks.map((tick) => <span key={tick.date} className="absolute inset-y-0 border-l border-gray-100" style={{ left: `${periodPercent(tick.date, start, end)}%` }} />)}
          </div>
          {/* Only the Sunday class is affected, even when the event spans several days. */}
          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_COL }} aria-hidden="true">
            {stoppedSundays(periodEvents, start, end).map((date) => {
              const { left, width } = span(date, date);
              return <span key={date} className="absolute inset-y-0 bg-red-500/10" style={{ left: `${left}%`, width: `${width}%` }} />;
            })}
            {todayInPeriod && <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-primary" style={{ left: `${periodPercent(today, start, end)}%` }} />}
          </div>

          {inPeriod.length === 0 && <p className="py-6 text-sm text-gray-500" style={{ paddingLeft: LABEL_COL }}>Nothing planned in this {view}.</p>}
          {inPeriod.map((cohort) => (
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
                {cohortSegments(cohort, events).flatMap((seg) => seg.kind === 'gap'
                  ? Array.from({ length: seg.weeks }, (_, i) => ({ ...seg, start: addDays(seg.start, 6 + i * 7), end: addDays(seg.start, 6 + i * 7), weeks: 1 }))
                  : [seg]).map((seg) => {
                  if (seg.end < start || seg.start > end) return null;
                  const { left, width } = span(seg.start, seg.end);
                  const wide = (width / 100) * TRACK >= 22;
                  const lines = segmentTip(cohort, seg, today);
                  return (
                    <button
                      key={`${seg.kind}-${seg.start}`}
                      type="button"
                      aria-label={lines.join('. ')}
                      {...bind(lines)}
                      className={`absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md text-[11px] font-bold ${seg.kind === 'gap' ? '-translate-x-1/2 bg-transparent' : KIND_BAR[seg.kind]} ${cohort.planned && seg.kind !== 'gap' ? 'opacity-60' : ''}`}
                      style={{ left: `${left}%`, width: seg.kind === 'gap' ? '12px' : `calc(${width}% - 2px)`, ...(seg.extension && seg.kind !== 'gap' ? EXTENSION_STRIPES : {}) }}
                    >
                      {seg.kind === 'gap' ? <span aria-hidden="true" className={`h-full w-[3px] rounded-sm ${KIND_BAR.gap}`} /> : wide && seg.weeks}
                    </button>
                  );
                })}
                {clashes.filter((cl) => cl.cohort.key === cohort.key && cl.cls.date >= start && cl.cls.date <= end).map((cl) => (
                  <button
                    key={`${cl.event.id}-${cl.cls.date}`}
                    type="button"
                    onClick={() => onOpenClash(cl)}
                    aria-label={`Clash: ${cl.event.name} on class ${cl.cls.weekNumber}. Open to adjust.`}
                    className="absolute -top-2.5 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center"
                    style={{ left: `${periodPercent(cl.cls.date, start, end)}%` }}
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
            <div className="relative flex-1" style={{ height: `${Math.max(1, laneEnds.length) * 26}px` }}>
              {eventRows.map(({ event, at, lane }) => {
                const range = event.endDate === event.startDate ? formatPlannerDate(event.startDate, false, start) : formatPlannerRange(event.startDate, event.endDate, start);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onOpenEvent(event)}
                    aria-label={`${event.name}, ${range}, ${event.stopsFof ? 'no FOF' : 'FOF runs'}: edit`}
                    title={`${event.name} · ${range} · ${event.stopsFof ? 'No Sunday class' : 'FOF still runs'}`}
                    className={`absolute inline-flex max-w-[150px] items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2 text-[11px] font-semibold ${event.stopsFof ? 'bg-red-100/80 text-red-700' : 'bg-violet-100/80 text-violet-700'}`}
                    style={{ top: `${lane * 26}px`, left: `${at}%` }}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${event.stopsFof ? 'bg-red-500' : 'bg-violet-400'}`} aria-hidden="true" />
                    <span className="truncate">{event.name}</span>
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
                    aria-label={`${formatPlannerDate(h.date, true, start)}, ${h.name}`}
                    {...bind([h.name + (h.isEstimate ? ' (estimate)' : ''), `${formatPlannerDate(h.date, true, start)} · doesn’t stop FOF`])}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400"
                    style={{ left: `${periodPercent(h.date, start, end)}%` }}
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
