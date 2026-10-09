import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import AppSelect from '../AppSelect';
import Avatar from '../Avatar';
import InfoTip from '../InfoTip';
import Spinner from '../Spinner';
import SupportTagsModal from '../supports/SupportTagsModal';
import { useAuth } from '../../hooks/useAuth';
import { cohortsApi, groupsApi, participantPushApi, settingsApi, supportHubsApi, supportKindApi, supportTagsApi } from '../../services/api';
import type { Group, Participant, SupportKind, SupportTag, User } from '../../types';
import { AGE_RANGE_OPTIONS } from '../../constants/departments';
import { trainingCountFor } from '../../utils/programmeRules';
import { buildWhatsAppText } from '../../utils/groupingExport';
import { DEFAULT_GROUPING_RULES, type GroupingRules, type RuleStrength, type TagRule } from '../../utils/groupingRules';
import {
  buildDraft,
  evaluateGroup,
  fitsGroup,
  groupTagRule,
  hubCoverage,
  hubGroupsNeeded,
  topUpGroups,
  unusedSupportHint,
  toEnginePerson,
  type DraftGroup,
  type SeedGroup,
  type EnginePerson,
  type EngineSupport,
  type HubSpread,
  type SavedGroupingDraft,
  type TopUpTarget,
  sharedGender,
  nextGroupNames,
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
const NOT_IN_HUB = 'Not in a hub';

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
  // Why a group failed, shown on its row (cleared when it is retried).
  const [failReasons, setFailReasons] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  // Empty groups the admin made first: fill them, or leave them alone. Asked each time.
  const [emptyChoice, setEmptyChoice] = useState<'fill' | 'leave' | null>(null);
  // Operational supports can lead groups too, but only when this is switched on (off each time the builder opens).
  const [includeOperational, setIncludeOperational] = useState(false);
  // Planning only: include people who have not signed in so the draft shows the groups and supports we will need.
  // Such a draft is only a view: it cannot be saved (that would overwrite the cohort's real draft) or turned into groups.
  const [planningMode, setPlanningMode] = useState(false);
  // "Text for WhatsApp": the draft's supports by gender with their participants, ready to paste.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareNames, setShareNames] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);
  // Hub leads can lead groups too if need be; also off each time the builder opens.
  const [includeHubLeads, setIncludeHubLeads] = useState(false);
  // Fill running groups that have space before making new ones (on by default).
  const [topUpFirst, setTopUpFirst] = useState(true);
  const [signedInIds, setSignedInIds] = useState<Set<string> | null>(null);
  const [signedInFailed, setSignedInFailed] = useState(false);
  const createdAny = useRef(false);
  // Support tags, and the age ranges left out of THIS build only (never saved).
  const [tags, setTags] = useState<SupportTag[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagEditFor, setTagEditFor] = useState<string | null>(null);
  const [tagSaving, setTagSaving] = useState<string | null>(null);
  const [ignoredAges, setIgnoredAges] = useState<Set<string>>(new Set());
  const [draftInfo, setDraftInfo] = useState<{ ignored: number; tagNotes: string[] }>({ ignored: 0, tagNotes: [] });
  // The cohort's hubs and who is in each, so supports are picked from all of them.
  const [hubData, setHubData] = useState<{ hubs: Array<{ id: string; name: string }>; hubOf: Record<string, string> } | null>(null);
  // A build saved part-way earlier (one per cohort), and the note after continuing it.
  const [saved, setSaved] = useState<SavedGroupingDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftNote, setDraftNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStep('people');
    setErr('');
    setDraft([]);
    resetSupportView();
    setLeftOut([]);
    setPicked(null);
    setStatuses({});
    setFailReasons({});
    setEmptyChoice(null);
    setIncludeOperational(false);
    setIncludeHubLeads(false);
    setPlanningMode(false);
    setShareOpen(false);
    setShareCopied(false);
    setTopUpFirst(true);
    setSignedInIds(null);
    setSignedInFailed(false);
    setIgnoredAges(new Set());
    setTagEditFor(null);
    setDraftInfo({ ignored: 0, tagNotes: [] });
    setSaved(null);
    setHubData(null);
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

  // Who has confirmed their login, for the "Only people who have signed in" switch. Loaded when the
  // builder opens, again when you come back to the tab and when the switch is turned on, so someone
  // who signs in meanwhile is counted. A failed refresh keeps the last good list.
  const signedInRequest = useRef(0);
  const signedInLoaded = useRef(false);
  const loadSignedIn = useCallback(() => {
    const request = ++signedInRequest.current;
    participantPushApi.getSignedInIds(cohortId)
      .then((ids) => {
        if (request !== signedInRequest.current) return;
        signedInLoaded.current = true;
        setSignedInIds(new Set(ids));
        setSignedInFailed(false);
      })
      .catch(() => {
        if (request === signedInRequest.current && !signedInLoaded.current) setSignedInFailed(true);
      });
  }, [cohortId]);
  useEffect(() => {
    if (!isOpen) return;
    signedInLoaded.current = false;
    loadSignedIn();
    const onVisible = () => { if (document.visibilityState === 'visible') loadSignedIn(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      signedInRequest.current += 1;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isOpen, loadSignedIn]);

  // The hubs, loaded when the builder opens and on Try again. Supports are always in hubs, so a
  // support in none is not used, and with no hub that has people nothing is built until one exists.
  const [hubsFailed, setHubsFailed] = useState(false);
  const hubsRequest = useRef(0);
  const loadHubs = useCallback(() => {
    const request = ++hubsRequest.current;
    setHubsFailed(false);
    Promise.all([supportHubsApi.getAll(cohortId), supportHubsApi.getMembershipsForCohort(cohortId)])
      .then(([h, m]) => {
        if (request !== hubsRequest.current) return;
        const inCohort = new Set(h.hubs.map((x) => x.id));
        const hubOf: Record<string, string> = {};
        m.memberships.forEach((x) => { if (inCohort.has(x.hubId) && !hubOf[x.userId]) hubOf[x.userId] = x.hubId; });
        // Only hubs with people in them can have participants.
        const withMembers = new Set(Object.values(hubOf));
        setHubData({ hubs: h.hubs.filter((x) => withMembers.has(x.id)).map((x) => ({ id: x.id, name: x.name })), hubOf });
      })
      .catch(() => { if (request === hubsRequest.current) setHubsFailed(true); });
  }, [cohortId]);
  useEffect(() => {
    if (!isOpen) return;
    loadHubs();
    return () => { hubsRequest.current += 1; };
  }, [isOpen, loadHubs]);
  const noHubs = !!hubData && hubData.hubs.length === 0;
  const hubsReady = !!hubData && hubData.hubs.length > 0;

  // ── Who can be grouped, and which supports are free ──
  const notGrouped = useMemo(() => participants.filter((p) => !p.groupId), [participants]);
  // Split once by confirmed login.
  const loginSplit = useMemo(
    () => (signedInIds ? { signedIn: notGrouped.filter((p) => signedInIds.has(p.id)), notSignedIn: notGrouped.filter((p) => !signedInIds.has(p.id)) } : null),
    [notGrouped, signedInIds]
  );
  // Only people who have signed in are ever grouped by the builder (no password chosen yet = not yet).
  // The rest stay Active and ungrouped, and a later build picks them up once they sign in. Until we
  // know who has signed in, Next and Continue draft are blocked, so nobody is grouped by mistake.
  const ungrouped = planningMode ? notGrouped : loginSplit ? loginSplit.signedIn : notGrouped;
  const notSignedInCount = loginSplit ? loginSplit.notSignedIn.length : 0;
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

  const teenTagId = useMemo(() => tags.find((t) => t.systemKey === 'TEEN_SUPPORT')?.id ?? null, [tags]);
  // Who the builder may use as a support. `withOperational` and `withHubLeads` let Operational supports and hub
  // leads lead groups too; the rest of the rules are the same either way.
  const buildSupportPool = useCallback((withOperational: boolean, withHubLeads: boolean) => {
    const leading = new Set(groups.filter((g) => !g.archivedAt && g.supportId).map((g) => g.supportId as string));
    const free: EngineSupport[] = [];
    const reasons: Array<{ user: User; reason: string }> = [];
    const missedTraining = new Set<string>();
    const operational = new Set<string>();
    const hubLeads = new Set<string>();
    supportUsers.forEach((u) => {
      if (u.isActive === false || !memberIds.has(u.id)) return; // not in this cohort
      const kind = kinds[u.id] ?? 'PARTICIPANT_SUPPORT';
      const c = trainingCountFor(trainingCounts, u.id, trainingsTotal);
      if (leading.has(u.id)) { reasons.push({ user: u, reason: 'Already has a group' }); return; }
      // Teen Supports look after teens in their own groups, never in the automatic builder.
      if (teenTagId && (tagIdsByUser.get(u.id) ?? []).includes(teenTagId)) { reasons.push({ user: u, reason: 'Teen Support' }); return; }
      if (rules.excludedSupportIds.includes(u.id)) { reasons.push({ user: u, reason: LEFT_OUT_BY_YOU }); return; }
      if (hubData && hubData.hubs.length > 0 && !hubData.hubOf[u.id]) { reasons.push({ user: u, reason: NOT_IN_HUB }); return; }
      // An operational support who passes every other check can lead a group when the switch is on.
      if (kind === 'OPERATIONAL') {
        operational.add(u.id);
        if (!withOperational) { reasons.push({ user: u, reason: 'Operational' }); return; }
      }
      // The same for a hub lead: usable only when the switch is on.
      if (kind === 'HUB_LEAD') {
        hubLeads.add(u.id);
        if (!withHubLeads) { reasons.push({ user: u, reason: 'Hub lead' }); return; }
      }
      // Shown (a tag on the support and on the draft group), never a reason to leave them out. Operational
      // supports are not expected to do the participant-support training, so they are not flagged.
      if (kind === 'PARTICIPANT_SUPPORT' && c.total > 0 && c.attended < minTrainingsAttended) {
        missedTraining.add(u.id);
      }
      free.push({ ...toEnginePerson(u), trainingsAttended: c.attended, tagIds: tagIdsByUser.get(u.id) ?? [] });
    });
    return { free, reasons, missedTraining, operational, hubLeads };
  }, [supportUsers, memberIds, kinds, groups, trainingCounts, trainingsTotal, minTrainingsAttended, rules.excludedSupportIds, tagIdsByUser, teenTagId, hubData]);
  const supportPool = useMemo(() => buildSupportPool(includeOperational, includeHubLeads), [buildSupportPool, includeOperational, includeHubLeads]);

  const notInHubCount = supportPool.reasons.filter((r) => r.reason === NOT_IN_HUB).length;

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
  // Running groups (they already have people) and the support on each: candidates to top up.
  const topUpTargets = useMemo<TopUpTarget[]>(() => {
    const membersOf = new Map<string, EnginePerson[]>();
    participants.forEach((p) => {
      if (p.groupId) membersOf.set(p.groupId, [...(membersOf.get(p.groupId) ?? []), toEnginePerson({ id: p.id, name: p.fullName, gender: p.gender, ageRange: p.ageRange })]);
    });
    return groups
      .filter((g) => !g.archivedAt && (membersOf.get(g.id)?.length ?? 0) > 0)
      .map((g) => {
        const u = g.supportId ? supportUsers.find((x) => x.id === g.supportId) : null;
        return {
          id: g.id,
          name: g.name,
          supportId: g.supportId ?? null,
          support: u ? { ...toEnginePerson(u), trainingsAttended: 0, tagIds: tagIdsByUser.get(u.id) ?? [] } : null,
          members: membersOf.get(g.id)!,
        };
      });
  }, [groups, participants, supportUsers, tagIdsByUser]);
  // Everyone in a running group plus everyone waiting, so a topped-up group can be checked as a whole.
  const topUpPeople = useMemo(() => new Map<string, EnginePerson>([...people, ...topUpTargets.flatMap((t) => t.members.map((m) => [m.id, m] as [string, EnginePerson]))]), [people, topUpTargets]);
  const topUpSupports = useMemo(() => topUpTargets.map((t) => t.support).filter((s): s is EngineSupport => !!s), [topUpTargets]);
  const supportById = useMemo(() => new Map([...supportPool.free, ...seedSupports, ...topUpSupports].map((s) => [s.id, s])), [supportPool.free, seedSupports, topUpSupports]);
  const whatsAppText = useMemo(
    () => (shareOpen ? buildWhatsAppText(draft, people, supportById, { names: shareNames }) : ''),
    [shareOpen, shareNames, draft, people, supportById],
  );
  const copyWhatsAppText = async () => {
    try {
      await navigator.clipboard.writeText(whatsAppText);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setErr('Could not copy. Select the text and copy it by hand.');
    }
  };

  // Hubs the supports belong to, and which hubs already have participants through running groups.
  const hubSpread = useMemo<HubSpread | undefined>(() => {
    if (!hubData || hubData.hubs.length === 0) return undefined;
    const groupsByHub: Record<string, number> = {};
    topUpTargets.forEach((t) => { const h = t.supportId ? hubData.hubOf[t.supportId] : undefined; if (h) groupsByHub[h] = (groupsByHub[h] ?? 0) + 1; });
    return { hubs: hubData.hubs, hubOf: hubData.hubOf, groupsByHub };
  }, [hubData, topUpTargets]);
  const hubNameById = useMemo(() => new Map((hubData?.hubs ?? []).map((h) => [h.id, h.name])), [hubData]);
  const hubOfSupport = (id: string) => hubData?.hubOf[id] ?? null;
  const hubLabelOf = (id: string | null | undefined) => (id ? hubNameById.get(hubOfSupport(id) ?? '') ?? null : null);
  const hubsInOrder = useMemo(() => [...(hubData?.hubs ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [hubData]);
  // Supports shown under their hub (Hub 1, Hub 2, ... in order), people in no hub last. With no hubs loaded,
  // one unnamed list.
  const groupByHub = <T extends { id: string; name: string }>(list: T[]): Array<{ key: string; hub: string | null; items: T[] }> => {
    const out: Array<{ key: string; hub: string | null; items: T[] }> = hubsInOrder
      .map((h) => ({ key: h.id, hub: h.name, items: list.filter((x) => hubOfSupport(x.id) === h.id).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter((g) => g.items.length > 0);
    const rest = list.filter((x) => !hubOfSupport(x.id) || !hubNameById.has(hubOfSupport(x.id) as string)).sort((a, b) => a.name.localeCompare(b.name));
    if (rest.length > 0) out.push({ key: '__none__', hub: out.length > 0 ? 'Not in a hub' : null, items: rest });
    return out;
  };

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

  // What topping up would do right now, for the note on the first step.
  const topUpPreview = useMemo(
    () => (step === 'people'
      ? topUpGroups([...people.values()].filter((p) => !(p.ageRange && ignoredAges.has(p.ageRange))), topUpTargets, effectiveRules, { hubs: hubSpread, reserveGroups: hubGroupsNeeded(hubSpread, supportPool.free) })
      : { groups: [] as DraftGroup[], groupsWithSpace: 0, spots: 0 }),
    [step, people, topUpTargets, effectiveRules, ignoredAges, hubSpread, supportPool.free]
  );
  const topUpPlacedCount = topUpPreview.groups.reduce((sum, g) => sum + g.memberIds.length, 0);

  const readyCount = [...people.values()].filter((p) => p.gender && p.ageRange && !ignoredAges.has(p.ageRange)).length;
  const needsInfo = ungrouped.filter((p) => { const e = people.get(p.id); return !e?.gender || !e?.ageRange; });
  const supportsMissingDetails = supportPool.free.filter((s) => !s.gender || !s.ageRange).length;
  const ageCounts = AGE_RANGE_OPTIONS.map((range) => ({ range, count: [...people.values()].filter((p) => p.ageRange === range).length }));
  const women = [...people.values()].filter((p) => p.gender === 'Female').length;
  const men = [...people.values()].filter((p) => p.gender === 'Male').length;

  const rebuild = (r: GroupingRules = rules) => {
    const ruleSet = { ...r, tagRules: r.tagRules.filter((t) => tagNames[t.tagId]) };
    // Running groups with space are topped up first; whoever is left goes to new groups.
    const top = topUpFirst
      ? topUpGroups([...people.values()].filter((p) => !(p.ageRange && ignoredAges.has(p.ageRange))), topUpTargets, ruleSet, { hubs: hubSpread, reserveGroups: hubGroupsNeeded(hubSpread, supportPool.free) })
      : null;
    const toppedUp = new Set((top?.groups ?? []).flatMap((g) => g.memberIds));
    const result = buildDraft(
      [...people.values()].filter((p) => !toppedUp.has(p.id)), supportPool.free, ruleSet, groups.map((g) => g.name), emptyChoice === 'fill' ? seeds : [],
      { ignoredAgeRanges: [...ignoredAges], tagNames, hubs: hubSpread },
    );
    setDraftInfo({ ignored: result.ignored.length, tagNotes: result.tagNotes });
    resetSupportView();
    setDraft([...(top?.groups ?? []), ...result.groups]);
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
  // One empty group for every support the draft left without one, so people can be moved into them by hand.
  // An empty group is not created unless someone is moved into it.
  const makeGroupsFor = (supportsToUse: typeof supportPool.free, single: boolean) => {
    const unusedSupports = supportsToUse.filter((s) => !usedSupports.has(s.id));
    if (unusedSupports.length === 0) return;
    const names = nextGroupNames([...groups.map((g) => g.name), ...draft.map((g) => g.name)], unusedSupports.length);
    const stamp = Date.now();
    const made = unusedSupports.map((s, i) => ({ key: `manual-${s.id}-${stamp}`, name: names[i], memberIds: [] as string[], supportId: s.id }));
    setDraft((prev) => [...prev, ...made]);
    // The new group sits above this list, so bring it into view.
    window.setTimeout(() => document.getElementById(`draft-group-${made[0].key}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    resetSupportView();
    setDraftNote(single
      ? `Empty group made for ${unusedSupports.map((x) => x.name).join(', ')}. Tap a person, then “Move here” to fill it.`
      : `${unusedSupports.length} empty ${unusedSupports.length === 1 ? 'group' : 'groups'} made, one for each support without a group. Tap a person, then “Move here” to fill them.`);
  };
  const toCreate = draft.filter((g) => g.memberIds.length > 0);
  // Which hubs will have participants once this is created (follows every change to the draft).
  const coverage = useMemo(() => {
    if (!hubSpread) return null;
    const withPeople = draft.filter((g) => g.memberIds.length > 0 && g.supportId);
    const ids = [...topUpTargets.map((t) => t.supportId).filter(Boolean) as string[], ...withPeople.map((g) => g.supportId as string)];
    const groupsWithPeople = topUpTargets.length + draft.filter((g) => g.memberIds.length > 0 && !g.topUp).length;
    // A support with only an empty group is still free to be placed, so only groups with people use one up.
    const used = new Set(draft.filter((g) => g.memberIds.length > 0).map((g) => g.supportId).filter(Boolean) as string[]);
    return hubCoverage(hubSpread, ids, groupsWithPeople, supportPool.free.filter((s) => !used.has(s.id)).map((s) => s.id));
  }, [hubSpread, draft, topUpTargets, supportPool.free]);
  const noSupportCount = toCreate.filter((g) => !g.supportId && !g.topUp).length;
  // Filters on the Draft step: by the gender of a group's people, and by groups still without a support.
  type SupportView = 'all' | 'none' | 'none:Male' | 'none:Female' | 'none:Mixed' | 'gender:Male' | 'gender:Female' | 'gender:Mixed' | 'empty';
  // A "no support" view is a snapshot of the groups it showed when it was picked: a group stays on screen after it gets a
  // support, so working down the list does not make the cards jump (picking a view again, or "All groups", refreshes it).
  // A gender view is live instead: a group follows the people in it, so a group moved to "Mixed or unknown" leaves the view.
  const [supportViewState, setSupportViewState] = useState<{ kind: SupportView; keys: Set<string> } | null>(null);
  const resetSupportView = () => setSupportViewState(null);
  // One gender per group, counting the people already in a group being topped up. A group of both, or of unknown, is "Mixed";
  // a group with nobody in it yet (made by hand for a support) is "Empty".
  const genderByKey = new Map<string, 'Male' | 'Female' | 'Mixed' | 'Empty'>(draft.map((g) => {
    const members = [...(g.existingMemberIds ?? []), ...g.memberIds].map((id) => topUpPeople.get(id)).filter((m): m is EnginePerson => !!m);
    return [g.key, members.length === 0 ? 'Empty' : sharedGender(members) ?? 'Mixed'];
  }));
  const genderOfGroup = (g: DraftGroup) => genderByKey.get(g.key) ?? 'Mixed';
  const noSupportByGender = { Male: 0, Female: 0, Mixed: 0 };
  toCreate.forEach((g) => { const gender = genderOfGroup(g); if (!g.supportId && !g.topUp && gender !== 'Empty') noSupportByGender[gender] += 1; });
  // Every group is in exactly one of these, so Female + Male + Mixed + Empty is the number on "All groups".
  const groupsByGender = { Male: 0, Female: 0, Mixed: 0, Empty: 0 };
  draft.forEach((g) => { groupsByGender[genderOfGroup(g)] += 1; });
  // Groups by hand for a support, with nobody in them yet: they only exist if someone is moved in.
  const emptyWithSupport = draft.filter((g) => !g.topUp && g.supportId && g.memberIds.length === 0).length;
  const matchesView = (view: SupportView, g: DraftGroup) => {
    if (view === 'all') return true;
    if (view === 'empty') return genderOfGroup(g) === 'Empty';
    // A gender view also keeps the empty groups on screen: they are where people get moved to.
    if (view.startsWith('gender:')) return view === `gender:${genderOfGroup(g)}` || genderOfGroup(g) === 'Empty';
    if (g.supportId || g.topUp || g.memberIds.length === 0) return false;
    return view === 'none' || view === `none:${genderOfGroup(g)}`;
  };
  const pickSupportView = (view: SupportView) => {
    setSupportViewState(view === 'all' ? null : { kind: view, keys: new Set(draft.filter((g) => matchesView(view, g)).map((g) => g.key)) });
  };
  // If nothing from the picked view is left in the draft (after a rebuild, say), show everything.
  const liveView = !!supportViewState && (supportViewState.kind.startsWith('gender:') || supportViewState.kind === 'empty');
  const inPickedView = (g: DraftGroup) => (liveView ? matchesView(supportViewState!.kind, g) : supportViewState!.keys.has(g.key));
  // A gender view also keeps the empty groups on screen, so they alone must not keep it active.
  const viewActive = !!supportViewState && draft.some((g) => inPickedView(g) && (supportViewState.kind === 'empty' || genderOfGroup(g) !== 'Empty' || !supportViewState.kind.startsWith('gender:')));
  const activeView: SupportView = viewActive ? supportViewState!.kind : 'all';
  const visibleDraft = viewActive ? draft.filter(inPickedView) : draft;
  const genderKinds = [groupsByGender.Male, groupsByGender.Female, groupsByGender.Mixed].filter((n) => n > 0).length;
  const newCount = toCreate.filter((g) => !g.topUp).length;
  const topUpCount = toCreate.filter((g) => g.topUp).length;
  const createdDone = toCreate.filter((g) => !g.topUp && statuses[g.key] === 'done').length;
  const toppedUpDone = toCreate.filter((g) => g.topUp && statuses[g.key] === 'done').length;
  // "Create 3", "Top up 2", or "Create 3 + top up 2".
  const applyLabel = `${newCount > 0 ? `Create ${newCount}` : ''}${newCount > 0 && topUpCount > 0 ? ' + top up ' : topUpCount > 0 ? 'Top up ' : ''}${topUpCount > 0 ? topUpCount : ''}`;

  // ── Save a draft, and come back to it ──
  const saveDraft = async () => {
    if (planningMode) return; // a planning draft is never saved over the cohort's real draft
    setSavingDraft(true);
    setErr('');
    try {
      await settingsApi.setGroupingDraft(cohortId, {
        savedAt: new Date().toISOString(),
        savedByName: currentUser?.name ?? '',
        groups: draft,
        ignoredAgeRanges: [...ignoredAges],
        // Kept in the saved shape for older drafts; missing training no longer leaves anyone out.
        includeMissedTraining: true,
        includeOperational,
        includeHubLeads,
        emptyChoice,
        onlySignedIn: true,
        topUpFirst,
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
    // Only people who have signed in can be in a restored draft; anyone who hasn't is taken out.
    // A saved draft is always a real one (signed-in people only), so leave planning mode.
    setPlanningMode(false);
    const pool = loginSplit ? loginSplit.signedIn : notGrouped;
    const unsignedIds = new Set((loginSplit?.notSignedIn ?? []).map((p) => p.id));
    const stillUngrouped = new Set(pool.map((p) => p.id));
    const poolPeople = new Map(pool.map((p) => [p.id, toEnginePerson({ id: p.id, name: p.fullName, gender: p.gender, ageRange: p.ageRange })]));
    // The saved draft may have used operational supports: judge it against the pool it was built with.
    const savedWithOperational = saved.includeOperational === true;
    const savedWithHubLeads = saved.includeHubLeads === true;
    setIncludeOperational(savedWithOperational);
    setIncludeHubLeads(savedWithHubLeads);
    const freeIds = new Set((savedWithOperational === includeOperational && savedWithHubLeads === includeHubLeads ? supportPool : buildSupportPool(savedWithOperational, savedWithHubLeads)).free.map((s) => s.id));
    const emptyIds = new Set(emptyGroups.map((g) => g.id));
    const placed = new Set<string>();
    let droppedPeople = 0;
    let droppedNoFit = 0;
    let droppedUnsigned = 0;
    let droppedGone = 0;
    let droppedSupports = 0;
    const restored: DraftGroup[] = saved.groups.map((g) => {
      // A topped-up group must still exist; each addition must still be ungrouped and still fit it.
      const target = g.topUp ? topUpTargets.find((t) => t.id === g.existingGroupId) : undefined;
      if (g.topUp && !target) {
        droppedGone += g.memberIds.length;
        return { ...g, memberIds: [], existingMemberIds: [], existingGroupId: undefined };
      }
      const current = target ? [...target.members] : [];
      const memberIds = g.memberIds.filter((id) => {
        if (unsignedIds.has(id)) { droppedUnsigned += 1; return false; }
        if (!stillUngrouped.has(id) || placed.has(id)) { droppedPeople += 1; return false; }
        if (target) {
          const person = poolPeople.get(id);
          if (!person || !fitsGroup(person, current, target.support, effectiveRules)) { droppedNoFit += 1; return false; }
          current.push(person);
        }
        placed.add(id);
        return true;
      });
      if (g.topUp && target) {
        return { ...g, memberIds, existingMemberIds: target.members.map((m) => m.id), supportId: target.supportId, existingGroupId: g.existingGroupId };
      }
      const seedSupport = g.existingGroupId ? seeds.find((x) => x.id === g.existingGroupId)?.support?.id : undefined;
      const supportOk = !g.supportId || freeIds.has(g.supportId) || g.supportId === seedSupport;
      if (!supportOk) droppedSupports += 1;
      const existing = g.existingGroupId && emptyIds.has(g.existingGroupId) ? g.existingGroupId : undefined;
      return { ...g, memberIds, supportId: supportOk ? g.supportId : null, existingGroupId: existing };
    });
    setIgnoredAges(new Set(saved.ignoredAgeRanges));
    setEmptyChoice(saved.emptyChoice);
    setTopUpFirst(saved.topUpFirst === true);
    resetSupportView();
    setDraft(restored);
    setLeftOut(pool.filter((p) => !placed.has(p.id)).map((p) => p.id));
    setPicked(null);
    setDraftNote([
      droppedPeople > 0 ? `${droppedPeople} ${droppedPeople === 1 ? 'person was' : 'people were'} grouped since you saved and ${droppedPeople === 1 ? 'was' : 'were'} taken out.` : '',
      droppedUnsigned > 0 ? `${droppedUnsigned} ${droppedUnsigned === 1 ? 'person has' : 'people have'} not signed in yet and ${droppedUnsigned === 1 ? 'was' : 'were'} taken out.` : '',
      droppedNoFit > 0 ? `${droppedNoFit} ${droppedNoFit === 1 ? 'person no longer fits' : 'people no longer fit'} the group they were added to (it has filled up or changed) and ${droppedNoFit === 1 ? 'was' : 'were'} taken out.` : '',
      droppedGone > 0 ? `${droppedGone} ${droppedGone === 1 ? 'person was' : 'people were'} to be added to a group that is gone and ${droppedGone === 1 ? 'was' : 'were'} taken out.` : '',
      droppedSupports > 0 ? `${droppedSupports} ${droppedSupports === 1 ? 'support is' : 'supports are'} no longer free and ${droppedSupports === 1 ? 'was' : 'were'} removed from their group.` : '',
    ].filter(Boolean).join(' '));
    setSaved(null);
    setStep('draft');
  };

  // ── Create ──
  const create = async () => {
    if (planningMode) { setErr('This is a planning draft: it includes people who have not signed in, so it cannot be created.'); return; }
    // Whatever the mode, only people whose sign-in is confirmed are ever put into a new group.
    const unsignedInDraft = toCreate.some((g) => g.memberIds.some((id) => !signedInIds?.has(id)));
    if (!signedInIds || unsignedInDraft) { setErr('Someone in this draft has not signed in, so groups were not created. Rebuild the draft with Planning only off.'); return; }
    setCreating(true);
    setErr('');
    for (const g of toCreate) {
      if (statuses[g.key] === 'done') continue; // retry only the ones that failed
      setStatuses((prev) => ({ ...prev, [g.key]: 'creating' }));
      setFailReasons((prev) => ({ ...prev, [g.key]: '' }));
      try {
        let groupId = g.existingGroupId;
        if (groupId) {
          // An empty group made first: keep it, add its support if the builder picked one.
          const before = groups.find((x) => x.id === groupId);
          // A topped-up group keeps the support it has; only an empty group made first gets one set.
          if (!g.topUp && (before?.supportId ?? null) !== g.supportId) await groupsApi.update(groupId, { supportId: g.supportId });
        } else {
          // reuseEmpty: if a first try made this group but stopped before adding people, finish it.
          ({ group: { id: groupId } } = await groupsApi.create({ cohortId, name: g.name, supportId: g.supportId }, { reuseEmpty: true }));
        }
        createdAny.current = true;
        await groupsApi.bulkAssign(g.memberIds.map((participantId) => ({ participantId, groupId: groupId! })));
        setStatuses((prev) => ({ ...prev, [g.key]: 'done' }));
      } catch (e: any) {
        setFailReasons((prev) => ({ ...prev, [g.key]: e?.message ? String(e.message) : '' }));
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
    if (step === 'people') return (<><button type="button" onClick={close} className={quiet}>Cancel</button><button type="button" disabled={loading || (!planningMode && !signedInIds) || !hubsReady || readyCount === 0 || (emptyGroups.length > 0 && !emptyChoice)} onClick={() => setStep('rules')} className={primary}>Next: rules</button></>);
    if (step === 'rules') return (<><button type="button" onClick={() => setStep('people')} className={quiet}>Back</button><button type="button" disabled={savingRules} onClick={() => void saveRulesAndBuild()} className={primary}>{savingRules ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span> : 'Save rules & build'}</button></>);
    if (step === 'draft') return (<><button type="button" onClick={() => setStep('rules')} className={quiet}>Back</button><button type="button" onClick={() => rebuild()} className={quiet}>Rebuild</button>{!planningMode && <button type="button" disabled={savingDraft} onClick={() => void saveDraft()} className={quiet}>{savingDraft ? 'Saving…' : 'Save draft'}</button>}<button type="button" disabled={toCreate.length === 0 || planningMode} onClick={() => setStep('create')} className={primary}>{planningMode ? 'Planning only' : applyLabel}</button></>);
    if (allDone) return <button type="button" onClick={close} className={primary}>View groups</button>;
    return (<><button type="button" disabled={creating || doneCount > 0} onClick={() => setStep('draft')} className={quiet}>Back</button><button type="button" disabled={creating || savingDraft || doneCount > 0} onClick={() => void saveDraft()} className={quiet}>{savingDraft ? 'Saving…' : 'Save draft'}</button><button type="button" disabled={creating} onClick={() => void create()} className={primary}>{creating ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Creating…</span> : failedCount > 0 ? 'Retry failed' : applyLabel}</button></>);
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
                    <button type="button" onClick={continueDraft} disabled={!signedInIds || !hubsReady} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-50">Continue draft</button>
                  </div>
                </div>
              )}
              <div className={`${SURFACE} flex items-center justify-between gap-3 p-4`}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    Only people who have signed in
                    {planningMode
                      ? <span className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Planning only</span>
                      : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">Required</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {planningMode
                      ? `Everyone waiting for a group is included${notSignedInCount > 0 ? `, ${notSignedInCount} of them not signed in yet` : ''}. Use this to forecast the groups and supports you will need. It is only for looking at: it can't be saved or turned into groups.`
                    : signedInFailed
                      ? "Couldn't check who has signed in, so groups can't be built yet."
                      : !signedInIds
                        ? 'Checking who has signed in…'
                        : notSignedInCount > 0
                          ? `${notSignedInCount} ${notSignedInCount === 1 ? 'person has' : 'people have'} not signed in yet and ${notSignedInCount === 1 ? 'is' : 'are'} left out (login not set up, or switched off). They stay ungrouped and can be grouped in a later build once they sign in.`
                          : 'Everyone waiting for a group has signed in.'}
                  </p>
                  {signedInFailed && (
                    <button type="button" onClick={loadSignedIn} className="mt-1 text-xs font-semibold text-primary underline underline-offset-2">Try again</button>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={planningMode}
                  aria-label="Planning only: include people who have not signed in"
                  onClick={() => { setPlanningMode((v) => !v); setDraft([]); resetSupportView(); }}
                  className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition ${planningMode ? 'bg-primary' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${planningMode ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              {(hubsFailed || noHubs || notInHubCount > 0) && (
                <div className={`${SURFACE} flex items-center justify-between gap-3 p-4`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      Supports come from every hub
                      {(hubsFailed || noHubs) && <span className="rounded-full bg-red-100/80 px-2 py-0.5 text-[11px] font-semibold text-red-700">Needed</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {hubsFailed
                        ? "Couldn't load the hubs, so groups can't be built yet."
                        : noHubs
                          ? 'No hub has anyone in it yet. Create the hubs and add the supports to them first, so each hub gets people to prepare for.'
                          : `${notInHubCount} ${notInHubCount === 1 ? 'support is' : 'supports are'} not in a hub, so ${notInHubCount === 1 ? 'is' : 'are'} not used. Add them to a hub to use them (listed under “Supports the engine won't use”).`}
                    </p>
                    <div className="mt-1 flex gap-3">
                      {hubsFailed && <button type="button" onClick={loadHubs} className="text-xs font-semibold text-primary underline underline-offset-2">Try again</button>}
                      {!hubsFailed && <button type="button" onClick={() => { close(); navigate('/hubs'); }} className="text-xs font-semibold text-primary underline underline-offset-2">{noHubs ? 'Create hubs' : 'Open Hubs'}</button>}
                    </div>
                  </div>
                </div>
              )}
              <div className={`${SURFACE} flex items-center justify-between gap-3 p-4`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Top up groups that have space first</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {topUpPreview.groupsWithSpace === 0
                      ? 'No group to top up (none has space). New groups will be made with new supports.'
                      : !topUpFirst
                        ? `${topUpPreview.groupsWithSpace} ${topUpPreview.groupsWithSpace === 1 ? 'group has' : 'groups have'} space. Off: everyone goes into new groups.`
                        : topUpPlacedCount === 0
                          ? `${topUpPreview.groupsWithSpace} ${topUpPreview.groupsWithSpace === 1 ? 'group has' : 'groups have'} space, but nobody waiting fits their rules (gender, age). New groups will be made with new supports.`
                          : `${topUpPreview.groupsWithSpace} ${topUpPreview.groupsWithSpace === 1 ? 'group has' : 'groups have'} space (${topUpPreview.spots} ${topUpPreview.spots === 1 ? 'spot' : 'spots'}). ${topUpPlacedCount} of the ${readyCount} waiting go there first; the rest get new groups with new supports.`}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={topUpFirst}
                  aria-label="Top up groups that have space first"
                  disabled={topUpPreview.groupsWithSpace === 0}
                  onClick={() => setTopUpFirst((v) => !v)}
                  className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition disabled:opacity-50 ${topUpFirst && topUpPreview.groupsWithSpace > 0 ? 'bg-primary' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${topUpFirst && topUpPreview.groupsWithSpace > 0 ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile value={readyCount} label="Ready to group" />
                <StatTile value={needsInfo.length} label="Need gender/age" tone="amber" />
                <StatTile value={supportPool.free.length} label="Supports free" />
                <StatTile value={supportsMissingDetails} label="Supports missing details" tone="amber" />
              </div>
              {ungrouped.length === 0 ? (
                <div className={`${SURFACE} px-5 py-10 text-center text-sm text-gray-500`}>{notGrouped.length > 0 ? 'Nobody who has signed in is waiting for a group. Turn on Planning only above to see the rest in a draft (view only).' : 'Everyone in this cohort is already in a group.'}</div>
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
                    {groupByHub(supportPool.free).map((hubGroup) => (
                      <div key={hubGroup.key} className="flex flex-col gap-1">
                        {hubGroup.hub && <p className="mt-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 first:mt-0">{hubGroup.hub} · {hubGroup.items.length} {hubGroup.items.length === 1 ? 'support' : 'supports'}</p>}
                      {hubGroup.items.map((sup) => {
                        const user = supportUsers.find((u) => u.id === sup.id);
                        return (
                          <div key={sup.id}>
                          <div className="flex items-center gap-2.5 px-1 py-1">
                            <Avatar name={sup.name} avatarUrl={user?.avatarUrl} size="xs" />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-gray-800">{sup.name}{(sup.tagIds ?? []).length > 0 && <span className="ml-1.5 text-[11px] font-semibold text-violet-700">{(sup.tagIds ?? []).map((id) => tagNames[id]).filter(Boolean).join(', ')}</span>}{supportPool.hubLeads.has(sup.id) && <span className="ml-1.5 rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Hub lead</span>}{supportPool.operational.has(sup.id) && <span className="ml-1.5 rounded-full bg-teal-100/80 px-2 py-0.5 text-[10px] font-semibold text-teal-700">Operational</span>}{supportPool.missedTraining.has(sup.id) && <span className="ml-1.5 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Trainings {sup.trainingsAttended}/{trainingsTotal}</span>}</span>
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
                    ))}
                  </div>
                </details>
              )}
              {supportPool.operational.size > 0 && (
                <div className={`${SURFACE} flex items-center justify-between gap-3 p-4`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Also use operational supports</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {includeOperational
                        ? `${supportPool.operational.size} operational ${supportPool.operational.size === 1 ? 'support is' : 'supports are'} added to the engine, in their hub. They show “Operational” on the draft.`
                        : `${supportPool.operational.size} operational ${supportPool.operational.size === 1 ? 'support is' : 'supports are'} left out. Switch on to let them lead a group too.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeOperational}
                    aria-label="Also use operational supports"
                    onClick={() => setIncludeOperational((v) => !v)}
                    className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition ${includeOperational ? 'bg-primary' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${includeOperational ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
              )}
              {supportPool.hubLeads.size > 0 && (
                <div className={`${SURFACE} flex items-center justify-between gap-3 p-4`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Also use hub leads</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {includeHubLeads
                        ? `${supportPool.hubLeads.size} hub ${supportPool.hubLeads.size === 1 ? 'lead is' : 'leads are'} added to the engine, in their hub. They show “Hub lead” on the draft. Turn this on only if you need them.`
                        : `${supportPool.hubLeads.size} hub ${supportPool.hubLeads.size === 1 ? 'lead is' : 'leads are'} left out. Switch on to let them lead a group too, if need be.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeHubLeads}
                    aria-label="Also use hub leads"
                    onClick={() => setIncludeHubLeads((v) => !v)}
                    className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition ${includeHubLeads ? 'bg-primary' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${includeHubLeads ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>
              )}
              {supportPool.missedTraining.size > 0 && (
                <div className={`${SURFACE} p-4`}>
                  <p className="text-sm font-semibold text-gray-900">Missed pre-cohort training ({supportPool.missedTraining.size})</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {supportPool.missedTraining.size === 1 ? 'This support is' : 'These supports are'} still used. They show a “Trainings” tag in the list and “Missed training” on their group, so you can see it and swap them if you want.
                  </p>
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
                {/* Own sizes for all-male and all-female groups. */}
                {(['Male', 'Female'] as const).map((gender) => {
                  const own = rules.genderSizes[gender];
                  const sizes = own ?? { minSize: rules.minSize, targetSize: rules.targetSize, maxSize: rules.maxSize };
                  const setGender = (next: Partial<typeof sizes>) => setRules((p) => {
                    const cur = p.genderSizes[gender] ?? { minSize: p.minSize, targetSize: p.targetSize, maxSize: p.maxSize };
                    const merged = { ...cur, ...next };
                    merged.maxSize = Math.max(merged.minSize, merged.maxSize);
                    merged.targetSize = Math.min(merged.maxSize, Math.max(merged.minSize, merged.targetSize));
                    return { ...p, genderSizes: { ...p.genderSizes, [gender]: merged } };
                  });
                  return (
                    <div key={gender} className="mt-3 border-t border-gray-100 pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-700">{gender} groups{own ? '' : ' (same as above)'}</p>
                        {own
                          ? <button type="button" onClick={() => setRules((p) => ({ ...p, genderSizes: { ...p.genderSizes, [gender]: null } }))} className="text-[11px] font-semibold text-primary">Use the sizes above</button>
                          : <button type="button" onClick={() => setGender({})} className="text-[11px] font-semibold text-primary">Set own sizes</button>}
                      </div>
                      {own && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <Stepper label="Smallest" value={sizes.minSize} min={1} max={sizes.maxSize} onChange={(v) => setGender({ minSize: v })} />
                          <Stepper label="Aim" value={sizes.targetSize} min={sizes.minSize} max={sizes.maxSize} onChange={(v) => setGender({ targetSize: v })} />
                          <Stepper label="Largest" value={sizes.maxSize} min={sizes.minSize} max={50} onChange={(v) => setGender({ maxSize: v })} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {rules.genderMix !== 'SAME' && (rules.genderSizes.Male || rules.genderSizes.Female) && (
                  <p className="mt-2 text-[11px] text-gray-400">Own sizes apply to groups of one gender only. With mixed groups the sizes above are used.</p>
                )}
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
                  <div className="mt-4 rounded-2xl bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">Match the group's own age</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">For groups made mostly of people in these ranges, prefer a support from the same range, or the nearest one free, ahead of the order above. Leave all off to always follow the order above.</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {AGE_RANGE_OPTIONS.map((range) => {
                        const on = rules.ageMatchRanges.includes(range);
                        return (
                          <button key={range} type="button" aria-pressed={on} onClick={() => set('ageMatchRanges', on ? rules.ageMatchRanges.filter((r) => r !== range) : [...rules.ageMatchRanges, range])} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${on ? 'bg-violet-100/80 text-violet-700' : 'bg-white text-gray-600 shadow-[0_1px_2px_rgba(17,24,39,0.10)]'}`}>
                            {range}
                          </button>
                        );
                      })}
                    </div>
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
                {newCount} new {newCount === 1 ? 'group' : 'groups'}{topUpCount > 0 && <> · {topUpCount} topped up</>} · {toCreate.reduce((n, g) => n + g.memberIds.length, 0)} people
                {noSupportCount > 0 && <> · <span className="font-semibold text-red-700">{noSupportCount} without a support</span></>}
                {emptyWithSupport > 0 && <> · <span className="font-semibold text-amber-700">{emptyWithSupport} empty {emptyWithSupport === 1 ? 'group is' : 'groups are'} not created yet</span></>}
                {' · '}Tap a person, then “Move here” on another group.
              </p>
              {(draft.length > 0 && (genderKinds > 1 || noSupportCount > 0 || viewActive)) && (
                <div className="flex flex-col gap-2" role="group" aria-label="Filter the groups">
                  {noSupportCount > 0 && (
                    <p className="text-[12px] font-semibold text-gray-700">
                      Groups without a support: {([['Male', 'male'], ['Female', 'female'], ['Mixed', 'mixed or unknown']] as const).filter(([k]) => noSupportByGender[k] > 0).map(([k, label]) => `${noSupportByGender[k]} ${label}`).join(' · ')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ['all', 'All groups', draft.length],
                      ['gender:Female', 'Female groups', groupsByGender.Female],
                      ['gender:Male', 'Male groups', groupsByGender.Male],
                      ['gender:Mixed', 'Mixed or unknown groups', groupsByGender.Mixed],
                      ['empty', 'Empty groups', groupsByGender.Empty],
                      ['none', 'No support', noSupportCount],
                      ['none:Male', 'Male, no support', noSupportByGender.Male],
                      ['none:Female', 'Female, no support', noSupportByGender.Female],
                      ['none:Mixed', 'Mixed or unknown, no support', noSupportByGender.Mixed],
                    ] as const).filter(([value, , count]) => value === 'all' || value === activeView || (value.startsWith('gender:') ? genderKinds > 1 && count > 0 : count > 0)).map(([value, label, count]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={activeView === value}
                        onClick={() => pickSupportView(value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${activeView === value ? 'bg-primary text-white shadow-sm' : 'border border-gray-100 bg-white text-gray-600 hover:bg-gray-50'}`}
                      >
                        {label} <span className={activeView === value ? 'opacity-90' : 'text-gray-400'}>{count}</span>
                      </button>
                    ))}
                  </div>
                  {viewActive && <p className="text-[11px] text-gray-500">Showing {visibleDraft.length} of {draft.length} groups{activeView.startsWith('gender:') && groupsByGender.Empty > 0 ? ' (empty groups always show)' : ''}. Groups outside this filter are hidden, so to move someone into one of them pick “All groups”.</p>}
                </div>
              )}
              {planningMode && (
                <div className="rounded-2xl bg-amber-100/80 px-3 py-2 text-[12px] text-amber-800">
                  <p className="font-semibold">Planning draft</p>
                  <p className="mt-0.5">Includes people who have not signed in, so these groups are for forecasting and planning only. It can’t be saved or created. To make real groups, switch “Planning only” off on the People step and build again.</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShareOpen((v) => !v)}
                  aria-expanded={shareOpen}
                  className="min-h-[40px] rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50 active:scale-95"
                >
                  {shareOpen ? 'Hide text for WhatsApp' : 'Text for WhatsApp'}
                </button>
              </div>
              {shareOpen && (
                <div className={`${SURFACE} flex flex-col gap-3 p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">Include participant names</p>
                      <p className="text-xs text-gray-500">{shareNames ? 'Each participant is listed with their age range.' : 'Only age ranges, with how many in each. No names.'} Phone numbers are never included.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={shareNames}
                      aria-label="Include participant names"
                      onClick={() => { setShareNames((v) => !v); setShareCopied(false); }}
                      className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition ${shareNames ? 'bg-primary' : 'bg-slate-200'}`}
                    >
                      <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${shareNames ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={whatsAppText || 'Nothing to share yet.'}
                    rows={Math.min(14, Math.max(4, whatsAppText.split('\n').length))}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Text for WhatsApp"
                    className="w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-gray-800 focus:border-primary focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button type="button" onClick={() => void copyWhatsAppText()} disabled={!whatsAppText} className="min-h-[44px] rounded-2xl bg-primary px-5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50">
                      {shareCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
              {coverage && coverage.total > 0 && (
                <div className={`rounded-2xl px-3 py-2 text-[12px] ${coverage.covered >= coverage.need ? 'bg-emerald-100/80 text-emerald-700' : 'bg-amber-100/80 text-amber-700'}`}>
                  <p className="font-semibold">Hubs with participants: {coverage.covered} of {coverage.total} (aim: at least {coverage.need})</p>
                  {coverage.covered < coverage.need && coverage.reason && <p className="mt-0.5">{coverage.reason}</p>}
                  {coverage.without.length > 0 && <p className="mt-0.5 opacity-80">Without participants: {coverage.without.join(', ')}</p>}
                </div>
              )}
              {(draftInfo.ignored > 0 || draftInfo.tagNotes.length > 0) && (
                <div className="flex flex-col gap-1 rounded-2xl bg-amber-100/80 px-3 py-2 text-[12px] text-amber-700">
                  {draftInfo.ignored > 0 && <p>{draftInfo.ignored} {draftInfo.ignored === 1 ? 'person' : 'people'} left out ({[...ignoredAges].join(', ')}), as you chose for this build.</p>}
                  {draftInfo.tagNotes.map((note) => <p key={note}>{note}</p>)}
                </div>
              )}
              {draftNote && <p className="rounded-2xl bg-sky-100/80 px-3 py-2 text-[12px] font-semibold text-sky-700">{draftNote}</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleDraft.map((g) => {
                  // A topped-up group is judged as it will be: the people already there plus those being added.
                  const notes = g.topUp
                    ? evaluateGroup({ ...g, memberIds: [...(g.existingMemberIds ?? []), ...g.memberIds] }, topUpPeople, supportById, effectiveRules, tagNames)
                    : evaluateGroup(g, people, supportById, effectiveRules, tagNames);
                  const options = [
                    { value: '', label: 'No support' },
                    ...groupByHub(supportPool.free.filter((s) => s.id === g.supportId || !usedSupports.has(s.id)))
                      .flatMap((hubGroup) => hubGroup.items.map((s) => ({ ...s, hubLabel: hubGroup.hub })))
                      .map((s) => ({ value: s.id, label: s.name, group: s.hubLabel ?? undefined, meta: [supportPool.operational.has(s.id) ? 'Operational' : null, supportPool.hubLeads.has(s.id) ? 'Hub lead' : null, s.gender, s.ageRange ? shortAge(s.ageRange) : null, trainingsTotal ? `${s.trainingsAttended}/${trainingsTotal} trainings` : null, ...(s.tagIds ?? []).map((id) => tagNames[id]).filter(Boolean)].filter(Boolean).join(' · ') || 'Details missing' })),
                  ];
                  return (
                    <div key={g.key} id={`draft-group-${g.key}`} className={`${SURFACE} flex flex-col gap-2.5 p-4`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex min-w-0 flex-wrap items-center gap-1.5 font-bold text-gray-900">
                          {g.name}
                          {g.topUp
                            ? <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Top-up</span>
                            : g.existingGroupId && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">Your group</span>}
                          {groupTagName(g.memberIds) && <span className="rounded-full bg-violet-100/80 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{groupTagName(g.memberIds)}</span>}
                          {g.supportId && kinds[g.supportId] === 'HUB_LEAD' && <span className="rounded-full bg-violet-100/80 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Hub lead</span>}
                          {g.supportId && kinds[g.supportId] === 'OPERATIONAL' && <span className="rounded-full bg-teal-100/80 px-2 py-0.5 text-[11px] font-semibold text-teal-700">Operational</span>}
                          {hubLabelOf(g.supportId) && <span className="rounded-full bg-sky-100/80 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{hubLabelOf(g.supportId)}</span>}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {moveHere(g.key, g.memberIds)}
                          {g.key.startsWith('manual-') && g.memberIds.length === 0 && (
                            <button type="button" onClick={() => setDraft((prev) => prev.filter((x) => x.key !== g.key))} className="min-h-[32px] rounded-full border border-gray-200 px-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 active:scale-95" aria-label={`Remove empty ${g.name}`}>Remove</button>
                          )}
                          <span className="rounded-full bg-sky-100/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">{g.topUp ? `+${g.memberIds.length}` : g.memberIds.length}</span>
                        </div>
                      </div>
                      {g.topUp ? (
                        <p className="rounded-xl bg-gray-50 px-3 py-2 text-[13px] text-gray-700">
                          {g.supportId ? <>Support: <b>{supportById.get(g.supportId)?.name ?? groups.find((x) => x.id === g.existingGroupId)?.supportName ?? 'on this group'}</b> (stays). </> : 'No support yet. '}
                          {g.existingMemberIds?.length ?? 0} now, {(g.existingMemberIds?.length ?? 0) + g.memberIds.length} after.
                        </p>
                      ) : g.existingGroupId && seeds.find((x) => x.id === g.existingGroupId)?.support ? (
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
                        {g.memberIds.length === 0 ? <p className="px-2 py-2 text-xs text-gray-400">{g.topUp ? 'Nobody added — this group stays as it is.' : "Empty — won't be created unless someone is moved in."}</p> : g.memberIds.map(personRow)}
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
                    <div className="flex items-center justify-between gap-2">
                      <p className={SECTION_LABEL}>Supports without a group ({unused.length})</p>
                      {unused.length > 0 && (
                        <button type="button" onClick={() => makeGroupsFor(supportPool.free, false)} className="min-h-[36px] flex-none rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 active:scale-95">
                          Make a group for each
                        </button>
                      )}
                    </div>
                    {unused.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">
                        Every available support has a group.
                        {emptyWithSupport > 0 && <> {emptyWithSupport === 1 ? 'One is' : `${emptyWithSupport} are`} still empty, and an empty group is only created if someone is moved into it.</>}
                      </p>
                    ) : (
                      <>
                        {groupByHub(unused).map((hubGroup) => (
                        <div key={hubGroup.key} className="mt-2">
                          {hubGroup.hub && <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{hubGroup.hub} · {hubGroup.items.length}</p>}
                          <div className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
                            {hubGroup.items.map((s) => (
                              <div key={s.id} className="flex items-center gap-2.5 rounded-2xl px-2 py-1.5">
                                <Avatar name={s.name} avatarUrl={supportUsers.find((u) => u.id === s.id)?.avatarUrl} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-gray-900"><span className="truncate">{s.name}</span>{supportPool.hubLeads.has(s.id) && <span className="rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Hub lead</span>}{supportPool.operational.has(s.id) && <span className="rounded-full bg-teal-100/80 px-2 py-0.5 text-[10px] font-semibold text-teal-700">Operational</span>}<InfoTip label={`Why ${s.name} has no group`}>{unusedSupportHint(s, effectiveRules, tagNames)}</InfoTip></p>
                                  <p className="truncate text-[11px] text-gray-500">{[s.gender, s.ageRange ? shortAge(s.ageRange) : null, ...(s.tagIds ?? []).map((id) => tagNames[id]).filter(Boolean)].filter(Boolean).join(' · ') || 'Details missing'}</p>
                                </div>
                                <button type="button" onClick={() => makeGroupsFor([s], true)} className="min-h-[32px] flex-none rounded-full border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 active:scale-95" aria-label={`Make a group for ${s.name}`}>Make a group</button>
                              </div>
                            ))}
                          </div>
                        </div>
                        ))}
                        <p className="mt-2 text-[11px] text-gray-400">Available to the engine but not given a group in this draft. Tap ⓘ for the reason, or pick one on any group above to use them.</p>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {allDone && <p className="rounded-2xl bg-emerald-100/80 px-4 py-3 text-sm font-semibold text-emerald-700">{createdDone > 0 ? `${createdDone} ${createdDone === 1 ? 'group' : 'groups'} created. ` : ''}{toppedUpDone > 0 ? `${toppedUpDone} topped up. ` : ''}Supports can set their meeting time from their hub.</p>}
              {failedCount > 0 && !creating && <p className="rounded-2xl bg-red-100/80 px-4 py-3 text-sm text-red-700">{failedCount} didn't go through. The rest are saved — tap “Retry failed”.</p>}
              <div className={`${SURFACE} divide-y divide-gray-100`}>
                {toCreate.map((g) => {
                  const s = statuses[g.key] ?? 'waiting';
                  const support = g.supportId ? supportById.get(g.supportId) : null;
                  return (
                    <div key={g.key} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">{g.name} <span className="font-normal text-gray-500">· {g.topUp ? `adding ${g.memberIds.length} (top-up)` : `${g.memberIds.length} people`}</span>{groupTagName(g.memberIds) && <span className="ml-1.5 rounded-full bg-violet-100/80 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{groupTagName(g.memberIds)}</span>}</p>
                        <p className="truncate text-xs text-gray-500">{support ? support.name : 'No support'}</p>
                        {s === 'failed' && failReasons[g.key] && <p className="mt-0.5 text-xs text-red-700">{failReasons[g.key]}</p>}
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
