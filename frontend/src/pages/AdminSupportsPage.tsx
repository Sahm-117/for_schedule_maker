import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import SegmentedTabs from '../components/SegmentedTabs';
import SupportTrainingsPanel from '../components/supports/SupportTrainingsPanel';
import TrainingPill from '../components/supports/TrainingPill';
import {
  buildWeekStats,
  cohortMode,
  currentWeekNumber,
  judgedWeekNumbers,
  type CohortHealthPayload,
} from '../components/dashboard/healthModel';
import Spinner from '../components/Spinner';
import InfoTip from '../components/InfoTip';
import Avatar from '../components/Avatar';
import LoadRing from '../components/LoadRing';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { cohortsApi, followUpContactsApi, participantNotesApi, participantOnboardingStatusApi, settingsApi, supportHubsApi, supportKindApi, supportNotesApi, supportSessionsApi, usersApi } from '../services/api';
import type { HubMembership, ParticipantNote, ParticipantOnboardingStatus, SupportHub, SupportKind, SupportNote, SupportSession, User } from '../types';
import AppSelect from '../components/AppSelect';
import AppOverflowMenu from '../components/AppOverflowMenu';
import SupportsExportPopup from '../components/supports/SupportsExportPopup';
import { PERSON_OF_INTEREST_INFO } from '../components/hubs/hubJobs';
import { useToast } from '../components/Toast';
import { buildWhatsAppLink } from '../utils/phone';
import { activeDot, activeStatus, genderAgeLine, isSupportProfileComplete } from '../utils/people';
import { openLoadByOwner } from '../utils/followUps';
import HubAuthorProfileModal from '../components/HubAuthorProfileModal';
import {
  PERSON_HEALTH_LABEL,
  buildTrainingCounts,
  evaluateSupports,
  trainingCountFor,
  type CohortPeoplePayload,
  type PersonHealth,
  type ProgrammeRules,
  type SupportEvaluation,
} from '../utils/programmeRules';

// Supports are judged by their group meeting records and onboarding progress.

const HEALTH_PILL: Record<PersonHealth, string> = {
  good: 'bg-emerald-100/80 text-emerald-700',
  warning: 'bg-amber-100/80 text-amber-700',
  critical: 'bg-red-100/80 text-red-700',
};
const SEVERITY: Record<PersonHealth, number> = { critical: 0, warning: 1, good: 2 };

const KIND_OPTIONS: Array<{ value: SupportKind; label: string }> = [
  { value: 'PARTICIPANT_SUPPORT', label: 'Participant support' },
  { value: 'HUB_LEAD', label: 'Hub lead' },
  { value: 'OPERATIONAL', label: 'Operational support' },
];
const KIND_LABEL: Record<SupportKind, string> = {
  PARTICIPANT_SUPPORT: 'Participant support',
  HUB_LEAD: 'Hub lead',
  OPERATIONAL: 'Operational support',
};
// Participant support is the default/common case — kept quiet (no pill).
const KIND_PILL: Partial<Record<SupportKind, string>> = {
  HUB_LEAD: 'bg-violet-100/80 text-violet-700',
  OPERATIONAL: 'bg-sky-100/80 text-sky-700',
};

type Filter = 'all' | PersonHealth;

const AdminSupportsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { activeCohort, liveRevision } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();

  const [health, setHealth] = useState<CohortHealthPayload | null>(null);
  const [people, setPeople] = useState<CohortPeoplePayload | null>(null);
  const [rules, setRules] = useState<ProgrammeRules | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // Supports switched on for this cohort in Cohorts → members; only they are listed.
  const [cohortMemberIds, setCohortMemberIds] = useState<Set<string>>(new Set());
  // The weekly meeting reports supports write in Meeting Mode. They are stored as
  // MEETING notes keyed by group and week, so they are fetched separately.
  const [reports, setReports] = useState<ParticipantNote[]>([]);
  const [hubs, setHubs] = useState<SupportHub[]>([]);
  const [memberships, setMemberships] = useState<HubMembership[]>([]);
  const [trainingSessions, setTrainingSessions] = useState<SupportSession[]>([]);
  const [trainingAttendance, setTrainingAttendance] = useState<Array<{ sessionId: string; userId: string; status: string; learned?: string | null; willApply?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // A support's kind for this cohort (missing entry = PARTICIPANT_SUPPORT, the default).
  const [kinds, setKinds] = useState<Record<string, SupportKind>>({});
  const [savingKindIds, setSavingKindIds] = useState<Set<string>>(new Set());
  const toast = useToast();

  const filterParam = searchParams.get('health');
  const filter: Filter = filterParam === 'critical' || filterParam === 'warning' || filterParam === 'good' ? filterParam : 'all';
  const hubFilter = searchParams.get('hub') ?? '';
  const notesOnly = searchParams.get('notes') === '1';
  const incompleteOnly = searchParams.get('profile') === 'incomplete';
  const kindParam = searchParams.get('kind');
  const kindFilter: SupportKind | '' = kindParam === 'PARTICIPANT_SUPPORT' || kindParam === 'HUB_LEAD' || kindParam === 'OPERATIONAL' ? kindParam : '';
  const [exportOpen, setExportOpen] = useState(false);
  const pageTab = searchParams.get('tab') === 'trainings' ? 'trainings' : 'supports';
  const [search, setSearch] = useState('');
  // Supports with a note about them — they get a ★ and the "With notes" filter.
  const [notedIds, setNotedIds] = useState<Set<string>>(new Set());
  // Open follow-ups each support holds (load ring against the Settings max).
  const [followUpLoad, setFollowUpLoad] = useState<Map<string, number>>(new Map());
  // Last app use per support (admin-only RPC). Missing entries simply hide the line.
  const [lastSeenById, setLastSeenById] = useState<Record<string, string>>({});
  // Onboarding stage roll-up per group (one extra cohort fetch; missing data falls back to the sentence).
  const [stagesByGroup, setStagesByGroup] = useState<Record<string, StageSummary>>({});

  const load = useCallback(async () => {
    if (!activeCohort?.id) { setLoading(false); return; }
    try {
      setError('');
      const [h, p, r, u, hb, ms, ts, k, cm, ob] = await Promise.all([
        cohortsApi.getHealth(activeCohort.id),
        cohortsApi.getPeople(activeCohort.id),
        settingsApi.getProgrammeRules(),
        usersApi.getAll().then((res) => res.users).catch(() => [] as User[]),
        supportHubsApi.getAll(activeCohort.id).then((res) => res.hubs).catch(() => [] as SupportHub[]),
        supportHubsApi.getMembershipsForCohort(activeCohort.id).then((res) => res.memberships).catch(() => [] as HubMembership[]),
        supportSessionsApi.getForCohort(activeCohort.id, ['PRE_COHORT_TRAINING']).catch(() => ({ sessions: [] as SupportSession[], attendance: [] as Array<{ sessionId: string; userId: string; status: string }> })),
        supportKindApi.getForCohort(activeCohort.id).then((res) => res.kinds).catch(() => ({} as Record<string, SupportKind>)),
        cohortsApi.getMembers(activeCohort.id).then((res) => res.users.map((x) => x.id)).catch(() => [] as string[]),
        participantOnboardingStatusApi.getForCohort(activeCohort.id).then((res) => res.statuses).catch(() => [] as ParticipantOnboardingStatus[]),
      ]);
      setHealth(h);
      setPeople(p);
      setRules(r);
      setUsers(u);
      setCohortMemberIds(new Set(cm));
      setHubs(hb);
      setMemberships(ms);
      setTrainingSessions(ts.sessions);
      setKinds(k);
      setTrainingAttendance(ts.attendance);
      const byGroup = new Map<string, ParticipantOnboardingStatus[]>();
      ob.forEach((s) => {
        if (!s.groupId) return;
        const arr = byGroup.get(s.groupId) ?? [];
        arr.push(s);
        byGroup.set(s.groupId, arr);
      });
      const stageMap: Record<string, StageSummary> = {};
      byGroup.forEach((statuses, groupId) => { stageMap[groupId] = summarizeStages(statuses); });
      setStagesByGroup(stageMap);
      followUpContactsApi.getAll().then((res) => setFollowUpLoad(openLoadByOwner(res.contacts, activeCohort.id))).catch(() => {});
      setNotedIds(new Set(await supportNotesApi.getSupportIdsWithNotes(hb.map((x) => x.id)).then((res) => res.supportIds).catch(() => [] as string[])));
      const groupIds = h.groups.map((g) => g.id);
      setReports(await participantNotesApi.getMeetingReports(groupIds).then((res) => res.notes).catch(() => [] as ParticipantNote[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load supports.');
    } finally {
      setLoading(false);
    }
  }, [activeCohort?.id]);

  useEffect(() => { void load(); }, [load, liveRevision]);

  useEffect(() => {
    const supports = users.filter((u) => u.role === 'SUPPORT');
    if (supports.length === 0) return;
    let cancelled = false;
    void Promise.allSettled(supports.map(async (u) => ({ id: u.id, seen: await usersApi.getLastActive(u.id) }))).then((results) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.seen) map[r.value.id] = r.value.seen;
      });
      setLastSeenById(map);
    });
    return () => { cancelled = true; };
  }, [users]);

  const model = useMemo(() => {
    if (!health || !people || !rules || !activeCohort) return null;
    const mode = cohortMode({ startDate: health.cohort?.startDate ?? activeCohort.startDate, endDate: health.cohort?.endDate ?? activeCohort.endDate, status: activeCohort.status });
    const stats = buildWeekStats(health);
    const currentWeek = mode === 'completed' ? (stats[stats.length - 1]?.weekNumber ?? 0) : mode === 'upcoming' ? 0 : currentWeekNumber(activeCohort, stats);
    const judged = judgedWeekNumbers(mode, stats, currentWeek);
    const judgedWeeks = health.weeks.filter((w) => judged.includes(w.weekNumber));
    const evaluations = evaluateSupports(people, health.groups, health.meetings, judgedWeeks, rules)
      .sort((a, b) => SEVERITY[a.health] - SEVERITY[b.health] || b.missedWeeks.length - a.missedWeeks.length);
    // A support leading two groups is judged by the weaker one.
    const bySupport = new Map<string, PersonHealth>();
    evaluations.forEach((e) => {
      const prev = bySupport.get(e.supportId);
      if (!prev || SEVERITY[e.health] < SEVERITY[prev]) bySupport.set(e.supportId, e.health);
    });
    const counts = { critical: 0, warning: 0, good: 0 };
    bySupport.forEach((h) => { counts[h] += 1; });
    const unsupported = health.groups.filter((g) => !g.supportId && g.members > 0);
    const leading = new Set(health.groups.map((g) => g.supportId).filter(Boolean));
    const notLeading = users.filter((u) => u.role === 'SUPPORT' && u.isActive !== false && cohortMemberIds.has(u.id) && !leading.has(u.id));
    const weekIdByNumber = new Map(health.weeks.map((w) => [w.weekNumber, w.id]));
    return { mode, judged, evaluations, counts, total: bySupport.size, unsupported, notLeading, weekIdByNumber };
  }, [health, people, rules, users, cohortMemberIds, activeCohort]);

  // Newest report per group+week: a support can submit more than once, and the
  // latest one is what the back office should read.
  const reportByKey = useMemo(() => {
    const map = new Map<string, ParticipantNote>();
    for (const note of [...reports].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (note.groupId && note.weekId != null) map.set(`${note.groupId}:${note.weekId}`, note);
    }
    return map;
  }, [reports]);

  const trainingsTotal = trainingSessions.length;
  const trainingCounts = useMemo(
    () => buildTrainingCounts(trainingSessions.map((s) => s.id), trainingAttendance),
    [trainingSessions, trainingAttendance]
  );

  // A support's hub for the active cohort, and whether they lead it.
  const hubById = new Map(hubs.map((h) => [h.id, h]));
  const hubByUserId = new Map(memberships.map((m) => {
    const hub = hubById.get(m.hubId);
    return [m.userId, hub ? { id: hub.id, name: hub.name, isLead: hub.leadUserId === m.userId } : null] as const;
  }));

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const saveKind = async (userId: string, kind: SupportKind) => {
    if (!activeCohort) return;
    const prev = kinds[userId] ?? 'PARTICIPANT_SUPPORT';
    setKinds((cur) => ({ ...cur, [userId]: kind }));
    setSavingKindIds((cur) => new Set(cur).add(userId));
    try {
      await supportKindApi.set(userId, activeCohort.id, kind);
    } catch (err) {
      setKinds((cur) => ({ ...cur, [userId]: prev }));
      toast({ message: err instanceof Error ? err.message : 'Could not save that. Please try again.', tone: 'error' });
    } finally {
      setSavingKindIds((cur) => {
        const next = new Set(cur);
        next.delete(userId);
        return next;
      });
    }
  };

  const setFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('health'); else params.set('health', next);
    setSearchParams(params, { replace: true });
  };
  const setNotesFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === '1') params.set('notes', '1'); else params.delete('notes');
    setSearchParams(params, { replace: true });
  };
  const markNoted = (userId: string) => setNotedIds((prev) => (prev.has(userId) ? prev : new Set(prev).add(userId)));
  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    setSearchParams(params, { replace: true });
  };
  const setHubFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (!next) params.delete('hub'); else params.set('hub', next);
    setSearchParams(params, { replace: true });
  };

  const searchTerm = search.trim().toLowerCase();
  const nameById = new Map(users.map((u) => [u.id, u.name.toLowerCase()]));
  const usersById = new Map(users.map((u) => [u.id, u]));
  // Search plus the profile and role filters, applied to every list below.
  const matchesSearch = (userId: string) => {
    if (searchTerm && !(nameById.get(userId) ?? '').includes(searchTerm)) return false;
    if (incompleteOnly) {
      const u = usersById.get(userId);
      if (!u || isSupportProfileComplete(u)) return false;
    }
    if (kindFilter && (kinds[userId] ?? 'PARTICIPANT_SUPPORT') !== kindFilter) return false;
    return true;
  };

  const visible = (model?.evaluations.filter((e) => filter === 'all' || e.health === filter) ?? [])
    .filter((e) => !hubFilter || hubByUserId.get(e.supportId)?.id === hubFilter)
    .filter((e) => !notesOnly || notedIds.has(e.supportId))
    .filter((e) => matchesSearch(e.supportId));
  const userById = new Map(users.map((u) => [u.id, u]));
  const groupById = new Map((health?.groups ?? []).map((g) => [g.id, g]));

  const kindOf = (userId: string): SupportKind => kinds[userId] ?? 'PARTICIPANT_SUPPORT';
  const isProblemKind = (userId: string) => kindOf(userId) === 'PARTICIPANT_SUPPORT';

  // Supports who lead no group still show up as a simple card when they're in
  // a hub, or when their kind is Hub lead / Operational support (they aren't
  // meant to lead a group) — otherwise the only trace of them is a name in the
  // collapsed line below, and the hub filter used to hide them from the page
  // entirely. They have no health, so a health filter other than "all" hides
  // their card too.
  const notLeadingWithHub = (model?.notLeading ?? []).filter((u) => !!hubByUserId.get(u.id) || !isProblemKind(u.id));
  const notLeadingCards = filter === 'all'
    ? notLeadingWithHub.filter((u) => (!hubFilter || hubByUserId.get(u.id)?.id === hubFilter) && (!notesOnly || notedIds.has(u.id)) && matchesSearch(u.id))
    : [];
  const notLeadingCardIds = new Set(notLeadingCards.map((u) => u.id));
  // Hub leads and operational supports are never flagged as a "no group"
  // problem, regardless of the health filter/tab in view.
  const notLeadingCollapsed = (model?.notLeading ?? [])
    .filter((u) => !notLeadingCardIds.has(u.id))
    .filter((u) => isProblemKind(u.id))
    .filter((u) => !notesOnly || notedIds.has(u.id))
    .filter((u) => matchesSearch(u.id));

  // Everyone shown on the page right now, for the WhatsApp export.
  const shownSupports = (() => {
    const ids = [...visible.map((e) => e.supportId), ...notLeadingCards.map((u) => u.id), ...notLeadingCollapsed.map((u) => u.id)];
    const seen = new Set<string>();
    return ids
      .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
      .map((id) => usersById.get(id))
      .filter((u): u is User => !!u)
      .sort((a, b) => a.name.localeCompare(b.name));
  })();
  // Supports in this cohort (leading a group or not) whose profile isn't complete.
  const incompleteCount = new Set([...(model?.evaluations ?? []).map((e) => e.supportId), ...(model?.notLeading ?? []).map((u) => u.id)]
    .filter((id) => { const u = usersById.get(id); return !!u && !isSupportProfileComplete(u); })).size;
  // Headline count: everyone in this cohort's list, and how many the filters leave.
  const totalSupports = new Set([...(model?.evaluations ?? []).map((e) => e.supportId), ...(model?.notLeading ?? []).map((u) => u.id)]).size;
  const countSubtitle = shownSupports.length === totalSupports
    ? `${totalSupports} supports · ${activeCohort?.name ?? ''}`
    : `${shownSupports.length} of ${totalSupports} supports shown · ${activeCohort?.name ?? ''}`;
  const exportSubtitle = [
    incompleteOnly ? 'Incomplete profile' : '',
    kindFilter ? KIND_LABEL[kindFilter] : '',
    hubFilter ? hubs.find((h) => h.id === hubFilter)?.name ?? '' : '',
    notesOnly ? 'With notes' : '',
  ].filter(Boolean).join(' · ');

  return (
    <div>
      <PageHeader
        title="Supports"
        subtitle={pageTab === 'supports' && model ? countSubtitle : 'Group meeting records and onboarding for every support.'}
        tourId="admin:supports"
        action={pageTab === 'supports' && model ? (
          <AppOverflowMenu align="right" items={[{ label: 'Export for WhatsApp', onClick: () => setExportOpen(true) }]} />
        ) : undefined}
      />

      <div className="mb-4">
        <SegmentedTabs
          tabs={[
            { key: 'supports', label: 'Supports' },
            { key: 'trainings', label: 'Trainings & get-togethers', shortLabel: 'Trainings' },
          ]}
          active={pageTab}
          onChange={(k) => {
            const params = new URLSearchParams(searchParams);
            if (k === 'trainings') params.set('tab', 'trainings'); else params.delete('tab');
            setSearchParams(params, { replace: true });
          }}
        />
      </div>

      {pageTab === 'trainings' ? (
        <SupportTrainingsPanel onChanged={() => { void load(); }} />
      ) : loading && !model ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="surface-card h-28 animate-pulse" />)}
        </div>
      ) : error && !model ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">Try again</button>
        </div>
      ) : !model || !rules ? (
        <div className="surface-card p-8 text-center text-sm text-gray-500">No cohort selected.</div>
      ) : (
        <div className="space-y-5">
          <section data-wt="supports-rules" className="surface-card p-4 sm:p-5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
              <span>
                {model.mode === 'upcoming'
                  ? "The cohort hasn't started, so only onboarding is judged for now."
                  : model.mode === 'running' && model.judged.length === 0
                    ? 'Weekly records are judged once Week 1 is over.'
                    : 'How supports are judged'}
              </span>
              <InfoTip label="How supports are judged">
                Each week a support submits the group meeting report and records meeting attendance for everyone.
                {' '}{rules.supportAmberMissedWeeks} unrecorded week{rules.supportAmberMissedWeeks === 1 ? '' : 's'} = keep an eye on, {rules.supportRedMissedWeeks} = needs attention.
                {' '}Groups should be fully onboarded within {rules.onboardingMaxDays} days.
                {' '}<NavLink to="/settings" className="font-semibold text-primary">Change rules</NavLink>
              </InfoTip>
            </div>
            <div className="mt-4">
              <SegmentedTabs
                scrollable
                tabs={[
                  { key: 'all', label: `All ${model.total}` },
                  { key: 'critical', label: `Needs attention ${model.counts.critical}` },
                  { key: 'warning', label: `Keep an eye on ${model.counts.warning}` },
                  { key: 'good', label: `On track ${model.counts.good}` },
                ]}
                active={filter}
                onChange={(k) => setFilter(k as typeof filter)}
              />
            </div>
          </section>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supports"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <div className="grid grid-cols-2 gap-2 sm:flex">
            {hubs.length > 0 && (
              <div className="min-w-0 sm:w-64">
                <AppSelect
                  value={hubFilter}
                  onChange={setHubFilter}
                  options={[{ value: '', label: 'All hubs' }, ...hubs.map((h) => ({ value: h.id, label: h.name }))]}
                  placeholder="All hubs"
                  compact
                />
              </div>
            )}
            <div className="min-w-0 sm:w-64">
              <AppSelect
                value={notesOnly ? '1' : ''}
                onChange={setNotesFilter}
                options={[{ value: '', label: 'All supports' }, { value: '1', label: `★ With notes (${notedIds.size})` }]}
                placeholder="All supports"
                compact
              />
            </div>
            <div className="min-w-0 sm:w-64">
              <AppSelect
                value={incompleteOnly ? 'incomplete' : ''}
                onChange={(v) => setParam('profile', v)}
                options={[{ value: '', label: 'All profiles' }, { value: 'incomplete', label: `Incomplete profile (${incompleteCount})` }]}
                placeholder="All profiles"
                compact
              />
            </div>
            <div className="min-w-0 sm:w-64">
              <AppSelect
                value={kindFilter}
                onChange={(v) => setParam('kind', v)}
                options={[{ value: '', label: 'All roles' }, ...KIND_OPTIONS]}
                placeholder="All roles"
                compact
              />
            </div>
          </div>

          {visible.length === 0 && notLeadingCards.length === 0 ? (
            <div className="surface-card p-8 text-center text-sm text-gray-500">No supports here.</div>
          ) : (
            <ul data-wt="supports-list" className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {visible.map((evaluation) => (
                <SupportCard
                  key={evaluation.groupId}
                  evaluation={evaluation}
                  user={userById.get(evaluation.supportId) ?? null}
                  groupName={groupById.get(evaluation.groupId)?.name ?? 'Group'}
                  supportName={groupById.get(evaluation.groupId)?.supportName ?? 'Support'}
                  rules={rules}
                  judgedCount={model.judged.length}
                  hub={hubByUserId.get(evaluation.supportId) ?? null}
                  training={{ ...trainingCountFor(trainingCounts, evaluation.supportId, trainingsTotal), sessions: trainingSessions, attendance: trainingAttendance }}
                  reportFor={(weekNumber) => {
                    const weekId = model.weekIdByNumber.get(weekNumber);
                    return weekId == null ? null : reportByKey.get(`${evaluation.groupId}:${weekId}`) ?? null;
                  }}
                  kind={kinds[evaluation.supportId] ?? 'PARTICIPANT_SUPPORT'}
                  kindSaving={savingKindIds.has(evaluation.supportId)}
                  onKindChange={(kind) => void saveKind(evaluation.supportId, kind)}
                  hasNotes={notedIds.has(evaluation.supportId)}
                  onNoteAdded={() => markNoted(evaluation.supportId)}
                  followUps={followUpLoad.get(evaluation.supportId) ?? 0}
                  onViewProfile={() => setProfileUserId(evaluation.supportId)}
                  lastSeen={lastSeenById[evaluation.supportId] ?? null}
                  stages={stagesByGroup[evaluation.groupId] ?? null}
                />
              ))}
              {notLeadingCards.map((u) => (
                <NoLeadSupportCard
                  key={u.id}
                  user={u}
                  hub={hubByUserId.get(u.id)!}
                  training={{ ...trainingCountFor(trainingCounts, u.id, trainingsTotal), sessions: trainingSessions, attendance: trainingAttendance }}
                  kind={kinds[u.id] ?? 'PARTICIPANT_SUPPORT'}
                  kindSaving={savingKindIds.has(u.id)}
                  onKindChange={(kind) => void saveKind(u.id, kind)}
                  hasNotes={notedIds.has(u.id)}
                  onNoteAdded={() => markNoted(u.id)}
                  followUps={followUpLoad.get(u.id) ?? 0}
                  maxFollowUps={rules.maxFollowUpsPerSupport}
                  onViewProfile={() => setProfileUserId(u.id)}
                  lastSeen={lastSeenById[u.id] ?? null}
                />
              ))}
            </ul>
          )}

          {(model.unsupported.length > 0 || notLeadingCollapsed.length > 0) && (
            <section className="surface-card p-5 sm:p-6">
              {model.unsupported.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-800">
                    <span className="font-semibold">{model.unsupported.length} group{model.unsupported.length === 1 ? '' : 's'} without a support:</span>{' '}
                    {model.unsupported.map((g) => g.name).join(', ')}
                  </p>
                  <NavLink to="/groups" className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">Assign</NavLink>
                </div>
              )}
              {notLeadingCollapsed.length > 0 && (
                <details className={model.unsupported.length > 0 ? 'mt-3' : ''}>
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700">{notLeadingCollapsed.length} support{notLeadingCollapsed.length === 1 ? ' isn’t' : 's aren’t'} leading a group this cohort</summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {notLeadingCollapsed.map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-3 text-sm text-gray-600">
                        <button type="button" onClick={() => setProfileUserId(u.id)} className="flex min-w-0 items-center gap-2.5 text-left">
                          <Avatar name={u.name} avatarUrl={u.avatarUrl} size="xs" />
                          <span className="min-w-0 truncate hover:underline">{u.name}</span>
                        </button>
                        <span className="min-w-0 flex-1 truncate">{notedIds.has(u.id) && <span title={PERSON_OF_INTEREST_INFO.description} className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${PERSON_OF_INTEREST_INFO.pill}`}>{PERSON_OF_INTEREST_INFO.label}</span>}</span>
                        <div className="w-44 flex-none">
                          <AppSelect
                            value={kindOf(u.id)}
                            onChange={(v) => void saveKind(u.id, v as SupportKind)}
                            options={KIND_OPTIONS}
                            placeholder="Participant support"
                            disabled={savingKindIds.has(u.id)}
                            loading={savingKindIds.has(u.id)}
                            compact
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}

        </div>
      )}
      <HubAuthorProfileModal
        userId={profileUserId}
        isOpen={!!profileUserId}
        onClose={() => setProfileUserId(null)}
        onUserUpdated={(id, changes) => setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...changes } : u)))}
      />
      {exportOpen && (
        <SupportsExportPopup
          supports={shownSupports}
          title={`${activeCohort?.name ?? 'Cohort'} Supports`}
          subtitle={exportSubtitle}
          showMissing={incompleteOnly}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
};

// Per-group onboarding roll-up: every member past each step.
interface StageSummary {
  contacted: boolean;
  addedToGroup: boolean;
  introductionDone: boolean;
  venueAcknowledged: boolean;
}

const summarizeStages = (statuses: ParticipantOnboardingStatus[]): StageSummary => ({
  contacted: statuses.length > 0 && statuses.every((s) => s.contacted),
  addedToGroup: statuses.length > 0 && statuses.every((s) => s.addedToGroup),
  introductionDone: statuses.length > 0 && statuses.every((s) => s.introductionDone),
  venueAcknowledged: statuses.length > 0 && statuses.every((s) => s.venueAcknowledged),
});

// Four-segment onboarding bar + short label. Falls back to the sentence when
// stage data is missing.
const OnboardingBar: React.FC<{ stages: StageSummary | null; fallback: string; late: boolean }> = ({ stages, fallback, late }) => {
  if (!stages) return <span>{fallback}</span>;
  const steps = [stages.contacted, stages.addedToGroup, stages.introductionDone, stages.venueAcknowledged];
  const done = steps.filter(Boolean).length;
  const all = done === 4;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="flex min-w-0 flex-1 gap-1" aria-hidden="true">
        {steps.map((hit, i) => (
          <span key={i} className={`h-1.5 min-w-0 flex-1 rounded-full ${hit ? 'bg-emerald-500' : 'bg-gray-200'}`} />
        ))}
      </span>
      <span className={`flex-none text-[11px] font-semibold ${all ? 'text-emerald-700' : late ? 'text-red-600' : 'text-gray-500'}`}>
        {all ? 'Onboarded' : done === 0 ? 'Not started' : `${done}/4`}
      </span>
    </span>
  );
};

const SupportCard: React.FC<{
  evaluation: SupportEvaluation;
  user: User | null;
  groupName: string;
  supportName: string;
  rules: ProgrammeRules;
  judgedCount: number;
  hub: { id: string; name: string; isLead: boolean } | null;
  training: { attended: number; total: number; sessions: SupportSession[]; attendance: Array<{ sessionId: string; userId: string; status: string; learned?: string | null; willApply?: string | null }> };
  reportFor: (weekNumber: number) => ParticipantNote | null;
  kind: SupportKind;
  kindSaving: boolean;
  onKindChange: (kind: SupportKind) => void;
  hasNotes: boolean;
  onNoteAdded: () => void;
  followUps: number;
  onViewProfile: () => void;
  lastSeen: string | null;
  stages: StageSummary | null;
}> = ({ evaluation, user, groupName, supportName, rules, judgedCount, hub, training, reportFor, kind, kindSaving, onKindChange, hasNotes, onNoteAdded, followUps, onViewProfile, lastSeen, stages }) => {
  const [open, setOpen] = useState(false);
  const [openReport, setOpenReport] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<SupportNote[] | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const whatsapp = buildWhatsAppLink(user?.phone, `Hi ${supportName.split(' ')[0]}, checking in on ${groupName}'s weekly records.`);
  const { onboarding } = evaluation;

  const toggleNotes = () => {
    const next = !notesOpen;
    setNotesOpen(next);
    if (next && notes === null) {
      supportNotesApi.getForSupport(evaluation.supportId).then((res) => setNotes(res.notes)).catch(() => setNotes([]));
    }
  };

  const handleAddNote = async () => {
    if (!noteBody.trim()) return;
    setNoteSaving(true);
    try {
      const { note } = await supportNotesApi.create({ supportId: evaluation.supportId, hubId: hub?.id ?? null, noteType: 'NOTE', body: noteBody.trim() });
      setNotes((prev) => [note, ...(prev ?? [])]);
      onNoteAdded();
      setNoteBody('');
    } catch { /* ignore */ }
    finally { setNoteSaving(false); }
  };

  const onboardingText = onboarding.completedAt && onboarding.allOnboarded
    ? `Onboarded in ${onboarding.days} day${onboarding.days === 1 ? '' : 's'}${onboarding.late ? ` (over ${rules.onboardingMaxDays})` : ''}`
    : onboarding.assignedAt
      ? `Onboarding not finished · ${Math.floor(onboarding.days ?? 0)} day${Math.floor(onboarding.days ?? 0) === 1 ? '' : 's'} since assigned`
      : 'Onboarding not started';

  const recordsText = judgedCount === 0
    ? 'No weeks to judge yet'
    : evaluation.missedWeeks.length === 0
      ? `Recorded all ${judgedCount} week${judgedCount === 1 ? '' : 's'}`
      : `Missing records for week${evaluation.missedWeeks.length === 1 ? '' : 's'} ${evaluation.missedWeeks.join(', ')}`;

  const subtleLine = [user ? genderAgeLine(user) : ''].filter(Boolean).join(' · ');
  const active = activeStatus(lastSeen);

  return (
    <li className="surface-card rounded-[24px] p-[18px] sm:p-[22px]">
      <div className="flex min-w-0 items-start gap-2.5">
        <button type="button" onClick={onViewProfile} aria-label={`View ${supportName}'s profile`} className="flex-none rounded-full">
          <Avatar name={supportName} avatarUrl={user?.avatarUrl} size="md" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <button type="button" onClick={onViewProfile} className="min-w-0 truncate text-left text-[15px] font-bold tracking-tight text-gray-900 hover:underline">{supportName}</button>
            {hasNotes && <span title={PERSON_OF_INTEREST_INFO.description} className={`flex-none rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PERSON_OF_INTEREST_INFO.pill}`}>{PERSON_OF_INTEREST_INFO.label}</span>}
          </div>
          <p className="mt-0.5 break-words text-[11px] leading-4 text-gray-500">
            {[groupName, subtleLine].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-4 text-gray-500">
            <span className={`h-2 w-2 flex-none rounded-full ${activeDot(active.tone)}`} aria-hidden="true" />
            {active.label}
          </p>
        </div>
        <div className="flex-none pt-0.5"><AppOverflowMenu align="right" items={[{ label: 'View profile', onClick: onViewProfile }]} /></div>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className={`min-w-0 flex-1 text-[13px] leading-5 ${evaluation.missedWeeks.length ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
          {recordsText}
        </span>
        <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${HEALTH_PILL[evaluation.health]}`}>{PERSON_HEALTH_LABEL[evaluation.health]}</span>
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
        <OnboardingBar stages={stages} fallback={onboardingText} late={onboarding.late || !onboarding.allOnboarded} />
        {training.total > 0 && <TrainingPill name={supportName} userId={evaluation.supportId} sessions={training.sessions} attendance={training.attendance} />}
      </div>

      <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          <LoadRing value={followUps} max={rules.maxFollowUpsPerSupport} />
          {rules.maxFollowUpsPerSupport > 0 && followUps > rules.maxFollowUpsPerSupport && (
            <span className="rounded-full bg-red-100/80 px-2 py-0.5 text-[10px] font-semibold text-red-700">Over limit</span>
          )}
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex min-h-11 flex-none items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-200">
          {open ? 'Hide details' : 'Details'}
          <svg className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 7.5 5 5 5-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {open && <div className="mt-2 border-t border-gray-100 pt-3">
        <SupportTagRow tags={[
          user && <ProfileTag key="profile" user={user} />,
          hub?.name && <span key="hub" className="text-[11px] text-gray-500">{hub.name}</span>,
          <span key="members" className="text-[11px] text-gray-500">{evaluation.members} participant{evaluation.members === 1 ? '' : 's'}</span>,
          hub?.isLead && <span key="lead" className="rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Lead</span>,
          KIND_PILL[kind] && <span key="kind" className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_PILL[kind]}`}>{KIND_LABEL[kind]}</span>,
        ]} />
        <div className="mt-3 w-full sm:w-56">
          <AppSelect value={kind} onChange={(v) => onKindChange(v as SupportKind)} options={KIND_OPTIONS} placeholder="Participant support" disabled={kindSaving} loading={kindSaving} compact label="Kind" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">WhatsApp</a>}
          <NavLink to={`/groups?group=${evaluation.groupId}`} className="inline-flex min-h-11 items-center rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">Open group</NavLink>
          {evaluation.weeks.length > 0 && <NavLink to="/group-prayers" className="inline-flex min-h-11 items-center rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">See records</NavLink>}
          <button type="button" onClick={toggleNotes} aria-expanded={notesOpen} className="min-h-11 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">
            {notesOpen ? 'Hide notes' : 'Notes'}
            {hasNotes && <span title={PERSON_OF_INTEREST_INFO.description} className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PERSON_OF_INTEREST_INFO.pill}`}>{PERSON_OF_INTEREST_INFO.label}</span>}
          </button>
        </div>

      {notesOpen && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Private note — only admin and this support's hub lead can see it."
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => void handleAddNote()}
              disabled={noteSaving || !noteBody.trim()}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {noteSaving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Add'}
            </button>
          </div>
          {notes === null ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
          ) : notes.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">No notes yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="whitespace-pre-line text-xs text-gray-800">{n.body}</p>
                  <p className="mt-1 text-[10px] text-gray-400">{n.authorName || 'Admin'} · {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && (
        <ul className="mt-3 divide-y divide-gray-100 sm:hidden">
          {evaluation.weeks.map((w) => {
            const report = reportFor(w.weekNumber);
            const showing = openReport === w.weekNumber;
            const problems = [
              !w.reportSubmitted && 'Report',
              !w.meetingMarked && 'Meeting',
              w.recapMissed && 'Recap',
            ].filter(Boolean) as string[];
            return (
              <li key={w.weekNumber} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-gray-900">Week {w.weekNumber}</span>
                  {problems.length === 0 ? (
                    <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">All done</span>
                  ) : (
                    <span className="flex flex-wrap justify-end gap-1">
                      {problems.map((label) => <span key={label} className="rounded-full bg-red-100/80 px-2 py-0.5 text-[11px] font-semibold text-red-700">{label} missing</span>)}
                    </span>
                  )}
                </div>
                {report ? (
                  <button
                    type="button"
                    onClick={() => setOpenReport(showing ? null : w.weekNumber)}
                    aria-expanded={showing}
                    className="mt-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700"
                  >
                    {showing ? 'Hide notes' : 'Read notes'}
                  </button>
                ) : w.reportSubmitted ? (
                  <p className="mt-1 text-[11px] text-gray-400">Report has no notes</p>
                ) : null}
                {showing && report && (
                  <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="whitespace-pre-line text-[13px] leading-normal text-gray-800">{report.body}</p>
                    <p className="mt-1.5 text-[11px] text-gray-500">
                      {report.authorName || 'A support'} · {new Date(report.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className="mt-3 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Week</th>
                <th className="py-1.5 pr-3 font-semibold">Meeting report</th>
                <th className="py-1.5 pr-3 font-semibold">Meeting attendance</th>
                <th className="py-1.5 font-semibold">Recap</th>
              </tr>
            </thead>
            <tbody className="text-gray-800">
              {evaluation.weeks.map((w) => {
                const report = reportFor(w.weekNumber);
                const showing = openReport === w.weekNumber;
                return (
                  <React.Fragment key={w.weekNumber}>
                    <tr className="border-t border-gray-100">
                      <td className="py-1.5 pr-3 font-semibold">{w.weekNumber}</td>
                      <td className="py-1.5 pr-3">
                        <span className={w.reportSubmitted ? 'text-emerald-700' : 'font-semibold text-red-700'}>{w.reportSubmitted ? '✓ Done' : '× Missing'}</span>
                        {report ? (
                          <button
                            type="button"
                            onClick={() => setOpenReport(showing ? null : w.weekNumber)}
                            aria-expanded={showing}
                            className="ml-2 rounded-lg bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
                          >
                            {showing ? 'Hide notes' : 'Read notes'}
                          </button>
                        ) : w.reportSubmitted ? (
                          <span className="ml-2 text-[11px] text-gray-400">no notes</span>
                        ) : null}
                      </td>
                      <td className={`py-1.5 pr-3 ${w.meetingMarked ? 'text-emerald-700' : 'font-semibold text-red-700'}`}>{w.meetingMarked ? '✓ Done' : '× Missing'}</td>
                      <td className={`py-1.5 ${w.recapMissed ? 'font-semibold text-red-700' : 'text-emerald-700'}`}>{w.recapMissed ? '× Absent' : '✓ OK'}</td>
                    </tr>
                    {showing && report && (
                      <tr className="border-t border-gray-100 bg-gray-50/70">
                        <td colSpan={4} className="px-1 py-2.5">
                          <p className="whitespace-pre-line text-[13px] leading-normal text-gray-800">{report.body}</p>
                          <p className="mt-1.5 text-[11px] text-gray-500">
                            {report.authorName || 'A support'} · {new Date(report.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>}
    </li>
  );
};

// A support in a hub who doesn't lead a group: no weekly records to judge, so
// just their hub badge, a WhatsApp link and the same notes section the
// group-leading card has.
const NoLeadSupportCard: React.FC<{
  user: User;
  hub: { id: string; name: string; isLead: boolean } | null;
  training: { attended: number; total: number; sessions: SupportSession[]; attendance: Array<{ sessionId: string; userId: string; status: string; learned?: string | null; willApply?: string | null }> };
  kind: SupportKind;
  kindSaving: boolean;
  onKindChange: (kind: SupportKind) => void;
  hasNotes: boolean;
  onNoteAdded: () => void;
  followUps: number;
  maxFollowUps: number;
  onViewProfile: () => void;
  lastSeen: string | null;
}> = ({ user, hub, training, kind, kindSaving, onKindChange, hasNotes, onNoteAdded, followUps, maxFollowUps, onViewProfile, lastSeen }) => {
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<SupportNote[] | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const whatsapp = buildWhatsAppLink(user.phone, `Hi ${user.name.split(' ')[0]}`);
  const subtleLine = genderAgeLine(user);
  const active = activeStatus(lastSeen);

  const toggleNotes = () => {
    const next = !notesOpen;
    setNotesOpen(next);
    if (next && notes === null) {
      supportNotesApi.getForSupport(user.id).then((res) => setNotes(res.notes)).catch(() => setNotes([]));
    }
  };

  const handleAddNote = async () => {
    if (!noteBody.trim()) return;
    setNoteSaving(true);
    try {
      const { note } = await supportNotesApi.create({ supportId: user.id, hubId: hub?.id ?? null, noteType: 'NOTE', body: noteBody.trim() });
      setNotes((prev) => [note, ...(prev ?? [])]);
      onNoteAdded();
      setNoteBody('');
    } catch { /* ignore */ }
    finally { setNoteSaving(false); }
  };

  return (
    <li className="surface-card rounded-[24px] p-[18px] sm:p-[22px]">
      <div className="flex min-w-0 items-start gap-2.5">
        <button type="button" onClick={onViewProfile} aria-label={`View ${user.name}'s profile`} className="flex-none rounded-full">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size="md" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <button type="button" onClick={onViewProfile} className="min-w-0 truncate text-left text-[15px] font-bold tracking-tight text-gray-900 hover:underline">{user.name}</button>
            {hasNotes && <span title={PERSON_OF_INTEREST_INFO.description} className={`flex-none rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PERSON_OF_INTEREST_INFO.pill}`}>{PERSON_OF_INTEREST_INFO.label}</span>}
          </div>
          <p className="mt-0.5 break-words text-[11px] leading-4 text-gray-500">{[hub?.name, subtleLine].filter(Boolean).join(' · ')}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-4 text-gray-500">
            <span className={`h-2 w-2 flex-none rounded-full ${activeDot(active.tone)}`} aria-hidden="true" />
            {active.label}
          </p>
        </div>
        <div className="flex-none pt-0.5"><AppOverflowMenu align="right" items={[{ label: 'View profile', onClick: onViewProfile }]} /></div>
      </div>

      {training.total > 0 && (
        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <TrainingPill name={user.name} userId={user.id} sessions={training.sessions} attendance={training.attendance} />
        </div>
      )}

      <div className="mt-3 flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          <LoadRing value={followUps} max={maxFollowUps} />
          {maxFollowUps > 0 && followUps > maxFollowUps && (
            <span className="rounded-full bg-red-100/80 px-2 py-0.5 text-[10px] font-semibold text-red-700">Over limit</span>
          )}
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex min-h-11 flex-none items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-200">
          {open ? 'Hide details' : 'Details'}
          <svg className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 7.5 5 5 5-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {open && <div className="mt-2 border-t border-gray-100 pt-3">
        <SupportTagRow tags={[
          <ProfileTag key="profile" user={user} />,
          hub?.isLead && <span key="lead" className="rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Lead</span>,
          KIND_PILL[kind] && <span key="kind" className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_PILL[kind]}`}>{KIND_LABEL[kind]}</span>,
        ]} />
        <div className="mt-3 w-full sm:w-56">
          <AppSelect value={kind} onChange={(v) => onKindChange(v as SupportKind)} options={KIND_OPTIONS} placeholder="Participant support" disabled={kindSaving} loading={kindSaving} compact label="Kind" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">WhatsApp</a>}
          <button type="button" onClick={toggleNotes} aria-expanded={notesOpen} className="min-h-11 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200">
            {notesOpen ? 'Hide notes' : 'Notes'}
            {hasNotes && <span title={PERSON_OF_INTEREST_INFO.description} className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PERSON_OF_INTEREST_INFO.pill}`}>{PERSON_OF_INTEREST_INFO.label}</span>}
          </button>
        </div>

      {notesOpen && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Private note — only admin and this support's hub lead can see it."
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => void handleAddNote()}
              disabled={noteSaving || !noteBody.trim()}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {noteSaving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : 'Add'}
            </button>
          </div>
          {notes === null ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
          ) : notes.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">No notes yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="whitespace-pre-line text-xs text-gray-800">{n.body}</p>
                  <p className="mt-1 text-[10px] text-gray-400">{n.authorName || 'Admin'} · {new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>}
    </li>
  );
};

const ProfileTag: React.FC<{ user: User }> = ({ user }) => (
  isSupportProfileComplete(user)
    ? <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Profile complete</span>
    : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">Profile incomplete</span>
);

// Long tag rows fold to the first two plus "+N"; tap it to see the rest.
// Profile and Trainings go first so they're always visible.
const SupportTagRow: React.FC<{ tags: React.ReactNode[] }> = ({ tags }) => {
  const [open, setOpen] = useState(false);
  const shown = tags.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {open ? shown : shown.slice(0, 2)}
      {shown.length > 2 && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-200">
          {open ? 'Less' : `+${shown.length - 2}`}
        </button>
      )}
    </div>
  );
};

export default AdminSupportsPage;
