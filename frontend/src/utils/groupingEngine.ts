// The group-building engine. Pure functions, no network: given a cohort's
// ungrouped participants, the supports free to take a group, and the cohort's
// GroupingRules (utils/groupingRules.ts), it drafts groups and picks a support
// for each. Nothing is saved here — the Groups wizard shows the draft, lets the
// admin adjust it, then creates the groups.
//
// Must rules are never bent. Prefer rules are relaxed one step at a time, in
// this order, only when the ideal combination runs out:
//   1. ages widened to the neighbouring range
//   2. group size one over/under
//   3. a support from the next age range in the order
//   4. a support of the other gender (mixed groups only)
// Every relaxation shows on the group as a note (evaluateGroup).

import { AGE_RANGE_OPTIONS } from '../constants/departments';
import { ageIndex, normaliseAgeRange, normaliseGender, type GroupingRules } from './groupingRules';

export interface EnginePerson {
  id: string;
  name: string;
  gender: string | null;
  ageRange: string | null;
}

export interface EngineSupport extends EnginePerson {
  /** Pre-cohort trainings attended — breaks ties between equal matches. */
  trainingsAttended: number;
}

export interface DraftGroup {
  key: string;
  name: string;
  memberIds: string[];
  supportId: string | null;
  /** An empty group the admin already made; the builder fills it instead of creating a new one. */
  existingGroupId?: string;
}

/** An existing empty group to fill first; `support` is the support already on it, if any. */
export interface SeedGroup {
  id: string;
  name: string;
  support: EngineSupport | null;
}

export interface GroupDraft {
  groups: DraftGroup[];
  /** Missing gender or age range — not grouped, nothing guessed. */
  needsInfo: string[];
  /** Couldn't be placed without breaking a Must rule. */
  unplaced: string[];
}

export type NoteTone = 'relaxed' | 'broken';
export interface GroupNote { tone: NoteTone; text: string }

export const toEnginePerson = (p: { id: string; name: string; gender?: string | null; ageRange?: string | null }): EnginePerson => ({
  id: p.id,
  name: p.name,
  gender: normaliseGender(p.gender),
  ageRange: normaliseAgeRange(p.ageRange),
});

// ── Sizing ───────────────────────────────────────────────────────────────────

/** Even group sizes for n people as k groups (largest first). */
const evenSizes = (n: number, k: number) =>
  Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));

/**
 * How many groups, and how big, for a pool of n people. Picks the count closest
 * to the aim size that keeps every group within smallest..largest; when no count
 * fits, the one that strays least (a Prefer size then shows as relaxed, a Must
 * size leaves the overflow unplaced).
 */
const planSizes = (n: number, rules: GroupingRules): { sizes: number[]; overflow: number } => {
  if (n <= 0) return { sizes: [], overflow: 0 };
  const { minSize, maxSize, targetSize } = rules;
  let best: { sizes: number[]; stray: number; aimGap: number } | null = null;
  for (let k = 1; k <= n; k++) {
    const sizes = evenSizes(n, k);
    const stray = sizes.reduce((sum, s) => sum + Math.max(0, minSize - s) + Math.max(0, s - maxSize), 0);
    const aimGap = Math.abs(n / k - targetSize);
    if (!best || stray < best.stray || (stray === best.stray && aimGap < best.aimGap)) best = { sizes, stray, aimGap };
  }
  const sizes = best!.sizes;
  if (best!.stray === 0 || rules.sizeStrength === 'PREFER') return { sizes, overflow: 0 };
  // Must size: place as many people as possible in groups that fit; anyone
  // left over is unplaced.
  let fit: { sizes: number[]; placed: number; aimGap: number } | null = null;
  for (let k = 1; k * minSize <= n; k++) {
    const placed = Math.min(n, k * maxSize);
    const aimGap = Math.abs(placed / k - targetSize);
    if (!fit || placed > fit.placed || (placed === fit.placed && aimGap < fit.aimGap)) fit = { sizes: evenSizes(placed, k), placed, aimGap };
  }
  return fit ? { sizes: fit.sizes, overflow: n - fit.placed } : { sizes: [], overflow: n };
};

// ── Filling groups ───────────────────────────────────────────────────────────

const byAge = (a: EnginePerson, b: EnginePerson) => ageIndex(a.ageRange) - ageIndex(b.ageRange) || a.name.localeCompare(b.name);

