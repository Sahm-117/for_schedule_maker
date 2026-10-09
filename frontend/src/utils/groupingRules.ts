// How the group-building engine (utils/groupingEngine.ts) shapes a cohort's
// groups. Saved per cohort in AppSetting `grouping_rules_<cohortId>` and edited
// in the Groups → New group → "Build with engine" wizard; these are the defaults.
//
// Each rule is either a Must (never bent) or a Prefer (the engine may relax it,
// one step at a time, when the ideal combination runs out — and says so).

import { AGE_RANGE_OPTIONS, GENDER_OPTIONS } from '../constants/departments';

export type RuleStrength = 'MUST' | 'PREFER';
/** SAME = each group is one gender; MIXED = no gender rule; RATIO = aim for a share of women. */
export type GenderMix = 'SAME' | 'MIXED' | 'RATIO';
/** SIMILAR = keep close ages together; SPREAD = mix every age range across groups. */
export type AgeMix = 'SIMILAR' | 'SPREAD';
/** SAME_AS_GROUP = a one-gender group gets a support of that gender. */
export type SupportGender = 'SAME_AS_GROUP' | 'ANY';

/**
 * What a support tag does in this cohort's builder. A group made only of people
 * who fit (every ageRange / gender given) takes ONLY supports on the tag. The
 * order of the list is the priority when a group fits several tags.
 */
export interface TagRule {
  tagId: string;
  enabled: boolean;
  /** Empty = any age. */
  ageRanges: string[];
  /** 'Female' / 'Male' = only all-women / all-men groups; 'SAME' = any group that is all one gender; null = any gender (mixed groups too). */
  gender: 'Female' | 'Male' | 'SAME' | null;
  /** Group sizes for this tag's groups; null = the cohort's sizes. Set together (smallest <= aim <= largest). */
  minSize: number | null;
  targetSize: number | null;
  maxSize: number | null;
}

/** Group sizes for groups of one gender; null on a gender = the cohort's sizes. */
export interface GenderSizes {
  minSize: number;
  targetSize: number;
  maxSize: number;
}

export interface GroupingRules {
  minSize: number;
  targetSize: number;
  maxSize: number;
  sizeStrength: RuleStrength;
  /** Own sizes for all-male and all-female groups. */
  genderSizes: { Male: GenderSizes | null; Female: GenderSizes | null };
  genderMix: GenderMix;
  genderStrength: RuleStrength;
  /** RATIO only: the share of women each group aims for (±1 person). */
  femalePct: number;
  ageMix: AgeMix;
  ageStrength: RuleStrength;
  supportGender: SupportGender;
  supportGenderStrength: RuleStrength;
  /** Support age ranges, best first. The engine walks down this list. */
  supportAgeOrder: string[];
  /** The ranges that count as "middle age" — a support from these is ideal. */
  preferredSupportAges: string[];
  supportAgeStrength: RuleStrength;
  /** Supports an admin left out of the builder for this cohort (kept with the rules). */
  excludedSupportIds: string[];
  /** Support tag rules, highest priority first. */
  tagRules: TagRule[];
  /**
   * Groups made mostly of people in these age ranges prefer a support from the
   * same range (or the nearest), ahead of the supportAgeOrder list. Empty = always use the list.
   */
  ageMatchRanges: string[];
}

export const DEFAULT_GROUPING_RULES: GroupingRules = {
  minSize: 3,
  targetSize: 4,
  maxSize: 5,
  sizeStrength: 'PREFER',
  genderSizes: { Male: null, Female: null },
  genderMix: 'SAME',
  genderStrength: 'PREFER',
  femalePct: 50,
  ageMix: 'SIMILAR',
  ageStrength: 'PREFER',
  supportGender: 'SAME_AS_GROUP',
  supportGenderStrength: 'MUST',
  supportAgeOrder: ['25 - 34', '35 - 44', '18 - 24', '45 - 59', '60 and above', '10 - 17'],
  preferredSupportAges: ['25 - 34'],
  supportAgeStrength: 'PREFER',
  excludedSupportIds: [],
  tagRules: [],
  ageMatchRanges: [],
};

// ── Normalising saved answers ────────────────────────────────────────────────
// The same answer is stored several ways ("18-24" / "18 - 24", "FEMALE" /
// "Female", "Below 15" / "15-17" from an older form). The engine reads them
// through these; nothing saved is changed.

const squash = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** The teen age bucket. A teen is 10 to 17; 18 and over is an adult. */
export const TEEN_AGE_RANGE = '10 - 17';

export const normaliseAgeRange = (value?: string | null): string | null => {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const key = squash(raw);
  const direct = AGE_RANGE_OPTIONS.find((option) => squash(option) === key);
  if (direct) return direct;
  // The teen bucket (10 - 17). The registration form still says "18 and below" / "Below 18", and older forms said "15-17".
  if (/^(below|under)\d+$/.test(key) || key === '15-17' || key === '18andbelow' || key === '18orbelow' || key === '17andbelow' || key === '17orbelow' || key === '10-17') return TEEN_AGE_RANGE;
  if (key === '60+' || key.startsWith('60and') || key.startsWith('above60')) return '60 and above';
  // The adult bracket after the teens was "19 - 24" for a while; it starts at 18 again.
  if (key === '19-24' || key === '18-24') return '18 - 24';
  return null;
};

/** True for the teen bucket, however it was saved ("10 - 17", the form's "18 and below", "Below 15" ...). */
export const isTeenAgeRange = (value?: string | null): boolean => normaliseAgeRange(value) === TEEN_AGE_RANGE;

