import type { User } from '../types';

// "Female · 25 - 34" — the short line under a person's name wherever supports
// are matched with the people they follow up.
export const genderAgeLine = (person: { gender?: string | null; ageRange?: string | null }): string =>
  [person.gender, person.ageRange].filter((part): part is string => !!part && !!part.trim()).join(' · ');

// What a support's profile needs before it counts as complete.
export const supportProfileChecklist = (user: Pick<User, 'avatarUrl' | 'gender' | 'ageRange' | 'phone'>) => [
  { key: 'photo', label: 'Photo', done: !!user.avatarUrl },
  { key: 'gender', label: 'Gender', done: !!user.gender },
  { key: 'ageRange', label: 'Age range', done: !!user.ageRange },
  { key: 'phone', label: 'Phone number', done: !!user.phone?.trim() },
];

export const isSupportProfileComplete = (user: Pick<User, 'avatarUrl' | 'gender' | 'ageRange' | 'phone'>): boolean =>
  supportProfileChecklist(user).every((item) => item.done);
