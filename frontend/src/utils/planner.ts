// The FOF year planner: each cohort runs a 17-week cycle of 3 weeks rest,
// 3 weeks mobilisation, 10 class Sundays and 1 spare week. Phases are whole
// Monday–Sunday weeks; a class week ends on its class Sunday. Dates are plain
// YYYY-MM-DD strings (Lagos calendar days), compared as strings.

import type { Cohort } from '../types';
import { classDateIso, lagosTodayIso, type ClassWeek } from './participantApp';

export const REST_WEEKS = 3;
export const MOBILISATION_WEEKS = 3;
export const CLASS_WEEKS = 10;
export const SPARE_WEEKS = 1;
export const CYCLE_WEEKS = REST_WEEKS + MOBILISATION_WEEKS + CLASS_WEEKS + SPARE_WEEKS;

export type PhaseKind = 'rest' | 'mobilisation' | 'classes' | 'spare';

export const PHASE_LABEL: Record<PhaseKind, string> = {
  rest: 'Rest',
  mobilisation: 'Mobilisation',
  classes: 'Classes',
  spare: 'Spare week',
};

export interface PlannerPhase {
  kind: PhaseKind;
  start: string;
  end: string;
}

export interface PlannerClass {
  /** The Week row's id; null for a planned (not yet created) cohort. */
  weekId: number | null;
  weekNumber: number;
  date: string;
}

export interface PlannerCohort {
  /** The cohort's id, or a made-up key for a planned (not yet created) one. */
  key: string;
  name: string;
  /** Not created yet: projected on from the last real cohort in 17-week steps. */
  planned: boolean;
  status: Cohort['status'] | null;
  /** Class Sundays in week order. */
  classDates: string[];
  classes: PlannerClass[];
  /** Last day of the cycle: the end of the spare week, or later once it's used up. */
  cycleEnd: string;
  /** Rest, mobilisation, classes, and the spare week while any is left. */
  phases: PlannerPhase[];
  /** The Practice cohort or a demo cohort (shown only when asked for). */
  test?: boolean;
  /** A planned cohort whose class dates were set by hand. */
  plannedOverride?: boolean;
}

const DAY_MS = 86400000;

export const isSunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;

export const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * Phases worked out from the class Sundays: rest and mobilisation before, the
 * spare week after until the cycle ends. Once a pushed-back class has used the
 * spare week there's no spare phase left.
 */
export const phasesFor = (classDates: string[], cycleEnd: string): PlannerPhase[] => {
  const first = classDates[0];
  const last = classDates[classDates.length - 1];
  const classesStart = addDays(first, -6);
  const mobilisationStart = addDays(classesStart, -7 * MOBILISATION_WEEKS);
  const restStart = addDays(mobilisationStart, -7 * REST_WEEKS);
  const phases: PlannerPhase[] = [
    { kind: 'rest', start: restStart, end: addDays(mobilisationStart, -1) },
    { kind: 'mobilisation', start: mobilisationStart, end: addDays(classesStart, -1) },
    { kind: 'classes', start: classesStart, end: last },
  ];
  if (cycleEnd > last) phases.push({ kind: 'spare', start: addDays(last, 1), end: cycleEnd });
  return phases;
};

/** The cohort's last day: the end of its spare week, or its last class once the spare week is used. */
const cycleEndOf = (cohort: PlannerCohort) => cohort.cycleEnd;
export const phaseOf = (cohort: PlannerCohort, kind: PhaseKind) => cohort.phases.find((p) => p.kind === kind) ?? null;

/** "Cohort 10" → "Cohort 11"; anything without a trailing number gets "Next cohort". */
const nextName = (name: string, step: number) => {
  const match = name.match(/^(.*?)(\d+)\s*$/);
  return match ? `${match[1]}${Number(match[2]) + step}` : step === 1 ? 'Next cohort' : `Next cohort + ${step - 1}`;
};

/** The Practice cohort and demo cohorts (names starting "ZZ"): not part of the real programme. */
export const isTestCohort = (cohort: Cohort) => !!cohort.isPractice || /^zz\b/i.test(cohort.name.trim());

/**
 * Every real cohort with its phases, followed by planned cohorts until
 * `untilIso`. Test cohorts (Practice, names starting "ZZ") are left out
 * unless `includeTest`.
 */
