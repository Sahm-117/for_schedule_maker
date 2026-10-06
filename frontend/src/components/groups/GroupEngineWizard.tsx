import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import AppSelect from '../AppSelect';
import Avatar from '../Avatar';
import InfoTip from '../InfoTip';
import Spinner from '../Spinner';
import SupportTagsModal from '../supports/SupportTagsModal';
import { useAuth } from '../../hooks/useAuth';
import { cohortsApi, groupsApi, settingsApi, supportKindApi, supportTagsApi } from '../../services/api';
import type { Group, Participant, SupportKind, SupportTag, User } from '../../types';
import { AGE_RANGE_OPTIONS } from '../../constants/departments';
import { trainingCountFor } from '../../utils/programmeRules';
import { DEFAULT_GROUPING_RULES, type GroupingRules, type RuleStrength, type TagRule } from '../../utils/groupingRules';
import {
  buildDraft,
  evaluateGroup,
  groupTagRule,
  unusedSupportHint,
  toEnginePerson,
  type DraftGroup,
  type SeedGroup,
  type EnginePerson,
  type EngineSupport,
  type SavedGroupingDraft,
} from '../../utils/groupingEngine';

// Groups → New group → "Build with engine". Four steps: check who's ready,
// set this cohort's rules, review/adjust the draft, then create. Nothing is
// written until step 4 (except saving the rules in step 2).

interface GroupEngineWizardProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after groups were created, so the page reloads. */
  onCreated: () => void;
  cohortId: string;
  cohortName: string;
  /** The cohort's ACTIVE participants (grouped or not). */
  participants: Participant[];
  /** The cohort's current (non-archived) groups. */
  groups: Group[];
  supportUsers: User[];
  trainingCounts: Map<string, { attended: number; total: number }>;
  trainingsTotal: number;
  minTrainingsAttended: number;
}

type Step = 'people' | 'rules' | 'draft' | 'create';
const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'people', label: 'People' },
  { key: 'rules', label: 'Rules' },
  { key: 'draft', label: 'Draft' },
  { key: 'create', label: 'Create' },
];

const SURFACE = 'rounded-[22px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-14px_rgba(17,24,39,0.18)]';
const SECTION_LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400';
const LEFT_OUT = '__left_out__';
const LEFT_OUT_BY_YOU = 'Left out by you';

const shortAge = (range: string | null) => (range ? range.replace(/\s/g, '') : '—');

// ── Small controls ───────────────────────────────────────────────────────────

const Segmented: React.FC<{ value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }> = ({ value, options, onChange }) => (
  <div className="grid gap-1 rounded-2xl bg-gray-100/80 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`truncate rounded-xl px-2 py-2 text-[12.5px] font-semibold transition ${value === o.value ? 'bg-white text-gray-900 shadow-[0_1px_3px_rgba(17,24,39,0.12)]' : 'text-gray-500 hover:text-gray-700'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const StrengthToggle: React.FC<{ value: RuleStrength; onChange: (v: RuleStrength) => void }> = ({ value, onChange }) => (
  <div className="inline-flex rounded-full bg-gray-100/80 p-0.5 text-[11px] font-semibold">
    {(['MUST', 'PREFER'] as const).map((s) => (
      <button
        key={s}
        type="button"
        onClick={() => onChange(s)}
        className={`rounded-full px-2.5 py-1 transition ${value === s ? (s === 'MUST' ? 'bg-violet-100/80 text-violet-700' : 'bg-sky-100/80 text-sky-700') : 'text-gray-500'}`}
      >
        {s === 'MUST' ? 'Must' : 'Prefer'}
      </button>
    ))}
  </div>
);

const Stepper: React.FC<{ label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string; step?: number }> = ({ label, value, min, max, onChange, suffix, step = 1 }) => (
  <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-gray-50 px-2 py-2.5">
    <span className="text-[11px] font-medium text-gray-500">{label}</span>
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, value - step))} className="h-7 w-7 rounded-full bg-white text-base font-semibold text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)] active:scale-95">−</button>
      <span className="min-w-[2.2ch] text-center text-base font-bold text-gray-900">{value}{suffix}</span>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + step))} className="h-7 w-7 rounded-full bg-white text-base font-semibold text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)] active:scale-95">+</button>
    </div>
  </div>
);

const RuleCard: React.FC<{ title: string; hint: string; strength?: RuleStrength; onStrength?: (v: RuleStrength) => void; children: React.ReactNode }> = ({ title, hint, strength, onStrength, children }) => (
  <div className={`${SURFACE} p-4`}>
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
      </div>
      {strength && onStrength && <StrengthToggle value={strength} onChange={onStrength} />}
    </div>
    {children}
  </div>
);

