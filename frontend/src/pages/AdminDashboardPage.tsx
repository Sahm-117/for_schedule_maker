import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import ActivityText from '../components/ActivityText';
import PageHeader from '../components/PageHeader';
import { useToast } from '../components/Toast';
import CohortTrendChart from '../components/dashboard/CohortTrendChart';
import {
  AttentionList,
  ChecklistRow,
  GroupHeatGrid,
  HealthPill,
  SegmentBar,
  Sparkline,
  VitalTile,
} from '../components/dashboard/DashboardParts';
import {
  buildDashboardModel,
  statusForRate,
  worstStatus,
  type AttentionItem,
  type CohortHealthPayload,
  type DashboardModel,
  type HealthStatus,
} from '../components/dashboard/healthModel';
import NextCohortAssignModal from '../components/followups/NextCohortAssignModal';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { announcementsApi, cohortsApi, followUpContactsApi, settingsApi, supportActivityCompletionsApi, usersApi } from '../services/api';
import { DEFAULT_PROGRAMME_RULES, type CohortPeoplePayload, type ProgrammeRules } from '../utils/programmeRules';
import type { Announcement, FollowUpContact, SupportActivityCompletion, User } from '../types';
import { sortByText } from '../utils/sort';

// Admin home: where the cohort is, whether it's healthy, what needs attention
// and which groups need help. Switches to a registration view before a cohort
// starts and to a final summary once it's over.

const SUNDAY_COLOR = '#2a78d6';
const MEETING_COLOR = '#eb6834';

const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

