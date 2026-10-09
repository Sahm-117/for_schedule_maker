import { sharedGender, type DraftGroup, type EnginePerson, type EngineSupport } from './groupingEngine';
import { AGE_RANGE_OPTIONS } from '../constants/departments';

// The Draft step as plain text for a WhatsApp message: supports by gender, each with their participants.
//
//   Female supports:
//   *Support Name* (4 participants)
//   1. Participant Name, 25 - 34
//   2. ...
//
// With names off, a support's line is followed by one line of age ranges with counts instead of the people.
// Groups with no support are listed at the end, by the gender of their people. Phone numbers are never included.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const byName = (a: EnginePerson, b: EnginePerson) => a.name.localeCompare(b.name);

const ageCounts = (members: EnginePerson[]): string => {
  const counts = new Map<string, number>();
  members.forEach((m) => counts.set(m.ageRange ?? 'Age not set', (counts.get(m.ageRange ?? 'Age not set') ?? 0) + 1));
  const rank = (range: string) => { const i = AGE_RANGE_OPTIONS.indexOf(range); return i < 0 ? 99 : i; };
  return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([range, n]) => `${range} (${n})`).join(', ');
};

// Numbered, so a long list is easy to follow in a chat.
const personLines = (members: EnginePerson[], names: boolean): string[] =>
  names ? [...members].sort(byName).map((m, i) => `${i + 1}. ${m.name}, ${m.ageRange ?? 'age not set'}`) : [`Age ranges: ${ageCounts(members)}`];

// WhatsApp bolds text between asterisks.
const bold = (text: string) => `*${text.replace(/\*/g, '')}*`;

const groupGenderLabel = (members: EnginePerson[]): 'Male' | 'Female' | 'Mixed' => sharedGender(members) ?? 'Mixed';

export const buildWhatsAppText = (
  groups: DraftGroup[],
  people: Map<string, EnginePerson>,
  supports: Map<string, EngineSupport>,
  options: { names: boolean },
): string => {
  const real = groups.filter((g) => g.memberIds.length > 0);
  const membersOf = (g: DraftGroup) => g.memberIds.map((id) => people.get(id)).filter((m): m is EnginePerson => !!m);
  const size = (g: DraftGroup) => (g.topUp ? (g.existingMemberIds?.length ?? 0) : 0) + g.memberIds.length;

  const sections: string[] = [];
  const bySupport = new Map<string, DraftGroup[]>();
  real.filter((g) => g.supportId).forEach((g) => bySupport.set(g.supportId!, [...(bySupport.get(g.supportId!) ?? []), g]));

  (['Female', 'Male', null] as const).forEach((gender) => {
    const ids = [...bySupport.keys()].filter((id) => {
      const g = supports.get(id)?.gender ?? null;
      return gender === null ? g !== 'Male' && g !== 'Female' : g === gender;
    }).sort((a, b) => (supports.get(a)?.name ?? '').localeCompare(supports.get(b)?.name ?? ''));
    if (ids.length === 0) return;
    const lines: string[] = [gender === null ? 'Supports (gender not set):' : `${gender} supports:`];
    ids.forEach((id) => {
      const theirs = bySupport.get(id)!;
      const members = theirs.flatMap(membersOf);
      const total = theirs.reduce((n, g) => n + size(g), 0);
      // A running group being topped up lists only its new people, so say how many of the total they are.
      const added = theirs.reduce((n, g) => n + g.memberIds.length, 0);
      lines.push(`${bold(supports.get(id)?.name ?? 'Support')} (${plural(total, 'participant', 'participants')}${added !== total ? `, ${added} new` : ''})`);
      lines.push(...personLines(members, options.names));
    });
    sections.push(lines.join('\n'));
  });

  const without = real.filter((g) => !g.supportId && !g.topUp);
  if (without.length > 0) {
    const lines: string[] = ['Groups without a support:'];
    (['Female', 'Male', 'Mixed'] as const).forEach((label) => {
      without.filter((g) => groupGenderLabel(membersOf(g)) === label).forEach((g, i) => {
        lines.push(`${bold(`${label} group ${i + 1}`)} (${plural(g.memberIds.length, 'participant', 'participants')})`);
        lines.push(...personLines(membersOf(g), options.names));
      });
    });
    sections.push(lines.join('\n'));
  }
  return sections.join('\n\n');
};
