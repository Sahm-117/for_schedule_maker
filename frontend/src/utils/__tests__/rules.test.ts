import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRAMME_RULES, evaluateParticipants, sundayMarkAttended, sundayMarkMissed, type CohortPeoplePayload } from '../programmeRules';
import { describeMoment, type PlannerMoment } from '../planner';
import { restWeeksAfter } from '../checklist';
import { isSundayRush, pollWait } from '../../hooks/usePolling';
import { scriptureCohortStart } from '../participantApp';
import type { Cohort, Week } from '../../types';

// The rules that have bitten before. Each block names its FLOW_MAP rule.

describe('Sunday marks (rule 12)', () => {
  it('counts Present, Late and Left early as attended', () => {
    for (const status of ['PRESENT', 'LATE', 'LEFT_EARLY']) {
      expect(sundayMarkAttended({ status })).toBe(true);
      expect(sundayMarkMissed({ status })).toBe(false);
    }
  });
  it('counts only Absent as a miss; Excused is neither', () => {
    expect(sundayMarkMissed({ status: 'ABSENT' })).toBe(true);
    expect(sundayMarkAttended({ status: 'ABSENT' })).toBe(false);
    expect(sundayMarkAttended({ status: 'EXCUSED' })).toBe(false);
    expect(sundayMarkMissed({ status: 'EXCUSED' })).toBe(false);
  });
});

describe('participant health and completion', () => {
  const person = { id: 'p1', fullName: 'Test Person', status: 'ACTIVE', departments: null, createdAt: '2026-10-01', groupId: 'g1', onboarded: true };
  const payload = (sunday: Array<[number, string]>, meeting: Array<[number, string]> = []): CohortPeoplePayload => ({
    participants: [person],
    sunday: sunday.map(([weekId, status]) => ({ participantId: 'p1', weekId, status })),
    meeting: meeting.map(([weekId, status]) => ({ participantId: 'p1', weekId, status })),
    onboarding: [],
  });

  it('completes with late and left-early classes, and leaves an excused class out', () => {
    const [e] = evaluateParticipants(payload([[1, 'PRESENT'], [2, 'LATE'], [3, 'LEFT_EARLY'], [4, 'EXCUSED']]), [1, 2, 3, 4], true, DEFAULT_PROGRAMME_RULES);
    expect(e.sundayMisses).toBe(0);
    expect(e.completion?.outcome).toBe('COMPLETED');
    expect(e.completion?.attendancePct).toBe(100);
  });
  it('says records are missing when an unmarked class could still decide it', () => {
    const [e] = evaluateParticipants(payload([[1, 'PRESENT'], [2, 'PRESENT']]), [1, 2, 3], true, DEFAULT_PROGRAMME_RULES);
    expect(e.completion?.outcome).toBe('RECORDS_MISSING');
  });
  it('is a retake after an absence when every class must be attended', () => {
    const [e] = evaluateParticipants(payload([[1, 'PRESENT'], [2, 'ABSENT']]), [1, 2], true, DEFAULT_PROGRAMME_RULES);
    expect(e.completion?.outcome).toBe('RETAKE');
  });
  it('turns red only with enough Sunday and meeting misses', () => {
    const red = evaluateParticipants(payload([[1, 'ABSENT'], [2, 'ABSENT']], [[1, 'MISSED'], [2, 'MISSED']]), [1, 2], false, DEFAULT_PROGRAMME_RULES)[0];
    expect(red.health).toBe('critical');
    const amber = evaluateParticipants(payload([[1, 'ABSENT'], [2, 'LATE']], [[1, 'JOINED'], [2, 'JOINED']]), [1, 2], false, DEFAULT_PROGRAMME_RULES)[0];
    expect(amber.health).toBe('warning');
    const green = evaluateParticipants(payload([[1, 'LATE'], [2, 'LEFT_EARLY']]), [1, 2], false, DEFAULT_PROGRAMME_RULES)[0];
    expect(green.health).toBe('good');
  });
});