const parseDay = (value?: string | null) => {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const shortDate = (value?: string | null) => {
  const date = parseDay(value);
  return date ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date) : null;
};
const pct = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}`);

const AdminDashboardPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { activeCohort, weeks, selectedWeek, globalPendingChanges, liveRevision } = useAppData();
  const showToast = useToast();

  const [health, setHealth] = useState<CohortHealthPayload | null>(null);
  const [people, setPeople] = useState<CohortPeoplePayload | null>(null);
  const [rules, setRules] = useState<ProgrammeRules>(DEFAULT_PROGRAMME_RULES);
  const [healthError, setHealthError] = useState('');
  const [loading, setLoading] = useState(true);

  const [supports, setSupports] = useState<User[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [completions, setCompletions] = useState<SupportActivityCompletion[]>([]);

  const [assignContacts, setAssignContacts] = useState<FollowUpContact[] | null>(null);
  const [openingAssign, setOpeningAssign] = useState(false);

  const loadHealth = useCallback(async () => {
    if (!activeCohort?.id) {
      setHealth(null);
      setLoading(false);
      return;
    }
    try {
      setHealthError('');
      const [nextHealth, nextPeople, nextRules] = await Promise.all([
        cohortsApi.getHealth(activeCohort.id),
        // Person-level rules are extra; the page still works without them.
        cohortsApi.getPeople(activeCohort.id).catch(() => null),
        settingsApi.getProgrammeRules(),
      ]);
      setHealth(nextHealth);
      setPeople(nextPeople);
      setRules(nextRules);
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : 'Could not load cohort health.');
    } finally {
      setLoading(false);
    }
  }, [activeCohort?.id]);

  useEffect(() => { void loadHealth(); }, [loadHealth, liveRevision]);

  useEffect(() => {
    announcementsApi.getHistory({ isAdmin: true, cohortId: activeCohort?.id || null })
      .then((res) => setAnnouncements(res.announcements.slice(0, 1)))
      .catch(() => setAnnouncements([]));
    if (!isAdmin) return;
    usersApi.getAll()
      .then(async (res) => {
        const supportUsers = res.users.filter((member) => member.role === 'SUPPORT');
        const withLabels = await Promise.all(supportUsers.map(async (member) => {
          try {
            return { ...member, labels: (await usersApi.getUserLabels(member.id)).labels };
          } catch {
            return { ...member, labels: [] };
          }
        }));
        setSupports(sortByText(withLabels, (member) => member.name));
      })
      .catch(() => setSupports([]));
  }, [activeCohort?.id, isAdmin, liveRevision]);

  const activeWeek = selectedWeek || weeks[0] || null;
  useEffect(() => {
    if (!activeWeek || !isAdmin) {
      setCompletions([]);
      return;
    }
    supportActivityCompletionsApi.getByWeek(activeWeek.id)
      .then((response) => setCompletions(response.completions))
      .catch(() => setCompletions([]));
  }, [activeWeek, isAdmin, liveRevision]);

  const model = useMemo(() => {
    if (!health || !activeCohort) return null;
    return buildDashboardModel(
      health,
      { startDate: health.cohort?.startDate ?? activeCohort.startDate, endDate: health.cohort?.endDate ?? activeCohort.endDate, status: activeCohort.status },
      globalPendingChanges.length,
      people,
      rules,
    );
  }, [health, activeCohort, globalPendingChanges.length, people, rules]);

  const todaysDay = useMemo(() => {
    if (!activeWeek) return null;
    return activeWeek.days.find((day) => day.dayName === todayName) || null;
  }, [activeWeek]);

  const handleAttentionAction = async (item: AttentionItem) => {
    if (item.action !== 'assignNextCohort' || !activeCohort) return;
    setOpeningAssign(true);
    try {
      const { contacts } = await followUpContactsApi.getWaitingForCohort(activeCohort.id);
      if (contacts.length === 0) {
        showToast({ message: 'Nobody is waiting for the next cohort any more.', tone: 'info' });
        void loadHealth();
      } else {
        setAssignContacts(contacts);
      }
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : 'Could not load them.', tone: 'error' });
    } finally {
      setOpeningAssign(false);
    }
  };

  if (user?.role === 'SUPPORT') {
    return <Navigate to="/support" replace />;
  }

  if (!activeCohort) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="How the cohort is doing, and what needs you." tourId="admin:dashboard" />
        <div className="surface-card p-8 text-center text-sm text-gray-500">
          No cohort yet. <NavLink to="/cohorts" className="font-semibold text-primary">Create one</NavLink> to get started.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="How the cohort is doing, and what needs you." tourId="admin:dashboard" />

      {loading && !health ? (
        <DashboardSkeleton />
      ) : healthError && !health ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-red-700">
          <span>{healthError}</span>
          <button type="button" onClick={() => { setLoading(true); void loadHealth(); }} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">Try again</button>
        </div>
      ) : health && model ? (
        <div className="space-y-5">
          <div data-wt="dash-strip"><CohortStrip health={health} model={model} cohortName={activeCohort.name} /></div>

          <div data-wt="dash-vitals">
            {model.mode === 'upcoming' ? (
              <RegistrationFunnel health={health} />
            ) : (
              <VitalSigns health={health} model={model} />
            )}
          </div>

          <div data-wt="dash-attention" className={openingAssign ? 'pointer-events-none opacity-70' : ''}>
            <AttentionList items={model.attention} onAction={(item) => { void handleAttentionAction(item); }} />
          </div>

          {model.mode === 'upcoming' ? (
            <ReadinessChecklist health={health} />
          ) : (
            <div data-wt="dash-trend" className="grid gap-5 xl:grid-cols-2">
              <section className="surface-card min-w-0 p-5 sm:p-6">
                <h3 className="text-base font-semibold text-gray-900">{model.mode === 'completed' ? 'How the cohort went' : 'Cohort trend'}</h3>
                <p className="mb-4 text-xs text-gray-500">Share of groups each week. {model.mode === 'running' ? 'The current week is left out until it ends.' : ''}</p>
                {model.judged.length === 0 ? (
                  <p className="rounded-2xl bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">The trend starts once Week 1 is over.</p>
                ) : (
                  <CohortTrendChart stats={model.stats} lastWeek={Math.max(...model.judged)} />
                )}
              </section>
              <div className="min-w-0">
                <GroupHeatGrid groups={model.engagement} data={health} weekNumbers={model.judged} />
              </div>
            </div>
          )}

          <div data-wt="dash-ops">
          <OperationsRow
            todayLabel={todaysDay ? `${todaysDay.dayName}, Week ${activeWeek?.weekNumber}` : null}
            activities={todaysDay?.activities ?? []}
            supports={supports}
            completions={completions}
            pendingApprovals={globalPendingChanges.length}
            pendingCover={health.pendingCover}
            announcement={announcements[0] ?? null}
            isAdmin={isAdmin}
          />
          </div>
        </div>
      ) : null}

      <NextCohortAssignModal
        isOpen={!!assignContacts}
        contacts={assignContacts ?? []}
        targetCohortId={activeCohort.id}
        targetCohortName={activeCohort.name}
        supports={supports}
        onClose={() => setAssignContacts(null)}
        onDone={(message) => {
          setAssignContacts(null);
          showToast({ message });
          void loadHealth();
        }}
      />
    </div>
  );
};

const CohortStrip: React.FC<{ health: CohortHealthPayload; model: DashboardModel; cohortName: string }> = ({ health, model, cohortName }) => {
  const total = model.stats.length;
  const start = shortDate(health.cohort?.startDate);
  const end = shortDate(health.cohort?.endDate);

  let heading: string;
  let progress: number;
  let overall: HealthStatus;
  let overallLabel: string | undefined;

  if (model.mode === 'upcoming') {
    const startDay = parseDay(health.cohort?.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = startDay ? Math.round((startDay.getTime() - today.getTime()) / 86400000) : null;
    heading = days === null ? 'Not started yet' : days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`;
    progress = 0;
    overall = 'neutral';
    overallLabel = 'Getting ready';
  } else if (model.mode === 'completed') {
    heading = start && end ? `Completed · ran ${start} – ${end}` : 'Completed';
    progress = 1;
    const success = cohortSuccess(model);
    overall = success.status;
    overallLabel = success.label;
  } else {
    heading = `Week ${model.currentWeek} of ${total}${end ? ` · ends ${end}` : ''}`;
    progress = total ? model.currentWeek / total : 0;
    overall = model.lastJudged
      ? worstStatus([statusForRate(model.lastJudged.recordingRate), statusForRate(model.lastJudged.meetingRate)])
      : 'neutral';
  }

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{cohortName}</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{heading}</h2>
        </div>
        <HealthPill status={overall} label={overallLabel} />
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {model.mode === 'upcoming' && start && <p className="mt-2 text-xs text-gray-500">First Sunday: {start}</p>}
    </section>
  );
};