export const buildPlannerCohorts = (
  cohorts: Cohort[],
  weeks: Array<ClassWeek & { cohortId: string; id?: number }>,
  untilIso: string,
  plannedDates: Record<string, string[]> = {},
  includeTest = false,
): PlannerCohort[] => {
  const real: PlannerCohort[] = cohorts
    .filter((cohort) => cohort.startDate && (includeTest || !isTestCohort(cohort)))
    .map((cohort) => {
      const start = cohort.startDate!.slice(0, 10);
      const own = weeks.filter((w) => w.cohortId === cohort.id);
      const classes: PlannerClass[] = own.length > 0
        ? own.map((w) => ({ weekId: w.id ?? null, weekNumber: w.weekNumber, date: classDateIso(start, w) }))
          .sort((a, b) => a.date.localeCompare(b.date))
        : Array.from({ length: CLASS_WEEKS }, (_, i) => ({ weekId: null, weekNumber: i + 1, date: addDays(start, i * 7) }));
      const classDates = classes.map((k) => k.date);
      const last = classDates[classDates.length - 1];
      const end = cohort.endDate ? cohort.endDate.slice(0, 10) : addDays(last, 7 * SPARE_WEEKS);
      const cycleEnd = end > last ? end : last;
      return { key: cohort.id, name: cohort.name, planned: false, status: cohort.status ?? null, classDates, classes, cycleEnd, phases: phasesFor(classDates, cycleEnd), ...(isTestCohort(cohort) ? { test: true } : {}) };
    })
    .sort((a, b) => a.classDates[0].localeCompare(b.classDates[0]));

  const out = [...real];
  const latest = real[real.length - 1];
  if (!latest) return out;
  // The next cycle's rest starts the day after the latest cohort's cycle ends.
  let restStart = addDays(cycleEndOf(latest), 1);
  const realNames = new Set(real.map((c) => c.name.trim().toLowerCase()));
  for (let step = 1; restStart <= untilIso && step <= 12; step += 1) {
    const name = nextName(latest.name, step);
    const saved = plannedDates[name];
    const usable = !realNames.has(name.trim().toLowerCase()) && Array.isArray(saved) && saved.length === CLASS_WEEKS
      && saved.every((d, i) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (i === 0 || d > saved[i - 1]));
    const firstClass = addDays(restStart, 7 * (REST_WEEKS + MOBILISATION_WEEKS) + 6);
    const classDates = usable ? saved : Array.from({ length: CLASS_WEEKS }, (_, i) => addDays(firstClass, i * 7));
    const classes = classDates.map((date, i) => ({ weekId: null, weekNumber: i + 1, date }));
    const cycleEnd = addDays(classDates[CLASS_WEEKS - 1], 7 * SPARE_WEEKS);
    out.push({ key: `planned-${step}`, name, planned: true, status: null, classDates, classes, cycleEnd, phases: phasesFor(classDates, cycleEnd), ...(usable ? { plannedOverride: true } : {}) });
    restStart = addDays(cycleEnd, 1);
  }
  return out;
};

export interface PlannerMoment {
  cohort: PlannerCohort;
  phase: PlannerPhase;
}

const PHASE_WEIGHT: Record<PhaseKind, number> = { classes: 3, spare: 2, mobilisation: 1, rest: 0 };

/** The phase today falls in. Where cohorts overlap, classes win over the spare week, then mobilisation, then rest. */
export const currentMoment = (cohorts: PlannerCohort[], today: string): PlannerMoment | null => {
  let best: PlannerMoment | null = null;
  for (const cohort of cohorts) {
    for (const phase of cohort.phases) {
      if (phase.start > today || phase.end < today) continue;
      if (!best || PHASE_WEIGHT[phase.kind] > PHASE_WEIGHT[best.phase.kind]) best = { cohort, phase };
    }
  }
  return best;
};

