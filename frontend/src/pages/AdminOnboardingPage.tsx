import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import AppSelect from '../components/AppSelect';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import OnboardingStepPills from '../components/OnboardingStepPills';
import {
  groupDiscussionApi,
  onboardingEventsApi,
} from '../services/api';
import { formatDateTime } from '../utils/time';
import type { OnboardingEvent, OnboardingProgress } from '../types';

const describeEvent = (event: OnboardingEvent) => {
  switch (event.type) {
    case 'GROUP_ASSIGNED':
      return `${event.groupName || 'A group'} was assigned to ${event.supportName || 'a support'}.`;
    case 'PARTICIPANTS_ASSIGNED': {
      const count = Number(event.payload?.participantCount || 0);
      return count > 0
        ? `${count} participant${count === 1 ? '' : 's'} were added to ${event.groupName || 'a group'}.`
        : `Participants were added to ${event.groupName || 'a group'}.`;
    }
    case 'GROUP_COMPLETED':
      return `${event.actorName || 'A support'} fully onboarded ${event.groupName || 'a group'}.`;
    case 'GROUP_CREATED_UPDATED':
      return `${event.actorName || 'A support'} updated group setup for ${event.groupName || 'a group'}.`;
    case 'PARTICIPANT_STATUS_UPDATED':
      return `${event.actorName || 'A support'} updated participant onboarding in ${event.groupName || 'a group'}.`;
    default:
      return `${event.actorName || 'A support'} updated onboarding progress for ${event.groupName || 'a group'}.`;
  }
};