const VitalSigns: React.FC<{ health: CohortHealthPayload; model: DashboardModel }> = ({ health, model }) => {
  const completed = model.mode === 'completed';
  const recordingSeries = model.judgedStats.map((s) => s.recordingRate);
  const meetingSeries = model.judgedStats.map((s) => s.meetingRate);
  const last = model.lastJudged;

  // Final summary pools every week; a running cohort shows the last finished week.
  const pooled = model.judgedStats.reduce(
    (acc, s) => ({
      marked: acc.marked + s.marked,
      attended: acc.attended + s.attended,
      recorded: acc.recorded + s.recordedGroups,
      reports: acc.reports + s.meetingsSubmitted,
      slots: acc.slots + s.groupsWithMembers,
    }),
    { marked: 0, attended: 0, recorded: 0, reports: 0, slots: 0 },
  );

  const sundayRate = completed ? (pooled.marked ? pooled.attended / pooled.marked : null) : last?.attendanceRate ?? null;
  const recordingRate = completed ? (pooled.slots ? pooled.recorded / pooled.slots : null) : last?.recordingRate ?? null;
  const meetingRate = completed ? (pooled.slots ? pooled.reports / pooled.slots : null) : last?.meetingRate ?? null;

  const faith = model.faith;
  const active = Number(health.participants.active);
  const faithRate = active ? faith.started / active : null;
  // Faith projects take time; don't flag them before the cohort's halfway point.
  const judgeFaith = completed || model.currentWeek > model.stats.length / 2;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ParticipantsTile health={health} model={model} />
      <VitalTile
        title="Sunday class"
        status={statusForRate(recordingRate)}
        statusLabel={recordingRate === null ? 'No weeks yet' : undefined}
        value={sundayRate === null ? '–' : `${pct(sundayRate)}%`}
        unit="present"
        detail={completed
          ? `Recorded in ${pct(recordingRate)}% of group-weeks`
          : last ? `Week ${last.weekNumber}: ${last.recordedGroups} of ${last.groupsWithMembers} groups recorded` : 'Starts after Week 1'}
        to="/attendance"
      >
        <Sparkline values={recordingSeries} color={SUNDAY_COLOR} label="Groups recording attendance, week by week" />
      </VitalTile>
      <VitalTile
        title="Group meetings"
        status={statusForRate(meetingRate)}
        statusLabel={meetingRate === null ? 'No weeks yet' : undefined}
        value={completed ? pooled.reports : last ? `${last.meetingsSubmitted}/${last.groupsWithMembers}` : '–'}
        unit="reports"
        detail={completed
          ? `${pct(meetingRate)}% of ${pooled.slots} expected`
          : last ? `Submitted for Week ${last.weekNumber}` : 'Starts after Week 1'}
        to="/group-prayers"
      >
        <Sparkline values={meetingSeries} color={MEETING_COLOR} label="Groups submitting meeting reports, week by week" />
      </VitalTile>
      <VitalTile
        title="Faith projects"
        status={judgeFaith ? statusForRate(faithRate) : 'neutral'}
        statusLabel={judgeFaith ? undefined : 'In progress'}
        value={faith.approved}
        unit="approved"
        detail={`${faith.started} of ${active} started`}
        to="/faith-projects"
      >
        <SegmentBar
          segments={[
            { label: 'Approved', value: faith.approved, color: '#1f5fa8' },
            { label: 'In progress', value: faith.started - faith.approved, color: '#8db8ec' },
            { label: 'Not started', value: faith.notStarted, color: '#dfe3e8' },
          ]}
        />
      </VitalTile>
    </div>
  );
};


