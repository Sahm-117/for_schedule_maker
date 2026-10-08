import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import FilterBar, { type FilterGroup, type FilterValues } from '../components/filters/FilterBar';
import ActivityText from '../components/ActivityText';
import LabelChip from '../components/LabelChip';
import PageHeader from '../components/PageHeader';
import { PeriodBadge } from '../components/PeriodIcon';
import WeekSelector from '../components/WeekSelector';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { labelsApi, supportActivityCompletionsApi, usersApi } from '../services/api';
import type { Activity, Label, SupportActivityCompletion, User } from '../types';
import { sortByText } from '../utils/sort';
import { pickableUsers } from '../utils/testUsers';
import { hasSupportRole } from '../utils/people';

type EnrichedActivity = Activity & { dayName: string };

const ActivityOverviewPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { weeks, selectedWeek, handleWeekSelect, loading } = useAppData();
  const [supportGroups, setSupportGroups] = useState<Label[]>([]);
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  const [completions, setCompletions] = useState<SupportActivityCompletion[]>([]);
  // Filter choices (see FilterBar): day, activity tag (support group) and support person; several of each at once.
  const [filters, setFilters] = useState<FilterValues>({});
  const selectedDayNames = filters.day ?? [];
  const selectedGroupIds = filters.tag ?? [];
  const selectedUserIds = filters.person ?? [];

  useEffect(() => {
    if (!isAdmin) return;

    labelsApi.getAll()
      .then((response) => setSupportGroups(sortByText(response.labels, (label) => label.name)))
      .catch((error) => console.warn('Failed to load activity tags:', error));

    usersApi.getAll()
      .then(async (response) => {
        const onlySupportUsers = pickableUsers(response.users.filter((member) => hasSupportRole(member)));
        const usersWithLabels = await Promise.all(
          onlySupportUsers.map(async (member) => {
            try {
              const labelsResponse = await usersApi.getUserLabels(member.id);
              return { ...member, labels: labelsResponse.labels };
            } catch {
              return { ...member, labels: [] };
            }
          })
        );
        setSupportUsers(sortByText(usersWithLabels, (member) => member.name));
      })
      .catch((error) => console.warn('Failed to load support users:', error));
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedWeek || !isAdmin) {
      setCompletions([]);
      return;
    }

    supportActivityCompletionsApi.getByWeek(selectedWeek.id)
      .then((response) => setCompletions(response.completions))
      .catch((error) => {
        console.warn('Failed to load completion overview data:', error);
        setCompletions([]);
      });
  }, [isAdmin, selectedWeek]);

  // Support people who carry any of the chosen tags (all of them when no tag is chosen).
  const filteredSupportUsers = useMemo(() => {
    if (selectedGroupIds.length === 0) return supportUsers;
    return supportUsers.filter((member) => member.labels?.some((label) => selectedGroupIds.includes(label.id)));
  }, [selectedGroupIds, supportUsers]);

  // A chosen person who no longer carries a chosen tag is dropped, so no hidden filter stays on.
  useEffect(() => {
    const kept = selectedUserIds.filter((id) => filteredSupportUsers.some((member) => member.id === id));
    if (kept.length !== selectedUserIds.length) setFilters((prev) => ({ ...prev, person: kept }));
  }, [filteredSupportUsers, selectedUserIds]);

  // Tags an activity must carry (any of): the chosen tags, narrowed to the chosen people's tags when both are chosen.
  const effectiveFilterLabelIds = useMemo(() => {
    const userLabelIds = new Set(supportUsers.filter((member) => selectedUserIds.includes(member.id)).flatMap((member) => member.labels?.map((label) => label.id) ?? []));
    if (selectedUserIds.length > 0 && selectedGroupIds.length > 0) return selectedGroupIds.filter((id) => userLabelIds.has(id));
    if (selectedUserIds.length > 0) return [...userLabelIds];
    if (selectedGroupIds.length > 0) return selectedGroupIds;
    return undefined;
  }, [selectedGroupIds, selectedUserIds, supportUsers]);

  const allActivities = useMemo(
    () => (selectedWeek?.days ?? []).flatMap((day) => day.activities.map((activity) => ({ ...activity, dayName: day.dayName }))),
    [selectedWeek]
  );

  const activities = useMemo(() => {
    if (!selectedWeek) return [] as EnrichedActivity[];
    const raw = selectedWeek.days.flatMap((day) =>
      day.activities.map((activity) => ({
        ...activity,
        dayName: day.dayName,
      }))
    );

    return raw.filter((activity) => {
      if (selectedDayNames.length > 0 && !selectedDayNames.includes(activity.dayName)) return false;
      if (!effectiveFilterLabelIds) return true;
      return activity.labels?.some((label) => effectiveFilterLabelIds.includes(label.id)) ?? false;
    });
  }, [effectiveFilterLabelIds, selectedDayNames, selectedWeek]);

  const completionsByActivity = useMemo(() => {
    const map = new Map<number, SupportActivityCompletion[]>();
    completions.forEach((completion) => {
      const current = map.get(completion.activityId) || [];
      current.push(completion);
      map.set(completion.activityId, current);
    });
    return map;
  }, [completions]);

  const activitySummaries = useMemo(() => {
    return activities.map((activity) => {
      const activityLabelIds = new Set((activity.labels || []).map((label) => label.id));
      const assignedSupports = supportUsers
        .filter((member) =>
          hasSupportRole(member) && member.labels?.some((label) => activityLabelIds.has(label.id))
        )
        .filter((member) => selectedUserIds.length === 0 || selectedUserIds.includes(member.id));
      const completedUserIds = new Set((completionsByActivity.get(activity.id) || []).map((completion) => completion.userId));

      return {
        activity,
        assignedSupports,
        doneSupports: assignedSupports.filter((member) => completedUserIds.has(member.id)),
        pendingSupports: assignedSupports.filter((member) => !completedUserIds.has(member.id)),
      };
    });
  }, [activities, completionsByActivity, selectedUserIds, supportUsers]);

  const groupedByDay = useMemo(() => {
    return activitySummaries.reduce<Record<string, typeof activitySummaries>>((acc, item) => {
      const key = item.activity.dayName;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [activitySummaries]);

  const totalAssigned = activitySummaries.reduce((sum, item) => sum + item.assignedSupports.length, 0);
  const totalCompleted = activitySummaries.reduce((sum, item) => sum + item.doneSupports.length, 0);
  // The chip groups, each choice with how many of the week's activities it matches.
  const filterGroups: FilterGroup[] = [
    { key: 'day', label: 'Day', options: (selectedWeek?.days ?? []).map((day) => ({ value: day.dayName, label: day.dayName, count: day.activities.length })) },
    {
      key: 'tag',
      label: 'Activity tag (support group)',
      options: sortByText(supportGroups, (group) => group.name).map((group) => ({ value: group.id, label: group.name, count: allActivities.filter((a) => a.labels?.some((l) => l.id === group.id)).length })),
    },
    {
      key: 'person',
      label: 'Support person',
      options: sortByText(filteredSupportUsers, (member) => member.name).map((member) => ({ value: member.id, label: member.name })),
    },
  ].filter((g) => g.options.length > 0);

  if (user?.role === 'SUPPORT') {
    return <Navigate to="/support" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) return null;

  return (
    <div>
      <PageHeader
        title="Activity overview"
        subtitle="See who has and hasn't done their activities this week."
      />

      <div className="mb-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr_0.85fr]">
        <WeekSelector
          weeks={weeks}
          selectedWeek={selectedWeek}
          compact
          className="relative z-30"
          onWeekSelect={(weekId) => {
            void handleWeekSelect(weekId);
          }}
        />

        <div className="surface-card relative z-20 rounded-3xl border border-orange-100 p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Filters</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">Shape the overview</p>
          <div className="mt-4">
            <FilterBar groups={filterGroups} value={filters} onChange={setFilters} shown={activities.length} total={allActivities.length} noun="activities" />
          </div>
        </div>

        <div className="surface-card rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50/60 to-white p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Week Snapshot</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {selectedWeek ? `Week ${selectedWeek.weekNumber} completion health` : 'Select a week'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard label="Activities" value={activities.length} />
            <MetricCard label="Completed" value={totalCompleted} />
            <MetricCard label="Pending" value={Math.max(totalAssigned - totalCompleted, 0)} />
            <MetricCard label="Scope" value={selectedDayNames.length === 1 ? selectedDayNames[0] : selectedDayNames.length > 1 ? `${selectedDayNames.length} days` : 'Week'} />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {selectedWeek && activitySummaries.length === 0 && (
          <div className="surface-card p-12 text-center text-sm text-gray-500">
            No activities matched the current week overview filters.
          </div>
        )}

        {selectedWeek && Object.entries(groupedByDay).map(([dayName, items]) => (
          <section key={dayName} className="surface-card overflow-hidden">
            <div className="border-b border-orange-100 bg-orange-50/35 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{dayName}</h2>
                  <p className="text-sm text-gray-500">{items.length} activit{items.length === 1 ? 'y' : 'ies'} in this view</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm">
                  {items.reduce((sum, item) => sum + item.doneSupports.length, 0)}/{items.reduce((sum, item) => sum + item.assignedSupports.length, 0)} completed
                </span>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              {items.map(({ activity, assignedSupports, doneSupports, pendingSupports }) => (
                <article key={`${activity.id}-${dayName}`} className="rounded-3xl border border-orange-100 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-gray-900"><ActivityText text={activity.description} /></p>
                      <p className="mt-1 text-sm text-gray-500">{activity.time}</p>
                    </div>
                    <PeriodBadge period={activity.period} compact />
                  </div>

                  {activity.labels && activity.labels.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {activity.labels.map((label) => (
                        <LabelChip key={label.id} name={label.name} color={label.color} size="sm" />
                      ))}
                    </div>
                  )}

                  {assignedSupports.length > 0 && (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <SupportBucket title="Done" tone="done" users={doneSupports} />
                      <SupportBucket title="Pending" tone="pending" users={pendingSupports} />
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-2xl border border-white bg-white/85 px-3 py-3 shadow-sm">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</p>
    <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
  </div>
);

const SupportBucket: React.FC<{ title: string; tone: 'done' | 'pending'; users: User[] }> = ({ title, tone, users }) => (
  <div className={`rounded-2xl border px-4 py-4 ${
    tone === 'done' ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'
  }`}>
    <div className="flex items-center justify-between gap-3">
      <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${tone === 'done' ? 'text-emerald-700' : 'text-slate-500'}`}>{title}</p>
      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${tone === 'done' ? 'bg-white text-emerald-700' : 'bg-white text-slate-600'}`}>
        {users.length}
      </span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {users.length === 0 ? (
        <span className="text-xs text-gray-500">None</span>
      ) : users.map((member) => (
        <span
          key={member.id}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            tone === 'done' ? 'bg-white text-emerald-700 ring-1 ring-emerald-200' : 'bg-white text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tone === 'done' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {member.name}
        </span>
      ))}
    </div>
  </div>
);

export default ActivityOverviewPage;
