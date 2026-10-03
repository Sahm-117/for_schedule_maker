import type { User } from '../types';

// "Female · 25 - 34" — the short line under a person's name wherever supports
// are matched with the people they follow up.
export const genderAgeLine = (person: { gender?: string | null; ageRange?: string | null }): string =>
  [person.gender, person.ageRange].filter((part): part is string => !!part && !!part.trim()).join(' · ');

// "Last seen 3 Oct, 3:15 pm" — short relative stamp for support cards.
// Returns '' when there is nothing to show.
export const formatLastSeen = (iso?: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `Last seen ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(date)}`;
};

// What a support's profile needs before it counts as complete.
export const supportProfileChecklist = (user: Pick<User, 'avatarUrl' | 'gender' | 'ageRange' | 'phone'>) => [
  { key: 'photo', label: 'Photo', done: !!user.avatarUrl },
  { key: 'gender', label: 'Gender', done: !!user.gender },
  { key: 'ageRange', label: 'Age range', done: !!user.ageRange },
  { key: 'phone', label: 'Phone number', done: !!user.phone?.trim() },
];

export const isSupportProfileComplete = (user: Pick<User, 'avatarUrl' | 'gender' | 'ageRange' | 'phone'>): boolean =>
  supportProfileChecklist(user).every((item) => item.done);
