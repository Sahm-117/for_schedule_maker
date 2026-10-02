import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AppOverflowMenu from '../components/AppOverflowMenu';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import ChurchEventSheet from '../components/planner/ChurchEventSheet';
import ClassDatesSheet from '../components/planner/ClassDatesSheet';
import CohortCard from '../components/planner/CohortCard';
import CohortSheet from '../components/planner/CohortSheet';
import PushBackSheet from '../components/planner/PushBackSheet';
import YearTimeline, { runsInYear } from '../components/planner/YearTimeline';
import { EXTENSION_STRIPES, KIND_BAR } from '../components/planner/PlannerBits';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { plannerApi } from '../services/api';
import {
  buildPlannerCohorts,
  cohortsStartingIn,
  currentMoment,
  describeMoment,
  findClashes,
  formatPlannerDate,
  nextMoment,
  plannerToday,
  yearPercent,
  type PlannerClash,
  type PlannerCohort,
} from '../utils/planner';
import type { ChurchEvent, PlannerChange, PublicHoliday, PushBackResult } from '../types';

const SURFACE = 'rounded-[22px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)]';

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

const LEGEND: Array<{ label: string; cls: string; stripes?: boolean }> = [
  { label: 'Rest', cls: KIND_BAR.rest },
  { label: 'Mobilisation', cls: KIND_BAR.mobilisation },
  { label: 'Classes', cls: KIND_BAR.classes },
  { label: 'Spare week', cls: KIND_BAR.spare },
  { label: 'No FOF (paused)', cls: KIND_BAR.gap },
  { label: 'Added by a push-back', cls: KIND_BAR.classes, stripes: true },
];

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
  const [plannedDates, setPlannedDates] = useState<Record<string, string[]>>({});
  const [datesFor, setDatesFor] = useState<PlannerCohort | null>(null);
  const [cohortSheet, setCohortSheet] = useState<{ cohort: PlannerCohort; adding: boolean } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
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
  const loadPlannedDates = () => plannerApi.getPlannedDates().then((res) => setPlannedDates(res.dates)).catch(() => setPlannedDates({}));
  const loadChanges = () => plannerApi.getChanges().then((res) => setChanges(res.changes)).catch(() => setChanges([]));

  useEffect(() => {
    void loadWeeks();
    void loadHolidays();
    void loadEvents();
    void loadChanges();
    void loadPlannedDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After classes move: the planner, the change log and every cohort's dates elsewhere in the app.
  const afterMove = () => {
    void loadWeeks();
    void loadChanges();
    void loadPlannedDates();
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
    () => (weeks ? buildPlannerCohorts(cohorts, weeks, `${lastYear}-12-31`, plannedDates) : []),
    [cohorts, weeks, lastYear, plannedDates],
  );
  const firstYear = plan.length > 0 ? Math.min(thisYear, Number(plan[0].phases[0].start.slice(0, 4))) : thisYear;
  const clashes = useMemo(() => findClashes(plan, events, today), [plan, events, today]);

  // Bring today, or the start of the year, into view on a phone.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const pct = today.startsWith(String(year)) ? yearPercent(today, year) : 0;
    el.scrollLeft = Math.max(0, (640 * pct) / 100 - 60);
  }, [year, today, weeks]);

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
  const firstClash = clashes.find((c) => !c.cohort.planned) ?? clashes[0] ?? null;
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
  const startCount = startingThisYear.length;
  const yearCohorts = plan.filter((c) => runsInYear(c, year));

  const yearSwitcher = (
    <div className={`${SURFACE} flex w-fit items-center gap-1 p-1`} role="group" aria-label="Year">
      <button type="button" onClick={() => setYear((y) => y - 1)} disabled={year <= firstYear} aria-label="Previous year" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
      </button>
      <span className="min-w-[3.5rem] text-center text-[15px] font-bold tabular-nums text-gray-900">{year}</span>
      <button type="button" onClick={() => setYear((y) => y + 1)} disabled={year >= lastYear} aria-label="Next year" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );

  // The next cohort that isn't created yet: what "Add cohort" plans.
  const nextPlanned = plan.find((c) => c.planned) ?? null;

  return (
    <div className="page-content">
      <PageHeader
        title="Planner"
        subtitle="When each cohort runs, and what could get in its way"
        action={(
          <div className="flex items-center gap-2">
            {nextPlanned && (
              <button type="button" onClick={() => setCohortSheet({ cohort: nextPlanned, adding: true })} className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white active:scale-95">Add cohort</button>
            )}
            <button type="button" onClick={() => setEventSheet({ event: null })} className="rounded-2xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-95">Add event</button>
            <AppOverflowMenu items={[{ label: refreshing ? 'Refreshing…' : 'Refresh public holidays', onClick: () => { if (!refreshing) void refreshHolidays(); } }]} />
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
          {firstClash ? (
            <button type="button" onClick={() => setActiveClash(firstClash)} className="block w-full rounded-[22px] bg-red-100/80 p-4 text-left active:scale-[0.99]">
              <p className="text-[17px] font-bold leading-snug text-red-700">
                {firstClash.event.name} lands on {firstClash.cohort.name}’s class {firstClash.cls.weekNumber}
              </p>
              <p className="mt-0.5 text-[13px] text-red-700">
                {formatPlannerDate(firstClash.cls.date, true, today)}{clashes.length > 1 ? ` · and ${clashes.length - 1} more` : ''} · Tap to see what moves ›
              </p>
            </button>
          ) : null}

          <div className={`${SURFACE} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4`}>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Right now</p>
              <p className="text-[17px] font-bold leading-snug text-gray-900">{nowText?.title ?? 'Between cycles'}</p>
              {nowText?.detail && <p className="text-[13px] text-gray-500">{nowText.detail}</p>}
            </div>
            {nextText && (
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Next up</p>
                <p className="text-[17px] font-bold leading-snug text-gray-900">{nextText.title}</p>
                <p className="text-[13px] text-gray-500">{nextText.detail}</p>
              </div>
            )}
          </div>

          <section className={`${SURFACE} p-4 sm:p-5`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              {yearSwitcher}
              <p className="text-[13px] text-gray-500">
                {startCount} cohort{startCount === 1 ? '' : 's'} start{startCount === 1 ? 's' : ''}
                {startCount === 3 ? ' · on track for 3' : startCount < 3 ? ' · aim is 3' : ' · more than the usual 3'}
              </p>
            </div>
            <YearTimeline
              year={year}
              plan={plan}
              events={events}
              holidays={yearHolidays}
              clashes={clashes}
              today={today}
              scrollRef={scroller}
              onOpenCohort={(cohort) => setCohortSheet({ cohort, adding: false })}
              onOpenEvent={(event) => setEventSheet({ event })}
              onOpenClash={setActiveClash}
            />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-100 pt-4 text-xs font-semibold text-gray-600">
              {LEGEND.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5"><i className={`h-3 w-5 rounded ${item.cls}`} style={item.stripes ? EXTENSION_STRIPES : undefined} />{item.label}</span>
              ))}
              {todayInYear && <span className="flex items-center gap-1.5"><i className="h-3 w-0.5 rounded-full bg-primary" />Today</span>}
            </div>
            <p className="mt-2 text-xs text-gray-400">Hover or tap a bar to see its weeks. Red shading is when FOF stops. Holidays are for information.</p>
          </section>

          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {yearCohorts.map((cohort) => (
              <CohortCard key={cohort.key} cohort={cohort} events={events} today={today} onOpen={() => setCohortSheet({ cohort, adding: false })} />
            ))}
          </ul>

          {changes.length > 0 && (
            <section>
              <h3 className="mb-2.5 px-1 text-[13px] font-semibold text-gray-500">Recent changes</h3>
              <ul className={`${SURFACE} divide-y divide-[#f0f0f2] overflow-hidden`}>
                {changes.slice(0, 5).map((change) => (
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

      <ChurchEventSheet isOpen={!!eventSheet} onClose={() => setEventSheet(null)} event={eventSheet?.event ?? null} plan={plan} today={today} onSaved={() => void loadEvents()} />
      <CohortSheet
        cohort={cohortSheet?.cohort ?? null}
        adding={cohortSheet?.adding}
        plan={plan}
        today={today}
        onClose={() => setCohortSheet(null)}
        onSaved={afterMove}
        onEditEach={(cohort) => { setCohortSheet(null); setDatesFor(cohort); }}
      />
      <ClassDatesSheet cohort={datesFor} plan={plan} today={today} onClose={() => setDatesFor(null)} onSaved={afterMove} />
      <PushBackSheet clash={activeClash} onClose={() => setActiveClash(null)} today={today} nextCohortName={nextCohortName} yearWarning={yearWarning} onApplied={afterMove} />
    </div>
  );
};

export default AdminPlannerPage;