export const normaliseGender = (value?: string | null): string | null => {
  const key = squash(value ?? '');
  if (!key) return null;
  if (key === 'f' || key === 'female' || key === 'woman') return 'Female';
  if (key === 'm' || key === 'male' || key === 'man') return 'Male';
  return GENDER_OPTIONS.find((option) => squash(option) === key) ?? null;
};

/** Position of a range in the form's order (youngest first); -1 when unknown. */
export const ageIndex = (range: string | null) => (range ? AGE_RANGE_OPTIONS.indexOf(range) : -1);

// ── Loading saved rules ──────────────────────────────────────────────────────

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value as string) ? (value as T) : fallback;
const strength = (value: unknown, fallback: RuleStrength) => oneOf(value, ['MUST', 'PREFER'] as const, fallback);

/** The three sizes together or not at all, so a half-set override can't happen. */
const tagSizes = (row: Record<string, unknown>) => {
  const min = Math.round(Number(row.minSize));
  const target = Math.round(Number(row.targetSize));
  const max = Math.round(Number(row.maxSize));
  const ok = [min, target, max].every((n) => Number.isFinite(n) && n >= 1 && n <= 50) && min <= target && target <= max;
  return ok ? { minSize: min, targetSize: target, maxSize: max } : { minSize: null, targetSize: null, maxSize: null };
};

const normaliseTagRules = (value: unknown): TagRule[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: TagRule[] = [];
  for (const item of value) {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    if (typeof row.tagId !== 'string' || !row.tagId || seen.has(row.tagId)) continue;
    seen.add(row.tagId);
    out.push({
      tagId: row.tagId,
      enabled: row.enabled === true,
      ageRanges: Array.isArray(row.ageRanges) ? [...new Set(row.ageRanges.map((r) => (typeof r === 'string' ? normaliseAgeRange(r) : null)).filter((r): r is string => r !== null))] : [],
      gender: row.gender === 'Female' || row.gender === 'Male' || row.gender === 'SAME' ? row.gender : null,
      ...tagSizes(row),
    });
  }
  return out;
};

const normaliseGenderSize = (value: unknown): GenderSizes | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const min = Math.round(Number(row.minSize));
  const target = Math.round(Number(row.targetSize));
  const max = Math.round(Number(row.maxSize));
  const ok = [min, target, max].every((n) => Number.isFinite(n) && n >= 1 && n <= 50) && min <= target && target <= max;
  return ok ? { minSize: min, targetSize: target, maxSize: max } : null;
};

const normaliseGenderSizes = (value: unknown): GroupingRules['genderSizes'] => {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return { Male: normaliseGenderSize(row.Male), Female: normaliseGenderSize(row.Female) };
};

export const normaliseGroupingRules = (value: unknown): GroupingRules => {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_GROUPING_RULES;
  const minSize = clampInt(source.minSize, d.minSize, 1, 50);
  const maxSize = Math.max(minSize, clampInt(source.maxSize, d.maxSize, 1, 50));
  const targetSize = Math.min(maxSize, Math.max(minSize, clampInt(source.targetSize, d.targetSize, 1, 50)));

  const savedOrder = Array.isArray(source.supportAgeOrder)
    ? source.supportAgeOrder.map((r) => (typeof r === 'string' ? normaliseAgeRange(r) : null)).filter((r): r is string => r !== null)
    : [];
  // Every range appears exactly once: saved order first, any new ranges after.
  const supportAgeOrder = [...new Set([...savedOrder, ...d.supportAgeOrder, ...AGE_RANGE_OPTIONS])];
  const preferredSupportAges = Array.isArray(source.preferredSupportAges)
    ? source.preferredSupportAges.map((r) => (typeof r === 'string' ? normaliseAgeRange(r) : null)).filter((r): r is string => r !== null)
    : d.preferredSupportAges;

  return {
    minSize,
    targetSize,
    maxSize,
    sizeStrength: strength(source.sizeStrength, d.sizeStrength),
    genderSizes: normaliseGenderSizes(source.genderSizes),
    genderMix: oneOf(source.genderMix, ['SAME', 'MIXED', 'RATIO'] as const, d.genderMix),
    genderStrength: strength(source.genderStrength, d.genderStrength),
    femalePct: clampInt(source.femalePct, d.femalePct, 0, 100),
    ageMix: oneOf(source.ageMix, ['SIMILAR', 'SPREAD'] as const, d.ageMix),
    ageStrength: strength(source.ageStrength, d.ageStrength),
    supportGender: oneOf(source.supportGender, ['SAME_AS_GROUP', 'ANY'] as const, d.supportGender),
    supportGenderStrength: strength(source.supportGenderStrength, d.supportGenderStrength),
    supportAgeOrder,
    preferredSupportAges: preferredSupportAges.length > 0 ? preferredSupportAges : d.preferredSupportAges,
    supportAgeStrength: strength(source.supportAgeStrength, d.supportAgeStrength),
    excludedSupportIds: Array.isArray(source.excludedSupportIds)
      ? [...new Set(source.excludedSupportIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [],
    tagRules: normaliseTagRules(source.tagRules),
    ageMatchRanges: Array.isArray(source.ageMatchRanges)
      ? [...new Set(source.ageMatchRanges.map((r) => (typeof r === 'string' ? normaliseAgeRange(r) : null)).filter((r): r is string => r !== null))]
      : [],
  };
};
