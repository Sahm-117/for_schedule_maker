import type { User } from '../types';
import { normaliseAgeRange, normaliseGender } from './groupingRules';
import { AGE_RANGE_OPTIONS } from '../constants/departments';

// Greeting names skip titles ("Mrs Ogunyomi" greets as "Ogunyomi", not
// "Mrs"). If the whole name is titles, the first word is kept as fallback.
const TITLE_WORDS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'pastor', 'pst', 'rev',
  'elder', 'deacon', 'deaconess', 'daddy', 'mummy', 'alhaji', 'alhaja',
  'chief', 'sir', 'madam', 'brother', 'sister', 'bro', 'sis',
]);

export const firstNameOf = (fullName: string | null | undefined): string => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return parts.find((part) => !TITLE_WORDS.has(part.replace(/\./g, '').toLowerCase())) || parts[0] || '';
};

// "Female · 25 - 34" — the short line under a person's name wherever supports
// are matched with the people they follow up.
export const genderAgeLine = (person: { gender?: string | null; ageRange?: string | null }): string =>
  [person.gender, person.ageRange].filter((part): part is string => !!part && !!part.trim()).join(' · ');

// "Active 2 weeks ago" with a tone for the presence dot:
// green = seen in the last week, grey = older/unknown, red = no recorded activity.
export const activeStatus = (iso?: string | null): { label: string; tone: 'green' | 'grey' | 'red' } => {
  if (iso === undefined) return { label: 'Activity unavailable', tone: 'grey' };
  if (!iso) return { label: 'No recorded activity', tone: 'red' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { label: 'Activity unavailable', tone: 'grey' };
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  let rel: string;
  if (mins < 1) {
    rel = 'just now';
  } else if (mins < 60) {
    rel = `${mins} min ago`;
  } else if (mins < 60 * 24) {
    const h = Math.floor(mins / 60);
    rel = `${h} hour${h === 1 ? '' : 's'} ago`;
  } else if (mins < 60 * 24 * 7) {
    const d = Math.floor(mins / (60 * 24));
    rel = d === 1 ? 'yesterday' : `${d} days ago`;
  } else if (mins < 60 * 24 * 30) {
    const w = Math.floor(mins / (60 * 24 * 7));
    rel = `${w} week${w === 1 ? '' : 's'} ago`;
  } else if (mins < 60 * 24 * 365) {
    const m = Math.floor(mins / (60 * 24 * 30));
    rel = `${m} month${m === 1 ? '' : 's'} ago`;
  } else {
    rel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }
  return { label: `Active ${rel}`, tone: mins < 60 * 24 * 7 ? 'green' : 'grey' };
};

export const activeDot = (tone: 'green' | 'grey' | 'red'): string =>
  tone === 'green' ? 'bg-emerald-500' : tone === 'red' ? 'bg-red-500' : 'bg-gray-300';

// What a support's profile needs before it counts as complete.
export const supportProfileChecklist = (user: Pick<User, 'avatarUrl' | 'gender' | 'ageRange' | 'phone'>) => [
  { key: 'photo', label: 'Photo', done: !!user.avatarUrl },
  { key: 'gender', label: 'Gender', done: !!user.gender },
  { key: 'ageRange', label: 'Age range', done: !!user.ageRange },
  { key: 'phone', label: 'Phone number', done: !!user.phone?.trim() },
];

export const isSupportProfileComplete = (user: Pick<User, 'avatarUrl' | 'gender' | 'ageRange' | 'phone'>): boolean =>
  supportProfileChecklist(user).every((item) => item.done);

/** A support in every list that needs supports: the Support role, or an admin who also carries the Support tag. */
export const hasSupportRole = (user: { role?: string; roles?: string[] | null }): boolean =>
  user.role === 'SUPPORT' || !!user.roles?.includes('SUPPORT');

/** The age range a date of birth (YYYY-MM-DD) gives today, or null when it isn't believable (age 5 to 100). Mirrors the database. */
export const ageRangeFromDate = (dob: string, now: Date = new Date()): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  let age = now.getFullYear() - Number(m[1]);
  if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) age -= 1;
  if (age < 5 || age > 100) return null;
  if (age < 18) return '18 and below';
  if (age <= 24) return '18 - 24';
  if (age <= 34) return '25 - 34';
  if (age <= 44) return '35 - 44';
  if (age <= 59) return '45 - 59';
  return '60 and above';
};

/** Gender and Age dropdown options shared by the Participants and Supports pages. */
export const GENDER_FILTER_OPTIONS = [{ value: '', label: 'All genders' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }];
export const AGE_FILTER_OPTIONS = [
  { value: '', label: 'All ages' },
  ...AGE_RANGE_OPTIONS.map((range) => ({ value: range, label: range })),
  { value: '__unknown', label: 'Age not known' },
];

/** True when a person passes the Gender and Age filters ('' = no filter). Saved variants like "25-34" count as "25 - 34". */
export const matchesGenderAge = (person: { gender?: string | null; ageRange?: string | null }, gender: string, age: string): boolean => {
  if (gender && normaliseGender(person.gender) !== gender) return false;
  if (age) {
    const range = normaliseAgeRange(person.ageRange);
    if (age === '__unknown' ? range !== null : range !== age) return false;
  }
  return true;
};
