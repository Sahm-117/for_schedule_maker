import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import ActivityText from '../components/ActivityText';
import LabelChip from '../components/LabelChip';
import { PeriodBadge } from '../components/PeriodIcon';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../context/AppDataContext';
import { announcementsApi } from '../services/api';
import type { Announcement } from '../types';
import { getCurrentProgramDayName } from '../utils/schedule';

const SupportHomePage: React.FC = () => {
  const { user, userLabelIds, userCohortIds } = useAuth();
  const { activeCohort, selectedWeek, weeks, newResourceCount } = useAppData();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) return;
    announcementsApi.getHistory({
      cohortId: activeCohort?.id || null,
      userId: user.id,
      isAdmin: false,
      accessibleCohortIds: userCohortIds,
    }).then((res) => setAnnouncements(res.announcements.slice(0, 3))).catch(() => {});
  }, [activeCohort?.id, user, userCohortIds]);

  if (user?.role !== 'SUPPORT') {
    return <Navigate to="/dashboard" replace />;
  }

  const activeWeek = selectedWeek || weeks[0] || null;
  const todayName = getCurrentProgramDayName();
  const myActivities = useMemo(() => {
    if (!activeWeek || userLabelIds.length === 0) return [];
    return activeWeek.days.flatMap((day) =>
      day.activities
        .filter((activity) => activity.labels?.some((label) => userLabelIds.includes(label.id)))
        .map((activity) => ({ ...activity, dayName: day.dayName })),
    );
  }, [activeWeek, userLabelIds]);
  const todayActivities = myActivities.filter((activity) => activity.dayName === todayName);

  return (
    <div>
      <PageHeader
        title="Support Home"
        subtitle={activeCohort ? activeCohort.name : undefined}
      />

      <section className="surface-card mb-6 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-700 text-white">
        <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <p className="text-sm text-white/75">Welcome back</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">{user.name}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric title="My Activities" value={myActivities.length} />
            <Metric title="My Support Groups" value={userLabelIds.length} />
            <Metric title="New Resources" value={newResourceCount} />
            <Metric title="Announcements" value={announcements.length} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="surface-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">My schedule highlights</h3>
              <p className="text-sm text-gray-500">{activeWeek ? `${todayName} in Week ${activeWeek.weekNumber}` : 'No week selected'}</p>
            </div>
            <NavLink to="/support/schedule" className="text-sm font-semibold text-primary hover:text-primary-dark">Open schedule</NavLink>
          </div>
          <div className="space-y-3">
            {todayActivities.length === 0 ? (
              <EmptyState text={userLabelIds.length === 0 ? 'You have not been assigned to any support group yet.' : 'No matching activities were found in the current week.'} />
            ) : todayActivities.slice(0, 6).map((activity) => (
              <div key={`${activity.id}-${activity.dayName}`} className="surface-muted rounded-2xl px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900"><ActivityText text={activity.description} /></p>
                    <p className="mt-1 text-xs text-gray-500">{activity.dayName} • {activity.time}</p>
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
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Recent announcements</h3>
                <p className="text-sm text-gray-500">Updates from the programme team.</p>
              </div>
            </div>
            <div className="space-y-3">
              {announcements.length === 0 ? (
                <EmptyState text="No announcements have been posted yet." />
              ) : announcements.map((item) => (
                <div key={item.id} className="surface-muted px-4 py-4">
                  <p className="text-sm font-semibold text-gray-900">{item.subject}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card p-6">
            <h3 className="text-lg font-semibold text-gray-900">Quick links</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <QuickLink to="/support/resources" label="Browse resources" />
              <QuickLink to="/support/profile" label="Profile & alerts" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Metric: React.FC<{ title: string; value: React.ReactNode }> = ({ title, value }) => (
  <div className="rounded-2xl bg-white/10 px-4 py-4 backdrop-blur-sm">
    <p className="text-xs uppercase tracking-wide text-white/70">{title}</p>
    <p className="mt-2 text-2xl font-bold text-white">{value}</p>
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-8 text-center text-sm text-gray-500">
    {text}
  </div>
);

const QuickLink: React.FC<{ to: string; label: string }> = ({ to, label }) => (
  <NavLink to={to} className="rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-4 text-sm font-semibold text-gray-700 hover:bg-orange-100/70">
    {label}
  </NavLink>
);

export default SupportHomePage;