const HEALTH_COLORS = { good: '#10b981', warning: '#f59e0b', critical: '#ef4444' };

/** Whether enough participants met the completion rule. */
const cohortSuccess = (model: DashboardModel): { status: HealthStatus; label: string; completed: number; total: number; pct: number | null } => {
  const people = model.people;
  const evaluated = people?.participants ?? [];
  const completed = evaluated.filter((p) => p.completion?.outcome === 'COMPLETED').length;
  const total = evaluated.length;
  const pct = total ? (completed / total) * 100 : null;
  if (!people || !people.judgeable || pct === null) return { status: 'neutral', label: 'Not enough records', completed, total, pct };
  return pct >= people.rules.cohortSuccessPct
    ? { status: 'good', label: 'Successful cohort', completed, total, pct }
    : { status: 'critical', label: 'Below success target', completed, total, pct };
};

const ParticipantsTile: React.FC<{ health: CohortHealthPayload; model: DashboardModel }> = ({ health, model }) => {
  const active = Number(health.participants.active);
  const unplaced = Math.max(0, active - Number(health.participants.inGroups));
  const people = model.people;
  const coverageNote = people?.coverage != null
    ? `Only ${Math.round(people.coverage * 100)}% of Sunday attendance was recorded, too little to judge anyone.`
    : 'Not judged yet.';

  if (model.mode === 'completed') {
    const success = cohortSuccess(model);
    const retake = people?.participants.filter((p) => p.completion?.outcome === 'RETAKE').length ?? 0;
    const missing = people?.participants.filter((p) => p.completion?.outcome === 'RECORDS_MISSING').length ?? 0;
    const judged = !!people?.judgeable;
    return (
      <VitalTile
        title="Completed"
        status={success.status}
        statusLabel={judged ? undefined : 'Not enough records'}
        value={judged ? success.completed : '–'}
        unit={judged ? `of ${success.total}` : undefined}
        detail={judged
          ? `Target ${people!.rules.cohortSuccessPct}% · ${retake} to retake FOF${missing ? ` · ${missing} missing records` : ''}`
          : coverageNote}
        to="/participants"
      >
        {judged && (
          <SegmentBar
            segments={[
              { label: 'Completed', value: success.completed, color: HEALTH_COLORS.good },
              { label: 'Retake', value: retake, color: HEALTH_COLORS.critical },
              { label: 'Missing records', value: missing, color: '#dfe3e8' },
            ]}
          />
        )}
      </VitalTile>
    );
  }

  const judged = !!people?.judgeable;
  const count = (h: 'good' | 'warning' | 'critical') => people?.participants.filter((p) => p.health === h).length ?? 0;
  const onTrack = count('good');
  return (
    <VitalTile
      title="Participants"
      status={judged ? statusForRate(active ? onTrack / active : null) : 'neutral'}
      statusLabel={judged ? undefined : model.judged.length ? 'Not enough records' : 'Not judged yet'}
      value={active}
      unit="active"
      detail={judged
        ? `${count('critical')} need attention · ${count('warning')} to keep an eye on${unplaced ? ` · ${unplaced} not in a group` : ''}`
        : model.judged.length ? coverageNote : (unplaced > 0 ? `${unplaced} not in a group` : 'Everyone is in a group')}
      to="/participants"
    >
      {judged && (
        <SegmentBar
          segments={[
            { label: 'On track', value: onTrack, color: HEALTH_COLORS.good },
            { label: 'Keep an eye on', value: count('warning'), color: HEALTH_COLORS.warning },
            { label: 'Needs attention', value: count('critical'), color: HEALTH_COLORS.critical },
          ]}
        />
      )}
    </VitalTile>
  );
};

