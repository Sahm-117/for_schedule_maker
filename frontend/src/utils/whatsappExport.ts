import type { FollowUpContact, Group, Participant, User } from '../types';
import { supportProfileChecklist } from './people';
import { computeFollowUpStatus, contactReachPhone, FOLLOW_UP_STATUS_META } from './followUps';

/** Where a contact stands, in the words used on Follow-ups (Registered, No response, ...). */
export const contactStatusLabel = (c: FollowUpContact): string => FOLLOW_UP_STATUS_META[computeFollowUpStatus(c)].label;

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
  filters: string[] = [],
): string => {
  const participantCount = groups.reduce((sum, g) => sum + (membersByGroupId.get(g.id)?.length ?? 0), 0);
  const groupsWithoutSupport = groups.filter((g) => !g.supportId).length;
  const parts = [pluralize(groups.length, 'group'), pluralize(participantCount, 'participant')];
  if (groupsWithoutSupport > 0) parts.push(`${groupsWithoutSupport} groups without support`);
  if (unassignedParticipants > 0) parts.push(pluralize(unassignedParticipants, 'unassigned participant'));
  return [`*${cohortName} Groups & Supports*`, filters.length ? `Filter: ${filters.join(' · ')}` : '', parts.join(' · ')].filter(Boolean).join('\n');
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
    ? ['', 'Please complete your profile today: open the FOF app, go to *Profile* and fill in what is missing. We match newly registered people to supports by gender and age.', 'https://fof.tcnikorodu.org']
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

// Follow-up contacts, exactly as filtered on screen, e.g.
//   *FOF Cohort 10 Follow-ups*
//   Filter: Registered · Female
//   Total: 2
//
//   1. Ada Obi - 08012345678 (Registered)
//   2. Bola Ade - 08023456789 (No response)
// A teen shows the number we reach them on (a parent's first). The status is how they stand now,
// so a list can be read (or trimmed in WhatsApp) without opening the app.
export const formatContactLine = (index: number, c: FollowUpContact): string => {
  const phone = normalizePhone(contactReachPhone(c));
  return `${index}. ${c.fullName} - ${phone || 'no number'} (${contactStatusLabel(c)})`;
};

export const buildContactsList = (title: string, filters: string[], contacts: FollowUpContact[]): string => {
  const header = [`*${title}*`, filters.length ? `Filter: ${filters.join(' · ')}` : '', `Total: ${contacts.length}`].filter(Boolean).join('\n');
  return `${header}\n\n${contacts.map((c, i) => formatContactLine(i + 1, c)).join('\n')}`;
};

// Contacts grouped by the support who holds them, for following up with supports, e.g.
//   *Cohort 10 Follow-ups*
//   Filter: Registered
//   Total: 18
//
//   *Aderounmu Dayo* - 08012345678
//   1. Olufimihan Onatola
//   2. Eniola Oyatogun
// A participant's number is added only when asked for (a teen shows a parent's number).
export interface SupportRef { name: string; phone?: string | null }

export const supportOfContact = (c: FollowUpContact, supportById: Map<string, SupportRef>): SupportRef | null =>
  c.ownerId ? supportById.get(c.ownerId) ?? { name: c.ownerName || 'Support', phone: null } : null;

export const formatContactForSupportCopy = (c: FollowUpContact, supportById: Map<string, SupportRef>, includeNumbers: boolean): string => {
  const support = supportOfContact(c, supportById);
  const own = includeNumbers ? ` - ${normalizePhone(contactReachPhone(c)) || 'no number'}` : '';
  const who = support ? `${support.name}${support.phone ? ` ${normalizePhone(support.phone)}` : ' (no number)'}` : 'No support yet';
  return `${c.fullName}${own} (${contactStatusLabel(c)}) | Support: ${who}`;
};

export const buildContactsBySupport = (
  title: string,
  filters: string[],
  contacts: FollowUpContact[],
  supportById: Map<string, SupportRef>,
  includeNumbers: boolean,
): string => {
  const groups = new Map<string, { label: string; phone: string; items: FollowUpContact[] }>();
  contacts.forEach((c) => {
    const support = supportOfContact(c, supportById);
    const key = c.ownerId ?? '__none';
    const group = groups.get(key) ?? { label: support?.name ?? 'No support yet', phone: normalizePhone(support?.phone), items: [] };
    group.items.push(c);
    groups.set(key, group);
  });
  const ordered = Array.from(groups.entries()).sort(([ka, a], [kb, b]) => (ka === '__none' ? 1 : 0) - (kb === '__none' ? 1 : 0) || a.label.localeCompare(b.label));
  const header = [`*${title}*`, filters.length ? `Filter: ${filters.join(' · ')}` : '', `Total: ${contacts.length}`].filter(Boolean).join('\n');
  const blocks = ordered.map(([key, g]) => {
    const head = key === '__none' ? `*${g.label}*` : `*${g.label}*${g.phone ? ` - ${g.phone}` : ' - no number'}`;
    const lines = g.items.map((c, i) => `${i + 1}. ${c.fullName}${includeNumbers ? ` - ${normalizePhone(contactReachPhone(c)) || 'no number'}` : ''} (${contactStatusLabel(c)})`);
    return [head, ...lines].join('\n');
  });
  return `${header}\n\n${blocks.join('\n\n')}`;
};
