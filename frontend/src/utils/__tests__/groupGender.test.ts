import { describe, expect, it } from 'vitest';
import type { Group } from '../../types';
import { genderAgeLabel, genderFits, groupGenders, groupMoveMessage } from '../groupGender';

const group = (id: string, supportId: string | null = null): Group => ({ id, cohortId: 'c', name: id, supportId });

describe('groupGenders (rule 135)', () => {
  const supports = new Map([['sF', { gender: 'Female' }], ['sM', { gender: 'male' }], ['sX', { gender: null }]]);
  const people = [
    { id: 'a', groupId: 'women', gender: 'Female' },
    { id: 'b', groupId: 'women', gender: 'female' },
    { id: 'c', groupId: 'mixed', gender: 'Female' },
    { id: 'd', groupId: 'mixed', gender: 'Male' },
    { id: 'e', groupId: 'unknown', gender: null },
  ];
  const map = groupGenders([group('women', 'sM'), group('mixed'), group('emptyM', 'sM'), group('unknown', 'sX'), group('bare')], people, supports);

  it('takes the members first, then the support', () => {
    expect(map.get('women')).toBe('Female');
    expect(map.get('emptyM')).toBe('Male');
  });
  it('calls a group with both genders Mixed', () => expect(map.get('mixed')).toBe('Mixed'));
  it('knows nothing about a group with no gendered members or support', () => {
    expect(map.has('unknown')).toBe(false);
    expect(map.has('bare')).toBe(false);
  });
  it('leaves the person being placed out', () => {
    const m = groupGenders([group('mixed')], people, supports, 'd');
    expect(m.get('mixed')).toBe('Female');
  });
});

describe('genderFits', () => {
  it('matches, refuses, and lets unknowns through', () => {
    expect(genderFits('Female', 'Female')).toBe(true);
    expect(genderFits('M', 'Female')).toBe(false);
    expect(genderFits('Male', 'Mixed')).toBe(true);
    expect(genderFits(null, 'Female')).toBe(true);
    expect(genderFits('Female', undefined)).toBe(true);
  });
});

describe('labels', () => {
  it('reads gender and age', () => {
    expect(genderAgeLabel('female', '25 - 34')).toBe('Female · 25–34');
    expect(genderAgeLabel(null, '35-44')).toBe('Age 35–44');
    expect(genderAgeLabel(null, null)).toBe('');
  });
  it('turns database codes into plain words', () => {
    expect(groupMoveMessage("GENDER_MISMATCH: Group 3 is a women's group and Tunde is male")).toContain('Show all groups');
    expect(groupMoveMessage('TEEN_GROUP_ONLY: Ada is a teen; give them a Teen Support instead')).toBe('Ada is a teen; give them a Teen Support instead.');
    expect(groupMoveMessage('something else')).toBe('something else');
  });
});
