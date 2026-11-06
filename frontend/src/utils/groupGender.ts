import type { Group, Participant, User } from '../types';
import { normaliseAgeRange, normaliseGender } from './groupingRules';

// Group gender (FLOW_MAP rule 135). Mirrors the database's group_gender_of(): a group's gender is its members'
// gender; an empty group takes its support's gender; a group that holds both, or anyone an admin placed on purpose,
// is Mixed and takes anyone. The database refuses a wrong-gender placement unless an admin sends an override.

export type GroupGender = 'Female' | 'Male' | 'Mixed';

/** Each group's gender, or no entry when nothing is known. */
export const groupGenders = (
  groups: Group[],
  participants: Pick<Participant, 'id' | 'groupId' | 'gender'>[],
  supportsById: Map<string, Pick<User, 'gender'>>,
  /** Leave this person out (the one being placed), as the database does. */
  exceptId?: string | null,
): Map<string, GroupGender> => {
  const seen = new Map<string, Set<string>>();
  participants.forEach((p) => {
    if (!p.groupId || p.id === exceptId) return;
    const g = normaliseGender(p.gender);
    if (g !== 'Female' && g !== 'Male') return;
    const set = seen.get(p.groupId) ?? new Set<string>();
    set.add(g);
    seen.set(p.groupId, set);
  });
  const out = new Map<string, GroupGender>();
  groups.forEach((group) => {
    const set = seen.get(group.id);
    if (set && set.size > 1) out.set(group.id, 'Mixed');
    else if (set && set.size === 1) out.set(group.id, [...set][0] as GroupGender);
    else {
      const g = normaliseGender(group.supportId ? supportsById.get(group.supportId)?.gender : null);
      if (g === 'Female' || g === 'Male') out.set(group.id, g);
    }
  });
  return out;
};

/** True when this person may join a group of this gender without an override. */
export const genderFits = (personGender: string | null | undefined, groupGender: GroupGender | undefined | null): boolean => {
  const g = normaliseGender(personGender);
  if (g !== 'Female' && g !== 'Male') return true;
  if (!groupGender || groupGender === 'Mixed') return true;
  return g === groupGender;
};

/** "Female · 25–34", "Male", "Age 35–44", or '' when neither is known. */
export const genderAgeLabel = (gender?: string | null, ageRange?: string | null): string => {
  const g = normaliseGender(gender);
  const a = normaliseAgeRange(ageRange)?.replace(/\s*-\s*/, '–') ?? null;
  if (g && a) return `${g} · ${a}`;
  if (g) return g;
  if (a) return `Age ${a}`;
  return '';
};

/** "Women", "Men", "Mixed". */
export const groupGenderLabel = (g: GroupGender | undefined | null): string =>
  g === 'Female' ? 'Women' : g === 'Male' ? 'Men' : g === 'Mixed' ? 'Mixed' : '';

/** A plain-words message for the database's group errors (rule 135), or the original message. */
export const groupMoveMessage = (raw: string): string => {
  if (raw.startsWith('GENDER_MISMATCH:')) {
    return `${raw.slice('GENDER_MISMATCH:'.length).trim()}. Use "Show all groups" if this is on purpose.`;
  }
  if (raw.startsWith('TEEN_GROUP_ONLY:')) return `${raw.slice('TEEN_GROUP_ONLY:'.length).trim()}.`;
  if (raw.startsWith('GENDER_OVERRIDE_ADMIN_ONLY:')) return 'Only an admin can put someone in a group of the other gender.';
  return raw;
};