const RegistrationFunnel: React.FC<{ health: CohortHealthPayload }> = ({ health }) => {
  const f = health.followUps;
  const steps = [
    { title: 'Contacts', value: f.total, detail: `${f.open} still open`, base: null as number | null },
    { title: 'Contacted', value: f.contacted, detail: 'Messaged or called', base: f.total },
    { title: 'Replied', value: f.replied, detail: 'Wrote back', base: f.contacted },
    { title: 'Registered', value: f.registered, detail: 'Signed up', base: f.total },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {steps.map((step) => (
        <NavLink key={step.title} to="/follow-ups" className="surface-card block p-5 transition hover:-translate-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{step.title}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{step.value}</p>
          <p className="mt-1 text-sm text-gray-600">
            {step.base !== null && step.base > 0 ? `${Math.round((step.value / step.base) * 100)}% · ` : ''}{step.detail}
          </p>
          {step.base !== null && step.base > 0 && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (step.value / step.base) * 100)}%`, backgroundColor: SUNDAY_COLOR }} />
            </div>
          )}
        </NavLink>
      ))}
    </div>
  );
};

const ReadinessChecklist: React.FC<{ health: CohortHealthPayload }> = ({ health }) => {
  const active = Number(health.participants.active);
  const unplaced = Math.max(0, active - Number(health.participants.inGroups));
  const noSupport = health.groups.filter((g) => !g.supportId).length;
  return (
    <section className="surface-card p-5 sm:p-6">
      <h3 className="text-base font-semibold text-gray-900">Ready to start?</h3>
      <ul className="mt-2 divide-y divide-gray-100">
        <ChecklistRow done={health.weeks.length > 0} label="Weeks set up" detail={health.weeks.length ? `${health.weeks.length} weeks` : undefined} to="/cohorts" />
        <ChecklistRow done={!!health.cohort?.schedulePublished} label="Schedule published to supports" to="/schedule" />
        <ChecklistRow done={active > 0} label="Participants added" detail={active ? `${active} participants` : undefined} to="/participants" />
        <ChecklistRow done={health.groups.length > 0} label="Groups created" detail={health.groups.length ? `${health.groups.length} groups` : undefined} to="/groups" />
        <ChecklistRow done={health.groups.length > 0 && noSupport === 0} label="Every group has a support" detail={noSupport ? `${noSupport} without one` : undefined} to="/groups" />
        <ChecklistRow done={active > 0 && unplaced === 0} label="Everyone placed in a group" detail={unplaced ? `${unplaced} not placed` : undefined} to="/allocation" />
      </ul>
    </section>
  );
};

const OperationsRow: React.FC<{
  todayLabel: string | null;
  activities: NonNullable<ReturnType<typeof useAppData>['selectedWeek']>['days'][number]['activities'];
  supports: User[];
  completions: SupportActivityCompletion[];
  pendingApprovals: number;
  pendingCover: number;
  announcement: Announcement | null;
  isAdmin: boolean;
}> = ({ todayLabel, activities, supports, completions, pendingApprovals, pendingCover, announcement, isAdmin }) => {
  const doneFor = (activityId: number, labelIds: Set<string>) => {
    const assigned = supports.filter((member) => member.labels?.some((label) => labelIds.has(label.id)));
    const doneIds = new Set(completions.filter((c) => c.activityId === activityId).map((c) => c.userId));
    return { assigned: assigned.length, done: assigned.filter((member) => doneIds.has(member.id)).length };
  };

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Operations</h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_1.2fr]">
        <div className="surface-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Today's schedule</p>
            <NavLink to="/schedule" className="text-xs font-semibold text-primary hover:text-primary-dark">Open</NavLink>
          </div>
          <p className="text-xs text-gray-500">{todayLabel ?? 'Nothing scheduled today'}</p>
          {activities.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {activities.slice(0, 3).map((activity) => {
                const labelIds = new Set((activity.labels || []).map((label) => label.id));
                const { assigned, done } = doneFor(activity.id, labelIds);
                return (
                  <li key={activity.id} className="flex items-center gap-2 text-xs">
                    <span className="w-14 flex-none text-gray-500 tabular-nums">{activity.time}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-800"><ActivityText text={activity.description} /></span>
                    {assigned > 0 && (
                      <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${done === assigned ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {done}/{assigned}
                      </span>
                    )}
                  </li>
                );
              })}
              {activities.length > 3 && <li className="text-[11px] text-gray-500">+{activities.length - 3} more</li>}
            </ul>
          )}
        </div>
        <OpsStat title="Schedule approvals" value={pendingApprovals} empty="Nothing to approve" to="/approvals" />
        <OpsStat title="Cover requests" value={pendingCover} empty="No one needs cover" to="/supports#cover" />
        <NavLink to={isAdmin ? '/announcements' : '/team-announcements'} className="surface-card block p-4 transition hover:-translate-y-0.5">
          <p className="text-sm font-semibold text-gray-900">Latest announcement</p>
          {announcement ? (
            <>
              <p className="mt-1 truncate text-sm text-gray-800">{announcement.subject}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{announcement.body}</p>
            </>
          ) : (
            <p className="mt-1 text-xs text-gray-500">None sent yet</p>
          )}
        </NavLink>
      </div>
    </section>
  );
};

const OpsStat: React.FC<{ title: string; value: number; empty: string; to: string }> = ({ title, value, empty, to }) => (
  <NavLink to={to} className="surface-card block p-4 transition hover:-translate-y-0.5">
    <p className="text-sm font-semibold text-gray-900">{title}</p>
    <p className={`mt-1 text-2xl font-bold tabular-nums ${value > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{value}</p>
    <p className="text-xs text-gray-500">{value > 0 ? 'Waiting for you' : empty}</p>
  </NavLink>
);

const DashboardSkeleton: React.FC = () => (
  <div className="space-y-5" aria-busy="true">
    <div className="surface-card h-28 animate-pulse" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => <div key={i} className="surface-card h-40 animate-pulse" />)}
    </div>
    <div className="surface-card h-48 animate-pulse" />
  </div>
);

export default AdminDashboardPage;