const StatTile: React.FC<{ value: number; label: string; tone?: 'amber' | 'neutral' }> = ({ value, label, tone = 'neutral' }) => (
  <div className={`${SURFACE} px-4 py-3`}>
    <p className={`text-2xl font-bold ${tone === 'amber' && value > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
    <p className="text-xs text-gray-500">{label}</p>
  </div>
);

// ── Wizard ───────────────────────────────────────────────────────────────────

type CreateStatus = 'waiting' | 'creating' | 'done' | 'failed';

const GroupEngineWizard: React.FC<GroupEngineWizardProps> = ({
  isOpen, onClose, onCreated, cohortId, cohortName, participants, groups, supportUsers, trainingCounts, trainingsTotal, minTrainingsAttended,
}) => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [step, setStep] = useState<Step>('people');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [kinds, setKinds] = useState<Record<string, SupportKind>>({});
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [rules, setRules] = useState<GroupingRules>(DEFAULT_GROUPING_RULES);
  const [savingRules, setSavingRules] = useState(false);
  const [draft, setDraft] = useState<DraftGroup[]>([]);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, CreateStatus>>({});
  const [creating, setCreating] = useState(false);
  // Off each time the builder opens, so nobody who missed training is used by accident.
  const [includeMissedTraining, setIncludeMissedTraining] = useState(false);
  // Empty groups the admin made first: fill them, or leave them alone. Asked each time.
  const [emptyChoice, setEmptyChoice] = useState<'fill' | 'leave' | null>(null);
  const createdAny = useRef(false);
  // Support tags, and the age ranges left out of THIS build only (never saved).
  const [tags, setTags] = useState<SupportTag[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagEditFor, setTagEditFor] = useState<string | null>(null);
  const [tagSaving, setTagSaving] = useState<string | null>(null);
  const [ignoredAges, setIgnoredAges] = useState<Set<string>>(new Set());
  const [draftInfo, setDraftInfo] = useState<{ ignored: number; tagNotes: string[] }>({ ignored: 0, tagNotes: [] });
  // A build saved part-way earlier (one per cohort), and the note after continuing it.
  const [saved, setSaved] = useState<SavedGroupingDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftNote, setDraftNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStep('people');
    setErr('');
    setDraft([]);
    setLeftOut([]);
    setPicked(null);
    setStatuses({});
    setIncludeMissedTraining(false);
    setEmptyChoice(null);
    setIgnoredAges(new Set());
    setTagEditFor(null);
    setDraftInfo({ ignored: 0, tagNotes: [] });
    setSaved(null);
    setDraftNote('');
    createdAny.current = false;
    setLoading(true);
    Promise.all([
      supportKindApi.getForCohort(cohortId).then((r) => r.kinds).catch(() => ({} as Record<string, SupportKind>)),
      cohortsApi.getMembers(cohortId).then((r) => new Set(r.users.map((u) => u.id))).catch(() => new Set<string>()),
      settingsApi.getGroupingRules(cohortId).catch(() => DEFAULT_GROUPING_RULES),
      supportTagsApi.getAll().then((r) => r.tags).catch(() => [] as SupportTag[]),
      settingsApi.getGroupingDraft(cohortId).catch(() => null),
    ])
      .then(([k, m, r, t, d]) => { setKinds(k); setMemberIds(m); setRules(r); setTags(t); setSaved(d); })
      .catch(() => setErr('Could not load everything. Please retry.'))
      .finally(() => setLoading(false));
  }, [isOpen, cohortId]);

  // ── Who can be grouped, and which supports are free ──
  const ungrouped = useMemo(() => participants.filter((p) => !p.groupId), [participants]);
  const people = useMemo(
    () => new Map<string, EnginePerson>(ungrouped.map((p) => [p.id, toEnginePerson({ id: p.id, name: p.fullName, gender: p.gender, ageRange: p.ageRange })])),
    [ungrouped]
  );
  const participantById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  const reloadTags = () => supportTagsApi.getAll().then((r) => setTags(r.tags)).catch(() => {});
  const tagIdsByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    tags.forEach((t) => t.userIds.forEach((id) => map.set(id, [...(map.get(id) ?? []), t.id])));
    return map;
  }, [tags]);
  const tagNames = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t.name])), [tags]);
  // Rules for tags that still exist (a deleted tag's rule is ignored).
  const effectiveRules = useMemo<GroupingRules>(() => ({ ...rules, tagRules: rules.tagRules.filter((r) => tagNames[r.tagId]) }), [rules, tagNames]);
  // The tag a whole group is for (so it's obvious which tag fits which group), or null.
  const groupTagName = (memberIds: string[]) => {
    const rule = groupTagRule(memberIds.map((id) => people.get(id)).filter((p): p is EnginePerson => !!p), effectiveRules);
    return rule ? tagNames[rule.tagId] ?? null : null;
  };
  // Tags in priority order: saved rules first, then any tag without a rule yet.
  const orderedTags = useMemo(() => {
    const known = rules.tagRules.map((r) => tags.find((t) => t.id === r.tagId)).filter((t): t is SupportTag => !!t);
    return [...known, ...tags.filter((t) => !known.some((k) => k.id === t.id))];
  }, [rules.tagRules, tags]);

  const supportPool = useMemo(() => {
    const leading = new Set(groups.filter((g) => !g.archivedAt && g.supportId).map((g) => g.supportId as string));
    const free: EngineSupport[] = [];
    const reasons: Array<{ user: User; reason: string }> = [];
    const missedTraining = new Set<string>();
    supportUsers.forEach((u) => {
      if (u.isActive === false || !memberIds.has(u.id)) return; // not in this cohort
      const kind = kinds[u.id] ?? 'PARTICIPANT_SUPPORT';
      const c = trainingCountFor(trainingCounts, u.id, trainingsTotal);
      if (kind !== 'PARTICIPANT_SUPPORT') { reasons.push({ user: u, reason: kind === 'HUB_LEAD' ? 'Hub lead' : 'Operational' }); return; }
      if (leading.has(u.id)) { reasons.push({ user: u, reason: 'Already has a group' }); return; }
      if (rules.excludedSupportIds.includes(u.id)) { reasons.push({ user: u, reason: LEFT_OUT_BY_YOU }); return; }
      if (c.total > 0 && c.attended < minTrainingsAttended) {
        missedTraining.add(u.id);
        if (!includeMissedTraining) { reasons.push({ user: u, reason: `Trainings ${c.attended}/${c.total}` }); return; }
      }
      free.push({ ...toEnginePerson(u), trainingsAttended: c.attended, tagIds: tagIdsByUser.get(u.id) ?? [] });
    });
    return { free, reasons, missedTraining };
  }, [supportUsers, memberIds, kinds, groups, trainingCounts, trainingsTotal, minTrainingsAttended, includeMissedTraining, rules.excludedSupportIds, tagIdsByUser]);

  // Groups with nobody in them yet (made by hand first), and the support already on each.
  const emptyGroups = useMemo(() => {
    const withPeople = new Set(participants.map((p) => p.groupId).filter(Boolean) as string[]);
    return groups.filter((g) => !g.archivedAt && !withPeople.has(g.id));
  }, [groups, participants]);
  const seeds = useMemo<SeedGroup[]>(() => emptyGroups.map((g) => {
    const u = g.supportId ? supportUsers.find((x) => x.id === g.supportId) : null;
    return {
      id: g.id,
      name: g.name,
      support: u ? { ...toEnginePerson(u), trainingsAttended: trainingCountFor(trainingCounts, u.id, trainingsTotal).attended, tagIds: tagIdsByUser.get(u.id) ?? [] } : null,
    };
  }), [emptyGroups, supportUsers, trainingCounts, trainingsTotal, tagIdsByUser]);
  const seedSupports = useMemo(() => seeds.map((s) => s.support).filter((s): s is EngineSupport => !!s), [seeds]);
  const supportById = useMemo(() => new Map([...supportPool.free, ...seedSupports].map((s) => [s.id, s])), [supportPool.free, seedSupports]);

  // Leave a support out of the builder (or bring them back). Saved with the cohort's rules.
  const [excludeSaving, setExcludeSaving] = useState<string | null>(null);
  const toggleExcluded = async (userId: string) => {
    const next = {
      ...rules,
      excludedSupportIds: rules.excludedSupportIds.includes(userId)
        ? rules.excludedSupportIds.filter((id) => id !== userId)
        : [...rules.excludedSupportIds, userId],
    };
    setRules(next);
    setExcludeSaving(userId);
    try {
      setRules(await settingsApi.setGroupingRules(cohortId, next));
    } catch (e: any) {
      setErr(e?.message ? `Couldn't save: ${e.message}` : "Couldn't save. Try again.");
    } finally {
      setExcludeSaving(null);
    }
  };

  const readyCount = [...people.values()].filter((p) => p.gender && p.ageRange && !ignoredAges.has(p.ageRange)).length;
  const needsInfo = ungrouped.filter((p) => { const e = people.get(p.id); return !e?.gender || !e?.ageRange; });
  const supportsMissingDetails = supportPool.free.filter((s) => !s.gender || !s.ageRange).length;
  const ageCounts = AGE_RANGE_OPTIONS.map((range) => ({ range, count: [...people.values()].filter((p) => p.ageRange === range).length }));
  const women = [...people.values()].filter((p) => p.gender === 'Female').length;
  const men = [...people.values()].filter((p) => p.gender === 'Male').length;

  const rebuild = (r: GroupingRules = rules) => {
    const result = buildDraft(
      [...people.values()], supportPool.free, { ...r, tagRules: r.tagRules.filter((t) => tagNames[t.tagId]) }, groups.map((g) => g.name), emptyChoice === 'fill' ? seeds : [],
      { ignoredAgeRanges: [...ignoredAges], tagNames },
    );
    setDraftInfo({ ignored: result.ignored.length, tagNotes: result.tagNotes });
    setDraft(result.groups);
    setLeftOut([...result.needsInfo, ...result.unplaced]);
    setPicked(null);
  };

  const saveRulesAndBuild = async () => {
    setSavingRules(true);
    setErr('');
    try {
      const saved = await settingsApi.setGroupingRules(cohortId, rules);
      setRules(saved);
      rebuild(saved);
    } catch (e: any) {
      // Still show a draft — the rules just weren't kept for next time.
      setErr(e?.message ? `Rules not saved: ${e.message}` : 'Rules not saved.');
      rebuild(rules);
    } finally {
      setSavingRules(false);
      setStep('draft');
    }
  };

  // ── Draft edits ──
  const moveTo = (targetKey: string) => {
    if (!picked) return;
    setDraft((prev) => prev.map((g) => {
      const without = g.memberIds.filter((id) => id !== picked);
      return g.key === targetKey ? { ...g, memberIds: [...without, picked] } : { ...g, memberIds: without };
    }));
    setLeftOut((prev) => (targetKey === LEFT_OUT ? [...prev.filter((id) => id !== picked), picked] : prev.filter((id) => id !== picked)));
    setPicked(null);
  };
  const setSupport = (key: string, supportId: string) =>
    setDraft((prev) => prev.map((g) => (g.key === key ? { ...g, supportId: supportId || null } : g)));

  const usedSupports = new Set(draft.map((g) => g.supportId).filter(Boolean) as string[]);
  const toCreate = draft.filter((g) => g.memberIds.length > 0);
  const noSupportCount = toCreate.filter((g) => !g.supportId).length;

  // ── Save a draft, and come back to it ──
  const saveDraft = async () => {
    setSavingDraft(true);
    setErr('');
    try {
      await settingsApi.setGroupingDraft(cohortId, {
        savedAt: new Date().toISOString(),
        savedByName: currentUser?.name ?? '',
        groups: draft,
        ignoredAgeRanges: [...ignoredAges],
        includeMissedTraining,
        emptyChoice,
      });
      setDraftNote('Draft saved. Open the builder again to continue it.');
    } catch (e: any) {
      setErr(e?.message ? `Couldn't save the draft: ${e.message}` : "Couldn't save the draft. Try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  const clearSavedDraft = async () => {
    setSaved(null);
    await settingsApi.setGroupingDraft(cohortId, null).catch(() => {});
  };

  // Bring a saved draft back, dropping whatever has changed since: people grouped meanwhile,
  // supports no longer free, empty groups that were filled or removed.
  const continueDraft = () => {
    if (!saved) return;
    const stillUngrouped = new Set(people.keys());
    const freeIds = new Set(supportPool.free.map((s) => s.id));
    const emptyIds = new Set(emptyGroups.map((g) => g.id));
    const placed = new Set<string>();
    let droppedPeople = 0;
    let droppedSupports = 0;
    const restored: DraftGroup[] = saved.groups.map((g) => {
      const memberIds = g.memberIds.filter((id) => {
        const ok = stillUngrouped.has(id) && !placed.has(id);
        if (ok) placed.add(id); else droppedPeople += 1;
        return ok;
      });
      const seedSupport = g.existingGroupId ? seeds.find((x) => x.id === g.existingGroupId)?.support?.id : undefined;
      const supportOk = !g.supportId || freeIds.has(g.supportId) || g.supportId === seedSupport;
      if (!supportOk) droppedSupports += 1;
      const existing = g.existingGroupId && emptyIds.has(g.existingGroupId) ? g.existingGroupId : undefined;
      return { ...g, memberIds, supportId: supportOk ? g.supportId : null, existingGroupId: existing };
    });
    setIgnoredAges(new Set(saved.ignoredAgeRanges));
    setIncludeMissedTraining(saved.includeMissedTraining);
    setEmptyChoice(saved.emptyChoice);
    setDraft(restored);
    setLeftOut([...people.values()].filter((p) => !placed.has(p.id)).map((p) => p.id));
    setPicked(null);
    setDraftNote([
      droppedPeople > 0 ? `${droppedPeople} ${droppedPeople === 1 ? 'person was' : 'people were'} grouped since you saved and ${droppedPeople === 1 ? 'was' : 'were'} taken out.` : '',
      droppedSupports > 0 ? `${droppedSupports} ${droppedSupports === 1 ? 'support is' : 'supports are'} no longer free and ${droppedSupports === 1 ? 'was' : 'were'} removed from their group.` : '',
    ].filter(Boolean).join(' '));
    setSaved(null);
    setStep('draft');
  };

  // ── Create ──
  const create = async () => {
    setCreating(true);
    setErr('');
    for (const g of toCreate) {
      if (statuses[g.key] === 'done') continue; // retry only the ones that failed
      setStatuses((prev) => ({ ...prev, [g.key]: 'creating' }));
      try {
        let groupId = g.existingGroupId;
        if (groupId) {
          // An empty group made first: keep it, add its support if the builder picked one.
          const before = groups.find((x) => x.id === groupId);
          if ((before?.supportId ?? null) !== g.supportId) await groupsApi.update(groupId, { supportId: g.supportId });
        } else {
          ({ group: { id: groupId } } = await groupsApi.create({ cohortId, name: g.name, supportId: g.supportId }));
        }
        createdAny.current = true;
        await groupsApi.bulkAssign(g.memberIds.map((participantId) => ({ participantId, groupId: groupId! })));
        setStatuses((prev) => ({ ...prev, [g.key]: 'done' }));
      } catch {
        setStatuses((prev) => ({ ...prev, [g.key]: 'failed' }));
      }
    }
    setCreating(false);
  };
  const doneCount = toCreate.filter((g) => statuses[g.key] === 'done').length;
  const failedCount = toCreate.filter((g) => statuses[g.key] === 'failed').length;
  const allDone = toCreate.length > 0 && doneCount === toCreate.length;
  // Everything created: the saved draft has done its job.
  useEffect(() => {
    if (allDone) void settingsApi.setGroupingDraft(cohortId, null).catch(() => {});
  }, [allDone, cohortId]);

  const close = () => {
    if (creating) return;
    if (createdAny.current) onCreated();
    onClose();
  };

  if (!isOpen) return null;

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const set = <K extends keyof GroupingRules>(key: K, value: GroupingRules[K]) => setRules((prev) => ({ ...prev, [key]: value }));
  const moveAge = (range: string, dir: -1 | 1) => setRules((prev) => {
    const order = [...prev.supportAgeOrder];
    const i = order.indexOf(range);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return prev;
    [order[i], order[j]] = [order[j], order[i]];
    return { ...prev, supportAgeOrder: order };
  });
  const toggleMiddle = (range: string) => setRules((prev) => {
    const has = prev.preferredSupportAges.includes(range);
    const next = has ? prev.preferredSupportAges.filter((r) => r !== range) : [...prev.preferredSupportAges, range];
    return next.length === 0 ? prev : { ...prev, preferredSupportAges: next };
  });

  // Tag rules: one row per tag, in priority order (saved rules first, then any tag without a rule yet).
  const tagRuleFor = (tagId: string): TagRule => rules.tagRules.find((r) => r.tagId === tagId) ?? { tagId, enabled: false, ageRanges: [], gender: null, minSize: null, targetSize: null, maxSize: null };
  const updateTagRule = (tagId: string, patch: Partial<TagRule>) => setRules((prev) => {
    const order = orderedTags.map((t) => t.id);
    const byId = new Map(prev.tagRules.map((r) => [r.tagId, r]));
    const current = byId.get(tagId) ?? { tagId, enabled: false, ageRanges: [], gender: null, minSize: null, targetSize: null, maxSize: null };
    byId.set(tagId, { ...current, ...patch });
    return { ...prev, tagRules: order.map((id) => byId.get(id) ?? { tagId: id, enabled: false, ageRanges: [], gender: null, minSize: null, targetSize: null, maxSize: null }) };
  });
  const moveTagRule = (tagId: string, dir: -1 | 1) => setRules((prev) => {
    const order = orderedTags.map((t) => t.id);
    const i = order.indexOf(tagId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return prev;
    [order[i], order[j]] = [order[j], order[i]];
    const byId = new Map(prev.tagRules.map((r) => [r.tagId, r]));
    return { ...prev, tagRules: order.map((id) => byId.get(id) ?? { tagId: id, enabled: false, ageRanges: [], gender: null, minSize: null, targetSize: null, maxSize: null }) };
  });
  const toggleIgnoredAge = (range: string) => setIgnoredAges((prev) => {
    const next = new Set(prev);
    if (next.has(range)) next.delete(range); else next.add(range);
    return next;
  });
  // Put a support on / take them off a tag from the builder.
  const toggleSupportTag = async (userId: string, tagId: string) => {
    const current = tagIdsByUser.get(userId) ?? [];
    const next = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId];
    setTagSaving(userId);
    try {
      await supportTagsApi.setUserTags(userId, next);
      await reloadTags();
    } catch (e: any) {
      setErr(e?.message ? `Couldn't save the tag: ${e.message}` : "Couldn't save the tag. Try again.");
    } finally {
      setTagSaving(null);
    }
  };

  const personLine = (id: string) => {
    const e = people.get(id);
    return [e?.gender, e?.ageRange ? shortAge(e.ageRange) : null].filter(Boolean).join(' · ') || 'Gender/age missing';
  };

  const personRow = (id: string) => {
    const p = participantById.get(id);
    const isPicked = picked === id;
    return (
      <button
        key={id}
        type="button"
        data-wt="draft-person"
        onClick={() => setPicked(isPicked ? null : id)}
        className={`flex w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left transition ${isPicked ? 'bg-sky-100/80 ring-2 ring-sky-300' : 'hover:bg-gray-50'}`}
      >
        <Avatar name={p?.fullName ?? '?'} avatarUrl={p?.avatarUrl} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-gray-900">{p?.fullName ?? 'Unknown'}</span>
          <span className="block truncate text-[11px] text-gray-500">{personLine(id)}</span>
        </span>
      </button>
    );
  };

  const moveHere = (target: string, memberIdsInTarget: string[]) =>
    picked && !memberIdsInTarget.includes(picked) ? (
      <button type="button" onClick={() => moveTo(target)} className="rounded-full bg-sky-100/80 px-3 py-1 text-[11px] font-semibold text-sky-700 active:scale-95">
        Move here
      </button>
    ) : null;

  const footer = (() => {
    const quiet = 'rounded-2xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 active:scale-95 disabled:opacity-50';
    const primary = 'rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50';
    if (step === 'people') return (<><button type="button" onClick={close} className={quiet}>Cancel</button><button type="button" disabled={loading || readyCount === 0 || (emptyGroups.length > 0 && !emptyChoice)} onClick={() => setStep('rules')} className={primary}>Next: rules</button></>);
    if (step === 'rules') return (<><button type="button" onClick={() => setStep('people')} className={quiet}>Back</button><button type="button" disabled={savingRules} onClick={() => void saveRulesAndBuild()} className={primary}>{savingRules ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span> : 'Save rules & build'}</button></>);
    if (step === 'draft') return (<><button type="button" onClick={() => setStep('rules')} className={quiet}>Back</button><button type="button" onClick={() => rebuild()} className={quiet}>Rebuild</button><button type="button" disabled={savingDraft} onClick={() => void saveDraft()} className={quiet}>{savingDraft ? 'Saving…' : 'Save draft'}</button><button type="button" disabled={toCreate.length === 0} onClick={() => setStep('create')} className={primary}>Create {toCreate.length}</button></>);
    if (allDone) return <button type="button" onClick={close} className={primary}>View groups</button>;
    return (<><button type="button" disabled={creating || doneCount > 0} onClick={() => setStep('draft')} className={quiet}>Back</button><button type="button" disabled={creating || savingDraft || doneCount > 0} onClick={() => void saveDraft()} className={quiet}>{savingDraft ? 'Saving…' : 'Save draft'}</button><button type="button" disabled={creating} onClick={() => void create()} className={primary}>{creating ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Creating…</span> : failedCount > 0 ? 'Retry failed' : `Create ${toCreate.length} groups`}</button></>);
  })();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Build groups">
      <button type="button" className="absolute inset-0 bg-slate-900/45" onClick={close} aria-label="Close" />
      <div className="relative z-10 flex h-[94vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[#f6f7f9] shadow-2xl sm:m-4 sm:h-[90vh] sm:max-w-4xl sm:rounded-[28px]">
        {/* Header */}
        <div className="bg-white/80 px-5 pb-3 pt-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900">Build groups</h2>
              <p className="truncate text-xs text-gray-500">{cohortName}</p>
            </div>
            <button type="button" onClick={close} disabled={creating} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40" aria-label="Close">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <ol className="mt-3 grid grid-cols-4 gap-1.5">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex flex-col gap-1">
                <span className={`h-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-gray-200'}`} />
                <span className={`text-[11px] font-semibold ${i === stepIndex ? 'text-gray-900' : 'text-gray-400'}`}>{i + 1}. {s.label}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {err && <p className="mb-3 rounded-2xl bg-red-100/80 px-4 py-2.5 text-sm text-red-700">{err}</p>}

          {loading ? (
            <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
          ) : step === 'people' ? (
            <div className="flex flex-col gap-4">
              {saved && (
                <div className={`${SURFACE} flex flex-wrap items-center justify-between gap-3 p-4`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">You have a saved draft</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {saved.groups.filter((g) => g.memberIds.length > 0).length} groups{saved.savedAt ? ` · saved ${new Date(saved.savedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}{saved.savedByName ? ` by ${saved.savedByName}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void clearSavedDraft()} className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 active:scale-95">Discard</button>
                    <button type="button" onClick={continueDraft} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95">Continue draft</button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile value={readyCount} label="Ready to group" />
                <StatTile value={needsInfo.length} label="Need gender/age" tone="amber" />
                <StatTile value={supportPool.free.length} label="Supports free" />
                <StatTile value={supportsMissingDetails} label="Supports missing details" tone="amber" />
              </div>
              {ungrouped.length === 0 ? (
                <div className={`${SURFACE} px-5 py-10 text-center text-sm text-gray-500`}>Everyone in this cohort is already in a group.</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className={`${SURFACE} p-4`}>
                    <p className={SECTION_LABEL}>Not in a group yet</p>
                    <div className="mt-3 flex gap-2">
                      <span className="rounded-full bg-violet-100/80 px-3 py-1 text-xs font-semibold text-violet-700">{women} women</span>
                      <span className="rounded-full bg-sky-100/80 px-3 py-1 text-xs font-semibold text-sky-700">{men} men</span>
                    </div>
                    <div className="mt-3 flex flex-col gap-1.5">
                      {ageCounts.map(({ range, count }) => (
                        <div key={range} className="flex items-center gap-2 text-xs">
                          <span className="w-24 flex-shrink-0 text-gray-600">{range}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <span className="block h-full rounded-full bg-primary/70" style={{ width: `${ungrouped.length ? (count / ungrouped.length) * 100 : 0}%` }} />
                          </span>
                          <span className="w-6 text-right font-semibold text-gray-900">{count}</span>
                          {count > 0 && (
                            <button type="button" aria-pressed={ignoredAges.has(range)} onClick={() => toggleIgnoredAge(range)} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ignoredAges.has(range) ? 'bg-red-100/80 text-red-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                              {ignoredAges.has(range) ? 'Left out' : 'Leave out'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {ignoredAges.size > 0 && <p className="mt-2 text-[11px] text-red-700">{[...ignoredAges].join(', ')} left out of this build only. Nothing is saved.</p>}
                  </div>
                  <div className={`${SURFACE} p-4`}>
                    <p className={SECTION_LABEL}>Need gender or age ({needsInfo.length})</p>
                    {needsInfo.length === 0 ? (
                      <p className="mt-3 text-sm text-gray-500">Everyone has what the engine needs.</p>
                    ) : (
                      <div className="mt-2 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                        {needsInfo.map((p) => (
                          <button key={p.id} type="button" onClick={() => navigate(`/participants/${p.id}`)} className="flex items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left hover:bg-gray-50">
                            <Avatar name={p.fullName} avatarUrl={p.avatarUrl} size="sm" />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900">{p.fullName}</span>
                            <span className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{!people.get(p.id)?.gender ? 'Gender' : 'Age'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="mt-3 text-[11px] text-gray-400">These people are left out of the draft — nothing is guessed. Tap one to fill in their profile.</p>
                  </div>
                </div>
              )}
              {emptyGroups.length > 0 && (
                <div className={`${SURFACE} p-4`}>
                  <p className="text-sm font-semibold text-gray-900">
                    You have {emptyGroups.length} empty {emptyGroups.length === 1 ? 'group' : 'groups'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {emptyGroups.map((g) => `${g.name}${g.supportId ? ` (${supportUsers.find((u) => u.id === g.supportId)?.name ?? 'support set'})` : ''}`).join(', ')}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {([['fill', 'Fill them first', 'Put people in these before making new groups. Supports already on them stay.'], ['leave', 'Leave them alone', 'Make new groups for everyone. Fill these yourself.']] as const).map(([value, label, hint]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setEmptyChoice(value)}
                        aria-pressed={emptyChoice === value}
                        className={`rounded-2xl p-3 text-left transition ${emptyChoice === value ? 'bg-primary/10 ring-2 ring-primary/50' : 'bg-gray-50 hover:bg-gray-100'}`}
                      >
                        <span className="block text-sm font-semibold text-gray-900">{label}</span>
                        <span className="mt-0.5 block text-[11px] text-gray-500">{hint}</span>
                      </button>
                    ))}
                  </div>
                  {!emptyChoice && <p className="mt-2 text-[11px] text-amber-700">Pick one to carry on.</p>}
                </div>
              )}
              {supportPool.free.length > 0 && (
                <details className={`${SURFACE} p-4`}>
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700">Supports the engine can use ({supportPool.free.length})</summary>
                  <p className="mt-1 text-[11px] text-gray-400">Tap “Leave out” for anyone who shouldn’t get a group this cohort. It’s remembered.</p>
                  <div className="mt-2 flex flex-col gap-1">
                    {supportPool.free.map((sup) => {
                      const user = supportUsers.find((u) => u.id === sup.id);
                      return (
                        <div key={sup.id}>
                        <div className="flex items-center gap-2.5 px-1 py-1">
                          <Avatar name={sup.name} avatarUrl={user?.avatarUrl} size="xs" />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-gray-800">{sup.name}{(sup.tagIds ?? []).length > 0 && <span className="ml-1.5 text-[11px] font-semibold text-violet-700">{(sup.tagIds ?? []).map((id) => tagNames[id]).filter(Boolean).join(', ')}</span>}</span>
                          <button type="button" aria-expanded={tagEditFor === sup.id} onClick={() => setTagEditFor((cur) => (cur === sup.id ? null : sup.id))} className="rounded-full bg-violet-100/80 px-3 py-1 text-[12px] font-semibold text-violet-700 hover:bg-violet-100">Tags</button>
                          <button type="button" disabled={excludeSaving === sup.id} onClick={() => void toggleExcluded(sup.id)} className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60">
                            {excludeSaving === sup.id ? <Spinner className="h-3 w-3" /> : 'Leave out'}
                          </button>
                        </div>
                        {tagEditFor === sup.id && (
                          <div className="mb-1 ml-8 flex flex-wrap items-center gap-1.5 rounded-2xl bg-gray-50 px-3 py-2">
                            {tags.length === 0 ? <span className="text-[11px] text-gray-500">No tags yet.</span> : tags.map((t) => {
                              const on = (sup.tagIds ?? []).includes(t.id);
                              return (
                                <button key={t.id} type="button" role="checkbox" aria-checked={on} disabled={tagSaving === sup.id} onClick={() => void toggleSupportTag(sup.id, t.id)} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${on ? 'bg-violet-100/80 text-violet-700' : 'bg-white text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)]'}`}>
                                  {on ? '✓ ' : ''}{t.name}
                                </button>
                              );
                            })}
                            <button type="button" onClick={() => setTagsOpen(true)} className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-primary">Manage tags</button>
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
              {supportPool.missedTraining.size > 0 && (
                <div className={`${SURFACE} flex items-center justify-between gap-3 p-4`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Also use supports who missed pre-cohort training</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {includeMissedTraining
                        ? `${supportPool.missedTraining.size} added to the engine. They show “Missed training” on the draft.`
                        : `${supportPool.missedTraining.size} ${supportPool.missedTraining.size === 1 ? 'support is' : 'supports are'} left out for missing training.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeMissedTraining}
                    aria-label="Also use supports who missed pre-cohort training"
                    onClick={() => setIncludeMissedTraining((v) => !v)}
                    className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition ${includeMissedTraining ? 'bg-primary' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${includeMissedTraining ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
              )}
              {supportPool.reasons.length > 0 && (
                <details className={`${SURFACE} p-4`}>
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700">Supports the engine won't use ({supportPool.reasons.length})</summary>
                  <div className="mt-3 flex flex-col gap-1">
                    {supportPool.reasons.map(({ user, reason }) => (
                      <div key={user.id} className="flex items-center gap-2.5 px-1 py-1">
                        <Avatar name={user.name} avatarUrl={user.avatarUrl} size="xs" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-gray-800">{user.name}</span>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">{reason}</span>
                        {reason === LEFT_OUT_BY_YOU && (
                          <button type="button" disabled={excludeSaving === user.id} onClick={() => void toggleExcluded(user.id)} className="rounded-full bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary disabled:opacity-60">
                            {excludeSaving === user.id ? <Spinner className="h-3 w-3" /> : 'Use again'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : step === 'rules' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <RuleCard title="Group size" hint="Smallest, aim and largest number of people." strength={rules.sizeStrength} onStrength={(v) => set('sizeStrength', v)}>
                <div className="grid grid-cols-3 gap-2">
                  <Stepper label="Smallest" value={rules.minSize} min={1} max={rules.maxSize} onChange={(v) => setRules((p) => ({ ...p, minSize: v, targetSize: Math.max(v, p.targetSize) }))} />
                  <Stepper label="Aim" value={rules.targetSize} min={rules.minSize} max={rules.maxSize} onChange={(v) => set('targetSize', v)} />
                  <Stepper label="Largest" value={rules.maxSize} min={rules.minSize} max={50} onChange={(v) => setRules((p) => ({ ...p, maxSize: v, targetSize: Math.min(v, p.targetSize) }))} />
                </div>
              </RuleCard>
              <RuleCard title="Gender mix" hint="How men and women are placed." strength={rules.genderStrength} onStrength={(v) => set('genderStrength', v)}>
                <Segmented value={rules.genderMix} onChange={(v) => set('genderMix', v as GroupingRules['genderMix'])} options={[{ value: 'SAME', label: 'Same gender' }, { value: 'MIXED', label: 'Mixed' }, { value: 'RATIO', label: 'Ratio' }]} />
                {rules.genderMix === 'RATIO' && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Stepper label="Women" value={rules.femalePct} min={0} max={100} suffix="%" step={5} onChange={(v) => set('femalePct', v)} />
                    <div className="flex items-center justify-center rounded-2xl bg-gray-50 text-xs text-gray-500">Men {100 - rules.femalePct}%</div>
                  </div>
                )}
              </RuleCard>
              <RuleCard title="Ages in a group" hint="Keep close ages together, or mix every age range." strength={rules.ageStrength} onStrength={(v) => set('ageStrength', v)}>
                <Segmented value={rules.ageMix} onChange={(v) => set('ageMix', v as GroupingRules['ageMix'])} options={[{ value: 'SIMILAR', label: 'Similar ages' }, { value: 'SPREAD', label: 'All ages mixed' }]} />
              </RuleCard>
              <RuleCard title="Support's gender" hint="A one-gender group gets a support of that gender." strength={rules.supportGenderStrength} onStrength={(v) => set('supportGenderStrength', v)}>
                <Segmented value={rules.supportGender} onChange={(v) => set('supportGender', v as GroupingRules['supportGender'])} options={[{ value: 'SAME_AS_GROUP', label: 'Same as group' }, { value: 'ANY', label: 'Any' }]} />
              </RuleCard>
              <div className="sm:col-span-2">
                <RuleCard title="Support's age" hint="Best first. Tick the ranges that count as middle age — the engine uses those first, then walks down the list." strength={rules.supportAgeStrength} onStrength={(v) => set('supportAgeStrength', v)}>
                  <div className="flex flex-col gap-1.5">
                    {rules.supportAgeOrder.map((range, i) => {
                      const middle = rules.preferredSupportAges.includes(range);
                      return (
                        <div key={range} className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2">
                          <span className="w-5 text-xs font-semibold text-gray-400">{i + 1}</span>
                          <span className="flex-1 text-sm font-medium text-gray-900">{range}</span>
                          <button type="button" onClick={() => toggleMiddle(range)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${middle ? 'bg-emerald-100/80 text-emerald-700' : 'bg-white text-gray-400'}`}>
                            {middle ? '✓ Middle age' : 'Middle age'}
                          </button>
                          <button type="button" aria-label={`Move ${range} up`} disabled={i === 0} onClick={() => moveAge(range, -1)} className="h-7 w-7 rounded-full bg-white text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)] disabled:opacity-30">↑</button>
                          <button type="button" aria-label={`Move ${range} down`} disabled={i === rules.supportAgeOrder.length - 1} onClick={() => moveAge(range, 1)} className="h-7 w-7 rounded-full bg-white text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)] disabled:opacity-30">↓</button>
                        </div>
                      );
                    })}
                  </div>
                </RuleCard>
              </div>
              <div className="sm:col-span-2">
                <RuleCard title="Support tags" hint="A group made only of the people a tag is for takes only supports on that tag. First in the list wins when a group fits more than one.">
                  {orderedTags.length === 0 ? (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-3">
                      <p className="text-sm text-gray-500">No tags yet.</p>
                      <button type="button" onClick={() => setTagsOpen(true)} className="rounded-full bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">Manage tags</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {orderedTags.map((tag, i) => {
                        const rule = tagRuleFor(tag.id);
                        const noCriteria = rule.enabled && rule.ageRanges.length === 0 && !rule.gender;
                        return (
                          <div key={tag.id} className="rounded-2xl bg-gray-50 p-3">
                            <div className="flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-gray-900">{tag.name}</p>
                                <p className="text-[11px] text-gray-500">{tag.userIds.length} {tag.userIds.length === 1 ? 'support' : 'supports'}</p>
                              </div>
                              <button type="button" aria-label={`Move ${tag.name} up`} disabled={i === 0} onClick={() => moveTagRule(tag.id, -1)} className="h-7 w-7 rounded-full bg-white text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)] disabled:opacity-30">↑</button>
                              <button type="button" aria-label={`Move ${tag.name} down`} disabled={i === orderedTags.length - 1} onClick={() => moveTagRule(tag.id, 1)} className="h-7 w-7 rounded-full bg-white text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)] disabled:opacity-30">↓</button>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={rule.enabled}
                                aria-label={`Use ${tag.name} in this build`}
                                onClick={() => updateTagRule(tag.id, { enabled: !rule.enabled })}
                                className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition ${rule.enabled ? 'bg-primary' : 'bg-slate-200'}`}
                              >
                                <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${rule.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
                              </button>
                            </div>
                            {rule.enabled && (
                              <div className="mt-3 flex flex-col gap-2.5">
                                <div>
                                  <p className="mb-1 text-[11px] font-medium text-gray-500">For groups of these ages</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {AGE_RANGE_OPTIONS.map((range) => {
                                      const on = rule.ageRanges.includes(range);
                                      return (
                                        <button key={range} type="button" aria-pressed={on} onClick={() => updateTagRule(tag.id, { ageRanges: on ? rule.ageRanges.filter((r) => r !== range) : [...rule.ageRanges, range] })} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${on ? 'bg-violet-100/80 text-violet-700' : 'bg-white text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)]'}`}>
                                          {range}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div>
                                  <p className="mb-1 text-[11px] font-medium text-gray-500">And groups that are</p>
                                  <Segmented value={rule.gender ?? ''} onChange={(v) => updateTagRule(tag.id, { gender: v === 'Female' || v === 'Male' || v === 'SAME' ? v : null })} options={[{ value: 'Male', label: 'Men' }, { value: 'Female', label: 'Women' }, { value: 'SAME', label: 'Same gender' }, { value: '', label: 'Any' }]} />
                                  <p className="mt-1 text-[11px] text-gray-400">Men or Women: only all-men or all-women groups. Same gender: any group that is all one gender. Any: mixed groups too.</p>
                                </div>
                                <div>
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-medium text-gray-500">Group size for {tag.name}</p>
                                    {rule.minSize !== null && (
                                      <button type="button" onClick={() => updateTagRule(tag.id, { minSize: null, targetSize: null, maxSize: null })} className="text-[11px] font-semibold text-primary">Use the cohort's sizes</button>
                                    )}
                                  </div>
                                  {(() => {
                                    const min = rule.minSize ?? rules.minSize;
                                    const aim = rule.targetSize ?? rules.targetSize;
                                    const max = rule.maxSize ?? rules.maxSize;
                                    const setSizes = (next: { min: number; aim: number; max: number }) => updateTagRule(tag.id, { minSize: next.min, targetSize: next.aim, maxSize: next.max });
                                    return (
                                      <div className="grid grid-cols-3 gap-2">
                                        <Stepper label="Smallest" value={min} min={1} max={max} onChange={(v) => setSizes({ min: v, aim: Math.max(v, aim), max })} />
                                        <Stepper label="Aim" value={aim} min={min} max={max} onChange={(v) => setSizes({ min, aim: v, max })} />
                                        <Stepper label="Largest" value={max} min={min} max={50} onChange={(v) => setSizes({ min, aim: Math.min(v, aim), max: v })} />
                                      </div>
                                    );
                                  })()}
                                  {rule.minSize === null && <p className="mt-1 text-[11px] text-gray-400">Using the cohort's sizes. Change any number to give these groups their own.</p>}
                                </div>
                                {noCriteria && <p className="text-[11px] font-semibold text-amber-700">Pick an age range or a gender, or this tag has nothing to match.</p>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button type="button" onClick={() => setTagsOpen(true)} className="self-start rounded-full px-2.5 py-1 text-[12px] font-semibold text-primary">Manage tags</button>
                    </div>
                  )}
                </RuleCard>
              </div>
              <p className="text-[11px] text-gray-400 sm:col-span-2">
                <b className="font-semibold text-violet-700">Must</b> is never bent. <b className="font-semibold text-sky-700">Prefer</b> can be relaxed when the ideal runs out — ages widened first, then group size, then the support's age, then the support's gender (mixed groups only). Every relaxation is shown on the group.
              </p>
            </div>
          ) : step === 'draft' ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-500">
                {toCreate.length} groups · {toCreate.reduce((n, g) => n + g.memberIds.length, 0)} people
                {noSupportCount > 0 && <> · <span className="font-semibold text-red-700">{noSupportCount} without a support</span></>}
                {' · '}Tap a person, then “Move here” on another group.
              </p>
              {(draftInfo.ignored > 0 || draftInfo.tagNotes.length > 0) && (
                <div className="flex flex-col gap-1 rounded-2xl bg-amber-100/80 px-3 py-2 text-[12px] text-amber-700">
                  {draftInfo.ignored > 0 && <p>{draftInfo.ignored} {draftInfo.ignored === 1 ? 'person' : 'people'} left out ({[...ignoredAges].join(', ')}), as you chose for this build.</p>}
                  {draftInfo.tagNotes.map((note) => <p key={note}>{note}</p>)}
                </div>
              )}
              {draftNote && <p className="rounded-2xl bg-sky-100/80 px-3 py-2 text-[12px] font-semibold text-sky-700">{draftNote}</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {draft.map((g) => {
                  const notes = evaluateGroup(g, people, supportById, effectiveRules, tagNames);
                  const options = [
                    { value: '', label: 'No support' },
                    ...supportPool.free
                      .filter((s) => s.id === g.supportId || !usedSupports.has(s.id))
                      .map((s) => ({ value: s.id, label: s.name, meta: [s.gender, s.ageRange ? shortAge(s.ageRange) : null, trainingsTotal ? `${s.trainingsAttended}/${trainingsTotal} trainings` : null, ...(s.tagIds ?? []).map((id) => tagNames[id]).filter(Boolean)].filter(Boolean).join(' · ') || 'Details missing' })),
                  ];
                  return (
                    <div key={g.key} className={`${SURFACE} flex flex-col gap-2.5 p-4`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 font-bold text-gray-900">
                          {g.name}
                          {g.existingGroupId && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">Your group</span>}
                          {groupTagName(g.memberIds) && <span className="rounded-full bg-violet-100/80 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{groupTagName(g.memberIds)}</span>}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {moveHere(g.key, g.memberIds)}
                          <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">{g.memberIds.length}</span>
                        </div>
                      </div>
                      {g.existingGroupId && seeds.find((x) => x.id === g.existingGroupId)?.support ? (
                        <p className="rounded-xl bg-gray-50 px-3 py-2 text-[13px] text-gray-700">Support: <b>{supportById.get(g.supportId ?? '')?.name}</b> (you chose)</p>
                      ) : (
                        <AppSelect value={g.supportId ?? ''} onChange={(v) => setSupport(g.key, v)} options={options} placeholder="No support" compact />
                      )}
                      {(notes.length > 0 || (g.supportId && supportPool.missedTraining.has(g.supportId))) && (
                        <div className="flex flex-wrap gap-1.5">
                          {g.supportId && supportPool.missedTraining.has(g.supportId) && (
                            <span className="rounded-full bg-amber-100/80 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">Missed training</span>
                          )}
                          {notes.map((n) => (
                            <span key={n.text} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${n.tone === 'broken' ? 'bg-red-100/80 text-red-700' : n.tone === 'info' ? 'bg-sky-100/80 text-sky-700' : 'bg-amber-100/80 text-amber-700'}`}>
                              {n.text}
                              {n.hint && <InfoTip label={`About: ${n.text}`}>{n.hint}</InfoTip>}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-col">
                        {g.memberIds.length === 0 ? <p className="px-2 py-2 text-xs text-gray-400">Empty — won't be created.</p> : g.memberIds.map(personRow)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={`${SURFACE} p-4`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={SECTION_LABEL}>Not in a group ({leftOut.length})</p>
                  {moveHere(LEFT_OUT, leftOut)}
                </div>
                {leftOut.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">Everyone ready has a group.</p>
                ) : (
                  <>
                    <div className="mt-2 grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">{leftOut.map(personRow)}</div>
                    <p className="mt-2 text-[11px] text-gray-400">Missing gender/age, or couldn't be placed without breaking a Must rule. Tap one to place them by hand.</p>
                  </>
                )}
              </div>
              {(() => {
                const unused = supportPool.free.filter((s) => !usedSupports.has(s.id));
                return (
                  <div className={`${SURFACE} p-4`}>
                    <p className={SECTION_LABEL}>Supports without a group ({unused.length})</p>
                    {unused.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">Every available support has a group.</p>
                    ) : (
                      <>
                        <div className="mt-2 grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
                          {unused.map((s) => (
                            <div key={s.id} className="flex items-center gap-2.5 rounded-2xl px-2 py-1.5">
                              <Avatar name={s.name} avatarUrl={supportUsers.find((u) => u.id === s.id)?.avatarUrl} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1.5 text-[13px] font-medium text-gray-900"><span className="truncate">{s.name}</span><InfoTip label={`Why ${s.name} has no group`}>{unusedSupportHint(s, effectiveRules, tagNames)}</InfoTip></p>
                                <p className="truncate text-[11px] text-gray-500">{[s.gender, s.ageRange ? shortAge(s.ageRange) : null, ...(s.tagIds ?? []).map((id) => tagNames[id]).filter(Boolean)].filter(Boolean).join(' · ') || 'Details missing'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] text-gray-400">Available to the engine but not given a group in this draft. Tap ⓘ for the reason, or pick one on any group above to use them.</p>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {allDone && <p className="rounded-2xl bg-emerald-100/80 px-4 py-3 text-sm font-semibold text-emerald-700">{doneCount} groups created. Supports can set their meeting time from their hub.</p>}
              {failedCount > 0 && !creating && <p className="rounded-2xl bg-red-100/80 px-4 py-3 text-sm text-red-700">{failedCount} didn't go through. The rest are saved — tap “Retry failed”.</p>}
              <div className={`${SURFACE} divide-y divide-gray-100`}>
                {toCreate.map((g) => {
                  const s = statuses[g.key] ?? 'waiting';
                  const support = g.supportId ? supportById.get(g.supportId) : null;
                  return (
                    <div key={g.key} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">{g.name} <span className="font-normal text-gray-500">· {g.memberIds.length} people</span>{groupTagName(g.memberIds) && <span className="ml-1.5 rounded-full bg-violet-100/80 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{groupTagName(g.memberIds)}</span>}</p>
                        <p className="truncate text-xs text-gray-500">{support ? support.name : 'No support'}</p>
                      </div>
                      {s === 'creating' ? <Spinner className="h-4 w-4" /> : (
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s === 'done' ? 'bg-emerald-100/80 text-emerald-700' : s === 'failed' ? 'bg-red-100/80 text-red-700' : 'bg-neutral-100 text-neutral-600'}`}>
                          {s === 'done' ? 'Created' : s === 'failed' ? 'Failed' : 'Ready'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sticky action bar */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200/70 bg-white/80 px-5 py-3.5 backdrop-blur-xl sm:px-6">{footer}</div>
      </div>
      <SupportTagsModal isOpen={tagsOpen} onClose={() => setTagsOpen(false)} supports={supportUsers.filter((u) => u.isActive !== false && !u.isTest)} onChanged={() => void reloadTags()} />
    </div>,
    document.body
  );
};

export default GroupEngineWizard;