/**
 * Deal people (already age-sorted) into slots. `quota[g]` is how many of them
 * group g takes. SIMILAR fills group by group so close ages sit together;
 * SPREAD deals one each in a snake so every group gets a spread of ages.
 */
const deal = (people: EnginePerson[], quota: number[], mode: 'SIMILAR' | 'SPREAD'): string[][] => {
  const out = quota.map(() => [] as string[]);
  if (mode === 'SIMILAR') {
    let i = 0;
    quota.forEach((q, g) => { for (let j = 0; j < q && i < people.length; j++) out[g].push(people[i++].id); });
    return out;
  }
  const left = [...quota];
  let g = 0;
  let dir = 1;
  people.forEach((person) => {
    let guard = 0;
    while (left[g] === 0 && guard++ < quota.length * 2) {
      g += dir;
      if (g >= quota.length || g < 0) { dir = -dir; g += dir; }
    }
    out[g].push(person.id);
    left[g] -= 1;
    g += dir;
    if (g >= quota.length || g < 0) { dir = -dir; g += dir; }
  });
  return out;
};

/** Split `total` across groups in proportion to their sizes (largest remainder). */
const proportional = (total: number, sizes: number[]) => {
  const all = sizes.reduce((a, b) => a + b, 0) || 1;
  const raw = sizes.map((s) => (total * s) / all);
  const base = raw.map((r, i) => Math.min(sizes[i], Math.floor(r)));
  let rest = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (let pass = 0; rest > 0 && pass < 3; pass++) {
    for (const { i } of order) {
      if (rest === 0) break;
      if (base[i] < sizes[i]) { base[i] += 1; rest -= 1; }
    }
  }
  return base;
};

/** Build groups for one pool (a gender, an age range, or everyone). */
const groupPool = (pool: EnginePerson[], rules: GroupingRules, split: boolean) => {
  const { sizes, overflow } = planSizes(pool.length, rules);
  const sorted = [...pool].sort(byAge);
  // Must size can leave a few out: drop them from the end of the age order.
  const placedPeople = overflow > 0 ? sorted.slice(0, sorted.length - overflow) : sorted;
  const unplaced = overflow > 0 ? sorted.slice(sorted.length - overflow).map((p) => p.id) : [];
  if (sizes.length === 0) return { groups: [] as string[][], unplaced };

  if (rules.genderMix === 'RATIO' && !split) {
    const women = placedPeople.filter((p) => p.gender === 'Female');
    const men = placedPeople.filter((p) => p.gender !== 'Female');
    const womenQuota = proportional(women.length, sizes);
    const menQuota = sizes.map((s, i) => s - womenQuota[i]);
    const w = deal(women, womenQuota, rules.ageMix);
    const m = deal(men, menQuota, rules.ageMix);
    return { groups: sizes.map((_, i) => [...w[i], ...m[i]]), unplaced };
  }
  return { groups: deal(placedPeople, sizes, rules.ageMix), unplaced };
};

// ── Support matching ─────────────────────────────────────────────────────────

const groupGender = (members: EnginePerson[]): string | null => {
  const genders = new Set(members.map((m) => m.gender));
  return genders.size === 1 ? [...genders][0] : null;
};

/**
 * How well a support suits a group: [genderMiss, ageRank], lower is better, or
 * null when a Must rule rules them out. Gender outranks age, so the ladder uses
 * the next age range before it ever uses the other gender.
 */
export const supportCost = (support: EngineSupport, members: EnginePerson[], rules: GroupingRules): [number, number] | null => {
  const gender = groupGender(members);
  let genderMiss = 0;
  if (rules.supportGender === 'SAME_AS_GROUP' && gender) {
    if (support.gender !== gender) {
      if (rules.supportGenderStrength === 'MUST') return null;
      genderMiss = 1;
    }
  }
  const rank = support.ageRange ? rules.supportAgeOrder.indexOf(support.ageRange) : -1;
  const preferred = !!support.ageRange && rules.preferredSupportAges.includes(support.ageRange);
  if (rules.supportAgeStrength === 'MUST' && !preferred) return null;
  const ageRank = preferred ? 0 : rank >= 0 ? rank + 1 : rules.supportAgeOrder.length + 1;
  return [genderMiss, ageRank];
};

const compareCost = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];

