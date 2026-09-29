import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import ChurchEventSheet from '../components/planner/ChurchEventSheet';
import PushBackSheet from '../components/planner/PushBackSheet';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { plannerApi } from '../services/api';
import {
  CYCLE_WEEKS,
  PHASE_LABEL,
  buildPlannerCohorts,
  cohortsStartingIn,
  currentMoment,
  describeMoment,
  findClashes,
  formatPlannerDate,
  formatPlannerRange,
  nextMoment,
  plannerToday,
  yearPercent,
  type PhaseKind,
  type PlannerClash,
  type PlannerCohort,
} from '../utils/planner';
import type { ChurchEvent, PlannerChange, PublicHoliday, PushBackResult } from '../types';

const SURFACE = 'rounded-[22px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)]';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PHASE_BAR: Record<PhaseKind, string> = {
  rest: 'bg-gray-200',
  mobilisation: 'bg-amber-300',
  classes: 'bg-orange-400',
  spare: 'bg-teal-300',
};
const LEGEND: Array<{ kind: PhaseKind; label: string }> = [
  { kind: 'rest', label: 'Rest (3 wks)' },
  { kind: 'mobilisation', label: 'Mobilisation (3)' },
  { kind: 'classes', label: 'Classes (10 Sundays)' },
  { kind: 'spare', label: 'Spare week (1)' },
];

type ClassWeekRow = { id: number; cohortId: string; weekNumber: number; classDate: string | null };

/** "just now" / "20 minutes ago" / "5 hours ago" / "3 days ago". */
const updatedAgo = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (mins < 1) return 'just now';
  if (mins < 60) return unit(mins, 'minute');
  if (mins < 60 * 24) return unit(Math.round(mins / 60), 'hour');
  return unit(Math.round(mins / (60 * 24)), 'day');
};

// The timeline is at least 608px wide (720px less the name column), and a
// label letter is about 6px, so a label spans roughly this much of the year.
const labelSpanPercent = (text: string) => ((text.length * 6 + 12) / 608) * 100;

/**
 * Dots for every holiday; labels laid out on up to three lines so they don't
 * overlap. A second day of the same holiday ("Eid El-Fitr Holiday" after
 * "Eid El-Fitr") gets a dot but no label. Labels near either end are pinned
 * inside the timeline instead of centred on the dot.
 */
const layoutHolidays = (holidays: PublicHoliday[], year: number) => {
  const lineEnds = [-Infinity, -Infinity, -Infinity];
  let prev: PublicHoliday | null = null;
  return holidays.map((holiday) => {
    const at = yearPercent(holiday.date, year);
    const repeat = !!prev && holiday.name.startsWith(prev.name) && (Date.parse(holiday.date) - Date.parse(prev.date)) <= 3 * 86400000;
    if (repeat) return { holiday, at, label: null };
    prev = holiday;
    const text = `${holiday.name}${holiday.isEstimate ? '*' : ''}`;
    const span = labelSpanPercent(text);
    const align: 'left' | 'center' | 'right' = at < span / 2 ? 'left' : at > 100 - span / 2 ? 'right' : 'center';
    const from = align === 'left' ? at : align === 'right' ? at - span : at - span / 2;
    const line = lineEnds.findIndex((end) => end <= from);
    if (line === -1) return { holiday, at, label: null };
    lineEnds[line] = from + span;
    return { holiday, at, label: { text, line, align } };
  });
};

const LABEL_LINE_TOP = ['top-4', 'top-8', 'top-12'];

const statusPill = (cohort: PlannerCohort, today: string) => {
  if (cohort.planned) return { label: 'Planned', className: 'bg-neutral-100 text-neutral-600' };
  if (cohort.status === 'COMPLETED' || cohort.status === 'ARCHIVED' || cohort.cycleEnd < today) return { label: 'Completed', className: 'bg-emerald-100/80 text-emerald-700' };
  if (cohort.phases[0].start <= today) return { label: 'Running', className: 'bg-sky-100/80 text-sky-700' };
  return { label: 'Coming up', className: 'bg-amber-100/80 text-amber-700' };
};

const StatCard: React.FC<{ eyebrow: string; title: React.ReactNode; detail?: React.ReactNode }> = ({ eyebrow, title, detail }) => (
  <div className={`${SURFACE} p-4`}>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{eyebrow}</p>
    <p className="mt-1 text-[17px] font-bold leading-snug text-gray-900">{title}</p>
    {detail && <p className="mt-0.5 text-[13px] text-gray-500">{detail}</p>}
  </div>
);

const AdminPlannerPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { cohorts, reloadCohorts } = useAppData();
  const today = plannerToday();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [weeks, setWeeks] = useState<ClassWeekRow[] | null>(null);
  const [error, setError] = useState('');
  const [holidays, setHolidays] = useState<PublicHoliday[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [changes, setChanges] = useState<PlannerChange[]>([]);
  const [eventSheet, setEventSheet] = useState<{ event: ChurchEvent | null } | null>(null);
  const [activeClash, setActiveClash] = useState<PlannerClash | null>(null);
  const [undoing, setUndoing] = useState(false);
  const toast = useToast();

  // Plan far enough ahead to fill the last year the switcher can show.
  const lastYear = thisYear + 2;

  const loadHolidays = () => plannerApi.getHolidays(`${thisYear - 2}-01-01`, `${lastYear}-12-31`)
    .then((res) => setHolidays(res.holidays))
    .catch(() => setHolidays([]));

  const loadWeeks = () => plannerApi.getClassWeeks()
    .then((res) => setWeeks(res.weeks))
    .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the planner.'));
  const loadEvents = () => plannerApi.getEvents().then((res) => setEvents(res.events)).catch(() => setEvents([]));
  const loadChanges = () => plannerApi.getChanges().then((res) => setChanges(res.changes)).catch(() => setChanges([]));

  useEffect(() => {
    void loadWeeks();
    void loadHolidays();
    void loadEvents();
    void loadChanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After classes move: the planner, the change log and every cohort's dates elsewhere in the app.
  const afterMove = () => {
    void loadWeeks();
    void loadChanges();
    void reloadCohorts();
  };

  const undoChange = async (change: PlannerChange) => {
    setUndoing(true);
    try {
      await plannerApi.undoChange(change.id);
      toast({ message: 'Change undone. The classes are back where they were.', tone: 'success' });
      afterMove();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not undo that change.', tone: 'error' });
    } finally {
      setUndoing(false);
    }
  };

  const refreshHolidays = async () => {
    setRefreshing(true);
    try {
      await plannerApi.refreshHolidays();
      await loadHolidays();
      toast({ message: 'Public holidays updated.', tone: 'success' });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not refresh the holidays.', tone: 'error' });
    } finally {
      setRefreshing(false);
    }
  };
  const plan = useMemo(
    () => (weeks ? buildPlannerCohorts(cohorts, weeks, `${lastYear}-12-31`) : []),
    [cohorts, weeks, lastYear],
  );
  const firstYear = plan.length > 0 ? Math.min(thisYear, Number(plan[0].phases[0].start.slice(0, 4))) : thisYear;
  const clashes = useMemo(() => findClashes(plan, events, today), [plan, events, today]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const now = currentMoment(plan, today);
  const nowText = now ? describeMoment(now, today) : null;
  const next = nextMoment(plan, today, now?.cohort);
  const nextText = next
    ? next.phase.kind === 'classes'
      ? { title: `${next.cohort.name} classes`, detail: `First class ${formatPlannerDate(next.cohort.classDates[0], true, today)}` }
      : { title: `${next.cohort.name} mobilisation`, detail: `Starts ${formatPlannerDate(next.phase.start, true, today)}` }
    : null;
  const startingThisYear = cohortsStartingIn(plan, year);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const inYear = plan.filter((c) => c.phases[0].start <= yearEnd && c.cycleEnd >= yearStart);
  const yearEvents = events.filter((e) => e.startDate <= yearEnd && e.endDate >= yearStart);
  const firstClash = clashes[0] ?? null;
  const clashIndex = activeClash ? plan.findIndex((c) => c.key === activeClash.cohort.key) : -1;
  const nextCohortName = clashIndex >= 0 ? plan[clashIndex + 1]?.name ?? null : null;
  const latestChange = changes.find((c) => !c.undoneAt) ?? null;

  // Would this move leave a year with fewer than 3 cohorts starting? Re-plans with the new dates.
  const yearWarning = (result: PushBackResult) => {
    if (!weeks) return null;
    const moved = new Map(result.moves.map((m) => [m.weekNumber, m.to]));
    const later = new Map(result.laterCohorts.map((l) => [l.cohortId, l.shiftDays]));
    const shiftIso = (iso: string, days: number) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const newCohorts = cohorts.map((c) => {
      if (c.id === result.cohortId) return { ...c, endDate: result.endAfter, startDate: moved.has(1) ? moved.get(1)! : c.startDate };
      const shift = later.get(c.id);
      return shift && c.startDate ? { ...c, startDate: shiftIso(c.startDate, shift), endDate: c.endDate ? shiftIso(c.endDate, shift) : c.endDate } : c;
    });
    const newWeeks = weeks.map((w) => {
      if (w.cohortId === result.cohortId && moved.has(w.weekNumber)) return { ...w, classDate: moved.get(w.weekNumber)! };
      const shift = later.get(w.cohortId);
      return shift && w.classDate ? { ...w, classDate: shiftIso(w.classDate, shift) } : w;
    });
    const after = buildPlannerCohorts(newCohorts, newWeeks, `${lastYear}-12-31`);
    const from = Number(result.classDate.slice(0, 4));
    for (const y of [from, from + 1]) {
      const n = cohortsStartingIn(after, y).length;
      if (n < 3 && n < cohortsStartingIn(plan, y).length) return `Only ${n} cohort${n === 1 ? '' : 's'} would start in ${y}. The aim is 3 a year.`;
    }
    return null;
  };
  const todayInYear = today.startsWith(String(year));
  const yearHolidays = (holidays ?? []).filter((h) => h.date.startsWith(String(year)));
  const lastFetched = (holidays ?? []).reduce<string | null>((latest, h) => (!latest || h.fetchedAt > latest ? h.fetchedAt : latest), null);
  const refreshButton = (
    <button type="button" onClick={() => void refreshHolidays()} disabled={refreshing} className="inline-flex items-center gap-1 font-semibold text-primary disabled:opacity-60">
      {refreshing ? (<><Spinner className="h-3 w-3" />Refreshing…</>) : 'Refresh now'}
    </button>
  );

  const yearSwitcher = (
    <div className={`${SURFACE} flex w-fit items-center gap-1 p-1`} role="group" aria-label="Year">
      <button
        type="button"
        onClick={() => setYear((y) => y - 1)}
        disabled={year <= firstYear}
        aria-label="Previous year"
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
      </button>
      <span className="min-w-[3.5rem] text-center text-[15px] font-bold tabular-nums text-gray-900">{year}</span>
      <button
        type="button"
        onClick={() => setYear((y) => y + 1)}
        disabled={year >= lastYear}
        aria-label="Next year"
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );

  return (
    <div className="page-content">
      <PageHeader
        title="FOF Planner"
        subtitle={`3 cohorts a year · each ${CYCLE_WEEKS}-week cycle: 3 weeks rest, 3 mobilisation, 10 classes and 1 spare week`}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            {yearSwitcher}
            <button type="button" onClick={() => setEventSheet({ event: null })} className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white active:scale-95">+ Church event</button>
          </div>
        )}
      />

      {error ? (
        <p className={`${SURFACE} p-5 text-sm text-red-700`}>{error}</p>
      ) : !weeks ? (
        <PageLoader />
      ) : plan.length === 0 ? (
        <p className={`${SURFACE} p-8 text-center text-sm text-gray-500`}>No cohorts with a start date yet. Add one on the Cohorts page.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard eyebrow="Right now" title={nowText?.title ?? 'Between cycles'} detail={nowText?.detail} />
            <StatCard eyebrow="Next up" title={nextText?.title ?? 'Nothing planned yet'} detail={nextText?.detail} />
            <StatCard
              eyebrow="Public holidays"
              title={holidays === null ? <Spinner className="h-4 w-4" /> : `${yearHolidays.length} in ${year}`}
              detail={<>{lastFetched ? `Updated ${updatedAgo(lastFetched)} · ` : 'Not loaded yet · '}{refreshButton}</>}
            />
            {firstClash ? (
              <button type="button" onClick={() => setActiveClash(firstClash)} className="rounded-[22px] bg-red-100/80 p-4 text-left active:scale-[0.99]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">Needs a decision</p>
                <p className="mt-1 text-[17px] font-bold leading-snug text-red-700">{clashes.length} clash{clashes.length === 1 ? '' : 'es'}</p>
                <p className="mt-0.5 text-[13px] text-red-700">
                  {firstClash.event.name} stops FOF on {firstClash.cohort.name}’s class {firstClash.cls.weekNumber}{clashes.length > 1 ? ` and ${clashes.length - 1} more` : ''} ›
                </p>
              </button>
            ) : (
              <StatCard eyebrow="Needs a decision" title="No clashes" detail="Church events that stop FOF show here if they land on a class." />
            )}
          </div>

          <section className={`${SURFACE} p-4 sm:p-5`}>
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <div className="min-w-[720px]">
                <div className="ml-[112px] grid grid-cols-12 text-center text-[11px] font-semibold text-gray-400">
                  {MONTHS.map((m) => <span key={m}>{m}</span>)}
                </div>
                <div className="relative mt-2">
                  <div className="pointer-events-none absolute inset-y-0 left-[112px] right-0 grid grid-cols-12" aria-hidden="true">
                    {MONTHS.map((m) => <span key={m} className="border-l border-gray-100" />)}
                  </div>
                  {todayInYear && (
                    <div className="pointer-events-none absolute inset-y-0 left-[112px] right-0" aria-hidden="true">
                      <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-primary" style={{ left: `${yearPercent(today, year)}%` }} />
                    </div>
                  )}
                  {inYear.length === 0 && (
                    <p className="py-6 pl-[112px] text-sm text-gray-500">Nothing planned in {year}.</p>
                  )}
                  {inYear.map((cohort) => (
                    <div key={cohort.key} className="relative flex h-12 items-center">
                      <span className="w-[112px] shrink-0 pr-2">
                        <span className="block truncate text-[13px] font-semibold text-gray-900">{cohort.name}</span>
                        {cohort.planned && <span className="block text-[11px] text-gray-400">planned</span>}
                      </span>
                      <div className="relative h-[24px] flex-1">
                        {cohort.phases.map((phase) => {
                          if (phase.end < yearStart || phase.start > yearEnd) return null;
                          const left = yearPercent(phase.start, year);
                          const right = yearPercent(phase.end, year) + (phase.end <= yearEnd ? (100 / 365) : 0);
                          return (
                            <div
                              key={phase.kind}
                              title={`${cohort.name} · ${PHASE_LABEL[phase.kind]}: ${formatPlannerRange(phase.start, phase.end, yearStart)}`}
                              className={`absolute inset-y-0 rounded-md ${PHASE_BAR[phase.kind]} ${cohort.planned ? 'opacity-55' : ''}`}
                              style={{ left: `${left}%`, width: `calc(${Math.max(0, right - left)}% - 2px)` }}
                            />
                          );
                        })}
                        {clashes.filter((cl) => cl.cohort.key === cohort.key && cl.cls.date.startsWith(String(year))).map((cl) => (
                          <button
                            key={`${cl.event.id}-${cl.cls.date}`}
                            type="button"
                            onClick={() => setActiveClash(cl)}
                            aria-label={`Clash: ${cl.event.name} on class ${cl.cls.weekNumber}`}
                            className="absolute -top-2 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white"
                            style={{ left: `${yearPercent(cl.cls.date, year)}%` }}
                          >
                            !
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="relative flex min-h-[40px] items-start py-1">
                    <span className="w-[112px] shrink-0 pr-2 pt-1 text-[13px] font-semibold text-gray-500">Church events</span>
                    <div className="relative flex-1">
                      {yearEvents.length === 0 ? (
                        <button type="button" onClick={() => setEventSheet({ event: null })} className="pt-1 text-[12px] font-semibold text-primary">+ Add one</button>
                      ) : (
                        <div className="relative" style={{ height: `${Math.min(yearEvents.length, 3) * 26}px` }}>
                          {yearEvents.map((event, index) => {
                            const at = yearPercent(event.startDate < yearStart ? yearStart : event.startDate, year);
                            const range = event.endDate === event.startDate
                              ? formatPlannerDate(event.startDate, false, yearStart)
                              : formatPlannerRange(event.startDate, event.endDate, yearStart);
                            return (
                              <button
                                key={event.id}
                                type="button"
                                onClick={() => setEventSheet({ event })}
                                className={`absolute whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${event.stopsFof ? 'bg-red-100/80 text-red-700' : 'bg-violet-100/80 text-violet-700'}`}
                                style={{ top: `${(index % 3) * 26}px`, ...(at > 70 ? { right: `${100 - at}%` } : { left: `${at}%` }) }}
                              >
                                {event.stopsFof ? '⛔ ' : ''}{event.name} {range} · {event.stopsFof ? 'no FOF' : 'FOF runs'}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="relative flex h-[76px] items-start">
                    <span className="w-[112px] shrink-0 pr-2 pt-0.5">
                      <span className="block text-[13px] font-semibold text-gray-500">Public holidays</span>
                      <span className="block text-[11px] text-gray-400">info only</span>
                    </span>
                    <div className="relative h-full flex-1">
                      {layoutHolidays(yearHolidays, year).map(({ holiday, at, label }) => (
                        <React.Fragment key={holiday.id}>
                          <span
                            title={`${formatPlannerDate(holiday.date, true, yearStart)} · ${holiday.name}${holiday.isEstimate ? ' (estimate)' : ''}`}
                            className="absolute top-1.5 block h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-sky-400"
                            style={{ left: `${at}%` }}
                          />
                          {label && (
                            <span
                              className={`absolute whitespace-nowrap text-[10.5px] font-semibold text-sky-700 ${LABEL_LINE_TOP[label.line]}`}
                              style={label.align === 'right' ? { right: `${100 - at}%` } : { left: `${at}%`, transform: label.align === 'center' ? 'translateX(-50%)' : undefined }}
                            >
                              {label.text}
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-100 pt-4 text-xs font-semibold text-gray-600">
              {LEGEND.map((item) => (
                <span key={item.kind} className="flex items-center gap-1.5"><i className={`h-3 w-5 rounded ${PHASE_BAR[item.kind]}`} />{item.label}</span>
              ))}
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-sky-400" />Public holiday (doesn't clash)</span>
              {todayInYear && <span className="flex items-center gap-1.5"><i className="h-3 w-0.5 rounded-full bg-primary" />Today</span>}
            </div>
            {yearHolidays.some((h) => h.isEstimate) && (
              <p className="mt-2 text-xs text-gray-400">* Eid and other moon-sighted dates are estimates until they're announced. The list refreshes every 2 weeks.</p>
            )}
          </section>

          {inYear.length > 0 && (
            <section>
              <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
                <h3 className="text-[13px] font-semibold text-gray-500">Dates in {year}</h3>
                <span className="text-xs text-gray-500">
                  {startingThisYear.length} cohort{startingThisYear.length === 1 ? '' : 's'} start{startingThisYear.length === 1 ? 's' : ''} in {year}
                  {startingThisYear.length === 3 ? ' · on track for 3' : startingThisYear.length < 3 ? ' · fewer than 3' : ' · more than 3'}
                </span>
              </div>
              <ul className={`${SURFACE} divide-y divide-[#f0f0f2] overflow-hidden`}>
                {inYear.map((cohort) => {
                  const pill = statusPill(cohort, today);
                  return (
                    <li key={cohort.key} className="px-4 py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[15px] font-semibold text-gray-900">{cohort.name}</p>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.className}`}>{pill.label}</span>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-4">
                        {[...cohort.phases, ...(cohort.phases.some((ph) => ph.kind === 'spare') ? [] : [{ kind: 'spare' as const, start: '', end: '' }])].map((phase) => (
                          <div key={phase.kind} className="flex items-start gap-2">
                            <i className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-sm ${PHASE_BAR[phase.kind]}`} aria-hidden="true" />
                            <div>
                              <dt className="text-gray-500">{PHASE_LABEL[phase.kind]}</dt>
                              <dd className="font-medium text-gray-900">
                                {phase.kind === 'classes'
                                  ? formatPlannerRange(cohort.classDates[0], cohort.classDates[cohort.classDates.length - 1], yearStart)
                                  : phase.start ? formatPlannerRange(phase.start, phase.end, yearStart) : 'Used up'}
                              </dd>
                            </div>
                          </div>
                        ))}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {changes.length > 0 && (
            <section>
              <h3 className="mb-2.5 px-1 text-[13px] font-semibold text-gray-500">Recent changes</h3>
              <ul className={`${SURFACE} divide-y divide-[#f0f0f2] overflow-hidden`}>
                {changes.map((change) => (
                  <li key={change.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className={`text-[14px] ${change.undoneAt ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{change.summary}</p>
                      <p className="text-xs text-gray-500">{updatedAgo(change.createdAt).replace(/^./, (c) => c.toUpperCase())}{change.undoneAt ? ' · undone' : ''}</p>
                    </div>
                    {latestChange?.id === change.id && (
                      <button type="button" onClick={() => void undoChange(change)} disabled={undoing} className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-60">
                        {undoing ? (<><Spinner className="h-3 w-3" />Undoing…</>) : 'Undo'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ChurchEventSheet
        isOpen={!!eventSheet}
        onClose={() => setEventSheet(null)}
        event={eventSheet?.event ?? null}
        plan={plan}
        today={today}
        onSaved={() => void loadEvents()}
      />
      <PushBackSheet
        clash={activeClash}
        onClose={() => setActiveClash(null)}
        today={today}
        nextCohortName={nextCohortName}
        yearWarning={yearWarning}
        onApplied={afterMove}
      />
    </div>
  );
};

export default AdminPlannerPage;
