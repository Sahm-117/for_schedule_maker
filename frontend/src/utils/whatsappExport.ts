import type { Group, Participant, User } from '../types';
import { supportProfileChecklist } from './people';

// Phone display matches the existing ExportContactsPopup convention: keep a
// leading 0 / + as-is, otherwise prefix a 0 so the number is dialable.
export const normalizePhone = (p?: string | null): string => {
  if (!p) return '';
  return p.startsWith('0') || p.startsWith('+') ? p : `0${p}`;
};

// "(Gender | Age range)" — only the parts that exist; nothing if neither does.
const formatMeta = (p: Participant): string => {
  const parts = [p.gender, p.ageRange].filter((v): v is string => !!v && v.trim().length > 0);
  return parts.length ? ` (${parts.join(' | ')})` : '';
};

// e.g. "1. Test User - 08012345678 (Female | 25-34)"
export const formatMemberLine = (index: number, p: Participant): string => {
  const phone = normalizePhone(p.phone);
  return `${index}. ${p.fullName}${phone ? ` - ${phone}` : ''}${formatMeta(p)}`;
};

// A single group's WhatsApp block. Members numbered from 1 within the group.
//   *Group 1 (Bukola Ayodele)*
//   1. Abigail Olushile - 07086186149 (Female | 25-34)
//   2. Dorcas Dangana - 08127533226
export const buildGroupBlock = (group: Group, members: Participant[]): string => {
  const header = group.supportName ? `*${group.name} (${group.supportName})*` : `*${group.name}*`;
  if (members.length === 0) return `${header}\n_No members yet_`;
  const lines = members.map((p, i) => formatMemberLine(i + 1, p));
  return [header, ...lines].join('\n');
};

const pluralize = (n: number, singular: string, plural = `${singular}s`): string =>
  `${n} ${n === 1 ? singular : plural}`;

// Groups-export header, e.g.
//   *Cohort 9 Groups & Supports*
//   29 groups · 92 participants · 4 groups without support · 1 unassigned participant
// The "without support" / "unassigned participant" parts only appear when > 0.
export const buildGroupsHeader = (
  cohortName: string,
  groups: Group[],
  membersByGroupId: Map<string, Participant[]>,
  unassignedParticipants: number,
): string => {
  const participantCount = groups.reduce((sum, g) => sum + (membersByGroupId.get(g.id)?.length ?? 0), 0);
  const groupsWithoutSupport = groups.filter((g) => !g.supportId).length;
  const parts = [pluralize(groups.length, 'group'), pluralize(participantCount, 'participant')];
  if (groupsWithoutSupport > 0) parts.push(`${groupsWithoutSupport} groups without support`);
  if (unassignedParticipants > 0) parts.push(pluralize(unassignedParticipants, 'unassigned participant'));
  return `*${cohortName} Groups & Supports*\n${parts.join(' · ')}`;
};

// All groups, one block each, separated by a blank line. A header line is
// prepended when a cohort name is supplied (the "Copy all" path).
export const buildAllGroupsText = (
  groups: Group[],
  membersByGroupId: Map<string, Participant[]>,
  header?: string,
): string => {
  const body = groups.map((g) => buildGroupBlock(g, membersByGroupId.get(g.id) ?? [])).join('\n\n');
  return header ? `${header}\n\n${body}` : body;
};

// Participants-export header, e.g.
//   *Cohort 9 Participants*
//   Total: 92 | Unassigned to group: 1
export const buildParticipantsHeader = (cohortName: string, participants: Participant[]): string => {
  const unassigned = participants.filter((p) => !p.groupId).length;
  return `*${cohortName} Participants*\nTotal: ${participants.length} | Unassigned to group: ${unassigned}`;
};

// Flat list of every participant with continuous numbering (no group headers).
// A header line is prepended when a cohort name is supplied.
//   1. Test User - 08012345678 (Female | 25-34)
//   2. Another Person - 09000000000
export const buildAllParticipantsList = (participants: Participant[], header?: string): string => {
  const body = participants.map((p, i) => formatMemberLine(i + 1, p)).join('\n');
  return header ? `${header}\n\n${body}` : body;
};

// Supports export (Supports page), e.g.
//   *Cohort 10 Supports*
//   Incomplete profile · Hub lead
//   Total: 2
//
//   1. Bukola Ayodele - 08031234567 (missing: Photo, Age range)
// With showMissing, each line lists what's missing and a how-to footer is added.
export const buildSupportsText = (title: string, subtitle: string, supports: User[], showMissing: boolean): string => {
  const header = [`*${title}*`, subtitle, `Total: ${supports.length}`].filter(Boolean).join('\n');
  const lines = supports.map((u, i) => {
    const phone = normalizePhone(u.phone);
    const missing = showMissing ? supportProfileChecklist(u).filter((item) => !item.done).map((item) => item.label) : [];
    return `${i + 1}. ${u.name}${phone ? ` - ${phone}` : ''}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`;
  });
  const footer = showMissing
    ? ['', 'Please complete your profile today: open the FOF app, go to *Profile* and fill in what is missing. We match new sign-ups to supports by gender and age.', 'https://fof.tcnikorodu.org']
    : [];
  return [header, '', ...lines, ...footer].join('\n');
};

// ── Supports list ────────────────────────────────────────────────────────────
// For an admin to paste into WhatsApp: each support's name and number, with a
// * after anyone who is missing alerts (no notification saved on any device,
// which on an iPhone also means the app isn't on the Home Screen).
//
//   *Supports (34)*
//   * = notifications are off, or the app isn't on their Home Screen
//
//   1. Ada Obi - 08012345678
//   2. Bola Ade - 08023456789 *
export const buildSupportsList = (supports: User[], missingAlertsIds: Set<string>): string => {
  const missing = supports.filter((s) => missingAlertsIds.has(s.id)).length;
  const header = [
    `*Supports (${supports.length})*`,
    missing > 0
      ? `* = notifications are off, or the app isn't on their Home Screen (${missing})`
      : 'Everyone has notifications on.',
  ].join('\n');
  const lines = supports.map((s, i) => {
    const phone = normalizePhone(s.phone);
    return `${i + 1}. ${s.name}${phone ? ` - ${phone}` : ' - no number'}${missingAlertsIds.has(s.id) ? ' *' : ''}`;
  });
  return `${header}\n\n${lines.join('\n')}`;
};