const assignSupports = (allGroups: DraftGroup[], people: Map<string, EnginePerson>, supports: EngineSupport[], rules: GroupingRules) => {
  const free = new Set(supports.map((s) => s.id));
  // Groups that already have a support (an admin's empty group) keep it.
  const groups = allGroups.filter((g) => !g.supportId && g.memberIds.length > 0);
  const membersOf = (g: DraftGroup) => g.memberIds.map((id) => people.get(id)!).filter(Boolean);
  // Hardest groups first: the fewest ideal (zero-cost) supports.
  const idealCount = (g: DraftGroup) =>
    supports.filter((s) => { const c = supportCost(s, membersOf(g), rules); return c && c[0] === 0 && c[1] === 0; }).length;
  const order = [...groups].sort((a, b) => idealCount(a) - idealCount(b));
  order.forEach((g) => {
    let best: { s: EngineSupport; cost: [number, number] } | null = null;
    supports.forEach((s) => {
      if (!free.has(s.id)) return;
      const cost = supportCost(s, membersOf(g), rules);
      if (!cost) return;
      if (!best || compareCost(cost, best.cost) < 0 || (compareCost(cost, best.cost) === 0 && (s.trainingsAttended > best.s.trainingsAttended || (s.trainingsAttended === best.s.trainingsAttended && s.name.localeCompare(best.s.name) < 0)))) {
        best = { s, cost };
      }
    });
    if (best) {
      g.supportId = (best as { s: EngineSupport }).s.id;
      free.delete(g.supportId);
    }
  });
};

// ── Naming ───────────────────────────────────────────────────────────────────

/** "Group N" names, continuing after the highest number already used. */
export const nextGroupNames = (existingNames: string[], count: number) => {
  const used = existingNames
    .map((name) => /^group\s+(\d+)$/i.exec(name.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]));
  const start = used.length > 0 ? Math.max(...used) + 1 : 1;
  return Array.from({ length: count }, (_, i) => `Group ${start + i}`);
};

// ── The draft ────────────────────────────────────────────────────────────────

export const buildDraft = (
  participants: EnginePerson[],
  supports: EngineSupport[],
  rules: GroupingRules,
  existingGroupNames: string[],
  seeds: SeedGroup[] = [],
): GroupDraft => {
  const needsInfo = participants.filter((p) => !p.gender || !p.ageRange).map((p) => p.id);
  const ready = participants.filter((p) => p.gender && p.ageRange);
  const people = new Map(ready.map((p) => [p.id, p]));

  // Split into pools: by gender when groups are one gender, then by age range
  // when similar ages are a Must (a group never crosses a range).
  let pools: EnginePerson[][] = [ready];
  const splitGender = rules.genderMix === 'SAME';
  if (splitGender) pools = ['Female', 'Male'].map((g) => ready.filter((p) => p.gender === g));
  if (rules.ageMix === 'SIMILAR' && rules.ageStrength === 'MUST') {
    pools = pools.flatMap((pool) => AGE_RANGE_OPTIONS.map((range) => pool.filter((p) => p.ageRange === range)));
  }
  pools = pools.filter((pool) => pool.length > 0);

  // A one-gender pool too small for a group: if gender is only a preference,
  // fold it into the other gender's pool (shows as "Mixed genders") rather than
  // leaving a tiny group; with a Must size it would otherwise be unplaced.
  if (splitGender && rules.genderStrength === 'PREFER' && pools.length > 1) {
    const small = pools.filter((pool) => pool.length < rules.minSize);
    if (small.length > 0 && small.length < pools.length) {
      const big = pools.filter((pool) => pool.length >= rules.minSize).sort((a, b) => b.length - a.length);
      big[0] = [...big[0], ...small.flat()];
      pools = big;
    }
  }

  const memberLists: string[][] = [];
  const unplaced: string[] = [];
  pools.forEach((pool) => {
    const result = groupPool(pool, rules, splitGender);
    memberLists.push(...result.groups.filter((g) => g.length > 0));
    unplaced.push(...result.unplaced);
  });

  // Fill the admin's empty groups first. One with a support takes the set of
  // people that suits that support best (never one that breaks a Must rule);
  // the rest take the remaining sets, largest first. Leftover sets become new groups.
  const remaining = [...memberLists].sort((a, b) => b.length - a.length);
  const seeded: DraftGroup[] = [];
  const takeBest = (support: EngineSupport) => {
    let bestIndex = -1;
    let bestCost: [number, number] | null = null;
    remaining.forEach((ids, i) => {
      const cost = supportCost(support, ids.map((id) => people.get(id)!).filter(Boolean), rules);
      if (cost && (!bestCost || compareCost(cost, bestCost) < 0)) { bestIndex = i; bestCost = cost; }
    });
    return bestIndex >= 0 ? remaining.splice(bestIndex, 1)[0] : [];
  };
  seeds.filter((seed) => seed.support).forEach((seed) => {
    seeded.push({ key: `seed-${seed.id}`, name: seed.name, memberIds: takeBest(seed.support!), supportId: seed.support!.id, existingGroupId: seed.id });
  });
  seeds.filter((seed) => !seed.support).forEach((seed) => {
    seeded.push({ key: `seed-${seed.id}`, name: seed.name, memberIds: remaining.shift() ?? [], supportId: null, existingGroupId: seed.id });
  });

  const names = nextGroupNames(existingGroupNames, remaining.length);
  const groups: DraftGroup[] = [
    ...seeded,
    ...remaining.map((memberIds, i) => ({ key: `draft-${i + 1}`, name: names[i], memberIds, supportId: null })),
  ];
  assignSupports(groups, people, supports, rules);
  return { groups, needsInfo, unplaced };
};

