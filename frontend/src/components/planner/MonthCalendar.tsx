import React, { useState } from 'react';
import type { PublicHoliday } from '../../types';
import { addDays, cohortWeeks, formatPlannerDate, formatPlannerRange, PHASE_LABEL, stoppedSundays, type PlannerClash, type PlannerCohort, type PlannerEvent } from '../../utils/planner';

interface MonthCalendarProps {
  start: string;
  end: string;
  today: string;
  plan: PlannerCohort[];
  events: PlannerEvent[];
  holidays: PublicHoliday[];
  clashes: PlannerClash[];
  onOpenCohort: (cohort: PlannerCohort) => void;
  onOpenEvent: (event: PlannerEvent) => void;
  onOpenClash: (clash: PlannerClash) => void;
}

/** Calendar cells select a day; the list below keeps every item readable on phones. */
const MonthCalendar: React.FC<MonthCalendarProps> = ({ start, end, today, plan, events, holidays, clashes, onOpenCohort, onOpenEvent, onOpenClash }) => {
  const [selected, setSelected] = useState(today >= start && today <= end ? today : start);
  const offset = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7;
  const first = addDays(start, -offset);
  const count = Math.ceil((offset + Number(end.slice(8))) / 7) * 7;
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  const classes = plan.flatMap((cohort) => cohort.classes.map((cls) => ({ cohort, cls })));
  const gaps = plan.flatMap((cohort) => cohortWeeks(cohort, events).filter((w) => w.kind === 'gap').map((week) => ({ cohort, week })));
  const stoppedDates = new Set(stoppedSundays(events, start, end));
  const dayClasses = classes.filter(({ cls }) => cls.date === selected);
  const dayEvents = events.filter((event) => event.startDate <= selected && event.endDate >= selected);
  const dayHolidays = holidays.filter((holiday) => holiday.date === selected);
  const dayGaps = gaps.filter(({ week }) => week.end === selected);
  const dayPhases = plan.flatMap((cohort) => cohort.phases.filter((phase) => phase.kind !== 'classes' && phase.start <= selected && phase.end >= selected).map((phase) => ({ cohort, phase })));
  const empty = !dayClasses.length && !dayEvents.length && !dayHolidays.length && !dayGaps.length && !dayPhases.length;

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-gray-400" aria-hidden="true">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day} className="py-2">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-gray-100 bg-gray-100" role="group" aria-label="Month calendar">
        {days.map((date) => {
          const inMonth = date >= start && date <= end;
          const ownClasses = classes.filter(({ cls }) => cls.date === date);
          const ownEvents = events.filter((event) => event.startDate <= date && event.endDate >= date);
          const ownHolidays = holidays.filter((holiday) => holiday.date === date);
          const noClass = stoppedDates.has(date) || gaps.some(({ week }) => week.end === date);
          const hasClash = clashes.some((clash) => clash.cls.date === date);
          return (
            <button
              key={date}
              type="button"
              disabled={!inMonth}
              aria-pressed={selected === date}
              aria-current={date === today ? 'date' : undefined}
              aria-label={`${formatPlannerDate(date, true, start)}${hasClash ? ', class clash' : noClass ? ', no Sunday class' : ''}, ${ownClasses.length} classes, ${ownEvents.length} events, ${ownHolidays.length} holidays`}
              onClick={() => setSelected(date)}
              className={`flex min-h-[68px] min-w-0 flex-col items-center gap-1 px-1 py-2 text-left sm:min-h-[100px] sm:items-start sm:px-2.5 ${selected === date ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : inMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 text-gray-300'}`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${date === today ? 'bg-primary text-white' : inMonth ? 'text-gray-700' : ''}`}>{Number(date.slice(8))}</span>
              {inMonth && <>
                <span className="flex flex-wrap justify-center gap-1 sm:hidden" aria-hidden="true">
                  {!!ownClasses.length && <i className={`h-1.5 w-1.5 rounded-full ${hasClash ? 'bg-red-500' : 'bg-orange-400'}`} />}
                  {!!ownEvents.length && <i className="h-1.5 w-1.5 rounded-full bg-violet-400" />}
                  {!!ownHolidays.length && <i className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
                  {noClass && <i className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                </span>
                <span className="hidden w-full space-y-0.5 sm:block" aria-hidden="true">
                  {ownClasses.map(({ cohort, cls }) => <span key={`${cohort.key}-${cls.weekNumber}`} className={`block truncate text-[10px] font-semibold ${hasClash ? 'text-red-600' : 'text-orange-700'}`}>{cohort.name} · Class {cls.weekNumber}</span>)}
                  {noClass && <span className="block truncate text-[10px] font-semibold text-red-600">No Sunday class</span>}
                  {ownEvents.map((event) => <span key={event.id} className="block truncate text-[10px] text-violet-700">{event.name}</span>)}
                  {ownHolidays.map((holiday) => <span key={holiday.id} className="block truncate text-[10px] text-sky-700">{holiday.name}</span>)}
                </span>
              </>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
        {[["bg-orange-400", "Class"], ["bg-violet-400", "Church event"], ["bg-sky-400", "Holiday"], ["bg-red-500", "Clash / skipped Sunday"]].map(([color, label]) => <span key={label} className="inline-flex items-center gap-1.5"><i className={`h-1.5 w-1.5 rounded-full ${color}`} />{label}</span>)}
      </div>
      <section className="mt-5 border-t border-gray-100 pt-4" aria-label="Selected day details" aria-live="polite">
        <h3 className="text-sm font-bold text-gray-900">{formatPlannerDate(selected, true, start)}</h3>
        <p className="mt-0.5 text-xs text-gray-400">Select a day to see its classes and events.</p>
        {empty ? <p className="mt-3 text-sm text-gray-500">Nothing scheduled for this day.</p> : <ul className="mt-3 space-y-2">
          {dayClasses.map(({ cohort, cls }) => {
            const clash = clashes.find((item) => item.cohort.key === cohort.key && item.cls.date === cls.date);
            return <li key={`${cohort.key}-${cls.weekNumber}`}><button type="button" onClick={() => clash ? onOpenClash(clash) : onOpenCohort(cohort)} className={`w-full rounded-xl p-3 text-left ${clash ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-800'}`}><span className="block text-sm font-semibold">{cohort.name} · Class {cls.weekNumber}</span><span className="block text-xs">{clash ? `${clash.event.name} · Review clash` : `${cohort.planned ? 'Planned · ' : ''}View class dates`}</span></button></li>;
          })}
          {dayGaps.map(({ cohort, week }) => <li key={cohort.key} className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><span className="font-semibold">{cohort.name} · No Sunday class</span>{week.event && <span className="block text-xs">{week.event.name}</span>}</li>)}
          {dayEvents.map((event) => <li key={event.id}><button type="button" onClick={() => onOpenEvent(event)} className="w-full rounded-xl bg-violet-50 p-3 text-left text-violet-800"><span className="block text-sm font-semibold">{event.name}</span><span className="block text-xs">{formatPlannerRange(event.startDate, event.endDate, start)} · Edit event</span>{event.stopsFof && <span className="mt-1 block text-xs font-semibold">{stoppedDates.has(selected) ? 'No Sunday class today' : 'Sunday classes pause during this event'}</span>}</button></li>)}
          {dayHolidays.map((holiday) => <li key={holiday.id} className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800"><span className="font-semibold">{holiday.name}</span><span className="block text-xs">Public holiday{holiday.isEstimate ? ' · estimated' : ''}</span></li>)}
          {dayPhases.map(({ cohort, phase }) => <li key={`${cohort.key}-${phase.kind}`}><button type="button" onClick={() => onOpenCohort(cohort)} className="w-full rounded-xl bg-gray-50 p-3 text-left text-sm text-gray-700"><span className="font-semibold">{cohort.name} · {PHASE_LABEL[phase.kind]}</span><span className="block text-xs text-gray-500">{formatPlannerRange(phase.start, phase.end, start)}</span></button></li>)}
        </ul>}
      </section>
    </div>
  );
};

export default MonthCalendar;
