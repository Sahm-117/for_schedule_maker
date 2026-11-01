import { describe, expect, it } from 'vitest';
import { buildClassRecords } from '../participantClassDots';
import { buildMissDetails } from '../participantHealthReason';
import type { CohortPeoplePayload } from '../programmeRules';

// The class dots and "N of M" on the Participants page (FLOW_MAP rule 12: only Absent is a miss, Excused is neither).

const weeks = [1, 2, 3, 4].map((n) => ({ id: n, weekNumber: n, classDate: `2026-10-${String(n * 7).padStart(2, '0')}` }));
const make = (
  sunday: Array<[string, number, string]>,
  participants: Array<{ id: string; createdAt: string }> = [{ id: 'a', createdAt: '2026-09-01' }],
): CohortPeoplePayload => ({
  participants: participants.map((p) => ({ ...p, fullName: p.id, status: 'ACTIVE', departments: null, groupId: 'g1', onboarded: true })),
  sunday: sunday.map(([participantId, weekId, status]) => ({ participantId, weekId, status })),
  meeting: [],
  onboarding: [],
});

describe('class dots (rule 12)', () => {
  it('flags missedLast when the last finished class is Absent', () => {
    const r = buildClassRecords(make([['a', 1, 'PRESENT'], ['a', 2, 'ABSENT']]), weeks, [1, 2]).get('a')!;
    expect(r.missedLast).toBe(true);
    expect(r.missedTwo).toBe(false);
  });
  it('flags missedTwo only for two Absents in a row at the end', () => {
    const two = buildClassRecords(make([['a', 1, 'PRESENT'], ['a', 2, 'ABSENT'], ['a', 3, 'ABSENT']]), weeks, [1, 2, 3]).get('a')!;
    expect(two.missedTwo).toBe(true);
    const gap = buildClassRecords(make([['a', 1, 'ABSENT'], ['a', 2, 'PRESENT'], ['a', 3, 'ABSENT']]), weeks, [1, 2, 3]).get('a')!;
    expect(gap.missedLast).toBe(true);
    expect(gap.missedTwo).toBe(false);
    const excusedBetween = buildClassRecords(make([['a', 1, 'ABSENT'], ['a', 2, 'EXCUSED'], ['a', 3, 'ABSENT']]), weeks, [1, 2, 3]).get('a')!;
    expect(excusedBetween.missedTwo).toBe(false);
  });
  it('counts M as finished classes minus Excused; a week this person has no mark for still counts', () => {
    // b has marks in weeks 1 and 2 only; week 3 is marked for a, so it is a finished class that b has no mark for.
    const people = make(
      [['a', 1, 'PRESENT'], ['a', 2, 'EXCUSED'], ['a', 3, 'ABSENT'], ['b', 1, 'LATE']],
      [{ id: 'a', createdAt: '2026-09-01' }, { id: 'b', createdAt: '2026-09-01' }],
    );
    const out = buildClassRecords(people, weeks, [1, 2, 3]);
    expect(out.get('a')).toMatchObject({ attended: 1, counted: 2 });
    expect(out.get('b')).toMatchObject({ attended: 1, counted: 3 });
  });
  it('ignores a week nobody was marked in (e.g. today before the register is taken)', () => {
    const out = buildClassRecords(make([['a', 1, 'PRESENT'], ['a', 2, 'ABSENT']]), weeks, [1, 2, 3, 4]).get('a')!;
    expect(out.dots.map((d) => d.weekNumber)).toEqual([1, 2]);
    expect(out.counted).toBe(2);
    expect(out.missedLast).toBe(true);
  });
  it('counts a real mark from before the person was added', () => {
    // Added after week 1's class date, but week 1 carries an Absent mark: it is a real mark.
    const out = buildClassRecords(make([['a', 1, 'ABSENT'], ['a', 2, 'ABSENT']], [{ id: 'a', createdAt: '2026-10-10' }]), weeks, [1, 2]).get('a')!;
    expect(out.dots[0].state).toBe('absent');
    expect(out.counted).toBe(2);
    expect(out.missedTwo).toBe(true);
  });
  it('shows an UNMARKED week before the person was added as no mark', () => {
    const people = make(
      [['a', 1, 'PRESENT'], ['a', 2, 'PRESENT'], ['b', 2, 'ABSENT']],
      [{ id: 'a', createdAt: '2026-09-01' }, { id: 'b', createdAt: '2026-10-10' }],
    );
    const b = buildClassRecords(people, weeks, [1, 2]).get('b')!;
    expect(b.dots.map((d) => d.state)).toEqual(['none', 'absent']);
  });
});

describe('miss details share the same walk', () => {
  it('still lists misses and unmarked weeks, leaving out unmarked weeks before joining', () => {
    const people = make(
      [['a', 1, 'ABSENT'], ['a', 2, 'PRESENT'], ['b', 2, 'PRESENT']],
      [{ id: 'a', createdAt: '2026-09-01' }, { id: 'b', createdAt: '2026-10-10' }],
    );
    const d = buildMissDetails(people, weeks, [1, 2, 3]);
    expect(d.get('a')).toEqual({ sunday: [{ weekNumber: 1, how: 'Absent' }], meeting: [], unmarked: [3] });
    expect(d.get('b')).toEqual({ sunday: [], meeting: [], unmarked: [3] });
  });
});