// ── Notes: what a group bends ────────────────────────────────────────────────
// Recomputed on every edit in the wizard, so moving a person or changing a
// support refreshes the pills. "broken" = a Must rule no longer holds.

const shortAge = (range: string) => range.replace(/\s/g, '');

export const evaluateGroup = (
  group: DraftGroup,
  people: Map<string, EnginePerson>,
  supports: Map<string, EngineSupport>,
  rules: GroupingRules,
): GroupNote[] => {
  const notes: GroupNote[] = [];
  const members = group.memberIds.map((id) => people.get(id)).filter((p): p is EnginePerson => !!p);
  const n = members.length;
  const toneFor = (s: 'MUST' | 'PREFER'): NoteTone => (s === 'MUST' ? 'broken' : 'relaxed');

  if (n < rules.minSize) notes.push({ tone: toneFor(rules.sizeStrength), text: `Only ${n} ${n === 1 ? 'person' : 'people'}` });
  if (n > rules.maxSize) notes.push({ tone: toneFor(rules.sizeStrength), text: `${n} people (over ${rules.maxSize})` });

  const women = members.filter((m) => m.gender === 'Female').length;
  if (rules.genderMix === 'SAME' && women > 0 && women < n) {
    notes.push({ tone: toneFor(rules.genderStrength), text: 'Mixed genders' });
  }
  if (rules.genderMix === 'RATIO' && n > 0) {
    const aim = Math.round((n * rules.femalePct) / 100);
    if (Math.abs(women - aim) > 1) notes.push({ tone: toneFor(rules.genderStrength), text: `${women} women, ${n - women} men` });
  }

  const ranges = [...new Set(members.map((m) => m.ageRange).filter((r): r is string => !!r))].sort((a, b) => ageIndex(a) - ageIndex(b));
  if (rules.ageMix === 'SIMILAR' && ranges.length > 1) {
    const span = ageIndex(ranges[ranges.length - 1]) - ageIndex(ranges[0]);
    notes.push({
      tone: toneFor(rules.ageStrength),
      text: span === 1 ? `Ages widened: ${shortAge(ranges[0])} + ${shortAge(ranges[1])}` : `Ages ${shortAge(ranges[0])} to ${shortAge(ranges[ranges.length - 1])}`,
    });
  }

  const support = group.supportId ? supports.get(group.supportId) : undefined;
  if (!group.supportId) {
    notes.push({ tone: 'broken', text: 'No suitable support' });
  } else if (support) {
    if (!support.gender || !support.ageRange) notes.push({ tone: 'relaxed', text: "Support's gender/age not on file" });
    const gender = groupGender(members);
    if (rules.supportGender === 'SAME_AS_GROUP' && gender && support.gender && support.gender !== gender) {
      notes.push({ tone: toneFor(rules.supportGenderStrength), text: 'Support is a different gender' });
    }
    if (support.ageRange && !rules.preferredSupportAges.includes(support.ageRange)) {
      notes.push({ tone: toneFor(rules.supportAgeStrength), text: `Support aged ${shortAge(support.ageRange)}` });
    }
  }
  return notes;
};