const AdminOnboardingPage: React.FC = () => {
  const { user } = useAuth();
  if (!user || user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return <AdminOnboardingContent />;
};

const AdminOnboardingContent: React.FC = () => {
  const { activeCohort } = useAppData();
  const [cohortProgress, setCohortProgress] = useState<OnboardingProgress>({ groups: [], participants: [] });
  const [events, setEvents] = useState<OnboardingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState(''); // '' = all groups
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress'>('all');
  const [eventLimit, setEventLimit] = useState(5); // "Show more" page size
  const activeCohortId = activeCohort?.id;

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        if (activeCohortId) {
          const [progressRes, eventRes] = await Promise.all([
            groupDiscussionApi.cohortOnboardingProgress(activeCohortId).catch(() => ({ groups: [], participants: [] } as OnboardingProgress)),
            onboardingEventsApi.getForCohort(activeCohortId),
          ]);
          setCohortProgress(progressRes);
          setEvents(eventRes.events);
        } else {
          setCohortProgress({ groups: [], participants: [] });
          setEvents([]);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [activeCohortId]);

  const groupCollator = useMemo(() => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }), []);

  const groupSummaries = useMemo(() => [...cohortProgress.groups]
    .sort((a, b) => groupCollator.compare(a.groupName || '', b.groupName || ''))
    .map((group) => {
      const members = cohortProgress.participants
        .filter((entry) => entry.groupId === group.groupId)
        .sort((a, b) => groupCollator.compare(a.name, b.name));
      const readyCount = members.filter((entry) => entry.completed).length;
      return {
        group,
        members,
        participantCount: members.length,
        readyCount,
        completed: members.length > 0 && readyCount === members.length,
      };
    }), [groupCollator, cohortProgress]);

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'All groups' },
      ...groupSummaries.map((s) => ({ value: s.group.groupId, label: s.group.groupName || 'Group' })),
    ],
    [groupSummaries]
  );

  const visibleGroupSummaries = useMemo(
    () => groupSummaries.filter((s) => {
      if (groupFilter && s.group.groupId !== groupFilter) return false;
      if (statusFilter === 'completed') return s.completed;
      if (statusFilter === 'in_progress') return !s.completed;
      return true;
    }),
    [groupSummaries, groupFilter, statusFilter]
  );


  const progress = useMemo(() => {
    const totalParticipants = groupSummaries.reduce((sum, summary) => sum + summary.participantCount, 0);
    const onboardedParticipants = groupSummaries.reduce((sum, summary) => sum + summary.readyCount, 0);
    const completedGroups = groupSummaries.filter((summary) => summary.completed).length;
    return {
      totalParticipants,
      onboardedParticipants,
      completedGroups,
      totalGroups: groupSummaries.length,
      pct: totalParticipants > 0 ? Math.round((onboardedParticipants / totalParticipants) * 100) : 0,
    };
  }, [groupSummaries]);

  useEffect(() => { setEventLimit(5); }, [groupFilter]);

  return (
    <div className="page-content">
      <PageHeader
        title="Onboarding"
        subtitle="Track how far each group is in onboarding its participants."
      />

      <div className="space-y-6">
        <section className="surface-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Cohort progress</p>
              <h2 className="mt-1 text-xl font-bold text-gray-900">
                {activeCohort ? `${progress.pct}% of participants onboarded` : 'Select an active cohort'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {activeCohort
                  ? `${progress.onboardedParticipants} of ${progress.totalParticipants} participants are onboarded.`
                  : 'Progress cards fill in when an active cohort is selected.'}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Groups completed" value={`${progress.completedGroups}/${progress.totalGroups}`} tone="bg-emerald-50 text-emerald-700" />
            <MetricCard label="Participants onboarded" value={progress.onboardedParticipants} tone="bg-sky-50 text-sky-700" />
            <MetricCard label="Groups in progress" value={Math.max(progress.totalGroups - progress.completedGroups, 0)} tone="bg-amber-50 text-amber-700" />
            <MetricCard label="Completion rate" value={`${progress.pct}%`} tone="bg-violet-50 text-violet-700" />
          </div>
        </section>

        {/* Recent activity — full width above so group status can use more columns. */}
        <section className="surface-card flex max-h-[22rem] flex-col p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Recent activity</p>
          <h3 className="mt-1 text-lg font-bold text-gray-900">Onboarding event feed</h3>
          {events.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-gray-50/80 py-12 text-center text-sm text-gray-500">
              No onboarding updates yet.
            </div>
          ) : (
            <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {events.slice(0, eventLimit).map((event) => (
                <div key={event.id} className="rounded-2xl bg-gray-50 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">{describeEvent(event)}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDateTime(event.createdAt)}</p>
                </div>
              ))}
              {eventLimit < events.length && (
                <button
                  type="button"
                  onClick={() => setEventLimit(events.length)}
                  className="col-span-full py-2 text-center text-xs font-semibold text-primary hover:text-primary-dark"
                >
                  Show more ({events.length - eventLimit})
                </button>
              )}
            </div>
          )}
        </section>

        <section className="surface-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Group status</p>
              <h3 className="mt-1 text-lg font-bold text-gray-900">Progress by group</h3>
            </div>
            {groupSummaries.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
                <div className="min-w-0">
                  <AppSelect
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as 'all' | 'completed' | 'in_progress')}
                    options={[
                      { value: 'all', label: 'All statuses' },
                      { value: 'completed', label: 'Completed' },
                      { value: 'in_progress', label: 'In progress' },
                    ]}
                    placeholder="All statuses"
                    compact
                  />
                </div>
                <div className="min-w-0">
                  <AppSelect value={groupFilter} onChange={setGroupFilter} options={groupOptions} placeholder="All groups" compact />
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <PageLoader />
          ) : visibleGroupSummaries.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-gray-50/80 py-12 text-center">
              <p className="text-sm text-gray-500">No group progress yet.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {visibleGroupSummaries.map(({ group, members, participantCount, readyCount, completed }) => (
                  <div key={group.groupId} className="surface-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-gray-900">{group.groupName}</p>
                        <p className="mt-1 text-sm text-gray-500">{group.supportName || 'No support assigned'} • {participantCount} participant{participantCount === 1 ? '' : 's'}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${completed ? 'bg-emerald-100/80 text-emerald-700' : 'bg-amber-100/80 text-amber-700'}`}>
                        {readyCount} of {participantCount} ready
                      </span>
                    </div>
                    <div className="mt-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${group.supportIntroPosted ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {group.supportIntroPosted ? 'Support intro posted' : 'Support intro not posted'}
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {members.map((member) => (
                        <div key={member.participantId}>
                          <p className="mb-1 text-sm font-semibold text-gray-800">{member.name}</p>
                          <OnboardingStepPills state={member} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>
      </div>

    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: React.ReactNode; tone: string }> = ({ label, value, tone }) => (
  <div className={`rounded-2xl px-4 py-3 ${tone}`}>
    <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
    <p className="mt-1 text-2xl font-bold">{value}</p>
  </div>
);

export default AdminOnboardingPage;
