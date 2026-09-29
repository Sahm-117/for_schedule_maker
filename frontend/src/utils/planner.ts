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

export interface PlannerCohort {
  /** The cohort's id, or a made-up key for a planned (not yet created) one. */
  key: string;
  name: string;
  /** Not created yet: projected on from the last real cohort in 17-week steps. */
  planned: boolean;
  status: Cohort['status'] | null;
  /** Class Sundays in week order. */
  classDates: string[];
  phases: PlannerPhase[];
}

const DAY_MS = 86400000;

export const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Phases worked out from the class Sundays: rest and mobilisation before, spare week after. */
const phasesFor = (classDates: string[]): PlannerPhase[] => {
  const first = classDates[0];
  const last = classDates[classDates.length - 1];
  const classesStart = addDays(first, -6);
  const mobilisationStart = addDays(classesStart, -7 * MOBILISATION_WEEKS);
  const restStart = addDays(mobilisationStart, -7 * REST_WEEKS);
  return [
    { kind: 'rest', start: restStart, end: addDays(mobilisationStart, -1) },
    { kind: 'mobilisation', start: mobilisationStart, end: addDays(classesStart, -1) },
    { kind: 'classes', start: classesStart, end: last },
    { kind: 'spare', start: addDays(last, 1), end: addDays(last, 7 * SPARE_WEEKS) },
  ];
};

/** "Cohort 10" → "Cohort 11"; anything without a trailing number gets "Next cohort". */
const nextName = (name: string, step: number) => {
  const match = name.match(/^(.*?)(\d+)\s*$/);
  return match ? `${match[1]}${Number(match[2]) + step}` : step === 1 ? 'Next cohort' : `Next cohort + ${step - 1}`;
};

/**
 * Every real cohort with its phases, followed by planned cohorts until
 * `untilIso`. Test cohorts (names starting "ZZ") are left out.
 */
export const buildPlannerCohorts = (
  cohorts: Cohort[],
  weeks: Array<ClassWeek & { cohortId: string }>,
  untilIso: string,
): PlannerCohort[] => {
  const real: PlannerCohort[] = cohorts
    .filter((cohort) => cohort.startDate && !/^zz\b/i.test(cohort.name.trim()))
    .map((cohort) => {
      const start = cohort.startDate!.slice(0, 10);
      const own = weeks.filter((w) => w.cohortId === cohort.id);
      const classDates = own.length > 0
        ? own.map((w) => classDateIso(start, w)).sort()
        : Array.from({ length: CLASS_WEEKS }, (_, i) => addDays(start, i * 7));
      return { key: cohort.id, name: cohort.name, planned: false, status: cohort.status ?? null, classDates, phases: phasesFor(classDates) };
    })
    .sort((a, b) => a.classDates[0].localeCompare(b.classDates[0]));

  const out = [...real];
  const latest = real[real.length - 1];
  if (!latest) return out;
  // The next cycle's rest starts the day after the latest cohort's spare week.
  let restStart = addDays(latest.phases[3].end, 1);
  for (let step = 1; restStart <= untilIso && step <= 12; step += 1) {
    const firstClass = addDays(restStart, 7 * (REST_WEEKS + MOBILISATION_WEEKS) + 6);
    const classDates = Array.from({ length: CLASS_WEEKS }, (_, i) => addDays(firstClass, i * 7));
    const phases = phasesFor(classDates);
    out.push({ key: `planned-${step}`, name: nextName(latest.name, step), planned: true, status: null, classDates, phases });
    restStart = addDays(phases[3].end, 1);
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