describe('Right now line (dashboard and Planner)', () => {
  const classDates = ['2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01'];
  const moment = { cohort: { name: 'Cohort 10', classDates }, phase: { kind: 'classes', start: '2026-10-11', end: '2026-11-01' } } as unknown as PlannerMoment;

  it('says which class is done and which comes next', () => {
    expect(describeMoment(moment, '2026-10-30')).toEqual({ title: 'Cohort 10 · Class 3 of 4 done', detail: 'Class 4 on Sun 1 Nov' });
  });
  it('says class today on a class day', () => {
    expect(describeMoment(moment, '2026-10-25')).toEqual({ title: 'Cohort 10 · Class 3 of 4', detail: 'Class today' });
  });
  it('says all classes done after the last one', () => {
    expect(describeMoment(moment, '2026-11-03').detail).toBe('All classes done');
  });
});

describe('rest weeks after a cohort (rule 121)', () => {
  it('start the day after the end date, Monday to Sunday', () => {
    const weeks = [1, 2, 3].map((n) => ({ id: n, weekNumber: n, classDate: null })) as unknown as Week[];
    const rest = restWeeksAfter({ startDate: '2026-10-11', endDate: '2026-12-20' } as Pick<Cohort, 'startDate' | 'endDate'>, weeks);
    expect(rest[0]).toEqual({ number: 1, start: '2026-12-21', end: '2026-12-27' });
    // checkup_rest_week3 gives the same Monday: end date + 1 + 14 days.
    expect(rest[2].start).toBe('2027-01-04');
  });
});

describe('Sunday-morning polling (rule 124)', () => {
  const at = (iso: string) => new Date(iso);
  it('is Sunday rush from 7 am to 2 pm Lagos', () => {
    expect(isSundayRush(at('2026-11-01T05:59:00Z'))).toBe(false); // 6:59 am Lagos
    expect(isSundayRush(at('2026-11-01T06:00:00Z'))).toBe(true); // 7:00 am Lagos
    expect(isSundayRush(at('2026-11-01T12:59:00Z'))).toBe(true); // 1:59 pm Lagos
    expect(isSundayRush(at('2026-11-01T13:00:00Z'))).toBe(false); // 2 pm Lagos
    expect(isSundayRush(at('2026-10-31T09:00:00Z'))).toBe(false); // Saturday
  });
  it('doubles only the checks that ask for it', () => {
    expect(pollWait(30000, true, at('2026-11-01T09:00:00Z'))).toBe(60000);
    expect(pollWait(20000, true, at('2026-11-01T09:00:00Z'))).toBe(40000);
    expect(pollWait(60000, false, at('2026-11-01T09:00:00Z'))).toBe(60000);
    expect(pollWait(60000, true, at('2026-10-31T09:00:00Z'))).toBe(60000);
  });
});

describe('daily scripture inside Practice', () => {
  const c10 = { id: 'c10', isPractice: false, startDate: '2026-10-11', status: 'ACTIVE' } as const;
  const c9 = { id: 'c9', isPractice: false, startDate: '2026-06-21', status: 'COMPLETED' } as const;
  const practice = { id: 'p', isPractice: true, startDate: '2026-10-31', status: 'ACTIVE' } as const;
  const all = [practice, c10, c9];

  it('counts from the cohort being viewed when it is real', () => {
    expect(scriptureCohortStart(c9, all, null)).toBe('2026-06-21');
  });
  it('follows the last real cohort inside Practice, not its restarted calendar', () => {
    expect(scriptureCohortStart(practice, all, 'c9')).toBe('2026-06-21');
  });
  it('falls back to the newest unfinished real cohort', () => {
    expect(scriptureCohortStart(practice, all, null)).toBe('2026-10-11');
    expect(scriptureCohortStart(practice, all, 'gone')).toBe('2026-10-11');
  });
  it('shows nothing when there is no real cohort', () => {
    expect(scriptureCohortStart(practice, [practice], null)).toBeUndefined();
  });
});
