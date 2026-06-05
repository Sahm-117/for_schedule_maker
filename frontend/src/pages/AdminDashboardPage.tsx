import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import ActivityText from '../components/ActivityText';
import LabelChip from '../components/LabelChip';
import PageHeader from '../components/PageHeader';
import { PeriodBadge } from '../components/PeriodIcon';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { announcementsApi, resourcesApi, supportActivityCompletionsApi, usersApi } from '../services/api';
import type { Activity, Announcement, Resource, SupportActivityCompletion, User } from '../types';

const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

const AdminDashboardPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { weeks, selectedWeek, globalPendingChanges, realtimeHealthy, digestEnabled, newResourceCount } = useAppData();
  const [users, setUsers] = useState<User[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [completions, setCompletions] = useState<SupportActivityCompletion[]>([]);

  useEffect(() => {
    resourcesApi.getAll().then((res) => setResources(res.resources)).catch(() => {});
    announcementsApi.getHistory().then((res) => setAnnouncements(res.announcements.slice(0, 3))).catch(() => {});
    if (isAdmin) {
      usersApi.getAll()
        .then(async (res) => {
          const supportUsers = res.users.filter((member) => member.role === 'SUPPORT');
          const labelResponses = await Promise.all(
            supportUsers.map(async (member) => {
              try {
                const labelsResponse = await usersApi.getUserLabels(member.id);
                return {
                  ...member,
                  labels: labelsResponse.labels,
                };
              } catch {
                return {
                  ...member,
                  labels: [],
                };
              }
            })
          );
          setUsers(labelResponses);
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  const activeWeek = selectedWeek || weeks[0] || null;
  useEffect(() => {
    if (!activeWeek || !isAdmin) {
      setCompletions([]);
      return;
    }

    supportActivityCompletionsApi.getByWeek(activeWeek.id)
      .then((response) => setCompletions(response.completions))
      .catch(() => setCompletions([]));
  }, [activeWeek, isAdmin]);

  const todaysDay = useMemo(() => {
    if (!activeWeek) return null;
    return activeWeek.days.find((day) => day.dayName === todayName) || activeWeek.days.find((day) => day.activities.length > 0) || activeWeek.days[0] || null;
  }, [activeWeek]);

  const supportCount = users.filter((member) => member.role === 'SUPPORT').length;
  const todayActivities = todaysDay?.activities || [];
  const completionsByActivity = useMemo(() => {
    const map = new Map<number, SupportActivityCompletion[]>();
    completions.forEach((completion) => {
      const current = map.get(completion.activityId) || [];
      current.push(completion);
      map.set(completion.activityId, current);
    });
    return map;
  }, [completions]);

  if (user?.role === 'SUPPORT') {
    return <Navigate to="/support" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Operational overview for schedule updates, team readiness, and shared resources."
        action={activeWeek ? (
          <div className="surface-muted px-4 py-3 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">Active focus:</span> Week {activeWeek.weekNumber}
          </div>
        ) : null}
      />

      <section className="surface-card mb-6 overflow-hidden bg-gradient-to-br from-primary to-orange-600 text-white">
        <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-sm font-medium text-white/85">Operations snapshot</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">FOF IKD weekly programme control room</h2>
            <p className="mt-3 max-w-2xl text-sm text-white/85">
              Keep the real schedule workflow intact while giving admins and SOP preparers a much clearer view of approvals, resources, and live programme activity.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HeroMetric label="Pending approvals" value={globalPendingChanges.length} />
            <HeroMetric label="Resources" value={resources.length} />
            <HeroMetric label="Supports" value={supportCount} />
            <HeroMetric label="Announcements" value={announcements.length} />
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Weeks Loaded" value={weeks.length} detail="Programme structure currently available" />
        <SummaryCard title="Today’s Activities" value={todayActivities.length} detail={todaysDay ? `${todaysDay.dayName} in Week ${activeWeek?.weekNumber}` : 'No day selected'} />
        <SummaryCard title="New Resources" value={newResourceCount} detail="Unread additions waiting in the hub" />
        <SummaryCard title="System State" value={realtimeHealthy ? 'Live' : 'Polling'} detail={digestEnabled ? 'Digest enabled' : 'Digest paused'} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
        <div className="surface-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Today&apos;s activity snapshot</h3>
              <p className="text-sm text-gray-500">{todaysDay ? `${todaysDay.dayName} in Week ${activeWeek?.weekNumber}` : 'No active day selected'}</p>
            </div>
            <NavLink to="/schedule" className="text-sm font-semibold text-primary hover:text-primary-dark">Open schedule</NavLink>
          </div>
          <div className="space-y-3">
            {todayActivities.length === 0 ? (
              <EmptyState text="No activities are scheduled in the current focus day." />
            ) : todayActivities.slice(0, 5).map((activity) => (
              <div key={activity.id} className="surface-muted rounded-2xl px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900"><ActivityText text={activity.description} /></p>
                    <p className="mt-1 text-xs text-gray-500">{activity.time}</p>
                  </div>
                  <PeriodBadge period={activity.period} compact />
                </div>
                <AdminActivityCompletionStatus
                  activity={activity}
                  users={users}
                  completions={completionsByActivity.get(activity.id) || []}
                />
                {activity.labels && activity.labels.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {activity.labels.map((label) => (
                      <LabelChip key={label.id} name={label.name} color={label.color} size="sm" />
                    ))}
                  </div>
                )}
                {(!activity.labels || activity.labels.length === 0) && (
                  <div className="mt-3">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600">Open</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Approval queue</h3>
                <p className="text-sm text-gray-500">Live requests from SOP preparers.</p>
              </div>
              <NavLink to="/approvals" className="text-sm font-semibold text-primary hover:text-primary-dark">Review all</NavLink>
            </div>
            <div className="space-y-3">
              {globalPendingChanges.length === 0 ? (
                <EmptyState text="No pending changes right now." />
              ) : globalPendingChanges.slice(0, 4).map((change) => (
                <div key={change.id} className="rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-orange-700">{change.changeType}</span>
                    <span className="text-xs text-gray-500">{change.user.name}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-gray-900">Week {change.weekId}</p>
                  <p className="mt-1 text-xs text-gray-500">{new Date(change.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Recent announcements</h3>
                <p className="text-sm text-gray-500">Latest messages sent to support teams.</p>
              </div>
              {isAdmin && <NavLink to="/announcements" className="text-sm font-semibold text-primary hover:text-primary-dark">Manage</NavLink>}
            </div>
            <div className="space-y-3">
              {announcements.length === 0 ? (
                <EmptyState text="No announcements have been sent yet." />
              ) : announcements.map((item) => (
                <div key={item.id} className="surface-muted px-4 py-4">
                  <p className="text-sm font-semibold text-gray-900">{item.subject}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const HeroMetric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-2xl bg-white/15 px-4 py-4 backdrop-blur-sm">
    <p className="text-xs font-medium uppercase tracking-wide text-white/80">{label}</p>
    <p className="mt-2 text-2xl font-bold text-white">{value}</p>
  </div>
);

const SummaryCard: React.FC<{ title: string; value: React.ReactNode; detail: string }> = ({ title, value, detail }) => (
  <div className="surface-card p-5">
    <p className="text-sm font-medium text-gray-500">{title}</p>
    <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">{value}</p>
    <p className="mt-2 text-sm text-gray-500">{detail}</p>
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-8 text-center text-sm text-gray-500">
    {text}
  </div>
);

const AdminActivityCompletionStatus: React.FC<{
  activity: Activity;
  users: User[];
  completions: SupportActivityCompletion[];
}> = ({ activity, users, completions }) => {
  const activityLabelIds = new Set((activity.labels || []).map((label) => label.id));
  const assignedSupports = users.filter((member) =>
    member.role === 'SUPPORT'
    && member.labels?.some((label) => activityLabelIds.has(label.id))
  );
  const completedUserIds = new Set(completions.map((completion) => completion.userId));
  const completedCount = assignedSupports.filter((member) => completedUserIds.has(member.id)).length;

  if ((activity.labels || []).length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-white/70 px-3 py-3 text-xs text-gray-500">
        No support group is assigned to this activity yet.
      </div>
    );
  }

  if (assignedSupports.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-white/70 px-3 py-3 text-xs text-gray-500">
        No support users are assigned to the selected support groups for this activity.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-emerald-100 bg-white/80 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Support completion</p>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${completedCount === assignedSupports.length ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
          {completedCount}/{assignedSupports.length} completed
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {assignedSupports.map((member) => {
          const completed = completedUserIds.has(member.id);
          return (
            <span
              key={member.id}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${completed ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${completed ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              {member.name}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default AdminDashboardPage;
