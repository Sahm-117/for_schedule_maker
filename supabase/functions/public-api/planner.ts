// The planner's phases, for the API: a port of buildPlannerCohorts and phasesFor in frontend/src/utils/planner.ts.
// Keep the two in step (FLOW_MAP rule 118). Each cohort runs a 17-week cycle: 3 weeks rest, 3 weeks mobilisation,
// 10 class Sundays and 1 spare week. Dates are plain YYYY-MM-DD strings (Lagos calendar days), compared as strings.

const REST_WEEKS = 3
const MOBILISATION_WEEKS = 3
const CLASS_WEEKS = 10
const SPARE_WEEKS = 1
const DAY_MS = 86400000

type PhaseKind = 'rest' | 'mobilisation' | 'classes' | 'spare'
type Phase = { kind: PhaseKind; start: string; end: string }
type InputCohort = { id: string; name: string; status: string | null; startDate: string; endDate: string | null; weeks: Array<{ weekNumber: number; classDate: string | null }> }
export type PlannerInputs = {
  cohorts: InputCohort[]
  plannedDates: Record<string, unknown>
  churchEvents: unknown[]
  publicHolidays: unknown[]
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

const phasesFor = (classDates: string[], cycleEnd: string): Phase[] => {
  const last = classDates[classDates.length - 1]
  const classesStart = addDays(classDates[0], -6)
  const mobilisationStart = addDays(classesStart, -7 * MOBILISATION_WEEKS)
  const restStart = addDays(mobilisationStart, -7 * REST_WEEKS)
  const phases: Phase[] = [
    { kind: 'rest', start: restStart, end: addDays(mobilisationStart, -1) },
    { kind: 'mobilisation', start: mobilisationStart, end: addDays(classesStart, -1) },
    { kind: 'classes', start: classesStart, end: last },
  ]
  if (cycleEnd > last) phases.push({ kind: 'spare', start: addDays(last, 1), end: cycleEnd })
  return phases
}

const nextName = (name: string, step: number) => {
  const match = name.match(/^(.*?)(\d+)\s*$/)
  return match ? `${match[1]}${Number(match[2]) + step}` : step === 1 ? 'Next cohort' : `Next cohort + ${step - 1}`
}

/** Every real cohort with its phases, then planned (not yet created) cohorts until `untilIso`, as the app's planner shows them. */
export const plannerCohorts = (inputs: PlannerInputs, untilIso: string) => {
  const real = inputs.cohorts.map((c) => {
    const start = c.startDate.slice(0, 10)
    const classDates = (c.weeks.length > 0
      ? c.weeks.map((w) => (w.classDate ? w.classDate.slice(0, 10) : addDays(start, (w.weekNumber - 1) * 7)))
      : Array.from({ length: CLASS_WEEKS }, (_, i) => addDays(start, i * 7))).sort()
    const last = classDates[classDates.length - 1]
    const end = c.endDate ? c.endDate.slice(0, 10) : addDays(last, 7 * SPARE_WEEKS)
    const cycleEnd = end > last ? end : last
    return { id: c.id, name: c.name, planned: false, status: c.status, classDates, cycleEnd, phases: phasesFor(classDates, cycleEnd) }
  }).sort((a, b) => a.classDates[0].localeCompare(b.classDates[0]))

  const out: Array<{ id: string | null; name: string; planned: boolean; status: string | null; classDates: string[]; cycleEnd: string; phases: Phase[]; datesSetByHand?: boolean }> = [...real]
  const latest = real[real.length - 1]
  if (!latest) return out
  let restStart = addDays(latest.cycleEnd, 1)
  const realNames = new Set(real.map((c) => c.name.trim().toLowerCase()))
  for (let step = 1; restStart <= untilIso && step <= 12; step += 1) {
    const name = nextName(latest.name, step)
    const saved = inputs.plannedDates[name]
    const usable = !realNames.has(name.trim().toLowerCase()) && Array.isArray(saved) && saved.length === CLASS_WEEKS
      && saved.every((d, i) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && (i === 0 || d > (saved[i - 1] as string)))
    const firstClass = addDays(restStart, 7 * (REST_WEEKS + MOBILISATION_WEEKS) + 6)
    const classDates = usable ? (saved as string[]) : Array.from({ length: CLASS_WEEKS }, (_, i) => addDays(firstClass, i * 7))
    const cycleEnd = addDays(classDates[CLASS_WEEKS - 1], 7 * SPARE_WEEKS)
    out.push({ id: null, name, planned: true, status: null, classDates, cycleEnd, phases: phasesFor(classDates, cycleEnd), ...(usable ? { datesSetByHand: true } : {}) })
    restStart = addDays(cycleEnd, 1)
  }
  return out
}