/** The next mobilisation or first class to start after today, skipping `skip` (the cohort Right now already covers). */
export const nextMoment = (cohorts: PlannerCohort[], today: string, skip?: PlannerCohort | null): PlannerMoment | null => {
  let best: PlannerMoment | null = null;
  for (const cohort of cohorts) {
    if (skip && cohort.key === skip.key) continue;
    for (const phase of cohort.phases) {
      if (phase.kind !== 'mobilisation' && phase.kind !== 'classes') continue;
      const starts = phase.kind === 'classes' ? cohort.classDates[0] : phase.start;
      if (starts <= today) continue;
      const bestStarts = best ? (best.phase.kind === 'classes' ? best.cohort.classDates[0] : best.phase.start) : null;
      if (!bestStarts || starts < bestStarts) best = { cohort, phase };
    }
  }
  return best;
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sun 11 Oct"; adds the year when it isn't `yearOf`'s. */
export const formatPlannerDate = (iso: string, withWeekday = true, yearOf?: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const base = `${withWeekday ? `${WEEKDAY[d.getUTCDay()]} ` : ''}${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
  return yearOf && iso.slice(0, 4) !== yearOf.slice(0, 4) ? `${base} ${iso.slice(0, 4)}` : base;
};

/** "11 Oct – 13 Dec" (years shown when the range leaves `yearOf`'s year). */
export const formatPlannerRange = (start: string, end: string, yearOf?: string) =>
  `${formatPlannerDate(start, false, yearOf)} – ${formatPlannerDate(end, false, yearOf)}`;

/** One-line summary for the Right now card, e.g. "Cohort 10 · Class 4 of 10". */
export const describeMoment = (moment: PlannerMoment, today: string) => {
  const { cohort, phase } = moment;
  if (phase.kind === 'classes') {
    const held = cohort.classDates.filter((d) => d <= today).length;
    const next = cohort.classDates.find((d) => d >= today) ?? null;
    return {
      title: held === 0 ? `${cohort.name} · Class 1 of ${cohort.classDates.length}` : `${cohort.name} · Class ${held} of ${cohort.classDates.length}`,
      detail: next
        ? next === today ? 'Class today' : `${held === 0 ? 'First' : 'Next'} class ${formatPlannerDate(next, true, today)}`
        : 'Last class done',
    };
  }
  if (phase.kind === 'spare') {
    return { title: `${cohort.name} · Spare week`, detail: `Ends ${formatPlannerDate(phase.end, true, today)}` };
  }
  if (phase.kind === 'mobilisation') {
    return { title: `${cohort.name} · Mobilisation`, detail: `First class ${formatPlannerDate(cohort.classDates[0], true, today)}` };
  }
  return { title: `${cohort.name} · Rest`, detail: `Mobilisation starts ${formatPlannerDate(addDays(phase.end, 1), true, today)}` };
};

export const plannerToday = () => lagosTodayIso(new Date());

/** How far through [yearStart, yearEnd] a date is, 0–100, clamped. */
export const yearPercent = (iso: string, year: number) => {
  const start = `${year}-01-01`;
  const days = daysBetween(start, `${year + 1}-01-01`);
  return Math.min(100, Math.max(0, (daysBetween(start, iso) / days) * 100));
};

/** Cohorts whose classes start in `year`. */
export const cohortsStartingIn = (cohorts: PlannerCohort[], year: number) =>
  cohorts.filter((c) => c.classDates[0].startsWith(String(year)));

/** A church event, as the Planner needs it. */
export interface PlannerEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  stopsFof: boolean;
}

export interface PlannerClash {
  event: PlannerEvent;
  cohort: PlannerCohort;
  cls: PlannerClass;
}

/** Only Sundays covered by Stops-FOF events, clipped to the visible range. */
export const stoppedSundays = (events: PlannerEvent[], from: string, to: string): string[] => {
  const dates = new Set<string>();
  for (const event of events) {
    if (!event.stopsFof) continue;
    const start = event.startDate > from ? event.startDate : from;
    const end = event.endDate < to ? event.endDate : to;
    if (start > end) continue;
    const day = new Date(`${start}T00:00:00Z`).getUTCDay();
    for (let sunday = addDays(start, (7 - day) % 7); sunday <= end; sunday = addDays(sunday, 7)) dates.add(sunday);
  }
  return [...dates].sort();
};

/**
 * Class Sundays from today on that fall inside a Stops-FOF event. Planned
 * cohorts are included (they can't be pushed until they're created).
 */
export const findClashes = (cohorts: PlannerCohort[], events: PlannerEvent[], today: string): PlannerClash[] => {
  const out: PlannerClash[] = [];
  for (const event of events) {
    if (!event.stopsFof) continue;
    for (const cohort of cohorts) {
      for (const cls of cohort.classes) {
        if (cls.date >= today && cls.date >= event.startDate && cls.date <= event.endDate) out.push({ event, cohort, cls });
      }
    }
  }
  return out.sort((a, b) => a.cls.date.localeCompare(b.cls.date));
};

/** Classes an event's dates would land on (for the warning while adding one). */
export const classesHitBy = (cohorts: PlannerCohort[], start: string, end: string) =>
  cohorts.flatMap((cohort) => cohort.classes.filter((cls) => cls.date >= start && cls.date <= end).map((cls) => ({ cohort, cls })));

export type WeekKind = PhaseKind | 'gap';

/** One Monday–Sunday week of a cohort's cycle, as the Planner draws it. */
export interface PlannerWeek {
  /** The Monday. */
  start: string;
  /** The Sunday. */
  end: string;
  kind: WeekKind;
  /** 1–10 for a class week. */
  classNumber?: number;
  /** For a gap: the church event that took this Sunday, when one is known. */
  event?: PlannerEvent | null;
  /** Past the cycle's usual end, because a class was pushed back. */
  extension?: boolean;
}

/** Where a cycle would end with nothing pushed back: first class + 9 weeks + the spare week. */
export const usualEnd = (cohort: PlannerCohort) =>
  addDays(cohort.classDates[0], 7 * (cohort.classDates.length - 1 + SPARE_WEEKS));

/** Whole weeks the cycle ran past its usual end. */
export const extensionWeeks = (cohort: PlannerCohort) =>
  Math.max(0, Math.round(daysBetween(usualEnd(cohort), cohort.cycleEnd) / 7));

/**
 * The cohort week by week. A Sunday skipped between two classes is a "gap",
 * labelled with the Stops-FOF event that covers it. Weeks after the usual end
 * are marked as the extension.
 */
export const cohortWeeks = (cohort: PlannerCohort, events: PlannerEvent[]): PlannerWeek[] => {
  const out: PlannerWeek[] = [];
  const usual = usualEnd(cohort);
  const first = cohort.classDates[0];
  const last = cohort.classDates[cohort.classDates.length - 1];
  const classAt = new Map(cohort.classDates.map((d, i) => [d, i + 1]));
  const stops = events.filter((e) => e.stopsFof);
  for (let start = cohort.phases[0].start; addDays(start, 6) <= cohort.cycleEnd; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    const week: PlannerWeek = { start, end, kind: 'rest', extension: end > usual };
    const number = classAt.get(end);
    if (number) {
      week.kind = 'classes';
      week.classNumber = number;
    } else if (end > first && end < last) {
      week.kind = 'gap';
      week.event = stops.find((e) => e.startDate <= end && e.endDate >= end) ?? null;
    } else if (end > last) {
      week.kind = 'spare';
    } else {
      week.kind = cohort.phases.find((p) => p.kind !== 'classes' && p.start <= start && p.end >= end)?.kind ?? 'rest';
    }
    out.push(week);
  }
  return out;
};

export interface PlannerSegment {
  kind: WeekKind;
  start: string;
  end: string;
  weeks: number;
  /** Class numbers this segment holds, e.g. 1–4. */
  firstClass?: number;
  lastClass?: number;
  event?: PlannerEvent | null;
  extension: boolean;
}

/** Consecutive weeks of the same kind merged into the bars the year view draws. */
export const cohortSegments = (cohort: PlannerCohort, events: PlannerEvent[]): PlannerSegment[] => {
  const out: PlannerSegment[] = [];
  for (const w of cohortWeeks(cohort, events)) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === w.kind && prev.extension === !!w.extension && prev.kind !== 'gap') {
      prev.end = w.end;
      prev.weeks += 1;
      if (w.classNumber) prev.lastClass = w.classNumber;
    } else if (prev && prev.kind === 'gap' && w.kind === 'gap' && (prev.event?.id ?? null) === (w.event?.id ?? null)) {
      prev.end = w.end;
      prev.weeks += 1;
    } else {
      out.push({ kind: w.kind, start: w.start, end: w.end, weeks: 1, firstClass: w.classNumber, lastClass: w.classNumber, event: w.event, extension: !!w.extension });
    }
  }
  return out;
};

/** "1 week" / "10 weeks". */
export const weeksLabel = (n: number) => `${n} week${n === 1 ? '' : 's'}`;
